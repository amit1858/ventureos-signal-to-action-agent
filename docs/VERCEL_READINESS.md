# Vercel Deployment Readiness Checklist

This is the pre-flight checklist to run **before** deploying the Signal-to-Action
Agent frontend to Vercel. Vercel hosts the **frontend only**. The FastAPI backend
is deployed separately (currently on Render).

- **Live backend:** `https://signal-to-action-api.onrender.com`
- **Frontend project root:** `apps/web`
- **GitHub repo:** `https://github.com/amit1858/ventureos-signal-to-action-agent`

> Rule of thumb: the backend must be live and healthy **before** the frontend is
> deployed, because the frontend reads everything (accounts, recommendations,
> HubSpot status) from the backend at runtime.

---

## 1. Required frontend environment variable

Set this in the Vercel project (Settings → Environment Variables), for the
Production environment:

```
NEXT_PUBLIC_API_BASE_URL=https://signal-to-action-api.onrender.com
```

Notes:

- No trailing slash. The client strips one defensively, but keep it clean.
- This is a **public** variable (it ships to the browser). That is expected and
  safe — it is only the backend's public URL.
- **Never** put backend secrets (HubSpot token, OpenAI/NVIDIA keys) in Vercel.
  Those live only in the backend host's environment.

---

## 2. No localhost dependency remains for production ✅

The frontend reads the API base URL from the environment and only falls back to
localhost for **local development**:

```ts
// apps/web/lib/api.ts
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:8000";
```

As long as `NEXT_PUBLIC_API_BASE_URL` is set in Vercel, **no request goes to
localhost in production**. The only other localhost references are dev defaults
(`apps/web/.env.local.example`, `apps/web/Dockerfile` build arg) and do not affect
a Vercel deployment that sets the env var above.

**Action:** confirm the env var is set in Vercel before the first production build.

---

## 3. CORS readiness ✅

The deployed backend returns permissive CORS headers, verified live:

```
GET  /api/health        → access-control-allow-origin: *
OPTIONS /api/recommendations (preflight) → 200
  access-control-allow-methods: GET, POST, ... 
  access-control-allow-headers: content-type
```

So a browser on any `*.vercel.app` (or custom) domain can call the backend.

**Optional hardening (not required for the demo):** to lock CORS to your exact
Vercel domain, set `CORS_ORIGINS` on the **backend** host to the Vercel URL, e.g.
`CORS_ORIGINS=https://your-app.vercel.app`. Leave as `*` for the open demo.

---

## 4. Backend health endpoint ✅

```
GET https://signal-to-action-api.onrender.com/api/health  → 200
```

Returns `status: ok`, `version`, `model_provider`, `data_ready: true`, and (new)
`active_source` so you can see whether the backend is serving `synthetic` or
`hubspot` data at a glance.

---

## 5. HubSpot status endpoint ✅

```
GET  /api/integrations/hubspot/status              → 200  (config snapshot, no network call)
GET  /api/integrations/hubspot/status?probe=true   → 200  (live connectivity check)
```

With `?probe=true` the deployed backend reports `connected: true` and
`writeback_enabled: true` for the configured HubSpot test portal. The frontend "Test connection"
button uses `?probe=true`.

---

## 6. HubSpot sync endpoint ✅

```
POST /api/integrations/hubspot/sync         → 200  (read-only; switches active source to HubSpot)
POST /api/integrations/hubspot/use-synthetic → 200 (revert to synthetic)
```

**New in this release:** if `HUBSPOT_AUTO_SYNC_ON_STARTUP=true` is set on the
backend host, the backend auto-syncs HubSpot at startup, so a cold-started host
serves live CRM data **without** a manual sync. The manual endpoints still work
and are the fallback. Confirm the active source in `/api/meta` → `data_source.source`.

---

## 7. Frontend build command ✅

```
cd apps/web
npm install
npm run build      # must exit 0
npm run start      # optional local production preview
```

Vercel runs `npm run build` automatically. **Node 20 LTS is recommended**
(Node 24 can cause Tailwind / Next dev-server issues). Set the Node version in
Vercel project settings if needed.

---

## 8. Vercel special deployment procedure (this machine)

> This machine has a known Git identity issue. Use this exact procedure. It
> uploads the build via the Vercel CLI, then restores the Git remote and pushes.

```bash
# 1. Detach the remote so Vercel treats this as a CLI upload
git remote remove origin

# 2. Deploy to production
vercel deploy --prod

# 3. Restore the remote
git remote add origin https://github.com/amit1858/ventureos-signal-to-action-agent.git

# 4. Push to GitHub
git push origin main
```

If `origin` is already removed in step 1, continue without failure.

---

## 9. Hard rules and gotchas

- ❌ **Never** use `vercel deploy --debug` (caused an exit-137 / out-of-memory).
- ❌ **Never** rely on `git push` as the deployment trigger on this machine.
- ❌ **Never** attempt to "fix" the Git identity issue or change the deploy strategy.
- ✅ **Backend must be live** before the frontend deploy.
- ⏱️ **Render free-tier cold start:** the backend sleeps after ~15 minutes idle and
  the first request can take 30–60s. Before any demo or deploy verification, "warm"
  it by opening `https://signal-to-action-api.onrender.com/api/health` once and
  waiting for `200`. This is the most likely cause of a one-off "Not Found"/timeout
  in the browser — it is **not** a code or route problem.

---

## Pre-deploy verification (copy/paste)

```bash
# Backend (warm it first; free tier may take up to a minute)
curl https://signal-to-action-api.onrender.com/api/health
curl https://signal-to-action-api.onrender.com/api/meta
curl "https://signal-to-action-api.onrender.com/api/integrations/hubspot/status?probe=true"

# Frontend
cd apps/web && npm run build
```

Green across all of the above → safe to run the Section 8 deployment procedure.
