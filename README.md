# Signal-to-Action Agent

**An enterprise AI product that continuously monitors customer portfolios, detects business risk and growth opportunities, recommends governed actions, and writes approved actions back to CRM.**

[![Team](https://img.shields.io/badge/Team-VentureOS-blue)](.) [![Hackathon](https://img.shields.io/badge/Hackathon-India%20Agentic%20AI%202026-orange)](.) [![Track](https://img.shields.io/badge/Track-A%3A%20Agentic%20Workflows-green)](.)

---

## Executive summary

> **Traditional CRM tells you what happened. Signal-to-Action tells you what to do next.**

It reads customer signals from HubSpot, prioritizes accounts, explains *why* each account
matters, and waits for **human approval** before writing anything back to the CRM.

---

## Problem statement

Sales and growth teams manage dozens or hundreds of accounts, but every week they struggle with
five questions:

1. **Which accounts need attention today?**
2. **Why do those accounts matter?**
3. **What action should I take?**
4. **Can I trust this recommendation?**
5. **How do I update the CRM after I decide?**

A CRM can store the data needed to answer these questions, but it does not answer them. Sellers end
up reacting to whoever shouted loudest instead of proactively managing their book of business.
High-potential accounts slip through the cracks and renewals start too late.

Signal-to-Action Agent turns that raw CRM data into a short, ranked, **explainable** list of actions —
and never touches the CRM without a human saying yes.

---

## Solution — what the product does

- **Syncs accounts** from a **HubSpot test CRM** (40 demo companies) — or runs fully offline on a
  **synthetic dataset**.
- **Analyzes account signals** — spend movement, product usage, engagement, support risk, campaign
  response, renewal windows, and time since last contact.
- **Detects risk and growth opportunities** using a deterministic business engine.
- **Creates an Executive Morning Brief** — a plain-English summary of what changed overnight.
- **Ranks priority accounts** and explains **"why this account, why now."**
- **Shows evidence and a confidence score** behind every recommendation.
- **Requires human approval** — nothing is autonomous.
- **Writes approved tasks/notes back to HubSpot** (when write-back is enabled).
- **Supports synthetic mode** as a always-available fallback for demos with no internet or no CRM.

---

## Why this product is different (it is not a chatbot)

This is an **auditable signal-to-action workflow**, not a generic LLM wrapper:

- **The LLM is not the source of truth.** A deterministic business engine computes the rankings,
  risk, and opportunity. The model only *explains* the facts and drafts communications.
- **Six specialized agents** run in a fixed, logged sequence — not a free-form conversation.
- **Typed contracts** (Pydantic) define every agent's input and output.
- **Every recommendation carries evidence + a confidence score.**
- **Human-in-the-loop approval** is mandatory before any CRM write.
- **A decision ledger** records every run for audit and replay.
- **The model provider is replaceable** (mock today; OpenAI / NVIDIA NIM / Nemotron later) with one
  environment variable — no vendor lock-in.

---

## Demo story (end to end)

1. Open the **landing page** — understand what the product is in 15 seconds.
2. Click **Enter Command Center**.
3. Read the **Executive Morning Brief** — "I reviewed your portfolio overnight…".
4. Review **Portfolio Health** — readiness, revenue at risk, expansion potential.
5. Open **Today's Priorities** — the ranked shortlist of accounts.
6. Select a top account (e.g. **Curefoods**).
7. Review **why AI recommended it** — evidence, business impact, confidence.
8. **Approve** the recommended action.
9. **Write back to HubSpot** (task or note).
10. **Verify HubSpot updated** — the task/note appears on the company.

If the CRM is unavailable, switch to **synthetic mode** and the same story still works.

---

## Technology stack

**Frontend** (`apps/web`)
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Vercel-ready

**Backend** (`services/api`)
- FastAPI (Python)
- Pydantic typed schemas
- HubSpot connector (vendor-neutral `CRMConnector` interface)
- Deterministic reasoning + scoring engine
- SQLite decision-ledger persistence

**Integrations**
- HubSpot private-app Service Key (Companies / Contacts / Deals / Tasks / Notes)
- Replaceable model provider layer — mock today; **OpenAI / NVIDIA NIM / Nemotron** ready

---

## Enterprise AI architecture

**The LLM is not the source of truth.** The deterministic engine is.

**Today**

```
HubSpot test CRM
   ↓  structured signals
Deterministic business engine   (ranking, risk, opportunity — auditable)
   ↓
Executive reasoning layer       (narrates the facts)
   ↓
Human approval
   ↓
CRM writeback
```

**Future**

```
HubSpot
   ↓  deterministic facts
OpenAI / NVIDIA narrative provider   (replaces narrative generation only)
   ↓  same UI
Human approval
   ↓
CRM writeback
```

The ranking and actions stay deterministic and auditable; only the *narration* layer is ever
delegated to an LLM. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for detail.

---

## Safety and governance

- **No autonomous CRM action** — write-back requires explicit human approval *and* a separate
  environment gate (`HUBSPOT_WRITEBACK_ENABLED=true`).
- **Decision ledger** records every run (agents invoked, evidence used, reasoning, confidence,
  caveats, data source).
- **Synthetic data mode** means you can demo with zero real data.
- **HubSpot test CRM only** — never point the connector at a production portal or real customer data.
- **Service Keys stay in environment variables** — only `*.example` templates are committed.

---

## Quick start

```bash
# 1. Backend (FastAPI)  --------------------------------------------------
cd services/api
python -m venv .venv
.venv\Scripts\activate            # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
python data/generate_synthetic_data.py
python -m uvicorn main:app --host 127.0.0.1 --port 8000

# 2. Frontend (Next.js) --------------------------------------------------
cd apps/web
npm install
npm run build
npm run start                      # or: npm run dev   (Node 20 LTS recommended)
```

Then open **http://localhost:3000**. The backend health check is at
**http://127.0.0.1:8000/api/health**.

> **Note:** Node 20 LTS is recommended for local development. Node 24 can cause Tailwind / Next dev
> server issues.

Full instructions, environment variables, HubSpot setup, and deployment are in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Repository structure

```
signal-to-action-agent/
├── README.md                  ← you are here
├── .env.example               ← backend env template (copy to services/api/.env)
├── docker-compose.yml
├── apps/
│   └── web/                   ← Next.js frontend (Vercel target)
│       ├── app/               ← landing, command center, workspace views
│       ├── components/        ← design system + section components
│       ├── lib/               ← deterministic reasoning/portfolio helpers (UI side)
│       └── .env.local.example ← frontend env template
├── services/
│   └── api/                   ← FastAPI backend
│       ├── main.py            ← API routes
│       ├── agents/            ← 6 agents + orchestrator
│       ├── schemas/           ← Pydantic contracts
│       ├── services/          ← scoring, recommendation, ledger, data loader
│       ├── model_adapters/    ← base, mock, nvidia_nim (stub)
│       ├── crm_connectors/    ← HubSpot connector + mapper + seed
│       └── data/              ← synthetic dataset + generator
├── docs/                      ← product & engineering documentation (below)
└── evals/                     ← evaluation harness
```

---

## Documentation

| Document | What it covers |
|----------|----------------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System overview, frontend & backend architecture, reasoning model, data sources, governance |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Running the backend: startup & sync lifecycle, self-healing, background refresh, debugging endpoints, configuration reference |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Local dev, environment variables, HubSpot setup, Vercel + backend deployment |
| [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) | A 5-minute demo script with a backup plan |
| [`docs/TESTING.md`](docs/TESTING.md) | What external testers should try and what feedback to collect |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Current capabilities and what comes next |
| [`docs/hubspot-integration.md`](docs/hubspot-integration.md) | Deep dive on the HubSpot connector (scopes, mapping, endpoints, safety) |
| [`docs/product-brief.md`](docs/product-brief.md) | Product brief: problem, user, solution |
| [`docs/dataset-schema.md`](docs/dataset-schema.md) | Synthetic data field reference |
| [`docs/nvidia-integration-plan.md`](docs/nvidia-integration-plan.md) | Plan to plug in NVIDIA NIM / Nemotron |
| [`docs/evaluation-plan.md`](docs/evaluation-plan.md) | Evaluation approach |

---

## Status

Feature-frozen for the current demo build. This sprint hardened **documentation and deployment
readiness** only — no product functionality, UI, API, reasoning, or HubSpot logic was changed.
