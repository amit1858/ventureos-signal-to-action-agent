# Deploying Llama-3.3-Nemotron-Super-49B (NVIDIA NIM) on the IAG GPU Cluster

A complete, battle-tested runbook for serving
`nvidia/llama-3.3-nemotron-super-49b-v1` as an OpenAI-compatible API on the
hackathon Slurm cluster (2× H100), plus every gotcha we hit and how each was fixed.

> **⚠️ Secrets policy — read first.** This file is committed to git. It contains
> **no** passwords, API keys, or credentials — only placeholders. Keep real
> secrets in `~/.ngc_api_key` (chmod 600) on the cluster, a password manager, or
> your shell session. **Rotate any NGC key or cluster/Axis password that was ever
> pasted into chat, a screenshot, or a notes file** — treat those as burned.

---

## 0. TL;DR — the happy path

```bash
# --- on your LAPTOP: push the deploy script to the cluster ---
scp scripts/deploy_nemotron_nim.sbatch \
    <AXIS_HASH>@ssh.axisapps.io:'~/Hackathon_Cluster/VentureOS/'

# --- SSH into the cluster ---
ssh ssh.axisapps.io -l <AXIS_HASH>

# --- on the CLUSTER: one-time NGC key + env ---
echo 'nvapi-XXXX' > ~/.ngc_api_key && chmod 600 ~/.ngc_api_key
export IAG_TEAM=iag-team2
export TEAM_SCRATCH=/lustre/fs01/hackathons/teams/$IAG_TEAM

# --- submit on a UNIQUE host port to dodge teammates on :8000 ---
cd ~/Hackathon_Cluster/VentureOS
export HOST_PORT=8010
sbatch deploy_nemotron_nim.sbatch
squeue -u "$USER"                       # note the NODE (e.g. gpu003) — you need it
tail -f slurm-<jobid>.out               # wait for: Uvicorn running on http://0.0.0.0:8000

# --- from your LAPTOP: tunnel to THAT node, then call the API ---
ssh -L localhost:18000:<node>.cm.cluster:<HOST_PORT> ssh.axisapps.io -l <AXIS_HASH>
curl -s http://localhost:18000/v1/models
```

---

## 1. The model

| Property | Value |
|---|---|
| Repo / served name | `nvidia/llama-3.3-nemotron-super-49b-v1` |
| NIM image | `nvcr.io/nim/nvidia/llama-3.3-nemotron-super-49b-v1:latest` |
| Size | ~50B params; NIM auto-selects an **FP8** TensorRT-LLM engine (~26 GB) on H100 |
| GPUs | **2× H100-80GB**, tensor-parallel (auto-detected — no TP env var needed) |
| Context | up to 128K (NIM defaults `max_model_len` ~32768) |
| API | OpenAI-compatible: `/v1/models`, `/v1/chat/completions` on port **8000 inside the container** |
| Reasoning toggle | system prompt `detailed thinking on` / `detailed thinking off` |
| Sampling (reasoning ON) | temperature `0.6`, top_p `0.95` |
| Response shape | reasoning goes in `choices[0].message.reasoning_content`; answer in `.content` |

---

## 2. Cluster access

There are **two** clusters behind the Axis broker — use the right hash:

| Cluster | SSH hash (`-l`) | Login node | Use? |
|---|---|---|---|
| **dgxc** | `<DGXC_AXIS_HASH>` | `slogin002` | ✅ **This one** — has the `primary` partition + H100s |
| curiosity | `<CURIOSITY_AXIS_HASH>` | `bcm11-headnode` | ❌ team not provisioned for a usable partition |

```bash
ssh ssh.axisapps.io -l <DGXC_AXIS_HASH>       # password / SSO via Axis
```

