#!/bin/bash -l
#SBATCH --job-name=nemotron-nim
#SBATCH --partition=primary
#SBATCH --gres=gpu:2
#SBATCH --cpus-per-task=16
#SBATCH --time=08:00:00
#SBATCH --output=slurm-%j.out
#
# Deploy nvidia/Llama-3.3-Nemotron-Super-49B-v1 as an NVIDIA NIM on 2x H100.
# Structure mirrors the cluster's samples/docker-job.sbatch (team autodetect +
# rootless-docker module), adapted for a 2-GPU NIM serving job.
#
# PREREQUISITES (once, on the login node):
#   1. Save your NGC API key privately:
#        echo 'nvapi-XXXX' > "$HOME/.ngc_api_key" && chmod 600 "$HOME/.ngc_api_key"
#   2. Confirm the exact NIM image tag from the model's Deploy tab and, if it
#      differs, edit IMAGE below:
#        https://build.nvidia.com/nvidia/llama-3_3-nemotron-super-49b-v1/deploy
#   3. Submit:  iag-submit deploy_nemotron_nim.sbatch   (or sbatch <path>)
#   4. Watch:   tail -f slurm-<jobid>.out

set -euo pipefail
umask 0007

# ---- team detection (verbatim from samples/docker-job.sbatch) --------------
TEAM="${IAG_TEAM:-}"
if [[ -z "$TEAM" ]]; then
    TEAM="$(id -Gn | tr ' ' '\n' | grep -E '^iag-team[0-9]+$' | head -n 1 || true)"
fi
if [[ -z "$TEAM" ]]; then
    echo "Could not detect team. Set IAG_TEAM=iag-team<N> before submitting." >&2
    exit 1
fi

TEAM_SCRATCH="${TEAM_SCRATCH:-/lustre/fs01/hackathons/teams/${TEAM}}"

# storage guard (pattern from samples/jupyter.sbatch)
if [[ ! -d "$TEAM_SCRATCH" || ! -w "$TEAM_SCRATCH" ]]; then
    echo "Team storage not writable: $TEAM_SCRATCH" >&2
    echo "Set TEAM_SCRATCH=/lustre/fs01/hackathons/teams/iag-team<N> before submitting." >&2
    exit 1
fi

# ---- NIM config ------------------------------------------------------------
IMAGE="${IMAGE:-nvcr.io/nim/nvidia/llama-3.3-nemotron-super-49b-v1:latest}"
# The NIM ALWAYS serves on port 8000 INSIDE the container (Uvicorn); an external
# API_PORT does not change that. So the container-side of the -p map is fixed at
# 8000. HOST_PORT is what we publish on the compute node; pick a unique one to
# avoid colliding with teammates sharing the node (they may hold 8000).
NIM_INTERNAL_PORT=8000
HOST_PORT="${HOST_PORT:-${API_PORT:-8000}}"   # host-side published port
EXTERNAL_PORT="${EXTERNAL_PORT:-$HOST_PORT}"  # port to use on your laptop
LOGIN_HOST="${IAG_LOGIN_HOST:-ssh.axisapps.io}"
HASHNUMBER="${UNIQUE_AXIS_HASH:-${USER:-<UNIQUE_AXIS_HASH>}}"
NGC_KEY_FILE="${NGC_KEY_FILE:-$HOME/.ngc_api_key}"
NIM_CACHE="${NIM_CACHE:-$TEAM_SCRATCH/.iag/$USER/nim-cache}"   # weights persist on lustre

# ---- NGC key ---------------------------------------------------------------
if [[ ! -r "$NGC_KEY_FILE" ]]; then
    echo "ERROR: NGC key file not found/readable: $NGC_KEY_FILE" >&2
    echo "Create it: echo 'nvapi-XXXX' > $NGC_KEY_FILE && chmod 600 $NGC_KEY_FILE" >&2
    exit 1
fi
export NGC_API_KEY="$(tr -d '[:space:]' < "$NGC_KEY_FILE")"

mkdir -p "$NIM_CACHE"
# Per the cluster Storage Model docs: team dirs must be group-owned by iag-team<N>
# with setgid (2770), NOT the user's personal group. umask 0007 + mkdir creates
# them under the personal group, which makes the mounted cache unreadable to the
# container and causes: "Unable to read from NIM_CACHE_PATH (/opt/nim/.cache)".
# Reset ownership/perms the way the docs prescribe.
chgrp -R "$TEAM" "$TEAM_SCRATCH/.iag" 2>/dev/null || true
find "$TEAM_SCRATCH/.iag" -type d -exec chmod 2770 {} \; 2>/dev/null || true
find "$TEAM_SCRATCH/.iag" -type f -exec chmod g+rw,o-rwx {} \; 2>/dev/null || true
cd "$TEAM_SCRATCH"

