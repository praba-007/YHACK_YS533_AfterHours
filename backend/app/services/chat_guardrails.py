"""
Phase 5A - text guardrails for the conversational assistant.

Chat replies are prose, not JSON, so the Phase 4 ``output_validator`` JSON
parser is *not* reused here. The *concepts* are reused:

  * the forbidden-content patterns (RUL / time-to-failure / failure-probability
    / numeric-confidence) - re-declared here as a superset;
  * the "the model may not change the ML decision" rule - implemented as an
    escalation / de-escalation detector keyed to the authoritative decision.

Plus chat-specific fabrication checks: invented sensor channels, invented
numeric readings that contradict the evidence, spare-part numbers, costs, and
maintenance history asserted as fact when none was supplied.

``validate_chat_reply`` returns ``(clean_text, None)`` on success or
``(None, reason)`` on rejection. ``reason`` is always one of the values already
allowed by ``AiExplainMeta.fallback_reason`` so the response model validates:
``"invalid_output"``, ``"forbidden_content"``, ``"llm_attempted_override"``.
"""
from __future__ import annotations

import re
from typing import Optional

from app.services.evidence_service import MachPulseEvidence
from app.services.reasoning_service import ReasoningResult

MAX_REPLY_CHARS = 4000
MIN_REPLY_CHARS = 1

# --------------------------------------------------------------------------- #
# 1. Forbidden content - prediction / probability / confidence language.
#    (Superset of output_validator._FORBIDDEN_PATTERNS; kept local on purpose.)
# --------------------------------------------------------------------------- #
_FORBIDDEN_PATTERNS = [
    r"remaining useful life",
    r"\bRUL\b",
    r"time[\s-]*to[\s-]*failure",
    r"\b\d+\s*(?:hours?|days?|weeks?|months?|years?)\s+(?:until|to|before|left|remaining)\b.{0,40}fail",
    r"\bfail(?:ure|s)?\s+(?:in|within|by|on|after)\s+(?:about\s+|approximately\s+|~\s*)?\d",
    r"\b\d+(?:\.\d+)?\s*%\s*(?:chance|probability|likelihood|risk|confidence)\b",
    r"probability\s+of\s+(?:failure|breakdown)",
    r"likelihood\s+of\s+(?:failure|breakdown)\s+is",
    r"failure\s+is\s+(?:imminent|certain|guaranteed|inevitable|expected within)",
    r"will\s+(?:definitely\s+)?fail\s+(?:on|by|in|within|soon|shortly)",
    r"the machine (?:definitely|certainly|clearly) has\b",
    r"confidence\s*(?:score|level|of)?\s*[:=]?\s*\d",
    r"\b\d{1,3}\s*%\s*confiden",
    r"\bMTBF\b",
    r"\bmean time (?:between|to) failure\b",
]
_FORBIDDEN_RE = [re.compile(p, re.IGNORECASE) for p in _FORBIDDEN_PATTERNS]

# --------------------------------------------------------------------------- #
# 2. Fabrication smells.
# --------------------------------------------------------------------------- #
# Sensor channels / diagnostics that do NOT exist in the MetroPT-3 dataset.
_PHANTOM_SIGNAL_RE = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"\bvibration\b",
        r"\baccelerometer\b",
        r"\bmm/s\b",
        r"\bRPM\b",
        r"\brotational speed\b",
        r"\bFFT\b",
        r"\bBPFO\b",
        r"\bBPFI\b",
        r"\bharmonic\b",
        r"\bbearing (?:temperature|frequency|defect)\b",
        r"\bspectral\b",
        r"\bISO\s*10816\b",
    ]
]

# Spare parts / costs / catalogue references.
_PARTS_COST_RE = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"\bpart\s*(?:no\.?|number|#|id)\s*[:#-]?\s*\w",
        r"\bp/?n\s*[:#-]?\s*\w",
        r"\bSKU\b",
        r"\bcatalog(?:ue)?\s*(?:no\.?|number)\b",
        r"\bOEM part\b",
        r"\border (?:part|kit|seal|filter|bearing) \w",
        r"\$\s?\d",
        r"\b\d+(?:[.,]\d+)?\s*(?:USD|EUR|GBP|dollars|euros)\b",
        r"\b(?:cost|price|quote)\s+(?:is|of|:)\s*\$?\d",
    ]
]