- The `-l` value is your **long 32-hex Axis hash**, not the short "Axis Event Id".
- Axis holds the SSH key inside the broker; you don't get a raw private key file.
- A `bad signature for RSA key` warning on connect is **harmless** — the session
  still succeeds (you'll see the Ubuntu welcome).
- **Golden rule:** never run GPU work on the login node — SSH/edit/copy/job-mgmt only.

### One-time shell setup (persist in `~/.bashrc`)

```bash
cat >> ~/.bashrc <<'EOF'

# IAG hackathon cluster — team storage + helpers
export IAG_TEAM=iag-team2
export TEAM_SCRATCH=/lustre/fs01/hackathons/teams/$IAG_TEAM
export PATH="$HOME/Hackathon_Cluster/bin:$PATH"
EOF
source ~/.bashrc
```

> Team storage is at `/lustre/fs01/hackathons/teams/iag-team2` (the path uses
> `teams/`, **not** `hack_teams/` — that was the other cluster). `iag-healthcheck`
> auto-detects it once `TEAM_SCRATCH` is set.

### Verify the cluster is healthy

```bash
iag-healthcheck      # checks Slurm, storage, a test GPU job, nvidia-smi, rootless Docker, uv
squeue -u "$USER"
sinfo                # you should see the `primary` partition with gpu[003,004,009,010]
```

Green looks like: GPU = `NVIDIA H100 80GB HBM3`, rootless Docker 27.x starts, uv present.

---

## 3. Prerequisites

1. **NGC API key** (separate from cluster/Axis creds). Get it from the model's
   [Deploy tab](https://build.nvidia.com/nvidia/llama-3_3-nemotron-super-49b-v1/deploy)
   → "Get API Key" (or [org.ngc.nvidia.com/setup/api-key](https://org.ngc.nvidia.com/setup/api-key)).
   Save it privately on the cluster:
   ```bash
   echo 'nvapi-XXXX' > ~/.ngc_api_key && chmod 600 ~/.ngc_api_key
   ```
2. A **2-GPU allocation** on `primary` (the script requests `--gres=gpu:2`).
3. **Rootless Docker** — only available inside an allocation (the script loads the
   `rootless-docker` module for you).

---

## 4. Deploy

### 4.1 Copy the script to the cluster (from your laptop)

```bash
scp scripts/deploy_nemotron_nim.sbatch \
    <DGXC_AXIS_HASH>@ssh.axisapps.io:'~/Hackathon_Cluster/VentureOS/'
```
> `scp` uses `user@host`, **not** `-l` (that flag is ssh-only).

### 4.2 Submit (on the cluster)

```bash
cd ~/Hackathon_Cluster/VentureOS
export HOST_PORT=8010          # publish on a UNIQUE port; see gotcha #6
sbatch deploy_nemotron_nim.sbatch
squeue -u "$USER"              # record the NODE in the NODELIST column
tail -f slurm-<jobid>.out
```

Boot sequence in the log (each stage is a gotcha we fixed — see §6):
1. GPUs listed → 2× H100
2. `docker login nvcr.io` → **Login Succeeded**
3. image pull (`Pull complete` × layers) — cached after first run
4. cache check passes (no `NIM_CACHE_PATH` error)
5. model/engine load across GPUs `[0, 1]`
6. **`Uvicorn running on http://0.0.0.0:8000`** ✅ ready

First run downloads the FP8 engine to `$TEAM_SCRATCH/.iag/$USER/nim-cache`
(persists on lustre → fast restarts). Allow ~10–30 min the first time.

### 4.3 Connect from your laptop

Grab the **node** from `squeue`, then tunnel to the **published HOST_PORT**:

```bash
# <node> e.g. gpu003 ; HOST_PORT e.g. 8010 ; local 18000 avoids Windows :8000 reservations
ssh -L localhost:18000:<node>.cm.cluster:<HOST_PORT> ssh.axisapps.io -l <DGXC_AXIS_HASH>
```

Leave that open. In another terminal:

```bash
curl -s http://localhost:18000/v1/models        # -> nvidia/llama-3.3-nemotron-super-49b-v1
```

### 4.4 Generate

```bash
curl -s http://localhost:18000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nvidia/llama-3.3-nemotron-super-49b-v1",
    "messages": [
      {"role": "system", "content": "detailed thinking on"},
      {"role": "user", "content": "In one sentence, what is a signal-to-action agent?"}
    ],
    "temperature": 0.6, "top_p": 0.95, "max_tokens": 512
  }'
```

Split reasoning from answer:
```bash
curl -s ... | jq -r '.choices[0].message.reasoning_content'   # chain-of-thought
curl -s ... | jq -r '.choices[0].message.content'             # final answer
```

For terse output: system message `detailed thinking off` + `"temperature": 0`.

---

## 5. Operations

```bash
# is it up + which node?
squeue -u "$USER" -o "%.10i %.14j %.4t %.10M %.15R"

# hit the NIM directly on its node (bypass tunnel) to prove what it serves
srun --jobid <jobid> --overlap bash -c 'curl -s http://localhost:8000/v1/models'

# see the running container + its published port
srun --jobid <jobid> --overlap bash -c 'module load rootless-docker; docker ps'

# stop it and FREE THE GPUs for teammates
scancel <jobid>       # script's EXIT trap also runs stop_rootless_docker
```

The script writes the exact tunnel line to
`$TEAM_SCRATCH/.iag/$USER/port_forwarding_command.nim` (verify port/hash — it uses
`$USER` if `UNIQUE_AXIS_HASH` isn't exported in the job env).

---

## 6. Gotchas we hit (and the fixes baked into the script)

| # | Symptom | Root cause | Fix (in script unless noted) |
|---|---|---|---|
| 1 | job stays `PENDING`, `uid_..._not_in_group_permitted_to_use_this_partition` | wrong cluster (curiosity) — team not on a usable partition | use **dgxc** hash → `slogin002` |
| 2 | `could not detect a writable team fast-storage directory` | wrong storage path assumed | `TEAM_SCRATCH=/lustre/fs01/hackathons/teams/iag-team2` |
| 3 | `RuntimeError: Unable to read from NIM_CACHE_PATH (/opt/nim/.cache)` | **rootless Docker uid remap** — host uid maps to namespace-root(0); mount shows as `0:65534`; NVIDIA's stock `-u $(id -u)` makes an unmapped, powerless user | **`--user 0`**, and do **not** pass `-u $(id -u)` |
| 4 | `mpirun has detected an attempt to run as root` | `--user 0` runs as root; OpenMPI (used for TP across 2 GPUs) refuses root | `-e OMPI_ALLOW_RUN_AS_ROOT=1 -e OMPI_ALLOW_RUN_AS_ROOT_CONFIRM=1` |
| 5 | `failed to bind port 0.0.0.0:8000: address already in use` | stale container from a prior failed run, or teammate on `:8000` | `docker rm -f nemotron-nim` before run; submit with unique `HOST_PORT` |
| 6 | `/v1/models` returns a **teammate's** model (e.g. `sarvam-30b`) | you share `iag-team2`; both published on host `:8000` on the same node | publish on a **unique `HOST_PORT`** mapped to container `8000` |
| 7 | tunnel `connect failed: Connection refused` | tunneled to the wrong node, or used the container's internal port | tunnel to the node from `squeue`, target the **published HOST_PORT** |
| 8 | laptop `bind [127.0.0.1]:8000: Permission denied` | Windows reserves some port ranges | use a high local port (e.g. `18000`) |
| — | secondary: team dir owned by personal group | `umask 0007` + `mkdir` uses personal group, not `iag-team2` | script `chgrp -R $TEAM .iag` + `chmod 2770/g+rw` (Storage Model doc) |

**Port model in one line:** the NIM always serves on **8000 inside** the container;
`-p HOST_PORT:8000` publishes it on the node; your `ssh -L LOCAL:node:HOST_PORT`
brings it to your laptop. Three ports, don't conflate them.

---

## 7. Alternatives / fallback

- **Free hosted endpoint (no cluster):** `https://integrate.api.nvidia.com/v1`
  with your NGC key as the bearer token — instant OpenAI-compatible access to the
  same model. Good demo backup if the cluster is busy.
- **vLLM instead of NIM:** `pip install vllm`, then
  `python -m vllm.entrypoints.openai.api_server --model nvidia/Llama-3_3-Nemotron-Super-49B-v1 --trust-remote-code --tensor-parallel-size 2 --max-model-len 32768`.

---

## 8. Files

- [`scripts/deploy_nemotron_nim.sbatch`](../scripts/deploy_nemotron_nim.sbatch) — the deploy job (all fixes above)
- [`scripts/test_nemotron_nim.sh`](../scripts/test_nemotron_nim.sh) — endpoint smoke test
