"""Phase 7 -- Multi-Agent Strategic Reasoning specialists.

Six specialist agents collaborate over the SAME deterministic ``DecisionContext``:

    Risk Agent
    Growth Agent
    Research Agent
    Engagement Agent
    Governance Agent (critic)
    Portfolio Agent (across all accounts)

Each agent has its own input view, output schema and reasoning rules. Agents
produce reasoning only; nothing here changes ranking, scoring, confidence,
governance, approvals or CRM write-back -- the Governed Decision Engine
remains the source of truth.

Default behaviour is deterministic. When a BYOK ``ProviderDecision`` is supplied
(e.g. from an active OpenAI / Anthropic provider) the Engagement agent re-uses
the provider's narrative; every other agent stays deterministic so live LLM
exposure is bounded to ONE call per account.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from decision_providers.base import (
    DecisionContext,
    ProviderCredential,
    ProviderDecision,
    ProviderMode,
)
from decision_providers.context import build_decision_context
from schemas.multi_agent import (
    AgentAttribution,
    AgentReport,
    EngagementPlan,
    GovernanceReview,
    GrowthAssessment,
    PortfolioPriority,
    PortfolioRecommendation,
    ResearchAssessment,
    RiskAssessment,
)

logger = logging.getLogger("signal_to_action.multi_agent")


# ---------------------------------------------------------------------------
# Specialist agents
# ---------------------------------------------------------------------------


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _det_attr(latency_ms: int = 0) -> AgentAttribution:
    return AgentAttribution(
        provider="deterministic",
        model="governed-engine",
        mode="deterministic",
        latency_ms=latency_ms,
    )


def _llm_attr(decision: ProviderDecision) -> AgentAttribution:
    return AgentAttribution(
        provider=decision.provider,
        model=decision.model,
        mode=decision.mode,
        latency_ms=decision.latency_ms,
    )


class RiskAgent:
    """Identifies what could deteriorate or cause customer loss."""

    def run(self, ctx: DecisionContext) -> RiskAssessment:
        start = time.perf_counter()
        drivers: List[str] = list(ctx.risk_factors)
        evidence: List[str] = []

        if ctx.spend_delta_pct < -5:
            evidence.append(f"Spend down {abs(ctx.spend_delta_pct):.1f}% MoM")
        if ctx.support_risk_score >= 0.6:
            evidence.append(f"Support risk score {ctx.support_risk_score:.2f}")
        if ctx.engagement_score <= 0.4:
            evidence.append(f"Engagement weak ({ctx.engagement_score:.2f})")
        if 0 < ctx.renewal_days <= 60:
            evidence.append(f"Renewal in {ctx.renewal_days} days")
        if ctx.last_contact_days >= 21:
            evidence.append(f"No contact in {ctx.last_contact_days} days")

        if not drivers:
            drivers = ["No material risk drivers detected by the governed engine."]

        if ctx.risk_level == "high":
            narrative = (
                f"{ctx.account_name} shows material churn-risk signals: "
                + "; ".join(drivers[:3])
                + "."
            )
            mitigation = "Open an executive risk conversation within 48 hours and stabilise before any expansion motion."
        elif ctx.risk_level == "medium":
            narrative = (
                f"{ctx.account_name} carries moderate risk -- watch the next two weeks of usage and support."
            )
            mitigation = "Schedule a structured check-in this week and re-baseline against last month's usage."
        else:
            narrative = f"{ctx.account_name} looks stable on the risk axis; no immediate intervention required."
            mitigation = "Maintain cadence; monitor renewal and usage."

        confidence = "high" if len(evidence) >= 3 else "medium" if evidence else "low"
        latency = int((time.perf_counter() - start) * 1000)
        return RiskAssessment(
            risk_level=ctx.risk_level,
            risk_drivers=drivers[:6],
            risk_evidence=evidence[:6],
            risk_narrative=narrative,
            recommended_mitigation=mitigation,
            confidence=confidence,
            attribution=_det_attr(latency),
        )


class GrowthAgent:
    """Identifies expansion / upsell / cross-sell upside."""

    def run(self, ctx: DecisionContext) -> GrowthAssessment:
        start = time.perf_counter()
        drivers: List[str] = list(ctx.opportunity_factors)
        evidence: List[str] = []

        if ctx.growth_potential_score >= 0.6:
            evidence.append(f"Growth potential {ctx.growth_potential_score:.2f}")
        if ctx.campaign_response_score >= 0.6:
            evidence.append(f"Strong campaign response ({ctx.campaign_response_score:.2f})")
        if ctx.product_usage_score >= 0.65:
            evidence.append(f"High product adoption ({ctx.product_usage_score:.2f})")
        if ctx.spend_delta_pct > 5:
            evidence.append(f"Spend up {ctx.spend_delta_pct:.1f}% MoM")

        if not drivers:
            drivers = ["No expansion drivers above threshold this cycle."]

        if ctx.opportunity_level == "high":
            narrative = (
                f"{ctx.account_name} is primed for expansion -- "
                + "; ".join(drivers[:3])
                + "."
            )
            motion = "Pitch a structured expansion or bundle conversation within the next 7 days."
        elif ctx.opportunity_level == "medium":
            narrative = f"{ctx.account_name} has a credible expansion path; validate intent before pitching."
            motion = "Run a discovery call to confirm budget and timing."
        else:
            narrative = f"{ctx.account_name} has limited near-term upside; preserve relationship quality."
            motion = "Nurture; revisit in the next quarterly review."

        confidence = "high" if len(evidence) >= 3 else "medium" if evidence else "low"
        latency = int((time.perf_counter() - start) * 1000)
        return GrowthAssessment(
            opportunity_level=ctx.opportunity_level,
            opportunity_drivers=drivers[:6],
            opportunity_evidence=evidence[:6],
            growth_narrative=narrative,
            suggested_motion=motion,
            confidence=confidence,
            attribution=_det_attr(latency),
        )


class ResearchAgent:
    """Synthesises external market intelligence (advisory only)."""

    def run(self, ctx: DecisionContext) -> ResearchAssessment:
        start = time.perf_counter()
        if not ctx.external_enabled or not ctx.external_signals:
            latency = int((time.perf_counter() - start) * 1000)
            return ResearchAssessment(
                market_themes=[],
                competitor_activity=[],
                company_developments=[],
                industry_context=ctx.industry or "",
                relevance_score="low",
                sources=[],
                narrative=(
                    "No external intelligence configured. External signals are advisory only "
                    "and never alter ranking."
                ),
                confidence="low",
                attribution=_det_attr(latency),
            )

        themes: List[str] = []
        competitor: List[str] = []
        developments: List[str] = []
        sources: List[str] = []
        positives = 0
        negatives = 0
        for s in ctx.external_signals:
            title = (s.title or "").strip()
            if not title:
                continue
            lower = title.lower()
            if any(k in lower for k in ("competitor", "rival", "vs ", "loses to")):
                competitor.append(title)
            elif any(k in lower for k in ("funding", "raises", "expansion", "hires", "launches", "acquires")):
                developments.append(title)
            else:
                themes.append(title)
            if s.url:
                sources.append(s.url)
            if (s.impact or "").lower() == "positive":
                positives += 1
            elif (s.impact or "").lower() == "negative":
                negatives += 1

        relevance = "high" if len(ctx.external_signals) >= 4 else "medium" if ctx.external_signals else "low"
        if positives > negatives:
            tone = "supportive of expansion conversations"
        elif negatives > positives:
            tone = "consistent with risk signals; treat with caution"
        else:
            tone = "mixed; treat as supporting context only"

        narrative = (
            f"External coverage for {ctx.account_name} is {tone}. "
            f"{len(ctx.external_signals)} signal(s) reviewed across themes, competitor activity and company developments. "
            "External intelligence remains advisory and never alters ranking or scoring."
        )
        latency = int((time.perf_counter() - start) * 1000)
        return ResearchAssessment(
            market_themes=themes[:5],
            competitor_activity=competitor[:5],
            company_developments=developments[:5],
            industry_context=ctx.industry or "",
            relevance_score=relevance,
            sources=sources[:5],
            narrative=narrative,
            confidence="medium" if relevance != "low" else "low",
            attribution=_det_attr(latency),
        )


class EngagementAgent:
    """Generates seller-ready actions. Reuses a live provider decision if supplied."""

    def run(
        self,
        ctx: DecisionContext,
        provider_decision: Optional[ProviderDecision] = None,
    ) -> EngagementPlan:
        start = time.perf_counter()

        if provider_decision is not None and provider_decision.mode in (
            ProviderMode.live.value,
            ProviderMode.fallback.value,
            ProviderMode.deterministic.value,
        ):
            return EngagementPlan(
                executive_summary=provider_decision.executive_summary or ctx.brief_executive_summary,
                opening_line=provider_decision.opening_line or ctx.brief_opening_line,
                conversation_strategy=list(provider_decision.conversation_strategy)
                or list(ctx.brief_conversation_strategy),
                outreach_recommendation=provider_decision.business_implication
                or ctx.brief_business_implication,
                crm_note_draft=provider_decision.crm_note or ctx.brief_crm_note,
                follow_up_suggestion=provider_decision.seller_implication
                or ctx.brief_seller_implication,
                confidence=provider_decision.confidence or ctx.confidence_level,
                attribution=_llm_attr(provider_decision),
            )

        # Pure deterministic plan from the fusion brief grounding.
        exec_summary = (
            ctx.brief_executive_summary
            or f"{ctx.account_name}: {ctx.risk_level} risk, {ctx.opportunity_level} opportunity."
        )
        opening = (
            ctx.brief_opening_line
            or f"Thanks for the time -- I wanted to walk through what we are seeing on the {ctx.account_name} account."
        )
        strategy = list(ctx.brief_conversation_strategy) or [
            "Anchor on the deterministic evidence (spend, engagement, support).",
            "Acknowledge external context only as supporting colour.",
            "Confirm the next concrete commitment before ending the call.",
        ]
        outreach = (
            ctx.brief_business_implication
            or f"Suggested action: {ctx.deterministic_action.replace('_', ' ')}."
        )
        crm_note = (
            ctx.brief_crm_note
            or f"Reviewed {ctx.account_name} -- {ctx.deterministic_action_detail or 'follow-up scheduled'}."
        )
        follow_up = ctx.brief_seller_implication or "Capture the outcome in the CRM and route for approval before any write-back."

        latency = int((time.perf_counter() - start) * 1000)
        return EngagementPlan(
            executive_summary=exec_summary,
            opening_line=opening,
            conversation_strategy=strategy[:6],
            outreach_recommendation=outreach,
            crm_note_draft=crm_note,
            follow_up_suggestion=follow_up,
            confidence=ctx.confidence_level,
            attribution=_det_attr(latency),
        )


class GovernanceAgent:
    """Critic. Challenges the other agents; never participates."""

    def run(
        self,
        ctx: DecisionContext,
        risk: RiskAssessment,
        growth: GrowthAssessment,
        research: ResearchAssessment,
        engagement: EngagementPlan,
    ) -> GovernanceReview:
        start = time.perf_counter()

        contradictions: List[str] = []
        unsupported: List[str] = []
        warnings: List[str] = []
        blocked: List[str] = []

        # Risk vs growth contradiction guard.
        if risk.risk_level == "high" and growth.opportunity_level == "high":
            contradictions.append(
                "Risk Agent and Growth Agent both report 'high' -- stabilise risk before opening an expansion motion."
            )

        # Engagement claims unsupported by evidence.
        if not risk.risk_evidence and not growth.opportunity_evidence:
            unsupported.append(
                "Engagement plan is not yet supported by quantitative evidence from Risk or Growth agents."
            )

        # External-only narratives.
        if research.relevance_score != "low" and not ctx.evidence:
            unsupported.append(
                "External signals present but internal CRM evidence is thin; do not treat as authoritative."
            )

        # Confidence guards.
        if ctx.confidence_level == "low":
            warnings.append("Confidence is LOW; require additional evidence before any external commitment.")
        if ctx.governance_status not in ("approved", "review_required"):
            warnings.append(f"Unexpected governance status: {ctx.governance_status}.")

        # Action blocks.
        blocked = [
            "Autonomous CRM write-back (always human-approved).",
            "Ranking or score override (deterministic engine is source of truth).",
            "Bypassing the approval gate.",
        ]

        sufficiency = "high"
        if not ctx.evidence:
            sufficiency = "low"
        elif len(ctx.evidence) < 3:
            sufficiency = "medium"

        summary_bits = []
        if contradictions:
            summary_bits.append(f"{len(contradictions)} contradiction(s)")
        if unsupported:
            summary_bits.append(f"{len(unsupported)} unsupported claim(s)")
        if warnings:
            summary_bits.append(f"{len(warnings)} warning(s)")
        summary = (
            "Governance Agent reviewed the four specialists: "
            + (", ".join(summary_bits) if summary_bits else "no material issues")
            + ". Deterministic ranking, governance and approvals remain in force."
        )

        latency = int((time.perf_counter() - start) * 1000)
        return GovernanceReview(
            evidence_sufficiency=sufficiency,
            contradictions=contradictions,
            unsupported_claims=unsupported,
            risk_warnings=warnings,
            blocked_actions=blocked,
            confidence_assessment=ctx.confidence_level,
            summary=summary,
            attribution=_det_attr(latency),
        )


# ---------------------------------------------------------------------------
# Collaboration entry points
# ---------------------------------------------------------------------------


_risk = RiskAgent()
_growth = GrowthAgent()
_research = ResearchAgent()
_engagement = EngagementAgent()
_governance = GovernanceAgent()


def _consensus(risk: RiskAssessment, growth: GrowthAssessment, engagement: EngagementPlan) -> Tuple[float, str, List[str]]:
    """Return (score 0..1, label, contradictions list)."""
    levels = {"low": 0, "medium": 1, "high": 2}
    items = [levels.get(risk.confidence, 1), levels.get(growth.confidence, 1), levels.get(engagement.confidence, 1)]
    if not items:
        return 0.0, "low", []
    spread = max(items) - min(items)
    if spread == 0:
        score, label = 1.0, "high"
    elif spread == 1:
        score, label = 0.7, "medium"
    else:
        score, label = 0.4, "low"

    contradictions: List[str] = []
    if risk.risk_level == "high" and growth.opportunity_level == "high":
        contradictions.append("Risk and Growth both 'high' -- prioritise risk mitigation first.")
    return score, label, contradictions


def run_multi_agent(
    account_id: str,
    credentials: Optional[dict] = None,
    provider_decision: Optional[ProviderDecision] = None,
) -> Optional[AgentReport]:
    """Run the 5 reasoning + critic agents for a single account.

    ``credentials`` and ``provider_decision`` are optional. The router
    (``decision_providers``) is the right place to actually invoke an LLM; this
    function only consumes the ProviderDecision it produces. We keep LLM
    exposure bounded to one call per account.
    """
    ctx = build_decision_context(account_id)
    if ctx is None:
        return None

    risk = _risk.run(ctx)
    growth = _growth.run(ctx)
    research = _research.run(ctx)
    engagement = _engagement.run(ctx, provider_decision=provider_decision)
    review = _governance.run(ctx, risk, growth, research, engagement)

    score, label, contradictions = _consensus(risk, growth, engagement)
    if review.contradictions:
        contradictions.extend(c for c in review.contradictions if c not in contradictions)

    provider_used = (
        provider_decision.provider if provider_decision is not None else "deterministic"
    )

    return AgentReport(
        account_id=ctx.account_id,
        account_name=ctx.account_name,
        generated_at=_now(),
        provider_used=provider_used,
        consensus_score=round(score, 2),
        consensus_label=label,
        contradictions=contradictions,
        risk=risk,
        growth=growth,
        research=research,
        engagement=engagement,
        governance_review=review,
    )


# ---------------------------------------------------------------------------
# Portfolio Agent (Chief of Staff)
# ---------------------------------------------------------------------------


def run_portfolio(recommendations: list, credentials: Optional[dict] = None) -> PortfolioRecommendation:
    """Portfolio Agent: where should the seller spend the next 4 hours?

    Input is the already-ranked recommendation list from the Governed Decision
    Engine. The Portfolio Agent NEVER re-ranks; it summarises and allocates.
    """
    top: List[PortfolioPriority] = []
    biggest_risk: Optional[PortfolioPriority] = None
    biggest_opportunity: Optional[PortfolioPriority] = None

    for idx, rec in enumerate(recommendations[:5]):
        item = PortfolioPriority(
            account_id=getattr(rec, "account_id", ""),
            account_name=getattr(rec, "account_name", ""),
            priority_rank=getattr(rec, "priority_rank", idx + 1),
            reason=getattr(rec, "priority_reason", "")[:240],
            recommended_action=getattr(rec, "recommended_action", "")[:160],
        )
        top.append(item)

    # Pick biggest risk = first recommendation whose risk summary suggests churn.
    for rec in recommendations:
        summary = (getattr(rec, "risk_summary", "") or "").lower()
        if any(k in summary for k in ("churn", "risk", "escalat", "decline", "renewal")):
            biggest_risk = PortfolioPriority(
                account_id=rec.account_id,
                account_name=rec.account_name,
                priority_rank=rec.priority_rank,
                reason=(rec.risk_summary or rec.priority_reason or "")[:240],
                recommended_action=(rec.recommended_action or "")[:160],
            )
            break

    for rec in recommendations:
        summary = (getattr(rec, "opportunity_summary", "") or "").lower()
        if any(k in summary for k in ("expansion", "upsell", "growth", "opportunity")):
            biggest_opportunity = PortfolioPriority(
                account_id=rec.account_id,
                account_name=rec.account_name,
                priority_rank=rec.priority_rank,
                reason=(rec.opportunity_summary or rec.priority_reason or "")[:240],
                recommended_action=(rec.recommended_action or "")[:160],
            )
            break

    total = len(recommendations)
    attention = sum(1 for r in recommendations if (r.recommended_action or "").lower() != "monitor")
    observations: List[str] = [
        f"{attention} of {total} accounts need attention this cycle.",
        "Ranking, scoring and governance remain deterministic; this view only allocates time.",
    ]
    if biggest_risk:
        observations.append(f"Lead with risk on {biggest_risk.account_name}.")
    if biggest_opportunity and (not biggest_risk or biggest_opportunity.account_id != biggest_risk.account_id):
        observations.append(f"Reserve afternoon time for opportunity on {biggest_opportunity.account_name}.")

    if attention >= 5:
        allocation = "Spend the morning on the top 3 risk accounts; reserve the afternoon for the 2 highest-opportunity accounts."
    elif attention >= 2:
        allocation = "Two focused conversations today: one risk, one opportunity."
    else:
        allocation = "Lighter day -- use it to prep next week's renewal pipeline."

    if top:
        executive_summary = (
            f"Across {total} accounts, {top[0].account_name} is the most important conversation today "
            f"({top[0].recommended_action})."
        )
    else:
        executive_summary = "No prioritised accounts to act on today."

    return PortfolioRecommendation(
        generated_at=_now(),
        provider_used="deterministic",
        top_priorities=top,
        biggest_risk=biggest_risk,
        biggest_opportunity=biggest_opportunity,
        resource_allocation=allocation,
        portfolio_observations=observations,
        executive_summary=executive_summary,
        confidence="medium",
        caveats=[
            "Portfolio Agent reasons over deterministic recommendations only -- it never re-ranks.",
            "All actions remain human-approved before any CRM write-back.",
        ],
    )
