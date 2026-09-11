"""
Validate a raw LLM response into a trustworthy ``AiExplanation``.

The frontend never sees unvalidated model text. If any check fails this
returns ``(None, reason)`` and the caller serves the deterministic
explanation instead.

Hard guarantees enforced here (not merely requested in the prompt):
  * valid JSON of the exact expected shape;
  * ``recommended_action`` equals the deterministic
    ``allowed_recommended_action`` - any mismatch is treated as an override
    attempt and rejected;
  * no RUL / time-to-failure / failure-probability / numeric-confidence
    language anywhere in the text;
  * list and string lengths are clamped;
  * every mandatory limitation is present.
"""
from __future__ import annotations

import json
import re
from typing import Any

from app.models.ai import AiExplanation
from app.services.reasoning_service import ReasoningResult

_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)

_FORBIDDEN_PATTERNS = [
    r"remaining useful life",
    r"\bRUL\b",
    r"time[\s-]*to[\s-]*failure",
    r"\b\d+\s*(?:hours?|days?|weeks?|months?)\s+(?:until|to|before|left|remaining)\b.*fail",
    r"\bfail(?:ure)?\s+(?:in|within|by|on)\s+\d+",
    r"\b\d+(?:\.\d+)?\s*%\s*(?:chance|probability|likelihood|risk)\s+of\s+fail",
    r"probability\s+of\s+failure",
    r"failure\s+is\s+(?:imminent|certain|guaranteed|likely within)",
    r"will\s+fail\s+(?:on|by|in|within|soon)",
    r"confidence\s*(?:score|level)?\s*[:=]?\s*\d",
    r"\b\d{1,3}\s*%\s*confiden",
]
_FORBIDDEN_RE = [re.compile(p, re.IGNORECASE) for p in _FORBIDDEN_PATTERNS]

_MAX_LIST = 6
_MAX_SHORT = 320
_MAX_LONG = 800
_VALID_ACTIONS = {"MONITOR", "INSPECT", "MAINTAIN", "INSUFFICIENT_EVIDENCE"}


def _strip_fence(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = _FENCE_RE.sub("", t)
    # Grab the outermost JSON object if the model added stray prose.
    start = t.find("{")
    end = t.rfind("}")
    if start != -1 and end != -1 and end > start:
        return t[start : end + 1]
    return t


def _clamp_str(value: Any, limit: int) -> str:
    s = str(value or "").strip()
    return s[:limit]


def _clamp_list(value: Any, item_limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value[:_MAX_LIST]:
        s = _clamp_str(item, item_limit)
        if s:
            out.append(s)
    return out


def _has_forbidden(*texts: str) -> str | None:
    blob = "\n".join(texts)
    for rx in _FORBIDDEN_RE:
        if rx.search(blob):
            return rx.pattern
    return None


def parse_and_validate_llm_output(
    raw_text: str, reasoning: ReasoningResult
) -> tuple[AiExplanation | None, str | None]:
    try:
        data = json.loads(_strip_fence(raw_text))
    except (json.JSONDecodeError, TypeError):
        return None, "invalid_output"

    if not isinstance(data, dict):
        return None, "invalid_output"

    action = str(data.get("recommended_action", "")).strip().upper().replace(" ", "_")
    if action == "INSUFFICIENT_EVIDENCE_" or action == "INSUFFICIENTEVIDENCE":
        action = "INSUFFICIENT_EVIDENCE"
    if action not in _VALID_ACTIONS:
        return None, "invalid_output"

    # The single hardest guarantee: the model cannot change the decision.
    if action != reasoning.allowed_recommended_action:
        return None, "llm_attempted_override"

    summary = _clamp_str(data.get("summary"), _MAX_SHORT)
    why = _clamp_str(data.get("why"), _MAX_LONG)
    confidence = _clamp_str(data.get("confidence_statement"), _MAX_SHORT)
    evidence_points = _clamp_list(data.get("evidence_points"), _MAX_SHORT)
    what_to_check = _clamp_list(data.get("what_to_check"), _MAX_SHORT)
    limitations = _clamp_list(data.get("limitations"), _MAX_SHORT)

    if not summary or not why:
        return None, "invalid_output"

    forbidden = _has_forbidden(
        summary, why, confidence, *evidence_points, *what_to_check, *limitations
    )
    if forbidden:
        return None, "forbidden_content"

    # Guarantee every mandatory limitation is present (append any the model dropped).
    lowered = {l.lower() for l in limitations}
    for mand in reasoning.mandatory_limitations:
        if not any(mand.lower()[:40] in existing for existing in lowered):
            limitations.append(mand)
    limitations = limitations[: _MAX_LIST + len(reasoning.mandatory_limitations)]

    if not what_to_check:
        what_to_check = list(reasoning.deterministic_explanation.what_to_check)
    if not evidence_points:
        evidence_points = list(reasoning.deterministic_explanation.evidence_points)

    try:
        explanation = AiExplanation(
            summary=summary,
            why=why,
            evidence_points=evidence_points,
            what_to_check=what_to_check,
            recommended_action=action,  # == allowed action, checked above
            confidence_statement=confidence
            or reasoning.deterministic_explanation.confidence_statement,
            limitations=limitations,
        )
    except Exception:
        return None, "invalid_output"

    return explanation, None
