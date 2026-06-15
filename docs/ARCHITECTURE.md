# Architecture — Signal-to-Action Agent

This document explains how the product works, in plain English, for product managers, engineering
managers, hackathon judges, and executives. You should be able to understand the system without
reading any source code.

---

## 1. System overview

The product turns raw CRM data into a short, ranked, **explainable** list of actions — and never
updates the CRM without a human approving first.

```
HubSpot Test CRM
   ↓
CRM Connector                 (vendor-neutral interface)
   ↓
Signal Normalization          (turn records into typed signals)
   ↓
Recommendation Engine         (rank accounts by priority)
   ↓
Deterministic Reasoning Layer (decide risk / opportunity / next-best action — auditable)
   ↓
Executive Command Center      (the UI a seller actually reads)
   ↓
Human Approval                (a person says yes / no / edit)
   ↓
Decision Ledger               (every run is recorded for audit)
   ↓
CRM Writeback                 (approved task / note pushed to HubSpot)
```

The single most important idea: **the deterministic engine is the source of truth, not an LLM.**
The model layer only narrates and drafts; it never decides the ranking.

---

## 2. The big picture (two halves)

```
┌───────────────────────────┐         HTTPS / JSON        ┌───────────────────────────┐
│        FRONTEND           │  ───────────────────────▶   │         BACKEND           │
│   apps/web (Next.js)      │                             │  services/api (FastAPI)   │
│                           │   ◀───────────────────────  │                           │
│  Landing · Command Center │      recommendations,       │  agents · scoring ·       │
│  · Workspace · Approval   │      ledger, writeback      │  ledger · CRM connector   │
└───────────────────────────┘                             └─────────────┬─────────────┘
                                                                         │
                                                          ┌──────────────┴──────────────┐
                                                          │                              │
                                                   Synthetic dataset          HubSpot Test CRM
                                                   (CSV / JSON)               (private-app token)
```

- The **frontend** is a presentation layer. It calls the backend over HTTP and renders the result.
- The **backend** holds all business logic: agents, scoring, reasoning, governance, the decision
  ledger, and the HubSpot connector.
- Data comes from one of two sources at a time: the **synthetic dataset** (offline) or the
  **HubSpot test CRM** (live). The active source is recorded on every recommendation and ledger entry.

---

## 3. Frontend architecture

Location: `apps/web` (Next.js App Router, TypeScript, Tailwind).

The frontend tells a story by scrolling through one continuous journey:

| Surface | Executive question it answers |
|---------|-------------------------------|
| **Landing page** | "What is this product?" |
| **Command Center** | "What should I pay attention to?" |
| → Executive Morning Brief | "What changed overnight?" |
| → Portfolio Health | "Should I worry?" |
| → Today's Priorities | "What should I do today?" |
| → Portfolio Map (Risk vs Opportunity) | "Where should I focus?" |
| → Priority Accounts | "Who is the ranked shortlist?" |
| → Executive Briefing | "What are the top risks and opportunities?" |
| → Governed Pipeline | "Can I trust how this was decided?" |
| **Workspace** | "Why does the AI think this?" (conversational query) |
| **Human Approval controls** | "Do I approve, reject, or edit?" |

Key points:
- The frontend contains **no business rules that decide rankings**. It calls
  `POST /api/recommendations` and renders the typed response.
- A small UI-side helper library (`apps/web/lib`) reshapes and formats the backend response for
  display (e.g. portfolio summaries, the risk/opportunity map). It does not invent recommendations.
- Animations and the "reasoning sequence" shown while analysis runs are **presentation only**.

---

## 4. Backend architecture

Location: `services/api` (FastAPI, Pydantic).

```
                       ┌──────────────────────────────┐
   HTTP request  ───▶  │           main.py            │   FastAPI routes
                       │  /api/recommendations, etc.  │
                       └───────────────┬──────────────┘
                                       │
                       ┌───────────────▼──────────────┐
                       │        Orchestrator          │   fixed agent sequence
                       │   agents/orchestrator.py     │
                       └───────────────┬──────────────┘
            ┌──────────────┬───────────┼───────────┬──────────────┬───────────────┐
            ▼              ▼           ▼           ▼              ▼               ▼
     1. Signal      2. Account    3. Opportunity 4. Governance 5. Action   6. Communication
        Ingestion      Health        Agent          Agent        Agent         Agent
            │              │           │           │              │               │
            └──────────────┴───────────┴───────────┴──────────────┴───────────────┘
                                       │
                       ┌───────────────▼──────────────┐
                       │   Services (support layer)   │
                       │  scoring · recommendation ·  │
                       │  ledger · data_loader        │
                       └───────────────┬──────────────┘
                                       │
                  ┌────────────────────┼────────────────────┐
                  ▼                    ▼                    ▼
            Model adapters       CRM connectors        Decision ledger
            (mock / nvidia)      (HubSpot)             (SQLite)
```

