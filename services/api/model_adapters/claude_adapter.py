"""Anthropic Claude model adapter -- PLACEHOLDER (not yet implemented).

Marks where an Anthropic Claude provider will plug into the replaceable model
layer. Inert today: selecting ``MODEL_PROVIDER=claude`` (or ``anthropic``) does
**not** make live calls. The factory recognises the name but falls back to the
deterministic mock provider (logging a warning) so the demo can never break.

When implemented, ``generate`` will call the Anthropic Messages API using
``ANTHROPIC_API_KEY`` and the shared per-task system prompts; the deterministic
engine still owns scoring, ranking, evidence and governance.
"""

from __future__ import annotations

from config import get_settings
from model_adapters.base import GenerationRequest, ModelAdapter, ModelResponse


class ClaudeAdapter(ModelAdapter):
    """Placeholder for a future Anthropic Claude provider. Not wired in yet."""

    provider = "claude"
    model = "claude (placeholder)"

    def __init__(self) -> None:
        self.api_key = get_settings().anthropic_api_key

    def health(self) -> dict:
        return {
            "provider": self.provider,
            "model": self.model,
            "ready": False,
            "mode": "placeholder",
            "configured": bool(self.api_key),
            "note": (
                "Claude provider is a placeholder. The mock provider is used until it is "
                "implemented. Set MODEL_PROVIDER=mock for deterministic narrative."
            ),
        }

    def generate(self, request: GenerationRequest) -> ModelResponse:  # pragma: no cover - placeholder
        raise NotImplementedError(
            "Claude provider is not implemented yet. Use MODEL_PROVIDER=mock "
            "(the deterministic engine remains the source of truth)."
        )
