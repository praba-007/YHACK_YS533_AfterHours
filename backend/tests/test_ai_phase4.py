"""
Phase 4 acceptance tests.

Covers the ten scenarios required by the phase spec plus the guarantees that
the ML system stays authoritative and unchanged:

  1. MONITOR evidence                     6. malformed LLM response
  2. INSPECT evidence                     7. LLM unavailable
  3. MAINTAIN evidence                    8. provider switching
  4. INSUFFICIENT EVIDENCE               9. unsupported-diagnosis attempt
  5. missing / noisy data               10. LLM overriding the ML decision
  + ML decision remains authoritative
  + deterministic fallback always produces a valid structured payload
  + structured-output validation
  + no raw dataset is sent to the LLM
  + existing ML evaluation endpoints are unchanged
"""
from __future__ import annotations

import copy
import json
import os
import unittest

from fastapi.testclient import TestClient

from app.main import app
from app.services import evidence_service
from app.services.llm import service as llm_service_mod
from app.services.llm.base import LLMProvider, LLMResult, LLMUnavailableError
from app.services.llm.settings import reset_llm_settings_cache

client = TestClient(app)

# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #
_BASE_HEALTH = {
    "machine_id": "MetroPT-3",
    "asset_name": "Metro Air Compressor Unit 3",
    "timestamp": "2020-09-01 03:59:00",
    "operating_state": "off",
    "health_status": "HEALTHY",
    "decision": "MONITOR",
    "anomaly_distance": 33.46,
    "elevated_threshold": 304.255,
    "severe_threshold": 729.718,
    "is_above_threshold": False,
    "top_contributing_sensors": [
        {"feature": "H1_off_24h_p10", "contribution": 41918.916},
        {"feature": "H1_offloaded_24h_p90", "contribution": 32147.064},
        {"feature": "TP2_offloaded_24h_mean", "contribution": 22468.891},
    ],
    "quality_gate": {"coverage": 1.0, "gate_passed": True},
    "sensor_readings": {
        "motor_current_amps": 0.044,
        "tp2_bar": -0.013,
        "tp3_bar": 8.897,
        "h1_bar": 8.884,
        "oil_temperature_c": 59.613,
        "dv_pressure_bar": -0.022,
    },
}


def health_for(decision: str, *, coverage: float = 1.0) -> dict:
    h = copy.deepcopy(_BASE_HEALTH)
    h["decision"] = decision
    h["quality_gate"]["coverage"] = coverage
    h["quality_gate"]["gate_passed"] = decision != "INSUFFICIENT EVIDENCE"
    if decision == "INSPECT":
        h["anomaly_distance"] = 380.0
        h["is_above_threshold"] = True
    elif decision == "MAINTAIN":
        h["anomaly_distance"] = 900.0
        h["is_above_threshold"] = True
    elif decision == "INSUFFICIENT EVIDENCE":
        h["anomaly_distance"] = 0.0
        h["operating_state"] = "unknown"
    return h


class FakeProvider(LLMProvider):
    """Records calls; returns canned text or raises."""

    def __init__(self, *, name="claude", available=True, text=None, raises=None):
        self.name = name
        self._available = available
        self._text = text
        self._raises = raises
        self.calls = 0

    def is_available(self) -> bool:
        return self._available

    def generate(self, *, system_instruction, user_content, max_tokens, timeout_seconds):
        self.calls += 1
        self.last_user_content = user_content
        if self._raises is not None:
            raise self._raises
        return LLMResult(text=self._text or "", provider=self.name, model=f"{self.name}-test-model")


def valid_llm_json(action: str, *, why: str | None = None) -> str:
    return json.dumps(
        {
            "summary": f"Model summary for {action}.",
            "why": why or f"Distance is compared against the calibrated thresholds for {action}.",
            "evidence_points": ["Mahalanobis distance versus thresholds.", "Operating state at observation."],
            "what_to_check": ["Observe telemetry.", "Re-review if the proximity index rises."],
            "recommended_action": action,
            "confidence_statement": "This restates a deterministic statistical decision; no numeric confidence.",
            "limitations": ["Statistical divergence is not a confirmed physical fault."],
        }
    )


