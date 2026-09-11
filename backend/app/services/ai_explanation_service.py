"""
Orchestrates one ``POST /api/ai/explain`` call.

    build evidence  ->  deterministic reasoning  ->  (LLM permitted?)
        -> yes: call provider -> validate -> use it, or fall back
        -> no : deterministic explanation

The ML decision is authoritative at every branch. The endpoint always returns a
structured, validated ``AiExplanation`` - it never surfaces raw or malformed
model text, and it never fails just because the LLM is down.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.models.ai import AiExplainMeta, AiExplainResponse, FallbackReason
from app.services.evidence_service import build_evidence, evidence_to_llm_payload
from app.services.llm.base import LLMUnavailableError
from app.services.llm.service import llm_service
from app.services.llm.system_instruction import (
    MACHPULSE_SYSTEM_INSTRUCTION,
    build_user_content,
)
from app.services.output_validator import parse_and_validate_llm_output
from app.services.reasoning_service import run_reasoning

logger = logging.getLogger("machpulse.ai")


def generate_ai_explanation(include_evidence: bool = True) -> AiExplainResponse:
    evidence = build_evidence()  # may raise FileNotFoundError -> handled in the API layer
    reasoning = run_reasoning(evidence)

    now = datetime.now(timezone.utc).isoformat()
    explanation = reasoning.deterministic_explanation
    mode: str = "deterministic_fallback"
    fallback_reason: FallbackReason | None = None
    provider_key = "deterministic"
    provider_label = "DETERMINISTIC"
    model_name = None

    if not reasoning.llm_invocation_allowed:
        # INSUFFICIENT EVIDENCE (or gate failed): never ask the model to guess.
        fallback_reason = reasoning.block_reason or "insufficient_evidence"  # type: ignore[assignment]
    elif not llm_service.is_enabled():
        fallback_reason = "llm_disabled"
    else:
        payload = evidence_to_llm_payload(evidence, reasoning.llm_reasoning_context)
        import json as _json

        user_content = build_user_content(_json.dumps(payload, ensure_ascii=False, indent=2))
        try:
            result = llm_service.explain(
                system_instruction=MACHPULSE_SYSTEM_INSTRUCTION,
                user_content=user_content,
            )
            validated, reject_reason = parse_and_validate_llm_output(result.text, reasoning)
            if validated is not None:
                explanation = validated
                mode = "llm"
                provider_key = result.provider
                provider_label = result.provider.upper()
                model_name = result.model
            else:
                fallback_reason = reject_reason or "invalid_output"  # type: ignore[assignment]
                logger.info("LLM output rejected (%s); serving deterministic explanation.", fallback_reason)
        except LLMUnavailableError as exc:
            fallback_reason = "provider_unavailable"
            if "timed out" in str(exc).lower() or "timeout" in str(exc).lower():
                fallback_reason = "timeout"
            logger.info("LLM unavailable (%s); serving deterministic explanation.", exc)
        except Exception as exc:  # pragma: no cover - last-resort guard
            fallback_reason = "provider_exception"
            logger.warning("Unexpected AI explanation error: %s", exc)

    meta = AiExplainMeta(
        mode="llm" if mode == "llm" else "deterministic_fallback",
        provider=provider_key,
        provider_label=provider_label,
        model=model_name,
        fallback_reason=fallback_reason,
        ml_decision=reasoning.ml_decision,
        evidence_sufficient=reasoning.evidence_sufficient,
        llm_invocation_allowed=reasoning.llm_invocation_allowed,
        generated_at=now,
    )

    return AiExplainResponse(
        explanation=explanation,
        meta=meta,
        evidence=evidence.model_dump() if include_evidence else None,
    )
