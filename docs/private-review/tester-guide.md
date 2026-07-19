# VentureOS — Integrated Walkthrough Tester Guide (Private Review)

> **Private review artifact.** This guide is for internal walkthrough testers only.
> It is **not** published to the README, GitHub Pages, the microsite, Gamma, or the
> NVIDIA deck. It contains **no** secrets, API keys, tokens, or bypass credentials.

## 1. What you are reviewing

A single integrated Preview that combines the governed Curefoods renewal journey
(Production experience) with three connected surfaces:

| Surface | Route | Public status | What it proves |
| --- | --- | --- | --- |
| Signal-to-Action Agent | `/` | Production | Landing → Command Center |
| Today's Mission | `/?view=mission` | Production | Canonical Curefoods mission |
| Mission Control | `/mission-control` | Production | Governed run + approval + simulated execution |
| Manager Coaching | `/manager` | Guided Demo | Read-only "where do I intervene?" |
| Guardrails Lab | `/guardrails` | Guardrails Lab | What the AI cannot do |
| Product Walkthrough | `/walkthrough` | Product Walkthrough | The whole story, in order |

**One truth:** every surface refers to the same account (Curefoods), the same
mission (renewal protection), the same recommendation, and the same audit
reference. Nothing you do sends email, changes a CRM, or writes risk — execution
is simulated and honestly labelled.

## 2. Before you start

- **Preview URL:** `<PREVIEW_URL — provided separately by the release owner>`
- **Access:** the Preview is protected by team SSO. Sign in with your team
  account in the browser when prompted. Do **not** request or use any bypass token.
- **Browser:** latest Chrome or Edge, desktop.
- **Window width:** maximize to at least **1440px** wide for screenshots.
- **Duration:** about **15–20 minutes**.
- **Zoom:** 100%.

## 3. Screenshot capture

Capture a full-window screenshot at each numbered step. Use this exact naming
convention so shots collate cleanly (replace `<tester>` with your first name, lower-case):

```
01_landing_<tester>.png
02_explore_entry_<tester>.png
03_walkthrough_overview_<tester>.png
04_todays_mission_<tester>.png
05_mission_continuity_<tester>.png
06_verified_evidence_<tester>.png
07_nvidia_grounded_<tester>.png
08_approval_gate_<tester>.png
09_simulated_execution_<tester>.png
10_governed_outcome_<tester>.png
11_manager_coaching_<tester>.png
12_guardrails_overview_<tester>.png
13_guardrails_injection_blocked_<tester>.png
14_guardrails_redaction_<tester>.png
15_guardrails_live_nvidia_<tester>.png
16_guardrails_forced_fallback_<tester>.png
17_audit_projection_<tester>.png
18_executive_operations_<tester>.png
19_roadmap_<tester>.png
20_final_feedback_<tester>.png
```

## 4. Walkthrough flow (19 steps)

1. **Landing** (`/`) — confirm the hero, the "Enter Command Center" primary CTA,
   and a **secondary** "Explore VentureOS" link. → `01`
2. **Explore VentureOS** — click it; confirm it opens the Product Walkthrough. → `02`
3. **Walkthrough overview** (`/walkthrough`) — confirm 13 stages, an intro, and an
   "Honest limitations" section at the bottom. → `03`
4. **Today's Mission** (open from stage 2, or `/?view=mission`) — confirm Curefoods
   is the canonical mission and is labelled a **deterministic governed demo
   mission** (not live CRM truth). → `04`
5. **Mission continuity** (`/mission-control`) — confirm the **same** account,
   mission, and recommendation continue; a continuity cue is visible; nothing is
   re-selected. → `05`
6. **Verified evidence** — confirm evidence references and a 3-of-3 verification. → `06`
7. **NVIDIA grounded** — run the mission; confirm the live NVIDIA path
   (`provider=nim`, the Nemotron model, `grounded=true`, `fallbackUsed=false`) OR
   a truthful deterministic fallback if NIM is slow/unavailable. → `07`
8. **Approval gate** — confirm approval is **mandatory** with an explicit two-step
   binding; the AI cannot approve its own action. → `08`
9. **Simulated execution** — approve; confirm email is **drafted not sent**, CRM
   task **proposed not created**, risk update **proposed not written**. → `09`
10. **Governed outcome** — confirm "Governed work prepared successfully" (system)
    vs "Awaiting external response" (business); no claimed renewal/revenue. → `10`
11. **Manager Coaching** (`/manager`) — confirm the **Guided Demo** label, same
    mission continuity, one 15-minute coaching intervention, read-only (no
    notification, no CRM change). → `11`
12. **Guardrails overview** (`/guardrails`) — confirm the **Guardrails Lab** label
    and the curated scenarios. → `12`
13. **Prompt injection** — run the injection scenario; confirm **blocked** and the
    named deterministic rail. → `13`
14. **Sensitive data** — run the sensitive-data scenario; confirm **redacted**. → `14`
15. **Live NVIDIA classification** — confirm `available=true`, a boolean result, a
    raw score (not presented as probability/confidence), `fallbackUsed=false`. → `15`
16. **Forced fallback** — toggle forced fallback; confirm `available=false`,
    `fallbackUsed=true`, and the deterministic decision is preserved. → `16`
17. **Audit projection** — confirm the read-only audit projection shows
    "Referenced recommendation" and the full canonical "Referenced audit ref";
    mission unchanged, ledger not mutated. → `17`
18. **Executive / Operations** — confirm both personas read the **same** mission
    (no second source of truth). → `18`
19. **Roadmap** — confirm Voice is **Planned** and Digital Human is **Future**,
    described as presentation adapters only. → `19`

Then capture your written feedback view. → `20`

## 5. Severity for anything you flag

- **P0** — blocking: outage, blank page, broken navigation, Curefoods replaced,
  approval bypass, non-simulated execution, invalid audit, or any secret exposure.
- **P1** — fix-forward: wrong/misleading label, continuity cue missing, a link that
  lands on the wrong route, an overclaim in copy.
- **P2** — polish: spacing, density, wording nits.

## 6. Feedback questions

1. Was it clear within 30 seconds what VentureOS does?
2. Did the Curefoods mission feel like **one** continuous journey across surfaces?
3. Was the continuity cue in Mission Control noticeable?
4. Was it obvious that **no real action** was taken (email/CRM/risk)?
5. Was the approval gate clearly mandatory?
6. Did the NVIDIA stage make clear that NVIDIA **grounds** but never **decides**?
7. Was the deterministic fallback described truthfully (not as live NVIDIA)?
8. Did Manager Coaching read as a **Guided Demo**, not a shipped workflow?
9. Did Guardrails make clear that deterministic policy is the **final** authority?
10. Was the raw NVIDIA score clearly **not** a probability/confidence value?
11. Was the audit reference labelling (recommendation vs audit ref) clear?
12. Did any surface appear to create a **second** source of truth?
13. Did any copy **overclaim** a renewal, revenue, or risk-reduction result?
14. Did any private detail leak (branch name, commit hash, deployment id)?
15. Overall: is this walkthrough ready for an external technical audience?

## 7. Submitting feedback

Attach your screenshot set and answers to:
`<FEEDBACK_DESTINATION — provided separately by the release owner>`

Do not paste any URL that contains a token or bypass parameter.
