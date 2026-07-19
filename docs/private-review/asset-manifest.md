# VentureOS — Walkthrough Asset Manifest (Private Review)

> **Private review artifact.** Tracks the screenshot/asset set for the integrated
> walkthrough deck and tester review. Not published anywhere public. No secrets.

## Screenshot set (captured by testers, collated by the release owner)

Naming convention: `NN_<name>_<tester>.png` (1440px+ wide, 100% zoom).

| # | Filename stem | Route | Status label | Deck slide |
| --- | --- | --- | --- | --- |
| 01 | `landing` | `/` | Production | 15 |
| 02 | `explore_entry` | `/` → `/walkthrough` | Production | — |
| 03 | `walkthrough_overview` | `/walkthrough` | Product Walkthrough | 1 |
| 04 | `todays_mission` | `/?view=mission` | Production | 2 |
| 05 | `mission_continuity` | `/mission-control` | Production | 3 |
| 06 | `verified_evidence` | `/mission-control` | Production | 4 |
| 07 | `nvidia_grounded` | `/mission-control` | Production | 5 |
| 08 | `approval_gate` | `/mission-control` | Production | 6 |
| 09 | `simulated_execution` | `/mission-control` | Production | 7 |
| 10 | `governed_outcome` | `/mission-control` | Production | 8 |
| 11 | `manager_coaching` | `/manager` | Guided Demo | 9 |
| 12 | `guardrails_overview` | `/guardrails` | Guardrails Lab | 10 |
| 13 | `guardrails_injection_blocked` | `/guardrails` | Guardrails Lab | 10 |
| 14 | `guardrails_redaction` | `/guardrails` | Guardrails Lab | 10 |
| 15 | `guardrails_live_nvidia` | `/guardrails` | Guardrails Lab | 11 |
| 16 | `guardrails_forced_fallback` | `/guardrails` | Guardrails Lab | 11 |
| 17 | `audit_projection` | `/guardrails` | Guardrails Lab | 13 |
| 18 | `executive_operations` | `/mission-control` | Production — Partial | 12 |
| 19 | `roadmap` | `/walkthrough` | Roadmap | 14 |
| 20 | `final_feedback` | (feedback view) | — | — |

## Storage

- Raw screenshot archives: session `files/` only (e.g. `files/sunday-integrated-preview-screenshots/`).
- **Do not commit** raw screenshot binaries to the repo.
- Deck source + this manifest live in `docs/private-review/` (tracked, no binaries).

## Status label legend (public-safe)

- **Production** — shipped governed experience.
- **Production — Partial** — shipped but partial persona coverage.
- **Guided Demo** — Manager Coaching demonstration surface.
- **Guardrails Lab** — isolated guardrails demonstration.
- **Product Walkthrough** — the storytelling route itself.
- **Roadmap** — Planned (Voice) / Future (Digital Human).

## Must-not-leak checklist for every asset

- [ ] No branch name visible
- [ ] No commit hash visible
- [ ] No deployment ID visible
- [ ] No Preview URL containing a token/bypass parameter
- [ ] No API key / bearer token anywhere in frame
- [ ] No "Feature Branch" label
