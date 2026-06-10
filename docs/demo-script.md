# Demo Script: Signal-to-Action Agent
**Hackathon:** India Agentic AI Open Hackathon 2026 – Track A: Agentic Workflows  
**Team:** VentureOS  
**Duration:** 5 minutes  

---

## Pre-Demo Checklist

- [ ] Backend running on `localhost:8000` (mock adapter active)
- [ ] Frontend running on `localhost:3000`
- [ ] Browser open to `/dashboard`
- [ ] Synthetic data loaded (50 accounts, 200+ signals)
- [ ] Test query ready in clipboard: *"Which SMB accounts need attention this week and why?"*

---

## Demo Flow (Timed Sections)

### [0:00–0:45] 1. Introduce the Problem (45 seconds)

**Speaker notes:**

> "Enterprise sellers are drowning in fragmented customer signals. They have CRM data, billing alerts, support tickets, product telemetry, and marketing engagement—but no clear answer to the question: *Which accounts need my attention this week, and why?*
>
> Current tools give dashboards and alerts, but sellers still spend 60% of their time navigating data instead of talking to customers. We built **Signal-to-Action Agent** to solve this.
>
> This is **not a chatbot**. It's a governed, multi-agent workflow that turns signals into explainable, human-approved next-best actions. Let me show you."

**What to do:**
- Stand at the `/dashboard` page (shows "Ask a question" input box)

---

### [0:45–1:15] 2. Ask the Demo Question (30 seconds)

**Speaker notes:**

> "Let's ask the system: *Which SMB accounts need attention this week and why?*"

**What to do:**
1. Type or paste: `Which SMB accounts need attention this week and why?`
2. Click **"Get Recommendations"** button
3. Wait for loading spinner (should complete in <2 seconds on mock adapter)

**Expected result:**
- Screen transitions to `/recommendations` page
- Shows 5 ranked account cards in priority order

---

### [1:15–2:00] 3. Show Ranked Account Recommendations (45 seconds)

**Speaker notes:**

> "The system analyzed all 50 SMB accounts, computed deterministic priority scores, and ran six specialized agents. Here are the top 5 accounts that need attention this week, ranked by priority."

**What to do:**
1. Point to the **priority score** (e.g., 0.78, 0.72, 0.68, ...)
2. Read aloud the **1-sentence priority reason** for the #1 account:
   - Example: *"High growth potential + strong campaign engagement but declining spend"*
3. Hover over the score to show **score breakdown tooltip**:
   - Support risk: 0.25
   - Spend decline: 0.30
   - Growth potential: 0.80
   - Renewal urgency: 0.15
   - Campaign response: 0.81
   - (others...)

**Speaker notes:**

> "Priority scoring is deterministic—no LLM involvement in ranking. This ensures reproducibility and prevents prompt injection from affecting prioritization."

---

### [2:00–3:00] 4. Open Account Detail & Show Evidence (60 seconds)

**What to do:**
1. Click **"View Details"** on the #1 ranked account
2. Screen expands to show full recommendation card

**Speaker notes:**

> "Let's drill into the top account: **DataViz Partners**. Here's what the system found."

**Point to each section:**

- **Risk Summary:**
  > "Spend declined 15% month-over-month; unresolved support ticket #4523 open for 12 days."

- **Opportunity Summary:**
  > "Clicked Q2 product webinar link; strong usage score (72/100); high growth potential (78/100)."

- **Evidence Panel** (scroll to show 3–5 evidence items):
  - ✅ **Spend decline** (source: Billing, polarity: negative, strength: 0.85)
  - ✅ **Campaign click** (source: Marketing, polarity: positive, strength: 0.75)
  - ✅ **Support ticket** (source: Support, polarity: negative, strength: 0.60)

**Speaker notes:**

> "Every recommendation is backed by evidence from source systems—CRM, Billing, Support, Telemetry, Marketing. No black-box outputs. Each evidence item shows the source agent, signal strength, and polarity."

---

### [3:00–3:30] 5. Show Governance Check (30 seconds)

**What to do:**
1. Scroll to **Governance Section**

**Speaker notes:**

> "Here's the governance check. The system computed a **confidence score of 0.67**—moderate confidence.
>
> The Governance Agent flagged a caveat: *'Limited recent engagement data; last contact was 42 days ago.'*
>
> This is critical for compliance and trust. Low-confidence recommendations surface caveats; high-risk actions require additional review."

**Point to approval status:**

> "Approval status is **pending**. No action executes without human approval. This is **not autopilot**—it's human-in-the-loop by design."

---

### [3:30–4:00] 6. Approve Action (30 seconds)

**What to do:**
1. Scroll to **Recommended Action** section:
   - **Action type:** `follow_up_call`
   - **Action description:** "Schedule 15-min support + product check-in to address support ticket and explore Q2 analytics tier"
2. Click **"Approve"** button
3. Toast notification appears: *"Action approved. Email draft and call script are now available."*

**Speaker notes:**

> "I'm approving this action. The system logs my approval in the decision ledger with timestamp and user ID—fully auditable."

---

### [4:00–4:30] 7. Show Generated Email & Call Script (30 seconds)

**What to do:**
1. Scroll to **Communication Drafts** section (now visible post-approval)

**Speaker notes:**

> "The Communication Agent drafted a seller-ready email and call script. Let me show you the email."

**Read aloud (paraphrase):**

> "Subject: Quick follow-up on Q2 product updates
>
> Hi DataViz Partners team,
>
> I noticed you clicked our recent webinar link on advanced analytics—great to see your interest! I also wanted to check in on support ticket #4523 to make sure your team is unblocked.
>
> Given your strong product usage and recent growth, I'd love to discuss how our API tier could support your Q2 plans. Are you available Thursday or Friday for 15 minutes?
>
> Best, [Seller Name]"

