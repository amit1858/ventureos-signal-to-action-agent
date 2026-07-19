# Walkthrough Visual Asset — Source Manifest (Private / Internal)

> **Internal only. Do not expose publicly** (not published to README, Pages,
> microsite, Gamma, or the NVIDIA deck). Maps each committed walkthrough asset to
> the hosted surface, deployment, SHA, and mission state it was captured from, for
> provenance and pre-promotion verification. Contains no secrets.

## Status of these assets

**Hosted.** Every asset is captured from the **exact combined hosted Preview
deployment** `dpl_6nVDnNRJgnBKB3iY653Z8TCfKwmS` (Vercel, target=preview,
SSO-gated) of the `feature/sunday-integrated-walkthrough` branch (base Production
SHA `37273d1`). The mission was driven through **human approval to completion** on
that hosted Preview, so the execution and outcome assets (stages 7 and 8) show the
real **completed** mission state — not a pre-approval placeholder. Guardrails and
NVIDIA panels reflect a **live** hosted NemoGuard / Nemotron call at capture time.
No local build, no offline/dev banner, no Feature Branch label, and no deployment
metadata appears in any frame.

## Capture context

| Field | Value |
| --- | --- |
| Source deployment | `dpl_6nVDnNRJgnBKB3iY653Z8TCfKwmS` (Vercel Preview, target=preview) |
| Base | Production `37273d1` |
| Backend state | hosted Python harness reachable (no offline banner); dataset=synthetic |
| NVIDIA / Guardrails | live hosted path (provider=nim, model nvidia/nvidia-nemotron-nano-9b-v2) |
| Mission driven to | human approval → **completed** (3 actions simulated, receipts, `audit://M-RENEWAL-1/REC-M-RENEWAL-1`) |
| Capture date | 2026-07-19 |
| Viewport | 1440px width, deviceScaleFactor 2, downscaled to ≤900px |

## Asset → source map

| Committed asset (`apps/web/public/walkthrough-assets/`) | Stage | Source route | Source deployment | Source SHA | Mission state | Capture date |
| --- | --- | --- | --- | --- | --- | --- |
| `stage-02-todays-mission.png` | 2 · Today's Mission | `/?view=mission` | `dpl_6nVDnNRJgnBKB3iY653Z8TCfKwmS` | `37273d1` (integrated) | canonical entry (pre-mission) | 2026-07-19 |
| `stage-03-mission-continuity.png` | 3 · Mission continuity | `/mission-control` (Recommended renewal mission) | `dpl_6nVDnNRJgnBKB3iY653Z8TCfKwmS` | `37273d1` (integrated) | pre-approval | 2026-07-19 |
| `stage-05-nvidia-grounded.png` | 5 · NVIDIA grounded | `/mission-control` (Confidence, evidence & provenance) | `dpl_6nVDnNRJgnBKB3iY653Z8TCfKwmS` | `37273d1` (integrated) | pre-approval | 2026-07-19 |
| `stage-06-human-approval.png` | 6 · Human approval | `/mission-control` (Approval) | `dpl_6nVDnNRJgnBKB3iY653Z8TCfKwmS` | `37273d1` (integrated) | pre-approval (approval gate) | 2026-07-19 |
| `stage-07-simulated-execution.png` | 7 · Simulated execution | `/mission-control` (Simulated execution) | `dpl_6nVDnNRJgnBKB3iY653Z8TCfKwmS` | `37273d1` (integrated) | **completed** — 3 actions simulated, receipts | 2026-07-19 |
| `stage-08-governed-outcome.png` | 8 · Governed outcome | `/mission-control` (Outcome) | `dpl_6nVDnNRJgnBKB3iY653Z8TCfKwmS` | `37273d1` (integrated) | **completed** — "Governed work prepared successfully." / "Awaiting external response." | 2026-07-19 |
| `stage-09-manager-coaching.png` | 9 · Manager Coaching | `/manager` (Post-mission Guided Scenario) | `dpl_6nVDnNRJgnBKB3iY653Z8TCfKwmS` | `37273d1` (integrated) | post-completion snapshot | 2026-07-19 |
| `stage-10-guardrails.png` | 10 · Guardrails | `/guardrails` (NemoGuard classification) | `dpl_6nVDnNRJgnBKB3iY653Z8TCfKwmS` | `37273d1` (integrated) | read-only guardrail projection | 2026-07-19 |

## Verification performed at capture (hosted Preview)

- [x] All eight captured from the exact combined **hosted Preview** `dpl_6nVDnNRJgnBKB3iY653Z8TCfKwmS`.
- [x] Mission driven through the two-step human approval to the **completed** state on hosted `/mission-control`.
- [x] No offline/dev banner on hosted `/mission-control` (harness reachable; `offlineBanner=false`).
- [x] No localhost error, no Feature Branch label, no deployment metadata in frame.
- [x] Stages 7 and 8 show the **completed** mission (3 actions simulated + receipts; completed outcome), not a pre-approval placeholder.
- [x] Identical filenames retained — no code change required.
- [x] Idempotent replay of `POST /api/missions/execute` returned the same `audit://M-RENEWAL-1/REC-M-RENEWAL-1` with stable ledger record count.
