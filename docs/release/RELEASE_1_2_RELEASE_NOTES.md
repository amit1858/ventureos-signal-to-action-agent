# Release 1.2 Notes (Release 1.1A / 1.2 Build)

**Date:** 2026-06-27  
**Status:** Released to production

## Summary

Release 1.2 ships the current reviewed build with no functional changes to core decisioning and governance systems.

## Validation snapshot

- `npx tsc --noEmit` (apps/web): pass
- `npm run build` (apps/web): pass
- Local smoke (`next start` + HTTP check): pass
- Backend health (`/api/health` on Render): pass
- Production smoke (Vercel URL + canonical URL): pass

## Protected invariants (unchanged)

- ranking
- recommendation engine
- governance
- approval workflow
- Decision Ledger schema
- CRM / HubSpot contracts
- backend APIs

## Deployment

- Vercel production deployment completed.
- Deployment URL: `https://web-3rb9m29e0-amit1858s-projects.vercel.app`
- Alias URL: `https://web-opal-pi-76.vercel.app`
- Canonical app URL health check: `https://ventureos-signal-to-action-agent.vercel.app` (HTTP 200)
- Backend health: `https://signal-to-action-api.onrender.com/api/health` (HTTP 200)