# --------------------------------------------------------------------------- #
# Base
# --------------------------------------------------------------------------- #
class Phase4Base(unittest.TestCase):
    def setUp(self):
        self._saved_env = {
            k: os.environ.get(k)
            for k in (
                "MACHPULSE_LLM_PROVIDER",
                "ANTHROPIC_API_KEY",
                "MACHPULSE_LOCAL_LLM_BASE_URL",
                "MACHPULSE_LLM_MODEL",
            )
        }
        self._saved_health = evidence_service.ml_service.get_latest_machine_health
        self._saved_providers = llm_service_mod.llm_service._providers
        llm_service_mod.llm_service._providers = dict(self._saved_providers)
        reset_llm_settings_cache()

    def tearDown(self):
        for k, v in self._saved_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        evidence_service.ml_service.get_latest_machine_health = self._saved_health
        llm_service_mod.llm_service._providers = self._saved_providers
        reset_llm_settings_cache()

    def set_decision(self, decision, *, coverage=1.0):
        evidence_service.ml_service.get_latest_machine_health = lambda: health_for(
            decision, coverage=coverage
        )

    def use_claude(self, provider: FakeProvider):
        os.environ["MACHPULSE_LLM_PROVIDER"] = "claude"
        os.environ["ANTHROPIC_API_KEY"] = "test-key-not-real"
        os.environ.pop("MACHPULSE_LOCAL_LLM_BASE_URL", None)
        reset_llm_settings_cache()
        llm_service_mod.llm_service._providers["claude"] = provider

    def disable_llm(self):
        os.environ["MACHPULSE_LLM_PROVIDER"] = "none"
        reset_llm_settings_cache()

    def explain(self, include_evidence=True):
        r = client.post("/api/ai/explain", json={"include_evidence": include_evidence})
        self.assertEqual(r.status_code, 200)
        return r.json()


# --------------------------------------------------------------------------- #
# 1-3: MONITOR / INSPECT / MAINTAIN, deterministic fallback
# --------------------------------------------------------------------------- #
class TestDeterministicDecisions(Phase4Base):
    def test_1_monitor_evidence(self):
        self.set_decision("MONITOR")
        self.disable_llm()
        body = self.explain()
        self.assertEqual(body["meta"]["mode"], "deterministic_fallback")
        self.assertEqual(body["meta"]["ml_decision"], "MONITOR")
        self.assertEqual(body["explanation"]["recommended_action"], "MONITOR")
        self.assertTrue(body["meta"]["evidence_sufficient"])
        # structured shape present
        for key in ("summary", "why", "evidence_points", "what_to_check", "limitations"):
            self.assertIn(key, body["explanation"])

    def test_2_inspect_evidence(self):
        self.set_decision("INSPECT")
        self.disable_llm()
        body = self.explain()
        self.assertEqual(body["explanation"]["recommended_action"], "INSPECT")
        self.assertEqual(body["meta"]["ml_decision"], "INSPECT")
        self.assertTrue(len(body["explanation"]["what_to_check"]) >= 1)
        # inspection directions are surfaced in the evidence for INSPECT
        self.assertTrue(body["evidence"]["maintenance"]["inspection_directions"])

    def test_3_maintain_evidence(self):
        self.set_decision("MAINTAIN")
        self.disable_llm()
        body = self.explain()
        self.assertEqual(body["explanation"]["recommended_action"], "MAINTAIN")
        self.assertEqual(body["meta"]["ml_decision"], "MAINTAIN")
        self.assertEqual(body["meta"]["mode"], "deterministic_fallback")


# --------------------------------------------------------------------------- #
# 4-5: INSUFFICIENT EVIDENCE / missing data -> LLM is never asked to guess
# --------------------------------------------------------------------------- #
class TestInsufficientEvidence(Phase4Base):
    def test_4_insufficient_evidence_blocks_llm(self):
        self.set_decision("INSUFFICIENT EVIDENCE")
        spy = FakeProvider(text=valid_llm_json("MONITOR"))
        self.use_claude(spy)
        body = self.explain()
        self.assertEqual(body["explanation"]["recommended_action"], "INSUFFICIENT_EVIDENCE")
        self.assertFalse(body["meta"]["llm_invocation_allowed"])
        self.assertEqual(body["meta"]["fallback_reason"], "insufficient_evidence")
        self.assertEqual(spy.calls, 0, "LLM must not be called for INSUFFICIENT EVIDENCE")

    def test_5_missing_noisy_data_is_insufficient(self):
        # decision still says MONITOR but window coverage is below the gate
        self.set_decision("MONITOR", coverage=0.30)
        spy = FakeProvider(text=valid_llm_json("MONITOR"))
        self.use_claude(spy)
        body = self.explain()
        self.assertFalse(body["meta"]["evidence_sufficient"])
        self.assertEqual(body["explanation"]["recommended_action"], "INSUFFICIENT_EVIDENCE")
        self.assertEqual(spy.calls, 0)


