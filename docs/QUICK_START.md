# Quick Start 🚀 — Signal-to-Action Agent

> For developers who want to clone, run, and verify the Signal-to-Action Agent locally in minutes.

Signal-to-Action Agent is a governed multi-agent AI workflow (an "AI Chief of Staff for revenue teams") that turns fragmented customer signals into explainable, human-approved next-best actions. It runs fully on synthetic data with zero LLM keys.

- Live frontend: https://ventureos-signal-to-action-agent.vercel.app (Vercel)
- Live API: https://signal-to-action-api.onrender.com (Render)
- Repo: https://github.com/amit1858/ventureos-signal-to-action-agent

> Note: The hosted API runs on Render's free tier. The first request after idle can take ~50s to wake the service.

## Prerequisites

- Python 3.12+
- Node.js 18+
- npm
- Optional: a HubSpot private-app token (test portal only)
- Optional: a Serper API key for external signals

The application runs end-to-end on synthetic data with `MODEL_PROVIDER=mock`. Both optional integrations can be left disabled.

## Clone

```bash
git clone https://github.com/amit1858/ventureos-signal-to-action-agent.git
cd ventureos-signal-to-action-agent
```

## Backend setup

```bash
cd services/api
python -m venv .venv
```

Activate the virtual environment:

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
```

```bash
# macOS / Linux (bash)
source .venv/bin/activate
```

Install dependencies, generate the one-time synthetic dataset, and start the API:

```bash
pip install -r requirements.txt
python data/generate_synthetic_data.py
python -m uvicorn main:app --reload --port 8000
```

The synthetic generator seeds a deterministic dataset (SEED=2026, 6 archetypes). The API serves on http://localhost:8000 with interactive Swagger docs at http://localhost:8000/docs.

## Frontend setup

In a separate terminal:

```bash
cd apps/web
npm install
npm run dev
```

The frontend serves on http://localhost:3000.

Point the frontend at your local backend by creating `apps/web/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Environment variables

### Backend (services/api)

| Name | Required? | Default | Purpose |
| --- | --- | --- | --- |
| `MODEL_PROVIDER` | No | `mock` | Selects the model layer. `mock` is the deterministic baseline and needs no keys. |
| `HUBSPOT_ENABLED` | No | disabled | Turns the HubSpot connector on. |
| `HUBSPOT_ACCESS_TOKEN` | No | unset | HubSpot private-app token (`pat-...`), test portal only. |
| `HUBSPOT_AUTO_SYNC_ON_STARTUP` | No | disabled | Syncs the HubSpot test portal on startup. |
| `HUBSPOT_WRITEBACK_ENABLED` | No | disabled | Enables CRM write-back (still requires human approval). |
| `EXTERNAL_SIGNALS_ENABLED` | No | disabled | Enables advisory external signals. |
| `EXTERNAL_SIGNALS_PROVIDER` | No | `serper` | External signals provider. |
| `SERPER_API_KEY` | No | unset | Serper API key for external signals. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `NVIDIA_API_KEY` | No | intentionally unset | Provider LLM keys are NOT set server-side. See BYOK. |

### Frontend (apps/web)

| Name | Required? | Default | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | No | `http://localhost:8000` | Base URL the frontend uses to reach the API. |

## Verify it works

Check API health (expects status ok and the six agent names):

```bash
curl http://localhost:8000/api/health
```

Inspect the dataset summary, scoring weights, and suggested queries:

```bash
curl http://localhost:8000/api/meta
```

Request recommendations:

```bash
curl -X POST http://localhost:8000/api/recommendations \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"Which accounts need attention this week?\", \"limit\": 10}"
```

Then open http://localhost:3000 in your browser to view the dashboard.

## Optional integrations

- HubSpot (test portal): set `HUBSPOT_ENABLED` and `HUBSPOT_ACCESS_TOKEN` to a disposable test-portal token. Write-back stays disabled in demo mode and always requires human approval.
- Serper external signals: set `EXTERNAL_SIGNALS_ENABLED`, `EXTERNAL_SIGNALS_PROVIDER=serper`, and `SERPER_API_KEY`. External signals are advisory only and never change ranking.
- BYOK from the browser: optionally connect your own OpenAI, Anthropic Claude, or NVIDIA Nemotron key from the UI. Keys live only in browser sessionStorage and are never sent to or stored on the server.

## Developer Diagnostics

Press `Ctrl+D` (Windows/Linux) or `Cmd+D` (macOS) to open the in-app Developer Diagnostics panel. It shows the active API endpoint and backend health. It is hidden by default in production and never displays secrets.

## Common troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| First hosted request hangs ~50s | Render free tier cold start | Wait for the service to wake, then retry. |
| Browser requests fail / CORS errors | API base URL mismatch | Set `NEXT_PUBLIC_API_BASE_URL` to your running backend URL. |
| Backend won't start: port in use | Port 8000 already bound | Stop the other process or run uvicorn on another port. |
| Empty data / no accounts or signals | Synthetic dataset not generated | Run `python data/generate_synthetic_data.py`. |
| Blank dashboard | `NEXT_PUBLIC_API_BASE_URL` points at the wrong backend | Fix the value in `apps/web/.env.local` and restart `npm run dev`. |

## Expected outputs

- A healthy `GET /api/health` returns `status: ok`, the active model, and the six agent names (Signal Ingestion, Account Health, Opportunity, Governance, Action, Communication).
- `GET /api/meta` reports the dataset summary (99 accounts, 108 signals, 99 notes, 100 contacts, 100 deals, 207 activities), scoring weights, and suggested queries.
- `POST /api/recommendations` returns up to 10 explainable recommendations per run.
- The dashboard at http://localhost:3000 loads the Command Center with portfolio and recommendation views populated from synthetic data.

## Related documentation

- [Product Overview](PRODUCT_OVERVIEW.md)
- [Architecture](ARCHITECTURE.md)
- [Agent Architecture](AGENT_ARCHITECTURE.md)
- [Governance](GOVERNANCE.md)
- [Demo Guide](DEMO_GUIDE.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [FAQ](FAQ.md)
- [Roadmap](ROADMAP.md)
- [Repository README](../README.md)
