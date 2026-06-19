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
    DailySellerPlan,
    EngagementPlan,
    GovernanceReview,
    GrowthAssessment,
    PortfolioPriority,
    PortfolioRecommendation,
    ResearchAssessment,
    RiskAssessment,
    SellerPlanItem,
)

logger = logging.getLogger("signal_to_action.multi_agent")


_ACTION_EXECUTION_LIBRARY = {
    "support_escalation": {
        "why": "Support friction and risk indicators suggest immediate intervention to protect retention.",
        "steps": [
            "Review open support issues and identify unresolved blockers before outreach.",
            "Run a 20-minute escalation call with a customer decision-maker and support lead.",
            "Agree on a dated stabilization plan with owners for each blocker.",
            "Book a follow-up checkpoint to verify progress within one week.",
        ],
        "outcome": "Stabilises service risk and reduces near-term churn probability.",
        "effort": "High effort (~55 minutes seller time).",
        "timeline": "Start within 24 hours; complete stabilization plan this week.",
    },
    "renewal_prep": {
        "why": "Renewal timing and account health require proactive alignment before negotiation pressure builds.",
        "steps": [
            "Review renewal timeline, usage trends and unresolved objections.",
            "Set a renewal strategy call with commercial and product stakeholders.",
            "Confirm mutual success criteria and procurement milestones.",
            "Capture commitments and next decision date in CRM draft.",
        ],
        "outcome": "Improves renewal confidence and reduces last-minute discount pressure.",
        "effort": "Medium-high effort (~45 minutes seller time).",
        "timeline": "Run this week; lock renewal path before the 2-week window.",
    },
    "optimization_review": {
        "why": "Usage and value realization need recalibration to restore momentum and account confidence.",
        "steps": [
            "Audit usage patterns and identify adoption drop-off areas.",
            "Prepare a focused optimization agenda tied to business KPIs.",
            "Run a value review with customer champions and success owner.",
            "Agree on one adoption milestone and one executive checkpoint.",
        ],
        "outcome": "Improves adoption and reopens path for expansion.",
        "effort": "Medium effort (~35 minutes seller time).",
        "timeline": "Initiate in 2-3 days; revisit progress in 10 business days.",
    },
    "reactivation": {
        "why": "Inactivity signals indicate relationship drift that needs a structured re-engagement motion.",
        "steps": [
            "Gather latest usage, spend and support context for a concise briefing.",
            "Send a reactivation email anchored on customer outcomes, not product features.",
            "Follow with a call to secure a short recovery conversation.",
            "Document re-engagement status and next milestone in CRM note.",
        ],
        "outcome": "Reopens dialogue and restores account momentum.",
        "effort": "Medium effort (~30 minutes seller time).",
        "timeline": "Outreach today; secure response within 72 hours.",
    },
    "follow_up": {
        "why": "Signals show a manageable opportunity that benefits from timely seller follow-through.",
        "steps": [
            "Summarize the top risk/opportunity evidence for the account.",
            "Open with a contextual message tied to recent customer outcomes.",
            "Validate priority, budget and timeline in a short follow-up call.",
            "Capture commitment and next action in the CRM draft.",
        ],
        "outcome": "Converts current interest into a concrete next step.",
        "effort": "Medium effort (~25 minutes seller time).",
        "timeline": "Execute within 48 hours.",
    },
    "monitor": {
        "why": "Current signals are stable, so low-touch monitoring preserves focus on higher-priority accounts.",
        "steps": [
            "Review account health indicators and confirm stability.",
            "Set an automated reminder for weekly health check.",
            "Prepare a lightweight check-in note for future outreach if risk rises.",
        ],
        "outcome": "Keeps account coverage while protecting seller capacity.",
        "effort": "Low effort (~10 minutes seller time).",
        "timeline": "Review weekly unless risk signals worsen.",
    },
}


