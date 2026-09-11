"""
Turns a per-window anomaly score into an operational decision.

Persistence (does the deviation hold across consecutive windows) and
multi-sensor agreement (do several independent channels agree) are what
suppress false alarms relative to a single-sample threshold crossing --
and both are directly measurable, which is what lets the false-alarm claim
in the report be backed by evidence rather than assertion.
"""
from __future__ import annotations

from enum import Enum

import numpy as np
import pandas as pd

from . import config


class Decision(str, Enum):
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT EVIDENCE"
    MONITOR = "MONITOR"
    INSPECT = "INSPECT"
    MAINTAIN = "MAINTAIN"


def quality_gate_passes(coverage: float, frozen_fraction: float) -> bool:
    return (coverage >= config.MIN_WINDOW_COVERAGE) and (frozen_fraction <= config.MAX_WINDOW_FROZEN_FRACTION)


def decide(
    distance: float,
    threshold: float,
    severe_threshold: float,
    persistent_windows: int,
    n_contributing_sensors: int,
    coverage: float,
    frozen_fraction: float,
    min_persistence_windows: int = 2,
    min_contributing_sensors: int = 2,
) -> Decision:
    """
    Single-window decision function.

    distance / threshold / severe_threshold: Mahalanobis distance and the
        two calibrated bands (elevated, severe) for this window's
        operating-state stratum.
    persistent_windows: how many consecutive prior windows (inclusive of
        this one) have also exceeded `threshold`.
    n_contributing_sensors: number of features whose individual deviation
        exceeds its own per-feature threshold (see model.py contribution
        decomposition).
    """
    if not quality_gate_passes(coverage, frozen_fraction):
        return Decision.INSUFFICIENT_EVIDENCE

    if distance < threshold:
        return Decision.MONITOR

    persistent_enough = persistent_windows >= min_persistence_windows
    agreement_enough = n_contributing_sensors >= min_contributing_sensors

    if distance >= severe_threshold and persistent_enough:
        return Decision.MAINTAIN

    if persistent_enough and agreement_enough:
        return Decision.INSPECT

    # Elevated but not yet corroborated by persistence or multi-sensor
    # agreement -- still worth surfacing, but not yet an alert episode.
    return Decision.MONITOR


def apply_decisions(
    distances: pd.Series,
    threshold: float,
    severe_threshold: float,
    coverage: pd.Series,
    frozen_fraction: pd.Series,
    contributing_sensor_counts: pd.Series,
    min_persistence_windows: int = 2,
    min_contributing_sensors: int = 2,
) -> pd.DataFrame:
    """
    Vectorised wrapper around `decide` over a full distance series, tracking
    persistence as a running count of consecutive above-threshold windows.

    Returns a DataFrame indexed like `distances` with columns:
    [distance, threshold, severe_threshold, persistent_windows, decision].
    """
    above = (distances >= threshold).astype(int)
    # consecutive run length of "above threshold", reset to 0 on any miss
    run_id = (above == 0).cumsum()
    persistent = above.groupby(run_id).cumsum()

    cov_arr = coverage.reindex(distances.index).fillna(0.0).to_numpy(dtype=float)
    froz_arr = frozen_fraction.reindex(distances.index).fillna(1.0).to_numpy(dtype=float)
    dist_arr = distances.to_numpy(dtype=float)
    persist_arr = persistent.to_numpy(dtype=int)
    agree_arr = contributing_sensor_counts.reindex(distances.index).fillna(0).to_numpy(dtype=int)

    quality_passes = (cov_arr >= config.MIN_WINDOW_COVERAGE) & (froz_arr <= config.MAX_WINDOW_FROZEN_FRACTION)
    not_nan_dist = ~np.isnan(dist_arr)
    valid_scored = quality_passes & not_nan_dist

    cond_insufficient = ~quality_passes | ~not_nan_dist
    cond_maintain = valid_scored & (dist_arr >= severe_threshold) & (persist_arr >= min_persistence_windows)
    cond_inspect = (
        valid_scored
        & (dist_arr >= threshold)
        & (persist_arr >= min_persistence_windows)
        & (agree_arr >= min_contributing_sensors)
    )

    choices = [Decision.INSUFFICIENT_EVIDENCE.value, Decision.MAINTAIN.value, Decision.INSPECT.value]
    conditions = [cond_insufficient, cond_maintain, cond_inspect]
    decisions = np.select(conditions, choices, default=Decision.MONITOR.value)

    return pd.DataFrame(
        {
            "distance": distances,
            "threshold": threshold,
            "severe_threshold": severe_threshold,
            "persistent_windows": persistent,
            "decision": decisions,
        },
        index=distances.index,
    )


def alert_episodes_from_decisions(
    decisions: pd.Series, alerting_states: tuple[str, ...] = (Decision.INSPECT.value, Decision.MAINTAIN.value)
) -> pd.DataFrame:
    """
    Group consecutive (allowing gaps up to config.EPISODE_MERGE_GAP_MINUTES)
    alerting rows into distinct episodes.

    Returns a DataFrame [episode_id, start, end, max_decision_rank] where a
    higher rank means a more severe decision was reached within the episode.
    """
    is_alert = decisions.isin(alerting_states)
    return _group_into_episodes(is_alert, decisions.index, severity=decisions)


def _group_into_episodes(is_active: pd.Series, index: pd.DatetimeIndex, severity: pd.Series | None = None) -> pd.DataFrame:
    if not is_active.any():
        return pd.DataFrame(columns=["episode_id", "start", "end", "max_severity"])

    active_times = index[is_active.to_numpy()]
    gaps = active_times.to_series().diff().dt.total_seconds() / 60.0
    new_episode = (gaps.isna()) | (gaps > config.EPISODE_MERGE_GAP_MINUTES)
    episode_id = new_episode.cumsum().to_numpy()

    df = pd.DataFrame({"timestamp": active_times, "episode_id": episode_id})
    grouped = df.groupby("episode_id")["timestamp"].agg(["min", "max"]).reset_index()
    grouped.columns = ["episode_id", "start", "end"]

    if severity is not None:
        sev_map = {"MONITOR": 0, "INSUFFICIENT EVIDENCE": 0, "INSPECT": 1, "MAINTAIN": 2}
        sev_series = severity.reindex(active_times).map(sev_map).fillna(0)
        df["sev"] = sev_series.to_numpy()
        max_sev = df.groupby("episode_id")["sev"].max().reset_index()
        grouped = grouped.merge(max_sev, on="episode_id")
        grouped = grouped.rename(columns={"sev": "max_severity"})
    return grouped
