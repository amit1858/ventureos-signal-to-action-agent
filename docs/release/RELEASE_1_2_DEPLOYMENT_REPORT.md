# Release 1.2 Deployment Report

**Release:** 1.1A / 1.2 reviewed build  
**Date:** 2026-06-27  
**Deployed by:** Copilot CLI session

## 1. Git status

| Item | Value |
|---|---|
| Branch | `amit1858-release-1-2-deploy` |
| Release marker commit | `f08e417` |
| Push target | `origin/amit1858-release-1-2-deploy` |
| Push status | Success |

## 2. Validation evidence

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass |
| `npm run build` | Pass |
| Local smoke (`http://127.0.0.1:3100`) | 200 |
| Backend health (`/api/health`) | 200 |

## 3. Vercel production deployment

| Item | Value |
|---|---|
| Vercel project | `amit1858s-projects/web` |
| Deployment ID | `dpl_8E3g7HzSLgCtQivG9TZF1Y4v2fsE` |
| Inspect URL | `https://vercel.com/amit1858s-projects/web/8E3g7HzSLgCtQivG9TZF1Y4v2fsE` |
| Production URL | `https://web-3rb9m29e0-amit1858s-projects.vercel.app` |
| Alias URL | `https://web-opal-pi-76.vercel.app` |
| Build result | Ready |

## 4. Production smoke

| Target | Result |
|---|---|
| `https://web-opal-pi-76.vercel.app` | 200 |
| `https://ventureos-signal-to-action-agent.vercel.app` | 200 |
| `https://signal-to-action-api.onrender.com/api/health` | 200 |

## 5. Regression guardrails

No changes were made to ranking, recommendation engine behavior, governance logic, approval flow, Decision Ledger schema, CRM/HubSpot contracts, or backend API contracts in this release activity.
