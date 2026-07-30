#!/bin/bash
# Smoke-test the Nemotron-49B NIM endpoint.
#
# From your LAPTOP (after opening the SSH tunnel, default local port 18000):
#   ./test_nemotron_nim.sh
# On the COMPUTE NODE (the NIM serves on 8000 inside the container):
#   API_PORT=8000 ./test_nemotron_nim.sh
# Any host/port:
#   API_HOST=1.2.3.4 API_PORT=8010 ./test_nemotron_nim.sh
set -euo pipefail

API_HOST="${API_HOST:-localhost}"
API_PORT="${API_PORT:-18000}"   # matches the tunnel's default local port
BASE="http://$API_HOST:$API_PORT"

echo "== 1. is the model loaded? =="
curl -s "$BASE/v1/models" | head -c 800; echo; echo

echo "== 2. chat completion (reasoning ON) =="
curl -s "$BASE/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nvidia/llama-3.3-nemotron-super-49b-v1",
    "messages": [
      {"role": "system", "content": "detailed thinking on"},
      {"role": "user", "content": "In one sentence, what is a signal-to-action agent?"}
    ],
    "temperature": 0.6,
    "top_p": 0.95,
    "max_tokens": 512
  }'
echo
