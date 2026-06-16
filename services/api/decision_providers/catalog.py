"""Curated model catalog per decision provider (Phase 5.0A.1).

A non-technical PM should never have to know a model identifier. The UI picks
display names from this catalog and only sends the technical ``model_id`` on
the wire. The catalog is **advisory**: a session credential may still carry an
arbitrary ``model`` override (used by power users and tests). When a provider
exposes a model-listing API in the future, ``fetch_remote_models`` will replace
the static list at runtime and the catalog here becomes the fallback.

No keys are read or returned here. This module has no I/O.
"""

from __future__ import annotations

from typing import Dict, List, Optional, TypedDict


class ModelEntry(TypedDict, total=False):
    id: str           # technical model identifier sent on the wire
    display: str      # human-friendly label for the dropdown
    tier: str         # marketing tier (e.g. "flagship", "balanced", "fast")
    description: str  # one-line hint shown next to the option
    recommended: bool # one default per provider


# Curated, intentionally short list — one option per "tier" the provider sells.
# Keep IDs aligned with the providers' current public model names. IDs that go
# stale show up as a clean "model_not_found" diagnostic in the UI, so refreshing
# this catalog is the only fix needed.
_CATALOG: Dict[str, List[ModelEntry]] = {
    "openai": [
        {
            "id": "gpt-4.1",
            "display": "GPT-4.1",
            "tier": "flagship",
            "description": "Highest-quality reasoning. Best for complex executive briefs.",
        },
        {
            "id": "gpt-4o",
            "display": "GPT-4o",
            "tier": "balanced",
            "description": "Strong reasoning at lower cost. Good default for comparison runs.",
        },
        {
            "id": "gpt-4o-mini",
            "display": "GPT-4o Mini",
            "tier": "fast",
            "description": "Fastest and cheapest. Recommended for demos.",
            "recommended": True,
        },
    ],
    "anthropic": [
        {
            "id": "claude-sonnet-4-20250514",
            "display": "Claude Sonnet 4",
            "tier": "balanced",
            "description": "Balanced quality and latency. Recommended for BYOK demos.",
            "recommended": True,
        },
        {
            "id": "claude-opus-4-20250514",
            "display": "Claude Opus 4",
            "tier": "flagship",
            "description": "Highest-quality reasoning in the Claude 4 family.",
        },
        {
            "id": "claude-3-5-haiku-latest",
            "display": "Claude 3.5 Haiku",
            "tier": "fast",
            "description": "Lowest latency Claude. Best for quick comparisons.",
        },
    ],
    "nvidia": [
        {
            "id": "nvidia/nemotron-4-340b-instruct",
            "display": "Nemotron 4 340B Instruct",
            "tier": "flagship",
            "description": "NVIDIA's flagship reasoning model. Recommended.",
            "recommended": True,
        },
        {
            "id": "meta/llama-3.1-70b-instruct",
            "display": "Llama 3.1 70B Instruct",
            "tier": "balanced",
            "description": "Open Llama 3.1 served on NIM. Good balanced option.",
        },
        {
            "id": "mistralai/mixtral-8x22b-instruct-v0.1",
            "display": "Mixtral 8x22B Instruct",
            "tier": "fast",
            "description": "Mixture-of-experts model served on NIM. Fast and cost-friendly.",
        },
    ],
}


def catalog() -> Dict[str, List[ModelEntry]]:
    """Return a defensive copy of the static catalog (UI consumes via /api)."""
    return {provider: [dict(m) for m in models] for provider, models in _CATALOG.items()}


def models_for(provider: str) -> List[ModelEntry]:
    """List of curated models for one provider id (empty for unknown providers)."""
    return [dict(m) for m in _CATALOG.get((provider or "").lower(), [])]


def recommended_model(provider: str) -> str:
    """The recommended technical ``model_id`` for one provider, or ``""``."""
    for m in _CATALOG.get((provider or "").lower(), []):
        if m.get("recommended"):
            return m.get("id", "")
    items = _CATALOG.get((provider or "").lower(), [])
    return items[0].get("id", "") if items else ""


def is_known_model(provider: str, model_id: str) -> bool:
    """True when ``model_id`` appears in the curated list for ``provider``."""
    mid = (model_id or "").strip()
    if not mid:
        return False
    return any(m.get("id") == mid for m in _CATALOG.get((provider or "").lower(), []))


def display_for(provider: str, model_id: str) -> Optional[str]:
    """Human label for a model id, or ``None`` when it isn't in the catalog."""
    mid = (model_id or "").strip()
    for m in _CATALOG.get((provider or "").lower(), []):
        if m.get("id") == mid:
            return m.get("display")
    return None
