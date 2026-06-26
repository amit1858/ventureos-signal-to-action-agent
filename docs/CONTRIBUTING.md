# Contributing 🤝 — Signal-to-Action Agent

> For developers who want to contribute code, docs, or fixes to the Signal-to-Action Agent project.

## Welcome

Signal-to-Action Agent is an open-source NVIDIA Open Hackathon submission by Team VentureOS. Contributions are welcome, whether that's a bug fix, a documentation improvement, a new test, or a feature that respects the project's governance model. This guide explains how to contribute effectively.

## Ground rules (non-negotiable)

The governance invariants are the foundation of this project and may not be weakened by any contribution:

> AI helps explain and recommend. AI does not determine priority, change governance, or execute CRM actions. Humans remain accountable for all decisions.

Concretely:

- No change may let an AI/LLM set priority, confidence, or approval status. The deterministic engine owns ranking, priority, and confidence (computed in code, not prompts).
- No change may allow an AI to approve or auto-execute CRM write-back. Human approval is a mandatory gate before any CRM write.
- All data must remain synthetic. Do not add real customer data; HubSpot is a disposable test portal.
- No secrets may be committed. Provider LLM keys are never set server-side.

## Repository standards

This is a monorepo:

- `apps/web` — Next.js 14 + TypeScript + Tailwind frontend
- `services/api` — Python FastAPI + Pydantic + SQLite backend
  - `services/api/agents/` — orchestrator plus the six agents
  - `services/api/schemas/` — Pydantic contracts
  - `services/api/model_adapters/` — model layer adapter pattern
  - `services/api/decision_providers/` — BYOK advisory layer
  - `services/api/crm_connectors/` — HubSpot connector and mapper
  - `services/api/evals/` — evaluation harness and test queries
- `docs/` — documentation

## Development setup

See [QUICK_START.md](QUICK_START.md) for full local setup of the backend and frontend. The app runs end-to-end on synthetic data with `MODEL_PROVIDER=mock` and no keys.

## Branch strategy

- `main` is always deployable.
- Create short-lived feature branches named `feature/<slug>`.
- Keep branches focused and merge promptly.

## Coding standards

- Python: use typed Pydantic models throughout, FastAPI route handlers, and consistent standard formatting. Keep functions small and readable.
- TypeScript: use strict typing. Place components in `apps/web/components` and shared libraries in `apps/web/lib`.

## Typed-contract rule

Every agent output and API response must be a Pydantic model. Do not return bare dictionaries. Typed contracts keep agent boundaries explicit and responses verifiable.

## Commit messages

Write clear, imperative commit messages (for example, "Add account health scoring weight" rather than "added stuff"). Keep each commit focused.

## Pull request process

- Keep PRs small and focused.
- Include a clear description and link any related issue.
- Ensure the evaluation harness passes (10/10).
- Confirm no secrets are included.
- Update documentation when behavior changes.

## Testing expectations

- Run the evaluation harness from `services/api`:

  ```bash
  python evals/evaluation_runner.py
  ```

  All 10/10 checks must pass.
- The frontend must build clean.

## Documentation standards

- Update `docs/` whenever behavior changes.
- Keep the Current / Hackathon / Future labels accurate.
- Always label the Voice Chief of Staff and Gnani.ai speech layer as "planned (NVIDIA hackathon)"; never imply they are built.

## Issue reporting

When filing a bug, include:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment (OS, Python/Node versions, `MODEL_PROVIDER`, and whether any optional integrations are enabled)

## Related documentation

- [Quick Start](QUICK_START.md)
- [Architecture](ARCHITECTURE.md)
- [Agent Architecture](AGENT_ARCHITECTURE.md)
- [Governance](GOVERNANCE.md)
- [Security](SECURITY.md)
- [FAQ](FAQ.md)
- [Roadmap](ROADMAP.md)
- [Repository README](../README.md)
