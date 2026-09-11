"""
Deterministic reasoning / safety layer.

Runs BEFORE any LLM call and cannot be overridden by one. It decides:

  * is the evidence sufficient to say anything about machine condition?
  * what is the authoritative ML decision?  (taken verbatim - never recomputed)
  * which single recommended action is the LLM allowed to return?
  * is an LLM explanation permitted at all for this state?
  * which limitations MUST be disclosed regardless of what a model says?

It also produces a complete deterministic ``AiExplanation`` built only from the
evidence. That object is the fallback whenever the LLM is disabled,
unavailable, or returns something that fails validation - and it is the *only*
thing returned for INSUFFICIENT EVIDENCE (the model is never asked to guess).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.models.ai import AiExplanation, RecommendedAction
from app.services.evidence_service import MachPulseEvidence

# Decision string -> the single action the LLM is permitted to echo back.
_ACTION_BY_DECISION: dict[str, RecommendedAction] = {
    "MONITOR": "MONITOR",
    "INSPECT": "INSPECT",
    "MAINTAIN": "MAINTAIN",
    "INSUFFICIENT EVIDENCE": "INSUFFICIENT_EVIDENCE",
}


@dataclass
class ReasoningResult:
    evidence_sufficient: bool
    ml_decision: str
    allowed_recommended_action: RecommendedAction
    llm_invocation_allowed: bool
    block_reason: str | None
    mandatory_limitations: list[str]
    deterministic_explanation: AiExplanation
    # Compact dict merged into the LLM payload (see evidence_to_llm_payload).
    llm_reasoning_context: dict[str, Any] = field(default_factory=dict)


def run_reasoning(evidence: MachPulseEvidence) -> ReasoningResult:
    decision = evidence.decision.ml_decision
    coverage = evidence.data_quality.window_coverage
    min_cov = evidence.data_quality.min_window_coverage_threshold

    evidence_sufficient = (
        decision != "INSUFFICIENT EVIDENCE"
        and evidence.data_quality.evidence_gate_passed
        and coverage >= min_cov
    )

    allowed_action: RecommendedAction = (
        _ACTION_BY_DECISION.get(decision, "INSUFFICIENT_EVIDENCE")
        if evidence_sufficient
        else "INSUFFICIENT_EVIDENCE"
    )

    # The LLM may explain MONITOR / INSPECT / MAINTAIN. It is never asked to
    # interpret an insufficient-evidence state.
    if not evidence_sufficient:
        llm_allowed = False
        block_reason = "insufficient_evidence"
    else:
        llm_allowed = True
        block_reason = None

    mandatory_limitations = list(evidence.limitations)

    deterministic = _build_deterministic_explanation(
        evidence, allowed_action, evidence_sufficient, mandatory_limitations
    )

    reasoning_context = {
        "evidence_sufficient": evidence_sufficient,
        "ml_decision": decision,
        "allowed_recommended_action": allowed_action,
        "operational_urgency": evidence.decision.operational_urgency,
        "mandatory_limitations": mandatory_limitations,
        "instruction": (
            "Explain the evidence above for a maintenance technician. Your "
            "'recommended_action' MUST equal allowed_recommended_action. Do not "
            "produce RUL, time-to-failure, failure probability, or a numeric "
            "confidence. Do not assert a confirmed physical fault."
        ),
    }

    return ReasoningResult(
        evidence_sufficient=evidence_sufficient,
        ml_decision=decision,
        allowed_recommended_action=allowed_action,
        llm_invocation_allowed=llm_allowed,
        block_reason=block_reason,
        mandatory_limitations=mandatory_limitations,
        deterministic_explanation=deterministic,
        llm_reasoning_context=reasoning_context,
    )


def _build_deterministic_explanation(
    evidence: MachPulseEvidence,
    allowed_action: RecommendedAction,
    evidence_sufficient: bool,
    limitations: list[str],
) -> AiExplanation:
    a = evidence.anomaly
    decision = evidence.decision.ml_decision
    state = evidence.observation.operating_state.upper()
    contributor_names = [c.feature for c in evidence.contributors[:3]]
    headroom = (
        f"{a.anomaly_proximity_index_pct:.1f}%"
        if a.anomaly_proximity_index_pct is not None
        else "unavailable"
    )

    if not evidence_sufficient:
        summary = (
            "Telemetry quality is insufficient to assess machine condition for this observation "
            f"(window coverage {evidence.data_quality.window_coverage * 100:.0f}%, "
            f"threshold {evidence.data_quality.min_window_coverage_threshold * 100:.0f}%)."
        )
        why = (
            "The data quality gate did not pass, so the anomaly distance is not treated as a "
            "reliable condition signal. MachPulse returns INSUFFICIENT EVIDENCE rather than a "
            "condition assessment."
        )
        evidence_points = [
            f"Window coverage: {evidence.data_quality.window_coverage * 100:.0f}% (gate requires >= {evidence.data_quality.min_window_coverage_threshold * 100:.0f}%).",
            f"Operating state at observation: {state}.",
            f"Dataset missing time: {evidence.data_quality.dataset_missing_percentage:.1f}% across {evidence.data_quality.documented_gaps_count} documented gaps.",
        ]
        what_to_check = [
            "Review telemetry window coverage and continuity for this period.",
            "Collect additional continuous telemetry before re-evaluating machine condition.",
        ]
        confidence = (
            "This restates the deterministic MachPulse data-quality gate. It is not a prediction "
            "and carries no numeric confidence."
        )
        return AiExplanation(
            summary=summary,
            why=why,
            evidence_points=evidence_points,
            what_to_check=what_to_check,
            recommended_action="INSUFFICIENT_EVIDENCE",
            confidence_statement=confidence,
            limitations=limitations,
        )

    # sufficient -> MONITOR / INSPECT / MAINTAIN
    summary = (
        f"MachPulse decision is {decision} with the compressor {state}. "
        f"Anomaly headroom {headroom} to calibrated severe boundary (Mahalanobis distance {a.mahalanobis_distance:.2f})."
    )

    if decision == "MONITOR":
        why = (
            f"The multivariate anomaly distance ({a.mahalanobis_distance:.2f}) is below the "
            f"calibrated inspection threshold ({a.elevated_threshold:.2f}), so the machine is "
            "reported as within its expected operating pattern."
        )
        what_to_check = [
            "Continue standard telemetry observation; no component inspection is indicated.",
            "Re-review if anomaly headroom falls toward the inspection threshold.",
        ]
    elif decision == "INSPECT":
        why = (
            f"The anomaly distance ({a.mahalanobis_distance:.2f}) meets or exceeds the calibrated "
            f"inspection threshold ({a.elevated_threshold:.2f}), with persistence and multi-sensor "
            f"agreement. Top model contributors: {', '.join(contributor_names) or 'n/a'}."
        )
        what_to_check = _guided_checks(evidence)
    else:  # MAINTAIN
        why = (
            f"The anomaly distance ({a.mahalanobis_distance:.2f}) meets or exceeds the calibrated "
            f"severe threshold ({a.severe_threshold:.2f}) with persistence. Top model "
            f"contributors: {', '.join(contributor_names) or 'n/a'}."
        )
        what_to_check = _guided_checks(evidence) + [
            "Schedule a maintenance action and record findings on completion.",
        ]

    evidence_points = [
        f"Mahalanobis distance {a.mahalanobis_distance:.2f} vs inspection {a.elevated_threshold:.2f} / severe {a.severe_threshold:.2f}.",
        f"Anomaly headroom: {headroom} (headroom to calibrated severe boundary).",
        f"Operating state: {state}; window coverage {evidence.data_quality.window_coverage * 100:.0f}%.",
        f"Recent buffer distance trend: {evidence.patterns.recent_distance_direction}.",
    ]
    for c in evidence.contributors[:3]:
        evidence_points.append(
            f"Model contributor {c.feature}: relative weight {c.relative_weight_pct}%."
        )

    confidence = (
        "This explanation restates the deterministic, state-stratified statistical decision made "
        "by the MachPulse ML pipeline. It adds no independent prediction and no numeric confidence."
    )

    return AiExplanation(
        summary=summary,
        why=why,
        evidence_points=evidence_points[:6],
        what_to_check=what_to_check[:6],
        recommended_action=allowed_action,
        confidence_statement=confidence,
        limitations=limitations,
    )


def _guided_checks(evidence: MachPulseEvidence) -> list[str]:
    out: list[str] = []
    for g in evidence.maintenance.inspection_directions:
        checks = g.get("what_to_check") or []
        first = checks[0] if checks else None
        signal = g.get("signal", "model contributor")
        if first:
            out.append(f"{signal}: {first}. Verify against the approved maintenance procedure.")
    if not out:
        out.append(
            "Review the top model contributors against the approved maintenance procedure; "
            "do not assume a component fault before physical verification."
        )
    return out
