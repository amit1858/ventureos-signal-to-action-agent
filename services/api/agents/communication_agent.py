"""Communication Agent.

Responsibility: turn the chosen action into seller-ready communications -- an
email draft, a call script, and a short voice summary -- in plain, business
friendly language. This is the one agent that calls the model adapter, and it
only runs for the top-ranked accounts (per the "model only explains top
accounts" principle). For 'monitor' actions it deliberately produces an internal
note instead of outreach, because those accounts should not be contacted yet.
"""

from __future__ import annotations

from model_adapters import GenerationRequest, GenerationTask, ModelAdapter
from schemas.agent_outputs import (
    AccountContext,
    ActionProposal,
    CommunicationDraft,
    HealthAssessment,
    OpportunityAssessment,
)
from schemas.recommendation import ScoreBreakdown

AGENT_NAME = "Communication Agent"


def _lead_lower(text: str) -> str:
    """Lowercase only the first character (preserves acronyms like MoM/NPS)."""
    return text[0].lower() + text[1:] if text else text


_REASON_BY_ACTION = {
    "support_escalation": "want to make sure we resolve the recent support issues quickly",
    "renewal_prep": "your renewal is coming up and I want to make it a smooth, valuable step",
    "optimization_review": "noticed your usage has shifted recently and want to help you get full value",
    "reactivation": "noticed activity has dipped recently and want to help turn it around",
    "follow_up": "saw your team's recent interest and wanted to follow up with something useful",
}


class CommunicationAgent:
    name = AGENT_NAME

    def __init__(self, adapter: ModelAdapter):
        self.adapter = adapter

    def run(
        self,
        ctx: AccountContext,
        action: ActionProposal,
        health: HealthAssessment,
        opportunity: OpportunityAssessment,
        breakdown: ScoreBreakdown,
        priority_rank: int,
    ) -> CommunicationDraft:
        account = ctx.account

        # Do-not-contact accounts get an internal note, never outreach.
        if action.action_type == "monitor":
            note = (
                f"No outreach recommended for {account.account_name} this week. "
                "Internal note: the account is stable or evidence is thin. Continue monitoring "
                "and revisit if signals change."
            )
            return CommunicationDraft(
                account_id=account.account_id,
                draft_email=note,
                call_script="No call recommended this week - monitor only.",
                voice_summary=f"{account.account_name}: monitor only, no outreach this week.",
            )

        payload = {
            "recommended_action": action.recommended_action,
            "headline_reason": _REASON_BY_ACTION.get(action.action_type, "wanted to check in proactively"),
            "headline_risk": _lead_lower(health.risk_factors[0]) if health.risk_factors else "no major risks right now",
            "headline_opportunity": (
                _lead_lower(opportunity.opportunity_factors[0])
                if opportunity.opportunity_factors
                else "a clear path to more value"
            ),
            "spend_delta_pct": ctx.spend_delta_pct,
            "priority_rank": priority_rank,
        }

        email = self.adapter.generate(
            GenerationRequest(task=GenerationTask.email, account_name=account.account_name, payload=payload)
        ).text
        call_script = self.adapter.generate(
            GenerationRequest(task=GenerationTask.call_script, account_name=account.account_name, payload=payload)
        ).text
        voice = self.adapter.generate(
            GenerationRequest(task=GenerationTask.voice_summary, account_name=account.account_name, payload=payload)
        ).text

        return CommunicationDraft(
            account_id=account.account_id,
            draft_email=email,
            call_script=call_script,
            voice_summary=voice,
        )
