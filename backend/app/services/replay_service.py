"""
Historical Replay Service for MachPulse (Phase 5C.1).
Replays chronological MetroPT-3 observations without fabricating data or modifying ML logic.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("machpulse.replay")

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


RECENT_TELEMETRY_FILE = _find_eval_file("recent_telemetry.json")
RESULTS_FILE = _find_eval_file("pipeline_results.json")


def classify_operating_state(motor_current: Optional[float]) -> str:
    """Canonical operating-state classifier per analysis §7: <0.5A off, 0.5-6.0A offloaded, >6.0A loaded."""
    if motor_current is None:
        return "unknown"
    if motor_current < 0.5:
        return "off"
    elif motor_current <= 6.0:
        return "offloaded"
    else:
        return "loaded"


class ReplayService:
    def __init__(self) -> None:
        self._telemetry_data: Optional[List[Dict[str, Any]]] = None
        self._results_data: Optional[Dict[str, Any]] = None
        self._running: bool = False
        self._current_index: Optional[int] = None
        self._speed: int = 1  # 1x, 5x, 20x
        self._last_tick_time: float = time.time()
        self._step_interval: float = 2.0  # seconds per observation step

    def _load_data(self) -> None:
        if self._telemetry_data is None:
            if RECENT_TELEMETRY_FILE.exists():
                with open(RECENT_TELEMETRY_FILE, "r", encoding="utf-8") as f:
                    raw_data = json.load(f)
                    # Enforce strict operating-state consistency
                    for pt in raw_data:
                        if pt.get("motor_current") is not None:
                            pt["operating_state"] = classify_operating_state(pt["motor_current"])
                    self._telemetry_data = raw_data
            else:
                self._telemetry_data = []

        if self._results_data is None:
            if RESULTS_FILE.exists():
                with open(RESULTS_FILE, "r", encoding="utf-8") as f:
                    self._results_data = json.load(f)
            else:
                self._results_data = {}

        if self._current_index is None:
            self._current_index = 0

    def _update_position(self) -> None:
        """Advance index based on wall-clock elapsed time if running."""
        self._load_data()
        if not self._running or not self._telemetry_data:
            self._last_tick_time = time.time()
            return

        now = time.time()
        elapsed = now - self._last_tick_time
        target_step_time = self._step_interval / float(self._speed)

        if elapsed >= target_step_time:
            steps = int(elapsed / target_step_time)
            self._current_index = (self._current_index or 0) + steps
            self._last_tick_time = now - (elapsed % target_step_time)

            max_idx = len(self._telemetry_data) - 1
            if self._current_index >= max_idx:
                self._current_index = max_idx
                self._running = False
                logger.info("Historical replay reached end of MetroPT-3 telemetry sequence.")

    def get_status(self) -> Dict[str, Any]:
        self._update_position()
        self._load_data()
        total = len(self._telemetry_data) if self._telemetry_data else 0
        idx = self._current_index if self._current_index is not None else max(0, total - 1)
        current_pt = self._telemetry_data[idx] if total > 0 and idx < total else {}
        is_completed = total > 0 and idx >= total - 1 and not self._running

        return {
            "running": self._running,
            "completed": is_completed,
            "current_index": idx,
            "total_observations": total,
            "current_timestamp": current_pt.get("timestamp", "2020-09-01 02:00:00"),
            "speed": self._speed,
            "mode": "HISTORICAL REPLAY • METROPT-3",
        }

    def start(self) -> Dict[str, Any]:
        self._load_data()
        total = len(self._telemetry_data) if self._telemetry_data else 0
        idx = self._current_index if self._current_index is not None else 0

        # If at the end, restart from 0
        if total > 0 and idx >= total - 1:
            self._current_index = 0

        self._running = True
        self._last_tick_time = time.time()
        return self.get_status()

    def pause(self) -> Dict[str, Any]:
        self._update_position()
        self._running = False
        return self.get_status()

    def reset(self) -> Dict[str, Any]:
        self._running = False
        self._current_index = 0
        self._last_tick_time = time.time()
        return self.get_status()

    def set_speed(self, speed: int) -> Dict[str, Any]:
        self._update_position()
        if speed in (1, 5, 20):
            self._speed = speed
        return self.get_status()

    def get_current_observation(self) -> Dict[str, Any]:
        self._update_position()
        self._load_data()
        if not self._telemetry_data:
            return {}
        idx = self._current_index if self._current_index is not None else len(self._telemetry_data) - 1
        idx = max(0, min(idx, len(self._telemetry_data) - 1))
        return self._telemetry_data[idx]

    def get_recent_window(self, limit: int = 60) -> List[Dict[str, Any]]:
        self._update_position()
        self._load_data()
        if not self._telemetry_data:
            return []
        idx = self._current_index if self._current_index is not None else len(self._telemetry_data) - 1
        end_idx = min(idx + 1, len(self._telemetry_data))
        start_idx = max(0, end_idx - limit)
        return self._telemetry_data[start_idx:end_idx]

    def get_current_machine_health(self) -> Dict[str, Any]:
        """Build MachineHealthResponse for current replay observation."""
        self._update_position()
        self._load_data()
        pt = self.get_current_observation()

        elevated_th = 304.255
        severe_th = 729.718
        if self._results_data and "model" in self._results_data:
            elevated_th = self._results_data["model"].get("calibrated_threshold", 304.255)
            severe_th = self._results_data["model"].get("calibrated_severe_threshold", 729.718)

        decision = pt.get("decision", "MONITOR")
        distance = pt.get("distance")
        if distance is None:
            distance = 0.0

        health_status_map = {
            "MONITOR": "HEALTHY",
            "INSPECT": "WARNING",
            "MAINTAIN": "CRITICAL",
            "INSUFFICIENT EVIDENCE": "UNKNOWN",
        }
        health_status = health_status_map.get(decision, "HEALTHY")

        top_contribs = []
        if self._results_data and "evaluation" in self._results_data:
            top_contribs = [
                {"feature": k, "contribution": v}
                for k, v in self._results_data["evaluation"].get("top_contributing_features", {}).items()
            ]

        coverage = pt.get("coverage", 1.0)
        gate_passed = decision != "INSUFFICIENT EVIDENCE" and coverage >= 0.6

        return {
            "machine_id": "MetroPT-3",
            "asset_name": "Metro Air Compressor Unit 3",
            "timestamp": pt.get("timestamp", "2020-09-01 03:59:00"),
            "operating_state": pt.get("operating_state", "off"),
            "health_status": health_status,
            "decision": decision,
            "anomaly_distance": distance,
            "elevated_threshold": elevated_th,
            "severe_threshold": severe_th,
            "is_above_threshold": distance >= elevated_th if distance else False,
            "top_contributing_sensors": top_contribs,
            "quality_gate": {
                "coverage": coverage,
                "gate_passed": gate_passed,
            },
            "sensor_readings": {
                "motor_current_amps": pt.get("motor_current"),
                "tp2_bar": pt.get("tp2"),
                "tp3_bar": pt.get("tp3"),
                "h1_bar": pt.get("h1"),
                "oil_temperature_c": pt.get("oil_temperature"),
                "dv_pressure_bar": pt.get("dv_pressure"),
            },
        }


replay_service = ReplayService()