**The six agents** (run in a fixed, logged order):

1. **Signal Ingestion** — load and normalize signals, group them by account, return structured context.
2. **Account Health** — detect declining spend, low engagement, support issues, inactivity, renewal risk.
3. **Opportunity** — detect growth potential: campaign response, usage growth, spend movement, high-fit segments.
4. **Governance** — check there is enough evidence, compute confidence, add caveats, enforce that nothing is autonomous.
5. **Action** — convert the insight into a concrete next-best action (follow-up, reactivation, renewal prep, etc.).
6. **Communication** — use the model adapter to write the priority reason, risk/opportunity summary, draft email, and call script.

**Supporting services** (`services/`):
- `data_loader.py` — loads the active dataset (synthetic or HubSpot) into memory. Thread-safe: the
  active source is swapped **atomically** so a background sync can never expose a half-updated
  dataset, and it keeps a **last-good HubSpot cache** for graceful degradation.
- `scoring_service.py` — computes the deterministic priority score from quantitative features.
- `recommendation_service.py` — assembles the final ranked recommendations.
- `ledger_service.py` — persists each run to the SQLite decision ledger.
- `refresh_scheduler.py` — optional, **single** background thread that keeps the HubSpot data fresh
  on a configurable interval (opt-in; off by default). Never downgrades on failure.

**Configuration** (`config.py`): one validated settings object is the single place every environment
variable is read. Missing configuration produces startup *warnings*, never crashes. See
[`OPERATIONS.md`](OPERATIONS.md).

**Model adapters** (`model_adapters/`):
- `base.py` — the provider-neutral interface.
- `mock_adapter.py` — deterministic placeholder text (no API key, used for the demo).
- `nvidia_nim_adapter.py` — stub for NVIDIA NIM / Nemotron.
- `openai_adapter.py`, `claude_adapter.py` — provider **placeholders** (not wired yet; selecting them
  safely falls back to the mock adapter with a logged warning).

**CRM connectors** (`crm_connectors/`):
- `base.py` — the vendor-neutral `CRMConnector` interface.
- `hubspot_connector.py`, `hubspot_mapper.py`, `hubspot_seed.py` — the HubSpot implementation, the
  record↔account mapping, and the demo seeding helper.

### API endpoints (current)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET`  | `/api/health` | Service health + active model provider + active source |
| `GET`  | `/api/meta` | Build/runtime metadata |
| `GET`  | `/api/system/status` | One-stop diagnostics: version, uptime, source, provider, counts |
| `GET`  | `/api/system/config` | Active configuration (secrets redacted) + validation warnings |
| `GET`  | `/api/system/threads` | Live threads + background-refresh scheduler status |
| `GET`  | `/api/accounts` | List accounts (active source) |
| `GET`  | `/api/accounts/{id}` | Account detail |
| `POST` | `/api/recommendations` | Run the workflow → ranked recommendations + ledger |
| `GET`  | `/api/recommendations/{id}` | Fetch one recommendation |
| `POST` | `/api/actions/{id}/approve` | Human approval |
| `POST` | `/api/actions/{id}/reject` | Human rejection |
| `GET`  | `/api/integrations/hubspot/status` | Connector status (`?probe=true` does one live read) |
| `POST` | `/api/integrations/hubspot/seed` | Seed synthetic companies into HubSpot (write-gated) |
| `POST` | `/api/integrations/hubspot/sync` | Switch active source to HubSpot |
| `POST` | `/api/integrations/hubspot/use-synthetic` | Switch active source to synthetic |
| `POST` | `/api/actions/{id}/hubspot-task` | Write back a task (approval required) |
| `POST` | `/api/actions/{id}/hubspot-note` | Write back a note (approval required) |
| `GET`  | `/api/actions/{id}/writebacks` | Audit list of writes for a recommendation |

---

## 5. Reasoning architecture

This is the heart of why the product is trustworthy.

