"""
Phase 4 AI explanation endpoint.

    POST /api/ai/explain   -> evidence-grounded, structured technician explanation
    GET  /api/ai/status    -> which provider will answer (for the UI badge)

No ML is computed here. This route reads the existing ML service outputs,
builds the evidence object, runs the deterministic safety layer, and - only
when permitted - asks the configured LLM provider to phrase the explanation.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.ai import (
    AiChatRequest,
    AiChatResponse,
    AiExplainRequest,
    AiExplainResponse,
    AiStatusResponse,
)
from app.services.ai_chat_service import generate_ai_chat
from app.services.ai_explanation_service import generate_ai_explanation
from app.services.llm.service import llm_service
from app.services.llm.settings import get_llm_settings

router = APIRouter(prefix="/ai", tags=["AI Explanation"])


@router.post("/explain", response_model=AiExplainResponse)
async def explain(body: AiExplainRequest | None = None) -> AiExplainResponse:
    """
    Return a structured, validated explanation of the current MachPulse
    decision. Always succeeds with a deterministic explanation when the LLM is
    disabled, unavailable, or returns invalid output; returns 503 only when the
    underlying ML pipeline artifacts cannot be read.
    """
    include_evidence = body.include_evidence if body is not None else True
    try:
        return generate_ai_explanation(include_evidence=include_evidence)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"MachPulse ML pipeline artifacts are unavailable: {exc}",
        )


@router.post("/chat", response_model=AiChatResponse)
async def chat(body: AiChatRequest) -> AiChatResponse:
    """
    Conversational interpretation of the current MachPulse evidence (Phase 5A).

    The ML decision stays authoritative: the assistant explains it and may
    discuss checks the MachPulse evidence already supports, but it cannot
    change MONITOR / INSPECT / MAINTAIN, produce RUL / failure-probability /
    confidence language, or invent sensor values, spare parts, or maintenance
    history. On INSUFFICIENT EVIDENCE, or when the LLM is disabled / unavailable
    / returns unsafe text, a deterministic fallback reply is returned with
    valid metadata. Returns 503 only when the ML pipeline artifacts cannot be
    read.
    """
    try:
        return generate_ai_chat(body)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"MachPulse ML pipeline artifacts are unavailable: {exc}",
        )


@router.get("/status", response_model=AiStatusResponse)
async def status() -> AiStatusResponse:
    settings = get_llm_settings()
    return AiStatusResponse(
        provider=llm_service.provider_key(),
        provider_label=llm_service.provider_label(),
        enabled=llm_service.is_enabled(),
        model=llm_service.model_name(),
        configured_provider=settings.normalized_provider,
    )
