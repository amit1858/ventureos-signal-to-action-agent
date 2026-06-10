"""Account Health Agent.

Responsibility: detect risk -- declining spend, low engagement, support issues,
inactivity, renewal risk -- and emit a typed :class:`HealthAssessment` with a
risk score and attributable evidence. Fully deterministic; the model layer only
phrases the summary later, for top accounts.
"""

from __future__ import annotations

from schemas.agent_outputs import AccountContext, HealthAssessment
from schemas.recommendation import Evidence, ScoreBreakdown
from schemas.signal import SignalPolarity

AGENT_NAME = "Account Health Agent"


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


class AccountHealthAgent:
    name = AGENT_NAME

    def run(self, ctx: AccountContext, breakdown: ScoreBreakdown) -> HealthAssessment:
        account = ctx.account
        factors: list[str] = []
        evidence: list[Evidence] = []

        if breakdown.spend_decline >= 0.10:
            pct = round(breakdown.spend_decline * 100)
            factors.append(f"Declining spend ({pct}% MoM)")
            evidence.append(
                Evidence(
                    source_agent=self.name,
                    label=f"Spend down {pct}%",
                    detail=(
                        f"Spend fell from {account.previous_month_spend:,.0f} to "
                        f"{account.current_month_spend:,.0f} month over month."
                    ),
                    source_system="Billing",
                    polarity="negative",
                    strength=_clamp01(breakdown.spend_decline * 1.5),
                )
            )

        if account.support_risk_score >= 50:
            factors.append("Elevated support risk")
            evidence.append(
                Evidence(
                    source_agent=self.name,
                    label=f"Support risk {int(account.support_risk_score)}/100",
                    detail="Support risk score is above the attention threshold.",
                    source_system="Support",
                    polarity="negative",
                    strength=_clamp01(account.support_risk_score / 100),
                )
            )

        if account.engagement_score < 45:
            factors.append("Low engagement")
            evidence.append(
                Evidence(
                    source_agent=self.name,
                    label=f"Engagement {int(account.engagement_score)}/100",
                    detail="Engagement is low, indicating weakening stakeholder attention.",
                    source_system="CRM",
                    polarity="negative",
                    strength=_clamp01(1 - account.engagement_score / 100),
                )
            )

        if account.last_contact_days > 30:
            factors.append(f"No contact in {account.last_contact_days} days")
            evidence.append(
                Evidence(
                    source_agent=self.name,
                    label=f"{account.last_contact_days}d since contact",
                    detail="The account has gone without a seller touch for over a month.",
                    source_system="CRM",
                    polarity="negative",
                    strength=_clamp01(account.last_contact_days / 60),
                )
            )

        if account.renewal_days <= 30:
            factors.append(f"Renewal in {account.renewal_days} days")
            evidence.append(
                Evidence(
                    source_agent=self.name,
                    label=f"Renewal in {account.renewal_days}d",
                    detail="A renewal is imminent and unmanaged renewals are a churn risk.",
                    source_system="CRM",
                    polarity="negative" if account.renewal_days <= 14 else "neutral",
                    strength=breakdown.renewal_urgency,
                )
            )

        # Pull negative raw signals through as first-class evidence.
        for s in ctx.signals:
            if s.positive_or_negative == SignalPolarity.negative:
                evidence.append(
                    Evidence(
                        source_agent="Signal Ingestion Agent",
                        label=s.signal_type.replace("_", " ").title(),
                        detail=s.signal_description,
                        source_system=s.source_system,
                        polarity="negative",
                        strength=s.signal_strength,
                    )
                )

        risk_score = _clamp01(
            0.35 * breakdown.support_risk
            + 0.30 * breakdown.spend_decline
            + 0.20 * breakdown.engagement_gap
            + 0.15 * breakdown.renewal_urgency
        )

        if factors:
            summary = f"{account.account_name} shows " + ", ".join(f.lower() for f in factors[:3]) + "."
        else:
            summary = f"{account.account_name} looks healthy with no material risk factors."

        return HealthAssessment(
            account_id=account.account_id,
            risk_score=round(risk_score, 4),
            risk_factors=factors,
            health_summary=summary,
            evidence=evidence,
        )
