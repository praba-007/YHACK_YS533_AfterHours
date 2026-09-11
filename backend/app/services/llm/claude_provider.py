"""
Claude (Anthropic) provider.

The ``anthropic`` SDK is imported lazily so the backend runs, and every
existing endpoint keeps working, whether or not the package is installed. Any
failure - missing SDK, missing key, network error, timeout, unexpected
response shape - is converted to ``LLMUnavailableError`` so the caller falls
back to deterministic reasoning.
"""
from __future__ import annotations

import logging

from .base import LLMProvider, LLMResult, LLMUnavailableError
from .settings import get_llm_settings

logger = logging.getLogger("machpulse.llm.claude")


class ClaudeProvider(LLMProvider):
    name = "claude"

    def is_available(self) -> bool:
        settings = get_llm_settings()
        if not settings.anthropic_api_key_present:
            return False
        try:
            import anthropic  # noqa: F401
        except Exception:  # pragma: no cover - env without the SDK
            return False
        return True

    def generate(
        self,
        *,
        system_instruction: str,
        user_content: str,
        max_tokens: int,
        timeout_seconds: float,
    ) -> LLMResult:
        settings = get_llm_settings()

        try:
            import anthropic
        except Exception as exc:  # pragma: no cover
            raise LLMUnavailableError(f"anthropic SDK not installed: {exc}") from exc

        if not settings.anthropic_api_key_present:
            raise LLMUnavailableError("ANTHROPIC_API_KEY is not set")

        try:
            client = anthropic.Anthropic(timeout=timeout_seconds)
            message = client.messages.create(
                model=settings.model,
                max_tokens=max_tokens,
                system=system_instruction,
                messages=[{"role": "user", "content": user_content}],
            )
        except Exception as exc:  # network, auth, rate limit, timeout, 4xx/5xx
            raise LLMUnavailableError(f"Claude request failed: {exc}") from exc

        text = _extract_text(message)
        if not text.strip():
            raise LLMUnavailableError("Claude returned an empty response")

        model_used = getattr(message, "model", None) or settings.model
        return LLMResult(text=text, provider=self.name, model=model_used)


def _extract_text(message: object) -> str:
    """Concatenate the text of every ``text`` content block."""
    parts: list[str] = []
    for block in getattr(message, "content", []) or []:
        if getattr(block, "type", None) == "text":
            parts.append(getattr(block, "text", "") or "")
    return "".join(parts)
