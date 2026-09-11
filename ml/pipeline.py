"""
MachPulse End-to-End ML Pipeline & Evaluation Engine.

Executes the verified predictive maintenance workflow:
  1. Load raw 10s MetroPT-3 CSV
  2. Data quality checks & resample to 1-minute grid
  3. Trailing-window feature engineering (strictly trailing, no future leakage)
  4. Chronological train/calibration/test split (Feb = train, Mar-Apr10 = calib, Apr11+ = test)
  5. Fit Mahalanobis detector on February healthy baseline (per operating state)
  6. Calibrate decision thresholds against false-alarm budget (2.0/month)
  7. Apply persistence & multi-sensor agreement decision logic
  8. Evaluate against documented ground-truth failure events (F1-F4)
  9. Compare against baselines (Fixed threshold Motor_current > 4A, LPS alarm, Isolation Forest)
"""
from __future__ import annotations

import datetime as dt
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from . import config, data_loader, decision, features, model, preprocessing, quality

logger = logging.getLogger("machpulse.pipeline")


def run_pipeline(
    csv_path: str | Path = "data/MetroPT3(AirCompressor).csv",
    lead_credit_window_hours: float = config.LEAD_CREDIT_WINDOW_HOURS,
    verbose: bool = True,
) -> Dict[str, Any]:
    """
    Run the complete MachPulse ML pipeline against the MetroPT-3 dataset.
    Returns comprehensive execution metrics and evaluation results.
    """
    t_start = time.time()
    timings: Dict[str, float] = {}

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    # ----------------------------------------------------------------------
    # 1. Load Raw CSV
    # ----------------------------------------------------------------------
    logger.info("Step 1: Loading raw CSV from %s", csv_path)
    t0 = time.time()
    raw_df = data_loader.load_raw(csv_path)
    timings["load_raw_sec"] = time.time() - t0
    raw_rows = len(raw_df)
    raw_span = (raw_df.index.min(), raw_df.index.max())

    # ----------------------------------------------------------------------
    # 2. Preprocess to 1-Minute Grid with Quality Gating
    # ----------------------------------------------------------------------
    logger.info("Step 2: Preprocessing and building 1-minute grid...")
    t0 = time.time()
    grid = preprocessing.prepare(raw_df)
    timings["prepare_grid_sec"] = time.time() - t0
    total_minutes = len(grid)
    missing_minutes = int(grid["missing"].sum())
    missing_pct = 100.0 * missing_minutes / max(total_minutes, 1)

    # ----------------------------------------------------------------------
    # 3. Trailing-Window Feature Engineering
    # ----------------------------------------------------------------------
    logger.info("Step 3: Engineering trailing-window features...")
    t0 = time.time()
    features_df = features.build_features(grid)
    timings["build_features_sec"] = time.time() - t0
    total_features = features_df.shape[1]

    # Model features (24h window + slopes + cross-sensor diff)
    candidate_cols = features.model_feature_columns(features_df, window_label="24h")
    logger.info("Selected %d candidate model feature columns.", len(candidate_cols))

    # Quality gating signals
    coverage_series = grid["coverage"]
    frozen_series = features_df["quality_frozen_fraction_24h"]

    # ----------------------------------------------------------------------
    # 4. Strictly Chronological Split
    # ----------------------------------------------------------------------
    logger.info("Step 4: Chronological data splitting...")
    train_mask = (features_df.index >= config.SPLIT.train_start) & (features_df.index <= config.SPLIT.train_end)
    calib_mask = (features_df.index >= config.SPLIT.calibrate_start) & (features_df.index <= config.SPLIT.calibrate_end)
    test_mask = (features_df.index >= config.SPLIT.test_start) & (features_df.index <= config.SPLIT.test_end)

    train_feats = features_df.loc[train_mask]
    calib_feats = features_df.loc[calib_mask]
    test_feats = features_df.loc[test_mask]

    logger.info("Split sizes: Train (Feb)=%d mins, Calib (Mar-Apr10)=%d mins, Test (Apr11-Sep)=%d mins",
                len(train_feats), len(calib_feats), len(test_feats))

    # ----------------------------------------------------------------------
    # 5. Fit Mahalanobis Detector on February Healthy Period
    # ----------------------------------------------------------------------
    logger.info("Step 5: Fitting MahalanobisDetector on healthy February data...")
    t0 = time.time()
    detector = model.MahalanobisDetector(candidate_cols)
    detector.fit(train_feats)
    timings["fit_mahalanobis_sec"] = time.time() - t0

    # Fit secondary baseline (Isolation Forest)
    logger.info("Fitting secondary comparison baseline (IsolationForest)...")
    t0 = time.time()
    iso_detector = model.IsolationForestDetector(candidate_cols, random_state=42)
    iso_detector.fit(train_feats)
    timings["fit_isolation_forest_sec"] = time.time() - t0

    # ----------------------------------------------------------------------
    # 6. Calibrate Thresholds on March 1–April 10
    # ----------------------------------------------------------------------
    logger.info("Step 6: Calibrating thresholds on calibration period (Mar 1–Apr 10)...")
    t0 = time.time()
    calib_scored = detector.score(calib_feats)
    calib_distances = calib_scored["distance"]
    calib_contrib_counts = detector.contributing_sensor_counts(calib_scored)

    calib_days = (config.SPLIT.calibrate_end - config.SPLIT.calibrate_start).total_seconds() / 86400.0
    calib_months = calib_days / 30.4375
    monthly_budget = config.CALIBRATION_FALSE_ALARM_BUDGET_PER_MONTH
    target_max_episodes = int(np.ceil(calib_months * monthly_budget))  # ~3 episodes

    # Search for threshold that satisfies calibration budget:
    # scan quantiles from 95% to 99.9%
    valid_calib_dist = calib_distances.dropna()
    quantiles = np.linspace(0.95, 0.999, 50)
    best_threshold = float(valid_calib_dist.quantile(0.985))  # fallback
    best_severe = float(valid_calib_dist.quantile(0.998))

    for q in quantiles:
        cand_th = float(valid_calib_dist.quantile(q))
        cand_sev = float(cand_th * 1.5)
        cal_dec = decision.apply_decisions(
            distances=calib_distances,
            threshold=cand_th,
            severe_threshold=cand_sev,
            coverage=coverage_series,
            frozen_fraction=frozen_series,
            contributing_sensor_counts=calib_contrib_counts,
        )
        episodes = decision.alert_episodes_from_decisions(cal_dec["decision"])
        if len(episodes) <= target_max_episodes:
            best_threshold = cand_th
            best_severe = max(cand_sev, float(valid_calib_dist.quantile(0.995)))
            break

    timings["calibration_sec"] = time.time() - t0
    logger.info("Calibrated thresholds: elevated=%.2f, severe=%.2f (budget=%.1f episodes, actual=%d)",
                best_threshold, best_severe, target_max_episodes, len(episodes))

    # ----------------------------------------------------------------------
    # 7. Score Test Split (April 11 Onward)
    # ----------------------------------------------------------------------
    logger.info("Step 7: Scoring test period (Apr 11–Sep 1)...")
    t0 = time.time()
    test_scored = detector.score(test_feats)
    test_distances = test_scored["distance"]
    test_contrib_counts = detector.contributing_sensor_counts(test_scored)

    test_decisions = decision.apply_decisions(
        distances=test_distances,
        threshold=best_threshold,
        severe_threshold=best_severe,
        coverage=coverage_series,
        frozen_fraction=frozen_series,
        contributing_sensor_counts=test_contrib_counts,
    )
    timings["score_test_sec"] = time.time() - t0

    # Decision distribution
    decision_counts = test_decisions["decision"].value_counts().to_dict()
    logger.info("Test decision breakdown: %s", decision_counts)

    # ----------------------------------------------------------------------
    # 8. Alert Episodes & Failure Event Evaluation
    # ----------------------------------------------------------------------
    logger.info("Step 8: Evaluating alert episodes against documented failure events...")
    alert_episodes = decision.alert_episodes_from_decisions(test_decisions["decision"])
    n_total_episodes = len(alert_episodes)

    test_days = (config.SPLIT.test_end - config.SPLIT.test_start).total_seconds() / 86400.0
    test_months = test_days / 30.4375

    # Match alert episodes to ground-truth failure events F1-F4
    event_eval: List[Dict[str, Any]] = []
    matched_episode_ids = set()

    credit_td = pd.Timedelta(hours=lead_credit_window_hours)

    for event in config.FAILURE_EVENTS:
        window_start = event.start - credit_td
        window_end = event.end

        # Alert episodes overlapping or starting in window
        matched_alerts = alert_episodes[
            (alert_episodes["start"] <= window_end) & (alert_episodes["end"] >= window_start)
        ]

        if not matched_alerts.empty:
            first_alert = matched_alerts.iloc[0]
            lead_time_hours = (event.start - first_alert["start"]).total_seconds() / 3600.0
            detected = True
            first_alert_ts = str(first_alert["start"])
            first_alert_severity = "MAINTAIN" if first_alert.get("max_severity", 0) == 2 else "INSPECT"
            for ep_id in matched_alerts["episode_id"]:
                matched_episode_ids.add(ep_id)
        else:
            detected = False
            lead_time_hours = None
            first_alert_ts = None
            first_alert_severity = None

        event_eval.append({
            "event_id": event.event_id,
            "failure_type": event.failure_type,
            "documented_start": str(event.start),
            "documented_end": str(event.end),
            "detected": detected,
            "lead_time_hours": round(lead_time_hours, 2) if lead_time_hours is not None else None,
            "first_alert_timestamp": first_alert_ts,
            "first_alert_severity": first_alert_severity,
            "report_note": event.report_note,
        })

    detected_count = sum(1 for e in event_eval if e["detected"])
    recall = detected_count / len(config.FAILURE_EVENTS)

    false_alarm_episodes = n_total_episodes - len(matched_episode_ids)
    false_alarm_rate_per_month = false_alarm_episodes / test_months
    precision = (len(matched_episode_ids) / n_total_episodes) if n_total_episodes > 0 else 0.0

    # Top feature contributors during failure episodes
    top_contributors_summary: Dict[str, int] = {}
    if not alert_episodes.empty:
        # Sample alert rows during episodes to aggregate top contributors
        alert_mask = test_decisions["decision"].isin([decision.Decision.INSPECT.value, decision.Decision.MAINTAIN.value])
        alert_scored = test_scored.loc[alert_mask]
        contrib_cols = [c for c in alert_scored.columns if c.startswith("contrib__")]
        if contrib_cols:
            mean_contribs = alert_scored[contrib_cols].mean().sort_values(ascending=False)
            for col, val in mean_contribs.head(5).items():
                top_contributors_summary[col.replace("contrib__", "")] = round(float(val), 3)

    # ----------------------------------------------------------------------
    # 9. Baseline Comparisons
    # ----------------------------------------------------------------------
    logger.info("Step 9: Evaluating baseline models...")
    # Baseline 1: Naive Fixed Threshold (Motor_current > 4.0A sustained >= 10 mins)
    test_grid = grid.loc[test_mask]
    motor_over = (test_grid["Motor_current"] > config.FIXED_THRESHOLD_AMPS).astype(int)
    motor_sustain = motor_over.groupby((motor_over == 0).cumsum()).cumsum()
    fixed_thresh_alert = motor_sustain >= config.FIXED_THRESHOLD_SUSTAIN_MINUTES
    fixed_episodes = decision._group_into_episodes(fixed_thresh_alert, test_grid.index)

    fixed_detected = 0
    for event in config.FAILURE_EVENTS:
        w_start, w_end = event.start - credit_td, event.end
        if not fixed_episodes.empty and ((fixed_episodes["start"] <= w_end) & (fixed_episodes["end"] >= w_start)).any():
            fixed_detected += 1
    fixed_recall = fixed_detected / len(config.FAILURE_EVENTS)
    fixed_far = max(len(fixed_episodes) - fixed_detected, 0) / test_months

    # Baseline 2: On-board LPS Alarm (LPS == 1 in grid)
    lps_alert = (test_grid["LPS"] > 0) if "LPS" in test_grid.columns else pd.Series(False, index=test_grid.index)
    lps_episodes = decision._group_into_episodes(lps_alert, test_grid.index)
    lps_detected = 0
    for event in config.FAILURE_EVENTS:
        w_start, w_end = event.start - credit_td, event.end
        if not lps_episodes.empty and ((lps_episodes["start"] <= w_end) & (lps_episodes["end"] >= w_start)).any():
            lps_detected += 1
    lps_recall = lps_detected / len(config.FAILURE_EVENTS)
    lps_far = max(len(lps_episodes) - lps_detected, 0) / test_months

    # Baseline 3: Isolation Forest
    iso_test_scores = iso_detector.score(test_feats)
    iso_calib_scores = iso_detector.score(calib_feats)
    iso_th = float(iso_calib_scores.dropna().quantile(0.985))
    iso_alert = (iso_test_scores >= iso_th).fillna(False)
    iso_episodes = decision._group_into_episodes(iso_alert, test_feats.index)
    iso_detected = 0
    for event in config.FAILURE_EVENTS:
        w_start, w_end = event.start - credit_td, event.end
        if not iso_episodes.empty and ((iso_episodes["start"] <= w_end) & (iso_episodes["end"] >= w_start)).any():
            iso_detected += 1
    iso_recall = iso_detected / len(config.FAILURE_EVENTS)
    iso_far = max(len(iso_episodes) - iso_detected, 0) / test_months

    # ----------------------------------------------------------------------
    # 10. Compile Final Summary
    # ----------------------------------------------------------------------
    total_pipeline_sec = time.time() - t_start

    results = {
        "status": "success",
        "dataset": {
            "csv_path": str(csv_path),
            "raw_rows_loaded": raw_rows,
            "raw_timestamp_start": str(raw_span[0]),
            "raw_timestamp_end": str(raw_span[1]),
            "grid_minutes": total_minutes,
            "missing_minutes": missing_minutes,
            "missing_percentage": round(missing_pct, 2),
        },
        "features": {
            "total_feature_columns": total_features,
            "model_feature_columns_count": len(candidate_cols),
            "feature_windows": list(config.FEATURE_WINDOWS.keys()),
        },
        "splits": {
            "train_rows": len(train_feats),
            "calib_rows": len(calib_feats),
            "test_rows": len(test_feats),
        },
        "model": {
            "algorithm": "Mahalanobis Distance (Per-Operating-State Shrinkage Covariance)",
            "states_fitted": list(detector._models.keys()),
            "calibrated_threshold": round(best_threshold, 3),
            "calibrated_severe_threshold": round(best_severe, 3),
            "target_false_alarm_budget_per_month": config.CALIBRATION_FALSE_ALARM_BUDGET_PER_MONTH,
        },
        "evaluation": {
            "total_test_episodes": n_total_episodes,
            "failures_detected": detected_count,
            "total_documented_failures": len(config.FAILURE_EVENTS),
            "recall": round(recall, 4),
            "precision": round(precision, 4),
            "false_alarm_episodes": false_alarm_episodes,
            "false_alarm_rate_per_month": round(false_alarm_rate_per_month, 2),
            "events_breakdown": event_eval,
            "top_contributing_features": top_contributors_summary,
        },
        "baselines_comparison": {
            "machpulse_mahalanobis": {
                "recall": round(recall, 2),
                "false_alarms_per_month": round(false_alarm_rate_per_month, 2),
                "interpretable": True,
            },
            "fixed_threshold_baseline": {
                "recall": round(fixed_recall, 2),
                "false_alarms_per_month": round(fixed_far, 2),
                "description": "Motor_current > 4.0A sustained >= 10m",
            },
            "lps_alarm_baseline": {
                "recall": round(lps_recall, 2),
                "false_alarms_per_month": round(lps_far, 2),
                "description": "On-board Low Pressure Switch signal",
            },
            "isolation_forest_baseline": {
                "recall": round(iso_recall, 2),
                "false_alarms_per_month": round(iso_far, 2),
                "description": "Per-state Isolation Forest (secondary detector)",
            },
        },
        "performance": {
            "total_pipeline_runtime_sec": round(total_pipeline_sec, 2),
            "timings_breakdown": {k: round(v, 2) for k, v in timings.items()},
        },
    }

    logger.info("Pipeline completed successfully in %.2f seconds.", total_pipeline_sec)
    return results


if __name__ == "__main__":
    import json
    res = run_pipeline()
    print("\n" + "=" * 60)
    print("MACH PULSE PIPELINE EXECUTION SUMMARY")
    print("=" * 60)
    print(json.dumps(res, indent=2))
