"""Verification script for MachPulse P0 Correctness Pass."""
from fastapi.testclient import TestClient
from app.main import app
from app.services.replay_service import replay_service
from app.services.evidence_service import _operating_state_description, build_evidence

client = TestClient(app)

def test_api_endpoints():
    endpoints = [
        "/api/health",
        "/api/machine/health",
        "/api/machine/telemetry",
        "/api/quality/indicators",
        "/api/evaluation/events",
        "/api/evaluation/baselines",
        "/api/evaluation/summary",
        "/api/ai/status",
    ]
    print("=== 1. VERIFYING 8 REQUIRED API ENDPOINTS ===")
    for ep in endpoints:
        res = client.get(ep)
        assert res.status_code == 200, f"Endpoint {ep} failed with status {res.status_code}"
        print(f"  [OK] {ep} -> HTTP {res.status_code}")

def test_telemetry_consistency():
    print("\n=== 2. VERIFYING TELEMETRY OPERATING-STATE CONSISTENCY ===")
    replay_service._load_data()
    replay_service._current_index = len(replay_service._telemetry_data) - 1
    history = client.get("/api/machine/telemetry?limit=200").json()
    assert isinstance(history, list), f"Expected list from telemetry, got {type(history)}"
    assert len(history) > 0, "No telemetry history returned"
    
    contradictions = 0
    state_counts = {"off": 0, "offloaded": 0, "loaded": 0, "unknown": 0}
    for pt in history:
        mc = pt.get("motor_current")
        st = pt.get("operating_state", "unknown").lower()
        state_counts[st] = state_counts.get(st, 0) + 1
        
        if mc is None:
            if st != "unknown":
                print(f"  [FAIL] null mc labeled as {st}")
                contradictions += 1
            continue
            
        if mc < 0.5 and st != "off":
            print(f"  [FAIL] mc={mc}A labeled as {st}")
            contradictions += 1
        elif 0.5 <= mc <= 6.0 and st != "offloaded":
            print(f"  [FAIL] mc={mc}A labeled as {st}")
            contradictions += 1
        elif mc > 6.0 and st != "loaded":
            print(f"  [FAIL] mc={mc}A labeled as {st}")
            contradictions += 1
            
    print(f"  Checked {len(history)} telemetry points across states: {state_counts}")
    print(f"  Contradictions found: {contradictions}")
    assert contradictions == 0, f"Found {contradictions} state contradictions in telemetry"

def test_state_reasoning_scenarios():
    print("\n=== 3. VERIFYING OFF / OFFLOADED / LOADED REASONING DESCRIPTIONS ===")
    
    # 1. OFF observation test
    desc_off = _operating_state_description("off", 0.04)
    print(f"  OFF: {desc_off}")
    assert "< 0.5 A" in desc_off and "Machine idle" in desc_off
    
    # 2. OFFLOADED observation test
    desc_offloaded = _operating_state_description("offloaded", 1.325)
    print(f"  OFFLOADED: {desc_offloaded}")
    assert "0.5-6.0 A" in desc_offloaded and "Compressor running unpressurized" in desc_offloaded
    
    # 3. LOADED observation test
    desc_loaded = _operating_state_description("loaded", 7.82)
    print(f"  LOADED: {desc_loaded}")
    assert "> 6.0 A" in desc_loaded and "Compressor actively pumping" in desc_loaded

def test_machine_health_and_evidence_pack():
    print("\n=== 4. VERIFYING MACHINE HEALTH RESPONSE & ANOMALY HEADROOM ===")
    # Replay start at index with active telemetry to test live health
    replay_service._current_index = 25
    health = client.get("/api/machine/health").json()
    st = health["operating_state"].lower()
    mc = health["sensor_readings"]["motor_current_amps"]
    
    print(f"  Health Observation Motor Current: {mc} A")
    print(f"  Health Observation Operating State: {st}")
    
    # Assert consistency
    if mc is not None:
        if mc < 0.5:
            assert st == "off", f"Expected 'off' for mc={mc}, got {st}"
        elif 0.5 <= mc <= 6.0:
            assert st == "offloaded", f"Expected 'offloaded' for mc={mc}, got {st}"
        else:
            assert st == "loaded", f"Expected 'loaded' for mc={mc}, got {st}"

    # Verify EvidencePack has Anomaly headroom
    evidence = build_evidence()
    print(f"  EvidencePack Anomaly Interpretation Note: {evidence.anomaly.interpretation_note}")
    assert "Anomaly headroom" in evidence.anomaly.interpretation_note
    print(f"  EvidencePack Step 2 Reasoning Description: {evidence.observation.operating_state_description}")
    if mc is not None:
        assert str(round(mc, 3)) in evidence.observation.operating_state_description
