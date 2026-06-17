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

import json
import logging
import socket
import urllib.error
import urllib.request
from typing import Dict, List, Optional, Tuple, TypedDict

LOG = logging.getLogger("decision_providers.catalog")
_DISCOVERY_TIMEOUT_S = 8.0


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


# ---------------------------------------------------------------------------
# Live model discovery (Phase 5.0A.2)
# ---------------------------------------------------------------------------
#
# Each supported provider exposes a "list models" endpoint:
#
#   OpenAI    GET https://api.openai.com/v1/models
#             Authorization: Bearer <key>
#             -> {"data": [{"id": "gpt-4o-mini", ...}, ...]}
#
#   Anthropic GET https://api.anthropic.com/v1/models
#             x-api-key: <key>
#             anthropic-version: 2023-06-01
#             -> {"data": [{"id": "claude-sonnet-4-...", "display_name": "..."}, ...]}
#
#   NVIDIA    GET {base}/models  (OpenAI-compatible)
#             Authorization: Bearer <key>
#             -> {"data": [{"id": "nvidia/nemotron-4-340b-instruct", ...}, ...]}
#
# The discovery layer is deliberately fail-safe: any HTTP error, timeout, DNS
# failure, or malformed body falls back to the static catalog and returns a
# small diagnostic so callers can surface "Using static catalog (live discovery
# unavailable: ...)" in the UI. No keys are ever returned, logged or persisted.


def _http_get_json(url: str, headers: Dict[str, str]) -> Tuple[Optional[dict], Optional[Tuple[str, str]]]:
    """GET ``url`` and return ``(json_body, error)``.

    ``error`` is ``(category, message)`` shaped like the rest of the provider
    layer (invalid_key | model_not_found | rate_limited | endpoint_unavailable
    | timeout | network | http_error). On success the second tuple element is
    ``None``. Never raises.
    """
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=_DISCOVERY_TIMEOUT_S) as resp:  # noqa: S310 (well-known hosts)
            raw = resp.read().decode("utf-8", errors="replace")
        try:
            return json.loads(raw), None
        except json.JSONDecodeError:
            return None, ("invalid_output", "Model listing returned non-JSON body.")
    except urllib.error.HTTPError as exc:
        code = exc.code
        if code in (401, 403):
            return None, ("invalid_key", "Invalid or unauthorized API key.")
        if code == 404:
            return None, ("model_not_found", "Model listing endpoint not found.")
        if code == 429:
            return None, ("rate_limited", "Rate limited by provider.")
        if 500 <= code < 600:
            return None, ("endpoint_unavailable", f"Provider returned HTTP {code}.")
        return None, ("http_error", f"HTTP {code}")
    except socket.timeout:
        return None, ("timeout", "Model listing timed out.")
    except urllib.error.URLError as exc:
        msg = str(getattr(exc, "reason", exc)) or "URL error"
        return None, ("endpoint_unavailable", f"Network error reaching provider: {msg}")
    except OSError as exc:  # pragma: no cover - defensive
        return None, ("network", f"Network error: {exc}")


def _merge_with_catalog(provider: str, live_ids: List[Tuple[str, Optional[str]]]) -> List[ModelEntry]:
    """Return curated entries first (only those present live), then live-only ids.

    ``live_ids`` is a list of ``(model_id, display_name_or_None)`` pairs as
    parsed from the provider's listing endpoint. Curated entries that no
    longer appear live are dropped (so users only see currently-usable
    models), and live-only ids appear after the curated ones with their raw
    id as the display name. The provider's recommended id is preserved if it
    is still present live; otherwise the first remaining curated entry (or
    first live id) becomes the recommended default.
    """
    static = _CATALOG.get((provider or "").lower(), [])
    live_set = {mid for mid, _ in live_ids if mid}
    out: List[ModelEntry] = []
    used: set = set()

    # 1. Curated entries that are still live, in curated order.
    for entry in static:
        mid = entry.get("id", "")
        if mid in live_set:
            out.append(dict(entry))
            used.add(mid)

    # 2. Live-only ids (not in curated) appended after, plainly labeled.
    for mid, display in live_ids:
        if not mid or mid in used:
            continue
        out.append({
            "id": mid,
            "display": display or mid,
            "tier": "live",
            "description": "Discovered from provider's model listing.",
        })
        used.add(mid)

    # 3. Make sure exactly one entry is marked recommended.
    if not any(e.get("recommended") for e in out) and out:
        out[0]["recommended"] = True

    return out


