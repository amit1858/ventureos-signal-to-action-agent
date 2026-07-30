# Sovereign Nemotron Deployment — Overview

**Team:** VentureOS Sovereign Agents · **What this is:** a plain-English summary of how
we stood up our **own** Llama-3.3-Nemotron-Super-49B instance on NVIDIA GPU cloud and
wired the VentureOS Signal-to-Action Agent to run entirely on it.

> For the exact, reproducible commands and every gotcha, see the
> **[Cluster NIM Deployment Guide](./CLUSTER_NIM_DEPLOYMENT.md)**. This page is the
> "what and why" at 10,000 feet; that guide is the "how".

---

## What we set out to do

Run our revenue-agent product on a **self-hosted, sovereign** large language model —
not a shared hosted API — so the whole Signal-to-Action pipeline (ranking accounts,
drafting outreach, writing call scripts) is powered by a model **we control**, on
GPUs **allocated to our team**.

## What we did

1. **Spun up our own model instance on NVIDIA GPU cloud.**
   We provisioned a **2× NVIDIA H100-80GB** allocation on the hackathon Slurm cluster
   (via the Axis gateway) and deployed
   **`nvidia/llama-3.3-nemotron-super-49b-v1`** as an **NVIDIA NIM** container
   (`nvcr.io/nim/nvidia/llama-3.3-nemotron-super-49b-v1`). The NIM auto-selected an
   **FP8 TensorRT-LLM** engine (~26 GB) and served it tensor-parallel across both GPUs.

2. **Ran it as a reproducible batch job.**
   The deploy is a single Slurm `sbatch` job
   ([`scripts/deploy_nemotron_nim.sbatch`](../scripts/deploy_nemotron_nim.sbatch))
   that authenticates to NGC, starts rootless Docker on the compute node, mounts the
   model cache on our team's fast Lustre storage (so restarts are quick), and serves an
   **OpenAI-compatible API** on port 8000. Getting this right meant solving a chain of
   rootless-Docker issues (cache permissions, MPI-as-root, port collisions) — all
   documented in the deployment guide.

3. **Reached it securely from anywhere via an SSH tunnel.**
   `ssh -L localhost:18000:<gpu-node>:8000` brings the model's endpoint to
   `http://localhost:18000/v1` on a laptop — no public exposure of the GPU node.

4. **Pointed the VentureOS app at our own model — config only, no code changes.**
   The backend already had first-class NVIDIA NIM support. Setting
   `MODEL_PROVIDER=nvidia-nim`, `DECISION_PROVIDER=nvidia`,
   `NVIDIA_BASE_URL=http://localhost:18000/v1`, and
   `NVIDIA_MODEL=nvidia/llama-3.3-nemotron-super-49b-v1` (in
   [`services/api/.env`](../services/api/.env)) routed **both** the narrative generator
   and the decision-reasoning layer to our sovereign endpoint.

5. **Containerized the app for local + demo runs.**
   [`docker-compose.yml`](../docker-compose.yml) brings up the whole product — the
   **FastAPI** backend (`api`, port 8000) and the **Next.js** frontend (`web`, port
   3000) — from their Dockerfiles, wired together via env, with a health-checked API
   and an optional volume to persist the SQLite decision ledger across restarts.

6. **Proved it end-to-end.**
   We ran the live pipeline against the sovereign model and confirmed real,
   grounded output persisted to the decision ledger.

---

## The stack we ended up with

| Layer | Technology |
|---|---|
| **Model** | `nvidia/llama-3.3-nemotron-super-49b-v1` (FP8, ~50B params, 128K context) |
| **Serving** | NVIDIA NIM container, OpenAI-compatible API, tensor-parallel on 2× H100 |
| **Infra** | Slurm + rootless Docker on NVIDIA GPU cloud; model cache on Lustre |
| **Backend** | Python **FastAPI** (`services/api/`) — raw OpenAI-compatible client, no heavy SDK |
| **Frontend** | **Next.js / TypeScript** (`apps/web/`) |
| **Persistence** | **SQLite** decision ledger (`signal_to_action.db`) — records every recommendation for audit/approval |
| **Local orchestration** | **Docker Compose** (api + web) |

---

## Results (live run)

A single `POST /api/recommendations` for the **top 10 SMB accounts**, fully powered by
our self-hosted Nemotron:

| Metric | Value |
|---|---|
| Model | `nvidia/llama-3.3-nemotron-super-49b-v1` (self-hosted NIM) |
| Accounts processed | 10 |
| **Total generation time** | **~168 seconds** (~16.8 s/account) |
| Per-account output | priority reason, risk & opportunity summaries, draft email, 5-step call script, voice summary — all grounded in the account's evidence |
| Overall confidence | 0.906 |
| Persisted to ledger | `LDG-646a4d85` → SQLite (`ledgers` + `recommendations`), status `pending_human_approval` |

A sample of the exact output is committed at
[`services/api/db_export_LDG-646a4d85.json`](../services/api/db_export_LDG-646a4d85.json)
(the full ledger + all 10 recommendations, with the model's text and the evidence each
decision used). For comparison, the same pipeline with the deterministic **mock**
provider completes in ~20 ms — the difference is purely the 49B model writing real,
context-grounded narrative instead of templates.

---

## How the pieces fit

```
  Synthetic account signals (CSV/JSON, in-memory)
        │
        ▼
  Deterministic scoring + multi-agent pipeline  ── ranks accounts, picks actions
        │
        ▼
  Sovereign Nemotron-49B NIM  ── writes the human-readable narrative
   (2× H100, via SSH tunnel)      (reasons, emails, call scripts)
        │
        ▼
  SQLite decision ledger  ── records every recommendation for human approval / audit
```

The decision **logic** is deterministic and governable; the model only **phrases** the
decision — it never changes the ranking. Every output is logged and gated behind human
approval before any action is taken.

---

## Where to go next

- **Reproduce the deployment:** [Cluster NIM Deployment Guide](./CLUSTER_NIM_DEPLOYMENT.md) — step-by-step, plus the full gotcha table.
- **Run the app against the model:** set the env in [`services/api/.env`](../services/api/.env) and start the backend (or `docker compose up`).
- **Production hardening (future):** put the SQLite ledger on a persistent volume or migrate to Postgres for multi-instance; keep the model endpoint behind the tunnel or a private gateway.
