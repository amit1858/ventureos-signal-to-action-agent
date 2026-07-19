# VentureOS — Walkthrough Deck Source (Private Review)

> **Private review artifact.** This is a **source outline** for an internal
> walkthrough slide pack. It is **separate** from the NVIDIA submission deck and
> must **not** be published to the README, GitHub Pages, the microsite, Gamma, or
> the NVIDIA deck. It contains no secrets. Screenshots are captured separately by
> testers (see `tester-guide.md`); this file only maps each slide to its intended
> shot, source route, status label, message, and evidence.

**Deck title:** VentureOS — From Signal to Governed Action
**Audience:** internal + technical reviewers
**Narrative spine:** one governed Curefoods renewal mission, told end to end, with
NVIDIA grounding and explicit governance boundaries.

Each slide lists: **Message · Screenshot · Source route · Status label · Speaker
note · Evidence statement · Claims to avoid.**

---

### Slide 1 — The enterprise problem
- **Message:** Fragmented signals rarely become governed, auditable action.
- **Screenshot:** `03_walkthrough_overview`
- **Source route:** `/walkthrough`
- **Status label:** Product context
- **Speaker note:** Enterprises need traceability + a human approval gate before acting.
- **Evidence:** Signals live in separate systems; recommendations are disconnected from execution.
- **Claims to avoid:** Don't claim VentureOS replaces the CRM.

### Slide 2 — Today's priority: Curefoods renewal
- **Message:** One clear, canonical mission replaces a noisy list.
- **Screenshot:** `04_todays_mission`
- **Source route:** `/?view=mission`
- **Status label:** Production
- **Speaker note:** Curefoods surfaces as the canonical mission via deterministic selection.
- **Evidence:** Account Curefoods · renewal protection · "Deterministic governed demo mission" label.
- **Claims to avoid:** Do not present Curefoods as live customer CRM truth.

### Slide 3 — One mission, continued
- **Message:** The same account/mission/recommendation continues into Mission Control.
- **Screenshot:** `05_mission_continuity`
- **Source route:** `/mission-control`
- **Status label:** Production
- **Speaker note:** Continuity is the strongest trust signal — one source of truth.
- **Evidence:** Same mission id, same recommendation id, continuity cue visible, nothing re-selected.
- **Claims to avoid:** Don't imply a second downstream mission is created.

### Slide 4 — Verified evidence
- **Message:** The recommendation rests on checkable evidence.
- **Screenshot:** `06_verified_evidence`
- **Source route:** `/mission-control`
- **Status label:** Production
- **Speaker note:** Account health, renewal timeline, usage trend — verified 3 of 3.
- **Evidence:** Evidence references present; verification 3 of 3.
- **Claims to avoid:** Don't claim the LLM produced the underlying facts.

### Slide 5 — NVIDIA grounds, never decides
- **Message:** Live NVIDIA NIM grounds the explanation; deterministic policy stays authoritative.
- **Screenshot:** `07_nvidia_grounded`
- **Source route:** `/mission-control`
- **Status label:** Production
- **Speaker note:** provider=nim, Nemotron model, grounded=true, fallbackUsed=false.
- **Evidence:** Live grounded run with evidence references; truthful fallback if unavailable.
- **Claims to avoid:** Never say NVIDIA selects, approves, or executes.

### Slide 6 — Human approval is mandatory
- **Message:** Nothing executes without an explicit two-step human approval.
- **Screenshot:** `08_approval_gate`
- **Source route:** `/mission-control`
- **Status label:** Production
- **Speaker note:** The approval gate is the enforceable boundary between recommendation and action.
- **Evidence:** Mandatory approval; exact action scope; two-step binding; AI cannot self-approve.
- **Claims to avoid:** Don't imply any auto-execution path exists.

### Slide 7 — Execution is simulated
- **Message:** After approval, actions are simulated, not real.
- **Screenshot:** `09_simulated_execution`
- **Source route:** `/mission-control`
- **Status label:** Production
- **Speaker note:** Proves the pipeline end-to-end without touching customer systems.
- **Evidence:** Email drafted not sent; CRM task proposed not created; risk update proposed not written.
- **Claims to avoid:** Never say the email was sent or the CRM was updated.