# --------------------------------------------------------------------------- #
# 6-7: malformed response / provider down -> deterministic fallback, still 200
# --------------------------------------------------------------------------- #
class TestLLMFailureHandling(Phase4Base):
    def test_6_malformed_llm_response(self):
        self.set_decision("MONITOR")
        self.use_claude(FakeProvider(text="I am not JSON at all, sorry."))
        body = self.explain()
        self.assertEqual(body["meta"]["mode"], "deterministic_fallback")
        self.assertEqual(body["meta"]["fallback_reason"], "invalid_output")
        self.assertEqual(body["explanation"]["recommended_action"], "MONITOR")

    def test_7_llm_unavailable(self):
        self.set_decision("MONITOR")
        self.use_claude(FakeProvider(raises=LLMUnavailableError("connection refused")))
        body = self.explain()
        self.assertEqual(body["meta"]["mode"], "deterministic_fallback")
        self.assertIn(body["meta"]["fallback_reason"], ("provider_unavailable", "timeout"))
        self.assertEqual(body["explanation"]["recommended_action"], "MONITOR")

    def test_7b_provider_not_available_falls_back(self):
        self.set_decision("MONITOR")
        self.use_claude(FakeProvider(available=False, text=valid_llm_json("MONITOR")))
        body = self.explain()
        self.assertEqual(body["meta"]["mode"], "deterministic_fallback")
        self.assertEqual(body["meta"]["fallback_reason"], "llm_disabled")


# --------------------------------------------------------------------------- #
# 8: provider switching
# --------------------------------------------------------------------------- #
class TestProviderSwitching(Phase4Base):
    def test_8_switch_claude_to_local(self):
        self.set_decision("MONITOR")

        self.use_claude(FakeProvider(name="claude", text=valid_llm_json("MONITOR")))
        body_a = self.explain()
        self.assertEqual(body_a["meta"]["mode"], "llm")
        self.assertEqual(body_a["meta"]["provider"], "claude")
        self.assertEqual(body_a["meta"]["provider_label"], "CLAUDE")

        os.environ["MACHPULSE_LLM_PROVIDER"] = "local"
        os.environ["MACHPULSE_LOCAL_LLM_BASE_URL"] = "http://localhost:9999/v1"
        reset_llm_settings_cache()
        llm_service_mod.llm_service._providers["local"] = FakeProvider(
            name="local", text=valid_llm_json("MONITOR")
        )
        body_b = self.explain()
        self.assertEqual(body_b["meta"]["mode"], "llm")
        self.assertEqual(body_b["meta"]["provider"], "local")
        self.assertEqual(body_b["meta"]["provider_label"], "LOCAL")

    def test_8b_status_endpoint_reflects_provider(self):
        os.environ["MACHPULSE_LLM_PROVIDER"] = "none"
        reset_llm_settings_cache()
        s = client.get("/api/ai/status").json()
        self.assertFalse(s["enabled"])
        self.assertEqual(s["provider_label"], "DETERMINISTIC")


# --------------------------------------------------------------------------- #
# 9-10: unsupported claims / decision override -> rejected
# --------------------------------------------------------------------------- #
class TestGuardrails(Phase4Base):
    def test_9_unsupported_diagnosis_is_rejected(self):
        self.set_decision("INSPECT")
        bad = valid_llm_json(
            "INSPECT",
            why="The bearing has failed. Remaining useful life is approximately 320 hours before breakdown.",
        )
        self.use_claude(FakeProvider(text=bad))
        body = self.explain()
        self.assertEqual(body["meta"]["mode"], "deterministic_fallback")
        self.assertEqual(body["meta"]["fallback_reason"], "forbidden_content")
        # The model's fabricated text is discarded; the deterministic explanation
        # is served instead. (The honest "does not produce an RUL" disclaimer in
        # `limitations` is expected and is not a violation.)
        blob = json.dumps(body["explanation"]).lower()
        self.assertNotIn("320 hours", blob)
        self.assertNotIn("the bearing has failed", blob)
        self.assertNotIn("before breakdown", blob)

    def test_9b_failure_probability_is_rejected(self):
        self.set_decision("MAINTAIN")
        bad = valid_llm_json("MAINTAIN", why="There is a 78% probability of failure within two weeks.")
        self.use_claude(FakeProvider(text=bad))
        body = self.explain()
        self.assertEqual(body["meta"]["fallback_reason"], "forbidden_content")

    def test_10_llm_cannot_override_ml_decision(self):
        self.set_decision("MONITOR")
        # model tries to escalate MONITOR -> MAINTAIN
        self.use_claude(FakeProvider(text=valid_llm_json("MAINTAIN")))
        body = self.explain()
        self.assertEqual(body["meta"]["mode"], "deterministic_fallback")
        self.assertEqual(body["meta"]["fallback_reason"], "llm_attempted_override")
        self.assertEqual(body["explanation"]["recommended_action"], "MONITOR")
        self.assertEqual(body["meta"]["ml_decision"], "MONITOR")

    def test_10b_valid_llm_output_is_used(self):
        self.set_decision("INSPECT")
        good = FakeProvider(text=valid_llm_json("INSPECT"))
        self.use_claude(good)
        body = self.explain()
        self.assertEqual(body["meta"]["mode"], "llm")
        self.assertEqual(body["meta"]["provider"], "claude")
        self.assertEqual(body["explanation"]["recommended_action"], "INSPECT")
        self.assertIsNotNone(body["meta"]["model"])
        self.assertEqual(good.calls, 1)