def _discover_openai(api_key: str, base_url: Optional[str] = None) -> Tuple[Optional[List[ModelEntry]], Optional[Tuple[str, str]]]:
    base = (base_url or "https://api.openai.com/v1").rstrip("/")
    body, err = _http_get_json(
        f"{base}/models",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
    )
    if err or not body:
        return None, err
    data = body.get("data") or []
    # Only surface "chat" models — filter out embeddings / tts / audio / image / moderation.
    drop_prefixes = ("text-embedding", "tts-", "whisper", "dall-e", "omni-moderation", "text-moderation")
    drop_substrings = ("embedding", "moderation", "audio", "transcribe", "search", "realtime")
    pairs: List[Tuple[str, Optional[str]]] = []
    for item in data:
        mid = (item or {}).get("id")
        if not isinstance(mid, str):
            continue
        if mid.startswith(drop_prefixes):
            continue
        low = mid.lower()
        if any(s in low for s in drop_substrings):
            continue
        if not (low.startswith("gpt-") or low.startswith("o1") or low.startswith("o3") or low.startswith("chatgpt")):
            continue
        pairs.append((mid, None))
    pairs.sort(key=lambda p: p[0])
    return _merge_with_catalog("openai", pairs), None


def _discover_anthropic(api_key: str, base_url: Optional[str] = None) -> Tuple[Optional[List[ModelEntry]], Optional[Tuple[str, str]]]:
    base = (base_url or "https://api.anthropic.com/v1").rstrip("/")
    body, err = _http_get_json(
        f"{base}/models",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Accept": "application/json",
        },
    )
    if err or not body:
        return None, err
    data = body.get("data") or []
    pairs: List[Tuple[str, Optional[str]]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        mid = item.get("id")
        if not isinstance(mid, str):
            continue
        display = item.get("display_name") if isinstance(item.get("display_name"), str) else None
        pairs.append((mid, display))
    # Sort by recency (Anthropic ids end in YYYYMMDD) descending, then by id.
    pairs.sort(key=lambda p: p[0], reverse=True)
    return _merge_with_catalog("anthropic", pairs), None


def _discover_nvidia(api_key: str, base_url: Optional[str] = None) -> Tuple[Optional[List[ModelEntry]], Optional[Tuple[str, str]]]:
    base = (base_url or "https://integrate.api.nvidia.com/v1").rstrip("/")
    body, err = _http_get_json(
        f"{base}/models",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
    )
    if err or not body:
        return None, err
    data = body.get("data") or []
    pairs: List[Tuple[str, Optional[str]]] = []
    for item in data:
        mid = (item or {}).get("id")
        if isinstance(mid, str):
            pairs.append((mid, None))
    pairs.sort(key=lambda p: p[0])
    return _merge_with_catalog("nvidia", pairs), None


_DISCOVERERS = {
    "openai": _discover_openai,
    "anthropic": _discover_anthropic,
    "nvidia": _discover_nvidia,
}


def discover_models(
    provider: str,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
) -> Dict[str, object]:
    """Return ``{provider, models, recommended, source, discovery_error?}`` for a provider.

    When ``api_key`` is supplied and the provider exposes a listing endpoint
    we attempt live discovery; otherwise we fall back to the static curated
    catalog. ``source`` is one of ``"live"``, ``"static"``, ``"static_fallback"``
    (a live attempt failed). ``discovery_error`` is present only on fallback
    and is a ``{category, message}`` object — never carries the key.
    """
    pid = (provider or "").lower()
    static_models = models_for(pid)
    base = {
        "provider": pid,
        "models": static_models,
        "recommended": recommended_model(pid),
        "source": "static",
    }
    if not pid or pid == "deterministic" or pid not in _DISCOVERERS:
        return base
    if not api_key:
        return base
    discover = _DISCOVERERS[pid]
    try:
        models, err = discover(api_key, base_url)
    except Exception as exc:  # pragma: no cover - defensive
        LOG.warning("model discovery crashed for %s: %s", pid, exc)
        return {
            **base,
            "source": "static_fallback",
            "discovery_error": {"category": "unknown", "message": "Discovery crashed."},
        }
    if err is not None:
        category, message = err
        return {
            **base,
            "source": "static_fallback",
            "discovery_error": {"category": category, "message": message},
        }
    if not models:
        return {
            **base,
            "source": "static_fallback",
            "discovery_error": {"category": "invalid_output", "message": "Provider returned an empty model list."},
        }
    # Recompute the recommended id from the merged list (curated default if
    # still live, otherwise the first remaining entry).
    rec = ""
    for entry in models:
        if entry.get("recommended"):
            rec = entry.get("id", "")
            break
    if not rec and models:
        rec = models[0].get("id", "")
    return {
        "provider": pid,
        "models": models,
        "recommended": rec,
        "source": "live",
    }
