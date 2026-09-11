"""
Acceptance unit tests for Historical Telemetry Replay (Phase 5C.1).
"""
import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.services.replay_service import replay_service

client = TestClient(app)


class TestReplayApi(unittest.TestCase):
    def setUp(self):
        replay_service.reset()

    def tearDown(self):
        replay_service.reset()

    def test_replay_status_endpoint(self):
        r = client.get("/api/replay/status")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("running", data)
        self.assertIn("current_timestamp", data)
        self.assertIn("speed", data)
        self.assertIn("total_observations", data)
        self.assertIn("mode", data)
        self.assertIn("METROPT-3", data["mode"])

    def test_replay_start_pause_reset_cycle(self):
        # Start
        r_start = client.post("/api/replay/start")
        self.assertEqual(r_start.status_code, 200)
        self.assertTrue(r_start.json()["running"])
        self.assertEqual(r_start.json()["current_index"], 0)

        # Current observation
        r_curr = client.get("/api/replay/current")
        self.assertEqual(r_curr.status_code, 200)
        curr_data = r_curr.json()
        self.assertEqual(curr_data["timestamp"], "2020-09-01 02:00:00")
        self.assertEqual(curr_data["decision"], "INSUFFICIENT EVIDENCE")

        # Pause
        r_pause = client.post("/api/replay/pause")
        self.assertEqual(r_pause.status_code, 200)
        self.assertFalse(r_pause.json()["running"])

        # Reset
        r_reset = client.post("/api/replay/reset")
        self.assertEqual(r_reset.status_code, 200)
        self.assertEqual(r_reset.json()["current_index"], 0)
        self.assertFalse(r_reset.json()["running"])

    def test_replay_speed_control(self):
        r1 = client.post("/api/replay/speed", json={"speed": 5})
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r1.json()["speed"], 5)

        r2 = client.post("/api/replay/speed", json={"speed": 20})
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.json()["speed"], 20)


if __name__ == "__main__":
    unittest.main()
