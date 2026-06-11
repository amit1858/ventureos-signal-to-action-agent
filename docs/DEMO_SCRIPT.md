# Demo Script — Signal-to-Action Agent

A polished **5-minute** demo for a hackathon judge, executive, or reviewer. The goal is that within
three minutes the audience can explain the product to someone else.

**Total time:** ~5 minutes · **Setup:** backend running, frontend open, HubSpot test CRM synced
(or synthetic mode as fallback).

---

## Opening (20 seconds)

> "Every CRM tells you what **happened**.
> Signal-to-Action tells you what to **do next**."

> "This is not a chatbot. It's a governed system that watches your customer portfolio, tells you what
> changed overnight, explains why it matters, recommends what to do, and only updates the CRM after a
> human approves."

---

## The walkthrough

### 1. Landing page — "What is this?" (30s)
- Open the landing page.
- One line: *continuously monitors your portfolio, detects risk and opportunity, recommends governed
  actions, writes approved actions back to CRM.*
- Contrast: **Traditional CRM stores data → Signal-to-Action understands it, reasons over it,
  recommends action, waits for approval, writes back.**
- Click **Enter Command Center**.

### 2. Morning Brief — "What happened?" (45s)
- Read the Executive Morning Brief: *"While you were away, I reviewed your portfolio overnight."*
- **40 accounts analyzed · 7 need attention · ₹45L at risk · ₹26L growth opportunity.**
- Point out: this is plain-English, executive language — not a wall of metrics.

### 3. Portfolio Health — "Should I worry?" (30s)
- Show readiness (e.g. **83/100**, Healthy), revenue at risk, expansion potential.
- 33 of 40 accounts healthy; 7 need attention now.

### 4. Today's Priorities — "What should I do?" (30s)
- Show the ranked shortlist of accounts that deserve attention today.
- Each entry says **why it matters** and the **recommended next move**.

### 5. Risk vs Opportunity map — "Where should I focus?" (30s)
- Open the Portfolio Map. Every account placed by risk and expansion potential.
- Four quadrants: **Act Now · Escalate · Nurture · Monitor.**
- This is the "where to spend my day" view.

### 6. Select Curefoods — "Why this account?" (45s)
- Click the top-priority account (**Curefoods**).
- Recommended action: **Recover At-Risk Customer**.
- Walk the reasoning:
  - **Why this account** — declining spend / rising support risk / renewal window.
  - **Why now** — renewal/contact timing.
  - **Business impact** — revenue at stake.
  - **If ignored** — likely churn.
  - **Confidence** — ~91%, backed by evidence chips.

### 7. Governed pipeline — "Can I trust this?" (30s)
- Show the Governed Pipeline: HubSpot → Signal Detection → AI Analysis → Evidence → Human Approval →
  Decision Ledger → CRM Writeback.
- Emphasize: **nothing touches the CRM without human approval; every step is logged.**

### 8. Approve — "I decide" (20s)
- Click **Approve** on the recommendation. It moves from `pending` to approved.

### 9. CRM Writeback — "What happens next?" (30s)
- Click **Create HubSpot task** (or note).
- Show the result: external id, timestamp, payload preview, safety note.

### 10. Verify in HubSpot (20s)
- Switch to HubSpot, open the company, show the new task/note on Curefoods.
- "The loop is closed — and a human approved every step."

---

## Closing (15 seconds)

> "This is not a chatbot. It is a governed **signal-to-action** system for revenue teams.
> The deterministic engine decides; AI explains; a human approves; the CRM is updated.
> That's how you get enterprise AI you can actually trust."

---

## Backup plan (always have one)

| If this fails… | Do this |
|----------------|---------|
| **HubSpot unavailable** | Switch to **synthetic mode** (CRM card → *Use synthetic*). The entire story still works offline. |
| **LLM / model provider unavailable** | The product already runs on the **mock adapter**; rankings and actions are **deterministic** and never depend on an LLM, so the demo is unaffected. |
| **Internet unavailable** | Fall back to a **recorded demo / screenshots** of the same flow. |

**Pre-demo checklist:**
- [ ] Backend health returns `ok` (`/api/health`).
- [ ] Frontend loads (landing page renders).
- [ ] HubSpot synced **or** synthetic mode confirmed working.
- [ ] One known account (Curefoods) selected and reviewed once before going live.
- [ ] Recorded demo ready as a last resort.

---

## One-sentence takeaway for the audience

> "It's an AI operating layer that watches my customer portfolio, tells me what changed overnight,
> explains why it matters, recommends what I should do, and only updates CRM after I approve."
