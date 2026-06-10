"""Action Agent.

Responsibility: convert the risk/opportunity picture into a single, concrete
next-best action with a typed ``action_type``. Deterministic priority rules keep
the recommendation explainable and reproducible.

action_type in: support_escalation | renewal_prep | optimization_review |
                reactivation | follow_up | monitor
"""

from __future__ import annotations

from schemas.agent_outputs import (
    AccountContext,
    ActionProposal,
    GovernanceAssessment,
    HealthAssessment,
    OpportunityAssessment,
)
from schemas.recommendation import ScoreBreakdown

AGENT_NAME = "Action Agent"


class ActionAgent:
    name = AGENT_NAME

    def run(
        self,
        ctx: AccountContext,
        breakdown: ScoreBreakdown,
        health: HealthAssessment,
        opportunity: OpportunityAssessment,
        governance: GovernanceAssessment,
    ) -> ActionProposal:
        account = ctx.account
        has_support_ticket = any(s.signal_type == "support_ticket" for s in ctx.signals)

        # 1) Support problems trump commercial motions.
        if breakdown.support_risk >= 0.60 or (has_support_ticket and account.support_risk_score >= 60):
            return ActionProposal(
                account_id=account.account_id,
                action_type="support_escalation",
                recommended_action="Escalate the open support issue and align on a concrete resolution plan.",
                rationale="Support risk is the dominant driver; resolve it before any commercial motion.",
                urgency="this_week",
            )

        # 2) Imminent renewal needs proactive prep.
        if account.renewal_days <= 30:
            return ActionProposal(
                account_id=account.account_id,
                action_type="renewal_prep",
                recommended_action="Prepare and schedule the renewal conversation with a value recap.",
                rationale="Renewal is imminent and needs proactive engagement to de-risk it.",
                urgency="this_week",
            )

        # 3) Declining spend -- optimize if there's upside, otherwise reactivate.
        if breakdown.spend_decline >= 0.15:
            if opportunity.opportunity_score >= 0.50:
                return ActionProposal(
                    account_id=account.account_id,
                    action_type="optimization_review",
                    recommended_action="Offer a value/optimization review to reverse the decline and re-engage.",
                    rationale="Spend is declining despite real growth potential.",
                    urgency="this_week",
                )
            return ActionProposal(
                account_id=account.account_id,
                action_type="reactivation",
                recommended_action="Send a reactivation outreach to understand the drop and re-establish value.",
                rationale="Spend is declining and engagement is weakening.",
                urgency="this_week",
            )

        # 4) Engaged with marketing but no seller follow-up.
        if account.campaign_response_score >= 65 and account.last_contact_days > 30:
            return ActionProposal(
                account_id=account.account_id,
                action_type="follow_up",
                recommended_action="Follow up on recent campaign engagement with a tailored next step.",
                rationale="The account engaged with marketing but has had no seller follow-up.",
                urgency="this_week",
            )

        # 5) Strong opportunity, low risk -- expand.
        if opportunity.opportunity_score >= 0.60 and health.risk_score < 0.40:
            return ActionProposal(
                account_id=account.account_id,
                action_type="follow_up",
                recommended_action="Schedule an expansion conversation to capture the open growth opportunity.",
                rationale="Strong opportunity with low risk - a good moment to expand.",
                urgency="this_week",
            )

        # 6) Not enough evidence -- hold and review.
        if governance.governance_status == "insufficient_evidence":
            return ActionProposal(
                account_id=account.account_id,
                action_type="monitor",
                recommended_action="Hold outreach and gather more context; route for manual review.",
                rationale="Evidence is insufficient to recommend a confident action.",
                urgency="review",
            )

        # 7) Stable -- do not contact yet.
        if health.risk_score < 0.30 and opportunity.opportunity_score < 0.45:
            return ActionProposal(
                account_id=account.account_id,
                action_type="monitor",
                recommended_action="No outreach needed yet; continue monitoring this account.",
                rationale="Account is stable with no pressing risk or opportunity.",
                urgency="monitor",
            )

        # 8) Balanced default.
        return ActionProposal(
            account_id=account.account_id,
            action_type="follow_up",
            recommended_action="Schedule a proactive check-in to confirm health and surface needs.",
            rationale="A balanced profile warrants a light-touch proactive contact.",
            urgency="this_week",
        )
