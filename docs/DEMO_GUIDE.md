# Demo Guide — Operating the Signal-to-Action Agent

> A presenter's playbook: what to show, in what order, what to say, and how to
> recover if something goes wrong. Four timed scripts (2 / 5 / 10 / 15 minutes)
> aligned to the NVIDIA submission deck. For anyone demonstrating the product.

**Live demo:** <https://ventureos-signal-to-action-agent.vercel.app>
**Backend health:** <https://signal-to-action-api.onrender.com/api/health>

> ⏱️ **Cold-start note:** the backend runs on a free tier and may sleep. The
> first request after idle can take **~50 seconds**. Always **warm it up** by
> loading the health URL a minute before you present. See
> [§ Fallback](#5-fallback-and-offline-plan).

---

## 1. The one-sentence pitch

> "Signal-to-Action Agent is a sovereign, governed multi-agent workflow that turns
> fragmented customer signals into explainable, human-approved next-best actions —
> it tells a seller which accounts need attention this week, why, and exactly what
> to do, with a human approving every action and a decision ledger recording it."

Say what it is **not**, too: not a dashboard, not a CRM, not a chatbot. It is an
**enterprise revenue operating system** with a governed agentic core.

---

## 2. Before you start — the 90-second checklist

- [ ] Warm the backend: open the health URL, confirm `"status": "ok"`.
- [ ] Open the live app; confirm the Command Center renders with data.
- [ ] Note the **data-source badge** (synthetic vs. HubSpot test CRM) so you can
      speak to it.
- [ ] Have this guide and the [deck](submission/) open on a second screen.
- [ ] Pick your script below by the time you've been given.
- [ ] Optional: have screenshots from `docs/assets/screenshots/` ready as an
      offline backup.

---

## 3. The product surfaces, in demo order

| # | Surface | The one thing to say |
|---|---|---|
| 1 | **Persona-specific Morning Brief** | "One operating system, three first experiences — Executive sees what changed, Seller sees what to do first, Operations sees what needs attention." |
| 2 | **Seller Morning Brief** | "Not a dashboard — a work briefing. This mission's effort, today's action narrative, and a Now / Next / Later timeline." |
| 3 | **Today's Mission (Mission Mode)** | "A first-class guided flow: Review → Evidence → Outreach → CRM Note → Approval → Execution → Outcome. The seller never wonders what to click next." |
| 4 | **Mission Complete** | "What was accomplished, business impact, and the next recommended mission — one CTA to keep going." |
| 5 | **Executive Command Center** | "The power view: who needs attention this week, and why." |
| 6 | **Executive Brief / AI Chief of Staff** | "A morning brief — what changed, the biggest risk, the biggest opportunity, what to do first." |
| 7 | **Portfolio Pulse** | "Risk and opportunity movement across the full book of accounts, ranked for focus." |
| 8 | **Workspace (Explain Mode)** | "Open Full Workspace from any mission step: evidence, why now, the draft — then return to the mission." |
| 9 | **Evidence Intelligence** (Evidence tab) | "Every claim is sourced — agent and system of record." |
| 10 | **Executive Change Brief + Recommendation Evolution** | "Why recommendations moved, with timeline context." |
| 11 | **Revenue Execution Center** | "Approved decisions move through a five-step pipeline to a measured outcome." |
| 12 | **Decision Ledger + Governance** | "Every decision is logged; a human approves everything." |
| 13 | **HubSpot integration** | "Live test-CRM data in, governed write-back gated behind approval." |
| 14 | **Adaptive Experience Modes** | "Executive, Seller, Operations — one product, three first experiences." |

---

## 4. Timed scripts

### ⏱️ 2 minutes — the elevator demo

1. **(0:00) Frame it.** Say the one-sentence pitch. Point at the proof band:
   *99 accounts · 108 signals · 6 agents · 10 recommendations · 10/10 evals · live
   on Vercel + Render.*
2. **(0:30) Ask the question.** In the Workspace, run "Which SMB accounts need
   attention this week and why?" Let the agent reasoning sequence play.
3. **(1:00) Read the top recommendation.** Curefoods → recover at-risk customer.
   Point at the **reason**, the **confidence**, and one **evidence** item.
4. **(1:30) Land governance.** Open the approval drawer: "Nothing is sent until a
   human approves — and it's all logged. AI assists, humans decide."

### ⏱️ 5 minutes — the standard demo

Do the 2-minute script, then:

5. **(2:00) Evidence.** Open the Evidence tab on the top account: source agent +
   source system + polarity per item. "No black box."
6. **(3:00) Change context.** Open the Executive Change Brief: "This is what
   changed and why it changed since the last review window." *(Decision Intelligence
   Studio and Trend Intelligence are Next / In Review and may not be in the demo build.)*
7. **(3:45) Execution.** Open the Revenue Execution Center: walk the five-step
   pipeline (Prepared → Approved → Ready for CRM → Written → Verified). "It
   stops at Ready for CRM in the demo — by design — write-back is gated."
8. **(4:15) The brief.** Show the Executive Brief / AI Chief of Staff: "This is
   the morning brief a revenue leader reads first."
9. **(4:35) NVIDIA + Voice.** "The model layer is provider-abstracted and
   NVIDIA-ready — Nemotron via NIM. And it's voice-ready: a planned Voice Chief of
   Staff with Gnani.ai."

### ⏱️ Seller Mission walkthrough (drop-in, ~3 minutes)

Use this to show **Seller mode** specifically — the guided work experience. Switch the mode toggle to **Seller**.

