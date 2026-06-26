# NVIDIA Open Hackathon — Submission Deck

**Signal-to-Action Agent · Team VentureOS**
18 slides · Dark premium theme · One message per slide · Production-ready copy

---

## How to use this file

- Each slide block specifies: **on-slide copy** (minimal, large-type), a
  **visual** direction, and **speaker notes** (what you say, ~20–40s).
- Theme: near-black background (`#0A0B0F`), high-contrast white headline,
  amber accent (`#F5B301`) for the active idea, teal (`#2DD4BF`) for
  affirmative governance states, red (`#F87171`) for risk. Generous negative
  space. One idea per slide.
- Real product screenshots live in `screenshots/` and are embedded inline; the full shot list and captions are in `08_SCREENSHOT_GUIDE.md`.
- Target length: 16–18 min presented, or self-guided.

---

## Slide 1 — Title

**On-slide:**
> # Signal-to-Action Agent
> ### The AI-native Enterprise Revenue Operating System
> Signals → Governed Decisions → Human Approval → Revenue Execution → Outcomes
>
> Team VentureOS · NVIDIA Open Hackathon

**Visual:** Full-bleed dark hero. The signal→outcome loop as a thin glowing
amber ribbon arcing across the lower third. Product wordmark top-left.
Live URL in small type at the base.

**Speaker notes:** "Revenue teams don't have a data problem. They have a
decision-to-action problem. We built the operating system that solves it —
governed, explainable, and human-controlled from signal all the way to
business outcome. This is Signal-to-Action Agent."

---

## Slide 2 — Problem

**On-slide:**
> ## A seller owns 200 accounts.
> ## Overnight, 1,000 signals changed.
> ## None of them say what to *do*.

**Visual:** A dense grid of faint account tiles; a few flare red/amber. The
overwhelming majority are grey noise. No chart — the wall of noise *is* the
message.

**Speaker notes:** "Every Monday, a seller or CSM faces a portfolio where
spend moved, usage dipped, support spiked, renewals advanced, champions left.
Human working memory cannot rank 200 accounts across a dozen signals. So
prioritization collapses to intuition — the loudest customer, the biggest
logo. Across a team, that's millions in pipeline leaking every quarter."

---

## Slide 3 — Why current CRMs fail

**On-slide:**
> ## CRMs record. Dashboards describe.
> ## Neither decides.
>
> A red health score tells you *what*. Never *why*, *what to do*, or *how
> sure*.

**Visual:** Split panel. Left: a generic CRM/dashboard mock greyed-out with a
lone red "health: 32" cell. Right: a question mark dissolving into four
unanswered questions: *Why? What action? What evidence? How confident?*

**Speaker notes:** "The CRM is a system of record. The BI dashboard is a read
surface. Both push the synthesis cost back onto the human — the exact cost the
human can't pay at portfolio scale. They answer 'what is true,' never 'what
should I do and why.'"

---

## Slide 4 — Why copilots and rec-engines fail too

**On-slide:**
> ## Copilots hallucinate. Rec-engines stop at a list.
>
> No governance. No evidence. No approval. No execution. No learning.

**Visual:** Two columns. Copilot column: a chat bubble confidently stating a
fabricated number, stamped with a red "unverifiable." Rec-engine column: a
ranked list that dead-ends into a void (no approve, no execute, no outcome).

**Speaker notes:** "Generic copilots are fluent and ungoverned — they'll
invent an account with total confidence. Pure recommendation engines produce a
ranked list and stop: no cited evidence, no human gate, no execution, no
feedback loop. Each owns a slice. None owns the loop."

---

## Slide 5 — Our vision

**On-slide:**
> ## Not an assistant. Not a dashboard.
> # An Enterprise Revenue Operating System.
>
> Governed · Explainable · Human-approved · Closed-loop
> 
> ↳ and becoming a **voice-native AI Chief of Staff** you simply talk to

**Visual:** The full loop rendered as a clean circular OS diagram:
Signals → Reasoning → Prioritization → Governed Decision → Human Approval →
Revenue Execution → Outcomes → Decision Ledger → Learning → (back to Signals).
Amber active node travels the ring.

**Speaker notes:** "We reframed the category. Not a smarter chatbot — an
operating system that sits above the CRM and around the seller. It runs the
entire governed loop: signal, reasoning, governed decision, human approval,
execution, outcome, and learning. The human is always in control. And it is evolving into a voice-native AI Chief of Staff — the same governed OS, accessed by natural conversation."

