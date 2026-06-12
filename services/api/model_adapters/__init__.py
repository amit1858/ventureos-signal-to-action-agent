"""Model adapter factory.

Agents call :func:`get_model_adapter` and never import a concrete provider.
The active provider is chosen by the ``MODEL_PROVIDER`` setting (default ``mock``),
which is the single switch for the NVIDIA-ready path.

Provider taxonomy lives in :mod:`config`:
* ``mock``                       -- deterministic, default, always available.
* ``nvidia`` / ``nim`` / ...     -- live NVIDIA NIM / Nemotron adapter.
* ``openai`` / ``claude``        -- PLACEHOLDERS (see openai_adapter / claude_adapter).
  Selecting one is honoured as a config switch but, until the provider is
  implemented, the factory falls back to the mock adapter and logs a warning so
  the demo can never break on an unimplemented provider.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from config import NVIDIA_PROVIDERS, PLACEHOLDER_PROVIDERS, get_settings
from model_adapters.base import (
    GenerationRequest,
    GenerationTask,
    ModelAdapter,
    ModelResponse,
)
from model_adapters.claude_adapter import ClaudeAdapter
from model_adapters.mock_adapter import MockAdapter
from model_adapters.nvidia_nim_adapter import NvidiaNimAdapter
from model_adapters.openai_adapter import OpenAIAdapter

logger = logging.getLogger("signal_to_action.adapters")

__all__ = [
    "ModelAdapter",
    "GenerationRequest",
    "GenerationTask",
    "ModelResponse",
    "MockAdapter",
    "NvidiaNimAdapter",
    "OpenAIAdapter",
    "ClaudeAdapter",
    "get_model_adapter",
]


@lru_cache(maxsize=4)
def get_model_adapter(provider: str | None = None) -> ModelAdapter:
    """Return the active model adapter (cached per provider name).

    Args:
        provider: override; falls back to the MODEL_PROVIDER setting, then "mock".
    """
    name = (provider or get_settings().model_provider).strip().lower()
    if name in NVIDIA_PROVIDERS:
        return NvidiaNimAdapter()
    if name in PLACEHOLDER_PROVIDERS:
        # OpenAIAdapter / ClaudeAdapter are the future swap points; until they are
        # implemented we serve the deterministic mock so the demo never breaks.
        logger.warning(
            "MODEL_PROVIDER '%s' is a placeholder (not yet implemented); using the mock provider.",
            name,
        )
        return MockAdapter()
    if name != "mock":
        logger.warning("Unknown MODEL_PROVIDER '%s'; using the mock provider.", name)
    return MockAdapter()
