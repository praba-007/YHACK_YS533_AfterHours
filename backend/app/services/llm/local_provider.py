"""
Local / on-premise provider (OpenAI-compatible chat-completions).

This is the seam that makes a future on-premise deployment possible without
touching the evidence pipeline: point ``MACHPULSE_LOCAL_LLM_BASE_URL`` at a
local inference server (llama.cpp server, Ollama's ``/v1``, vLLM, LM Studio,
...) and set ``MACHPULSE_LLM_PROVIDER=local``.

It is deliberately dependency-free (stdlib ``urllib``) and is *unavailable*
unless the operator has actually configured a base URL - MachPulse never
reports a "LOCAL" provider status for a model that is not running.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from .base import LLMProvider, LLMResult, LLMUnavailableError
from .settings import get_llm_settings

logger = logging.getLogger("machpulse.llm.local")


class LocalProvider(LLMProvider):
    name = "local"

    def is_available(self) -> bool:
        return bool(get_llm_settings().local_base_url)

    def generate(
        self,
        *,
        system_instruction: str,
        user_content: str,
        max_tokens: int,
        timeout_seconds: float,
    ) -> LLMResult:
        settings = get_llm_settings()
        base_url = settings.local_base_url
        if not base_url:
            raise LLMUnavailableError("MACHPULSE_LOCAL_LLM_BASE_URL is not configured")

        url = base_url.rstrip("/") + "/chat/completions"
        payload = {
            "model": settings.local_model,
            "max_tokens": max_tokens,
            "temperature": 0,
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_content},
            ],
        }
        headers = {"Content-Type": "application/json"}
        import os

        local_key = os.getenv("MACHPULSE_LOCAL_LLM_API_KEY")
        if local_key:
            headers["Authorization"] = f"Bearer {local_key}"

        req = urllib.request.Request(
            url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
                body = resp.read().decode("utf-8")
        except (urllib.error.URLError, OSError, ValueError) as exc:
            raise LLMUnavailableError(f"Local LLM request failed: {exc}") from exc

        try:
            data = json.loads(body)
            text = data["choices"][0]["message"]["content"]
        except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
            raise LLMUnavailableError(f"Local LLM returned an unexpected shape: {exc}") from exc

        if not isinstance(text, str) or not text.strip():
            raise LLMUnavailableError("Local LLM returned an empty response")

        return LLMResult(text=text, provider=self.name, model=settings.local_model)
