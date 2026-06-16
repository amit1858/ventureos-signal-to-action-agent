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
    ProviderDecision,
    ProviderMode,
    fallback_decision,
    not_configured_decision,
)
from decision_providers.context import build_decision_context
from decision_providers.deterministic_provider import DeterministicProvider
from decision_providers.llm_base import ProviderError
from decision_providers.nvidia_provider import NvidiaProvider
from decision_providers.openai_provider import OpenAIProvider

logger = logging.getLogger("signal_to_action.decision_providers")

#: Build order for comparison (baseline first, then live providers).
_LIVE_ORDER = ("openai", "anthropic", "nvidia")


def _build_providers() -> Dict[str, DecisionProvider]:
    """Fresh provider instances (cheap; reflects current settings)."""
    return {
        "deterministic": DeterministicProvider(),
        "openai": OpenAIProvider(),
        "anthropic": AnthropicProvider(),
        "nvidia": NvidiaProvider(),
    }


def get_decision_provider(name: str) -> DecisionProvider:
    """Return a provider instance by id (defaults to deterministic)."""
    providers = _build_providers()
    return providers.get((name or "").lower(), providers["deterministic"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# -- status ---------------------------------------------------------------


def provider_status() -> dict:
    """Secret-free status for every decision provider.

    Returns presence booleans and model ids only -- never key values.
    """
    settings = get_settings()
    providers = _build_providers()
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


def evaluate_account(account_id: str, provider: Optional[str] = None) -> Optional[ProviderDecision]:
    """Evaluate one account with one provider (defaults to the configured one).

    Returns ``None`` when the account does not exist. Never raises for provider
    issues -- not-configured returns a placeholder, failures fall back to the
    deterministic baseline.
    """
    context = build_decision_context(account_id)
    if context is None:
        return None

    settings = get_settings()
    name = (provider or settings.decision_provider or "deterministic").lower()
    providers = _build_providers()
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


def compare_account(account_id: str) -> Optional[dict]:
    """Compare the deterministic baseline against every provider for one account.

    Returns ``None`` when the account does not exist. Read-only: no persistence,
    no CRM writeback, no ranking/scoring/governance change.
    """
    context = build_decision_context(account_id)
    if context is None:
        return None

    providers = _build_providers()
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
