"""Model adapter factory.

Agents call :func:`get_model_adapter` and never import a concrete provider.
The active provider is chosen by the ``MODEL_PROVIDER`` environment variable
(default ``mock``), which is the single switch for the NVIDIA-ready path.
"""

from __future__ import annotations

import os
from functools import lru_cache

from model_adapters.base import (
    GenerationRequest,
    GenerationTask,
    ModelAdapter,
    ModelResponse,
)
from model_adapters.mock_adapter import MockAdapter
from model_adapters.nvidia_nim_adapter import NvidiaNimAdapter

__all__ = [
    "ModelAdapter",
    "GenerationRequest",
    "GenerationTask",
    "ModelResponse",
    "MockAdapter",
    "NvidiaNimAdapter",
    "get_model_adapter",
]

_NVIDIA_ALIASES = {"nvidia", "nvidia-nim", "nim", "nemotron"}


@lru_cache(maxsize=4)
def get_model_adapter(provider: str | None = None) -> ModelAdapter:
    """Return the active model adapter (cached per provider name).

    Args:
        provider: override; falls back to MODEL_PROVIDER env, then "mock".
    """
    name = (provider or os.getenv("MODEL_PROVIDER", "mock")).strip().lower()
    if name in _NVIDIA_ALIASES:
        return NvidiaNimAdapter()
    return MockAdapter()
