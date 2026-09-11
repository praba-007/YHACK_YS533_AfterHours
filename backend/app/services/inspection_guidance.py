"""
Deterministic signal -> inspection-direction mapping.

This is fixed physical-domain knowledge about the MetroPT-3 compressor's
pneumatic / thermal / drive subsystems (the same directional checks already
surfaced in the Maintenance screen). It is not generated, not model output,
and contains no fabricated procedures, part numbers, or costs - only "which
subsystem to look at and what to record". Used by the deterministic fallback
explanation and included in the evidence handed to the LLM.
"""
from __future__ import annotations

_GUIDANCE: dict[str, dict[str, object]] = {
    "H1": {
        "signal": "H1 separator / air-dryer filter differential",
        "subsystem": "Pneumatic treatment",
        "why": "Statistical divergence in the H1 differential pressure across the separator and adsorption dryer stage.",
        "what_to_check": [
            "Separator filter differential pressure",
            "Condensation drain valves and drained volume",
            "Pressure drop across the drying tower / desiccant condition",
        ],
        "what_to_record": "Filter differential, drainage volume, and any sign of desiccant oil contamination.",
    },
    "TP2": {
        "signal": "TP2 compressor discharge pressure",
        "subsystem": "Compressor discharge path",
        "why": "Divergence in compressor head discharge pressure relative to the operating-state baseline.",
        "what_to_check": [
            "Compressor discharge line and non-return check valve",
            "Unloader valve cycling and safety valve seats",
            "Transition timing between offloaded and loaded states",
        ],
        "what_to_record": "Discharge manifold pressure at peak load and check-valve sealing integrity.",
    },
    "TP3": {
        "signal": "TP3 pneumatic panel pressure",
        "subsystem": "Downstream reservoir demand",
        "why": "Divergence in downstream panel / reservoir pressure relative to the healthy baseline for this state.",
        "what_to_check": [
            "Panel and reservoir pressure regulation (cut-in / cut-out band)",
            "Downstream demand and any external consumers or leaks",
        ],
        "what_to_record": "Governed pressure band and time to recover after a load cycle.",
    },
    "DV": {
        "signal": "DV dryer discharge pressure",
        "subsystem": "Air dryer tower regeneration",
        "why": "Divergence in the air-dryer tower discharge pressure drop.",
        "what_to_check": [
            "Dryer tower changeover / regeneration cycle",
            "Purge orifice and tower exhaust muffler",
        ],
        "what_to_record": "Discharge pressure profile through a full tower changeover.",
    },
    "OIL": {
        "signal": "Oil temperature",
        "subsystem": "Lubrication and thermal circuit",
        "why": "Divergence in oil-temperature trajectory during continuous loading (note: subject to seasonal drift).",
        "what_to_check": [
            "Cooling radiator airflow and fin cleanliness",
            "Oil level and thermostatic bypass valve",
        ],
        "what_to_record": "Oil sight-glass level and temperature-rise slope during a continuous 10-minute load.",
    },
    "MOTOR": {
        "signal": "Motor current",
        "subsystem": "Drive motor and mechanical coupling",
        "why": "Divergence in electrical drive draw relative to operating-state load demand.",
        "what_to_check": [
            "Phase-current balance and terminal connection torque",
            "Mechanical resistance in bearings and coupling alignment",
        ],
        "what_to_record": "Phase current balance and any audible bearing roughness on an unpowered manual spin.",
    },
}

_DEFAULT_KEY = "H1"


def _family_of(feature_name: str) -> str:
    f = (feature_name or "").upper()
    if "H1" in f:
        return "H1"
    if "TP2" in f:
        return "TP2"
    if "TP3" in f:
        return "TP3"
    if "DV" in f:
        return "DV"
    if "OIL" in f or "TEMPERATURE" in f:
        return "OIL"
    if "MOTOR" in f or "CURRENT" in f:
        return "MOTOR"
    return _DEFAULT_KEY


def guidance_for_features(feature_names: list[str]) -> list[dict[str, object]]:
    """
    Ordered, de-duplicated inspection directions for the given contributing
    feature names. Falls back to the H1 pneumatic path when no name is
    recognised so the technician always gets a concrete starting point.
    """
    seen: set[str] = set()
    out: list[dict[str, object]] = []
    for name in feature_names or []:
        fam = _family_of(name)
        if fam in seen:
            continue
        seen.add(fam)
        out.append(dict(_GUIDANCE[fam]))
    if not out:
        out.append(dict(_GUIDANCE[_DEFAULT_KEY]))
    return out
