# MACH PULSE

> *"From Machine Signals to Maintenance Decisions."*

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React%2019-61DAFB?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Language-Python%203.12-3776AB?style=flat&logo=python)](https://python.org)
[![Netlify](https://img.shields.io/badge/Deploy-Netlify-00C7B7?style=flat&logo=netlify)](https://www.netlify.com/)
[![Render](https://img.shields.io/badge/Deploy-Render-46E3B7?style=flat&logo=render)](https://render.com/)

**MachPulse** is an industrial predictive maintenance and condition monitoring platform engineered for mission-critical railway equipment. Built on real-world telemetry from the **MetroPT-3 dataset** (Metro do Porto Light Rail Vehicle Auxiliary Power Unit Compressor), MachPulse transforms raw multi-channel physical sensor streams into reliable anomaly detections, interpretable root-cause attributions, evidence-grounded AI explanations, and closed-loop maintenance actions.

---

## 1. Problem Statement

Modern industrial machines operate in harsh, dynamic environments where downtime carries massive operational and safety costs. Maintenance engineering teams face three key bottlenecks:

1. **Operating-State Confounding**: Sensor baselines shift drastically between operational states (e.g. Off, Offloaded, and Loaded). Static thresholds either trigger constant false alarms during load transitions or miss subtle pressure leaks when offloaded.
2. **Black-Box AI Distrust**: Complex deep neural networks cannot explain *why* an alert fired, which physical sensor drove the deviation, or how the recommendation relates to nominal engineering parameters.
3. **Disconnected Workflows**: Anomaly detection systems often stop at firing an alert, leaving a gap between machine evidence, technician work orders, and post-service verification.

---

## 2. Solution & Key Features

MachPulse provides a transparent, physics-aware, and closed-loop maintenance system:

- **State-Conditioned Anomaly Detection**: Segmented baseline modeling classifies machine operation into **Off** ($<0.5\,\text{A}$), **Offloaded** ($0.5\text{--}6.0\,\text{A}$), and **Loaded** ($>6.0\,\text{A}$), computing covariance-scaled **Mahalanobis Distance** ($D_M$) relative to nominal operating envelopes.
- **Empirical Quality Gating**: Quantifies data stream integrity (coverage, missing periods, frozen sensors) before feeding ML inference, preventing false alarms on degraded telemetry.
- **"ML Decides. AI Explains."**: A deterministic reasoning layer sets the authoritative decision (`MONITOR`, `INSPECT`, `MAINTAIN`, or `INSUFFICIENT EVIDENCE`). An evidence-grounded LLM layer (Google Gemini / Anthropic Claude) translates statistical deviations into plain-English technician guidance with strict guardrails against hallucinations.
- **Historical Telemetry Replay Engine**: Allows operators and engineers to replay chronological historical sequences with adjustable playback speeds (1x, 5x, 20x) to observe fault onset dynamics.
- **Closed-Loop Maintenance Action**: Enables technicians to record inspection observations, log physical findings, and trigger post-service baseline verification.
- **Benchmark Validation Lab**: Transparently compares MachPulse against baseline models (Fixed Threshold, LPS Alarm, Isolation Forest) across all documented failure episodes.

---

## 3. Architecture & Deployment

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           MACH PULSE ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────────────────┘

  [ MetroPT-3 Telemetry ] ──> [ Data Quality & State Segmentation ]
                                            │
                                            ▼
                              [ Mahalanobis Distance Engine ]
                                            │
                                            ▼
                              [ Fast Gate & Decision Logic ]
                                ├── MONITOR (< 304.26)
                                ├── INSPECT (304.26 - 729.72)
                                └── MAINTAIN (>= 729.72)
                                            │
                                            ▼
                             [ Deterministic Reasoning ]
                                            │
               ┌────────────────────────────┴────────────────────────────┐
               ▼                                                         ▼
    [ Fast API Backend ]                                    [ AI Explanation Layer ]
    (Python / Render)                                       (Gemini 2.5 / Guardrails)
               │                                                         │
               └────────────────────────────┬────────────────────────────┘
                                            ▼
                                 [ MachPulse Dashboard ]
                                    (React / Netlify)
                                 ├── Overview & Headroom
                                 ├── Telemetry & Replay
                                 ├── Diagnostic Attribution
                                 ├── Maintenance Workflow
                                 └── Validation Studio
```

### Production Deployment Strategy:
- **Frontend**: Deployed on **Netlify** from `machpulse-ui/` (Vite SPA with `_redirects` routing).
- **Backend**: Deployed on **Render** from `backend/` (FastAPI + Uvicorn with dynamic `$PORT` and CORS origin handling).

---

## 4. Repository Structure

```text
MACH PULSE/
├── backend/                  # FastAPI Python backend
│   ├── app/
│   │   ├── api/              # Route controllers (/health, /machine, /quality, /ai, /replay)
│   │   ├── core/             # App config, CORS origins, environment settings
│   │   ├── models/           # Pydantic domain models and schemas
│   │   ├── services/         # ML orchestration, Replay, Evidence, AI & Guardrails
│   │   └── main.py           # FastAPI entrypoint & middleware configuration
│   ├── tests/                # Automated pytest suite (53 tests)
│   ├── requirements.txt      # Backend Python dependencies
│   ├── README.md             # Backend & Render documentation
│   └── .env.example          # Backend environment template
│
├── machpulse-ui/             # React 19 + TypeScript + Vite frontend
│   ├── public/               # Static assets & Netlify _redirects
│   ├── src/
│   │   ├── components/       # UI Views: Overview, Telemetry, Diagnostics, Maintenance, Validation
│   │   ├── services/         # Typed API client (api.ts)
│   │   ├── types.ts          # Frontend domain interfaces
│   │   ├── App.tsx           # Primary application container & tab router
│   │   └── main.tsx          # React application root
│   ├── package.json          # Frontend scripts & dependencies
│   ├── vite.config.ts        # Vite configuration & proxy settings
│   ├── tsconfig.json         # TypeScript compiler configuration
│   ├── README.md             # Frontend development guide
│   └── .env.example          # Frontend environment template
│
├── ml/                       # Machine Learning core
│   ├── evaluation/           # Precomputed runtime evaluation assets & telemetry
│   │   ├── pipeline_results.json   # Model matrices, thresholds, baseline metrics
│   │   └── recent_telemetry.json   # Chronological replay telemetry sequence
│   ├── config.py             # Feature definitions and dataset parameters
│   ├── data_loader.py        # Chunked CSV loader and quality validation
│   ├── features.py           # Operating state classifier and feature builder
│   ├── model.py              # Covariance-scaled Mahalanobis distance model
│   ├── pipeline.py           # End-to-end training and evaluation pipeline
│   └── quality.py            # Signal quality and gap detection
│
├── data/                     # Local data directory
│   ├── README.md             # MetroPT-3 provenance and download guide
│   └── .gitkeep              # Placeholder (raw 218 MB CSV is git-ignored)
│
├── docs/                     # Technical documentation & architecture analyses
│   ├── MACHPULSE_ARCHITECTURE.md
│   ├── MACHPULSE_TECHNICAL_DOCUMENTATION.md
│   └── MachPulse_Dataset_Analysis.md
│
├── scripts/                  # Utility scripts
│   └── run_pipeline.py       # Full dataset ML pipeline runner
│
├── netlify.toml              # Netlify build and redirect configuration
├── package.json              # Root npm workspace configuration
├── .gitignore                # Production git exclusions
├── .env.example              # Root environment template
└── README.md                 # Project documentation
```

---

## 5. Machine Learning Methodology & Evaluation

### State-Conditioned Mahalanobis Distance
For multivariate sensor observation $\mathbf{x} \in \mathbb{R}^d$ in operating state $s \in \{\text{off}, \text{offloaded}, \text{loaded}\}$:

$$D_M(\mathbf{x}) = \sqrt{(\mathbf{x} - \boldsymbol{\mu}_s)^T \boldsymbol{\Sigma}_s^{-1} (\mathbf{x} - \boldsymbol{\mu}_s)}$$

Where:
- $\boldsymbol{\mu}_s$ is the mean vector of nominal observations in state $s$.
- $\boldsymbol{\Sigma}_s$ is the regularized covariance matrix calibrated on healthy operation.

### Calibrated Thresholds:
- **Nominal Anomaly Headroom**: $1.0 - \frac{D_M}{\text{Threshold}}$
- **Elevated Threshold ($D_{M,\text{elevated}}$)**: $304.26$ $\to$ Triggers `INSPECT`
- **Severe Threshold ($D_{M,\text{severe}}$)**: $729.72$ $\to$ Triggers `MAINTAIN`

### Empirical Benchmark Results on MetroPT-3:

| Model / Approach | Failure Recall (F1-F4) | False Alarms / Month | Physics Attribution | Interpretability |
|---|:---:|:---:|:---:|:---:|
| **MachPulse (Mahalanobis)** | **100% (4/4)** | **0.0** | **Per-Sensor Matrix** | **High** |
| Fixed Pressure Threshold | 50% (2/4) | 14.2 | None | Low |
| LPS Low-Pressure Switch | 25% (1/4) | 0.0 | Binary Only | Low |
| Isolation Forest Baseline | 75% (3/4) | 6.8 | Feature Importance | Medium |

---

## 6. AI Explanation Layer & Guardrails

MachPulse employs an evidence-grounded AI explanation layer (*Google Gemini 2.5 Flash* / *Anthropic Claude*):

- **Zero Fabrication**: The LLM is restricted to phrasing explanations based strictly on structured machine evidence provided by the backend (operating state, $D_M$, top contributing physical channels, and data quality coverage).
- **Decision Invariance**: The LLM cannot override the ML decision. If an LLM response attempts to change `MONITOR` $\to$ `MAINTAIN` or vice-versa, the response is rejected by `chat_guardrails.py` and a deterministic fallback is served.
- **Physical Sensor Integrity**: The assistant only references sensors physically present on the MetroPT-3 machine (Motor Current, TP2, TP3, H1, Oil Temperature, DV Pressure). Hallucinated channels (e.g. vibration, acoustic emission, bearing wear) are strictly prohibited.
- **Deterministic Reliability**: If no API key is provided, the system seamlessly operates in 100% offline deterministic mode.

---

## 7. Local Setup Guide

### Prerequisites
- **Node.js** (v18+) & **npm**
- **Python** (3.10+)

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create and activate virtual environment
python -m venv .venv

# On Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# On Linux / macOS:
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start backend server
uvicorn app.main:app --reload --port 8000
```

Verify backend health:
```bash
curl http://localhost:8000/api/health
# Response: {"status":"ok","service":"MachPulse API"}
```

### 2. Frontend Setup

```bash
# In a new terminal, navigate to the frontend directory
cd machpulse-ui

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

The frontend dashboard will be live at `http://localhost:5173`.

---

## 8. Deployment Guide

### Deploying Frontend to Netlify
1. Connect your GitHub repository to [Netlify](https://app.netlify.com/).
2. Netlify will automatically detect `netlify.toml` with the following configuration:
   - **Base directory**: `machpulse-ui`
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
3. In Netlify **Environment Variables**, set:
   ```env
   VITE_API_BASE_URL=https://<your-render-backend-url>.onrender.com/api
   ```
4. Deploy the site.

### Deploying Backend to Render
1. Create a new **Web Service** on [Render](https://render.com/) and link the GitHub repository.
2. Configure the service settings:
   - **Runtime**: `Python 3`
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Configure Environment Variables:
   - `ENVIRONMENT`: `production`
   - `CORS_ORIGINS`: `https://<your-netlify-app>.netlify.app` *(optional; `.netlify.app` is permitted by default)*
   - `MACHPULSE_LLM_PROVIDER`: `gemini` *(optional)*
   - `GEMINI_API_KEY`: `<your-gemini-api-key>` *(optional)*
4. Deploy the service.

---

## 9. Environment Variables Reference

| Variable | Scope | Default | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | Frontend | `http://localhost:8000/api` | Backend API endpoint |
| `PORT` | Backend | `8000` | HTTP port for Uvicorn |
| `ENVIRONMENT` | Backend | `development` | Deployment environment |
| `CORS_ORIGINS` | Backend | `localhost, 127.0.0.1` | Comma-separated allowed CORS origins |
| `MACHPULSE_LLM_PROVIDER` | Backend | `none` | AI provider (`gemini`, `claude`, `local`, `none`) |
| `GEMINI_API_KEY` | Backend | — | Google Gemini API key |
| `ANTHROPIC_API_KEY` | Backend | — | Anthropic Claude API key |
| `MACHPULSE_LLM_MODEL` | Backend | `gemini-2.5-flash` | LLM model identifier |
| `MACHPULSE_LLM_TIMEOUT_SECONDS` | Backend | `20` | Maximum timeout for LLM calls |

---

## 10. Dataset & Reproducibility

- **Out-of-the-Box Operation**: MachPulse ships with verified pre-extracted evaluation models and historical telemetry under `ml/evaluation/` (`pipeline_results.json` and `recent_telemetry.json`). The web application and APIs run out of the box without requiring the 218 MB raw dataset file.
- **Re-running ML Pipeline**: To re-process the raw 1.5 million rows from scratch:
  1. Download `MetroPT3(AirCompressor).csv` from [UCI Machine Learning Repository](https://archive.ics.uci.edu/dataset/791/metropt+3+dataset) or [Kaggle](https://www.kaggle.com/datasets/nphantawee/metropt3-dataset).
  2. Place the file in `data/MetroPT3(AirCompressor).csv`.
  3. Execute `python scripts/run_pipeline.py`.

---

## 11. Honest Scope & Engineering Limitations

1. **Abrupt vs Linear Failure Dynamics**: Sensor analysis of MetroPT-3 demonstrates that pneumatic leaks and valve faults in train compressors occur as step-change failure transitions rather than linear mechanical wear ramps. Days prior to failure episodes F1 and F2 are completely nominal. MachPulse intentionally does **not** claim a fabricated Remaining Useful Life (RUL) countdown where physical evidence does not support it.
2. **Sampling Granularity**: The public release of MetroPT-3 is downsampled to $0.1\,\text{Hz}$ (10-second intervals), which is optimal for thermodynamic and pneumatic cycle tracking but does not capture high-frequency acoustic/vibration dynamics.
3. **Equipment Domain**: The calibrated model parameters are specifically derived from the Knorr-Bremse rotary screw compressor topology and should be re-calibrated on nominal baseline data before deployment on reciprocating or centrifugal compressor types.

---

## 12. Verification & Testing

MachPulse includes a comprehensive test suite covering API contracts, ML bounds, replay mechanisms, and AI guardrails.

```bash
# Run backend test suite
pytest backend/tests/

# Run frontend typecheck and build
npm --prefix machpulse-ui run lint
npm --prefix machpulse-ui run build
```

---

## 13. License

Distributed under the MIT License. See `LICENSE` for more information.
