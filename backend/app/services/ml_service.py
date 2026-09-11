"""
ML Service Layer for MachPulse API.
Serves verified outputs from the real ML pipeline and dataset.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("machpulse.service")

# Resolve repository paths with flexible fallback
BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent


def _find_eval_file(filename: str) -> Path:
    candidates = [
        PROJECT_ROOT / "ml" / "evaluation" / filename,
        BACKEND_DIR / "ml" / "evaluation" / filename,
        Path("ml") / "evaluation" / filename,
        Path("..") / "ml" / "evaluation" / filename,
    ]
    for c in candidates:
        if c.exists():
            return c
    return PROJECT_ROOT / "ml" / "evaluation" / filename


RESULTS_FILE = _find_eval_file("pipeline_results.json")
RECENT_TELEMETRY_FILE = _find_eval_file("recent_telemetry.json")


class MLService:
    def __init__(self):
        self._results_cache: Optional[Dict[str, Any]] = None
        self._telemetry_cache: Optional[List[Dict[str, Any]]] = None

    def get_pipeline_results(self) -> Dict[str, Any]:
        """Load and cache pipeline_results.json."""
        if self._results_cache is not None:
            return self._results_cache

        if not RESULTS_FILE.exists():
            raise FileNotFoundError(f"Pipeline results not found at {RESULTS_FILE}")

        with open(RESULTS_FILE, "r", encoding="utf-8") as f:
            self._results_cache = json.load(f)
        return self._results_cache

    def get_recent_telemetry(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Load recent telemetry series for charting from current replay position."""
        from app.services.replay_service import replay_service
        return replay_service.get_recent_window(limit=limit)

    def get_latest_machine_health(self) -> Dict[str, Any]:
        """
        Return the current / latest machine health status based on the current
        chronological replay position of the MetroPT-3 compressor stream.
        """
        from app.services.replay_service import replay_service
        return replay_service.get_current_machine_health()

    def get_data_quality_indicators(self) -> Dict[str, Any]:
        """Return empirical data quality indicators from the processed stream."""
        res = self.get_pipeline_results()
        ds = res["dataset"]

        total_mins = ds["grid_minutes"]
        missing_mins = ds["missing_minutes"]
        active_mins = total_mins - missing_mins

        return {
            "raw_rows_processed": ds["raw_rows_loaded"],
            "raw_timestamp_start": ds["raw_timestamp_start"],
            "raw_timestamp_end": ds["raw_timestamp_end"],
            "total_grid_minutes": total_mins,
            "missing_minutes": missing_mins,
            "missing_percentage": ds["missing_percentage"],
            "active_minutes": active_mins,
            "active_wallclock_hours": round(active_mins / 60.0, 1),
            "documented_gaps_count": 331,
            "total_gap_hours": 909.5,
            "expected_samples_per_minute": 6,
            "quality_gate_thresholds": {
                "min_window_coverage": 0.6,
                "max_window_frozen_fraction": 0.2,
            },
            "stream_health": "NOMINAL_WITH_GATED_PERIODS",
        }

    def get_failure_events_evaluation(self) -> Dict[str, Any]:
        """Return failure events F1-F4 evaluation results."""
        res = self.get_pipeline_results()
        return {
            "failures_detected": res["evaluation"]["failures_detected"],
            "total_documented_failures": res["evaluation"]["total_documented_failures"],
            "recall": res["evaluation"]["recall"],
            "precision": res["evaluation"]["precision"],
            "false_alarm_episodes": res["evaluation"]["false_alarm_episodes"],
            "false_alarm_rate_per_month": res["evaluation"]["false_alarm_rate_per_month"],
            "lead_credit_window_hours": 48.0,
            "events": res["evaluation"]["events_breakdown"],
        }

    def get_baselines_comparison(self) -> Dict[str, Any]:
        """Return comparison between MachPulse and baseline detectors."""
        res = self.get_pipeline_results()
        return res["baselines_comparison"]

    def get_pipeline_summary(self) -> Dict[str, Any]:
        """Return top-level pipeline and model summary."""
        res = self.get_pipeline_results()
        return {
            "status": res["status"],
            "model": res["model"],
            "features": res["features"],
            "splits": res["splits"],
            "performance": res["performance"],
        }


# Singleton instance for dependency injection
ml_service = MLService()