# Maintenance history asserted as fact.
_HISTORY_ASSERTION_RE = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"\b(?:last|previous|prior|the recent)\s+(?:maintenance|service|inspection|overhaul)\s+(?:was\s+)?(?:performed|completed|carried out|done|logged|recorded)\b",
        r"\bwas\s+(?:last\s+)?serviced\s+(?:on|in)\b",
        r"\btechnician\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b",
        r"\baccording to (?:the|your) (?:maintenance|service) (?:log|record|history)\b",
        r"\bthe work order\b",
    ]
]

# --------------------------------------------------------------------------- #
# 3. Decision escalation / de-escalation (the model cannot move the decision).
# --------------------------------------------------------------------------- #
_DIRECTIVE_LEAD = (
    r"(?:you (?:should|must|need to|have to)|i (?:recommend|advise|suggest)|"
    r"please|it is (?:necessary|essential|critical|urgent|important) to|"
    r"immediately|right away|as soon as possible|without delay|urgently)"
)
_MAINTAIN_ACTIONS = (
    r"(?:maintain|perform maintenance|schedule maintenance|repair|replace|"
    r"overhaul|dismantle|rebuild|shut ?down|shut the (?:machine|compressor|unit) down|"
    r"take (?:the (?:machine|compressor|unit)|it) offline|stop the (?:machine|compressor|unit))"
)
_INSPECT_ACTIONS = r"(?:inspect|open up|strip down|dismantle for inspection)"

_ESCALATE_TO_MAINTAIN_RE = re.compile(
    rf"{_DIRECTIVE_LEAD}\b(?:\W+\w+){{0,6}}?\W+{_MAINTAIN_ACTIONS}", re.IGNORECASE
)
_ESCALATE_TO_INSPECT_RE = re.compile(
    rf"{_DIRECTIVE_LEAD}\b(?:\W+\w+){{0,6}}?\W+{_INSPECT_ACTIONS}", re.IGNORECASE
)
_EMERGENCY_RE = re.compile(
    r"\b(?:emergency|immediate|urgent)\s+(?:maintenance|repair|replacement|shutdown|shut ?down|action)\b",
    re.IGNORECASE,
)
_DEESCALATE_RE = re.compile(
    r"\b(?:no (?:maintenance|inspection|action) (?:is )?(?:needed|required|necessary)|"
    r"safe to (?:keep )?(?:run|operate|continue)(?:ning)?(?:\s+indefinitely)?|"
    r"do not (?:need to )?(?:inspect|maintain|service)|"
    r"you can ignore (?:this|the alert|the anomaly)|"
    r"disregard the (?:decision|recommendation|alert))\b",
    re.IGNORECASE,
)
# Explicitly naming a different decision token as the recommendation.
_DECISION_TOKENS = ("MONITOR", "INSPECT", "MAINTAIN")


def _strip_code_fence(text: str) -> str:
    t = text.strip()
    t = re.sub(r"^\s*```[a-zA-Z]*\s*", "", t)
    t = re.sub(r"\s*```\s*$", "", t)
    return t.strip()


def _first_forbidden(text: str) -> Optional[str]:
    for rx in _FORBIDDEN_RE:
        if rx.search(text):
            return rx.pattern
    return None


def _fabrication_hit(text: str, evidence: MachPulseEvidence, history_supplied: bool) -> Optional[str]:
    for rx in _PHANTOM_SIGNAL_RE:
        if rx.search(text):
            return f"phantom-signal:{rx.pattern}"
    for rx in _PARTS_COST_RE:
        if rx.search(text):
            return f"parts-or-cost:{rx.pattern}"
    if not history_supplied:
        for rx in _HISTORY_ASSERTION_RE:
            if rx.search(text):
                return f"asserted-history:{rx.pattern}"
    mismatch = _sensor_value_mismatch(text, evidence)
    if mismatch:
        return mismatch
    return None


