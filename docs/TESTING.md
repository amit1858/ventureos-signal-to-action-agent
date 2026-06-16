# Testing Guide — Signal-to-Action Agent

This guide is for **external testers and reviewers**. You do not need to read any code. The goal is
to judge whether the product is clear, useful, and trustworthy.

Spend about **10 minutes**. Use the product like a busy sales manager would.

---

## Before you start

- Open the app (your host will share the URL).
- You do not need a HubSpot account. If a live CRM is connected you will see *HubSpot test CRM*; if
  not, the app runs in **synthetic mode** — both are valid for testing.

---

## What to test

Walk through each surface and note your first reaction.

| # | Area | What to check |
|---|------|---------------|
| 1 | **Landing page** | Within 30 seconds, is it clear what this product is and why it exists? |
| 2 | **Command Center** | Does the Morning Brief tell you what matters today in plain English? |
| 3 | **Portfolio Health** | Can you tell at a glance whether the portfolio is healthy or at risk? |
| 4 | **Today's Priorities** | Is it obvious which accounts to act on and why? |
| 5 | **Risk vs Opportunity map** | Can you see where to focus without reading instructions? |
| 6 | **Workspace** | Can you ask a question and get a clear, useful answer? |
| 7 | **A recommendation (e.g. Curefoods)** | Does it explain *why this account*, *why now*, and *business impact*? |
| 8 | **Evidence & confidence** | Do you understand what the recommendation is based on? |
| 9 | **Human approval** | Is it clear that nothing happens until you approve? |
| 10 | **Decision ledger** | Can you see a record of how the decision was made? |
| 11 | **Source switching** | (If shown) Does switching between HubSpot and synthetic work cleanly? |
| 12 | **CRM writeback** | (If enabled) After approval, does it confirm the task/note was written? |

---

## What feedback we want

Please answer **only** these questions. Keep it short and honest — first impressions are the most
valuable.

1. **"Within 30 seconds, what problem does this product solve?"**
   *(If you can't tell, say so — that's useful.)*

2. **"Which screen made it clear?"**
   *(Which moment made the product "click" for you?)*

3. **"What confused you?"**
   *(Any wording, layout, or step that slowed you down.)*

4. **"Would you trust this recommendation? Why or why not?"**
   *(This is the most important question. Trust is the product's core promise.)*

---

## How to send feedback

- Note the **screen name** and what you expected vs. what happened.
- Screenshots are welcome — but **do not include any real customer data or access tokens**.
- There are no wrong answers. "I didn't get it" is exactly the kind of signal we need.

---

## What you do **not** need to test

- Performance / load — this is a demo build.
- Authentication / multi-user — not in scope yet (see [`ROADMAP.md`](ROADMAP.md)).
- Real CRM data — the product is designed to demo on a **test** portal or synthetic data only.

---

## Decision providers (BYOK) - what to try

The Evaluation Center includes a read-only Comparison Mode that shows how different model providers
reason over the same account. By default only the Deterministic baseline is active; OpenAI,
Anthropic and NVIDIA appear as "not configured" until you add your own key.

Try this:

- Open Evaluation in the header, scroll to "Decision Provider - BYOK".
- Pick an account (e.g. Curefoods) and click "Compare providers".
- Confirm the Deterministic baseline card shows risk, opportunity, confidence, recommended action
  and an executive summary, and that the not-configured providers prompt for a key.
- (Optional) Add your own OPENAI_API_KEY or ANTHROPIC_API_KEY to services/api/.env, restart the
  backend, and compare again to see live decisions next to the baseline.

Try the session-key BYOK UX (no env vars, no restart):

- In Evaluation -> Provider Settings, paste a key into a provider card (it is masked immediately).
- Click "Test connection". A wrong key shows "invalid API key" / Failed; a valid key shows
  Connected plus the resolved model. Nothing is persisted.
- Click "Activate" to make that provider the active session provider, then "Compare providers" to
  see its live decision beside the deterministic baseline.
- Click "Clear" to drop the session key; the active provider falls back to Deterministic.
- Close the browser tab and reopen the app: the key is gone (sessionStorage clears on tab close).
  Confirm no key ever appears in localStorage, the console, the network query string, or any API
  response.

What to tell us:

- Did the comparison make sense? Was the baseline decision clearly the reference point?
- Was it obvious that LLM decisions are advisory and that nothing is written to CRM without approval?

Note: never paste a real API key, customer data, or token into feedback or screenshots. Keys belong
only in services/api/.env, which is git-ignored.
