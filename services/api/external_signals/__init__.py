"""External (outside-in) signal layer -- public service surface.

This module is the only thing the API imports. It provides:

* :func:`get_external_signals_provider` -- the configured provider (mock/serper).
* :func:`get_account_signals` -- cached, never-raising lookup for one account.
* :func:`refresh_accounts` -- bounded refresh for a set of priority accounts.
* :func:`status_block` / :func:`meta_block` -- safe diagnostics for the API.

Design guarantees (so the layer can never destabilise the product):
* When ``EXTERNAL_SIGNALS_ENABLED`` is false, every call returns a well-formed
  *disabled* result and does no work.
* Provider/network errors are swallowed -- the worst case is an empty result.
* Results are cached by ``company_name + industry + region`` for a configurable
  TTL so external search is never hit on every page load.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone
from functools import lru_cache
from typing import Dict, List, Optional, Tuple

from config import get_settings

from external_signals.base import (
    EXTERNAL_CONTEXT_CAVEAT,
    SIGNAL_TYPES,
    ExternalSignal,
    ExternalSignalsProvider,
    ExternalSignalsResult,
    ExternalSummary,
)

logger = logging.getLogger("signal_to_action.external_signals")

__all__ = [
    "SIGNAL_TYPES",
    "ExternalSignal",
    "ExternalSignalsResult",
    "ExternalSignalsProvider",
    "get_external_signals_provider",
    "get_account_signals",
    "refresh_accounts",
    "status_block",
    "meta_block",
    "clear_cache",
]

#: Provider ids the factory understands (anything else -> mock + warning).
KNOWN_PROVIDERS = {"mock", "serper"}

# -- module state (thread-safe) -------------------------------------------

_CACHE: Dict[str, Tuple[float, ExternalSignalsResult]] = {}
_LOCK = threading.Lock()
_LAST_REFRESH_AT: Optional[str] = None
_LAST_REFRESH_COUNT: int = 0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cache_key(company_name: str, industry: str, region: str) -> str:
    return f"{company_name}|{industry}|{region}".strip().lower()


# -- provider factory -----------------------------------------------------


@lru_cache(maxsize=1)
def get_external_signals_provider() -> ExternalSignalsProvider:
    """Return the configured external-signals provider (read once, cached).

    ``serper`` is selected only when a key is present; otherwise (and for any
    unknown value) we use the deterministic mock so the demo always works.
    """
    settings = get_settings()
    provider = (settings.external_signals_provider or "mock").lower()

    if provider == "serper":
        from external_signals.serper_provider import SerperProvider

        if settings.serper_api_key:
            return SerperProvider(api_key=settings.serper_api_key)
        logger.warning(
            "EXTERNAL_SIGNALS_PROVIDER=serper but SERPER_API_KEY is empty; "
            "using deterministic mock external signals."
        )
    elif provider not in KNOWN_PROVIDERS:
        logger.warning(
            "Unknown EXTERNAL_SIGNALS_PROVIDER '%s'; using the mock provider.", provider
        )

    from external_signals.mock_provider import MockProvider

    return MockProvider()


def _provider_active_name() -> str:
    """The provider actually in effect (serper degrades to mock without a key)."""
    try:
        return get_external_signals_provider().name
    except Exception:  # noqa: BLE001 -- diagnostics must never raise
        return "mock"


# -- core service ---------------------------------------------------------


def _disabled_result(account, provider_name: str) -> ExternalSignalsResult:
    return ExternalSignalsResult(
        account_id=getattr(account, "account_id", ""),
        account_name=getattr(account, "account_name", ""),
        enabled=False,
        provider=provider_name,
        signals=[],
        summary="",
        seller_takeaway="",
        caveat=EXTERNAL_CONTEXT_CAVEAT,
        generated_at=_now_iso(),
        cached=False,
        note="External signals layer is disabled (set EXTERNAL_SIGNALS_ENABLED=true to enable).",
    )


def get_account_signals(account, *, force: bool = False) -> ExternalSignalsResult:
    """Return external context for one account. Never raises.

    Honours ``EXTERNAL_SIGNALS_ENABLED`` (returns a disabled result when off) and
    caches by ``company_name + industry + region`` for the configured TTL.
    """
    settings = get_settings()
    if not settings.external_signals_enabled:
        return _disabled_result(account, settings.external_signals_provider or "mock")

    name = getattr(account, "account_name", "") or ""
    industry = getattr(account, "industry", "") or ""
    region = getattr(account, "region", "") or ""
    key = _cache_key(name, industry, region)
    ttl_seconds = max(0, int(settings.external_signals_cache_ttl_minutes)) * 60
    now = time.time()

    if not force and ttl_seconds > 0:
        with _LOCK:
            hit = _CACHE.get(key)
        if hit and (now - hit[0]) < ttl_seconds:
            return hit[1].model_copy(update={"cached": True})

    provider = get_external_signals_provider()
    try:
        signals = provider.search_company_context(name, industry, region)
        summary: ExternalSummary = provider.summarize_external_signals(account, signals)
    except Exception as exc:  # noqa: BLE001 -- a provider must never break the app
        logger.warning(
            "External signals lookup failed for %s (%s); returning empty context.",
            name,
            type(exc).__name__,
        )
        return ExternalSignalsResult(
            account_id=getattr(account, "account_id", ""),
            account_name=name,
            enabled=True,
            provider=provider.name,
            signals=[],
            summary="",
            seller_takeaway="",
            caveat=EXTERNAL_CONTEXT_CAVEAT,
            generated_at=_now_iso(),
            cached=False,
            note="External provider temporarily unavailable; no external context to show.",
        )

    result = ExternalSignalsResult(
        account_id=getattr(account, "account_id", ""),
        account_name=name,
        enabled=True,
        provider=provider.name,
        signals=signals,
        summary=summary.summary,
        seller_takeaway=summary.seller_takeaway,
        caveat=EXTERNAL_CONTEXT_CAVEAT,
        generated_at=_now_iso(),
        cached=False,
    )

    if ttl_seconds > 0:
        with _LOCK:
            _CACHE[key] = (now, result)
    return result


def refresh_accounts(accounts: List) -> dict:
    """Force-refresh external signals for a bounded set of priority accounts.

    Capped by ``EXTERNAL_SIGNALS_REFRESH_LIMIT``. Never raises; returns a small
    summary suitable for an API response.
    """
    global _LAST_REFRESH_AT, _LAST_REFRESH_COUNT
    settings = get_settings()
    if not settings.external_signals_enabled:
        return {
            "enabled": False,
            "provider": settings.external_signals_provider or "mock",
            "refreshed_accounts": 0,
            "total_signals": 0,
            "note": "External signals layer is disabled (set EXTERNAL_SIGNALS_ENABLED=true to enable).",
            "generated_at": _now_iso(),
        }

    limit = max(1, int(settings.external_signals_refresh_limit))
    targets = accounts[:limit]
    total_signals = 0
    refreshed = 0
    for account in targets:
        result = get_account_signals(account, force=True)
        refreshed += 1
        total_signals += len(result.signals)

    _LAST_REFRESH_AT = _now_iso()
    _LAST_REFRESH_COUNT = refreshed
    return {
        "enabled": True,
        "provider": _provider_active_name(),
        "refreshed_accounts": refreshed,
        "total_signals": total_signals,
        "limit": limit,
        "generated_at": _LAST_REFRESH_AT,
    }


# -- diagnostics ----------------------------------------------------------


def status_block() -> dict:
    """External-signals block for GET /api/system/status (no secrets)."""
    settings = get_settings()
    with _LOCK:
        cache_entries = len(_CACHE)
    return {
        "enabled": settings.external_signals_enabled,
        "provider": settings.external_signals_provider or "mock",
        "provider_active": _provider_active_name() if settings.external_signals_enabled else None,
        "serper_configured": bool(settings.serper_api_key),
        "cache_entries": cache_entries,
        "cache_ttl_minutes": settings.external_signals_cache_ttl_minutes,
        "refresh_limit": settings.external_signals_refresh_limit,
        "last_refresh_at": _LAST_REFRESH_AT,
        "last_refresh_count": _LAST_REFRESH_COUNT,
    }


def meta_block() -> dict:
    """Lightweight block for GET /api/meta so the UI knows whether to fetch."""
    settings = get_settings()
    return {
        "enabled": settings.external_signals_enabled,
        "provider": settings.external_signals_provider or "mock",
    }


def clear_cache() -> None:
    """Drop all cached results (used by tests/verification)."""
    with _LOCK:
        _CACHE.clear()
