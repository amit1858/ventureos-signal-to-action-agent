# Roadmap — Signal-to-Action Agent

A pragmatic view of where the product is today and where it is going.
The architecture is designed so each future step slots in **without
changing the deterministic engine, the contracts, or the governance
posture**.

---

## ✅ Current (deployed, demo-ready)

Live at https://ventureos-signal-to-action-agent.vercel.app

- **HubSpot connector** — sync 40 demo SMB companies + contacts + deals
  + activities from a test portal; approved task and note write-back.
- **External signals** — Serper / SearchAPI provider layer (default off).
  Outside-in supporting context only; never changes ranking.
- **Deterministic prioritization** — six-agent governed workflow with
  typed Pydantic contracts. Auditable rankings, risk/opportunity scores,
  confidence, and recommended next-best actions.
- **LLM reasoning overlay (Phase 6)** — top-N recommendations are
  enriched with executive summary, business implication, conversation
  strategy, opening line and CRM note draft. Strictly advisory; never
  alters ranking/scoring/governance.
- **BYOK** — OpenAI / Anthropic / NVIDIA configured by the user from the
  browser. Session-storage keys, live model discovery, masked display,
  no server-side persistence.
- **Evaluation & governance** — 12-dimension evaluation board, Provider
  Consensus across engines, approval gate on every CRM action, decision
  ledger persisted for audit and replay.
- **CRM write-back** — HubSpot tasks + notes on approved recommendations
  only. Idempotency via fingerprint.
- **Executive surfaces** — Command Center, Executive Morning Brief,
  Executive Decision Brief per account, Trust & Governance view with
  AI Reasoning Status, "How AI is helping" panel and Provider Utilization.

---

## 🔜 Next — Phase 7: Multi-Agent Strategic Reasoning

Move from *one orchestrator → six sequential agents* to a true
multi-agent strategic reasoning layer that can:

- Debate alternatives and surface dissent.
- Plan multi-step engagement sequences (not just a single next action).
- Reason across accounts (book-level orchestration), not only per-account.
- Use BYOK providers in a structured *review-board* pattern — proposer
  vs critic vs governance — rather than a single advisory pass.
- Preserve every existing invariant: deterministic ranking still owns
  priority; humans still own approval; CRM write-back stays gated.

---

## 🛠 Connector strategy

| Connector | Status | Notes |
|---|---|---|
| **HubSpot** | ✅ Live | Test portal, private-app token, idempotent write-back |
| **Salesforce** | 📐 Planned | Same `CRMConnector` contract; OAuth flow |
| **Microsoft Dynamics 365** | 📐 Planned | Same `CRMConnector` contract; Azure AD app |
| **Pipedrive / Zoho** | 🔮 Future | Driven by demand |

The CRMConnector contract is intentionally narrow — `list_accounts`,
`list_contacts`, `list_deals`, `list_activities`, `create_task`,
`create_note`. Adding a connector is a sprint, not a refactor.

---

## 🤖 Reasoning provider strategy

| Provider | Status |
|---|---|
| **Deterministic Decision Engine** | ✅ Live · source of truth |
| **OpenAI** (GPT-4.1 / 4o / 4o mini) | ✅ Live BYOK |
| **Anthropic** (Claude Sonnet 4.6, Opus 4, Haiku) | ✅ Live BYOK |
| **NVIDIA Nemotron / NIM** | 🟡 Ready · BYOK wired, hackathon eligibility |
| **Azure OpenAI** | 🔮 Future · enterprise key vault path |
| **Local / on-prem models** | 🔮 Future · sovereign deployment |

---

## 🔐 Enterprise readiness

| Pillar | Status |
|---|---|
| Human approval gate | ✅ Live |
| Decision ledger (audit replay) | ✅ Live |
| Secrets management (BYOK, no persisted creds) | ✅ Live |
| Evaluation harness (12 dimensions) | ✅ Live |
| Observability (logs, latency, fallback counts) | 🟡 In progress |
| **Authentication & SSO** | 📐 Planned |
| **Role-based access control** | 📐 Planned |
| **Multi-tenant isolation** | 📐 Planned |
| **Production-grade key vault** (Azure KV / AWS KMS) | 📐 Planned |
| **Usage telemetry & billing** | 📐 Planned |

---

## 🧭 Phased commitment

- **Phase 7 — Multi-Agent Strategic Reasoning.** Debate, planning,
  book-level orchestration.
- **Phase 8 — Salesforce connector.** Same governance, second CRM.
- **Phase 9 — Authentication + RBAC + multi-tenant isolation.**
  Production posture, single deployment serves multiple teams safely.
- **Phase 10 — Production key vault + observability + usage telemetry.**
  The full enterprise control plane.

Each phase preserves the Phase-6 invariants:

> AI helps explain and recommend. AI does not determine priority,
> change governance, or execute CRM actions. Humans remain accountable
> for all decisions.