# Recognised current-reading phrasings, e.g. "H1 is 2.1 bar", "TP2 reads -0.01 bar",
# "oil temperature is currently 95 c", "motor current sits at 7.4 a".
_SENSOR_CLAIM_RE = re.compile(
    r"\b(motor current|oil temperature|tp2|tp3|h1|dv[_ ]?pressure)\b"
    r"[^.\n]{0,40}?\b(?:is|reads?|reading|sits at|currently|measured at|of)\b"
    r"[^.\n]{0,12}?(-?\d+(?:\.\d+)?)\s*(bar|deg\s?c|°\s?c|c|a|amps?|amperes?)\b",
    re.IGNORECASE,
)
_CHANNEL_MAP = {
    "motor current": ("motor_current_amps", ("a", "amp", "amps", "ampere", "amperes")),
    "oil temperature": ("oil_temperature_c", ("c", "deg c", "degc", "°c", "° c")),
    "tp2": ("tp2_bar", ("bar",)),
    "tp3": ("tp3_bar", ("bar",)),
    "h1": ("h1_bar", ("bar",)),
    "dv pressure": ("dv_pressure_bar", ("bar",)),
    "dv_pressure": ("dv_pressure_bar", ("bar",)),
}


def _sensor_value_mismatch(text: str, evidence: MachPulseEvidence) -> Optional[str]:
    sensors = evidence.sensors
    for m in _SENSOR_CLAIM_RE.finditer(text):
        channel = m.group(1).lower().replace("  ", " ")
        try:
            stated = float(m.group(2))
        except ValueError:
            continue
        mapping = _CHANNEL_MAP.get(channel)
        if not mapping:
            continue
        attr, _units = mapping
        actual = getattr(sensors, attr, None)
        if actual is None:
            continue
        # Conservative: only flag a blatant contradiction.
        if abs(stated - float(actual)) > max(5.0, 3.0 * abs(float(actual))):
            return f"sensor-mismatch:{channel} stated {stated} vs evidence {actual}"
    return None


def _decision_override_hit(text: str, allowed_action: str) -> Optional[str]:
    """
    allowed_action is one of MONITOR / INSPECT / MAINTAIN / INSUFFICIENT_EVIDENCE.
    """
    if _EMERGENCY_RE.search(text) and allowed_action != "MAINTAIN":
        return "emergency-directive"

    if allowed_action in ("MONITOR",):
        if _ESCALATE_TO_MAINTAIN_RE.search(text):
            return "escalate-monitor->maintain"
        if _ESCALATE_TO_INSPECT_RE.search(text):
            return "escalate-monitor->inspect"
    if allowed_action == "INSPECT":
        if _ESCALATE_TO_MAINTAIN_RE.search(text):
            return "escalate-inspect->maintain"
    if allowed_action == "MAINTAIN":
        if _DEESCALATE_RE.search(text):
            return "deescalate-maintain"
    if allowed_action in ("MONITOR", "INSPECT") and _DEESCALATE_RE.search(text):
        # de-escalation is only ever "safe" when the ML already says MONITOR;
        # telling the technician to ignore an INSPECT is still an override.
        if allowed_action == "INSPECT":
            return "deescalate-inspect"

    # Naming a stronger decision token as the recommendation.
    lowered_allowed = allowed_action.replace("_", " ").lower()
    for tok in _DECISION_TOKENS:
        if tok.lower() == lowered_allowed:
            continue
        if re.search(
            rf"\b(?:recommend|recommending|advise|the (?:correct|right) (?:action|decision) is|"
            rf"this should be|change (?:it|the decision) to|escalate to)\W+{tok}\b",
            text,
            re.IGNORECASE,
        ):
            # Allow MAINTAIN reply to name MONITOR only in a negation ("not MONITOR");
            # keep it simple: any explicit "recommend <other token>" is an override.
            return f"names-decision:{tok}"
    return None


def validate_chat_reply(
    raw_text: str,
    reasoning: ReasoningResult,
    evidence: MachPulseEvidence,
    *,
    maintenance_history_supplied: bool,
) -> tuple[Optional[str], Optional[str]]:
    """
    Returns (clean_reply, None) if the reply is safe to surface, or
    (None, reason) if it must be replaced by the deterministic fallback.
    """
    if not isinstance(raw_text, str):
        return None, "invalid_output"

    text = _strip_code_fence(raw_text)
    if len(text) < MIN_REPLY_CHARS:
        return None, "invalid_output"
    if len(text) > MAX_REPLY_CHARS:
        text = text[:MAX_REPLY_CHARS].rstrip() + "..."

    forbidden = _first_forbidden(text)
    if forbidden:
        return None, "forbidden_content"

    fabricated = _fabrication_hit(text, evidence, maintenance_history_supplied)
    if fabricated:
        return None, "forbidden_content"

    override = _decision_override_hit(text, reasoning.allowed_recommended_action)
    if override:
        return None, "llm_attempted_override"

    return text, None
