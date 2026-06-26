# Signal-to-Action Agent — Finals Demo Narrative

**Team VentureOS · India Agentic AI Open Hackathon 2026 · Track A — Agentic Workflows**

Build commit: `f0f8a9f` · Live: https://ventureos-signal-to-action-agent.vercel.app · Backend: https://signal-to-action-api.onrender.com

---

## Why this matters (60 seconds)

Enterprise revenue teams drown in fragmented signals — CRM updates, support spikes, usage drops, renewal clocks, campaign responses — none of which tell a leader what to *do*.

**Signal-to-Action Agent** is a controlled multi-agent workflow that turns that noise into an explainable, human-approved next-best action. It is built as a *system of action*, not a chatbot:

- Six typed agents with explicit contracts
- Evidence-backed recommendations with confidence scoring
- A decision ledger that records every reasoning step
- Human-in-the-loop approval before anything executes
- A replaceable model adapter layer ready for NVIDIA NeMo / NIM
- A connected source layer ready for HubSpot CRM (synthetic 150 default, HubSpot 40 when configured)

The product feels like a Revenue Command Center, not a developer dashboard.

---

## 5-minute demo flow

### 1 · Open the Command Center (0:00 – 0:30)

Live URL loads. Above the fold, in order:

1. **Executive Daily Briefing** (Phase 14F) — urgency badge + one-line headline + three pillars (*What changed · Why it matters · What to do next*) + ranked action list with estimated minutes per item.
2. **AI Chief of Staff** — *"Across 99 accounts: ₹X at risk · ₹Y expansion · Z need attention. Start with Curefoods."*
3. **Portfolio Pulse** with "Data Source: HubSpot test CRM · 99 records · synced 2m ago".

> **What to say:** *"This is the leadership view. The Daily Briefing tells me what changed overnight, why I should care, and the five things I should do today. The AI Chief of Staff puts a face on the topline numbers. Everything below is supporting evidence."*

### 2 · Run an analysis (0:30 – 1:15)

Click **Re-run**. The Live Workflow Rail lights up six agents in sequence:

```
Signal Ingestion → Account Health → Opportunity → Governance → Action → Communication
```

Top recommendation: **Curefoods #1** with confidence, governance status, and evidence pills.

> *"Each agent has a typed input/output contract. The Decision Ledger records every step — agent name, summary, evidence count, latency."*

### 3 · Open the active account (1:15 – 2:00)

Select Curefoods. The Workspace shows:

- Account name + renewal countdown + risk + opportunity chips
- Lifecycle ribbon: Detected → Recommended → Prepared → Approved → Executed → Outcome
- Tabs: **Overview · Conversation Prep · Email Draft · CRM Update · Evidence · Timeline**
- **Recommendation Evolution callout** (Phase 14C) — *"Previous: Follow-up call → Current: Executive escalation · Reason: Support risk crossed threshold."*
- **Account Timeline** showing every signal, agent action, and approval in chronological order

> *"This is where the seller actually works. One account in focus at a time. The right panel always reflects the active account."*

### 4 · Approve an action (2:00 – 2:45)

Click **Mark for Approval**. The Approval Drawer opens with:

- Recommended action + draft email + call script + voice summary
- Confidence + governance caveats
- Approve / Reject / Request review buttons

Approve. The Decision Ledger captures the entry; the Lifecycle ribbon advances to **Approved**; the CRM Writeback Readiness panel shows what would post back to HubSpot.

> *"Nothing executes without a human. Everything that does is auditable in the Decision Ledger under Trust & Governance."*

### 5 · Show the living system (2:45 – 4:00)

Scroll down to **Portfolio Intelligence**. Show:

- **Live signal drift** (Phase 14A) — last update timestamp + accounts changed + largest movements
- **Portfolio Pulse Impact Summary** — most significant risk increase, most significant opportunity increase, account requiring immediate attention
- **Recommendation Delta log** (Phase 14B) — historical recommendation evolution per account
- **Portfolio Timeline** (Phase 14D) — cross-account chronological feed grouped by day
- **What changed in connected systems** (Phase 14E) — "Acme's monthly spend dropped 25% in HubSpot test CRM since the last sync · Recommendation revised → Executive escalation"

> *"The portfolio is alive. Signals evolve every minute. Agents react. Recommendations adapt. Every change is surfaced in business language with the AI agents that engaged."*

### 6 · Show governance + provider story (4:00 – 4:45)

Open **Trust & Governance**:

- Decision Ledger (audit-grade table)
- CRM Writeback Readiness
- Model provider: **mock (mock-deterministic-v1)** — swap label to *nvidia_nim* via env, no code change
- BYOK panel: provider keys are **browser-session only** — never persisted, never deployed

> *"The model adapter pattern means the day we get NVIDIA Nemotron access, we change one env variable. The governance loop is independent of the provider."*

### 7 · Close on the why (4:45 – 5:00)

- **Sovereign**: synthetic-by-default, BYOK only, no enterprise data leaves the browser
- **Multi-agent**: six typed agents, not one chat completion
- **Explainable**: every recommendation cites evidence and confidence
- **Human-in-the-loop**: nothing executes without approval
- **NVIDIA-ready**: model adapter + NIM stub already in `model_adapters/`
- **Production-shipped**: live on Vercel + Render, GitHub-hosted, 6-phase visible release history (Phase 14A → 14F)

> *"This isn't a hackathon prototype. This is a credible future seller operating system."*

---

## Backup demo paths

| If… | Then show… |
|---|---|
| Backend cold-starts (Render free tier) | Demo Mode (Phase 11) replays a pre-recorded narrative |
| HubSpot toggle is off | Synthetic 150 accounts; full feature parity |
| BYOK key not provided | Mock provider — every demo path still works deterministically |
| Internet flaky | Localhost: `services/api` (uvicorn) + `apps/web` (next dev) on 8000/3000 |

---

## One-line elevator pitch

> *"Signal-to-Action Agent turns fragmented enterprise customer signals into evidence-backed, human-approved next-best actions — a sovereign multi-agent system of action, ready for NVIDIA NeMo, shipped on Vercel + Render."*

---

## Phase 14 program summary

| Phase | Capability | Commit | Live? |
|---|---|---|---|
| 14A | Live Signal Drift Engine + Pulse Impact Summary | (earlier) | ✓ |
| 14B | Recommendation Delta Tracking | (earlier) | ✓ |
| 14C | Recommendation Evolution + Account Timeline | `ccfdb53` | ✓ |
| 14D | Executive Change Brief + Portfolio Timeline | `b6ce11f` | ✓ |
| 14E | External System Change Detection | `ce70b65` | ✓ |
| 14F | Executive Daily Briefing | `f0f8a9f` | ✓ |

**Status: PHASE 14 FROZEN. READY FOR FINALS.**
