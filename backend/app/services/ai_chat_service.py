"""
Phase 5A - conversational orchestrator for POST /api/ai/chat.

    request
      -> build_evidence()          (Phase 4, reused - no ML recomputed)
      -> run_reasoning()           (Phase 4, reused - authoritative decision)
      -> bounded conversation context
      -> LLM provider              (Phase 4 llm_service, reused - single call)
      -> chat_guardrails.validate_chat_reply()
      -> safe AiChatResponse       (deterministic fallback on any failure)

No raw dataset access. No pipeline JSON read. No ML recomputation. The LLM
provider abstraction is not modified - bounded history is flattened into the
existing single ``user_content`` string.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.models.ai import (
    AiChatRequest,
    AiChatResponse,
    AiExplainMeta,
    ChatMessage,
    MaintenanceHistoryItem,
)
from app.services.chat_guardrails import validate_chat_reply
from app.services.evidence_service import build_evidence, evidence_to_llm_payload
from app.services.llm.base import LLMUnavailableError
from app.services.llm.chat_instruction import (
    MACHPULSE_CHAT_SYSTEM_INSTRUCTION,
    build_chat_user_content,
)
from app.services.llm.service import llm_service
from app.services.reasoning_service import run_reasoning

logger = logging.getLogger("machpulse.ai.chat")

# ---- context bounds (user-controlled input is never unbounded) -------------
MAX_HISTORY_TURNS = 12          # ~6 exchanges
MAX_MESSAGE_CHARS = 2000
MAX_HISTORY_MSG_CHARS = 1200
MAX_MAINT_ITEMS = 20
MAX_MAINT_FIELD_CHARS = 500


# --------------------------------------------------------------------------- #
# Bounding
# --------------------------------------------------------------------------- #
def _bound_history(history: list[ChatMessage]) -> list[dict[str, str]]:
    trimmed = history[-MAX_HISTORY_TURNS:]
    out: list[dict[str, str]] = []
    for m in trimmed:
        role = m.role if m.role in ("user", "assistant") else "user"
        content = (m.content or "").strip()[:MAX_HISTORY_MSG_CHARS]
        if content:
            out.append({"role": role, "content": content})
    return out


def _clip_field(value: Any) -> Any:
    if isinstance(value, str):
        return value.strip()[:MAX_MAINT_FIELD_CHARS]
    return value


def _bound_maintenance(items: list[MaintenanceHistoryItem]) -> list[dict[str, Any]]:
    trimmed = items[-MAX_MAINT_ITEMS:]
    out: list[dict[str, Any]] = []
    for it in trimmed:
        d = it.model_dump()
        bounded: dict[str, Any] = {}
        for k, v in d.items():
            if isinstance(v, dict):
                bounded[k] = {
                    kk: _clip_field(vv) for kk, vv in list(v.items())[:12]
                }
            else:
                bounded[k] = _clip_field(v)
        out.append(bounded)
    return out


# --------------------------------------------------------------------------- #
# Deterministic fallback replies
# --------------------------------------------------------------------------- #
def _insufficient_reply(evidence, reasoning) -> str:
    dq = evidence.data_quality
    return (
        "The current MachPulse evidence is insufficient to assess machine condition, so I "
        "cannot offer a diagnosis for this observation.\n\n"
        f"Why: the telemetry window coverage is {dq.window_coverage * 100:.0f}%, below the "
        f"quality gate's {dq.min_window_coverage_threshold * 100:.0f}% requirement"
        + (
            f". Across the dataset there are {dq.documented_gaps_count} documented gaps "
            f"({dq.total_gap_hours:.1f} hours of missing wall-clock time)."
            if dq.documented_gaps_count
            else "."
        )
        + "\n\nWhat would help: a continuous, complete telemetry window (no long gaps or frozen "
        "channels) covering the same operating state, after which MachPulse can re-evaluate. "
        "Until then the decision stays INSUFFICIENT EVIDENCE."
    )


def _unavailable_reply(evidence, reasoning, maintenance_count: int) -> str:
    decision = reasoning.ml_decision
    urgency = evidence.decision.operational_urgency
    rec = evidence.maintenance.existing_recommended_action
    hist_line = (
        f"{maintenance_count} technician-recorded maintenance item(s) were supplied with this request."
        if maintenance_count
        else "No recorded maintenance history was provided with this request."
    )
    return (
        "I can interpret the current MachPulse evidence, but the language model is currently "
        "unavailable.\n\n"
        f"The current ML decision is {decision} (operational urgency: {urgency}). "
        f"MachPulse's existing recommendation: {rec}\n\n"
        f"{hist_line}\n\n"
        "Please use the structured diagnostic explanation (Diagnostics screen / "
        "POST /api/ai/explain) and the available telemetry to continue the assessment."
    )


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #
def generate_ai_chat(request: AiChatRequest) -> AiChatResponse:
    evidence = build_evidence()          # may raise FileNotFoundError -> API layer -> 503
    reasoning = run_reasoning(evidence)

    now = datetime.now(timezone.utc).isoformat()
    bounded_history = _bound_history(request.history)
    bounded_maint = _bound_maintenance(request.maintenance_history)
    message = (request.message or "").strip()[:MAX_MESSAGE_CHARS]

    ml_decision = reasoning.ml_decision
    structured_context: dict[str, Any] = {
        "machine": evidence.machine.model_dump(),
        "observation": evidence.observation.model_dump(),
        "decision": evidence.decision.model_dump(),
        "anomaly": evidence.anomaly.model_dump(),
        "data_quality": evidence.data_quality.model_dump(),
        "contributors": [c.model_dump() for c in evidence.contributors],
        "existing_recommended_action": evidence.maintenance.existing_recommended_action,
        "allowed_recommended_action": reasoning.allowed_recommended_action,
        "mandatory_limitations": reasoning.mandatory_limitations,
        "maintenance_history_items_considered": len(bounded_maint),
        "conversation_turns_considered": len(bounded_history),
    }

    mode = "deterministic_fallback"
    fallback_reason: str | None = None
    provider_key = "deterministic"
    provider_label = "DETERMINISTIC"
    model_name: str | None = None

    if not message:
        reply = (
            "Ask a question about the current MachPulse evidence for this compressor and I will "
            f"interpret it. The current ML decision is {ml_decision}."
        )
        fallback_reason = "invalid_output"
    elif not reasoning.llm_invocation_allowed:
        # INSUFFICIENT EVIDENCE / failed quality gate: never ask the model to guess.
        reply = _insufficient_reply(evidence, reasoning)
        fallback_reason = reasoning.block_reason or "insufficient_evidence"
    elif not llm_service.is_enabled():
        reply = _unavailable_reply(evidence, reasoning, len(bounded_maint))
        fallback_reason = "llm_disabled"
    else:
        payload = evidence_to_llm_payload(evidence, reasoning.llm_reasoning_context)
        payload["technician_recorded_maintenance_history"] = bounded_maint
        payload["maintenance_history_note"] = (
            "Technician-recorded context only. Not verified machine truth. Do not invent entries."
        )
        user_content = build_chat_user_content(
            payload, bounded_history, message, max_message_chars=MAX_MESSAGE_CHARS
        )
        try:
            result = llm_service.explain(
                system_instruction=MACHPULSE_CHAT_SYSTEM_INSTRUCTION,
                user_content=user_content,
            )
            clean, reject = validate_chat_reply(
                result.text,
                reasoning,
                evidence,
                maintenance_history_supplied=bool(bounded_maint),
            )
            if clean is not None:
                reply = clean
                mode = "llm"
                provider_key = result.provider
                provider_label = result.provider.upper()
                model_name = result.model
            else:
                reply = _unavailable_reply(evidence, reasoning, len(bounded_maint))
                fallback_reason = reject or "invalid_output"
                logger.info("Chat reply rejected (%s); serving deterministic fallback.", fallback_reason)
        except LLMUnavailableError as exc:
            reply = _unavailable_reply(evidence, reasoning, len(bounded_maint))
            msg = str(exc).lower()
            fallback_reason = "timeout" if ("timeout" in msg or "timed out" in msg) else "provider_unavailable"
            logger.info("Chat LLM unavailable (%s); serving deterministic fallback.", exc)
        except Exception as exc:  # pragma: no cover - last-resort guard
            reply = _unavailable_reply(evidence, reasoning, len(bounded_maint))
            fallback_reason = "provider_exception"
            logger.warning("Unexpected chat error: %s", exc)

    meta = AiExplainMeta(
        mode="llm" if mode == "llm" else "deterministic_fallback",
        provider=provider_key,
        provider_label=provider_label,
        model=model_name,
        fallback_reason=fallback_reason,  # always within the AiExplainMeta Literal
        ml_decision=ml_decision,
        evidence_sufficient=reasoning.evidence_sufficient,
        llm_invocation_allowed=reasoning.llm_invocation_allowed,
        generated_at=now,
    )

    return AiChatResponse(reply=reply, meta=meta, structured_context=structured_context)
