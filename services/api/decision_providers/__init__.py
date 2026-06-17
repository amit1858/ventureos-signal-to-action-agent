"""Decision Provider router -- factory, status, evaluate and compare.

The router is the only thing the API layer talks to. It:

* builds the deterministic baseline (always) for an account,
* runs a single named provider (``evaluate_account``) or every provider
  (``compare_account``),
* turns any live-provider failure into a safe deterministic fallback,
* reports secret-free provider status,
* derives read-only comparison analytics (agreement / divergence / evaluation).

It never persists anything, never writes to the CRM, and never changes ranking,
scoring or governance. LLM decisions are advisory and approval-gated.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional

from config import LIVE_DECISION_PROVIDERS, get_settings
from decision_providers.anthropic_provider import AnthropicProvider
from decision_providers.base import (
    ADVISORY_CAVEAT,
    DecisionContext,
    DecisionProvider,
    ProviderCredential,
    ProviderDecision,
    ProviderMode,
    fallback_decision,
    not_configured_decision,
)
from decision_providers.context import build_decision_context
from decision_providers.catalog import (
    catalog as model_catalog,
    discover_models,
    display_for,
    is_known_model,
    models_for,
    recommended_model,
)
from decision_providers.deterministic_provider import DeterministicProvider
from decision_providers.llm_base import ProviderError
from decision_providers.nvidia_provider import NvidiaProvider
from decision_providers.openai_provider import OpenAIProvider

logger = logging.getLogger("signal_to_action.decision_providers")

#: Build order for comparison (baseline first, then live providers).
_LIVE_ORDER = ("openai", "anthropic", "nvidia")

#: Type alias for a per-session credential map keyed by provider id.
Credentials = Optional[Dict[str, ProviderCredential]]


def _build_providers(credentials: Credentials = None) -> Dict[str, DecisionProvider]:
    """Fresh provider instances (cheap; reflects current settings).

    Optional per-session BYOK ``credentials`` (Phase 5.0A) are injected so a
    provider keyed only in the browser session still runs live. Empty / missing
    credentials fall back to environment configuration (infrastructure mode).
    """
    creds = credentials or {}
    return {
        "deterministic": DeterministicProvider(),
        "openai": OpenAIProvider(creds.get("openai")),
        "anthropic": AnthropicProvider(creds.get("anthropic")),
        "nvidia": NvidiaProvider(creds.get("nvidia")),
    }


def get_decision_provider(name: str, credential: Optional[ProviderCredential] = None) -> DecisionProvider:
    """Return a provider instance by id (defaults to deterministic)."""
    pid = (name or "").lower()
    providers = _build_providers({pid: credential} if credential else None)
    return providers.get(pid, providers["deterministic"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def provider_catalog() -> dict:
    """Return the curated model catalog for every live provider (Phase 5.0A.1).

    Shape: ``{"providers": {"openai": [{id, display, tier, description, recommended}, ...], ...},
    "recommended": {"openai": "gpt-4o-mini", ...}}``. The UI uses this to render
    a model dropdown so non-technical users never type a model identifier.
    """
    providers = model_catalog()
    return {
        "providers": providers,
        "recommended": {pid: recommended_model(pid) for pid in providers},
        "discovery": "static",  # future: "remote" when ``fetch_remote_models`` is wired
    }


def provider_models(provider: str, credential: Optional[ProviderCredential] = None) -> dict:
    """Return live-discovered models for one provider, falling back to static.

    Phase 5.0A.2 — when a BYOK credential is supplied we call the provider's
    own model-listing endpoint (OpenAI / Anthropic / NVIDIA) and merge those
    ids with the curated catalog so the dropdown stays accurate even as
    providers release new models. Without a credential, returns the static
    catalog as-is. Never returns the key, never logs it, never persists it.

    Result shape::

        {
          "provider": "anthropic",
          "models": [{"id": "...", "display": "...", "tier": "...",
                      "recommended": true, ...}, ...],
          "recommended": "claude-sonnet-4-...",
          "source": "live" | "static" | "static_fallback",
          "discovery_error": {"category": "...", "message": "..."}  # only on fallback
        }
    """
    api_key = (credential.api_key if credential else "") or ""
    base_url = (credential.base_url if credential else "") or ""
    return discover_models(provider, api_key=api_key.strip(), base_url=base_url.strip() or None)


# -- status ---------------------------------------------------------------


def provider_status(credentials: Credentials = None) -> dict:
    """Secret-free status for every decision provider.

    Returns presence booleans and model ids only -- never key values. When a
    per-session credential map is supplied, a session-keyed provider reports as
    configured (so the status reflects BYOK without exposing the key).
    """
    settings = get_settings()
    providers = _build_providers(credentials)
    default = settings.decision_provider if settings.decision_provider in providers else "deterministic"

    rows: List[dict] = []
    for pid, prov in providers.items():
        live_capable = pid in LIVE_DECISION_PROVIDERS
        configured = prov.configured()
        if pid == "deterministic":
            status = "active"
        elif not configured:
            status = "not_configured"
        elif pid == default:
            status = "active"
        else:
            status = "configured"
        rows.append(
            {
                "id": pid,
                "label": prov.label,
                "model": prov.model_name(),
                "model_display": display_for(pid, prov.model_name()) or "",
                "model_recommended": recommended_model(pid) if live_capable else "",
                "live_capable": live_capable,
                "configured": configured,
                "is_baseline": pid == "deterministic",
                "is_default": pid == default,
                "status": status,
            }
        )

    return {
        "default_provider": default,
        "deterministic_is_baseline": True,
        "providers": rows,
        "configured_live_count": sum(1 for r in rows if r["live_capable"] and r["configured"]),
        "governance_caveat": ADVISORY_CAVEAT,
        "generated_at": _now_iso(),
    }


# -- connection test (Phase 5.0A "Test Connection") -----------------------


def test_provider(provider_id: str, credential: Optional[ProviderCredential]) -> dict:
    """Verify a (session) credential can reach a live provider.

    Builds the named provider with the supplied credential and makes one minimal
    request. Returns a secret-free result -- never the key. Possible ``status``
    values: ``connected`` | ``no_key`` | ``failed`` | ``unsupported``. On
    ``failed`` the response also carries an ``error_category`` so the UI can
    show a friendly diagnostic (invalid_key / model_not_found / rate_limited /
    endpoint_unavailable / timeout / network / http_error / invalid_output /
    unknown). Phase 5.0A.1 also returns a curated ``model_display`` label.
    """
    pid = (provider_id or "").lower()
    if pid not in LIVE_DECISION_PROVIDERS:
        return {
            "ok": False,
            "provider": pid,
            "provider_label": pid.title(),
            "model": "",
            "model_display": "",
            "status": "unsupported",
            "error": "Unknown or non-live provider.",
            "error_category": "unsupported",
            "latency_ms": 0,
        }

    prov = _build_providers({pid: credential} if credential else None)[pid]
    if not prov.configured():
        return {
            "ok": False,
            "provider": pid,
            "provider_label": prov.label,
            "model": prov.model_name(),
            "model_display": display_for(pid, prov.model_name()) or "",
            "status": "no_key",
            "error": "No API key provided.",
            "error_category": "invalid_key",
            "latency_ms": 0,
        }

    start = time.perf_counter()
    try:
        result = prov.ping()  # type: ignore[attr-defined]  # live providers expose ping()
        resolved_model = result.get("model", prov.model_name())
        return {
            "ok": True,
            "provider": pid,
            "provider_label": prov.label,
            "model": resolved_model,
            "model_display": display_for(pid, resolved_model) or resolved_model,
            "status": "connected",
            "error": None,
            "error_category": None,
            "latency_ms": int(result.get("latency_ms", 0)),
        }
    except ProviderError as exc:
        category = getattr(exc, "error_category", "unknown") or "unknown"
        return {
            "ok": False,
            "provider": pid,
            "provider_label": prov.label,
            "model": prov.model_name(),
            "model_display": display_for(pid, prov.model_name()) or "",
            "status": "failed",
            "error": str(exc),
            "error_category": category,
            "latency_ms": int((time.perf_counter() - start) * 1000),
        }
    except Exception as exc:  # noqa: BLE001 -- defence in depth; never leak internals
        logger.warning("test_provider %s failed (%s).", pid, type(exc).__name__)
        return {
            "ok": False,
            "provider": pid,
            "provider_label": prov.label,
            "model": prov.model_name(),
            "model_display": display_for(pid, prov.model_name()) or "",
            "status": "failed",
            "error": type(exc).__name__,
            "error_category": "unknown",
            "latency_ms": int((time.perf_counter() - start) * 1000),
        }


# -- single-provider evaluation ------------------------------------------


def _run_live(
    provider: DecisionProvider, context: DecisionContext, baseline: ProviderDecision
) -> ProviderDecision:
    """Run one live provider with deterministic fallback on any failure."""
    start = time.perf_counter()
    try:
        return provider.decide(context)
    except ProviderError as exc:
        latency = int((time.perf_counter() - start) * 1000)
        logger.info("Provider %s fell back to deterministic baseline.", provider.id)
        return fallback_decision(
            baseline,
            provider=provider.id,
            model=provider.model_name(),
            error=str(exc),
            latency_ms=latency,
        )
    except Exception as exc:  # noqa: BLE001 -- defence in depth; never break the flow
        latency = int((time.perf_counter() - start) * 1000)
        logger.warning("Provider %s unexpected failure (%s); using baseline.", provider.id, type(exc).__name__)
        return fallback_decision(
            baseline,
            provider=provider.id,
            model=provider.model_name(),
            error=f"{type(exc).__name__}",
            latency_ms=latency,
        )


def evaluate_account(
    account_id: str,
    provider: Optional[str] = None,
    credentials: Credentials = None,
) -> Optional[ProviderDecision]:
    """Evaluate one account with one provider (defaults to the configured one).

    Optional per-session BYOK ``credentials`` let a session-keyed provider run
    live without env vars. Returns ``None`` when the account does not exist.
    Never raises for provider issues -- not-configured returns a placeholder,
    failures fall back to the deterministic baseline.
    """
    context = build_decision_context(account_id)
    if context is None:
        return None

    settings = get_settings()
    name = (provider or settings.decision_provider or "deterministic").lower()
    providers = _build_providers(credentials)
    baseline = providers["deterministic"].decide(context)

    if name == "deterministic" or name not in providers:
        return baseline

    prov = providers[name]
    if not prov.configured():
        return not_configured_decision(provider=name, model=prov.model_name())
    return _run_live(prov, context, baseline)


# -- multi-provider comparison -------------------------------------------


def _difference_rows(baseline: ProviderDecision, decisions: List[ProviderDecision]) -> List[dict]:
    fields = ("risk_level", "opportunity_level", "recommended_action", "confidence")
    rows: List[dict] = []
    for field_name in fields:
        rows.append(
            {
                "field": field_name,
                "baseline": getattr(baseline, field_name),
                "providers": {d.provider: getattr(d, field_name) for d in decisions},
            }
        )
    return rows


def _evaluation_block(
    baseline: ProviderDecision, results: List[ProviderDecision]
) -> dict:
    live = [d for d in results if d.mode == ProviderMode.live.value]
    fallbacks = [d for d in results if d.mode == ProviderMode.fallback.value]
    not_configured = [d for d in results if d.mode == ProviderMode.not_configured.value]

    def _agree(field_name: str) -> Optional[bool]:
        if not live:
            return None
        return all(getattr(d, field_name) == getattr(baseline, field_name) for d in live)

    ran = [baseline] + live + fallbacks
    return {
        "providers_compared": len(live),
        "provider_availability": {d.provider: (d.mode != ProviderMode.not_configured.value) for d in results},
        "action_agreement": _agree("recommended_action"),
        "risk_agreement": _agree("risk_level"),
        "opportunity_agreement": _agree("opportunity_level"),
        "confidence_agreement": _agree("confidence"),
        "structured_output_valid": True,  # anything that ran already validated into the contract
        "fallback_used": [d.provider for d in fallbacks],
        "fallback_success": len(fallbacks) > 0 or None,
        "not_configured": [d.provider for d in not_configured],
        "max_latency_ms": max((d.latency_ms for d in ran), default=0),
        "cost_estimate": None,  # placeholder for future token/cost telemetry
        "governance_compliant": True,  # advisory, approval-gated, no autonomous CRM writeback
    }


def _evaluation_notes(baseline: ProviderDecision, results: List[ProviderDecision]) -> List[str]:
    notes: List[str] = []
    live = [d for d in results if d.mode == ProviderMode.live.value]
    fallbacks = [d for d in results if d.mode == ProviderMode.fallback.value]
    not_configured = [d for d in results if d.mode == ProviderMode.not_configured.value]

    if not live:
        notes.append(
            "No live LLM providers are configured. Showing the deterministic baseline only. "
            "Add OPENAI_API_KEY, ANTHROPIC_API_KEY or NVIDIA_API_KEY (BYOK) to enable a live comparison."
        )
    else:
        diverging = [d for d in live if d.recommended_action != baseline.recommended_action]
        if diverging:
            for d in diverging:
                notes.append(
                    f"{d.provider} proposes '{d.recommended_action}' vs deterministic "
                    f"'{baseline.recommended_action}' -- advisory only; governance and human approval still apply."
                )
        else:
            notes.append(
                f"All {len(live)} live provider(s) agree with the deterministic recommended action "
                f"('{baseline.recommended_action}')."
            )

    for d in fallbacks:
        notes.append(f"{d.provider} was unavailable and safely fell back to the deterministic baseline.")
    if not_configured:
        notes.append(
            "Not configured: " + ", ".join(d.provider for d in not_configured) + " (add an API key to compare live)."
        )
    notes.append(ADVISORY_CAVEAT)
    return notes


def compare_account(account_id: str, credentials: Credentials = None) -> Optional[dict]:
    """Compare the deterministic baseline against every provider for one account.

    Optional per-session BYOK ``credentials`` enable live providers keyed only in
    the browser session. Returns ``None`` when the account does not exist.
    Read-only: no persistence, no CRM writeback, no ranking/scoring/governance
    change.
    """
    context = build_decision_context(account_id)
    if context is None:
        return None

    providers = _build_providers(credentials)
    baseline = providers["deterministic"].decide(context)

    results: List[ProviderDecision] = []
    for pid in _LIVE_ORDER:
        prov = providers[pid]
        if prov.configured():
            results.append(_run_live(prov, context, baseline))
        else:
            results.append(not_configured_decision(provider=pid, model=prov.model_name()))

    comparable = [baseline] + [d for d in results if d.mode != ProviderMode.not_configured.value]

    return {
        "account_id": context.account_id,
        "account_name": context.account_name,
        "external_context_used": context.external_enabled,
        "baseline": baseline.model_dump(),
        "providers": [d.model_dump() for d in results],
        "differences": _difference_rows(baseline, comparable),
        "evaluation": _evaluation_block(baseline, results),
        "evaluation_notes": _evaluation_notes(baseline, results),
        "governance_caveat": ADVISORY_CAVEAT,
        "generated_at": _now_iso(),
    }