# ---- rootless docker (same pattern as the sample) --------------------------
module load rootless-docker
if command -v start_rootless_docker >/dev/null 2>&1; then
    start_rootless_docker
else
    start_rootless_docker.sh
fi

# stop the daemon on exit — the healthcheck explicitly asks us to release it
cleanup() {
    docker rm -f nemotron-nim 2>/dev/null || true
    if command -v stop_rootless_docker >/dev/null 2>&1; then
        stop_rootless_docker || true
    fi
}
trap cleanup EXIT

NODE_HOST="$(hostname -f 2>/dev/null || hostname)"
echo "Host:         $NODE_HOST"
echo "Image:        $IMAGE"
echo "Team storage: $TEAM_SCRATCH"
echo "NIM cache:    $NIM_CACHE"
echo "GPUs:"
nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader
echo

# ---- authenticate + serve --------------------------------------------------
echo "=== docker login nvcr.io ==="
echo "$NGC_API_KEY" | docker login nvcr.io --username '$oauthtoken' --password-stdin

# Remove any stale container of the same name left by a previous failed run
# (otherwise the --name and the -p 8000 port bind can collide: "address already
# in use"). Safe no-op if none exists.
docker rm -f nemotron-nim 2>/dev/null || true

cat <<EOF

------------------------------------------------------------------
NIM starting on node: $NODE_HOST  (published host port $HOST_PORT -> container 8000)
First run downloads ~100GB into: $NIM_CACHE  (be patient)

From your laptop, run (pick a free LOCAL port if $EXTERNAL_PORT is taken, e.g. 18000):
  ssh -L localhost:${EXTERNAL_PORT}:${NODE_HOST}:${HOST_PORT} ${LOGIN_HOST} -l ${HASHNUMBER}

Then use:
  http://localhost:${EXTERNAL_PORT}/v1/models
  http://localhost:${EXTERNAL_PORT}/v1/chat/completions

Ready when the log shows: Uvicorn running on http://0.0.0.0:8000
------------------------------------------------------------------
EOF

# also drop the tunnel command to a file (same convention as jupyter.sbatch)
TUNNEL_FILE="$TEAM_SCRATCH/.iag/$USER/port_forwarding_command.nim"
echo "ssh -L localhost:${EXTERNAL_PORT}:${NODE_HOST}:${HOST_PORT} ${LOGIN_HOST} -l ${HASHNUMBER}" > "$TUNNEL_FILE"
echo "Tunnel command written to: $TUNNEL_FILE"
echo

# NIM auto-detects both GPUs for tensor parallel. If it does not, add:
#   -e NIM_TENSOR_PARALLEL_SIZE=2
# ROOTLESS Docker: only your host uid (2171) maps into the container's user
# namespace — as uid 0. Every other uid (including the image's default `nim`=1000)
# is unmapped and cannot read/write the lustre mount, which appears owned by
# 0:65534 inside the namespace. So run as `--user 0`: namespace-root IS your host
# account here, and is the only uid that can access the mounted cache. This is safe
# under rootless Docker (no real host root).
#
# BUT running as root makes OpenMPI (which NIM uses via mpirun for tensor-parallel
# across the 2 GPUs) abort with "detected an attempt to run as root". Since this
# "root" is just our unprivileged user under rootless, we set the two documented
# override vars so mpirun proceeds: OMPI_ALLOW_RUN_AS_ROOT[_CONFIRM]=1.
docker run --rm --name nemotron-nim \
    --gpus all \
    --ipc=host \
    --user 0 \
    --ulimit memlock=-1 \
    --ulimit stack=67108864 \
    -e NGC_API_KEY \
    -e NIM_CACHE_PATH=/opt/nim/.cache \
    -e HOME=/opt/nim \
    -e OMPI_ALLOW_RUN_AS_ROOT=1 \
    -e OMPI_ALLOW_RUN_AS_ROOT_CONFIRM=1 \
    -v "${NIM_CACHE}:/opt/nim/.cache" \
    -p "${HOST_PORT}:${NIM_INTERNAL_PORT}" \
    "$IMAGE"
