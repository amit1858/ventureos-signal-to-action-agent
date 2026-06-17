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
| → Executive Morning Brief | "What changed overnight, and where should I spend today across my whole book?" |
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

The `ExecutiveBrief` contains the Phase 4.1 narrative — `internal_summary`, `external_summary`,
`fused_insight`, `business_implication`, `seller_implication`, `recommended_conversation_strategy`,
`suggested_opening_line`, `confidence`, `caveats[]`, `sources[]` — plus the Phase 4.2 Executive
Decision Brief fields (all additive and optional, so older clients and cached results still validate):
`executive_summary`, `why_it_matters`, `internal_evidence[]` (structured label/value/tone rows read
straight from the deterministic engine's account fields), `external_intelligence[]` (synthesized
themes, **not** an article dump), `conversation_strategy_steps[]`, `confidence_rationale`,
`what_not_to_do[]` (explicit cautions, always including "do not treat external news as proof" and "do
not bypass human approval"), and `crm_writeback` (an **advisory, approval-gated** suggestion of a CRM
task + note + follow-up reminder). Confidence is **conservative**: external context alone never earns
"high" — "high" requires multiple strong, credible external signals **and** internal corroboration
(e.g. negative external context alongside declining spend, or positive external context alongside
rising spend / high growth). The language is deliberately hedged ("External signals suggest…", "Public
context indicates…", "this may increase urgency because…") and every brief carries the standing
external-context caveat.

In the UI this renders as the **"Executive Decision Brief"** section in the workspace account panel
(Phase 4.2 — formerly "Outside-In Intelligence"), framed as supporting context and laid out as a
McKinsey-style memo with clear hierarchy: an *executive summary* (what's happening + confidence),
*why this matters*, the *AI fused insight*, a structured *internal evidence* table tagged **source of
truth**, synthesized *external intelligence* tagged **supporting**, *business* and *seller*
implications, a numbered *conversation strategy*, a *suggested opening line*, a collapsible
*recommended CRM write-back* (clearly marked **draft · needs approval**), *confidence + why*, an amber
*what not to do* list, and *sources*. Raw signals stay tucked behind a "show supporting signals"
toggle. The CRM write-back block is **advisory only** — it never triggers a write-back; the seller
still uses the existing approval controls to log a task or note.

Endpoints: `GET /api/external-signals/{account_id}` (one account; the response embeds the brief plus
`provider_mode` and `sources`), `GET /api/external-signals/{account_id}/brief` (the fusion brief on
its own — additive, never breaks existing clients), and `POST /api/external-signals/refresh` (priority
accounts only, capped by `EXTERNAL_SIGNALS_REFRESH_LIMIT`). Status (including `provider_mode`,
`searchapi_configured` and `live_ready`) is reported in `/api/meta` and `/api/system/status`.


## 13. Evaluation & architecture surfaces (Phase 4.4)

Phase 4.4 is a presentation + foundation pass: it adds an enterprise "Evaluation &
Architecture" view and a consistent design language, with **zero business-logic change**
(ranking, scoring, confidence, governance, approval, CRM write-back, HubSpot and external
signals are all untouched; the only backend surface used is the pre-existing, read-only
`/api/system/config`). Everything below is derived on the frontend from data the engine
already produced (`apps/web/lib/evaluation.ts` + `apps/web/components/evaluation/EvaluationView.tsx`).

### Evaluation Center
Twelve evaluation dimensions across three groups - Output quality (recommendation, evidence,
executive brief, conversation strategy, external intelligence), Governance & trust (governance
compliance, source attribution, hallucination prevention, CRM write-back safety) and
Performance & runtime (determinism, latency, token/provider usage). Capability dimensions
reflect how the system is built; data-derived dimensions (evidence completeness, latency,
top-rank alignment) are measured from the latest workflow run. Token/provider usage is the
single "planned" dimension (it arrives with the live LLM provider in Phase 5). This complements
the deterministic `evals/` suite (10/10), which remains the backend source of truth.

### Model-provider framework
A presentation of the existing `model_adapters/` factory: Mock (active, deterministic
baseline), NVIDIA Nemotron / NIM (ready - adapter implemented), OpenAI and Anthropic Claude
(planned - stubs behind the same interface) and Azure AI (planned). "Key configured" badges
come only from the redacted booleans in `/api/system/config` - never a secret value. Facts and
scores stay deterministic; a provider only narrates.

### CRM-connector framework
A presentation of the existing `crm_connectors/` abstraction: HubSpot live; Salesforce,
Microsoft Dynamics 365, SAP CRM and Zoho planned behind the same `CRMConnector` contract.

### Production-architecture matrix
Twelve pillars graded live / designed / planned: Human approval, Decision ledger & audit,
Governed reasoning, Secrets management and Evaluation are live; Model routing, Connector
management and Observability are designed (built, ready to wire); Authentication & SSO, Tenant
isolation, Role-based access and Per-user portfolio are planned for a multi-tenant rollout.

### Design language & demo delight
One typography rhythm (eyebrow / section heading / decision / supporting / evidence / metadata)
and a single semantic colour language reused across the app. Loading narrates the work
("Reviewing customer signals...", "Evaluating renewal and churn risk...", ...) and resolves to
"I'm ready. Here's where I'd spend today." All motion honours `prefers-reduced-motion`.

---

## 14. Decision providers (BYOK)

Phase 5.0 adds a Bring-Your-Own-Key (BYOK) decision layer in `services/api/decision_providers/`.
It is additive and decoupled: it reuses the existing deterministic engine for context and never
modifies ranking, scoring, confidence, governance, approval or CRM write-back.

### Goal
Let several model providers reason over the SAME deterministic account context and return ONE
common structured decision, surfaced as a read-only Comparison Mode in the Evaluation Center. The
deterministic engine stays the source of truth, the benchmark, and the fallback.

### Package layout
- `base.py` - the contract: DecisionContext (input), ProviderDecision (output), the action
  vocabulary and level enums, JSON parsing/validation, and the fallback / not-configured helpers.
- `context.py` - build_decision_context(account_id) reuses the existing agent pipeline (signal
  ingestion, account health, opportunity, governance, action) plus the scoring breakdown and the
  optional external-signals fusion brief. Read-only; never raises.
- `deterministic_provider.py` - the baseline provider (no LLM).
- `llm_base.py` - shared LLM behaviour: grounded prompt, strict-JSON parsing, retry-once,
  ProviderError, safe HTTP. Concrete providers only implement the HTTP call.
- `openai_provider.py`, `anthropic_provider.py`, `nvidia_provider.py` - concrete providers
  (stdlib urllib; no new dependencies).
- `__init__.py` - the router: get_decision_provider, provider_status, evaluate_account,
  compare_account.

### Common contract
Every provider returns the same shape: provider, model, mode (deterministic / live / fallback /
not_configured), risk_level, opportunity_level, recommended_action, confidence, executive_summary,
business_implication, seller_implication, conversation_strategy, opening_line, crm_note, reasoning,
caveats, latency_ms.

### Routing and fallback
The router computes the deterministic baseline first. Configured live providers run through a
wrapper that catches any error or invalid output and returns a deterministic fallback decision
(mode = fallback) so the flow never breaks. Providers with no key are reported as not_configured
and are never called. Comparison runs the baseline plus every configured live provider and adds a
differences table and an evaluation block (agreement, divergence, availability, latency,
governance_compliant).

### Governance
LLM-generated decisions are advisory. They cannot bypass governance, cannot write to CRM, cannot
create autonomous action, and cannot override human approval. A standing caveat is attached:
"LLM-generated decisions are advisory and must pass governance and human approval before CRM
action." External signals remain supporting context only and never change ranking or scoring.

### Security
Keys are read only from the environment (services/api/.env, git-ignored). They are never returned
by an API, never logged (providers log only the exception type), and never sent to the browser.
Status responses contain presence booleans and the model name, never the key value.

### Phase 5.0A - UI session-key BYOK (true BYOK experience)

Phase 5.0A adds a first-class BYOK *user experience* on top of the Phase 5.0 backend. A user can
bring their own key, configure it through the UI, test the connection, activate a provider, compare
providers and clear the key - without touching infrastructure. Both supply paths coexist:

- Infrastructure mode - keys from environment variables (services/api/.env or the host secret
  store), unchanged from Phase 5.0.
- User BYOK mode - session keys supplied through the browser UI.

Frontend (apps/web):
- lib/byok.ts - a sessionStorage credential store. Keys live under s2a.byok.<provider> and the
  active provider under s2a.byok.active. Functions: get/set/clearCredential, getActiveProvider /
  setActiveProvider, toWire / getAllCredentialsWire (backend snake_case shape, only providers that
  carry a key or override), maskKey (reveals a short prefix then bullets). SSR-guarded; never uses
  localStorage.
- Evaluation Center -> Provider Settings - one card per provider with a masked (type=password) key
  input, an optional model input, and Test / Activate / Clear actions; an active-provider selector
  (Deterministic + the three LLM providers, one active); and comparison analytics (provider
  agreement, decision divergence, reasoning leaderboard) that render once at least one live decision
  exists. Activating a provider here drives Comparison Mode and evaluation only - the seller Command
  Center always uses the governed deterministic engine.

Backend (services/api):
- decision_providers/base.py - ProviderCredential value object (api_key / model / base_url) and a
  DecisionProvider.__init__(credential=None) so a per-request session credential can be threaded in.
- decision_providers/llm_base.py - session resolvers (session_key / session_model /
  session_base_url) that prefer the request credential over env settings, and a ping() connection
  test that classifies failures to safe messages (invalid API key, rate limited, network error)
  without ever echoing the key.
- decision_providers/__init__.py - credentials are threaded through provider_status, evaluate_account
  and compare_account; a new test_provider(provider_id, credential) returns a secret-free
  {ok, provider, model, status, latency_ms, error}.
- main.py - additive POST /api/decision-providers/test; evaluate and compare accept an optional body
  carrying per-provider credentials. Session keys travel in the request BODY only (never the query
  string) and are used for that single request - never persisted, cached, logged or written to disk.

Security: session keys are masked in the UI, sent only in request bodies, never returned by an API,
never logged, never persisted server-side, and cleared by the browser when the tab closes. The
deterministic baseline, governance, human approval and CRM write-back are unchanged; LLM decisions
remain advisory.


---

## Phase 6 � AI Reasoning Experience & Transparency Layer

Phase 6 closes the gap between BYOK provider connectivity (built in
Phase 5) and the user-visible experience. The principle is simple:
**if AI is influencing what the user reads, the user must be told.**

### Frontend modules added

| File | Role |
|---|---|
| `apps/web/lib/aiOverlay.ts` | Client-only overlay store. Hooks (`useActiveProvider`, `useUtilization`), `fetchOverlay()` helper that calls the existing `/api/decision-providers/evaluate/:account_id` for the top-N recommendations in parallel, in-session utilization tracker with a tiny event bus. No backend code touched. |
| `apps/web/components/AIReasoningStatus.tsx` | `AIReasoningChip` (persistent header chip), `AIEnhancedBanner` (post-rerun banner), `GeneratedWithBadge` (inline attribution), `AIReasoningPanel` (Trust & Governance transparency panel). |

### Runtime contract

When the user activates a BYOK provider and clicks **Re-run**:

1. The standard `/api/recommendations` call runs first and returns the
   deterministic ranking � unchanged from pre-Phase-6.
2. A fire-and-forget overlay fetch issues parallel
   `/api/decision-providers/evaluate/:account_id` calls for the top
   three recommendations using the session BYOK credential.
3. Each per-account response is cached in the overlay map and surfaced
   in three places:
   - The Executive Morning Brief gains an *"Executive synthesis"* card
     under the deterministic headline.
   - The result list shows an *"AI-enhanced reasoning applied"* banner.
   - The Workspace account-detail panel shows a *"Reasoning Source"*
     flow strip (Deterministic Evidence ? AI Interpretation ? Suggested
     Action ? Human Approval) and an AI Interpretation card with
     executive summary, business implication, conversation strategy,
     suggested opening line and caveats.
4. The utilization tracker records provider, model, request count,
   latency samples, fallback count and last invocation time. These are
   surfaced in the Trust & Governance panel.

### Invariants enforced

- The LLM never touches `priority_rank`, `priority_score`, risk score,
  opportunity score, `confidence`, evidence list, `governance_status`
  or `approval_status`. Those fields live on the deterministic
  recommendation and are passed through to the UI untouched.
- A per-account overlay failure is recorded as a fallback and the
  deterministic narrative remains visible for that account.
- When no BYOK provider is active, no overlay fetch is issued and the
  UI behaviour is identical to pre-Phase-6.
- BYOK keys remain session-scoped and masked. No new backend endpoints,
  no new server-side state, no new environment variables.

### Visible UI surface

| Surface | What changed |
|---|---|
| Global header | Persistent `AIReasoningChip` showing Governed Decision Engine / Provider configured / Provider reasoning active + model. |
| Command Center | `AIEnhancedBanner` above the result list naming the model. `Executive synthesis` card inside the Morning Brief when an overlay is available. |
| Workspace | `Reasoning Source` flow strip + AI Interpretation card on the account detail panel. `Generated with` badge inline. |
| Trust & Governance | New `AIReasoningPanel`: provider/model/mode line, *"How AI is helping"* (6 checkmarks) and *"Not currently using AI"* (5 dimmed entries), Provider Utilization strip, standing trust statement. |

### Why no backend changes

Phase 6 is intentionally a presentation-layer phase. The backend
already exposed everything needed (`/api/decision-providers/evaluate`,
`/api/decision-providers/compare`, `/api/decision-providers/status`,
`/api/decision-providers/models/{provider}`). Adding the transparency
layer in the frontend lets us iterate on the UX without redeploying
the API and keeps the governance-critical code paths untouched.
