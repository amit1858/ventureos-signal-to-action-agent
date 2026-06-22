# RC2 Phase 14E — Deployment Report

**Status: RC2 DEPLOYMENT SUCCESSFUL**

`SAFE TO SHARE WITH KUNI`

## Build identity

| Field | Value |
|---|---|
| Phase | 14E — External System Change Detection |
| Commit | `ce70b65` |
| Previous deployed | `374d207` (14D) |
| Branch | `main` |
| GitHub | https://github.com/amit1858/ventureos-signal-to-action-agent |
| Pushed | `374d207..ce70b65 main -> main` |

## Vercel

| Field | Value |
|---|---|
| Production alias | https://ventureos-signal-to-action-agent.vercel.app |
| Deployment URL | https://ventureos-signal-to-action-agent-8x4wapc58-amit1858s-projects.vercel.app |
| Build | 24s · "Ready in 36s" |
| First Load JS | **184 kB** (held vs 14D) |

## Render backend

| Field | Value |
|---|---|
| Backend URL | https://signal-to-action-api.onrender.com |
| `/api/health` | 200 |
| Provider | mock (mock-deterministic-v1) |
| Data source | hubspot/40 |

## Smoke test

| Check | Result |
|---|---|
| Frontend GET / | 200 |
| Backend GET /api/health | 200 |
| POST /api/recommendations | 10 recommendations, Curefoods #1 |

## Copy refinement verification (live chunk `377.3c85f1f998dff1cc.js`)

All 7 refined strings present in deployed bundle:

- ✅ `What changed in connected systems`
- ✅ `AI agents engaged`
- ✅ `linked to recommendation changes`
- ✅ `Recommendation revised`
- ✅ `Priority moved`
- ✅ `Priority adjusted`
- ✅ `No ranking change required`

## Security

| Check | Result |
|---|---|
| No provider keys committed | ✓ |
| No provider keys in Vercel env | ✓ |
| BYOK browser-session only | ✓ |
| Render env without OPENAI/ANTHROPIC/NVIDIA keys | ✓ |

## Regression

ZERO changes to: ranker · recommendation engine · scoring · governance · approval · Decision Ledger architecture · lifecycle · CRM writeback · HubSpot connector · agent orchestration · BYOK · backend APIs · contracts.

## Known issues

None.

## Deployment recommendation

**RC2 DEPLOYMENT SUCCESSFUL** — Phase 14E live with approved copy refinements. Proceeding to Phase 14F build (Executive Daily Briefing) under the same review-gate model.
