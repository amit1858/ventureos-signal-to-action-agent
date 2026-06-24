# Phase 15B + 15C + 15C.5 Deployment Report

## Summary

Single source of truth account routing shipped to production.

- **Commit:** `1260a93` (range `592ddfc..1260a93` on `main`)
- **Production URL:** https://ventureos-signal-to-action-agent.vercel.app
- **Deployment URL:** https://ventureos-signal-to-action-agent-52u6likvg-amit1858s-projects.vercel.app
- **Backend:** https://signal-to-action-api.onrender.com (HubSpot live, 99 accounts / 108 signals)

## Build

Local Next.js build was hanging on Windows (AV/OneDrive locking `.next`). Vercel built remotely
without issue:

- Next.js 14.2.35, ✓ Compiled successfully
- First Load JS: 194 kB (was 186 kB pre-15C; +8 kB for routing context + new components)
- Build time: 23s, deploy ready in 35s.

## Smoke results

| Surface | Result |
| --- | --- |
| Frontend GET / | 200 (37,577 bytes) |
| Backend /api/health | 200 (active_source=hubspot, data_ready=true, mock provider) |
| Backend /api/meta | 200 (99 accounts) |
| POST /api/recommendations | 200, 10 recs, top Tessera DocOnline #1 (conf 0.906) |
| Bundle string scan (`page-255ecc5f3b1bd1fe.js`, 408 KB) | "Executive Attention", "accountSelectionContext", "Portfolio Pulse", "Executive Daily Brief" all present |

## Routing matrix (carried from 15C.5B local green)

| Surface | Result |
| --- | --- |
| Portfolio Pulse / Most Significant Risk | PASS |
| Portfolio Pulse / Most Significant Opportunity | PASS |
| Portfolio Pulse / Immediate Attention | PASS |
| Portfolio Pulse / Highest Priority Affected | PASS |
| Recommendation Queue | PASS |
| Executive Attention Brief | PASS |
| Executive Change Brief / Risk Increases | Informational-only (zero-count, pass) |
| Executive Change Brief / Opportunity Moves | Informational-only |
| Executive Change Brief / Entered Queue | Informational-only |
| Executive Change Brief / Left Queue | Informational-only |

Production smoke verified the routing-context strings are present in the deployed JS chunk; full
production Playwright re-run was not executed because `[account-routing]` traces are dev-only and
the local matrix was green at `592ddfc..1260a93`'s parent tree state. Backend contract unchanged.

## Invariants honored

ZERO changes to: ranking, scoring, confidence, governance, approvals, Decision Ledger, lifecycle,
drift, delta, timeline, external change, CRM, HubSpot, agents, BYOK, backend, or contracts.

## Safe-to-share

**Yes** — production is live, smoke is green, no provider keys deployed, BYOK remains
sessionStorage-only.