---

## Slide 6 — Architecture

**On-slide:**
> ## One governed core. Four separated layers.
>
> Voice (Gnani.ai, planned) · Reasoning (NVIDIA-ready) · Governance · Execution

![Signal-to-Action Agent — four-layer voice-native architecture: Voice (Gnani.ai) over Reasoning (NVIDIA-ready) over Governance over Execution](screenshots/SHOT-12_architecture_voice.png)

**Visual:** Four horizontal bands (rendered above).
1) **Decision Engine** (teal, "owns priority/score/confidence — reproducible").
2) **Reasoning Layer** (amber, "BYOK · OpenAI / Anthropic / NVIDIA · advisory
only").
3) **Governance Layer** (white, "approval gate · Decision Ledger · evaluation").
A bright firewall line between layer 2 and the priority fields, labeled "LLM
cannot write here."

**Speaker notes:** "The architecture is the innovation. Priority, score, and
confidence are computed by a deterministic engine — same data, same ranking,
every time. The language model is advisory: it explains and drafts, but it has
no write path to the ranking. And a human gates every action. Determinism,
explainability, accountability — designed in, not bolted on. And above all of it sits a planned voice layer — Gnani.ai speech — so a seller can simply talk to this governed core."

---

## Slide 7 — Multi-agent workflow

**On-slide:**
> ## Nine typed agents. One controlled orchestration.
>
> Not a chat loop — a contract-driven workflow.
> 
> *Planned (hackathon):* a spoken question enters the same typed pipeline via Gnani.ai speech.

**Visual:** Vertical agent pipeline with typed hand-off arrows:
Signal Ingestion → Account Health → Opportunity → Governance →
Recommendation → Communication → Execution → Outcome → Decision Ledger.
Each node shows a small "typed contract" chip.

**Speaker notes:** "Under the hood, nine specialized agents each have a typed
Pydantic input/output contract. Signal ingestion normalizes the noise. Health
and Opportunity agents detect risk and growth. Governance checks evidence and
enforces approval. Recommendation ranks. Communication drafts. Execution
orchestrates. Outcome closes the loop. Every hand-off is typed; every step is
recorded."

---

## Slide 8 — Executive Command Center

**On-slide:**
> ## What changed overnight. Why it matters. What to do.
>
> The leadership altitude.

![Executive Command Center — AI Chief of Staff header, Executive Attention Brief, Daily Briefing and Executive Snapshot rail (live HubSpot data, 99 accounts)](screenshots/mode_executive_hero.png)

**Visual:** Executive mode: Command Center with Executive
Attention Brief, Portfolio Pulse bar, and the AI Chief of Staff headline.
Dark UI, amber priority accents.

**Speaker notes:** "This is the executive view. The Daily Brief states what
changed overnight, why it matters, and the sequenced actions for today. The
Portfolio Pulse shows exposure and movement. One screen, the whole book,
ranked and explained — before the day fills up."

---

## Slide 9 — Portfolio Intelligence

**On-slide:**
> ## The portfolio is alive.
>
> Signals drift. Agents react. Recommendations evolve. Everything is
> explained.

![Portfolio intelligence — Executive Daily Briefing, Portfolio Pulse, Executive Change Brief (risk increases / opportunity moves / queue movement) and Recommendation Evolution](screenshots/mode_executive_full.png)

