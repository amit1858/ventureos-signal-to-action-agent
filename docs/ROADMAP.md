# Roadmap — Signal-to-Action Agent

A lightweight view of where the product is today and where it is going. The architecture is designed
so that each future step slots in **without changing the deterministic engine, the contracts, or the
UI**.

---

## ✅ Current (demo build — feature frozen)

- **HubSpot test CRM** integration (sync 40 demo companies; approved task/note writeback).
- **Synthetic data mode** as an always-available offline fallback.
- **Deterministic reasoning engine** — auditable rankings, risk, opportunity, and next-best actions.
- **Six-agent governed workflow** with typed Pydantic contracts.
- **Executive Command Center** — Morning Brief, Portfolio Health, Today's Priorities, Risk vs
  Opportunity map, Executive Briefing, Governed Pipeline.
- **Workspace** — conversational query surface.
- **Human approval** — nothing autonomous; every action starts as `pending`.
- **Decision ledger** — full run trace persisted for audit and replay.
- **Replaceable model provider** — mock adapter active; NVIDIA NIM adapter stubbed.
- **Outside-In intelligence (optional, default off)** — an additive enrichment layer that attaches
  cited, caveated *public* context (news, market/funding/leadership/regulatory shifts) to an account
  and **fuses it with internal CRM signals** into a hedged executive brief. Phase 4.2 expands this into
  a McKinsey-style **Executive Decision Brief**: executive summary, why it matters, structured internal
  evidence (source of truth), synthesized external intelligence, AI fused insight, business & seller
  implications, conversation strategy, suggested opening line, an **advisory, approval-gated CRM
  write-back recommendation** (task + note + follow-up), confidence + why, an explicit "what not to do"
  list, and sources. Supporting context only — it never changes ranking, scoring, governance, confidence
  or CRM write-back, and the write-back recommendation is advisory (human approval still required). Mock
  provider wired; live `serper` and `searchapi` providers ready behind a key with safe mock fallback.

---

## 🔜 Next

- **OpenAI narrative provider** — route the narrative layer through OpenAI (facts stay deterministic).
- **NVIDIA Nemotron / NIM provider** — production NVIDIA path for the narrative layer.
- **Provider toggle / abstraction** — switch providers via `MODEL_PROVIDER` with no other changes.
- **Live external signals (serper.dev / SearchAPI.io)** — flip `EXTERNAL_SIGNALS_PROVIDER=serper` or
  `=searchapi` with the matching key to pull real public context; still fused conservatively, cited,
  caveated and non-authoritative, with automatic mock fallback if the provider is unavailable.
- **Richer evaluation harness** — expand `evals/` to score narrative quality and ranking stability.
- **Production authentication** — real user identity to drive the greeting and approval audit trail.
- **Additional CRM connectors** — beyond HubSpot, using the existing vendor-neutral interface.

---

## 🌅 Later

- **Microsoft Dynamics connector.**
- **Salesforce connector.**
- **Real enterprise identity** (SSO / directory integration).
- **Multi-tenant isolation** — separate data and config per customer.
- **Admin controls** — manage data sources, providers, and write-back gates from the UI.
- **Governance audit export** — export the decision ledger for compliance review.
- **Benchmark dashboards** — track recommendation quality and outcomes over time.

---

## Guiding principle

Every future item changes **how facts are narrated or where data comes from** — never **how
decisions are made**. The deterministic business engine remains the source of truth, and human
approval remains mandatory before any CRM write.