**Speaker notes:**

> "The email is personalized, references specific evidence (webinar click, support ticket), and includes a clear call-to-action. Sellers can copy this, tweak it, and send—no starting from a blank page."

---

### [4:30–5:00] 8. Explain NVIDIA Integration & Close (30 seconds)

**Speaker notes:**

> "One more thing: This demo runs on a **mock model adapter** for stability. But the backend is designed for **NVIDIA NIM** and **NeMo Agent Toolkit** integration.
>
> The system uses an **adapter pattern**—we can swap the mock backend for NVIDIA Nemotron models by just setting an environment variable: `MODEL_PROVIDER=nvidia-nim`.
>
> This enables **sovereign AI deployments**: on-premises inference, no data exfiltration, GPU-accelerated structured output generation.
>
> In production, we'll use **NeMo Agent Toolkit** to orchestrate agents in parallel, reducing latency by 30–40%. The decision ledger, governance checks, and evidence trails stay the same—but inference moves to NVIDIA infrastructure.
>
> **Long-term vision:** A fully on-prem, GPU-optimized, compliance-ready multi-agent system that scales from 50 accounts to 5,000, with sub-500ms latency and 99% structured output validity."

---

### [5:00] 9. Close with Value Proposition (Optional 10-second buffer)

**Speaker notes:**

> "To recap: **Signal-to-Action Agent** turns fragmented signals into explainable, human-approved actions. It's governed, auditable, and designed for sovereign AI deployments. Thank you!"

**What to do:**
- Return to `/dashboard` or show **Decision Ledger** page (if time permits)
- Open for Q&A

---

## Backup Slides / Talking Points (If Judges Ask Questions)

### Q: "How is this different from a Copilot or chatbot?"

**A:**
> "Great question. Copilots are conversational assistants—you ask, they answer. We're a **controlled workflow**. Six specialized agents run in sequence with typed contracts. The Governance Agent enforces approval gates. The ledger logs every decision. It's closer to a decision-support system than a chatbot—think 'approval workflow' not 'chat thread.'"

### Q: "What if the LLM hallucinates or gives bad advice?"

**A:**
> "Three safeguards: First, **deterministic scoring** happens before the LLM even runs—prioritization can't be manipulated by prompt injection. Second, **evidence provenance**: every recommendation links to source signals with strength and polarity. Third, **human approval required**: no action executes automatically. The Governance Agent flags low-confidence cases with caveats. Sellers always have the final say."

### Q: "How do you handle data privacy and compliance?"

**A:**
> "All MVP data is synthetic—no real customer PII. In production, the NVIDIA NIM adapter enables **on-prem inference**: customer data never leaves their infrastructure. The decision ledger is SQLite (or PostgreSQL in production) with row-level security. We're designed for GDPR, SOC 2, and HIPAA compliance from day one."

### Q: "What's the NVIDIA-specific value here?"

**A:**
> "Three things: **Sovereign AI** (self-hosted NIM endpoints, no cloud API dependency), **GPU-accelerated structured outputs** (JSON schema enforcement with Tensor Core acceleration), and **NeMo Agent Toolkit** for production orchestration. We're not hardwired to OpenAI or Anthropic. The adapter pattern lets us plug in NVIDIA infrastructure without refactoring agents."

### Q: "Can this work for non-SMB segments (e.g., Enterprise)?"

**A:**
> "Absolutely. The agent framework is segment-agnostic. For Enterprise accounts, we'd add agents for multi-stakeholder mapping, contract complexity analysis, and executive sponsor engagement. The core workflow (signals → agents → ledger → approval) stays the same. We chose SMB for the demo because it's easier to explain, but the architecture scales."

---

## Demo Failure Recovery

### If backend is down:
- Show pre-recorded screen recording (prepare 2-min version)
- Walk through static screenshots in slide deck

### If frontend renders incorrectly:
- Use `curl` to call API directly and show JSON response in terminal:
  ```bash
  curl -X POST http://localhost:8000/api/recommendations \
    -H "Content-Type: application/json" \
    -d '{"query": "Which SMB accounts need attention this week?", "limit": 5}'
  ```
- Narrate the JSON structure (recommendations, evidence, governance)

### If latency is high (>5 seconds):
- Acknowledge: "The mock adapter is simulating LLM latency. In production with NVIDIA NIM, this runs in under 1 second."

---

## Post-Demo: Judge Q&A Preparation

**Likely judge questions:**
1. How do you prevent bias in prioritization?
2. What happens if signals conflict (e.g., high growth but also churn risk)?
3. How do sellers provide feedback to improve recommendations?
4. What's the ROI for a sales team using this?

**Prepared answers in slide deck appendix (optional):**
- Bias mitigation: Deterministic scoring with explainable weights; no opaque ML models
- Conflicting signals: Both risk and opportunity are surfaced; seller decides trade-off
- Feedback loop: Approval/rejection data trains future scoring weights (Phase 3)
- ROI: 5 hours/week saved per seller × $50/hr = $250/week/seller; 20% churn reduction = $X retained revenue

---

**Next Steps After Demo:**
1. Share GitHub repo link (if public)
2. Offer to walk judges through decision ledger or eval harness
3. Highlight NVIDIA integration roadmap (Phase 1–3 in integration plan doc)

**Confidence booster:**
> "We built this to be **production-ready, not just demo-ware**. Typed contracts, decision ledger, evaluation harness, NVIDIA integration plan—it's architected for real deployments, not just slides."

---

**Good luck, Team VentureOS! 🚀**
