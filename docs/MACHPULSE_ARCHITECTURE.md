# MACH PULSE — System Architecture & Data Flow

```
                                      MACH PULSE
                                           |
                 +-------------------------+-------------------------+
                 |                                                   |
       Teammate / Stitch UI                                  FastAPI Backend
       (React 19 + TypeScript)                               (Python 3.12 / Uvicorn)
         [Port 3000 / 5173]                                        [Port 8000]
                 |                                                   |
                 |                     HTTP REST JSON                |
                 +------------------ [apiService (api.ts)] --------->+
                                                                     |
                                                          +----------+----------+
                                                          |  app/services/      |
                                                          |  ml_service.py      |
                                                          +----------+----------+
                                                                     |
                                                        Precomputed Verified Cache
                                                                     |
                                                  +------------------+------------------+
                                                  |                                     |
                                                  v                                     v
                                       pipeline_results.json                  recent_telemetry.json
                                                  ^                                     ^
                                                  |                                     |
                                                  +------------------+------------------+
                                                                     |
                                                           Pipeline Execution
                                                           (ml/pipeline.py)
                                                                     |
                                                  +------------------+------------------+
                                                  |                  |                  |
                                                  v                  v                  v
                                             Data Quality     Operating States    Mahalanobis Model
                                             (ml/quality.py)  (ml/preprocessing)  (ml/model.py)
                                                  |                  |                  |
                                                  +------------------+------------------+
                                                                     |
                                                           Feature Engineering
                                                           (ml/features.py)
                                                                     |
                                                              1-Minute Grid
                                                           (1.52M -> 307K mins)
                                                                     |
                                                            Raw Sensor CSV
                                                  (data/MetroPT3(AirCompressor).csv)
```

---

## Detailed Component Layers

```
+---------------------------------------------------------------------------------------------------+
| 1. PRESENTATION LAYER (machpulse-ui: React 19 + TypeScript + Vite + Tailwind CSS v4)              |
|                                                                                                   |
|  [Header.tsx]           Global System Header, SCADA Cloud Connection Status & Branding           |
|  [EquipmentCard.tsx]    Asset Condition Cards (APU-COMP-03 live synced to MetroPT-3)              |
|  [EquipmentDetailModal] Diagnostics Modal: Live Waveforms, Feature Attribution, Dispatch          |
|  [MetroPt3View.tsx]     Train APU Compressor ML Studio: Provenance, Splits, Benchmark, Attribution|
|  [AnalyticsView.tsx]    Fleet-wide ISO 10816 distributions, Failure Mode Pareto Analysis          |
|  [MaintenanceSchedule]  Work Orders, Lockout / Tagout (LOTO) procedures, Technician Dispatch      |
|  [AuditLogView.tsx]     SHA-256 Chained Compliance Logs (GDPR / ISO 55000 audit trail)            |
|  [ApiExplorerView.tsx]  Interactive Live REST API Tester for all 7 FastAPI endpoints              |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  | HTTP Fetch (JSON)
                                                  v
+---------------------------------------------------------------------------------------------------+
| 2. API CLIENT SERVICE LAYER (machpulse-ui/src/services/api.ts)                                    |
|                                                                                                   |
|  apiService.getHealth()              -> GET /api/health                                            |
|  apiService.getMachineHealth()       -> GET /api/machine/health                                    |
|  apiService.getRecentTelemetry(60)   -> GET /api/machine/telemetry?limit=60                       |
|  apiService.getQualityIndicators()   -> GET /api/quality/indicators                                |
|  apiService.getFailureEvents()       -> GET /api/evaluation/events                                 |
|  apiService.getBaselinesComparison() -> GET /api/evaluation/baselines                              |
|  apiService.getPipelineSummary()     -> GET /api/evaluation/summary                                |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  | TCP/IP (localhost:8000)
                                                  v
+---------------------------------------------------------------------------------------------------+
| 3. BACKEND SERVICE LAYER (backend/: FastAPI + Uvicorn + Pydantic v2)                              |
|                                                                                                   |
|  app/main.py                         FastAPI Application Factory, CORS (Ports 3000/5173), Routing |
|  app/api/health.py                   Service Liveness & Health Route                               |
|  app/api/machine.py                  Latest Machine State, Telemetry Series & Anomaly Score Traj.  |
|  app/api/quality.py                  Data Quality Indicators, Gaps, and Gating Thresholds          |
|  app/api/evaluation.py               Ground-Truth Failure Events (F1-F4), Baselines, Model Summary |
|  app/services/ml_service.py          Cached Singleton Ingestion of ML Evaluation Artifacts         |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  | In-Memory Cache (< 5ms response)
                                                  v
+---------------------------------------------------------------------------------------------------+
| 4. VERIFIED ML ARTIFACTS (ml/evaluation/)                                                         |
|                                                                                                   |
|  pipeline_results.json               Dataset metrics, 129 features, thresholds, F1-F4 evaluation   |
|  recent_telemetry.json               Chronological 1-minute grid sensor readings & Mahalanobis DM  |
+---------------------------------------------------------------------------------------------------+
                                                  ^
                                                  | Computed Offline (19.45s)
                                                  |
+---------------------------------------------------------------------------------------------------+
| 5. MACHINE LEARNING ENGINE (ml/)                                                                  |
|                                                                                                   |
|  data_loader.py                      Loads 1,516,948 rows @ 0.1Hz from MetroPT3 CSV                |
|  quality.py                          Quality gates: coverage fraction >= 0.6, frozen ratio <= 0.2  |
|  preprocessing.py                    Aggregates to 1-min median grid, segments OFF/OFFLOADED/LOADED|
|  features.py                         Builds 129 multi-window features (1h, 6h, 24h rolling stats)  |
|  model.py                            State-stratified Ledoit-Wolf shrinkage Mahalanobis distance   |
|  decision.py                         Threshold calibration (tau_elev=304.3, tau_sev=729.7), gates  |
|  pipeline.py                         Chronological execution: Train (Feb) -> Calib -> Test (F1-F4) |
+---------------------------------------------------------------------------------------------------+
                                                  ^
                                                  | File Ingestion
                                                  |
+---------------------------------------------------------------------------------------------------+
| 6. DATASET LAYER (data/)                                                                          |
|                                                                                                   |
|  data/MetroPT3(AirCompressor).csv    218 MB real industrial CSV (1,516,948 rows, 15 sensor cols)   |
|                                      Knorr-Bremse VV120-T compressor on Porto light rail MetroPT-3 |
+---------------------------------------------------------------------------------------------------+
```
