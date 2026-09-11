# MachPulse Backend

FastAPI backend service powering predictive maintenance intelligence and health APIs for industrial machinery.

---

## Setup & Local Development

### 1. Create Virtual Environment

From the `backend` directory:

```powershell
python -m venv .venv
```

### 2. Activate Virtual Environment

**Windows PowerShell:**
```powershell
.\.venv\Scripts\Activate.ps1
```

**Linux / macOS:**
```bash
source .venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Run Development Server

```bash
uvicorn app.main:app --reload --port 8000
```

The API will be available at:
- **Root**: `http://localhost:8000/`
- **Health Check**: `http://localhost:8000/api/health`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`
- **Redoc**: `http://localhost:8000/redoc`

---

## Deployment on Render

To deploy this FastAPI service on Render as a **Web Service**:

1. **Repository**: Connect your GitHub repository.
2. **Environment**: `Python 3`
3. **Root Directory**: `backend` (or leave empty if using root `uvicorn backend.app.main:app`)
4. **Build Command**: `pip install -r requirements.txt`
5. **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. **Environment Variables**:
   - `PORT`: (Render sets this automatically)
   - `ENVIRONMENT`: `production`
   - `CORS_ORIGINS`: `https://<your-netlify-subdomain>.netlify.app` *(optional, `*.netlify.app` is allowed by default)*
   - `MACHPULSE_LLM_PROVIDER`: `gemini` *(optional: `gemini` | `claude` | `none`)*
   - `GEMINI_API_KEY`: *(optional Google Gemini API key)*
   - `ANTHROPIC_API_KEY`: *(optional Anthropic API key)*

---

## Health Check Endpoint

```http
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "service": "MachPulse API"
}
```

---

## AI Explanation & Technician Assistant Layer

`POST /api/ai/explain` and `POST /api/ai/chat` provide structured, evidence-grounded AI decision support.

```text
ml_service outputs -> evidence_service -> reasoning_service (deterministic)
                   -> LLM provider (explain only) -> output_validator -> response
```

*"ML decides. AI explains."* The LLM never sets the anomaly score, health state, risk level, RUL, or the decision. The deterministic reasoning layer picks the single allowed recommended action; any LLM response that attempts to alter the decision or introduces hallucinated sensor channels is rejected and a deterministic fallback is served. `INSUFFICIENT EVIDENCE` is answered deterministically without calling external models.

The layer is **optional**: with no API key or provider configured (the default), endpoints return deterministic explanations and every other endpoint operates normally.

Configuration (environment variables, see `../.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `MACHPULSE_LLM_PROVIDER` | `none` | `gemini` \| `claude` \| `local` \| `none` |
| `GEMINI_API_KEY` | — | credential for Google Gemini provider |
| `MACHPULSE_LLM_MODEL` | `gemini-2.5-flash` | Gemini model ID |
| `ANTHROPIC_API_KEY` | — | credential for Anthropic Claude provider |
| `MACHPULSE_LLM_TIMEOUT_SECONDS` | `20` | per-call wall-clock budget |
| `CORS_ORIGINS` | — | comma-separated allowed origins (default allows localhost & `*.netlify.app`) |

`GET /api/ai/status` reports which provider is active (`GEMINI` / `CLAUDE` / `LOCAL` / `DETERMINISTIC`).

---

## Automated Tests

Run the test suite:

```bash
pytest tests/
```
