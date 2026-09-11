"""
Phase 5A acceptance tests - backend AI conversational layer (POST /api/ai/chat).

Fifteen required scenarios plus a happy-path check. The Phase 4 suite
(``test_ai_phase4.py``) is left untouched and still runs.

No real Claude call is made: providers are faked via injection.
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
    def __init__(self, *, name="claude", available=True, text=None, raises=None):
        self.name = name
        self._available = available
        self._text = text
        self._raises = raises
        self.calls = 0
        self.last_user_content = ""

    def is_available(self) -> bool:
        return self._available

    def generate(self, *, system_instruction, user_content, max_tokens, timeout_seconds):
        self.calls += 1
        self.last_user_content = user_content
        if self._raises is not None:
            raise self._raises
        return LLMResult(text=self._text or "", provider=self.name, model=f"{self.name}-test-model")


SAFE_REPLY = (
    "The available signals suggest the compressor is operating within its expected pattern. "
    "The Mahalanobis distance is well below the calibrated inspection threshold, which is why "
    "MachPulse reports MONITOR. It is worth keeping an eye on the H1 separator trend, but the "
    "current evidence does not confirm any physical fault."
)


class Phase5Base(unittest.TestCase):
    def setUp(self):
        self._saved_env = {
            k: os.environ.get(k)
            for k in ("MACHPULSE_LLM_PROVIDER", "ANTHROPIC_API_KEY", "MACHPULSE_LOCAL_LLM_BASE_URL")
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

    def chat(self, message="Why this decision?", history=None, maintenance_history=None):
        body = {
            "message": message,
            "history": history or [],
            "maintenance_history": maintenance_history or [],
        }
        r = client.post("/api/ai/chat", json=body)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def assert_meta_complete(self, meta):
        for key in (
            "mode",
            "provider",
            "provider_label",
            "ml_decision",
            "evidence_sufficient",
            "llm_invocation_allowed",
            "generated_at",
        ):
            self.assertIn(key, meta)
            self.assertIsNotNone(meta[key], f"meta.{key} is None")
        self.assertIn(meta["mode"], ("llm", "deterministic_fallback"))
        self.assertTrue(meta["generated_at"])


# 1
class TestEndpointWorks(Phase5Base):
    def test_1_chat_endpoint_works(self):
        self.set_decision("MONITOR")
        self.use_claude(FakeProvider(text=SAFE_REPLY))
        body = self.chat("Explain the current decision.")
        self.assertTrue(body["reply"].strip())
        self.assertEqual(body["meta"]["mode"], "llm")
        self.assertEqual(body["meta"]["provider"], "claude")
        self.assertEqual(body["meta"]["ml_decision"], "MONITOR")
        self.assertIn("structured_context", body)
        self.assert_meta_complete(body["meta"])


# 2
class TestDeterministicFallback(Phase5Base):
    def test_2_deterministic_fallback_when_disabled(self):
        self.set_decision("MONITOR")
        self.disable_llm()
        body = self.chat("What is going on?")
        self.assertEqual(body["meta"]["mode"], "deterministic_fallback")
        self.assertEqual(body["meta"]["fallback_reason"], "llm_disabled")
        self.assertIn("MONITOR", body["reply"])
        self.assertTrue(body["reply"].strip())
        self.assert_meta_complete(body["meta"])


# 3
class TestInsufficientEvidence(Phase5Base):
    def test_3_insufficient_evidence_is_safe(self):
        self.set_decision("INSUFFICIENT EVIDENCE")
        spy = FakeProvider(text="The bearing is failing and RUL is 40 hours.")
        self.use_claude(spy)
        body = self.chat("Is the compressor OK?")
        self.assertEqual(body["meta"]["mode"], "deterministic_fallback")
        self.assertEqual(body["meta"]["fallback_reason"], "insufficient_evidence")
        self.assertFalse(body["meta"]["llm_invocation_allowed"])
        self.assertEqual(spy.calls, 0, "LLM must not be called for INSUFFICIENT EVIDENCE")
        low = body["reply"].lower()
        self.assertIn("insufficient", low)
        self.assertNotIn("rul", low)

    def test_3b_missing_data_coverage_is_insufficient(self):
        self.set_decision("MONITOR", coverage=0.3)
        spy = FakeProvider(text=SAFE_REPLY)
        self.use_claude(spy)
        body = self.chat("Status?")
        self.assertFalse(body["meta"]["evidence_sufficient"])
        self.assertEqual(body["meta"]["mode"], "deterministic_fallback")
        self.assertEqual(spy.calls, 0)


# 4
class TestDecisionAuthority(Phase5Base):
    def test_4_claude_cannot_override_decision(self):
        self.set_decision("MONITOR")
        self.use_claude(FakeProvider(text="You should schedule maintenance immediately and replace the compressor."))
        body = self.chat("What should I do?")
        self.assertEqual(body["meta"]["mode"], "deterministic_fallback")
        self.assertEqual(body["meta"]["fallback_reason"], "llm_attempted_override")
        self.assertEqual(body["meta"]["ml_decision"], "MONITOR")

    def test_4b_claude_cannot_deescalate_maintain(self):
        self.set_decision("MAINTAIN")
        self.use_claude(FakeProvider(text="This looks fine. No maintenance is needed and it is safe to keep running indefinitely."))
        body = self.chat("Do I really need to act?")
        self.assertEqual(body["meta"]["mode"], "deterministic_fallback")
        self.assertEqual(body["meta"]["fallback_reason"], "llm_attempted_override")
        self.assertEqual(body["meta"]["ml_decision"], "MAINTAIN")

    def test_4c_inspect_stays_inspect(self):
        self.set_decision("INSPECT")
        self.use_claude(FakeProvider(text="I recommend you overhaul the compressor now."))
        body = self.chat("Advice?")
        self.assertEqual(body["meta"]["fallback_reason"], "llm_attempted_override")
        self.assertEqual(body["meta"]["ml_decision"], "INSPECT")


# 5-8
class TestForbiddenContent(Phase5Base):
    def _reject(self, text, decision="MONITOR"):
        self.set_decision(decision)
        self.use_claude(FakeProvider(text=text))
        return self.chat("Tell me more.")

    def test_5_rul_text_rejected(self):
        body = self._reject("The evidence is consistent with wear. Remaining useful life is about 300 hours.")
        self.assertEqual(body["meta"]["fallback_reason"], "forbidden_content")
        self.assertEqual(body["meta"]["mode"], "deterministic_fallback")
        self.assertNotIn("300 hours", body["reply"])

    def test_6_failure_probability_rejected(self):
        body = self._reject("There is a 72% probability of failure this month.")
        self.assertEqual(body["meta"]["fallback_reason"], "forbidden_content")

    def test_7_time_to_failure_rejected(self):
        body = self._reject("Left unattended, the compressor will fail within 5 days.")
        self.assertEqual(body["meta"]["fallback_reason"], "forbidden_content")

    def test_8_fabricated_sensor_values_rejected(self):
        body = self._reject("The vibration sensor reads 4.2 mm/s RMS and the bearing temperature is 95 C.")
        self.assertEqual(body["meta"]["fallback_reason"], "forbidden_content")

    def test_8b_numeric_confidence_rejected(self):
        body = self._reject("I am 93% confident the separator is degraded.")
        self.assertEqual(body["meta"]["fallback_reason"], "forbidden_content")


# 9-10
class TestContextBounding(Phase5Base):
    def test_9_maintenance_history_is_bounded(self):
        self.set_decision("MONITOR")
        spy = FakeProvider(text=SAFE_REPLY)
        self.use_claude(spy)
        big = [
            {
                "id": f"m{i}",
                "actionType": "Inspection",
                "status": "COMPLETED",
                "createdAt": "2020-05-01T00:00:00Z",
                "notes": "x" * 5000,
            }
            for i in range(50)
        ]
        body = self.chat("Summarise history.", maintenance_history=big)
        self.assertLessEqual(body["structured_context"]["maintenance_history_items_considered"], 20)
        # field length bounded in the payload actually sent to the LLM
        self.assertNotIn("x" * 1000, spy.last_user_content)
        self.assertLess(len(spy.last_user_content), 40000)

    def test_10_conversation_history_is_bounded(self):
        self.set_decision("MONITOR")
        spy = FakeProvider(text=SAFE_REPLY)
        self.use_claude(spy)
        hist = []
        for i in range(40):
            hist.append({"role": "user", "content": f"question {i} " + "y" * 5000})
            hist.append({"role": "assistant", "content": f"answer {i}"})
        body = self.chat("Continue.", history=hist)
        self.assertLessEqual(body["structured_context"]["conversation_turns_considered"], 12)
        self.assertNotIn("y" * 2000, spy.last_user_content)


# 11-12
class TestDataBoundary(Phase5Base):
    def test_11_no_raw_dataset_in_payload(self):
        self.set_decision("INSPECT")
        spy = FakeProvider(text=SAFE_REPLY.replace("MONITOR", "INSPECT"))
        self.use_claude(spy)
        self.chat("Which areas to check?", maintenance_history=[{"id": "m1", "actionType": "Inspection", "status": "OPEN", "createdAt": "2020-05-01T00:00:00Z"}])
        sent = spy.last_user_content.lower()
        for banned in (
            "metropt3(aircompressor).csv",
            ".csv",
            "\\data\\",
            "/data/",
            "pipeline_results.json",
            "recent_telemetry.json",
            "anthropic_api_key",
            "sk-ant",
            "os.environ",
            "c:\\",
            "\\backend\\app",
        ):
            self.assertNotIn(banned, sent)

    def test_12_no_full_telemetry_arrays_in_payload(self):
        self.set_decision("MONITOR")
        spy = FakeProvider(text=SAFE_REPLY)
        self.use_claude(spy)
        self.chat("Explain the trend.")
        sent = spy.last_user_content
        self.assertNotIn("recent_telemetry", sent)
        # a full 1-minute telemetry buffer would carry ~100+ timestamped rows
        self.assertLessEqual(sent.count('"timestamp"'), 3)
        self.assertLessEqual(sent.count("2020-09-01 03:"), 5)
        # try to locate an embedded JSON object; no list inside may be huge
        start = sent.find("{")
        end = sent.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                obj = json.loads(sent[start : end + 1])

                def max_list_len(o):
                    if isinstance(o, list):
                        return max([len(o)] + [max_list_len(x) for x in o] or [len(o)])
                    if isinstance(o, dict):
                        return max([0] + [max_list_len(v) for v in o.values()])
                    return 0

                self.assertLessEqual(max_list_len(obj), 25)
            except json.JSONDecodeError:
                pass


# 13
class TestNoFabricatedHistory(Phase5Base):
    def test_13_history_not_fabricated_when_absent(self):
        self.set_decision("INSPECT")
        self.use_claude(
            FakeProvider(
                text=(
                    "According to the maintenance log, the unit was last serviced on 2020-03-01 "
                    "by technician John Smith, who replaced the separator."
                )
            )
        )
        body = self.chat("What was done last time?")
        self.assertEqual(body["meta"]["mode"], "deterministic_fallback")
        self.assertEqual(body["meta"]["fallback_reason"], "forbidden_content")
        self.assertNotIn("John Smith", body["reply"])

    def test_13b_fallback_states_no_history_available(self):
        self.set_decision("MONITOR")
        self.disable_llm()
        body = self.chat("Any past maintenance?")
        self.assertIn("no recorded maintenance history", body["reply"].lower())


# 14
class TestLLMFailureFallback(Phase5Base):
    def test_14_llm_exception_falls_back(self):
        self.set_decision("MONITOR")
        self.use_claude(FakeProvider(raises=LLMUnavailableError("connection refused")))
        body = self.chat("Status?")
        self.assertEqual(body["meta"]["mode"], "deterministic_fallback")
        self.assertIn(body["meta"]["fallback_reason"], ("provider_unavailable", "timeout"))
        self.assertTrue(body["reply"].strip())
        self.assert_meta_complete(body["meta"])

    def test_14b_empty_llm_reply_falls_back(self):
        self.set_decision("MONITOR")
        self.use_claude(FakeProvider(text="   "))
        body = self.chat("Status?")
        self.assertEqual(body["meta"]["mode"], "deterministic_fallback")


# 15
class TestMetadataPopulated(Phase5Base):
    def test_15_metadata_for_llm_and_fallback(self):
        # llm path
        self.set_decision("MAINTAIN")
        self.use_claude(FakeProvider(text="The evidence is consistent with the elevated statistical distance that drives the MAINTAIN recommendation. Verify the top contributing signals against the approved procedure."))
        b1 = self.chat("Explain MAINTAIN.")
        self.assert_meta_complete(b1["meta"])
        self.assertEqual(b1["meta"]["mode"], "llm")
        self.assertEqual(b1["meta"]["ml_decision"], "MAINTAIN")
        self.assertIsNotNone(b1["meta"]["model"])

        # fallback path
        self.disable_llm()
        b2 = self.chat("Explain again.")
        self.assert_meta_complete(b2["meta"])
        self.assertEqual(b2["meta"]["mode"], "deterministic_fallback")
        self.assertEqual(b2["meta"]["ml_decision"], "MAINTAIN")
        self.assertEqual(b2["meta"]["provider"], "deterministic")
        self.assertEqual(b2["meta"]["provider_label"], "DETERMINISTIC")


# Phase 4 preserved
class TestPhase4StillGreen(Phase5Base):
    def test_phase4_explain_and_status_unchanged(self):
        self.disable_llm()
        s = client.get("/api/ai/status").json()
        self.assertEqual(s["provider_label"], "DETERMINISTIC")
        e = client.post("/api/ai/explain", json={"include_evidence": False})
        self.assertEqual(e.status_code, 200)
        self.assertEqual(e.json()["meta"]["mode"], "deterministic_fallback")
        ev = client.get("/api/evaluation/events").json()
        self.assertEqual(ev["recall"], 0.75)
        self.assertEqual(ev["precision"], 0.0602)


if __name__ == "__main__":  # pragma: no cover
    unittest.main(verbosity=2)
