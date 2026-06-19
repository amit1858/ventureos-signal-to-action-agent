# RC1 HOTFIX BACKLOG

Signal-to-Action Agent · Team VentureOS
Phase: **12.1 — RC1 follow-ups**
Generated: 2026-06-19

> Findings are documented, **not implemented**, per Phase 12.1 spec.
> All P-levels assume the demo audience is an executive / hackathon judge.

---

## P0 — DEMO BLOCKERS

*(None at the time of RC1 audit.)*

The local production build is fully functional. No defect prevents the demo from
running on a localhost laptop.

The only outstanding P0-ish item is operational, not code:

| Item | Impact | Recommendation | Affected component |
|---|---|---|---|
| Vercel not yet deployed | No live URL to share with stakeholders | Run `vercel --prod --yes` from `apps/web/` after `vercel login` + `vercel link`. ~5 min one-time. | Repo / CI |

---

## P1 — SHOULD-FIX BEFORE WIDE RELEASE

| # | Issue | Impact | Recommendation | Affected component |
|---|---|---|---|---|
| P1-01 | `npm run lint` is interactive — no enforced lint gate | Style/dead-code drift over time | Run `npm init @eslint/config@latest` and commit the resulting `.eslintrc.json`. Add `next/core-web-vitals` preset. | Repo tooling |
| P1-02 | Backend hosting story is "run locally + tunnel" | Demo fragility if tunnel drops mid-presentation | Containerize via existing `docker-compose.yml`; deploy on Fly.io / Railway / Render free tier. Update `NEXT_PUBLIC_API_BASE_URL` on Vercel. | `services/api/`, `docker-compose.yml` |
| P1-03 | Approval history not persisted | Refresh loses approval state during a live demo | Persist in `localStorage` (key per `account_id`) — UI-only change, no backend writeback. | `ApprovalDrawer` in `CommandCenter.tsx` |
| P1-04 | At 1024px width, the Executive Snapshot rail stacks above workspace content | Rail loses "sticky" affordance on smaller laptops | Add `lg:` (1024) breakpoint variant: hide rail below `xl:`, replace with a compact top-of-page chip strip. | `CommandCenter.tsx` snapshot rail |
| P1-05 | Screenshot pack not generated | No promotional / submission assets | Run Playwright trace against the deployed URL or capture manually. Store in `release-assets/rc1/`. | Release ops |

---

## P2 — POLISH AND NICE-TO-HAVES

| # | Issue | Impact | Recommendation | Affected component |
|---|---|---|---|---|
| P2-01 | Demo mode coachmarks are modal-only (no visual pointer to the target element) | Slightly weaker onboarding for first-time viewers | Add anchored coachmark spotlights using a portal + bounding-rect highlight. | `DemoModeOverlay` |
| P2-02 | No "skip to content" link for keyboard-only navigation | Mild a11y gap | Add anchor link at top of `<main>` that focus-jumps to the work queue. | `app/page.tsx` or root layout |
| P2-03 | `CrmUpdateTab` follow-up date is computed each render | Tiny re-render cost | Wrap in `useMemo` keyed on `urgency` + `generatedAt`. | `CrmUpdateTab` |
| P2-04 | Approval drawer reviewer name hard-coded to "You (demo)" | Minor realism gap | Read from a future user context; for demo, hard-code is acceptable. | `ApprovalDrawer` |
| P2-05 | `EmptyPanelState` reuses generic CTA "Run analysis" everywhere | Slightly repetitive copy | Pass per-panel verb (e.g. "Pull signals", "Load evidence"). | `EmptyPanelState` consumers |
| P2-06 | NVIDIA NIM adapter is a stub with `TODO(nvidia)` | Visible TODO if someone audits Python | Replace TODO with linked issue once NIM access lands. | `model_adapters/nvidia_nim_adapter.py` |
| P2-07 | Multi-agent panel renders even when only one agent acted | Slight visual noise on simple queries | Hide the panel when `agents_invoked.length <= 1`. | `MultiAgentPanel.tsx` |

---

## CLOSED / ALREADY-ADDRESSED THIS CYCLE

- ✅ Empty states for queue + workspace — fixed in Phase 12.
- ✅ Loading skeletons for queue + workspace — fixed in Phase 12.
- ✅ Cross-account state contamination — verified safe (cockpit `key=account_id`).
- ✅ Demo trigger placement / overlap with bottom bar — fixed in Phase 11.1.
- ✅ Stale email/CRM drafts on account switch — defensive useEffect in place.
- ✅ Workspace tabs not remembered on account switch — by design (Phase 10 spec: "Open Account → Overview tab").

---

## SIGN-OFF

No P0 code defects. P1 items are productionization concerns, not demo blockers.
RC1 is **safe to demo** on a local laptop today and **safe to deploy** as soon
as the manual Vercel/backend steps in `RC1_RELEASE_READINESS.md` are completed.
