# Screenshot Capture Guide & Product Journey

This guide selects the **strongest screenshots** and arranges them into a
coherent product journey that reinforces the narrative — not a screenshot dump.
Each shot has an ID (referenced by the deck and submission), an exact capture
recipe, a one-line caption, and its placement.

**Capture environment:**
- URL: https://ventureos-signal-to-action-agent.vercel.app
- Browser: Chrome, 1440×900 (or 1680×1050 for hero shots), device pixel ratio 2x.
- Warm the backend first (Render cold-start ~50s); wait for Portfolio Pulse to
  populate before capturing.
- Hide the Developer Diagnostics panel (it is internal — never in a submission
  shot) unless capturing `SHOT-INT` for the appendix.
- Prefer the dark theme (default). Capture full-bleed; crop browser chrome.
- Hero account for continuity: **Curefoods (#1)**.
- **Note on the captured set:** the real screenshots in `screenshots/` were taken
  against live data, where the #1 account at capture time was **Tessera DocOnline**
  (HubSpot test CRM). Account names shift with live data — the *story* (one
  account in focus → evidence → approval → execution → outcome) is identical.

---

## The product journey (capture in this order)

The journey mirrors the demo spine: overload → clarity → evidence → approval →
execution → outcome → governance → what-if → roadmap.

```
SHOT-01 Command Center ─▶ SHOT-02 Portfolio Intelligence ─▶ SHOT-03 Workspace
   ─▶ SHOT-04 Revenue Execution ─▶ SHOT-05 Governance/Ledger
   ─▶ SHOT-06 Decision Impact Studio  (+ appendix shots)
```

---

## Captured assets (already in the repo)

The journey below is **already captured** as 20 real screenshots in
`docs/submission/screenshots/` (dark theme, 1536×1000 @2x, live data). Embed
these directly — no re-capture needed for the deck. Re-capture only if you want a
specific account name on screen.

| Journey shot | Real file in `screenshots/` | Status |
|---|---|---|
| Cover / landing | `landing_cover.png` · `landing_full.png` | ✅ live (99 accts · 108 signals · 6 agents) |
| SHOT-01 Command Center (Executive) | `mode_executive_hero.png` | ✅ verified |
| SHOT-02 Portfolio Intelligence | `mode_executive_full.png` · `mode_operations_hero.png` | ✅ |
| SHOT-03 Decision Workspace (Evidence) | `workspace_evidence.png` | ✅ 7-signal evidence stack |
| SHOT-03b Email Draft | `workspace_email.png` | ✅ |
| SHOT-04 Revenue Execution | `execution_full.png` · `execution_center.png` · `execution_progress.png` | ✅ lifecycle ribbon + approval |
| SHOT-05 Governance & approval | `approval_drawer.png` | ✅ caveat + CRM advisory + outcome capture |
| SHOT-06 Decision Impact Studio | — | ⏳ demonstrated live (Phase 16B in review — not screenshotted) |
| Seller mode | `mode_seller_hero.png` · `mode_seller_full.png` | ✅ "My Book of Business" |
| Operations mode | `mode_operations_hero.png` · `mode_operations_full.png` | ✅ "System Snapshot" |
| Conversation Prep / CRM / Timeline | `workspace_conversation.png` · `workspace_crm.png` · `workspace_timeline.png` | ✅ |
| **SHOT-12 Architecture (voice layer)** | `SHOT-12_architecture_voice.png` | ✅ four-layer Voice→Reasoning→Governance→Execution |

> **SHOT-12** is a rendered architecture visual (not a UI capture): the four-layer
> stack with the **Voice Chief of Staff (Gnani.ai — planned hackathon
> implementation)** above the unchanged governed core. Use it on the deck where
> the architecture is shown (Slides 6 / 16).

---

## SHOT-01 — Executive Command Center (the hero)

- **Mode:** Executive.
- **Capture:** Land on the app in Executive mode. Frame the Executive Attention
  Brief headline + the AI Chief of Staff one-liner + the Portfolio Pulse bar in
  one viewport. Ensure a real account name (Curefoods) is visible as #1.
- **Caption:** *"One screen, the whole book — what changed overnight, why it
  matters, and what to do first."*
- **Placement:** Deck Slide 8; Submission §3 (Solution); One-pager header
  visual.
- **Why it earns its place:** Establishes "operating system, not chatbot" in the
  first glance.

## SHOT-02 — Portfolio Intelligence (the living system)

- **Mode:** Executive (scroll to Portfolio Pulse + Change Brief), or Operations
  for the fuller portfolio stack.
- **Capture:** Frame the Portfolio Pulse impact summary together with the
  Executive Change Brief and a Recommendation Evolution callout ("Previous:
  follow-up call → Current: executive escalation · support risk crossed
  threshold").
- **Caption:** *"Signals drift, agents react, recommendations evolve — every
  change explained in business language."*
- **Placement:** Deck Slide 9; Submission §4 (Architecture — living portfolio).
- **Why:** Proves continuous intelligence, not a one-shot report.

## SHOT-03 — Decision Workspace (where the seller works)

- **Mode:** Seller.
- **Capture:** Open Curefoods. Frame the Account Workspace: Action Hero
  (recommended action + confidence), Evidence pills, the tab row (Conversation
  Prep · Email Draft · CRM Update · Evidence · Timeline), and the Lifecycle
  ribbon (Detected → … → Outcome).
- **Caption:** *"One account in focus: the action, the cited evidence, a ready
  script and CRM note — one click from approval."*
- **Placement:** Deck Slide 10; Submission §3/§7; Demo script reference.
- **Why:** Shows the product does the seller's synthesis work, with evidence.
- **Optional companion `SHOT-03b`:** the Email Draft tab open, showing an
  AI-drafted, editable message with a "Generated with…" attribution chip.

## SHOT-04 — Revenue Execution Center (closing the loop)

- **Mode:** Seller (after approving Curefoods).
- **Capture:** Approve the recommendation, open the Revenue Execution Center.
  Capture the execution status progression (Ready → Executing → Waiting for
  Customer → Completed → Outcome Captured), the actor stream (Execution Agent /
  Customer Response / Outcome Agent), the Manual/Auto toggle, and the business-
  outcome banner ("Renewal commitment captured, proposal sent").
- **Caption:** *"After approval, execution is orchestrated to a business
  outcome — the loop every rec-engine leaves open."*
- **Placement:** Deck Slide 11; Submission §5 (Innovation); the money shot for
  the "closed loop" story.
- **Why:** This is the single most differentiating screen — capture it cleanly.
- **Tip:** If demonstrating auto-advance, capture mid-flow (an "Executing" or
  "Waiting for Customer" state) so the orchestration reads as live.

## SHOT-05 — Governance & Decision Ledger (the trust proof)

- **Mode:** Operations.
- **Capture:** Open Trust & Governance. Frame the Decision Ledger table (with
  the row just created by the execution above), the "How AI is helping / not
  helping" panel, confidence + caveats, and CRM Writeback Readiness.
- **Caption:** *"Every decision, every evidence item, every approval — recorded.
  AI explains; humans decide; the ledger proves it."*
- **Placement:** Deck Slide 12; Submission §8 (Governance); Reviewer checklist.
- **Why:** Converts skeptical enterprise/judge viewers — governance is visible,
  not asserted.

## SHOT-06 — Decision Impact Studio (what-if intelligence)

- **Mode:** Seller/Operations (workspace section).
- **Capture:** Open the Decision Impact Studio. Apply "Monthly spend drops 25%."
  Frame the Before → Change Applied → After comparison (priority +40%, confidence
  −30%), the agent-reaction list, the execution-plan impact, and the "Projected
  impact only — no CRM writeback" caveat.
- **Caption:** *"Project how a business change ripples through agents,
  recommendation, and execution plan — governed, ledger-logged, zero writeback."*
- **Placement:** Deck appendix A1; Submission §5 (Innovation); 15-min demo.
- **Why:** Demonstrates intelligence + restraint (clearly labeled projection).

---

## Appendix shots (back-pocket / technical reviewers)

| ID | What | Mode | Placement | Caption |
|---|---|---|---|---|
| `SHOT-WF` | Live Workflow Rail mid-run (agents lighting up in sequence) | Any, click Re-run | Deck Slide 7 companion; Demo 0:45–2:00 | "Nine typed agents, one controlled orchestration." |
| `SHOT-BYOK` | BYOK provider panel (masked key, NVIDIA Nemotron selectable, live model list) | Operations | Deck appendix A2; Submission §8 | "Your key, your session — never persisted, never deployed." |
| `SHOT-EVAL` | Evaluation board (12-dimension) / Provider Consensus | Operations | Deck appendix A3; Submission §7 | "Schema, evidence, confidence, caveats — measured." |
| `SHOT-INT` | Developer Diagnostics panel (Ctrl/Cmd+D) — environment, API endpoint, health, provider | Any (internal) | Submission §11 (internal note only) | "Internal diagnostics — hidden in production, no secrets." |
| `SHOT-TL` | Account Timeline (chronological signals + agent actions + approvals) | Seller | Deck Slide 10 companion | "Every signal, action, and approval, in order." |

> **Note on `SHOT-INT`:** The Developer Diagnostics panel is an internal tool.
> Use it in the submission only to evidence operational maturity, and confirm it
> exposes **no secrets**. Never include it in customer-facing or marketing
> visuals.

---

## Arrangement principles (so it's a journey, not a dump)

1. **One narrative beat per shot.** If a screenshot needs two captions, split or
   crop it.
2. **Maintain account continuity.** Use Curefoods across SHOT-01 → SHOT-06 so the
   viewer follows one story.
3. **Show state progression.** The Lifecycle ribbon should visibly advance from
   SHOT-03 (Recommended/Prepared) → SHOT-04 (Executed) → SHOT-05 (Outcome in
   ledger).
4. **Lead with clarity, close with trust.** Open on the Command Center (clarity),
   end the core sequence on Governance (trust).
5. **Crop ruthlessly.** Remove browser chrome, dev panels, and empty space.
   Capture at 2x for slide sharpness.
6. **Caption in business language**, never feature language ("what to do first,"
   not "Daily Briefing component v3").

---

## Capture checklist

- [ ] Backend warmed; Portfolio Pulse populated.
- [ ] Developer Diagnostics hidden (except `SHOT-INT`).
- [ ] Curefoods used as the hero account throughout.
- [ ] SHOT-01 … SHOT-06 captured in journey order at 2x.
- [ ] Lifecycle state visibly progresses across SHOT-03 → 05.
- [ ] No secrets, no real customer data, no employer-internal systems visible.
- [x] Files captured to `docs/submission/screenshots/` (20 PNGs, listed above).
- [x] Architecture visual `SHOT-12_architecture_voice.png` rendered (voice layer).
- [ ] Each journey shot embedded in the deck/submission from `screenshots/`.