```
            ┌─────────────────────────────────────────────┐
            │   DETERMINISTIC BUSINESS ENGINE             │
            │   (source of truth)                         │
            │                                             │
            │   • priority score from quantitative facts  │
            │   • risk / opportunity classification       │
            │   • next-best action selection              │
            │   → fully auditable, repeatable             │
            └─────────────────────┬───────────────────────┘
                                  │ facts
                                  ▼
            ┌─────────────────────────────────────────────┐
            │   NARRATIVE LAYER (model adapter)           │
            │                                             │
            │   • explains the facts in plain English     │
            │   • drafts email / call script              │
            │   → can be swapped for OpenAI / NVIDIA      │
            └─────────────────────────────────────────────┘
```

- **Rankings, risk, opportunity, and actions are computed deterministically.** The same inputs
  always produce the same outputs. This is what makes the product auditable.
- **The LLM is not the source of truth.** It only turns the facts into readable narrative and draft
  communications. If you turn the model off, the rankings and actions are unchanged — you just lose
  the polished wording (deterministic fallback text is used instead).
- **The provider is replaceable.** Today the mock adapter is active. Tomorrow, setting
  `MODEL_PROVIDER=nvidia` (with an API key) routes the *narrative* through NVIDIA NIM / Nemotron —
  with zero change to the ranking logic, the UI, or the contracts.

---

## 6. Data flow (one workflow run)

```
1. User asks: "Which SMB accounts need attention this week and why?"
2. Frontend → POST /api/recommendations
3. Backend loads the active dataset (synthetic OR HubSpot)
4. Signal Ingestion normalizes + groups signals by account
5. Scoring service computes a deterministic priority score per account
6. Account Health + Opportunity agents attach evidence
7. Governance agent computes confidence + caveats, enforces approval
8. Action agent picks the next-best action for the top accounts
9. Communication agent drafts the reason / email / call script
10. Ledger service records the full run (agents, evidence, reasoning, caveats, source)
11. Backend returns ranked recommendations + ledger trace
12. Frontend renders the Command Center story
13. Human approves → optional CRM writeback (task / note) to HubSpot
```

---

## 7. Data sources

| Source | When it is used | Notes |
|--------|-----------------|-------|
| **Synthetic dataset** | Default / offline / fallback | `services/api/data/*.csv` + `*.json`, regenerated by `generate_synthetic_data.py`. No real data. |
| **HubSpot test CRM** | Live demo | 40 demo companies in a *test* portal, pulled via a private-app Service Key. Read for sync; write only after approval. |

The active source is stamped onto `RecommendationResponse.data_source` and
`DecisionLedger.data_source`, and a caveat is added to the ledger when HubSpot is the source. You can
switch sources at any time from the CRM card in the UI.

---

## 8. Governance

Governance is built into the workflow, not bolted on:

- **Evidence** — every recommendation lists the signals that justify it, with source system and polarity.
- **Confidence** — every recommendation has a numeric confidence score; low confidence adds caveats.
- **Human approval** — every action starts as `pending`. Nothing is executed autonomously.
- **Two gates before any CRM write** — `HUBSPOT_WRITEBACK_ENABLED=true` *and* an approved recommendation.
- **Decision ledger** — every run is persisted (agents invoked, evidence used, reasoning summary,
  confidence, caveats, data source) for audit and replay.
- **Token safety** — the HubSpot Service Key is read from the environment, sent only as a Bearer
  header, and never logged, returned, or placed into an error message.

---

## 9. Deployment architecture

```
                 ┌───────────────────────────┐
   Browser  ───▶ │   Vercel (frontend only)  │   Next.js static + server
                 │   NEXT_PUBLIC_API_BASE_URL │──────────────┐
                 └───────────────────────────┘              │ HTTPS
                                                             ▼
                 ┌──────────────────────────────────────────────────────┐
                 │  Backend host (Render / Railway / Azure App Service)  │
                 │  FastAPI + uvicorn                                    │
                 │  HUBSPOT_ACCESS_TOKEN, MODEL_PROVIDER, CORS_ORIGINS   │
                 └──────────────────────────────┬───────────────────────┘
                                                 │ HTTPS (Bearer token, server-side only)
                                                 ▼
                                         HubSpot Test CRM
```

