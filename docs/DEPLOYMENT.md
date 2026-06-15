# Deployment Guide — Signal-to-Action Agent

This guide covers everything needed to run the product locally and to deploy it for a demo. It is
written so a new engineer can get the app running in well under an hour.

The product has **two deployable parts**:

- **Frontend** — Next.js app in `apps/web` → deploys to **Vercel**.
- **Backend** — FastAPI app in `services/api` → deploys to a **separate Python host**
  (Render / Railway / Azure). Vercel does **not** host the backend.

---

## 1. Local development

### 1a. Backend (FastAPI)

```bash
cd services/api
python -m venv .venv
.venv\Scripts\activate            # Windows
# source .venv/bin/activate       # macOS / Linux
pip install -r requirements.txt
python data/generate_synthetic_data.py
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

The backend is now at **http://127.0.0.1:8000**. Health check: **http://127.0.0.1:8000/api/health**.

### 1b. Frontend (Next.js)

```bash
cd apps/web
npm install
npm run build
npm run start                      # production preview on http://localhost:3000
# npm run dev                      # OR hot-reload dev server
```

Open **http://localhost:3000**.

> **Node version note:** **Node 20 LTS is recommended** for local development. **Node 24 may cause
> Tailwind / Next dev server issues.** If `npm run dev` behaves oddly on Node 24, use `npm run build`
> + `npm run start`, or switch to Node 20 LTS (e.g. via `nvm`).

---

## 2. Environment variables

Never commit a real `.env`. Only the `*.example` templates are tracked in git. Copy them and fill in
your own values.

### Backend (`services/api/.env`, copied from root `.env.example`)

```bash
# Model provider: mock | nvidia
MODEL_PROVIDER=mock

# HubSpot Test CRM (optional connector)
HUBSPOT_ENABLED=true
HUBSPOT_ACCESS_TOKEN=              # private-app token for a TEST portal (never commit)
HUBSPOT_PORTAL_ID=                 # optional, used for record deep-links
HUBSPOT_SYNC_LIMIT=100
HUBSPOT_WRITEBACK_ENABLED=true     # second gate required before any CRM write

# Future model providers (leave blank for the mock demo)
NVIDIA_API_KEY=
OPENAI_API_KEY=

# Outside-In intelligence (optional enrichment layer; default OFF)
EXTERNAL_SIGNALS_ENABLED=false           # true to attach public external context + fusion brief
EXTERNAL_SIGNALS_PROVIDER=mock           # mock | serper | searchapi (live providers fall back to mock)
SERPER_API_KEY=                          # only for EXTERNAL_SIGNALS_PROVIDER=serper (serper.dev)
SEARCHAPI_API_KEY=                        # only for EXTERNAL_SIGNALS_PROVIDER=searchapi (SearchAPI.io)
EXTERNAL_SIGNALS_CACHE_TTL_MINUTES=1440  # cache freshness (once per day for the demo)
EXTERNAL_SIGNALS_REFRESH_LIMIT=10        # max accounts enriched per refresh call

# Backend
DB_PATH=signal_to_action.db
CORS_ORIGINS=*                     # in production, set to your Vercel domain
```

> The repository's `.env.example` ships with `HUBSPOT_ENABLED=false`,
> `HUBSPOT_WRITEBACK_ENABLED=false` and `EXTERNAL_SIGNALS_ENABLED=false` (safe defaults). Set HubSpot
> to `true` only when demoing a real HubSpot **test** portal; set external signals to `true` only to
> show the supporting-context layer (it never changes recommendations).
>
> **Live-search keys are secrets.** `SERPER_API_KEY` / `SEARCHAPI_API_KEY` must live ONLY in
> `services/api/.env` (git-ignored) or your host's environment settings — never commit them, never
> print or log them. To enable live external context on the hosted backend, set
> `EXTERNAL_SIGNALS_ENABLED=true`, `EXTERNAL_SIGNALS_PROVIDER=searchapi` (or `serper`) and the matching
> key in the host's environment (e.g. Render → Environment), then redeploy. With no key, the provider
> falls back to mock automatically — nothing breaks.

### Frontend (`apps/web/.env.local`, copied from `apps/web/.env.local.example`)

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_USER_NAME=             # optional greeting name; leave blank for a generic greeting
```

### Golden rules for secrets

- **Never commit `.env`.** Use the `.env.example` / `.env.local.example` templates.
- **Backend secrets never go to the Vercel frontend.** The HubSpot token is server-side only.
- **The frontend only gets a public API URL** (`NEXT_PUBLIC_API_BASE_URL`).