def _execution_blueprint(action: str) -> dict:
    return _ACTION_EXECUTION_LIBRARY.get(action, _ACTION_EXECUTION_LIBRARY["follow_up"])


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
        blueprint = _execution_blueprint(ctx.deterministic_action)
        likely_objections = [
            "We are focused on other priorities this quarter.",
            "We need evidence this change will improve business outcomes.",
            "Budget and stakeholder availability are constrained.",
        ]
        talking_points = [
            "Lead with deterministic evidence from spend, engagement and support trends.",
            "Connect the recommendation to a measurable customer outcome and timeline.",
            "Close with one explicit commitment and follow-up owner.",
        ]

        if provider_decision is not None and provider_decision.mode in (
            ProviderMode.live.value,
            ProviderMode.fallback.value,
            ProviderMode.deterministic.value,
        ):
            if provider_decision.reasoning:
                likely_objections = list(provider_decision.reasoning[:3])
            if provider_decision.conversation_strategy:
                talking_points = list(provider_decision.conversation_strategy[:5])
            return EngagementPlan(
                executive_summary=provider_decision.executive_summary or ctx.brief_executive_summary,
                opening_line=provider_decision.opening_line or ctx.brief_opening_line,
                likely_objections=likely_objections,
                talking_points=talking_points,
                conversation_strategy=list(provider_decision.conversation_strategy)
                or list(ctx.brief_conversation_strategy),
                outreach_recommendation=provider_decision.business_implication
                or ctx.brief_business_implication,
                crm_note_draft=provider_decision.crm_note or ctx.brief_crm_note,
                follow_up_suggestion=provider_decision.seller_implication
                or ctx.brief_seller_implication,
                action_selected_why=blueprint["why"],
                execution_steps=list(blueprint["steps"])[:5],
                expected_business_outcome=blueprint["outcome"],
                estimated_seller_effort=blueprint["effort"],
                suggested_timeline=blueprint["timeline"],
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
            likely_objections=likely_objections,
            talking_points=talking_points,
            conversation_strategy=strategy[:6],
            outreach_recommendation=outreach,
            crm_note_draft=crm_note,
            follow_up_suggestion=follow_up,
            action_selected_why=blueprint["why"],
            execution_steps=list(blueprint["steps"])[:5],
            expected_business_outcome=blueprint["outcome"],
            estimated_seller_effort=blueprint["effort"],
            suggested_timeline=blueprint["timeline"],
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


def _priority(rec, reason: str, source: str, score: float) -> PortfolioPriority:
    return PortfolioPriority(
        account_id=getattr(rec, "account_id", ""),
        account_name=getattr(rec, "account_name", ""),
        priority_rank=getattr(rec, "priority_rank", 0),
        reason=(reason or getattr(rec, "priority_reason", "") or "")[:240],
        recommended_action=(getattr(rec, "recommended_action", "") or "")[:160],
        calculation_source=source,
        calculation_score=round(float(score), 3),
    )


def _risk_strength(rec) -> tuple[float, str]:
    sb = getattr(rec, "score_breakdown", None)
    if sb is None:
        return 0.0, "Fallback: no score breakdown available."
    score = (
        0.35 * float(getattr(sb, "support_risk", 0.0))
        + 0.3 * float(getattr(sb, "spend_decline", 0.0))
        + 0.2 * float(getattr(sb, "renewal_urgency", 0.0))
        + 0.1 * float(getattr(sb, "engagement_gap", 0.0))
        + 0.05 * float(getattr(sb, "last_contact_gap", 0.0))
    )
    source = (
        "Risk strength = 35% support risk + 30% spend decline + "
        "20% renewal urgency + 10% engagement gap + 5% last-contact gap."
    )
    return score, source


def _opportunity_strength(rec) -> tuple[float, str]:
    sb = getattr(rec, "score_breakdown", None)
    if sb is None:
        return 0.0, "Fallback: no score breakdown available."
    support_risk = float(getattr(sb, "support_risk", 0.0))
    score = (
        0.5 * float(getattr(sb, "growth_potential", 0.0))
        + 0.3 * float(getattr(sb, "campaign_response", 0.0))
        + 0.2 * max(0.0, 1.0 - support_risk)
    )
    source = (
        "Opportunity strength = 50% growth potential + 30% campaign response + "
        "20% account stability (1 - support risk)."
    )
    return score, source


def _effort_minutes(action: str) -> int:
    action_key = (action or "").lower().replace(" ", "_")
    if "escalation" in action_key:
        return 55
    if "renewal" in action_key:
        return 45
    if "optimization" in action_key:
        return 35
    if "reactivation" in action_key:
        return 30
    if "monitor" in action_key:
        return 10
    return 25


def _timeline(action: str) -> str:
    action_key = (action or "").lower().replace(" ", "_")
    if "escalation" in action_key:
        return "Today"
    if "renewal" in action_key:
        return "Within 48 hours"
    if "optimization" in action_key:
        return "This week"
    if "reactivation" in action_key:
        return "Today + follow-up in 72 hours"
    if "monitor" in action_key:
        return "Weekly checkpoint"
    return "Within 48 hours"


def _outcome(action: str) -> str:
    action_key = (action or "").lower().replace(" ", "_")
    if "escalation" in action_key:
        return "Stabilize account health and reduce churn exposure."
    if "renewal" in action_key:
        return "Increase renewal confidence and protect recurring revenue."
    if "optimization" in action_key:
        return "Improve adoption and recover value realization."
    if "reactivation" in action_key:
        return "Re-open stakeholder engagement and rebuild momentum."
    if "monitor" in action_key:
        return "Maintain coverage while prioritizing higher-risk accounts."
    return "Convert current signals into a concrete next customer commitment."


def _plan_item(rec, focus: str) -> SellerPlanItem:
    action = (getattr(rec, "recommended_action", "") or "").strip() or "Follow-up"
    return SellerPlanItem(
        account_id=getattr(rec, "account_id", ""),
        account_name=getattr(rec, "account_name", ""),
        priority_rank=int(getattr(rec, "priority_rank", 0)),
        recommended_action=action[:160],
        focus=focus,
        expected_outcome=_outcome(action),
        evidence_count=len(getattr(rec, "evidence", []) or []),
        estimated_effort_minutes=_effort_minutes(action),
        suggested_timeline=_timeline(action),
    )


def run_portfolio(
    recommendations: list,
    credentials: Optional[dict] = None,
    top_limit: int = 5,
) -> PortfolioRecommendation:
    """Portfolio Agent: where should the seller spend the next 4 hours?

    Input is the already-ranked recommendation list from the Governed Decision
    Engine. The Portfolio Agent NEVER re-ranks; it summarises and allocates.
    """
    analysis_pool = list(recommendations)
    top: List[PortfolioPriority] = []
    biggest_risk: Optional[PortfolioPriority] = None
    biggest_opportunity: Optional[PortfolioPriority] = None

    for idx, rec in enumerate(analysis_pool[: max(1, top_limit)]):
        item = _priority(
            rec,
            reason=getattr(rec, "priority_reason", ""),
            source="Deterministic governed priority rank from the recommendation engine.",
            score=float(getattr(rec, "priority_score", 0.0)),
        )
        if item.priority_rank <= 0:
            item.priority_rank = idx + 1
        top.append(item)

    risk_best_score = -1.0
    risk_source = ""
    for rec in analysis_pool:
        score, source = _risk_strength(rec)
        if score > risk_best_score:
            risk_best_score = score
            risk_source = source
            biggest_risk = _priority(
                rec,
                reason=getattr(rec, "risk_summary", "") or getattr(rec, "priority_reason", ""),
                source=source,
                score=score,
            )

    opp_best_score = -1.0
    opp_source = ""
    for rec in analysis_pool:
        score, source = _opportunity_strength(rec)
        if score > opp_best_score:
            opp_best_score = score
            opp_source = source
            biggest_opportunity = _priority(
                rec,
                reason=getattr(rec, "opportunity_summary", "") or getattr(rec, "priority_reason", ""),
                source=source,
                score=score,
            )

    total = len(analysis_pool)
    attention = sum(1 for r in analysis_pool if (r.recommended_action or "").lower() != "monitor")
    observations: List[str] = [
        f"{attention} of {total} accounts need attention this cycle.",
        f"Biggest risk and opportunity were derived independently across all {total} ranked accounts.",
        "Ranking, scoring and governance remain deterministic; this view only allocates execution time.",
    ]
    if biggest_risk:
        observations.append(f"Lead with risk on {biggest_risk.account_name}.")
    if biggest_opportunity:
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

    one_thing_pick = biggest_risk or (top[0] if top else None)
    one_thing_rec = None
    if one_thing_pick is not None:
        one_thing_rec = next((r for r in analysis_pool if getattr(r, "account_id", "") == one_thing_pick.account_id), None)

    morning_recs = analysis_pool[:3]
    afternoon_recs = analysis_pool[3:5]
    if biggest_opportunity and all(getattr(r, "account_id", "") != biggest_opportunity.account_id for r in afternoon_recs):
        opp_rec = next((r for r in analysis_pool if getattr(r, "account_id", "") == biggest_opportunity.account_id), None)
        if opp_rec is not None:
            afternoon_recs = [opp_rec, *afternoon_recs[:1]]

    daily_plan = DailySellerPlan(
        one_thing_today=_plan_item(one_thing_rec, "If you only do one thing today") if one_thing_rec is not None else None,
        morning_priorities=[_plan_item(r, "Morning priority") for r in morning_recs],
        afternoon_priorities=[_plan_item(r, "Afternoon priority") for r in afternoon_recs],
        end_of_day_followups=[
            "Update CRM note drafts for every completed conversation (approval still required before write-back).",
            "Flag blocked accounts for manager review with supporting evidence.",
            "Queue next-day follow-ups for accounts with pending commitments.",
        ],
    )

    return PortfolioRecommendation(
        generated_at=_now(),
        provider_used="deterministic",
        analysis_scope_count=total,
        top_priorities=top,
        biggest_risk=biggest_risk,
        biggest_opportunity=biggest_opportunity,
        biggest_risk_source=risk_source,
        biggest_opportunity_source=opp_source,
        daily_plan=daily_plan,
        resource_allocation=allocation,
        portfolio_observations=observations,
        executive_summary=executive_summary,
        confidence="medium",
        caveats=[
            "Portfolio Agent reasons over deterministic recommendations only -- it never re-ranks.",
            "All actions remain human-approved before any CRM write-back.",
        ],
    )
