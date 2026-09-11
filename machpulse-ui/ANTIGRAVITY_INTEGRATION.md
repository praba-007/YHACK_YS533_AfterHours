# MachPulse Friend UI

This package contains the friend-provided MachPulse UI.

## Integration instruction
Treat the existing UI in this package as the visual source of truth. Preserve the layout, styling, typography, colors, component structure, and interactions as-is.

Connect this UI to the existing MachPulse FastAPI backend and real ML outputs. Do not redesign the UI and do not replace the existing ML/backend.

Existing backend endpoints:
- GET /api/health
- GET /api/machine/health
- GET /api/machine/telemetry?limit=...
- GET /api/quality/indicators
- GET /api/evaluation/events
- GET /api/evaluation/baselines
- GET /api/evaluation/summary

Important: this UI package includes local/static data files (for example src/data/mockEquipment.ts and src/data/metroPt3Data.ts). Treat them as UI/demo assets only. Replace their data usage with live MachPulse API data where the existing backend provides the corresponding information, while preserving the visual presentation.