### Slide 8 — Honest governed outcome
- **Message:** System completion is separated from business result.
- **Screenshot:** `10_governed_outcome`
- **Source route:** `/mission-control`
- **Status label:** Production
- **Speaker note:** "Governed work prepared successfully" vs "Awaiting external response".
- **Evidence:** System outcome and business outcome shown distinctly.
- **Claims to avoid:** Don't claim a renewal, revenue, or risk-reduction result.

### Slide 9 — Manager Coaching (Guided Demo)
- **Message:** A manager lens answers "where should I intervene?" — read-only.
- **Screenshot:** `11_manager_coaching`
- **Source route:** `/manager`
- **Status label:** Guided Demo
- **Speaker note:** Same mission continuity; one 15-minute coaching intervention; no authority to act.
- **Evidence:** Same mission/recommendation/audit ref; simulated action; no notification; no CRM mutation.
- **Claims to avoid:** Don't present it as a shipped, persistent workflow or claim coaching effectiveness.

### Slide 10 — Guardrails Lab (what the AI cannot do)
- **Message:** Deterministic policy is the final authority; NVIDIA NemoGuard is telemetry.
- **Screenshot:** `13_guardrails_injection_blocked`
- **Source route:** `/guardrails`
- **Status label:** Guardrails Lab
- **Speaker note:** Injection and approval bypass blocked; sensitive data redacted; outage doesn't bypass policy.
- **Evidence:** Named deterministic rail per decision; curated scenarios only.
- **Claims to avoid:** Don't claim total protection or global Production traffic interception.

### Slide 11 — Guardrails: live NVIDIA vs forced fallback
- **Message:** NVIDIA classification is an additional signal; policy holds during outage.
- **Screenshot:** `15_guardrails_live_nvidia` (+ `16_guardrails_forced_fallback`)
- **Source route:** `/guardrails`
- **Status label:** Guardrails Lab
- **Speaker note:** Live: available=true, boolean + raw score. Fallback: available=false, deterministic decision preserved.
- **Evidence:** Raw score shown as raw, not probability; forced fallback keeps the safe deterministic decision.
- **Claims to avoid:** Don't present the raw score as calibrated probability/confidence.

### Slide 12 — Personas read one mission
- **Message:** Executive and Operations project the same governed mission.
- **Screenshot:** `18_executive_operations`
- **Source route:** `/mission-control`
- **Status label:** Production — Partial
- **Speaker note:** Personas align on one truth rather than diverging.
- **Evidence:** Same mission across personas; no persona creates a second source of truth.
- **Claims to avoid:** Don't imply all persona projections are complete.

### Slide 13 — Audit proves what happened
- **Message:** A canonical audit reference anchors a valid, replay-safe chain.
- **Screenshot:** `17_audit_projection`
- **Source route:** `/guardrails` (read-only projection) / `/mission-control`
- **Status label:** Production
- **Speaker note:** Approval → simulation → outcome; idempotent replay; no ledger growth.
- **Evidence:** Canonical audit reference; chain valid; no hidden execution.
- **Claims to avoid:** Don't claim writes to any protected ledger occurred.

### Slide 14 — Roadmap: Voice & Digital Human
- **Message:** New surfaces are presentation adapters — governance unchanged beneath.
- **Screenshot:** `19_roadmap`
- **Source route:** `/walkthrough`
- **Status label:** Roadmap
- **Speaker note:** Voice = Planned; Digital Human = Future; both adapt around the governed core.
- **Evidence:** Adapters never own business logic, approval, or execution.
- **Claims to avoid:** Don't announce delivery dates or imply they already ship.

### Slide 15 — Why it matters
- **Message:** Signal → governed, evidence-backed, human-approved, auditable action.
- **Screenshot:** `01_landing`
- **Source route:** `/`
- **Status label:** Production
- **Speaker note:** Close on the trust story: continuity, grounding, approval, simulation, audit.
- **Evidence:** The whole walkthrough is the proof.
- **Claims to avoid:** No business-outcome or ROI claims.

---

## Global claims-to-avoid (applies to every slide)
- No "fully secure" / "all attacks prevented" language.
- No claimed customer response, renewal, revenue, adoption, or risk-reduction result.
- No live CRM/email side effects (everything is simulated).
- No private detail on slides: branch names, commit hashes, deployment IDs, Preview URLs with tokens.
- Raw NVIDIA score is never a probability or official calibration.
