"""
Google Gemini provider using the official google-genai SDK.

The ``google-genai`` SDK is imported lazily so the backend runs, and every
existing endpoint keeps working, whether or not the package is installed. Any
failure - missing SDK, missing key, network error, timeout, unexpected
response shape - is converted to ``LLMUnavailableError`` so the caller falls
back to deterministic reasoning.
"""
from __future__ import annotations

import os
import logging

from .base import LLMProvider, LLMResult, LLMUnavailableError
from .settings import get_llm_settings

logger = logging.getLogger("machpulse.llm.gemini")


class GeminiProvider(LLMProvider):
    name = "gemini"

    def is_available(self) -> bool:
        settings = get_llm_settings()
        if not settings.gemini_api_key_present:
            return False
        try:
            from google import genai  # noqa: F401
        except Exception:  # pragma: no cover
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
            from google import genai
            from google.genai import types
        except Exception as exc:  # pragma: no cover
            raise LLMUnavailableError(f"google-genai SDK not installed: {exc}") from exc

        api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
        if not api_key:
            raise LLMUnavailableError("GEMINI_API_KEY is not set")

        model_name = settings.model or "gemini-2.5-flash"

        try:
            client = genai.Client(api_key=api_key)
            config = types.GenerateContentConfig(
                system_instruction=system_instruction,
                max_output_tokens=max_tokens,
            )
            response = client.models.generate_content(
                model=model_name,
                contents=user_content,
                config=config,
            )
        except Exception as exc:  # network, auth, rate limit, timeout, 4xx/5xx
            raise LLMUnavailableError(f"Gemini request failed: {exc}") from exc

        text = (getattr(response, "text", "") or "").strip()
        if not text:
            raise LLMUnavailableError("Gemini returned an empty response")

        return LLMResult(text=text, provider=self.name, model=model_name)
