"""
Environment-driven configuration for the Phase 4 AI explanation layer.

Kept in a dedicated module (rather than editing ``app/core/config.py``) so the
existing backend configuration surface is untouched. Everything here is read
from the process environment and has a safe default; nothing is required for
the backend to start or for the existing endpoints to work.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class LLMSettings:
    # "claude" | "gemini" | "local" | "none" (any unknown value is treated as "none")
    provider: str
    # Model id used by the active provider.
    model: str
    # Wall-clock budget for a single explanation call.
    timeout_seconds: float
    # Output ceiling for the explanation (the schema is small).
    max_tokens: int
    # Presence of an Anthropic credential in the environment.
    anthropic_api_key_present: bool
    # Presence of a Google Gemini credential in the environment.
    gemini_api_key_present: bool
    # OpenAI-compatible base URL for a future on-premise model, e.g.
    # "http://localhost:11434/v1". Empty => local provider is unavailable.
    local_base_url: str
    local_model: str
    local_api_key_present: bool

    @property
    def normalized_provider(self) -> str:
        p = (self.provider or "").strip().lower()
        return p if p in {"claude", "gemini", "local"} else "none"


@lru_cache(maxsize=1)
def get_llm_settings() -> LLMSettings:
    try:
        from dotenv import load_dotenv
        from pathlib import Path
        env_path = Path(__file__).resolve().parents[3] / ".env"
        if env_path.exists():
            load_dotenv(dotenv_path=env_path)
    except Exception:
        pass

    raw_provider = os.getenv("MACHPULSE_LLM_PROVIDER", "none").strip().lower()
    default_model = "gemini-2.5-flash" if raw_provider == "gemini" else "claude-opus-5"

    return LLMSettings(
        provider=os.getenv("MACHPULSE_LLM_PROVIDER", "none"),
        model=os.getenv("MACHPULSE_LLM_MODEL", default_model).strip() or default_model,
        timeout_seconds=_env_float("MACHPULSE_LLM_TIMEOUT_SECONDS", 20.0),
        max_tokens=_env_int("MACHPULSE_LLM_MAX_TOKENS", 1024),
        anthropic_api_key_present=bool(
            (os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN") or "").strip()
        ),
        gemini_api_key_present=bool((os.getenv("GEMINI_API_KEY") or "").strip()),
        local_base_url=os.getenv("MACHPULSE_LOCAL_LLM_BASE_URL", "").strip(),
        local_model=os.getenv("MACHPULSE_LOCAL_LLM_MODEL", "local-model").strip() or "local-model",
        local_api_key_present=bool(os.getenv("MACHPULSE_LOCAL_LLM_API_KEY")),
    )


def reset_llm_settings_cache() -> None:
    """Test hook: forget the cached snapshot so env changes take effect."""
    get_llm_settings.cache_clear()
