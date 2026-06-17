# Signal-to-Action Agent

> **A governed AI assistant for customer-facing teams.**
> It reads CRM data, market signals, and account health, identifies where
> sellers should focus this week, explains why, recommends next actions,
> and prepares CRM-ready outputs — with a human in the loop on every step
> that touches the customer record.

[![Team](https://img.shields.io/badge/Team-VentureOS-blue)](.) [![Hackathon](https://img.shields.io/badge/Hackathon-India%20Agentic%20AI%202026-orange)](.) [![Track](https://img.shields.io/badge/Track-A%3A%20Agentic%20Workflows-green)](.)

> 🚀 **Live demo:** **https://ventureos-signal-to-action-agent.vercel.app**
> &nbsp;·&nbsp; **API:** https://signal-to-action-api.onrender.com
>
> _The backend runs on Render's free tier. The first request after a quiet
> period can take ~50 seconds to wake. Give it a moment and refresh._

---

## TL;DR

| | |
|---|---|
| **What** | An AI Chief of Staff for revenue teams. Answers *"Which accounts need attention this week and why?"* every Monday morning. |
| **How** | Governed multi-agent workflow with deterministic ranking, optional BYOK LLM enrichment, and a hard human approval gate before anything reaches CRM. |
| **Why it matters** | A VP signing off on outbound to 40 accounts a week needs the same answer every Monday from the same data. LLMs help explain; the governed engine decides. |
| **Trust posture** | AI helps explain and recommend. **AI does not determine priority, change governance, or execute CRM actions.** |
| **BYOK** | Users connect OpenAI, Anthropic, or NVIDIA from the browser. Keys live only in `sessionStorage`. Nothing is persisted server-side. |
| **Status** | Phase 6 complete · deployed · executive-demo ready. |

---

## The product vision

**AI Chief of Staff for customer-facing teams.**

The product continuously monitors customer health, identifies risk and
opportunity, recommends next actions, supports multi-provider reasoning,
and helps teams keep CRM up to date — *without removing human control*.

Where this is heading: the seller / CSM opens their browser on Monday,
the assistant has already triaged the book overnight, every priority
account has a recommended action with cited evidence and a draft CRM
note, and the human's job is review, refine, approve.

---

## How it works (in 7 steps)

```
   ┌──────────────┐     ┌────────────────────┐     ┌──────────────────────┐
   │  CRM data    │     │  External market   │     │  Governed Decision   │
   │  (HubSpot)   │ ──▶ │  signals (Serper)  │ ──▶ │  Engine — ranks &    │
   └──────────────┘     └────────────────────┘     │  scores accounts     │
                                                    └──────────┬───────────┘
                                                               │
                                                               ▼
   ┌──────────────────┐     ┌────────────────────┐     ┌──────────────────┐
   │  CRM write-back  │ ◀── │  Human approval    │ ◀── │  BYOK LLM        │
   │  (HubSpot tasks  │     │  (approve / edit / │     │  reasoning       │
   │  + notes)        │     │   reject)          │     │  (advisory only) │
   └──────────────────┘     └────────────────────┘     └──────────────────┘
```

1. **CRM data** is pulled from a HubSpot test portal (40 demo SMB accounts).
2. **External intelligence** comes from a pluggable provider layer (`serper`
   or `searchapi`, optional, default off).
3. **Governed Decision Engine** runs a deterministic, auditable ranking
   across the portfolio — risk, opportunity, confidence, recommended
   action — using rules + evidence.
4. **BYOK LLM reasoning** (optional) enriches the top-N recommendations
   with executive summaries, conversation strategies, and CRM note drafts.
5. **Decision ledger** captures every agent invocation, evidence used,
   reasoning summary, confidence and caveats.
6. **Human approval** is required before anything leaves the system. The
   approval gate is a hard contract — not a UI nicety.
7. **CRM write-back** creates HubSpot tasks and notes only after approval.

---

## What AI does and does NOT do

| AI helps with | AI does NOT |
|---|---|
| ✓ Executive summaries | ✗ Determine ranking |
| ✓ Conversation strategies | ✗ Change prioritization |
| ✓ CRM note drafts | ✗ Bypass governance |
| ✓ Market intelligence synthesis | ✗ Approve actions |
| ✓ Risk narratives | ✗ Write to CRM automatically |
| ✓ Opportunity narratives | |

This boundary is enforced in code (the LLM never touches the
`priority_rank` / `priority_score` / `confidence` fields) **and** visible
to the user in real time via the AI Reasoning Status chip and the
*"How AI is helping"* panel in the Trust & Governance view.

---

## Bring Your Own Key (BYOK)

The product ships with a **deterministic baseline** that needs no API
keys. Users who want LLM-enriched narrative can connect their own
provider from the browser.

- Supported providers (Phase 6): **OpenAI**, **Anthropic Claude**, **NVIDIA Nemotron**.
- Keys are stored **only** in browser `sessionStorage`.
- Keys are **never** committed, **never** persisted to a database,
  **never** logged, **never** returned from any API, and **never** set in
  the Render environment.
- A session key travels in the request body of one provider call and is
  used for that single request only.
- Closing the browser tab clears the key.
- The deterministic engine remains the fallback if the LLM call fails.
- Live model discovery: when you connect a provider, we call the
  provider's own model-list endpoint so you never have to type a model
  identifier.

---

## Architecture (one-line per layer)

| Layer | Tech | Where it runs |
|---|---|---|
| Frontend | Next.js 14 + TypeScript + Tailwind | Vercel |
| Backend | FastAPI + Pydantic + SQLite | Render |
| CRM connector | HubSpot REST + Private App token | Backend |
| External intelligence | Serper / SearchAPI (pluggable) | Backend |
| Reasoning | Governed Decision Engine (deterministic) + BYOK provider framework | Backend orchestrator, browser-supplied keys |
| Governance | Evaluation Center, trust controls, approval gate, decision ledger | Frontend + backend |

The repo also contains an NVIDIA NIM adapter stub for the
hackathon-eligible track and an evaluation harness measured on the
latest run.

For the full architecture deep-dive see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Deployment

| | URL | Host |
|---|---|---|
| **Frontend** | https://ventureos-signal-to-action-agent.vercel.app | Vercel |
| **Backend** | https://signal-to-action-api.onrender.com | Render |
| **Repo** | https://github.com/amit1858/ventureos-signal-to-action-agent | GitHub `main` |

### Backend environment variables (required)

```bash
HUBSPOT_ENABLED=true
HUBSPOT_ACCESS_TOKEN=pat-xxxxxxxxxxxxxxxx     # test portal only
HUBSPOT_AUTO_SYNC_ON_STARTUP=true
HUBSPOT_WRITEBACK_ENABLED=true

EXTERNAL_SIGNALS_ENABLED=true
EXTERNAL_SIGNALS_PROVIDER=serper
SERPER_API_KEY=your-serper-key

MODEL_PROVIDER=mock                            # deterministic baseline
```

### Backend environment variables — explicitly NOT required

```bash
# OPENAI_API_KEY      ← do NOT set on the server
# ANTHROPIC_API_KEY   ← do NOT set on the server
# NVIDIA_API_KEY      ← do NOT set on the server
```

These are intentionally absent. Provider credentials are **browser-supplied
session keys**, not server environment variables. Setting them server-side
would defeat the BYOK security model.

### Frontend environment variables

```bash
NEXT_PUBLIC_API_BASE_URL=https://signal-to-action-api.onrender.com
```

---

## Documentation

| File | For whom |
|---|---|
| [`docs/PRODUCT_OVERVIEW.md`](docs/PRODUCT_OVERVIEW.md) | PMs, business leaders, hackathon judges, non-technical reviewers |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Engineering leaders, future contributors |
| [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) | 10-minute executive demo flow |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Strategic stakeholders, partners |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | DevOps / ops |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | On-call / live demo operators |
| [`docs/TESTING.md`](docs/TESTING.md) | QA / contributors |
| [`docs/evaluation-plan.md`](docs/evaluation-plan.md) | Eval engineers |
| [`docs/hubspot-integration.md`](docs/hubspot-integration.md) | CRM integration engineers |
| [`docs/nvidia-integration-plan.md`](docs/nvidia-integration-plan.md) | NVIDIA-track reviewers |
| [`docs/dataset-schema.md`](docs/dataset-schema.md) | Data engineers |

---

## Local development

```powershell
# 1. Backend
cd services/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python generate_synthetic_data.py        # one-time synthetic dataset
python -m uvicorn main:app --reload --port 8000

# 2. Frontend (separate terminal)
cd apps/web
npm install
npm run dev                              # http://localhost:3000
```

Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` in `apps/web/.env.local`
to point the frontend at your local backend.

---

## Project status

| Phase | What shipped |
|---|---|
| 1 | Agentic backend MVP + synthetic data |
| 2 | Enterprise frontend polish |
| 3 | Demo-first landing |
| 4 | HubSpot connector · external signals · Executive Decision Brief · CRM write-back |
| 5.0A–C | Decision provider framework · true BYOK UI · live model discovery · production validation |
| 5.1 | Executive demo hardening (business language, Provider Consensus, Production Readiness matrix) |
| **6** | **AI Reasoning Experience & Transparency Layer** |

What's next: see [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## License

This is a hackathon project by **Team VentureOS**. Demo CRM data only.
No real customer information.
