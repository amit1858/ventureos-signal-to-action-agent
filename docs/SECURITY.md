# Security 🔐 — Signal-to-Action Agent

> For public reviewers and security-minded evaluators assessing how the Signal-to-Action Agent handles trust, secrets, and data.

## Security model overview

Signal-to-Action Agent is governed by design. The AI is bounded: it helps explain and recommend, but it never determines priority, changes governance, or executes CRM actions. A deterministic engine owns ranking, priority, and confidence, and a mandatory human approval gate sits in front of any CRM write-back. This makes the trust model a security control, not an afterthought.

> AI helps explain and recommend. AI does not determine priority, change governance, or execute CRM actions. Humans remain accountable for all decisions.

## No secrets in source control

- No secrets are committed to the repository.
- `.env.example` documents the available variables; real values are supplied via the environment only.
- `.gitignore` excludes `.env`, `.venv`, and `node_modules`.

## Environment variables and secret handling

| Variable | Sensitive? | Where it lives |
| --- | --- | --- |
| `HUBSPOT_ACCESS_TOKEN` | Yes | Server environment only (test portal token, `pat-...`). |
| `SERPER_API_KEY` | Yes | Server environment only. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `NVIDIA_API_KEY` | Yes | Intentionally NOT set server-side. Provided per request via BYOK. |
| `MODEL_PROVIDER` | No | Server environment; defaults to `mock` (deterministic, no keys). |
| `NEXT_PUBLIC_API_BASE_URL` | No | Frontend build/runtime config. |

Provider LLM keys are never set server-side. The product runs with zero LLM keys using the deterministic baseline.

## BYOK security model

Bring Your Own Key (BYOK) lets a user optionally connect their own OpenAI, Anthropic Claude, or NVIDIA Nemotron key from the browser. It is implemented in `apps/web/lib/byok.ts` and follows strict handling rules:

- Keys live ONLY in browser sessionStorage (`s2a.byok.openai`, `s2a.byok.anthropic`, `s2a.byok.nvidia`).
- Keys are NEVER committed, NEVER persisted to any database, NEVER written to logs, NEVER returned from any API, and NEVER set in the server environment.
- A key travels in a single request body (or the `X-Byok-Api-Key` header for model discovery) for ONE request only.
- Keys are masked in the UI and cleared when the browser tab closes.
- The deterministic engine is always the fallback if an LLM call fails.

## Data privacy

- All data is 100% synthetic; there is no real customer data and no PII.
- The synthetic dataset is produced by a seeded generator (SEED=2026, 6 archetypes).
- The HubSpot integration uses a disposable HubSpot test portal (configured via `HUBSPOT_ACCESS_TOKEN`) only.

## Governance and human-in-the-loop as a security control

- The deterministic engine owns ranking, priority, confidence, and approval status. The LLM never touches `priority_rank`, `priority_score`, `confidence`, or `approval_status`.
- Human approval is mandatory before any CRM write-back. CRM write-back (HubSpot tasks/notes) happens only after a human clicks Approve, and is gated/disabled in demo mode.
- The Decision Ledger records every decision (approve/reject/review) and outcome, providing an audit trail. It is persisted browser-side (`localStorage` key `s2a_decision_ledger_v1`) and is backend-swappable.
- External signals (Serper/SearchAPI) are advisory only and never change ranking.

## Provider abstraction

The model layer uses an adapter pattern with no hardwired vendor. The deterministic baseline is always available as a fallback, so the system functions even with no provider keys present.

## Responsible disclosure

If you discover a potential security issue, please report it privately by opening a GitHub security advisory or a private issue on the repository: https://github.com/amit1858/ventureos-signal-to-action-agent. Please do not disclose details publicly until the issue has been reviewed.

## Repository safety checklist

Reviewers can independently verify:

- Searching the source tree for secrets returns nothing; secrets are environment-only.
- All data is synthetic and the HubSpot portal is a disposable test portal.
- Provider LLM keys are BYOK: held only in browser sessionStorage and never reach the server or the repository.

This project is designed toward enterprise controls. It does not claim any formal certification.

## Related documentation

- [Governance](GOVERNANCE.md)
- [Architecture](ARCHITECTURE.md)
- [Agent Architecture](AGENT_ARCHITECTURE.md)
- [Quick Start](QUICK_START.md)
- [Contributing](CONTRIBUTING.md)
- [FAQ](FAQ.md)
- [Repository README](../README.md)
