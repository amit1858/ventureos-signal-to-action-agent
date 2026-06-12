"""OpenAI model adapter -- PLACEHOLDER (not yet implemented).

This file marks where an OpenAI-backed provider will plug into the replaceable
model layer. It is intentionally inert: selecting ``MODEL_PROVIDER=openai`` does
**not** make live OpenAI calls today. The factory recognises the name but falls
back to the deterministic mock provider (logging a warning) so the demo can never
break on an unimplemented provider.

Provider strategy (see docs/OPERATIONS.md and .env.example):
* Deterministic facts, scoring, ranking and governance always remain the source
  of truth. A future LLM provider only *phrases* the already-computed decision.
* When implemented, ``generate`` will call the OpenAI Chat Completions API using
  ``OPENAI_API_KEY`` and the per-task system prompts shared with the other
  adapters; ``health`` will report live readiness.
"""

from __future__ import annotations

from config import get_settings
from model_adapters.base import GenerationRequest, ModelAdapter, ModelResponse


class OpenAIAdapter(ModelAdapter):
    """Placeholder for a future OpenAI provider. Not wired into the workflow."""

    provider = "openai"
    model = "openai (placeholder)"

    def __init__(self) -> None:
        self.api_key = get_settings().openai_api_key

    def health(self) -> dict:
        return {
            "provider": self.provider,
            "model": self.model,
            "ready": False,
            "mode": "placeholder",
            "configured": bool(self.api_key),
            "note": (
                "OpenAI provider is a placeholder. The mock provider is used until it is "
                "implemented. Set MODEL_PROVIDER=mock for deterministic narrative."
            ),
        }

    def generate(self, request: GenerationRequest) -> ModelResponse:  # pragma: no cover - placeholder
        raise NotImplementedError(
            "OpenAI provider is not implemented yet. Use MODEL_PROVIDER=mock "
            "(the deterministic engine remains the source of truth)."
        )
