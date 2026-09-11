"""
Acceptance unit tests for Gemini provider implementation in MachPulse backend.
"""
from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.services import evidence_service
from app.services.llm.base import LLMUnavailableError
from app.services.llm.gemini_provider import GeminiProvider
from app.services.llm.service import llm_service
from app.services.llm.settings import get_llm_settings, reset_llm_settings_cache

client = TestClient(app)


class TestGeminiProviderUnit(unittest.TestCase):
    def setUp(self):
        self._saved_env = {
            k: os.environ.get(k)
            for k in ("MACHPULSE_LLM_PROVIDER", "MACHPULSE_LLM_MODEL", "GEMINI_API_KEY", "ANTHROPIC_API_KEY")
        }
        reset_llm_settings_cache()

    def tearDown(self):
        for k, v in self._saved_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        reset_llm_settings_cache()

    def test_gemini_unavailable_when_key_absent(self):
        os.environ["MACHPULSE_LLM_PROVIDER"] = "gemini"
        os.environ["GEMINI_API_KEY"] = ""
        reset_llm_settings_cache()

        provider = GeminiProvider()
        self.assertFalse(provider.is_available())
        self.assertEqual(llm_service.provider_key(), "deterministic")
        self.assertEqual(llm_service.provider_label(), "DETERMINISTIC")

    def test_gemini_available_when_key_exists(self):
        os.environ["MACHPULSE_LLM_PROVIDER"] = "gemini"
        os.environ["GEMINI_API_KEY"] = "fake-gemini-key-for-test"
        reset_llm_settings_cache()

        provider = GeminiProvider()
        self.assertTrue(provider.is_available())
        self.assertEqual(llm_service.provider_key(), "gemini")
        self.assertEqual(llm_service.provider_label(), "GEMINI")
        self.assertEqual(llm_service.model_name(), "gemini-2.5-flash")

    @patch("google.genai.Client")
    def test_gemini_response_extraction(self, mock_client_cls):
        os.environ["MACHPULSE_LLM_PROVIDER"] = "gemini"
        os.environ["GEMINI_API_KEY"] = "fake-gemini-key-for-test"
        reset_llm_settings_cache()

        mock_response = MagicMock()
        mock_response.text = "The compressor is operating normally within parameters."
        mock_client_instance = MagicMock()
        mock_client_instance.models.generate_content.return_value = mock_response
        mock_client_cls.return_value = mock_client_instance

        provider = GeminiProvider()
        result = provider.generate(
            system_instruction="System prompt",
            user_content="User prompt",
            max_tokens=100,
            timeout_seconds=5.0,
        )

        self.assertEqual(result.provider, "gemini")
        self.assertEqual(result.model, "gemini-2.5-flash")
        self.assertIn("operating normally", result.text)
        self.assertNotIn("fake-gemini-key-for-test", result.text)

    @patch("google.genai.Client")
    def test_gemini_api_failure_raises_llm_unavailable(self, mock_client_cls):
        os.environ["MACHPULSE_LLM_PROVIDER"] = "gemini"
        os.environ["GEMINI_API_KEY"] = "fake-gemini-key-for-test"
        reset_llm_settings_cache()

        mock_client_instance = MagicMock()
        mock_client_instance.models.generate_content.side_error = Exception("API connection reset")
        mock_client_instance.models.generate_content.side_effect = Exception("API connection reset")
        mock_client_cls.return_value = mock_client_instance

        provider = GeminiProvider()
        with self.assertRaises(LLMUnavailableError) as ctx:
            provider.generate(
                system_instruction="System prompt",
                user_content="User prompt",
                max_tokens=100,
                timeout_seconds=5.0,
            )

        self.assertIn("Gemini request failed", str(ctx.exception))
        # Ensure secret key is not in error string
        self.assertNotIn("fake-gemini-key-for-test", str(ctx.exception))

    def test_api_status_endpoint_returns_gemini_when_configured(self):
        os.environ["MACHPULSE_LLM_PROVIDER"] = "gemini"
        os.environ["GEMINI_API_KEY"] = "fake-gemini-key-for-test"
        reset_llm_settings_cache()

        res = client.get("/api/ai/status").json()
        self.assertEqual(res["provider"], "gemini")
        self.assertEqual(res["provider_label"], "GEMINI")
        self.assertTrue(res["enabled"])
        self.assertEqual(res["configured_provider"], "gemini")

    def test_existing_claude_and_local_providers_still_registered(self):
        self.assertIn("claude", llm_service._providers)
        self.assertIn("gemini", llm_service._providers)
        self.assertIn("local", llm_service._providers)


if __name__ == "__main__":
    unittest.main()
