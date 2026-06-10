"""Deterministic scoring service.

This stage runs BEFORE any model/LLM reasoning. It is fully deterministic and
auditable -- the model layer only *explains* what this service decides. Keeping
ranking in code (not in a prompt) is core to the "governed, not chatbot" design.

priority_score =
      support_risk      * 0.20
    + spend_decline     * 0.20
    + growth_potential  * 0.20
    + renewal_urgency   * 0.15
    + campaign_response * 0.10
    + engagement_gap    * 0.10
    + last_contact_gap  * 0.05

All component sub-scores are normalized to 0..1 before weighting.
"""

from __future__ import annotations

from typing import List, Tuple

from schemas.account import Account
from schemas.recommendation import ScoreBreakdown

WEIGHTS = {
    "support_risk": 0.20,
    "spend_decline": 0.20,
    "growth_potential": 0.20,
    "renewal_urgency": 0.15,
    "campaign_response": 0.10,
    "engagement_gap": 0.10,
    "last_contact_gap": 0.05,
}

# Human-readable labels for the largest weighted contributors.
_DRIVER_LABELS = {
    "support_risk": "elevated support risk",
    "spend_decline": "declining spend",
    "growth_potential": "strong growth potential",
    "renewal_urgency": "an approaching renewal",
    "campaign_response": "strong campaign response",
    "engagement_gap": "low engagement",
    "last_contact_gap": "a long gap since last contact",
}

# A component must contribute at least this (weighted) to be called a "driver".
_DRIVER_THRESHOLD = 0.05


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def spend_decline_score(account: Account) -> float:
    """Fraction of month-over-month spend lost (0 if spend is flat or growing)."""
    prev = account.previous_month_spend
    if prev <= 0:
        return 0.0
    return _clamp01((prev - account.current_month_spend) / prev)


def renewal_urgency_score(account: Account) -> float:
    """1.0 if overdue, scaling linearly to 0 at 90 days out."""
    days = account.renewal_days
    if days <= 0:
        return 1.0
    if days >= 90:
        return 0.0
    return _clamp01(1.0 - days / 90.0)


def last_contact_gap_score(account: Account) -> float:
    """Saturates at 60 days since last contact."""
    return _clamp01(account.last_contact_days / 60.0)


def compute_breakdown(account: Account) -> ScoreBreakdown:
    """Compute every sub-score and the weighted priority score."""
    support_risk = _clamp01(account.support_risk_score / 100.0)
    spend_decline = spend_decline_score(account)
    growth_potential = _clamp01(account.growth_potential_score / 100.0)
    renewal_urgency = renewal_urgency_score(account)
    campaign_response = _clamp01(account.campaign_response_score / 100.0)
    engagement_gap = _clamp01(1.0 - account.engagement_score / 100.0)
    last_contact_gap = last_contact_gap_score(account)

    components = {
        "support_risk": support_risk,
        "spend_decline": spend_decline,
        "growth_potential": growth_potential,
        "renewal_urgency": renewal_urgency,
        "campaign_response": campaign_response,
        "engagement_gap": engagement_gap,
        "last_contact_gap": last_contact_gap,
    }
    priority = sum(components[k] * WEIGHTS[k] for k in WEIGHTS)

    return ScoreBreakdown(
        support_risk=round(support_risk, 4),
        spend_decline=round(spend_decline, 4),
        growth_potential=round(growth_potential, 4),
        renewal_urgency=round(renewal_urgency, 4),
        campaign_response=round(campaign_response, 4),
        engagement_gap=round(engagement_gap, 4),
        last_contact_gap=round(last_contact_gap, 4),
        priority_score=round(_clamp01(priority), 4),
    )


def weighted_contributions(breakdown: ScoreBreakdown) -> List[Tuple[str, float]]:
    """Return (component, weighted_value) sorted high to low."""
    values = breakdown.model_dump()
    contribs = [(k, values[k] * WEIGHTS[k]) for k in WEIGHTS]
    return sorted(contribs, key=lambda kv: kv[1], reverse=True)


def top_drivers(breakdown: ScoreBreakdown, n: int = 3) -> List[str]:
    """Human-readable top drivers of the priority score."""
    drivers = [
        _DRIVER_LABELS[name]
        for name, weighted in weighted_contributions(breakdown)
        if weighted >= _DRIVER_THRESHOLD
    ]
    return drivers[:n]


def rank_accounts(accounts: List[Account]) -> List[Tuple[Account, ScoreBreakdown]]:
    """Score and sort all accounts by descending priority."""
    scored = [(a, compute_breakdown(a)) for a in accounts]
    scored.sort(key=lambda pair: pair[1].priority_score, reverse=True)
    return scored
