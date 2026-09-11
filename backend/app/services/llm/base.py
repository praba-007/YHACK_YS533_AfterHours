"""
Provider-independent LLM interface.

A provider does exactly one thing: given a system instruction and a compact
user payload (the MachPulse evidence, already validated), return text. It has
no filesystem access, no shell, no tools, no database handle, no network
capability beyond the single model call it makes. Interpretation only.
"""
from __future__ import annotations

import abc
from dataclasses import dataclass


class LLMUnavailableError(RuntimeError):
    """
    Raised for every provider-side failure mode: missing credential, import
    failure, network error, timeout, malformed transport response, provider
    exception. Callers treat this as "fall back to deterministic reasoning".
    """


@dataclass(frozen=True)
class LLMResult:
    text: str
    provider: str  # "claude" | "local"
    model: str


class LLMProvider(abc.ABC):
    """Base class for all providers. Keep implementations tiny."""

    #: short, stable identifier ("claude", "local")
    name: str = "base"

    @abc.abstractmethod
    def is_available(self) -> bool:
        """
        True only when a real call could plausibly succeed (credential present,
        SDK importable, base URL configured). Never performs a network call.
        """

    @abc.abstractmethod
    def generate(
        self,
        *,
        system_instruction: str,
        user_content: str,
        max_tokens: int,
        timeout_seconds: float,
    ) -> LLMResult:
        """
        Return the model's raw text response. Must raise ``LLMUnavailableError``
        (not the vendor's own exception type) on any failure.
        """
