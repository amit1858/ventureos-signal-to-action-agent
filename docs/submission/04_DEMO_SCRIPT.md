# Demo Script — Signal-to-Action Agent

Three timed, story-driven versions: **5 / 10 / 15 minutes**. The demo tells one
continuous story — a seller's morning — not a feature tour. Every version
follows the same spine; longer versions add depth, not detours.

**Live:** https://ventureos-signal-to-action-agent.vercel.app
**Backend:** https://signal-to-action-api.onrender.com (Render free tier — first
request after idle can take ~50s to wake; warm it before presenting).

**Pre-flight (do before you present):**
1. Open the live URL; click once to wake the backend; wait for Portfolio Pulse
   to populate.
2. Set experience mode to **Executive**.
3. Have a BYOK key pasted in if you want to show live LLM enrichment (optional —
   every path works on the deterministic baseline).
4. Pick your hero account (the demo uses **Curefoods #1**).

---

## The story spine (all versions)

```
Morning → Attention Brief → Why (Portfolio Pulse) → Open the account
        → Evidence → Approve → Revenue Execution → Outcome → Ledger
        → (Governance proof) → (Roadmap: Chief of Staff)
```

The emotional arc: overload → clarity → trust → action → outcome → "this is an
operating system, not a chatbot."

---

# 5-MINUTE VERSION (executive / judging round)

> Goal: prove the closed governed loop and the category. Move fast, stay in the
> story.

### 0:00–0:30 · The overload
**Do:** Land on the Executive Command Center.
**Say:** "This is a seller's Monday. They own 150 accounts. Overnight a
thousand signals changed — none of them say what to *do*. Watch how this turns
noise into a governed decision."

### 0:30–1:30 · Attention Brief + why
**Do:** Read the Executive Attention Brief headline; point to Portfolio Pulse
(exposure, movement). Point to the AI Chief of Staff one-liner ("Start with
Curefoods").
**Say:** "The brief tells me what changed overnight, why it matters, and what to
do first — in business language. Portfolio Pulse quantifies exposure and
movement. One screen, the whole book, ranked and explained."

### 1:30–2:45 · Open the account, show evidence
**Do:** Click Curefoods. Switch to the Account Workspace. Show the Action Hero,
the Evidence pills, and the Recommendation Evolution callout ("Previous:
follow-up → Current: executive escalation · support risk crossed threshold").
**Say:** "One account in focus. Here's the recommended action, and crucially the
*cited evidence* behind it — declining spend, a support spike, a tightening
renewal. The recommendation evolved this week, and we show exactly why."

### 2:45–3:45 · Approve → execute → outcome
**Do:** Click Approve in the Approval Drawer. Open the **Revenue Execution
Center**. Let auto-advance run: Execution Agent → Customer Response → Outcome.
Land on the business-outcome banner ("Renewal commitment captured, proposal
sent").
**Say:** "Nothing executes without a human — I approve. Now the Revenue
Execution Center orchestrates the action: it prepares outreach, the customer
responds, and it captures a *business* outcome, not just 'task done.' This is the
loop every recommendation engine leaves open."

### 3:45–4:30 · Governance proof
**Do:** Briefly open Trust & Governance / Decision Ledger. Point to the ledger
row just created and the "How AI is helping / not helping" panel.
**Say:** "Every step I just took is in the Decision Ledger — agent, evidence,
approval, outcome. And the AI is bounded: it explains and drafts, but it never
sets priority, never approves, never writes to CRM. Governance is enforced in
code."

### 4:30–5:00 · The close
**Say:** "Dashboards describe. Copilots hallucinate. Rec-engines stop at a list.
This is the only approach that owns the whole governed loop — signal to outcome
to learning — and it's live today. It's provider-abstracted and NVIDIA-ready by
configuration. That's Signal-to-Action Agent."

---

# 10-MINUTE VERSION (standard demo)

> Adds: a re-run of the agent workflow, portfolio "living system" depth, the
> seller artifacts (script/email/CRM note), and the NVIDIA story.

### 0:00–0:45 · The overload (set the stakes)
As 5-min, but linger on the problem: "Human working memory can't rank 150
accounts across a dozen signals. So teams prioritize by intuition — and leak
millions in pipeline. We fix the synthesis problem with governance intact."

### 0:45–2:00 · Run the governed workflow
**Do:** Click Re-run. Narrate the Live Workflow Rail lighting up the agents:
Signal Ingestion → Account Health → Opportunity → Governance → Recommendation →
Communication.
**Say:** "This isn't one chat completion. Nine typed agents run as a controlled
orchestration. Each has a Pydantic input/output contract. Signal ingestion
normalizes the noise; health and opportunity agents detect risk and growth;
governance checks evidence and enforces approval; recommendation ranks;
communication drafts. Every hand-off is typed; every step is logged."

### 2:00–3:30 · Executive altitude
**Do:** Walk Executive Attention Brief → Portfolio Pulse → Executive Change
Brief. Show one "what changed in connected systems" line ("Acme's monthly spend
dropped 25% in HubSpot since last sync · recommendation revised → executive
escalation").
**Say:** "The portfolio is alive. Signals drift every cycle, agents react,
recommendations evolve — and we always explain the change in business language."

### 3:30–5:30 · The Decision Workspace (seller altitude)
**Do:** Switch to Seller mode. Open Curefoods. Tour the tabs: **Overview →
Conversation Prep → Email Draft → CRM Update → Evidence → Timeline.** Show the
Lifecycle ribbon.
**Say:** "Seller mode strips the noise to one account. Here's a ready call
script, a drafted email, a CRM note — all advisory, all editable. The Evidence
tab cites every signal. The Timeline shows every agent action and approval in
order. The seller's job is review, refine, approve."

### 5:30–7:00 · Approve → Revenue Execution → Outcome
**Do:** Approve. Open the Revenue Execution Center. Show the status progression
(Ready → Executing → Waiting for Customer → Completed → Outcome Captured) and
the Manual/Auto toggle. Land on the business outcome.
**Say:** "Approve, and the Execution Center takes over as an orchestrated,
event-driven flow — Execution Agent, customer response, outcome capture. I can
let it auto-advance or step manually. It closes with a business outcome, and
every stage appends to the ledger. No CRM writeback in demo mode — this is
governed orchestration."

### 7:00–8:30 · Governance + the ledger
**Do:** Operations mode → Trust & Governance. Show Decision Ledger table,
confidence + caveats, CRM Writeback Readiness, "How AI is helping / not
helping."
**Say:** "This is what makes it enterprise-deployable. An immutable audit trail
of every decision. The AI boundary is explicit and enforced. A human gates
every customer-facing action. This passes a Responsible-AI review."

### 8:30–9:30 · NVIDIA + provider story
**Do:** Show the provider/BYOK panel. Note the model label (mock-deterministic)
and that NVIDIA Nemotron is selectable.
**Say:** "All reasoning flows through one adapter contract. The NVIDIA Nemotron
adapter is wired today. Near-term we point it at NIM endpoints for self-hosted,
data-resident Nemotron inference; future, NeMo Agent Toolkit for the agent graph
and Triton for overnight batch planning. Sovereign by design, NVIDIA-ready by
configuration."

### 9:30–10:00 · Close
**Say:** "Signal to action to outcome — governed every step, live today,
NVIDIA-ready. The operating system for enterprise revenue."

---

# 15-MINUTE VERSION (deep-dive / technical panel)

> Adds: Decision Impact Studio, the determinism/architecture deep-dive, the
> evaluation harness, BYOK security posture, and the full roadmap to Chief of
> Staff + voice/avatar.

Use the 10-minute spine, then insert these segments where noted.

### Insert after "Run the governed workflow" (≈2:00) — Architecture deep-dive (+1:30)
**Say:** "Let me show you why this is governable. Priority, score, and
confidence are computed by a deterministic engine — pure functions over the
data. The language model is on a separate layer with *no write path* to those
fields. That separation is the whole game: same data, same ranking, every run;
the LLM only ever explains and drafts. Determinism, explainability, and
accountability are architectural, not policy."

### Insert after the Decision Workspace (≈5:30) — Decision Impact Studio (+2:00)
**Do:** Open the **Decision Impact Studio** in the workspace. Apply a scenario:
"Monthly spend drops 25%." Show Before → Change Applied → After (priority +40%,
confidence −30%), the agent reactions ("Account Health Agent detected spend
deterioration; Governance Agent flagged revenue-at-risk"), and the execution-plan
impact. Point out the "Projected impact only — no CRM writeback" caveat and the
ledger entry it created.
**Say:** "This answers 'what if the account condition changes?' We project how a
business change ripples through signals, agent reasoning, the recommendation, and
the execution plan — clearly labeled projected impact, logged to the ledger, with
zero CRM writeback. It reuses the same intelligence; there's no parallel model."

### Insert after Governance (≈8:30) — Evaluation + BYOK security (+1:30)
**Say:** "Two things engineers ask about. First, evaluation: a harness validates
every recommendation for schema compliance, evidence presence, confidence range,
governance caveats, default-pending approval, and a latency budget. Second,
secrets: there are *no* LLM keys on our server. Users bring their own key in the
browser; it lives only in sessionStorage, is never persisted, logged, returned by
any API, or deployed. The deterministic engine is always the fallback."

### Extend the close (≈13:30–15:00) — Full roadmap (+1:30)
**Say:** "Where this goes: the operating system becomes a governed,
conversational AI Chief of Staff — your morning briefing, portfolio review, deal
coaching, meeting prep, all in natural language, all governed. The next step —
our planned hackathon implementation — is voice: a Voice Chief of Staff powered
by Gnani.ai, where the seller speaks and hears a governed answer, with Indian-
language support and English-plus-regional code-switching. Beyond that, a digital
executive avatar for hands-free, enterprise-safe interaction. The Chief of Staff orchestrates the
platform; it never removes the governance that makes it trustworthy. Everything I
showed today is live; everything I just described is the sequenced roadmap on the
same governed core."

---

## Voice-first cold open (planned hackathon implementation — Gnani.ai)

> Use this as an alternate **opening 90 seconds** once the Voice Chief of Staff
> is built. Label it honestly on stage: *"This is our planned hackathon
> implementation."* It demonstrates the **same governed core** — voice only adds
> a spoken interaction channel; it never changes ranking, governance, or approval.

**The flow:**

1. **Launch.** Open the app. Instead of clicking, the seller speaks.
2. **Voice Chief of Staff greets + briefs.** *Seller:* "Good morning — what
   needs my attention today?" The assistant delivers the **morning portfolio
   briefing** out loud (what changed overnight, biggest risk, biggest
   opportunity, the one thing to do first).
3. **Seller asks follow-ups naturally.** *"Why is this account at risk?"* …
   *"What changed since yesterday?"* The AI **explains the change** — grounded in
   the same evidence, confidence, and governance caveats shown on screen.
4. **Open the account by voice.** *"Open that account and prepare me for the
   call."* The Account Workspace opens; the recommendation is **reviewed** with
   its evidence stack.
5. **Human approval — unchanged.** The seller still **approves** in the
   governed drawer. Voice never auto-approves or writes to CRM.
6. **Revenue Execution Center.** Execution advances (Ready → Executing → Waiting
   for Customer → Completed → Outcome Captured), narrated by the Execution Agent.
7. **Business outcome.** The loop lands on a business result — *meeting booked /
   renewal risk reduced / opportunity created* — written to the Decision Ledger.

**The architecture under it (say this):** *"Speech in and out is Gnani.ai —
enterprise-grade recognition, low-latency, Indian-language and code-switching.
The reasoning layer is provider-abstracted and NVIDIA-ready. The governance core
and execution loop are exactly what you saw — unchanged. Four clean layers:
Voice, Reasoning, Governance, Execution."*

---

## Backup paths (if something fails live)

| If… | Then… |
|---|---|
| Backend cold-starts (Render) | Keep talking through the problem/architecture slides while it wakes; refresh after ~50s. Or use Demo Mode replay. |
| HubSpot toggle off | Synthetic 150-account dataset — full feature parity, same story. |
| No BYOK key | Deterministic baseline — every path works; say "this is the no-key default." |
| Network flaky | Run locally: `uvicorn main:app` on :8000 + `next dev` on :3000. |
| Execution auto-advance stalls | Flip Manual/Auto toggle and step stages by hand. |

## Delivery tips

- **Stay in the story.** Resist clicking everything. The narrative is the
  product.
- **Say "governed" and "evidence" often.** Those words win enterprise rooms.
- **Always land each segment on an outcome**, not a feature.
- **Name the agents** when the rail lights up — it reinforces "orchestration,
  not chatbot."
- **End on "live today, NVIDIA-ready by configuration."**

## One-line elevator pitch

> "Signal-to-Action Agent turns fragmented enterprise signals into governed,
> explainable, human-approved revenue actions — then executes, measures, and
> learns in a closed loop. A sovereign, NVIDIA-ready operating system for
> enterprise revenue."
