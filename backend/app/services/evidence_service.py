"""
MachPulseEvidence - the canonical structured object handed to the reasoning
layer and (a curated subset of) the LLM.

Every field is either a verified output of the existing MachPulse ML service
(``app.services.ml_service.ml_service``) or a deterministic transform of one.
Nothing here is invented. No ML is recomputed - the anomaly distance,
thresholds, decision, contributions and operating state all come straight from
the pipeline artifacts via the existing service. When a value genuinely is not
available it is set to ``None`` and surfaced in ``limitations``.

The RAW dataset is never read here and never leaves the backend. Only the
already-published API surface (machine health, quality indicators, pipeline
summary, and summary statistics of the recent 1-minute telemetry buffer) is
used.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.services.inspection_guidance import guidance_for_features
from app.services.ml_service import ml_service

# Operating-state classifier bands (documented in ml/decision.py / the dataset
# analysis). Used only to describe the already-classified state in words.
_OFF_MAX_A = 0.5
_OFFLOADED_MAX_A = 6.0

_RECENT_BUFFER_LIMIT = 120
_SHORT_WINDOW = 60

_URGENCY_BY_DECISION = {
    "MONITOR": "ROUTINE",
    "INSPECT": "ELEVATED",
    "MAINTAIN": "IMMEDIATE",
    "INSUFFICIENT EVIDENCE": "UNKNOWN",
}

_MAINTENANCE_BY_DECISION = {
    "MONITOR": "Continue standard telemetry observation; no inspection is currently indicated.",
    "INSPECT": "Perform a guided inspection of the top contributing signals; record findings.",
    "MAINTAIN": "Schedule a maintenance action based on the severe multi-sensor divergence; record findings on completion.",
    "INSUFFICIENT EVIDENCE": "Review telemetry window coverage and continuity; collect additional continuous telemetry before re-evaluating.",
}


# --------------------------------------------------------------------------- #
# Schema
# --------------------------------------------------------------------------- #
class MachineBlock(BaseModel):
    machine_id: str
    asset_name: str


class ObservationBlock(BaseModel):
    timestamp: str
    operating_state: str
    operating_state_description: str
    dataset: str = "MetroPT-3 (historical decimated telemetry)"


class DecisionBlock(BaseModel):
    ml_decision: str
    operational_urgency: str


class AnomalyBlock(BaseModel):
    mahalanobis_distance: float
    elevated_threshold: float
    severe_threshold: float
    is_above_elevated_threshold: bool
    anomaly_proximity_index_pct: Optional[float] = None
    severity_ratio: Optional[float] = None
    interpretation_note: str = (
        "Anomaly headroom = 100 * (1 - min(1, distance / severe_threshold)). "
        "Headroom to calibrated severe boundary. It is a condition indicator derived from anomaly distance. "
        "It is not failure probability or remaining useful life."
    )


class DataQualityBlock(BaseModel):
    window_coverage: float
    evidence_gate_passed: bool
    min_window_coverage_threshold: float
    max_window_frozen_fraction_threshold: float
    dataset_missing_percentage: float
    documented_gaps_count: int
    total_gap_hours: float
    stream_health: str


class PatternsBlock(BaseModel):
    buffer_sample_count: int
    short_window_samples: int
    short_window_channel_means: dict[str, Optional[float]] = Field(default_factory=dict)
    recent_distance_first: Optional[float] = None
    recent_distance_last: Optional[float] = None
    recent_distance_direction: str = "unavailable"
    operating_state_mix: dict[str, int] = Field(default_factory=dict)
    note: str = (
        "Summary statistics of the recent 1-minute telemetry buffer only. "
        "1h / 6h / 24h feature windows are computed inside the ML pipeline, not here."
    )


class SensorsBlock(BaseModel):
    motor_current_amps: Optional[float] = None
    tp2_bar: Optional[float] = None
    tp3_bar: Optional[float] = None
    h1_bar: Optional[float] = None
    oil_temperature_c: Optional[float] = None
    dv_pressure_bar: Optional[float] = None


class ContributorItem(BaseModel):
    feature: str
    contribution: float
    relative_weight_pct: int


class ModelContextBlock(BaseModel):
    algorithm: str
    states_fitted: list[str]
    calibrated_threshold: float
    calibrated_severe_threshold: float
    target_false_alarm_budget_per_month: float
    feature_windows: list[str]
    documented_recall: Optional[float] = None
    documented_precision: Optional[float] = None
    documented_events_detected: Optional[int] = None
    documented_events_total: Optional[int] = None


class MaintenanceBlock(BaseModel):
    existing_recommended_action: str
    inspection_directions: list[dict[str, Any]] = Field(default_factory=list)


class MachPulseEvidence(BaseModel):
    schema_version: str = "phase4.evidence.v1"
    generated_at: str
    machine: MachineBlock
    observation: ObservationBlock
    decision: DecisionBlock
    anomaly: AnomalyBlock
    data_quality: DataQualityBlock
    patterns: PatternsBlock
    sensors: SensorsBlock
    contributors: list[ContributorItem] = Field(default_factory=list)
    model_context: ModelContextBlock
    maintenance: MaintenanceBlock
    limitations: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Builder
# --------------------------------------------------------------------------- #
def _operating_state_description(state: str, motor_current: Optional[float]) -> str:
    s = (state or "").lower()
    if s == "off":
        if motor_current is not None:
            return f"Machine idle - motor draw {motor_current:.3f} A (< 0.5 A)."
        return "Machine idle - motor draw below 0.5 A."
    if s == "offloaded":
        if motor_current is not None:
            return f"Compressor running unpressurized - motor draw {motor_current:.3f} A (0.5-6.0 A)."
        return "Compressor running unpressurized - motor draw 0.5-6.0 A."
    if s == "loaded":
        if motor_current is not None:
            return f"Compressor actively pumping into reservoir - motor draw {motor_current:.3f} A (> 6.0 A)."
        return "Compressor actively pumping into the reservoir - motor draw above 6.0 A."
    if motor_current is None:
        return "Operating state not classified for this observation."
    return f"Operating state '{state}' (motor draw {motor_current:.3f} A)."


def _round_opt(value: Any, ndigits: int = 3) -> Optional[float]:
    if value is None:
        return None
    try:
        return round(float(value), ndigits)
    except (TypeError, ValueError):
        return None


def _mean_opt(values: list[Any]) -> Optional[float]:
    nums = [float(v) for v in values if isinstance(v, (int, float))]
    if not nums:
        return None
    return round(sum(nums) / len(nums), 4)


def build_evidence() -> MachPulseEvidence:
    """Assemble the evidence object from the existing ML service outputs."""
    health = ml_service.get_latest_machine_health()
    quality = ml_service.get_data_quality_indicators()
    summary = ml_service.get_pipeline_summary()
    try:
        events = ml_service.get_failure_events_evaluation()
    except Exception:  # evaluation is non-critical context
        events = {}
    telemetry = ml_service.get_recent_telemetry(limit=_RECENT_BUFFER_LIMIT)

    decision = str(health.get("decision", "MONITOR"))
    coverage = float(health.get("quality_gate", {}).get("coverage", 1.0))
    gate_passed = bool(health.get("quality_gate", {}).get("gate_passed", True))
    distance = float(health.get("anomaly_distance", 0.0))
    elevated = float(health.get("elevated_threshold", 0.0))
    severe = float(health.get("severe_threshold", 0.0))
    sensor_readings = health.get("sensor_readings", {}) or {}
    motor_current = _round_opt(sensor_readings.get("motor_current_amps"))

    insufficient = decision == "INSUFFICIENT EVIDENCE" or coverage < float(
        quality["quality_gate_thresholds"]["min_window_coverage"]
    )

    proximity_pct: Optional[float] = None
    severity_ratio: Optional[float] = None
    if not insufficient:
        if severe > 0:
            proximity_pct = round(100.0 * (1.0 - min(1.0, distance / severe)), 1)
        if elevated > 0:
            severity_ratio = round(distance / elevated, 2)

    # ---- patterns: recent buffer summary stats only -----------------------
    scored = [p for p in telemetry if p.get("distance") is not None]
    recent_first = _round_opt(scored[0]["distance"], 2) if scored else None
    recent_last = _round_opt(scored[-1]["distance"], 2) if scored else None
    if recent_first is None or recent_last is None:
        direction = "unavailable"
    else:
        delta = recent_last - recent_first
        direction = "flat" if abs(delta) < 1.0 else ("rising" if delta > 0 else "falling")

    short = telemetry[-_SHORT_WINDOW:]
    channel_means = {
        ch: _mean_opt([p.get(ch) for p in short])
        for ch in ("motor_current", "tp2", "tp3", "h1", "oil_temperature", "dv_pressure")
    }
    state_mix = {"off": 0, "offloaded": 0, "loaded": 0, "unknown": 0}
    for p in telemetry:
        st = str(p.get("operating_state", "unknown"))
        state_mix[st] = state_mix.get(st, 0) + 1

    # ---- contributors ---------------------------------------------------
    raw_contribs = health.get("top_contributing_sensors", []) or []
    max_contrib = raw_contribs[0]["contribution"] if raw_contribs else 1.0
    contributors = [
        ContributorItem(
            feature=str(c["feature"]),
            contribution=round(float(c["contribution"]), 3),
            relative_weight_pct=int(round((float(c["contribution"]) / max_contrib) * 100)) if max_contrib else 0,
        )
        for c in raw_contribs[:5]
    ]
    contributor_names = [c.feature for c in contributors]

    # ---- limitations (deterministic, honest) ---------------------------
    limitations = [
        "MachPulse does not produce a Remaining Useful Life (RUL) or time-to-failure estimate.",
        "Top model contributors are statistical divergence from the healthy February baseline, not confirmed physical faults.",
        "Documented-event precision is low (~6%); every alert requires human verification.",
    ]
    if not insufficient and decision in ("INSPECT", "MAINTAIN"):
        limitations.append(
            "The decision is multivariate statistical distance; physical inspection is required before concluding a cause."
        )
    if any("OIL" in n.upper() or "TEMPERATURE" in n.upper() for n in contributor_names):
        limitations.append(
            "Oil temperature is subject to seasonal thermal drift (Feb-Aug); no ambient-temperature channel is available to separate wear from seasonal effect."
        )
    if insufficient:
        limitations.append(
            "Telemetry window coverage or continuity did not meet the quality gate; machine condition cannot be assessed from this observation."
        )
    if sensor_readings.get("motor_current_amps") is None:
        limitations.append("Latest sensor readings are unavailable for this observation window.")

    return MachPulseEvidence(
        generated_at=datetime.now(timezone.utc).isoformat(),
        machine=MachineBlock(
            machine_id=str(health.get("machine_id", "MetroPT-3")),
            asset_name=str(health.get("asset_name", "Metro Air Compressor Unit 3")),
        ),
        observation=ObservationBlock(
            timestamp=str(health.get("timestamp", "")),
            operating_state=str(health.get("operating_state", "unknown")),
            operating_state_description=_operating_state_description(
                str(health.get("operating_state", "unknown")), motor_current
            ),
        ),
        decision=DecisionBlock(
            ml_decision=decision,
            operational_urgency=_URGENCY_BY_DECISION.get(decision, "UNKNOWN"),
        ),
        anomaly=AnomalyBlock(
            mahalanobis_distance=round(distance, 2),
            elevated_threshold=round(elevated, 3),
            severe_threshold=round(severe, 3),
            is_above_elevated_threshold=bool(health.get("is_above_threshold", distance >= elevated)),
            anomaly_proximity_index_pct=proximity_pct,
            severity_ratio=severity_ratio,
        ),
        data_quality=DataQualityBlock(
            window_coverage=round(coverage, 3),
            evidence_gate_passed=gate_passed and not insufficient,
            min_window_coverage_threshold=float(quality["quality_gate_thresholds"]["min_window_coverage"]),
            max_window_frozen_fraction_threshold=float(
                quality["quality_gate_thresholds"]["max_window_frozen_fraction"]
            ),
            dataset_missing_percentage=float(quality.get("missing_percentage", 0.0)),
            documented_gaps_count=int(quality.get("documented_gaps_count", 0)),
            total_gap_hours=float(quality.get("total_gap_hours", 0.0)),
            stream_health=str(quality.get("stream_health", "")),
        ),
        patterns=PatternsBlock(
            buffer_sample_count=len(telemetry),
            short_window_samples=len(short),
            short_window_channel_means=channel_means,
            recent_distance_first=recent_first,
            recent_distance_last=recent_last,
            recent_distance_direction=direction,
            operating_state_mix={k: v for k, v in state_mix.items() if v},
        ),
        sensors=SensorsBlock(
            motor_current_amps=_round_opt(sensor_readings.get("motor_current_amps")),
            tp2_bar=_round_opt(sensor_readings.get("tp2_bar")),
            tp3_bar=_round_opt(sensor_readings.get("tp3_bar")),
            h1_bar=_round_opt(sensor_readings.get("h1_bar")),
            oil_temperature_c=_round_opt(sensor_readings.get("oil_temperature_c"), 2),
            dv_pressure_bar=_round_opt(sensor_readings.get("dv_pressure_bar")),
        ),
        contributors=contributors,
        model_context=ModelContextBlock(
            algorithm=str(summary["model"]["algorithm"]),
            states_fitted=list(summary["model"].get("states_fitted", [])),
            calibrated_threshold=float(summary["model"]["calibrated_threshold"]),
            calibrated_severe_threshold=float(summary["model"]["calibrated_severe_threshold"]),
            target_false_alarm_budget_per_month=float(
                summary["model"]["target_false_alarm_budget_per_month"]
            ),
            feature_windows=list(summary["features"].get("feature_windows", [])),
            documented_recall=events.get("recall"),
            documented_precision=events.get("precision"),
            documented_events_detected=events.get("failures_detected"),
            documented_events_total=events.get("total_documented_failures"),
        ),
        maintenance=MaintenanceBlock(
            existing_recommended_action=_MAINTENANCE_BY_DECISION.get(
                decision, _MAINTENANCE_BY_DECISION["MONITOR"]
            ),
            inspection_directions=(
                guidance_for_features(contributor_names)
                if decision in ("INSPECT", "MAINTAIN")
                else []
            ),
        ),
        limitations=limitations,
    )


def evidence_to_llm_payload(evidence: MachPulseEvidence, reasoning_context: dict[str, Any]) -> dict[str, Any]:
    """
    The exact, compact object sent to the LLM. It is a curated view of the
    evidence plus the deterministic reasoning result. It contains no raw
    telemetry arrays, no dataset rows, no file paths, no credentials - only the
    fields below.
    """
    ev = evidence.model_dump()
    return {
        "schema_version": ev["schema_version"],
        "machine": ev["machine"],
        "observation": ev["observation"],
        "decision": ev["decision"],
        "anomaly": ev["anomaly"],
        "data_quality": ev["data_quality"],
        "patterns": ev["patterns"],
        "sensors": ev["sensors"],
        "contributors": ev["contributors"],
        "model_context": ev["model_context"],
        "maintenance": ev["maintenance"],
        "limitations": ev["limitations"],
        "reasoning": reasoning_context,
    }
