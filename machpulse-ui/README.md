# MachPulse UI

The frontend for **MachPulse**, an AI-powered industrial predictive maintenance decision support system for train compressor units.

Built with **React 19**, **TypeScript**, **Vite**, and **Tailwind CSS**.

---

## Overview

MachPulse UI provides a 5-view industrial dashboard for condition monitoring, diagnostic decomposition, and maintenance decision support:

1. **Overview**: Real-time compressor operating state, Mahalanobis anomaly distance, anomaly headroom, and key sensor readings.
2. **Telemetry**: Multi-channel historical sensor waveforms (Motor Current, TP2, TP3, H1, Oil Temp, DV) with an interactive chronological replay engine.
3. **Diagnostics**: Statistical attribution matrix and evidence-grounded AI decision explanation.
4. **Maintenance**: Decision-to-action workflow pipeline, service findings recording, and post-service verification.
5. **Validation**: Empirical evaluation metrics on the MetroPT-3 dataset against benchmark anomaly detectors.

The UI communicates directly with the MachPulse FastAPI backend at `http://localhost:8000/api`.

---

## Getting Started

### Prerequisites

- **Node.js** (v18+)
- **npm**

### Installation

```bash
npm install
```

### Development Server

```bash
npm run dev
```

The development server will start at `http://localhost:5173` (or the configured Vite port).

### Production Build & Typecheck

```bash
# Typecheck
npm run lint

# Build production bundle
npm run build

# Preview build locally
npm run preview
```

---

## Configuration

Environment variables can be configured via `.env` (template in `.env.example`):

```env
VITE_API_BASE_URL=http://localhost:8000/api
```
