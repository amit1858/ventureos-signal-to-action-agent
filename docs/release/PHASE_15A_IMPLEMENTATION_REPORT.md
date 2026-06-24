# Phase 15A — Adaptive Experience Modes (REVISED)

STATUS: READY FOR REVIEW
Revised: 2026-06-22 (post-feedback)
Scope: UX + information architecture (Phase 15A only). Pure visibility-toggle layer.

## Revision rationale

Initial 15A matrix was too aggressive — Executive=4 / Seller=1 / Operations=8 created **three almost-separate products** rather than three tailored experiences. Sellers lost strategic context (CoS, Daily Brief, Pulse) needed to understand *why* an account matters; executives lost the Top Actions / Open Account drill-down needed to act on the brief.

Revised matrix targets **5 / 5 / 8** — balanced density, shared spine of leadership context, mode-specific surfaces hidden only when they are clearly operational/technical.

## Goal

Reduce cognitive load *without* removing critical workflow context. Default = Executive. Persisted in `localStorage` (`s2a_experience_mode_v1`).

Deeper progressive disclosure (accordions, compact-by-default panels, focus-first workspace) is **Phase 15B** scope and intentionally not done here.

## What changed in this revision

| File | Status | Change |
|---|---|---|
| `apps/web/lib/experienceMode.ts` | MOD | Rebalanced `VISIBILITY` matrix; added `MODE_DESCRIPTION`; added analytics-event emission (`experience_mode_changed`) with `previous_mode` / `new_mode` / `timestamp`; hook now passes prior mode into `saveExperienceMode`. |
| `apps/web/components/command/ExperienceModeSwitch.tsx` | MOD | Helper text under the pill row now shows `Label · description` (e.g. `Executive · Portfolio overview and prioritization`). |
| `apps/web/components/command/CommandCenter.tsx` | unchanged from initial 15A | (gates still apply against revised matrix automatically) |

## Revised visibility matrix

| Section | Executive | Seller | Operations |
|---|:-:|:-:|:-:|
| Chief of Staff | ✅ | ✅ | ✅ |
| Daily Brief | ✅ | ✅ | ✅ |
| Portfolio Pulse (Executive Snapshot) | ✅ | ✅ | ✅ |
| Executive Change Brief | ✅ | ✅ | ✅ |
| Recommendation Delta strip | ❌ | ❌ | ✅ |
| Workbench (Work Queue + Account Workspace) | ✅ | ✅ | ✅ |
| Portfolio Intelligence (drift / timeline / external / matrix / health / trends) | ❌ | ❌ | ✅ |
| Trust & Governance (workflow / ledger / manager / CRM readiness) | ❌ | ❌ | ✅ |
| Right-rail aside (Executive Snapshot, Ledger pull-ins) | ✅ | ✅ | ✅ |
| **Visible top-level sections** | **5** | **5** | **8** |

Right rail (`<aside>`) is never gated — Smart Sidebar refactor is Phase 15E scope.

### What each mode is optimized for

- **Executive** — *Portfolio overview and prioritization.*  
  CoS → Brief → Pulse → Change Brief → **Top 5 in workbench → Open Account**.  
  Hides ops surfaces (Portfolio Intelligence, Trust & Governance, delta strip).
- **Seller** — *Account execution and outreach.*  
  Same strategic spine as Executive so the seller still sees *what changed and why this account matters*, then drives into Queue → Workspace → Outreach → CRM Note → Approval.  
  Hides ops surfaces (governance internals, drift analytics, delta tracking).  
  Differentiation from Executive in 15A is mostly **emphasis** via the mode switch and tagline; sharper compact-by-default treatment lands in 15B/15C.
- **Operations** — *System monitoring and governance.*  
  Full surface preserved; no behavioral change vs. pre-15A.

### Why Executive and Seller currently look similar

15A is the *foundation* phase — it establishes the mode primitive and gates the obviously-operational surfaces. The behavioral split between Executive and Seller (compact CoS, collapsed-by-default Pulse for sellers, focus-first workspace) is **Phase 15B/15C/15E** scope per the program plan. This is intentional progressive rollout.

## Switch UI enhancement

The segmented control now displays mode label + description directly beneath the pills:

```
[ ♛ Executive ] [ 💼 Seller ] [ 🔧 Operations ]
Executive · Portfolio overview and prioritization
```

Helper text updates live with the active mode.

## Analytics

Frontend-only `experience_mode_changed` window event emitted on each mode transition. Payload:

```json
{
  "previous_mode": "executive",
  "new_mode": "seller",
  "timestamp": "2026-06-22T13:19:34.819Z"
}
```

Also logged via `console.info("[analytics] experience_mode_changed", …)` for local visibility. No backend, no SDK, no PII. Suppressed when previous === new.

## Validation

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | EXIT 0 |
| `npm run build` | EXIT 0 |
| First Load JS | **187 kB** (unchanged from initial 15A · same baseline) |
| Harness — default mode | ✅ executive |
| Harness — round-trip save/load | ✅ all 3 modes |
| Harness — invalid-value fallback | ✅ → executive |
| Harness — analytics event emitted on transition | ✅ payload shape verified |
| Harness — analytics suppressed on same-mode save | ✅ |
| Harness — revised matrix counts | ✅ executive=5 / seller=5 / operations=8 |
| Harness — descriptions present for all 3 modes | ✅ |
| Harness — `isSectionVisible` helper symmetry | ✅ 24/24 cells |

## Regression — what is unchanged

| Area | State |
|---|---|
| Ranking engine | unchanged |
| Recommendation engine | unchanged |
| Deterministic scoring | unchanged |
| Governance engine | unchanged |
| Approval logic | unchanged |
| Decision Ledger | unchanged |
| Drift engine | unchanged |
| Delta tracking | unchanged |
| Timeline engine | unchanged |
| External Change Detection | unchanged |
| CRM writeback | unchanged |
| HubSpot connector | unchanged |
| Agent orchestration | unchanged |
| BYOK framework | unchanged |
| Backend contracts / `/api/*` endpoints | unchanged |

Pure visibility-toggle layer; every gated component renders identically when its mode allows it to mount.

## Risks

1. **Executive vs Seller feel similar in 15A** — by design. Behavioral differentiation (compact CoS, accordion Pulse, focus-first workspace) is Phase 15B/15C scope. The mode switch + description text + section gating on the ops surfaces still provide a perceptibly cleaner view than pre-15A "everything on, all the time".
2. **SSR hydration flicker** — first paint server-renders Executive defaults; if user has previously selected another mode, brief flicker on hydrate. Acceptable for v1 and mitigated by the always-visible switch.
3. **Analytics event is local-only** — by spec ("Console/local event acceptable"). Future analytics platform integration can subscribe to the existing `experience_mode_changed` window event without code changes.

## Bundle budget

| Phase | First Load JS |
|---|---:|
| 14F (pre-15A baseline) | 186 kB |
| 15A (initial) | 187 kB (+1) |
| **15A (revised)** | **187 kB (held)** |

## Next steps after approval

1. Commit (`Revise Phase 15A: balanced 5/5/8 matrix + analytics + descriptions`) + Co-authored-by trailer
2. Push to GitHub
3. Vercel `vercel --prod --yes` from `apps/web`
4. Live smoke test (verify mode switch toggles + helper text + console analytics event)
5. Update `docs/release/PHASE_15A_DEPLOYMENT_REPORT.md`
6. Begin Phase 15B — Progressive Disclosure (accordion architecture)

---

STATUS: **READY FOR REVIEW** — awaiting approval before commit, push, Vercel, or Phase 15B start.
