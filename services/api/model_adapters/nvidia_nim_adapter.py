"""NVIDIA NIM / Nemotron model adapter -- STUB / integration target.

This adapter is intentionally inert until NVIDIA hackathon access is available.
It implements the exact same :class:`ModelAdapter` interface as the mock adapter,
so enabling it is a one-line switch:

    setx MODEL_PROVIDER nvidia-nim
    setx NVIDIA_API_KEY  nvapi-xxxxxxxx

It targets the OpenAI-compatible NVIDIA NIM endpoint and is written so that, the
moment a valid ``NVIDIA_API_KEY`` is present, the call path below becomes live.
No third-party SDK is required -- we use the standard library so the dependency
surface stays small for the MVP.

==============================================================================
 WHERE NVIDIA PLUGS IN  (see docs/nvidia-integration-plan.md)
==============================================================================
* NVIDIA_API_KEY        -> auth bearer token, read from the environment below.
* NVIDIA_NIM_BASE_URL   -> NIM / build.nvidia.com OpenAI-compatible base URL.
* NVIDIA_NIM_MODEL      -> e.g. a Nemotron instruct model id.
* generate()            -> reasoning + summarization + drafting for top accounts.
* NeMo Agent Toolkit    -> can later replace orchestrator.py (typed tool graph).
==============================================================================
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

from config import get_settings
from model_adapters.base import (
    GenerationRequest,
    GenerationTask,
    ModelAdapter,
    ModelResponse,
)

# Default OpenAI-compatible NVIDIA endpoint. Override via env for NIM microservices.
DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_MODEL = "nvidia/nemotron-4-340b-instruct"

# System prompts per typed task. Reasoning happens GPU-side on Nemotron/NIM.
_SYSTEM_PROMPTS = {
    GenerationTask.priority_reason: (
        "You are a B2B revenue analyst. In 2 sentences, explain why this account is "
        "prioritized. Use only the facts provided. Do not invent data."
    ),
    GenerationTask.risk_summary: (
        "You are a customer-health analyst. Summarize the account's risk in 1-2 plain sentences "
        "using only the provided risk factors."
    ),
    GenerationTask.opportunity_summary: (
        "You are a growth strategist. Summarize the expansion opportunity in 1-2 plain sentences "
        "using only the provided opportunity factors."
    ),
    GenerationTask.email: (
        "You are an SMB account manager. Write a short, warm, professional outreach email. "
        "No jargon. Reference only the provided facts."
    ),
    GenerationTask.call_script: (
        "You are a sales coach. Write a concise 5-step call script (open, reason, value, ask, close)."
    ),
    GenerationTask.voice_summary: (
        "Write one short spoken-style sentence summarizing the account priority and next step."
    ),
}


class NvidiaNimAdapter(ModelAdapter):
    """Same interface as MockAdapter; routes generation to NVIDIA NIM / Nemotron."""

    provider = "nvidia-nim"

    def __init__(self) -> None:
        s = get_settings()
        self.api_key = s.nvidia_api_key
        self.base_url = s.nvidia_base_url
        self.model = s.nvidia_model
        self.timeout = s.nvidia_timeout

    # -- interface --------------------------------------------------------

    def health(self) -> dict:
        configured = bool(self.api_key)
        return {
            "provider": self.provider,
            "model": self.model,
            "ready": configured,
            "base_url": self.base_url,
            "note": "Set NVIDIA_API_KEY to activate. Falls back to mock if MODEL_PROVIDER=mock.",
        }

    def generate(self, request: GenerationRequest) -> ModelResponse:
        if not self.api_key:
            # Fail loud and actionable. The factory defaults to mock so this only
            # triggers when a user explicitly selected nvidia-nim without a key.
            raise RuntimeError(
                "NVIDIA NIM selected (MODEL_PROVIDER=nvidia-nim) but NVIDIA_API_KEY is not set. "
                "Set NVIDIA_API_KEY or switch MODEL_PROVIDER=mock."
            )

        start = time.perf_counter()
        system_prompt = _SYSTEM_PROMPTS.get(request.task, "Be concise and factual.")
        user_prompt = self._build_user_prompt(request)

        # ---- OpenAI-compatible chat completions call (NVIDIA NIM) ----------
        # TODO(nvidia): tune temperature/max_tokens; add streaming + retries;
        # consider response_format=json_schema for structured-output reliability.
        body = json.dumps(
            {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.2,
                "max_tokens": 400,
            }
        ).encode("utf-8")

        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})
            tokens = int(usage.get("total_tokens", 0))
        except (urllib.error.URLError, KeyError, ValueError, TimeoutError) as exc:
            raise RuntimeError(f"NVIDIA NIM request failed: {exc}") from exc

        latency_ms = int((time.perf_counter() - start) * 1000)
        return ModelResponse(
            text=text.strip(),
            provider=self.provider,
            model=self.model,
            tokens=tokens,
            latency_ms=latency_ms,
        )

    # -- helpers ----------------------------------------------------------

    @staticmethod
    def _build_user_prompt(request: GenerationRequest) -> str:
        """Render the deterministic payload into a grounded prompt.

        The payload already contains the *decision*; the model only phrases it.
        This keeps the system governable: the LLM never changes the ranking.
        """
        facts = json.dumps(request.payload, indent=2, default=str)
        return (
            f"Account: {request.account_name}\n"
            f"Task: {request.task.value}\n"
            f"Grounded facts (use only these):\n{facts}\n"
        )
