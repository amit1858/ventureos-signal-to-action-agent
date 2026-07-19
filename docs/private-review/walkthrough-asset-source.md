# Walkthrough Visual Asset — Source Manifest (Private / Internal)

> **Internal only. Do not expose publicly** (not published to README, Pages,
> microsite, Gamma, or the NVIDIA deck). Maps each committed walkthrough asset to
> the surface, deployment, and SHA it was captured from, for provenance and for
> the pre-promotion replacement step. Contains no secrets.

## Status of these assets

**TEMPORARY.** Captured from a **local production build of the committed SHA**
(warm backend: provider=mock, dataset=synthetic) with the guardrails adapter in
live mode. Guardrails and NVIDIA panels reflect a **live** NemoGuard call at
capture time. Per approved direction, these are replaced with screenshots
captured from the **exact combined hosted Preview** before public Production
promotion.

## Capture context

| Field | Value |
| --- | --- |
| Source build | local `next start` production build of the committed integrated SHA |
| Base | Production `37273d1` |
| Backend state | warm — provider=mock, dataset=synthetic, 6 agents |
| Guardrails mode | live (NVIDIA_GUARDRAILS_MODE=live) |
| Capture date | 2026-07-19 |
| Viewport | 1440px width, deviceScaleFactor 2, downscaled to ≤900px |

## Asset → source map

| Committed asset (`apps/web/public/walkthrough-assets/`) | Stage | Source route | Source deployment | Source SHA | Capture date |
| --- | --- | --- | --- | --- | --- |
| `stage-02-todays-mission.png` | 2 · Today's Mission | `/?view=mission` | local prod build | integrated `37273d1`-based | 2026-07-19 |
| `stage-03-mission-continuity.png` | 3 · Mission continuity | `/mission-control` (persona projections) | local prod build | integrated `37273d1`-based | 2026-07-19 |
| `stage-05-nvidia-grounded.png` | 5 · NVIDIA grounded | `/mission-control` (What happened) | local prod build | integrated `37273d1`-based | 2026-07-19 |
| `stage-06-human-approval.png` | 6 · Human approval | `/mission-control` (Approval) | local prod build | integrated `37273d1`-based | 2026-07-19 |
| `stage-07-simulated-execution.png` | 7 · Simulated execution | `/mission-control` (Simulated execution) | local prod build | integrated `37273d1`-based | 2026-07-19 |
| `stage-08-governed-outcome.png` | 8 · Governed outcome | `/mission-control` (Outcome) | local prod build | integrated `37273d1`-based | 2026-07-19 |
| `stage-09-manager-coaching.png` | 9 · Manager Coaching | `/manager` (hero) | local prod build | integrated `37273d1`-based | 2026-07-19 |
| `stage-10-guardrails.png` | 10 · Guardrails | `/guardrails` (NemoGuard classification) | local prod build | integrated `37273d1`-based | 2026-07-19 |

## Replacement checklist (before public Production promotion)

- [ ] Re-capture all eight from the exact combined **hosted Preview** deployment.
- [ ] Confirm no offline/dev banner appears on the hosted `/mission-control`.
- [ ] Confirm no localhost error, no Feature Branch label, no deployment metadata in frame.
- [ ] Keep identical filenames so no code change is required.
- [ ] Update the "Source deployment / SHA / Capture date" columns above to the hosted values.