---

## 3. HubSpot setup

The app works fully on synthetic data with HubSpot disabled. Follow these steps only to demo against
a real HubSpot **test** portal.

1. **Create a HubSpot test / developer account** (never use a production portal).
2. Go to **Settings → Integrations → Private Apps → Create a private app**.
3. Name it `signal-to-action-agent`, select the CRM scopes below, and **create**.
4. **Copy the Service Key (access token).**
5. Paste it into the backend `.env` as `HUBSPOT_ACCESS_TOKEN`, and set `HUBSPOT_ENABLED=true`
   (and `HUBSPOT_WRITEBACK_ENABLED=true` to allow task/note writes).
6. **Restart the backend.**
7. **Test the connection:** `GET /api/integrations/hubspot/status?probe=true`.
8. **Sync HubSpot:** `POST /api/integrations/hubspot/sync` (or click *Sync from HubSpot* in the UI).
9. **Run the workflow** from the Workspace.
10. **Approve a recommendation.**
11. **Write back** a task or note and confirm it appears in HubSpot.

### Required private-app scopes

```
crm.objects.companies.read
crm.objects.companies.write
crm.objects.contacts.read
crm.objects.contacts.write
crm.objects.deals.read
crm.objects.deals.write
crm.objects.owners.read
crm.schemas.companies.read
crm.schemas.companies.write
crm.schemas.contacts.read
crm.schemas.deals.read
```

### Task / note writeback

- **If tasks/notes are available through your key**, approved actions write back as a HubSpot **task**
  or **note** on the company, and the UI shows the external id, timestamp, and a payload preview.
- **If they are not available** (missing scope or restricted portal), the connector **degrades
  gracefully**: the workflow, approval, and ledger still function — only the final external write is
  skipped, with a clear message. No crash, no data loss.

See [`hubspot-integration.md`](hubspot-integration.md) for the full mapping, endpoints, and
error→HTTP behavior.

---

## 4. Production deployment

### 4a. Backend hosting (deploy this first)

Recommended hosts: **Render**, **Railway**, **Azure App Service**, or **Azure Container Apps**.

Requirements:
- Python runtime.
- `pip install -r requirements.txt`.
- Run FastAPI with uvicorn.
- Set the backend environment variables (section 2).
- **Configure CORS** to allow your Vercel frontend domain (`CORS_ORIGINS=https://your-app.vercel.app`).
- **Keep the HubSpot token server-side only.**

Example start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Once deployed, note the public backend URL (e.g. `https://s2a-api.onrender.com`). You will point the
frontend at it.

### 4b. Vercel frontend deployment

> **Vercel hosts the frontend only.** The FastAPI backend must already be deployed and reachable.

**Before you deploy to Vercel:**
- The backend is deployed and reachable over HTTPS.
- `NEXT_PUBLIC_API_BASE_URL` points to the deployed backend URL (not `localhost`).
- The GitHub repo is clean and `npm run build` passes.
- No secrets are present in the frontend environment.

#### Special deployment procedure (use exactly — this machine has a known Git identity issue)

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

**Rules:**
- **Never use `git push` as the deploy trigger on this machine.** Deploy with the procedure above.
- **Never run `vercel deploy --debug`.**
- If `origin` has already been removed, continue without failure — do not try to "fix" Git identity.

#### Common errors

| Symptom | Cause | Fix |
|---------|-------|-----|
| Deployment rejected | Remote still attached | `git remote remove origin`, then deploy |
| `exit 137` | `--debug` flag caused a memory issue | Never use `vercel deploy --debug` |
| `origin` missing | Remote was removed for deploy | `git remote add origin <repo-url>` |
| Stale browser chunks | Cached old build | Hard refresh the browser |

---

## 5. Verifying a deployment

1. **Backend health:** `curl https://<backend-host>/api/health` → `{"status":"ok", ...}`.
2. **Frontend loads:** open the Vercel URL; the landing page renders.
3. **End-to-end:** Enter Command Center → run analysis → approve → (if enabled) write back to HubSpot.
4. **Source switch:** confirm synthetic mode and HubSpot mode both render.

---

## 6. Quick reference

| Thing | Value |
|-------|-------|
| Frontend dev URL | http://localhost:3000 |
| Backend dev URL | http://127.0.0.1:8000 |
| Backend health | `/api/health` |
| Run workflow | `POST /api/recommendations` |
| Recommended Node | 20 LTS |
| Backend run cmd | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Frontend hosts | Vercel |
| Backend hosts | Render / Railway / Azure |
