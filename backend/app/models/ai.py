"""
Pydantic response models for the Phase 4 AI explanation endpoint.

The frontend depends on this structured shape, never on free-form model text.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

RecommendedAction = Literal["MONITOR", "INSPECT", "MAINTAIN", "INSUFFICIENT_EVIDENCE"]

FallbackReason = Literal[
    "insufficient_evidence",
    "llm_disabled",
    "provider_unavailable",
    "timeout",
    "invalid_output",
    "llm_attempted_override",
    "forbidden_content",
    "provider_exception",
]


class AiExplanation(BaseModel):
    summary: str
    why: str
    evidence_points: list[str] = Field(default_factory=list)
    what_to_check: list[str] = Field(default_factory=list)
    recommended_action: RecommendedAction
    confidence_statement: str
    limitations: list[str] = Field(default_factory=list)


class AiExplainMeta(BaseModel):
    # "llm" when a model wrote the explanation; "deterministic_fallback" otherwise.
    mode: Literal["llm", "deterministic_fallback"]
    # What actually answered: "claude" | "local" | "deterministic".
    provider: str
    # Short label for the UI badge: "CLAUDE" | "LOCAL" | "DETERMINISTIC".
    provider_label: str
    model: Optional[str] = None
    # Present only when mode == "deterministic_fallback".
    fallback_reason: Optional[FallbackReason] = None
    # The authoritative MachPulse decision (never produced by the LLM).
    ml_decision: str
    evidence_sufficient: bool
    llm_invocation_allowed: bool
    generated_at: str


class AiExplainResponse(BaseModel):
    explanation: AiExplanation
    meta: AiExplainMeta
    # Echo of the exact evidence object the explanation was grounded in
    # (omitted when include_evidence is false).
    evidence: Optional[dict[str, Any]] = None


class AiExplainRequest(BaseModel):
    include_evidence: bool = True


class AiStatusResponse(BaseModel):
    provider: str
    provider_label: str
    enabled: bool
    model: Optional[str] = None
    configured_provider: str


# --------------------------------------------------------------------------- #
# Phase 5 - Contextual technician conversation & follow-up
# --------------------------------------------------------------------------- #
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class MaintenanceHistoryItem(BaseModel):
    id: str
    actionType: str
    status: str
    createdAt: str
    completedAt: Optional[str] = None
    dueDate: Optional[str] = None
    notes: Optional[str] = None
    findings: Optional[dict[str, Any]] = None
    decisionAtCreation: Optional[str] = None
    anomalyDistanceAtCreation: Optional[float] = None
    operatingStateAtCreation: Optional[str] = None


class AiChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = Field(default_factory=list)
    maintenance_history: list[MaintenanceHistoryItem] = Field(default_factory=list)


class AiChatResponse(BaseModel):
    reply: str
    meta: AiExplainMeta
    structured_context: Optional[dict[str, Any]] = None

