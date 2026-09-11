"""
Provider selection + a single ``explain`` entry point.

The rest of the application talks to this object, never to a concrete provider.
Switching Claude <-> local is one environment variable and changes nothing in
the evidence pipeline.
"""
from __future__ import annotations

import logging

from .base import LLMProvider, LLMResult, LLMUnavailableError
from .claude_provider import ClaudeProvider
from .gemini_provider import GeminiProvider
from .local_provider import LocalProvider
from .settings import get_llm_settings

logger = logging.getLogger("machpulse.llm.service")


class LLMService:
    def __init__(self) -> None:
        self._providers: dict[str, LLMProvider] = {
            "claude": ClaudeProvider(),
            "gemini": GeminiProvider(),
            "local": LocalProvider(),
        }

    # -- selection ---------------------------------------------------------
    def selected_provider(self) -> LLMProvider | None:
        key = get_llm_settings().normalized_provider
        if key == "none":
            return None
        return self._providers.get(key)

    def is_enabled(self) -> bool:
        """A provider is selected AND could plausibly answer."""
        provider = self.selected_provider()
        return bool(provider and provider.is_available())

    def provider_key(self) -> str:
        """'claude' | 'gemini' | 'local' | 'deterministic' (what will actually answer)."""
        provider = self.selected_provider()
        if provider and provider.is_available():
            return provider.name
        return "deterministic"

    def provider_label(self) -> str:
        return self.provider_key().upper()

    def model_name(self) -> str | None:
        settings = get_llm_settings()
        key = self.provider_key()
        if key in ("claude", "gemini"):
            return settings.model
        if key == "local":
            return settings.local_model
        return None

    # -- invocation ------------------------------------------------------
    def explain(self, *, system_instruction: str, user_content: str) -> LLMResult:
        provider = self.selected_provider()
        if provider is None:
            raise LLMUnavailableError("No LLM provider is configured (MACHPULSE_LLM_PROVIDER)")
        if not provider.is_available():
            raise LLMUnavailableError(f"Provider '{provider.name}' is not available")

        settings = get_llm_settings()
        try:
            return provider.generate(
                system_instruction=system_instruction,
                user_content=user_content,
                max_tokens=settings.max_tokens,
                timeout_seconds=settings.timeout_seconds,
            )
        except LLMUnavailableError:
            raise
        except Exception as exc:  # defensive: never leak a provider exception
            raise LLMUnavailableError(f"Provider '{provider.name}' raised: {exc}") from exc


llm_service = LLMService()
