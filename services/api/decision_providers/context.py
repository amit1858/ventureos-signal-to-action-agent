"""Build the deterministic :class:`DecisionContext` for one account.

This is the bridge between the existing deterministic engine and the new
decision-provider layer. It reuses the *exact same* agents the orchestrator uses
(Signal Ingestion, Account Health, Opportunity, Governance, Action) plus the
fusion brief, so the "deterministic baseline" a provider sees is identical to
what the product already computes -- nothing here recomputes or changes scoring,
ranking or governance.

It never raises: a missing account returns ``None`` and any enrichment failure
degrades to an internal-only context.
"""

from __future__ import annotations

import logging
from typing import List, Optional

import external_signals
from agents.account_health_agent import AccountHealthAgent
from agents.action_agent import ActionAgent
from agents.governance_agent import GovernanceAgent
from agents.opportunity_agent import OpportunityAgent
from agents.signal_ingestion_agent import SignalIngestionAgent
from decision_providers.base import ContextSignal, DecisionContext, level_from_score
from external_signals import fusion
from services import data_loader

logger = logging.getLogger("signal_to_action.decision_providers")

# Reusable, stateless agent instances (mirrors the orchestrator's per-account
# pipeline; none of these hold state between calls).
_ingestion = SignalIngestionAgent()
_health_agent = AccountHealthAgent()
_opportunity_agent = OpportunityAgent()
_governance_agent = GovernanceAgent()
_action_agent = ActionAgent()


def _context_for_account(account_id: str):
    """Return the ingested AccountContext for one account, or None."""
    for ctx in _ingestion.run():
        if ctx.account.account_id == account_id:
            return ctx
    return None


def _external_block(account) -> tuple[bool, str, List[ContextSignal]]:
    """Best-effort external (outside-in) context. Never raises."""
    try:
        result = external_signals.get_account_signals(account)
    except Exception as exc:  # noqa: BLE001 -- enrichment must never break a decision
        logger.warning("External context failed for %s (%s).", account.account_id, type(exc).__name__)
        return False, "", []

    if not getattr(result, "enabled", False):
        return False, "", []

    signals: List[ContextSignal] = []
    for s in (result.signals or [])[:6]:
        signals.append(
            ContextSignal(
                title=s.title,
                source=s.source,
                summary=s.summary,
                impact=getattr(s, "impact", "neutral"),
                url=getattr(s, "url", None),
                published_at=getattr(s, "published_at", None),
            )
        )
    return True, result.summary or "", signals


def build_decision_context(account_id: str) -> Optional[DecisionContext]:
    """Assemble the deterministic grounding for one account.

    Returns ``None`` only when the account id does not exist. Reuses the
    deterministic scoring + agent pipeline so the baseline matches the product.
    """
    ctx = _context_for_account(account_id)
    if ctx is None:
        return None

    account = ctx.account
    breakdown = scoring_breakdown(account)
    health = _health_agent.run(ctx, breakdown)
    opportunity = _opportunity_agent.run(ctx, breakdown)
    governance = _governance_agent.run(ctx, breakdown, health, opportunity)
    action = _action_agent.run(ctx, breakdown, health, opportunity, governance)

    # External supporting context + a deterministic fusion brief for narrative
    # grounding. The brief is built from the same external signals so providers
    # share identical grounding; it is explanatory only.
    external_enabled, external_summary, ext_signals = _external_block(account)
    raw_signals = []
    if external_enabled:
        try:
            res = external_signals.get_account_signals(account)
            raw_signals = list(res.signals or [])
        except Exception:  # noqa: BLE001
            raw_signals = []
    try:
        brief = fusion.build_brief(account, raw_signals)
    except Exception as exc:  # noqa: BLE001 -- never let the brief break a decision
        logger.warning("Fusion brief failed for %s (%s).", account_id, type(exc).__name__)
        brief = None

    evidence_labels = [e.label for e in list(health.evidence) + list(opportunity.evidence)]

    return DecisionContext(
        account_id=account.account_id,
        account_name=account.account_name,
        industry=account.industry,
        segment=account.segment,
        region=account.region,
        current_month_spend=account.current_month_spend,
        previous_month_spend=account.previous_month_spend,
        spend_delta_pct=round(ctx.spend_delta_pct, 1),
        product_usage_score=account.product_usage_score,
        engagement_score=account.engagement_score,
        support_risk_score=account.support_risk_score,
        campaign_response_score=account.campaign_response_score,
        last_contact_days=account.last_contact_days,
        renewal_days=account.renewal_days,
        growth_potential_score=account.growth_potential_score,
        priority_score=breakdown.priority_score,
        risk_score=round(health.risk_score, 4),
        risk_level=level_from_score(health.risk_score),
        risk_factors=list(health.risk_factors),
        opportunity_score=round(opportunity.opportunity_score, 4),
        opportunity_level=level_from_score(opportunity.opportunity_score),
        opportunity_factors=list(opportunity.opportunity_factors),
        deterministic_action=action.action_type,
        deterministic_action_detail=action.recommended_action,
        confidence_score=round(governance.confidence_score, 4),
        confidence_level=level_from_score(governance.confidence_score, high=0.7, medium=0.5),
        governance_status=governance.governance_status,
        governance_caveats=list(governance.caveats),
        evidence=evidence_labels,
        external_enabled=external_enabled,
        external_summary=external_summary,
        external_signals=ext_signals,
        brief_executive_summary=getattr(brief, "executive_summary", "") or getattr(brief, "internal_summary", "") if brief else "",
        brief_business_implication=getattr(brief, "business_implication", "") if brief else "",
        brief_seller_implication=getattr(brief, "seller_implication", "") if brief else "",
        brief_opening_line=getattr(brief, "suggested_opening_line", "") if brief else "",
        brief_conversation_strategy=list(getattr(brief, "conversation_strategy_steps", []) or []) if brief else [],
        brief_crm_note=(getattr(getattr(brief, "crm_writeback", None), "note", "") if brief and getattr(brief, "crm_writeback", None) else ""),
    )


def scoring_breakdown(account):
    """Thin indirection over the deterministic scoring service (kept local so
    the import surface mirrors the orchestrator)."""
    from services import scoring_service

    return scoring_service.compute_breakdown(account)