- **Vercel hosts the frontend only.** The FastAPI backend is deployed separately.
- The frontend only ever receives a **public API URL** (`NEXT_PUBLIC_API_BASE_URL`). No secrets.
- The **HubSpot Service Key lives only on the backend host**, never in the frontend or in Vercel env.
- The backend must allow the Vercel domain via `CORS_ORIGINS`.

Full step-by-step instructions are in [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## 10. Future provider model

```
        TODAY                                  FUTURE
  ─────────────────                    ─────────────────────
  HubSpot                              HubSpot
     ↓                                    ↓
  Deterministic facts                  Deterministic facts   (unchanged, still source of truth)
     ↓                                    ↓
  Mock narrative adapter      ──▶       OpenAI / NVIDIA narrative provider
     ↓                                    ↓
  Same UI                              Same UI
     ↓                                    ↓
  Human approval                       Human approval
     ↓                                    ↓
  CRM writeback                        CRM writeback
```

Swapping providers changes **only the narrative generation**. The ranking, scoring, governance,
contracts, and UI stay exactly the same. See [`nvidia-integration-plan.md`](nvidia-integration-plan.md).

---

## 11. Reliability & operations

The backend is designed to be left running for months and demoed repeatedly. The operational details
(startup lifecycle, sync lifecycle, failure handling, debug endpoints, configuration reference) live
in [`OPERATIONS.md`](OPERATIONS.md). The essentials:

- **One place for configuration.** `config.py` reads and validates every environment variable once,
  and logs warnings for anything questionable at startup. Nothing crashes on missing config.
- **Structured startup logs.** Boot narrates each step: load config → load provider → check HubSpot →
  synchronize → "Loaded N companies / contacts / deals" → "Backend ready".
- **Self-healing (graceful degradation).** Serve HubSpot when available → otherwise the last-good
  HubSpot cache → otherwise the synthetic dataset. The app never crashes because a data source is
  down, and startup is never blocked by a slow CRM.
- **Single, safe background refresh.** When enabled, exactly one daemon thread refreshes the data on a
  schedule. On any failure it keeps the last-good data (it never downgrades a live demo) and it
  respects a manual switch to synthetic.
- **Observability.** `/api/system/status`, `/api/system/config` (secrets redacted) and
  `/api/system/threads` are the single source of truth when debugging a running instance.

### Future data-source adapters (Phase G)

Today there are two sources (synthetic, HubSpot) behind one vendor-neutral `CRMConnector` interface.
The same adapter pattern is the seam for future sources — **no engine or UI changes required**:

```
            ┌──────────────────────────────┐
            │     Data Source Interface    │   (CRMConnector / loader)
            └───────────────┬──────────────┘
        ┌──────────┬────────┼────────┬──────────┬───────────┐
        ▼          ▼        ▼        ▼          ▼           ▼
   Synthetic   HubSpot   Salesforce Dynamics   CSV     Database / Lakehouse
   (today)     (today)   (future)   (future)  (future)      (future)
```

### Future reasoning orchestrator (Phase J)

The frontend is, and will remain, **unaware of which model provider is active**. When a real LLM is
introduced, it slots behind a reasoning orchestrator and the provider interface — the deterministic
engine still owns ranking, evidence and governance:

```
   TODAY                              FUTURE
   ─────                              ──────
   UI                                 UI                         (unchanged)
    ↓                                  ↓
   Backend                            Backend                    (unchanged contracts)
    ↓                                  ↓
   Deterministic Engine               Reasoning Orchestrator
    ↓                                  ↓
   (mock narrative)                   Provider Interface
                                       ↓
                                      LLM (OpenAI / NVIDIA / Claude)
                                       ↓
                                      Narrative only → same Recommendation shape
```

---

## 12. Outside-In intelligence (supporting context)

An **additive enrichment layer** that attaches *public, external* context to an account — company
news, market trends, funding, layoffs, leadership changes, regulatory pressure, competitive and
macroeconomic shifts — and **fuses it with the account's internal CRM trajectory** into a short
executive brief. It helps a seller understand **what changed outside the CRM, why it matters, and
how it changes the conversation** before outreach.

**External signals are never the source of truth.** This is the most important rule of the layer:

```
HubSpot CRM  →  internal signals  →  deterministic engine  →  recommendation  →  human approval  →  CRM writeback
                                                 ▲
                                   (ranking · scoring · governance · confidence · writeback
                                    are 100% internal and deterministic — unchanged)

External signals ─────────────────────────────────┘  supporting context only
                                                     (cited · caveated · never override anything)
```

The layer is **fully decoupled** from the recommendation pipeline:

- It is a **separate package** (`services/api/external_signals/`) and a **separate endpoint**
  (`GET /api/external-signals/{account_id}`). External data is **never** added to the
  `Recommendation` contract, so ranking, scoring, governance, confidence and CRM write-back are
  provably unaffected.
- The frontend fetches it **lazily, per account**, only when the layer is enabled. When disabled
  (the default), the endpoints return an empty result with a note and the UI section is hidden — the
  product behaves exactly as before.

**Provider abstraction** (mirrors the model-provider pattern):

```
            ┌──────────────────────────────────┐
            │  ExternalSignalsProvider (base)  │
            └─────────────────┬────────────────┘
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
        MockProvider   SerperProvider    SearchApiProvider
     (curated demo    (live Google      (live Google News via
      context,         News via          SearchAPI.io; GET, header
      deterministic,   serper.dev;       Authorization: Bearer)
      no key —         POST, header
      DEFAULT)         X-API-KEY)
                          │                    │
                          └──── both fall back to MockProvider on any
                                error / empty result / missing key — never raise
```

- **Caching.** Results are cached in-process by `company_name + industry + region` with a TTL
  (`EXTERNAL_SIGNALS_CACHE_TTL_MINUTES`, default 1440 = once per day) so page loads never trigger
  repeated external lookups.
- **Safety / trust.** Every signal carries a source, timestamp, confidence and relevance, and a
  standing caveat: *"External signals are supporting context only and should be verified by the
  seller before action."* External claims are **never** written back to CRM unless the user approves
  a note/task through the existing, unchanged approval gate.
- **Resilience.** The provider never raises; a missing key or any network error falls back to
  deterministic mock context and the response reports `provider_mode` (`live` | `fallback` | `mock`)
  so the UI can label the source honestly. The app cannot be destabilised by external search.
- **Security.** Live-search keys live ONLY in `services/api/.env` (git-ignored). The key is sent in
  a request **header** (never a logged URL or query string), is never printed or logged, and never
  appears in any tracked file.

### 12.1 Executive Intelligence Fusion

On top of the raw signals, the layer builds a short **executive brief** (`external_signals/fusion.py`,
`build_brief(account, signals) -> ExecutiveBrief`) that **fuses the account's internal CRM trajectory
with the external context**. It is deterministic, read-only on the account, and explanatory only —
**it does not touch ranking, scoring, governance, confidence or write-back.**

```
Internal CRM signals                     External signals
(spend change, support risk,             (market trend, funding, expansion,
 engagement, renewal window,    ──┐  ┌── competition, regulatory, layoffs,
 growth potential, campaign       ▼  ▼    leadership change, industry trend)
 response, last touch)         ┌──────────────┐
                               │   Fusion     │  → ExecutiveBrief
                               └──────────────┘
```

The `ExecutiveBrief` contains: `internal_summary`, `external_summary`, `fused_insight`,
`business_implication`, `seller_implication`, `recommended_conversation_strategy`,
`suggested_opening_line`, `confidence`, `caveats[]`, `sources[]`. Confidence is **conservative**:
external context alone never earns "high" — "high" requires multiple strong, credible external
signals **and** internal corroboration (e.g. negative external context alongside declining spend, or
positive external context alongside rising spend / high growth). The language is deliberately hedged
("External signals suggest…", "Public context indicates…", "this may increase urgency because…") and
every brief carries the standing external-context caveat.

In the UI this renders as the **"Outside-In Intelligence"** section in the workspace account panel,
visually secondary to internal evidence: *what this means* (fused insight + confidence), *what changed
outside the CRM*, *why it matters*, *seller implication*, *suggested conversation strategy*, a
*suggested opening line*, *sources*, and the caveat. Raw signals are tucked behind a "show supporting
signals" toggle to keep the panel calm.

Endpoints: `GET /api/external-signals/{account_id}` (one account; the response embeds the brief plus
`provider_mode` and `sources`), `GET /api/external-signals/{account_id}/brief` (the fusion brief on
its own — additive, never breaks existing clients), and `POST /api/external-signals/refresh` (priority
accounts only, capped by `EXTERNAL_SIGNALS_REFRESH_LIMIT`). Status (including `provider_mode`,
`searchapi_configured` and `live_ready`) is reported in `/api/meta` and `/api/system/status`.