# --------------------------------------------------------------------------- #
# ML authority + data-boundary + evaluation-unchanged
# --------------------------------------------------------------------------- #
class TestMlAuthorityAndBoundary(Phase4Base):
    def test_ml_decision_is_always_meta_authority(self):
        for decision, expected_action in [
            ("MONITOR", "MONITOR"),
            ("INSPECT", "INSPECT"),
            ("MAINTAIN", "MAINTAIN"),
            ("INSUFFICIENT EVIDENCE", "INSUFFICIENT_EVIDENCE"),
        ]:
            with self.subTest(decision=decision):
                self.set_decision(decision)
                self.use_claude(FakeProvider(text=valid_llm_json(
                    expected_action if expected_action != "INSUFFICIENT_EVIDENCE" else "MONITOR"
                )))
                body = self.explain()
                self.assertEqual(body["meta"]["ml_decision"], decision)
                self.assertEqual(body["explanation"]["recommended_action"], expected_action)

    def test_no_raw_dataset_in_llm_payload(self):
        self.set_decision("INSPECT")
        spy = FakeProvider(text=valid_llm_json("INSPECT"))
        self.use_claude(spy)
        self.explain()
        sent = spy.last_user_content.lower()
        # no file paths, no dataset filename, no source, no secrets
        for banned in ("metropt3(aircompressor).csv", ".csv", "\\data\\", "/data/",
                       "pipeline_results.json", "recent_telemetry.json",
                       "anthropic_api_key", "sk-ant", "os.environ", "c:\\"):
            self.assertNotIn(banned, sent)
        # payload is compact (evidence summary, not a telemetry dump)
        self.assertLess(len(spy.last_user_content), 12000)

    def test_existing_evaluation_endpoints_unchanged(self):
        ev = client.get("/api/evaluation/events").json()
        self.assertEqual(ev["recall"], 0.75)
        self.assertEqual(ev["precision"], 0.0602)
        self.assertEqual(ev["failures_detected"], 3)
        self.assertEqual(ev["total_documented_failures"], 4)
        summ = client.get("/api/evaluation/summary").json()
        self.assertEqual(summ["model"]["calibrated_threshold"], 304.255)
        self.assertEqual(summ["model"]["calibrated_severe_threshold"], 729.718)
        base = client.get("/api/evaluation/baselines").json()
        self.assertEqual(base["machpulse_mahalanobis"]["recall"], 0.75)

    def test_pipeline_results_file_untouched(self):
        import hashlib
        from app.services.ml_service import RESULTS_FILE, RECENT_TELEMETRY_FILE

        for path in (RESULTS_FILE, RECENT_TELEMETRY_FILE):
            self.assertTrue(path.exists())
        # A read-only endpoint must never rewrite the pipeline artifacts.
        digest_before = hashlib.sha256(RESULTS_FILE.read_bytes()).hexdigest()
        self.set_decision("MAINTAIN")
        self.use_claude(FakeProvider(text=valid_llm_json("MAINTAIN")))
        self.explain()
        digest_after = hashlib.sha256(RESULTS_FILE.read_bytes()).hexdigest()
        self.assertEqual(digest_before, digest_after)


if __name__ == "__main__":  # pragma: no cover
    unittest.main(verbosity=2)
