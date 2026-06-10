"""Opportunity Agent.

Responsibility: detect growth potential -- positive campaign response, usage
growth, favourable spend movement, high-fit segment -- and emit a typed
:class:`OpportunityAssessment` with an opportunity score, rationale, and
attributable evidence.
"""

from __future__ import annotations

from schemas.agent_outputs import AccountContext, OpportunityAssessment
from schemas.recommendation import Evidence, ScoreBreakdown
from schemas.signal import SignalPolarity

AGENT_NAME = "Opportunity Agent"

# Segments we treat as high-fit for proactive growth motions.
_HIGH_FIT_SEGMENTS = {"SMB", "Mid-Market"}


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


class OpportunityAgent:
    name = AGENT_NAME

    def run(self, ctx: AccountContext, breakdown: ScoreBreakdown) -> OpportunityAssessment:
        account = ctx.account
        factors: list[str] = []
        evidence: list[Evidence] = []

        if account.growth_potential_score >= 60:
            factors.append("High growth potential")
            evidence.append(
                Evidence(
                    source_agent=self.name,
                    label=f"Growth potential {int(account.growth_potential_score)}/100",
                    detail="Modeled growth potential is strong for this account.",
                    source_system="derived",
                    polarity="positive",
                    strength=_clamp01(account.growth_potential_score / 100),
                )
            )

        if account.campaign_response_score >= 65:
            factors.append("Strong campaign response")
            evidence.append(
                Evidence(
                    source_agent=self.name,
                    label=f"Campaign response {int(account.campaign_response_score)}/100",
                    detail="The account is actively responding to marketing campaigns.",
                    source_system="Marketing",
                    polarity="positive",
                    strength=_clamp01(account.campaign_response_score / 100),
                )
            )

        if ctx.spend_delta_pct >= 5:
            factors.append(f"Rising spend (+{ctx.spend_delta_pct:.0f}%)")
            evidence.append(
                Evidence(
                    source_agent=self.name,
                    label=f"Spend up {ctx.spend_delta_pct:.0f}%",
                    detail="Month-over-month spend is increasing, signaling expansion appetite.",
                    source_system="Billing",
                    polarity="positive",
                    strength=_clamp01(ctx.spend_delta_pct / 40),
                )
            )

        if account.product_usage_score >= 65:
            factors.append("Healthy product usage")
            evidence.append(
                Evidence(
                    source_agent=self.name,
                    label=f"Usage {int(account.product_usage_score)}/100",
                    detail="Strong product usage provides a foundation to expand on.",
                    source_system="Telemetry",
                    polarity="positive",
                    strength=_clamp01(account.product_usage_score / 100),
                )
            )

        if account.segment in _HIGH_FIT_SEGMENTS and account.growth_potential_score >= 55:
            factors.append(f"High-fit {account.segment} segment")

        # Pull positive raw signals through as evidence.
        for s in ctx.signals:
            if s.positive_or_negative == SignalPolarity.positive:
                evidence.append(
                    Evidence(
                        source_agent="Signal Ingestion Agent",
                        label=s.signal_type.replace("_", " ").title(),
                        detail=s.signal_description,
                        source_system=s.source_system,
                        polarity="positive",
                        strength=s.signal_strength,
                    )
                )

        spend_growth_norm = _clamp01(ctx.spend_delta_pct / 40) if ctx.spend_delta_pct > 0 else 0.0
        opportunity_score = _clamp01(
            0.40 * breakdown.growth_potential
            + 0.30 * breakdown.campaign_response
            + 0.20 * _clamp01(account.product_usage_score / 100)
            + 0.10 * spend_growth_norm
        )

        if factors:
            summary = f"{account.account_name} has upside from " + ", ".join(f.lower() for f in factors[:3]) + "."
        else:
            summary = f"{account.account_name} shows limited near-term expansion signal."

        return OpportunityAssessment(
            account_id=account.account_id,
            opportunity_score=round(opportunity_score, 4),
            opportunity_factors=factors,
            opportunity_summary=summary,
            evidence=evidence,
        )