**Visual:** Portfolio Pulse + Change Brief + Recommendation
Evolution callout ("Previous: Follow-up call → Current: Executive escalation ·
Reason: support risk crossed threshold").

**Speaker notes:** "The system is continuous, not a one-shot report. Signal
drift is detected every cycle. When a support queue spikes or spend drops, the
agents react and the recommendation evolves — and crucially, we show *why* it
changed, in business language, with the agents that engaged."

---

## Slide 10 — Decision Workspace

**On-slide:**
> ## Where the seller actually works.
>
> One account. One action. Full evidence. One click to approve.

![Account Workspace — Evidence Stack (7 signals) with Signal / Source / Confidence / Impact per row, overall confidence 91%, plus Account Intelligence, Timeline and Reasoning tabs](screenshots/workspace_evidence.png)

**Visual:** Account Workspace: Action Hero, Evidence
pills, Conversation Prep / Email Draft / CRM Update tabs, Lifecycle ribbon
(Detected → Recommended → Prepared → Approved → Executed → Outcome).

**Speaker notes:** "Switch to seller mode and the noise disappears. One account
in focus: the recommended action, the cited evidence, a ready call script and
email, a draft CRM note. The lifecycle ribbon shows exactly where this decision
stands. The seller's job becomes review, refine, approve."

---

## Slide 11 — Revenue Execution Center

**On-slide:**
> ## Recommendation isn't the finish line.
> ## Execution is.
>
> Approve → Execute → Customer Response → Outcome → Ledger

![Governed execution — lifecycle ribbon Detected → Recommended → Prepared → Submitted → Approved → Executed → Outcome Captured, with the human approval gate, CRM Writeback Readiness (advisory) and business-outcome capture](screenshots/execution_full.png)

**Visual:** Revenue Execution Center: execution status progression
(Ready → Executing → Waiting for Customer → Completed → Outcome Captured),
actor stream (Execution Agent / Customer Response / Outcome Agent), and a
business-outcome banner ("Renewal commitment captured, proposal sent").

**Speaker notes:** "This is what closes the loop and what every rec-engine
lacks. After approval, the Revenue Execution Center orchestrates the action as
an event-driven flow — Execution Agent prepares outreach, the customer
responds, the Outcome Agent captures a *business* result, not just 'task done.'
Every stage writes to the ledger. The system feels operational, not analytical."

---

## Slide 12 — Governance & the Decision Ledger

**On-slide:**
> ## Every decision. Every piece of evidence. Every approval.
> ## Recorded.
>
> AI explains. Humans decide. The ledger proves it.

![Governance & approval drawer — recommendation + confidence (91%) + risk + evidence summary, business impact, governance caveat "Human approval required", Approve / Reject / Request review, CRM Writeback Readiness (advisory), outcome capture and approval history](screenshots/approval_drawer.png)

**Visual:** Operations mode Trust & Governance: Decision Ledger
table, "How AI is helping / not helping" panel, CRM Writeback Readiness,
confidence + caveats. Teal "approved" and "evidence-backed" states.

**Speaker notes:** "Governance is the product. The LLM cannot touch priority,
confidence, approval, or CRM writeback — enforced in code and visible in the
UI. A human gates every customer-facing action. And the Decision Ledger
captures every agent step, every evidence item, every approval and outcome — an
immutable, replayable audit trail. This is what makes it deployable in a
regulated enterprise."

---

## Slide 13 — Business Value

**On-slide:**
> ## Every feature maps to revenue.
>
> 150 accounts triaged in minutes · churn caught early · expansion surfaced ·
> faster execution · full audit

**Visual:** Two-column value table (capability → outcome), amber left rail.
Bottom strip: "Near-zero marginal cost on the deterministic baseline."

**Speaker notes:** "This isn't technology for its own sake. A seller prioritizes
150 accounts in minutes. The AI explains why each matters. Risk is caught while
it's still reversible. Expansion is surfaced instead of missed. Execution is
faster. And every decision is auditable. From a CIO's seat: measurable impact,
governed risk, near-zero marginal inference cost."

---

## Slide 14 — NVIDIA Alignment

**On-slide:**
> ## Sovereign by design. NVIDIA-ready by configuration.
> 
> Four separated layers: **Voice** (Gnani.ai) · **Reasoning** (NVIDIA NIM / Nemotron) · **Governance** · **Execution**
>
> Current: provider-abstracted · Near-term: NIM + Nemotron · Future: NeMo +
> Triton

**Visual:** Three-tier ladder — Current / Near-term / Future — mapped to the
`ModelAdapter` contract at the base. NVIDIA NIM, Nemotron, NeMo Agent Toolkit,
Triton as ascending rungs. Honest labels ("wired stub" vs "planned").

**Speaker notes:** "All reasoning flows through one adapter contract, selected
by configuration. Today the live demo runs the deterministic engine with BYOK
reasoning — and our NVIDIA Nemotron adapter is already wired. Near-term: NIM
endpoints for self-hosted, data-resident Nemotron inference. Future: NeMo Agent
Toolkit for the agent graph, Triton for overnight batch planning. Pointing this
at NVIDIA is a config change, not a rewrite. We're honest about current versus
roadmap."

---

## Slide 15 — Product Differentiators

**On-slide:**
> ## Not another CRM. Not another copilot. Not another dashboard.
>
> Governed · Explainable · Human-approved · Closed-loop · **Deterministic + conversational** · **Governed voice** · **Speech-native revenue ops**

**Visual:** Comparison matrix — rows: Evidence, Determinism, Human gate,
Execution, Learning loop, Audit. Columns: Dashboard / Copilot / Rec-engine /
**Signal-to-Action Agent**. Only our column is fully checked (teal).

**Speaker notes:** "Side by side: dashboards lack action, copilots lack
governance, rec-engines lack execution and learning. Only an operating system
that owns the whole governed loop checks every box. That's the category we
created and the moat we hold."

---

## Slide 16 — The Voice Chief of Staff (planned hackathon build)

**On-slide:**
> ## The OS becomes a conversation.
> # Voice Chief of Staff — powered by Gnani.ai
>
> Morning brief · portfolio review · deal coaching · meeting prep · governed
> actions

**Visual:** A calm executive-assistant motif over the OS ring from Slide 5 —
the Chief of Staff orchestrating the platform, not replacing it. Voice-first
and digital-avatar motifs sit on the horizon — voice as the hackathon build, the digital avatar as the future.

**Speaker notes:** "Our hackathon build makes the operating system conversational — a governed,
conversational AI Chief of Staff. It briefs you each morning, reviews your book
in natural language, coaches deals, prepares meetings — and orchestrates the
governed platform beneath it. We build this during the hackathon with Gnani.ai speech. Beyond that, a digital-human
roadmap. The Chief of Staff conducts the orchestra; it never removes the
governance that makes the music trustworthy."

---

## Slide 17 — Roadmap

**On-slide:**
> ## Shipped today. Sequenced ahead.
>
> **Current:** governed OS + Revenue Execution · **Hackathon:** Voice Chief of Staff (Gnani.ai) + NVIDIA NIM · **Future:** digital avatar + multimodal
> workspace — and every tier preserves the same governance invariant.

**Visual:** Horizontal timeline with four milestones; "Now" anchored on a
live-deployment badge (Vercel + Render + GitHub), each future milestone tagged
with the governance invariant it preserves.

**Speaker notes:** "We're not pitching a concept. The governed OS, the Decision
Ledger, and the Revenue Execution Center are live today. Next is NVIDIA NIM and
the Voice Chief of Staff powered by Gnani.ai, plus NVIDIA NIM. Then digital avatar and
digital human. Every step preserves one invariant: AI explains and recommends;
humans decide and remain accountable."

---

## Slide 18 — Closing

**On-slide:**
> # Signal → Action → Outcome.
> ## Governed every step of the way.
>
> Live: ventureos-signal-to-action-agent.vercel.app
> Team VentureOS · NVIDIA Open Hackathon

**Visual:** Return to the Slide-1 hero loop, now fully lit all the way around
the ring (loop closed). Live URL and repo prominent. Quiet, confident.

**Speaker notes:** "Enterprises don't need AI that talks. They need AI that
acts — under governance, with the human in control, measured by outcomes. We
turned fragmented signals into a closed, governed revenue loop, and we shipped
it. Signal-to-Action Agent. Thank you."

---

## Appendix slides (optional, keep in back pocket)

- **A1 — Decision Impact Studio (Phase 16B, in review):** demonstrated live (not screenshotted). "Projected impact" what-if:
  spend −25% / support +3 / renewal 57→21 ripples through agents and the
  execution plan, logged to the ledger, zero CRM writeback.
- **A2 — BYOK security posture:** keys in `sessionStorage` only; never
  persisted, logged, returned, or deployed; deterministic fallback always on.
- **A3 — Evaluation harness:** schema validity, evidence presence, confidence
  range, caveats, default-pending approval, latency budget.
- **A4 — Developer Diagnostics (internal):** Ctrl/Cmd+D panel showing
  environment, active API endpoint, backend health, provider, data source — no
  secrets. (Internal only; hidden in production.)

---

## Design + delivery checklist

- [x] Real product screenshots embedded (slides 6, 8–12) per
  `08_SCREENSHOT_GUIDE.md`; architecture visual on slide 6.
- [ ] Apply the dark theme tokens consistently (bg `#0A0B0F`, accent `#F5B301`,
  affirm `#2DD4BF`, risk `#F87171`).
- [ ] One message per slide — resist adding bullets.
- [ ] Keep body type large (min 24pt); headlines 40–60pt.
- [ ] Rehearse to the 10-minute script in `04_DEMO_SCRIPT.md` for the live
  walkthrough portion.
