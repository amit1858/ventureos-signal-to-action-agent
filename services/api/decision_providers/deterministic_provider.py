"""Deterministic decision provider -- the baseline, benchmark and fallback.

It does **not** call any model. It maps the deterministic
:class:`DecisionContext` (already computed by the existing engine) into the
shared :class:`ProviderDecision` contract. Because it only *presents* the
engine's output, it is the reference every LLM provider is compared against and
the safe fallback when an LLM provider fails.
"""

from __future__ import annotations

import time
from typing import List

from decision_providers.base import (
    DecisionContext,
    DecisionProvider,
    ProviderDecision,
    ProviderMode,
)


def _spend_phrase(pct: float) -> str:
    if pct <= -10:
        return f"spend is down about {abs(pct):.0f}% month over month"
    if pct >= 10:
        return f"spend is up about {pct:.0f}% month over month"
    return "spend is broadly stable month over month"


class DeterministicProvider(DecisionProvider):
    """The governed, reproducible reference engine."""

    id = "deterministic"
    label = "Deterministic"

    def model_name(self) -> str:
        return "deterministic-engine-v1"

    def configured(self) -> bool:
        return True

    def decide(self, context: DecisionContext) -> ProviderDecision:
        start = time.perf_counter()

        reasoning = self._reasoning(context)
        executive_summary = context.brief_executive_summary or self._executive_summary(context)
        business = context.brief_business_implication or self._business_implication(context)
        seller = context.brief_seller_implication or self._seller_implication(context)
        strategy = context.brief_conversation_strategy or self._strategy(context)
        opening = context.brief_opening_line or self._opening_line(context)
        crm_note = context.brief_crm_note or self._crm_note(context)

        caveats: List[str] = list(context.governance_caveats)
        caveats.append("Deterministic baseline: figures read directly from CRM fields, never generated.")

        latency_ms = int((time.perf_counter() - start) * 1000)
        return ProviderDecision(
            provider=self.id,
            model=self.model_name(),
            mode=ProviderMode.deterministic.value,
            risk_level=context.risk_level,
            opportunity_level=context.opportunity_level,
            recommended_action=context.deterministic_action,
            confidence=context.confidence_level,
            executive_summary=executive_summary,
            business_implication=business,
            seller_implication=seller,
            conversation_strategy=list(strategy),
            opening_line=opening,
            crm_note=crm_note,
            reasoning=reasoning,
            caveats=caveats,
            latency_ms=latency_ms,
            is_baseline=True,
            provider_error=None,
        )

    # -- deterministic narrative (used only if the brief had no text) -----

    def _reasoning(self, c: DecisionContext) -> List[str]:
        out: List[str] = []
        out.append(
            f"Priority score {c.priority_score:.2f}; risk {c.risk_level} ({c.risk_score:.2f}), "
            f"opportunity {c.opportunity_level} ({c.opportunity_score:.2f})."
        )
        if c.risk_factors:
            out.append("Risk drivers: " + "; ".join(c.risk_factors[:3]) + ".")
        if c.opportunity_factors:
            out.append("Opportunity drivers: " + "; ".join(c.opportunity_factors[:3]) + ".")
        out.append(
            f"Chosen action '{c.deterministic_action}' from the deterministic Action Agent: "
            f"{c.deterministic_action_detail}"
        )
        if c.external_enabled and c.external_summary:
            out.append("External context (advisory): " + c.external_summary)
        return out

    def _executive_summary(self, c: DecisionContext) -> str:
        return (
            f"{c.account_name} ({c.industry}, {c.segment}) shows {c.risk_level} risk and "
            f"{c.opportunity_level} opportunity. {_spend_phrase(c.spend_delta_pct).capitalize()}, "
            f"engagement is {c.engagement_score:.0f}/100 and renewal is in {c.renewal_days} days."
        )

    def _business_implication(self, c: DecisionContext) -> str:
        if c.risk_level == "high":
            return (
                f"Revenue from {c.account_name} is at elevated risk; without intervention this "
                "account could churn or contract at renewal."
            )
        if c.opportunity_level == "high":
            return (
                f"{c.account_name} is a strong expansion candidate; a well-timed motion could grow "
                "account value this quarter."
            )
        return f"{c.account_name} is broadly stable; protect the base and watch for change."

    def _seller_implication(self, c: DecisionContext) -> str:
        return (
            f"Recommended next step: {c.deterministic_action_detail} "
            "Lead with realized value and confirm priorities before any commercial motion."
        )

    def _strategy(self, c: DecisionContext) -> List[str]:
        steps = [
            "Open with account context and recent activity.",
            "Confirm current priorities and any blockers.",
        ]
        if c.risk_level == "high":
            steps.append("Surface the risk signals candidly and align on a resolution plan.")
        if c.opportunity_level in {"medium", "high"}:
            steps.append("Explore the growth opportunity grounded in current usage.")
        steps.append("Agree concrete next steps and a follow-up date.")
        return steps

    def _opening_line(self, c: DecisionContext) -> str:
        return (
            f"I was reviewing {c.account_name}'s account and wanted to connect on a couple of "
            "things I noticed so we can make sure you're getting full value."
        )

    def _crm_note(self, c: DecisionContext) -> str:
        return (
            f"{c.account_name}: deterministic baseline -- risk {c.risk_level}, opportunity "
            f"{c.opportunity_level}, action '{c.deterministic_action}'. "
            "Advisory; pending human approval before any CRM action."
        )
