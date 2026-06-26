# Signal-to-Action Agent — 10-Minute Executive Demo Script

> **Phase 5.1 — Executive Demo Hardening.** A controlled, scripted walkthrough.
> Audience: VP / GM / executive sponsor / strategic partner.
> Surface: https://ventureos-signal-to-action-agent.vercel.app
> Backend: https://signal-to-action-api.onrender.com (live, HubSpot test CRM)

---

## Setup (do this before the meeting — 2 min)

1. Open the production URL in a clean browser profile (incognito works).
2. Wait until the header reads **"HubSpot test CRM · 99 accounts"**.
3. In **Trust & Governance → AI Decision Engines · BYOK**, paste your Anthropic
   key, click **Test**, then **Activate**. Expect:
   `✓ Connected · Anthropic Claude · claude-sonnet-4-6 · ~1,400 ms`.

---

## Demo Flow (10 min)

### Act I — The Question (0:00 – 1:30)
*"Every Monday a seller and their manager ask the same question:
'Which of my accounts need attention this week, and why?' Today they
answer that by scrolling a CRM. We answer it with a governed multi-agent
workflow."*

In **Command Center** point to: Portfolio Health (one-line answer),
Today's Priorities (Curefoods #1), Executive Briefing (sequenced).

**Line:** *"We didn't ask the AI what to do. We asked the **governed engine**
to rank — and the engine showed its work."*

### Act II — The Reasoning (1:30 – 4:30)
**Workspace → Curefoods.** Walk through, in order:
1. Risk · Opportunity · Confidence (figures from HubSpot, not generated).
2. Why this account (deterministic chain).
3. Internal evidence (every signal cited, with source + date).
4. Market Intelligence (outside-in context, advisory only).
5. Draft email / call script (narrative layer).
6. Approve / Reject / Edit — the only path to CRM write-back.

**Line:** *"The math is governed. The narrative is helpful. Nothing
reaches HubSpot without a human approving it."*

### Act III — The Trust Layer (4:30 – 7:00)
**Trust & Governance.** Walk through:
1. Twelve evaluation dimensions, 10/10 on the latest run.
2. AI Reasoning Engines — Governed Decision Engine + BYOK lineup.
3. Systems of Record — HubSpot live, Salesforce / Dynamics on the same contract.
4. Production Readiness — Live / Ready / Planned matrix.

**Line:** *"This is what makes it an early product, not a hackathon
prototype. We've drawn the line between what's live, what's ready to
wire, and what comes next."*

### Act IV — The Review Board (7:00 – 9:30)
Anthropic is already activated. Scroll to **Compare across providers**,
pick **Curefoods**, click **Compare**.

While it runs (~40s), narrate:
*"Same evidence, same schema, sent to the Governed Decision Engine **and**
to Claude. We're asking each engine to make a decision. This is our
executive review board."*

When the result lands, point to the **Provider Consensus banner**:
- 100% agreement (when Claude agrees).
- Alignment: action, risk, opportunity, confidence — all four match.
- Divergence: named precisely if any.
- Recommended final decision: **Governed Decision Engine**.

Read Claude's exec summary out loud (~3 sentences), then the Governed
Decision Engine's. Let the silence sit.

**Line:** *"When the most advanced LLM available agrees with our governed
engine on action, risk, opportunity and confidence — that's the trust
signal a CRO needs to enable this org-wide. When it disagrees, governance
still wins, and we surface the divergence."*

### Act V — The Close (9:30 – 10:00)
*"Three takeaways.*

*1. **Governance is the product.** Deterministic engine is the source of
truth. Every LLM is advisory and bound by human approval.*

*2. **BYOK is a real feature, not a stub.** Your key, your browser tab,
no server-side persistence. Live discovery of every model your key can
actually call.*

*3. **The architecture is honest.** We've labelled what's live, what's
ready, and what's planned — a credible path to a multi-tenant product,
not a list of TODOs.*

*Repo: `amit1858/ventureos-signal-to-action-agent`. Happy to walk
the architecture or run a discovery session next."*

---

## Talking Points · Quick Reference

| Surface | Key sentence |
|---|---|
| Command Center | "Governed answer to a recurring question — not a chatbot." |
| Workspace | "Math from your CRM. Narrative from a senior AE. Action gated on a human." |
| Market Intelligence | "Outside-in context, advisory only — never changes ranking." |
| Trust & Governance | "Twelve dimensions, measured on the latest run." |
| Provider Settings | "Your key. Your tab. No server-side storage. Live model discovery." |
| Provider Consensus | "An executive review board across engines." |
| Production Readiness | "Live / Ready / Planned — honestly labelled." |

---

## Q&A · Anticipated

**"Why deterministic when LLMs are so good now?"**
*"A VP signing off on outbound to 40 accounts a week needs the same
answer every Monday from the same data. LLMs are advisory and rated
against the baseline."*

**"What if the LLM disagrees?"**
*"The engine wins. The divergence is surfaced for human review.
Nothing ships without approval either way."*

**"Where do BYOK keys live?"**
*"In the browser tab's sessionStorage. Close the tab and they're gone.
Backend receives them only in-flight to make one provider call. Never
logged. Never persisted. Never returned from any API."*

**"How does this become a real product?"**
*"Three planned pillars: SSO, multi-tenant isolation, RBAC.
Salesforce and Dynamics slot into the same CRMConnector contract
that HubSpot uses today. The decision provider framework already
supports swapping engines without touching the agents."*

**"How long until I can pilot this with my team?"**
*"A controlled pilot on a test HubSpot portal is ready today.
Production rollout pivots on SSO + multi-tenant + your CRM of choice."*

**"Latency on the LLM is ~40s — production-acceptable?"**
*"For an executive review-board on a single account, yes. For batch
evaluation across 99 accounts we run the governed engine — which is
sub-second — and use the LLM only on the priority shortlist."*

---

## Pre-Demo Checklist

- [ ] Clean browser profile / incognito.
- [ ] Production URL loads in <3s.
- [ ] Header chip: `HubSpot test CRM · 99 accounts`.
- [ ] Curefoods is #1 in Command Center.
- [ ] Anthropic BYOK is connected & active.
- [ ] You've rehearsed the Act IV transition while compare is running.
- [ ] You've memorised one sentence from Curefoods' Claude exec summary
      so you can deliver it from the screen, not read it.

---

## What NOT to demo

- Don't click **Sync HubSpot** live (10+ s, breaks pace).
- Don't paste real production keys; the sandbox one only.
- Don't open the full decision ledger unless asked.
- Don't switch the active provider away from **Deterministic**
  mid-demo unless explicitly showing fallback.

---

*Generated for Phase 5.1 Executive Demo Hardening.*
