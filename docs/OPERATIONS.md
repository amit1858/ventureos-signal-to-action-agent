# Operations Guide — Signal-to-Action Agent (Backend)

This is the practical guide to running, debugging and trusting the backend in production. It is
written so a new engineer can understand how the system behaves — at startup, during a sync, and when
something goes wrong — in **under ten minutes**, without reading the source code.

For the conceptual architecture (agents, scoring, reasoning), see [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 1. The one-paragraph mental model

The backend is a FastAPI app that serves **ranked, explainable, human-approved actions** built from
either a local **synthetic dataset** (always available, offline) or a **HubSpot test CRM** (live). The
**deterministic engine is the source of truth** — the model provider only writes the narrative. The
design goal of this guide is reliability: the app should start fast, never crash because a data source
is down, keep its data fresh safely, and always be easy to debug.

---

## 2. Configuration (one place, validated)

Every environment variable is read **once**, in one file: `services/api/config.py`. Components ask for
a single `Settings` object instead of reading the environment directly. This means there is exactly
one place to see the whole runtime contract, and the values are validated at startup.

- Missing or questionable configuration produces a **warning at startup** (and is visible at
  `/api/system/config`) — it never crashes the app.
- Secrets are **never** printed. The config endpoint reports only whether a credential is *present*.

See [`.env.example`](../.env.example) for the full annotated list. The most important variables:

| Variable | Default | What it does |
|----------|---------|--------------|
| `MODEL_PROVIDER` | `mock` | Which narrative provider. `mock` (default, wired), `nvidia` (stub), `openai`/`claude` (placeholders → fall back to mock). |
| `CORS_ORIGINS` | `*` | Allowed browser origins. Set to your Vercel domain in production. |
| `LOG_LEVEL` | `INFO` | Log verbosity (`DEBUG`/`INFO`/`WARNING`/`ERROR`). |
| `DB_PATH` | `signal_to_action.db` | SQLite decision-ledger path. |
| `HUBSPOT_ENABLED` | `false` | Master switch for the HubSpot connector. |
| `HUBSPOT_ACCESS_TOKEN` | — | HubSpot private-app token (Bearer). Test portals only. |
| `HUBSPOT_WRITEBACK_ENABLED` | `false` | Second gate before any write to HubSpot. |
| `HUBSPOT_AUTO_SYNC_ON_STARTUP` | `false` | Sync HubSpot in the background at boot (recommended on hosted demos). |
| `HUBSPOT_REFRESH_INTERVAL_SECONDS` | `0` (off) | If > 0, periodically refresh HubSpot data. Recommended: `900`. |

---

## 3. Startup lifecycle

Boot is **narrated** in the logs so you can see exactly what happened. A healthy startup with HubSpot
enabled looks like this:

```
Application starting (version 0.1.0)...
Loading configuration...
[Config warnings, if any]
Model provider ready: mock (mock-deterministic-v1).
Decision ledger ready (sqlite: signal_to_action.db).
Checking HubSpot configuration...
HubSpot auto-sync enabled; starting background sync thread.
Background refresh scheduler started: every 900 seconds.   (only if enabled)
Backend ready.
HubSpot connection configured; synchronizing companies, contacts and deals...
Loaded 40 companies, 71 contacts, 28 deals, 83 activities from HubSpot.
Active source is now the HubSpot test CRM.
```

Key property: **the server binds and answers health checks immediately ("Backend ready")**. The
HubSpot sync runs in a background thread, so a slow or unreachable CRM never delays startup. Until the
sync finishes (a few seconds later), the app serves synthetic data.

---

## 4. Sync lifecycle

There are three ways the active dataset becomes HubSpot:

1. **Startup auto-sync** — if `HUBSPOT_AUTO_SYNC_ON_STARTUP=true` and the connector is enabled +
   configured. Runs once, in the background, at boot.
2. **Manual sync** — `POST /api/integrations/hubspot/sync` (the UI "Sync" button).
3. **Background refresh** — if `HUBSPOT_REFRESH_INTERVAL_SECONDS > 0` (see §6).

All three call the **same** read-only sync routine (`_perform_hubspot_sync`), so they can never drift.
A sync **reads** HubSpot companies (plus mapped contacts/deals/activities), maps them to the internal
schema, and swaps them in as the active dataset. Syncing **never** seeds data and **never** writes back
tasks or notes — those are separate, approval-gated, write-enabled actions.

The swap is **atomic**: the whole new dataset is installed under a lock as a single reference, so a
request thread always reads an internally-consistent snapshot — never a half-updated mix.

---

## 5. Failure handling (self-healing / graceful degradation)

The app prefers live data but degrades gracefully and **never crashes** because a source is down:

```
HubSpot available        →  serve HubSpot data
   else
HubSpot cache available   →  serve the last successful HubSpot dataset
   else
Synthetic dataset present →  serve synthetic data
   else
                          →  clear 503 with an actionable message ("run generate_synthetic_data.py")
```

- If a sync fails (auth, network, rate limit), the failure is **logged with a clear reason** and the
  app **keeps whatever data it already had** (it does not blank out or crash).
- The synthetic dataset is the always-available floor; the final 503 only happens if even the
  synthetic files are missing (a deployment mistake) — and it tells you exactly how to fix it.
- Tokens never appear in logs or error messages.

---

## 6. Background refresh (optional, off by default)

To keep a long-running backend from serving stale numbers, set
`HUBSPOT_REFRESH_INTERVAL_SECONDS` to a positive value (e.g. `900` for 15 minutes). When enabled, **one**
daemon thread re-syncs on that cadence. It is intentionally conservative:

- **Single instance.** It can never spawn a second scheduler (no thread explosion, no duplicate syncs).
- **Clean shutdown.** It sleeps on an event, so it stops immediately when the app shuts down.
- **Never downgrades.** On any refresh failure it keeps the last-good data and logs a warning.
- **Respects the operator.** If someone has switched the source to synthetic (e.g. to demo offline
  mode), the refresh skips rather than yanking them back to HubSpot.

Check its state any time at `/api/system/threads` (runs, failures, last run, last error).

---

## 7. Provider architecture

The workflow never imports a model vendor directly. Agents depend only on a provider-neutral interface
(`model_adapters/base.py`); a factory returns the active adapter based on `MODEL_PROVIDER`:

| `MODEL_PROVIDER` | Behaviour today |
|------------------|-----------------|
| `mock` (default) | Deterministic narrative, no API key, no network. |
| `nvidia` / `nim` / `nemotron` | Routes narrative to the NVIDIA NIM / Nemotron adapter (needs `NVIDIA_API_KEY`). |
| `openai` | **Placeholder.** Recognised, but falls back to mock with a logged warning until implemented. |
| `claude` / `anthropic` | **Placeholder.** Same safe fallback. |
| anything else | Falls back to mock with a warning. |

Because the default is `mock` and unimplemented providers fall back safely, **selecting a provider can
never break the demo**. The deterministic engine remains the source of truth in every case.

---

## 8. Debugging guide

Three read-only endpoints are the single source of truth for a running instance. None of them expose
secrets.

| Endpoint | Use it to answer |
|----------|------------------|
| `GET /api/system/status` | "What version is running, how long has it been up, what data source and model are active, how many records, is it healthy?" Add `?probe=true` for a live HubSpot connectivity check. |
| `GET /api/system/config` | "What configuration is this instance actually using, and are there any warnings?" (secrets shown only as present/absent) |
| `GET /api/system/threads` | "Are the background threads healthy? Is the refresh scheduler running, and when did it last succeed or fail?" |
| `GET /api/health` | Lightweight liveness for platform health checks (also reports the active source). |
| `GET /api/integrations/hubspot/status?probe=true` | "Is the HubSpot token valid right now?" |

**First moves when something looks wrong**
1. `GET /api/system/status` — confirm version, `source`, `provider`, `data_ready`, `last_sync`.
2. If on synthetic when you expected HubSpot — check the **startup logs** for the auto-sync warning,
   and `GET /api/system/config` for `hubspot_enabled` / `hubspot_configured`.
3. If data looks stale — `GET /api/system/threads` for the refresh scheduler's `last_success_at` /
   `last_error`, or trigger `POST /api/integrations/hubspot/sync`.

---

## 9. Production-safety guarantees

The backend is built so the following are **structurally** true:

- No blocking startup — the CRM sync is always off the boot path.
- No duplicate syncs or schedulers — single-instance guards.
- No thread explosion or leaks — daemon threads, event-based sleep, clean shutdown join.
- No race conditions on the active dataset — atomic, lock-guarded source swaps.
- No infinite retries — sync uses bounded backoff on transient errors only.
- No secrets in logs or responses — tokens are never logged, returned, or put in error messages.
- No autonomous CRM writes — every write needs `HUBSPOT_WRITEBACK_ENABLED=true` **and** human approval.

---

## 10. Deployment considerations

- **Backend** runs on Render / Railway / Azure (FastAPI + uvicorn). **Frontend** runs on Vercel and
  only ever gets a public API URL (`NEXT_PUBLIC_API_BASE_URL`) — no secrets.
- The **HubSpot token lives only on the backend host**, never in the frontend or Vercel.
- On free tiers that cold-start (e.g. Render), set `HUBSPOT_AUTO_SYNC_ON_STARTUP=true` so a restarted
  instance serves live data without a manual sync; consider `HUBSPOT_REFRESH_INTERVAL_SECONDS=900` to
  keep it fresh. Expect a few seconds of synthetic data immediately after a cold start while the
  background sync completes.
- Set `CORS_ORIGINS` to your Vercel domain in production.

Step-by-step instructions: [`DEPLOYMENT.md`](DEPLOYMENT.md) and [`VERCEL_READINESS.md`](VERCEL_READINESS.md).

---

## 11. Roadmap pointers

- **Data sources (Phase G):** Salesforce, Dynamics, CSV, database/lakehouse can slot behind the same
  vendor-neutral connector interface — no engine or UI changes. See [`ARCHITECTURE.md`](ARCHITECTURE.md) §11.
- **Reasoning (Phase J):** a future LLM slots behind a reasoning orchestrator + provider interface; the
  frontend stays unaware of the provider. The deterministic engine keeps owning ranking and governance.
- See [`ROADMAP.md`](ROADMAP.md) for the broader plan.
