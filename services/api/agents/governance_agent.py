"""Governance Agent.

Responsibility: decide whether there is enough evidence to act, compute a
confidence score, attach caveats when confidence is low, and -- critically --
guarantee that no action is ever auto-executed. ``requires_human_approval`` is
always True. This agent is what makes the workflow *governed*.
"""

from __future__ import annotations

from schemas.agent_outputs import (
    AccountContext,
    GovernanceAssessment,
    HealthAssessment,
    OpportunityAssessment,
)
from schemas.recommendation import ScoreBreakdown

AGENT_NAME = "Governance Agent"

CONFIDENCE_THRESHOLD = 0.55
HUMAN_APPROVAL_CAVEAT = "Human approval required before any message is sent or action is executed."


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


class GovernanceAgent:
    name = AGENT_NAME

    def run(
        self,
        ctx: AccountContext,
        breakdown: ScoreBreakdown,
        health: HealthAssessment,
        opportunity: OpportunityAssessment,
    ) -> GovernanceAssessment:
        evidence_count = len(health.evidence) + len(opportunity.evidence)

        strengths = [s.signal_strength for s in ctx.signals]
        avg_strength = sum(strengths) / len(strengths) if strengths else 0.0

        evidence_factor = min(evidence_count / 5.0, 1.0)
        signal_factor = min(len(ctx.signals) / 3.0, 1.0)
        confidence = _clamp01(
            0.15 + 0.45 * evidence_factor + 0.25 * avg_strength + 0.15 * signal_factor
        )

        caveats: list[str] = []
        if len(ctx.signals) == 0:
            caveats.append(
                "No first-party signals on file; recommendation is based on account metrics only."
            )
        if evidence_count < 2:
            caveats.append("Limited evidence available - manual review recommended before acting.")
        if confidence < CONFIDENCE_THRESHOLD:
            caveats.append(
                f"Confidence {confidence:.2f} is below the {CONFIDENCE_THRESHOLD:.2f} action "
                "threshold; verify context before outreach."
            )
        if ctx.positive_signal_count >= 1 and ctx.negative_signal_count >= 1:
            caveats.append("Mixed positive and negative signals; interpret with care.")
        caveats.append(HUMAN_APPROVAL_CAVEAT)

        if evidence_count == 0:
            status = "insufficient_evidence"
        elif confidence < CONFIDENCE_THRESHOLD:
            status = "review_required"
        else:
            status = "ok"

        return GovernanceAssessment(
            account_id=ctx.account.account_id,
            governance_status=status,
            confidence_score=round(confidence, 4),
            caveats=caveats,
            evidence_count=evidence_count,
            requires_human_approval=True,
        )
