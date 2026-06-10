# Signal-to-Action Agent

**A sovereign multi-agent workflow that turns fragmented customer signals into explainable, human-approved next-best actions.**

[![Team](https://img.shields.io/badge/Team-VentureOS-blue)](https://github.com/ventureOS) [![Hackathon](https://img.shields.io/badge/Hackathon-India%20Agentic%20AI%202026-orange)](.) [![Track](https://img.shields.io/badge/Track-A%3A%20Agentic%20Workflows-green)](.)

---

## Why This is NOT a Chatbot

This is a **governed, deterministic, multi-agent workflow** — not a chatbot or generic LLM wrapper. Here's what makes it different:

- **Controlled multi-agent workflow**: Six specialized agents orchestrated in a fixed, auditable sequence
- **Typed contracts**: Every agent input/output is a strongly-typed Pydantic model
- **Deterministic scoring before LLM**: Priority scores computed from quantitative signals; model only explains and drafts communications
- **Evidence-backed**: Every recommendation includes attributable evidence chips showing source system and agent
- **Confidence tracking**: Each recommendation has a numeric confidence score (0.0–1.0)
- **Human-in-the-loop approval**: Every action is `pending` by default and requires explicit human approval
- **Decision ledger**: Every workflow run is persisted with full traceability (agents invoked, evidence used, reasoning summary, caveats)
- **Replaceable model provider**: Swap between mock and NVIDIA NIM/Nemotron with one environment variable; no vendor lock-in

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Customer Signals (CRM, Billing, Support, Marketing, Telemetry)     │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR                                     │
│  (Fixed agent sequence; deterministic scoring; typed hand-offs)      │
└──────────────────────────────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ 1. Signal    │   │ 2. Account   │   │ 3. Opportunity│
│   Ingestion  │──▶│    Health    │──▶│    Agent     │
└──────────────┘   └──────────────┘   └──────────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                             ▼
                   ┌──────────────┐
                   │ 4. Governance│
                   │    Agent     │
                   └──────┬───────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                                   │
        ▼                                   ▼
┌──────────────┐                   ┌──────────────┐
│ 5. Action    │                   │ 6. Comms     │
│    Agent     │──────────────────▶│    Agent     │
└──────────────┘                   └──────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      DECISION LEDGER                                 │
│  (Persisted run trace: agents, evidence, reasoning, caveats)        │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│            HUMAN-APPROVED NEXT-BEST ACTIONS                          │
│  (Recommendations with evidence, confidence, draft email, call       │
│   script; every action requires explicit approval)                  │
└──────────────────────────────────────────────────────────────────────┘
```

**How it works:**

1. **Signal Ingestion**: Load and normalize signals from all source systems (CRM, billing, support, marketing, telemetry)
2. **Deterministic Scoring**: `scoring_service` computes a priority score (0.0–1.0) from quantitative features — support risk, spend decline, growth potential, renewal urgency, campaign response, engagement/contact gaps. This happens *before* any LLM call and drives the ranking.
3. **Account Health Agent**: Assess risk factors and produce evidence
4. **Opportunity Agent**: Assess growth/expansion potential and produce evidence
5. **Governance Agent**: Check evidence count, compute confidence, flag caveats
6. **Query Routing**: Orchestrator interprets the natural-language business question and filters/sorts candidates
7. **Action Agent**: Propose a typed next-best action for the top *N* accounts
8. **Communication Agent**: Use the model adapter (mock or NVIDIA NIM/Nemotron) to generate priority reasons, risk/opportunity summaries, draft email, call script, and voice summary
9. **Decision Ledger**: Persist the full run trace (agents invoked, evidence used, reasoning summary, confidence, caveats) for audit and replay

---

## Agents

| Agent | Responsibility |
|-------|---------------|
| **Orchestrator** | Coordinates the fixed workflow sequence, routes queries, times execution, builds the decision ledger |
| **Signal Ingestion Agent** | Loads synthetic accounts, signals, and notes; normalizes into typed `AccountContext` objects |
| **Account Health Agent** | Assesses risk (support tickets, spend decline, stagnation); produces risk evidence |
| **Opportunity Agent** | Assesses expansion potential (growth score, engagement, campaign response); produces opportunity evidence |
| **Governance Agent** | Counts evidence, computes confidence score, flags caveats (e.g., "limited evidence") |
| **Action Agent** | Proposes a typed next-best action (follow_up, reactivation, support_escalation, renewal_prep, etc.) |
| **Communication Agent** | Generates seller-ready email draft, call script, and voice summary via the model adapter |

---

## Tech Stack

- **Backend**: Python 3.12, FastAPI, Pydantic, Uvicorn, SQLite
- **Model Adapter**: Mock (default) | NVIDIA NIM / Nemotron (swap via `MODEL_PROVIDER` env var)
- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS — dark-first enterprise console (NVIDIA-inspired green accent)
- **Data**: Synthetic (40 accounts, ~90 signals, ~30 notes; seeded for deterministic generation)
- **Evaluation**: Custom Python harness (`evals/evaluation_runner.py`)

---

## Project Structure

```
signal-to-action-agent/
├── services/
│   └── api/                      # FastAPI backend
│       ├── agents/               # Six specialized agents + orchestrator
│       ├── schemas/              # Pydantic models (account, signal, recommendation, ledger, etc.)
│       ├── services/             # Data loader (source-aware), scoring, ledger persistence, recommendation service
│       ├── model_adapters/       # Mock and NVIDIA NIM adapters (swappable)
│       ├── crm_connectors/       # Optional HubSpot test-CRM connector (base, connector, mapper, seed)
│       ├── data/                 # Synthetic data generator + generated CSVs/JSON
│       ├── main.py               # FastAPI application entry point
│       ├── requirements.txt      # Python dependencies
│       └── .venv/                # Python virtual environment
├── apps/
│   └── web/                      # Next.js frontend (dark enterprise console)
│       ├── app/                  # Next.js 14 app router (layout, page, globals)
│       ├── components/           # Header, panels, recommendation cards, ledger, approvals
│       ├── lib/                  # Typed API client, contracts, formatting helpers
│       └── package.json          # Node dependencies
├── evals/
│   ├── test_queries.json         # 10 test queries for evaluation
│   └── evaluation_runner.py      # Evaluation harness (runs all tests, validates responses)
├── docs/
│   ├── product-brief.md          # Product vision and requirements
│   ├── architecture.md           # Technical architecture deep dive
│   ├── dataset-schema.md         # Synthetic data schema
│   ├── nvidia-integration-plan.md# NVIDIA NIM integration guide
│   ├── hubspot-integration.md    # HubSpot test-CRM connector + data mapping + runbook
│   ├── evaluation-plan.md        # Evaluation criteria and metrics
│   └── demo-script.md            # Demo flow and talking points
├── .env.example                  # Environment variables template
├── .gitignore                    # Git ignore rules
├── docker-compose.yml            # Docker Compose for local dev/demo
└── README.md                     # This file
```

---

## Prerequisites

- **Python**: 3.12+ (backend)
- **Node.js**: 20+ (frontend)
- **Windows ARM64 Note**: Backend uses `uvicorn` (not `uvicorn[standard]`) to avoid native-extension issues

---

## Setup & Run

### Backend (FastAPI)

1. **Navigate to the backend directory:**
   ```powershell
   cd services\api
   ```

2. **Create and activate a Python virtual environment:**
   ```powershell
   # Windows
   python -m venv .venv
   .venv\Scripts\activate

   # macOS/Linux
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. **Install dependencies:**
   ```powershell
   pip install -r requirements.txt
   ```

4. **Generate synthetic data:**
   ```powershell
   python data\generate_synthetic_data.py
   ```
   This creates `synthetic_accounts.csv`, `synthetic_signals.csv`, and `synthetic_notes.json` in `services/api/data/`.

5. **Run the FastAPI server:**
   ```powershell
   python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```
   The API will be available at **http://localhost:8000**. Visit **http://localhost:8000/docs** for interactive API documentation.

### Frontend (Next.js)

1. **Navigate to the web app directory:**
   ```powershell
   cd apps\web
   ```

2. **Install dependencies:**
   ```powershell
   npm install
   ```

3. **Run the development server:**
   ```powershell
   npm run dev
   ```
   The frontend will be available at **http://localhost:3000**. Make sure the backend is running first.

   **Note**: Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` in `apps/web/.env.local` if you need to override the default.

---

## Generating Synthetic Data

The project includes a deterministic synthetic data generator:

```powershell
cd services\api
python data\generate_synthetic_data.py
```

**What it generates:**
- **40 accounts** (SMB segment, diverse industries and regions, realistic feature distributions)
- **~90 signals** (support tickets, billing events, campaign responses, telemetry, NPS scores)
- **~30 notes** (sales and support notes with structured metadata)

**Key properties:**
- Seeded for reproducibility (same data every run)
- Realistic distributions (support risk, spend trends, growth potential, renewal urgency)
- Accounts with varying evidence levels (some rich, some sparse) to test governance
- Multiple signal types to exercise all agent logic

---

## Running Evaluations

The evaluation harness validates the end-to-end workflow:

```powershell
# From project root, using the venv python
& "C:\Users\pandeyamit\.copilot\chats\18d443a7-1e3d-4a84-891f-684d34b960f9\signal-to-action-agent\services\api\.venv\Scripts\python.exe" evals\evaluation_runner.py

# Or if you're in a shell with the venv activated:
python evals\evaluation_runner.py
```

**What it checks (per query):**
1. **Response structure**: Recommendations list is non-empty (≥ expected minimum); decision ledger present
2. **Evidence**: Every recommendation includes at least one evidence item
3. **Confidence score**: Every recommendation has a valid `confidence_score` ∈ [0, 1]
4. **Governance**: Every recommendation has `governance_caveats` (list) and `governance_status` fields; ledger has caveats
5. **Approval status**: Every fresh recommendation has `approval_status = "pending"` (default)
6. **Latency**: Measured latency is positive and reported

**Output**: Per-query PASS/FAIL, detailed check results, summary table with pass rate and average latency.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | API root (name, version, docs links) |
| `GET` | `/api/health` | Health check (model provider, data readiness, agent list) |
| `GET` | `/api/meta` | UI metadata (dataset summary, scoring weights, suggested queries) |
| `GET` | `/api/accounts` | List accounts (paginated) |
| `GET` | `/api/accounts/{account_id}` | Get account detail with signals and notes |
| `POST` | `/api/recommendations` | **Main endpoint**: Run the workflow for a query and get recommendations + ledger |
| `GET` | `/api/recommendations/{recommendation_id}` | Get a persisted recommendation by ID |
| `POST` | `/api/actions/{recommendation_id}/approve` | Approve a recommendation (sets `approval_status = "approved"`) |
| `POST` | `/api/actions/{recommendation_id}/reject` | Reject a recommendation (sets `approval_status = "rejected"`, optional reason) |
| `GET` | `/api/integrations/hubspot/status` | HubSpot connector status (`?probe=true` makes a live connectivity check) |
| `POST` | `/api/integrations/hubspot/seed` | Seed synthetic demo records into a HubSpot test portal (requires write-back) |
| `POST` | `/api/integrations/hubspot/sync` | Read HubSpot companies and switch the active dataset to the synced records |
| `POST` | `/api/integrations/hubspot/use-synthetic` | Revert the active dataset back to the local synthetic data |
| `POST` | `/api/actions/{recommendation_id}/hubspot-task` | Create a HubSpot task for an **approved** recommendation |
| `POST` | `/api/actions/{recommendation_id}/hubspot-note` | Create a HubSpot note for an **approved** recommendation |

**Example request:**
```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/api/recommendations `
  -Method Post `
  -ContentType 'application/json' `
  -Body '{"query":"Which SMB accounts need attention this week and why?","limit":10}'
```

---

## Main Demo Flow

1. **Ask the business question:**
   ```
   POST /api/recommendations
   { "query": "Which SMB accounts need attention this week and why?", "limit": 10 }
   ```

2. **Receive:**
   - **Recommendations**: Top 10 accounts, ranked by deterministic priority score, with:
     - Priority rank and score (0.0–1.0)
     - Priority reason (LLM-generated explanation of the score drivers)
     - Risk and opportunity summaries (from the Health and Opportunity Agents)
     - Recommended action (typed: follow_up, reactivation, support_escalation, etc.)
     - Confidence score (0.0–1.0)
     - Evidence chips (each with source agent, label, detail, source system, polarity, strength)
     - Governance caveats (e.g., "limited evidence — review manually")
     - Draft email, call script, voice summary (seller-ready communications)
     - Approval status: `pending` (requires human approval)
   - **Decision Ledger**:
     - Ledger ID, timestamp, user query
     - Agents invoked (6 agents)
     - Evidence used (total count)
     - Reasoning summary (how the workflow reached the ranking)
     - Confidence score (aggregate)
     - Caveats (run-level governance flags)
     - Per-agent steps (status, summary, evidence count, latency)
     - Model provider (mock or nvidia-nim)
     - Total latency (ms)

3. **Review in the UI:**
   - See the ranked list of accounts in the center cockpit
   - Select an account to see evidence chips, confidence meter, governance status, agent trace, and draft communications
   - Approve, reject, or edit each action with one click

4. **Approve an action:**
   ```
   POST /api/actions/{recommendation_id}/approve
   ```
   This sets `approval_status = "approved"` and persists the decision.

---

## HubSpot Test CRM Integration (Optional)

The agent runs entirely on **synthetic local data** by default. As an optional layer, the
same synthetic records can be pushed into a **HubSpot test portal**, synced back through the
connector, analysed, and — after human approval — a **task or note** can be written back to
HubSpot. This proves the workflow is not only a synthetic simulation while keeping all the
original safety guarantees.

> The connector is **fully optional**. With `HUBSPOT_ENABLED=false` (the default) nothing
> changes and the synthetic flow is unaffected. A missing token never breaks the app — every
> failure maps to a friendly message in the UI.

### Safety model

- **Test portals only** — never connect a production/real-customer HubSpot account.
- **Synthetic records only** — seeding pushes the project's generated demo data, no real data.
- **No email is ever sent.**
- **No autonomous write-back** — task/note creation requires (1) `HUBSPOT_WRITEBACK_ENABLED=true`
  and (2) the recommendation to already be **approved** by a human.
- **Token safety** — the access token is read from the environment, sent only as a Bearer
  header, and is never returned in an API response, logged, or placed in an error message.

### Configuration (`.env`)

```bash
HUBSPOT_ENABLED=false            # master switch for the connector
HUBSPOT_ACCESS_TOKEN=            # private-app token for a TEST portal (never commit)
HUBSPOT_PORTAL_ID=               # optional, used to build record deep-links
HUBSPOT_SYNC_LIMIT=100           # max companies to sync
HUBSPOT_WRITEBACK_ENABLED=false  # second gate for any write (seed / task / note)
```

### Required HubSpot private-app scopes

Create a **private app** in a HubSpot **test** account (Settings → Integrations → Private Apps)
and grant:

| Scope | Used for |
|-------|----------|
| `crm.objects.companies.read` | Sync companies → accounts |
| `crm.objects.companies.write` | Seed demo companies |
| `crm.objects.contacts.read` / `.write` | Seed one contact per company |
| `crm.objects.deals.read` / `.write` | Optional opportunity signals |
| `crm.schemas.companies.write` | *(optional)* create `s2a_*` custom score properties |

> If `crm.schemas.companies.write` is not granted, seeding falls back to standard properties
> and the connector derives deterministic demo scores on sync — the scoring engine still works.

Copy the generated token into `HUBSPOT_ACCESS_TOKEN`.

### 1. Seed demo data into HubSpot

```powershell
# From services/api, with HUBSPOT_ENABLED=true, a token, and HUBSPOT_WRITEBACK_ENABLED=true
.\.venv\Scripts\python.exe crm_connectors\hubspot_seed.py
```

Creates ~30 synthetic companies (+ a contact each, some deals/notes). Or call
`POST /api/integrations/hubspot/seed`.

### 2. Sync from HubSpot

In the UI, open the **CRM Integration** card (left panel) → **Test connection** → **Sync from
HubSpot**. Or:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/api/integrations/hubspot/sync -Method Post
```

After sync, the active dataset switches to HubSpot. Recommendation cards, the decision ledger,
and the runtime trace all show **Source: HubSpot test CRM**. Use **Use synthetic** to revert.

### 3. Write back an approved action

1. Run the workflow and select the top account.
2. **Approve** the recommendation.
3. In the **Create HubSpot follow-up** section, click **Create HubSpot task** or
   **Create HubSpot note**.
4. The result panel shows the object type, external id (deep-link), created timestamp, payload
   preview, and the safety note. The write is recorded in the audit trail
   (`crm_writebacks` table; `GET /api/actions/{id}/writebacks`).

See [`docs/hubspot-integration.md`](docs/hubspot-integration.md) for the full data-mapping
reference and demo runbook.

---

## NVIDIA Integration Path

**Current state (MVP):**
- `MODEL_PROVIDER=mock` (default)
- Mock adapter generates deterministic, structured placeholder text
- No API key needed; the full workflow runs end-to-end

**NVIDIA-ready path:**
1. Obtain an `NVIDIA_API_KEY` (from build.nvidia.com or hackathon organizers)
2. Set environment variables:
   ```
   MODEL_PROVIDER=nvidia
   NVIDIA_API_KEY=nvapi-xxxxxxxx
   NVIDIA_NIM_BASE_URL=https://integrate.api.nvidia.com/v1
   NVIDIA_NIM_MODEL=nvidia/nemotron-4-340b-instruct
   ```
3. Restart the backend. The system now uses NVIDIA NIM/Nemotron for all text generation tasks (priority reasons, risk/opportunity summaries, email drafts, call scripts, voice summaries).

**Model adapter role:**
- The model adapter *only* generates explanatory text and seller-ready communications
- It does **not** compute scores or make ranking decisions (that's deterministic scoring)
- This keeps the system governable: the LLM never changes the business logic

**Future: NeMo Agent Toolkit**
- The orchestrator is intentionally framework-free so it can later be mapped onto NVIDIA NeMo Agent Toolkit / NemoClaw
- This would replace `orchestrator.py` with a typed tool graph while keeping the same agent contracts

See **[docs/nvidia-integration-plan.md](./docs/nvidia-integration-plan.md)** for details.

---

## Demo Script

A full demo script with talking points and suggested queries is available in **[docs/demo-script.md](./docs/demo-script.md)**.

---

## Documentation

- **[Product Brief](./docs/product-brief.md)**: Vision, problem statement, solution overview
- **[Architecture](./docs/architecture.md)**: Deep dive on workflow, agents, contracts, deterministic scoring
- **[Dataset Schema](./docs/dataset-schema.md)**: Synthetic data structure and generation logic
- **[NVIDIA Integration Plan](./docs/nvidia-integration-plan.md)**: How to swap to NVIDIA NIM/Nemotron
- **[HubSpot Integration](./docs/hubspot-integration.md)**: Optional test-CRM connector, data mapping, demo runbook
- **[Evaluation Plan](./docs/evaluation-plan.md)**: Eval metrics, test queries, expected behavior
- **[Demo Script](./docs/demo-script.md)**: Walkthrough and talking points for judges/demos

---

## Disclaimer

**All data in this project is synthetic and for demonstration purposes only.** It does not represent any real company, customer, or business situation. The accounts, signals, and notes are generated programmatically with realistic distributions to showcase the workflow.

---

## Team VentureOS

**India Agentic AI Open Hackathon 2026** | **Track A: Agentic Workflows**

Built with ❤️ and governed workflows — not chatbot vibes.