1. **Open the Seller Morning Brief.** "This isn't a dashboard — it's a work briefing. *This mission: ~43 min*, the day's action narrative (*recover / prepare / follow up*), and a Now / Next / Later timeline."
2. **Click *Begin Today's Mission*.** "One mission, one recommendation, one CTA — no decision fatigue."
3. **Walk the stepper.** Step through Review → Evidence → Outreach → CRM Note → Approval → Execution → Outcome. "The seller always knows where they are, what to do next, and why it matters. *Open Full Workspace* is one click away on every step — that's Explain Mode."
4. **Land the Execute step.** "Execution hands off into the existing Revenue Execution Center — no logic is duplicated, every event hits the Decision Ledger."
5. **Show Mission Complete.** "What was accomplished, business impact, governance and execution status — and the next recommended mission with a single *Start next mission* CTA. The seller naturally continues."

### ⏱️ 10 minutes — the technical demo

Do the 5-minute script, then go under the hood:

9. **(5:00) The six agents.** Open the runtime trace. Walk the sequence: Signal
   Ingestion → Account Health → Opportunity → Governance → Action → Communication.
   "The first four plus scoring run for every account with **zero model calls** —
   deterministic and reproducible. Only the top accounts get an LLM, and only to
   *phrase* facts, never to decide."
10. **(7:00) BYOK comparison.** In the Evaluation Center, show the Decision
    Provider comparison: deterministic baseline vs. OpenAI / Anthropic / NVIDIA.
    "Bring your own key — held in session memory only, never persisted. The
    deterministic engine is always the benchmark and the fallback."
11. **(8:30) HubSpot.** Show the data-source badge and the governed write-back:
    "Live test-CRM data; an approved action becomes a HubSpot task + note — after
    approval, never before."
12. **(9:30) Governance close.** Decision Ledger: the audit trail and manager
    summary (revenue protected, opportunities advanced).

### ⏱️ 15 minutes — the executive deep-dive

Do the 10-minute script, then:

13. **(10:00) Adaptive modes.** Switch Executive → Seller → Operations. "Same
    governed core, three audiences."
14. **(11:30) Recommendation evolution + timeline.** Show how a recommendation
    changed and why — the historical reasoning trail.
15. **(13:00) Architecture story.** Pull up the deck's architecture slide:
    Seller → Voice (Gnani.ai) → Command Center → Orchestrator → 6 agents →
    Governance → Ledger → Revenue Execution → Outcomes → Continuous Learning.
16. **(14:00) Vision.** Close on the evolution arc: Systems of Record →
    Engagement → Intelligence → **Reasoning**. "Where AI reasons, humans govern,
    and every recommendation becomes an accountable business outcome."

---

## 5. Fallback and offline plan

Things go wrong live. Have these ready.

| Symptom | Recovery |
|---|---|
| App is slow / blank on first load | The backend was asleep. Reload the health URL, wait ~50s, retry. Narrate it: "free-tier cold start — warming up." |
| Backend unreachable | Switch to **screenshots** in `docs/assets/screenshots/` and narrate the same flow. The story does not depend on a live call. |
| HubSpot source erroring | Switch to **synthetic** mode (the toggle); the full workflow runs on local synthetic data with no external dependency. |
| A specific account looks odd | Pivot to the default query and the top recommendation; the ranking is deterministic and stable. |
| Projector / network dies | Present the [PDF deck](submission/) — it carries the full narrative and embedded screenshots. |

**Golden rule:** the product's value is the *governed workflow*, not any single
live call. If the network fails, tell the story with screenshots and the deck —
it lands just as well.

---

## 6. Voice demo (future / planned)

If asked about voice, be precise: **it is a planned hackathon implementation, not
a shipped feature.** You can demonstrate the *voice-ready* seam today — the
Communication Agent already emits a `voice_summary` for each recommendation — and
describe the planned Gnani.ai loop from
[Voice Chief of Staff](VOICE_CHIEF_OF_STAFF.md). Do **not** imply a live voice
assistant exists.

---

## 7. Anticipated questions (have these answers ready)

- **"Is this just a chatbot?"** No — it's a six-agent deterministic workflow;
  the model only explains the top accounts. See
  [Agent Architecture](AGENT_ARCHITECTURE.md).
- **"How do I trust the AI?"** A human approves every action and everything is
  logged. See [Governance](GOVERNANCE.md).
- **"Where's NVIDIA?"** Provider-abstracted and NVIDIA-ready today; Nemotron via
  NIM at the hackathon. See [NVIDIA Alignment](NVIDIA_ALIGNMENT.md).
- **"Is this real data?"** Synthetic or a HubSpot **test** portal — no real
  customer data. See [Security](SECURITY.md).
- **"What's actually built vs. planned?"** Point them at [Roadmap](ROADMAP.md) —
  Current / Hackathon / Future are labeled throughout.

---

## Related documentation

- [DEMO_SCRIPT.md](DEMO_SCRIPT.md) — the tighter 5-minute script + fallback
- [Product Overview](PRODUCT_OVERVIEW.md) — the narrative behind the demo
- [Quick Start](QUICK_START.md) — run it locally before you present
- [Agent Architecture](AGENT_ARCHITECTURE.md) · [Governance](GOVERNANCE.md) · [Revenue Execution](REVENUE_EXECUTION.md)

> Warm the backend, tell the governed-workflow story, and always have screenshots
> in your back pocket. The demo sells the *system*, not the network.
