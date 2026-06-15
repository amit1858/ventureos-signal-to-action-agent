"""Mapping + summarization helpers shared by external-signal providers.

Two jobs:

1. Classify free-form search results (e.g. from Serper) into the bounded
   :data:`SIGNAL_TYPES` taxonomy and a seller-facing ``impact``.
2. Roll a list of signals up into a deterministic account-level narrative that
   *connects* the outside-in context to the account's internal trajectory --
   without ever changing the deterministic numbers.

Everything here is pure and deterministic so the same inputs always yield the
same narrative (important for caching and for a stable demo).
"""

from __future__ import annotations

from typing import List

from external_signals.base import (
    ExternalSignal,
    ExternalSummary,
    IMPACT_NEGATIVE,
    IMPACT_NEUTRAL,
    IMPACT_POSITIVE,
)

# Keyword -> signal_type. Ordered: the first matching bucket wins.
_TYPE_KEYWORDS = [
    ("layoffs", ["layoff", "lay off", "job cut", "retrench", "downsiz", "fired"]),
    ("funding", ["funding", "raises", "raised", "series ", "investment", "valuation", "ipo", "fundraise"]),
    ("leadership_change", ["ceo", "cfo", "coo", "appoints", "steps down", "resign", "new chief", "named "]),
    ("expansion", ["expansion", "expands", "launch", "new market", "opens", "scale", "enters"]),
    ("regulatory", ["regulat", "compliance", "rbi", "sebi", "ban", "probe", "penalty", "lawsuit", "antitrust"]),
    ("competitive_pressure", ["competit", "rival", "market share", "price war", "undercut"]),
    ("macroeconomic", ["inflation", "gdp", "economy", "interest rate", "slowdown", "recession", "demand"]),
    ("market_trend", ["trend", "sector", "industry", "market", "consolidat", "margin"]),
]

_NEGATIVE_TYPES = {"layoffs", "regulatory", "competitive_pressure", "customer_risk_signal"}
_POSITIVE_TYPES = {"funding", "expansion", "customer_growth_signal"}


def classify_signal_type(text: str) -> str:
    """Best-effort classification of a raw headline/snippet into a signal type."""
    t = (text or "").lower()
    for stype, kws in _TYPE_KEYWORDS:
        if any(k in t for k in kws):
            return stype
    return "company_news"


def impact_for_type(signal_type: str) -> str:
    """Map a signal type to a seller-facing direction."""
    if signal_type in _NEGATIVE_TYPES:
        return IMPACT_NEGATIVE
    if signal_type in _POSITIVE_TYPES:
        return IMPACT_POSITIVE
    return IMPACT_NEUTRAL


def spend_direction(account) -> str:
    """'down' | 'up' | 'flat' from month-over-month spend (read-only)."""
    prev = float(getattr(account, "previous_month_spend", 0) or 0)
    cur = float(getattr(account, "current_month_spend", 0) or 0)
    if prev <= 0:
        return "flat"
    delta = (cur - prev) / prev
    if delta <= -0.05:
        return "down"
    if delta >= 0.05:
        return "up"
    return "flat"


def summarize(account, signals: List[ExternalSignal]) -> ExternalSummary:
    """Deterministic account-level external narrative + seller takeaway.

    The takeaway deliberately *frames* the external context against the internal
    trajectory (spend direction, growth potential) using hedged language, so the
    seller treats it as supporting context -- never as a directive.
    """
    if not signals:
        return ExternalSummary(summary="", seller_takeaway="")

    name = getattr(account, "account_name", "this account")
    industry = (getattr(account, "industry", "the sector") or "the sector").lower()

    bullets = [s.summary for s in signals[:4] if s.summary]
    summary = "\n".join(f"\u2022 {b}" for b in bullets)

    negatives = sum(1 for s in signals if s.impact == IMPACT_NEGATIVE)
    positives = sum(1 for s in signals if s.impact == IMPACT_POSITIVE)
    spend = spend_direction(account)
    growth = float(getattr(account, "growth_potential_score", 0) or 0)

    if negatives > positives and spend == "down":
        takeaway = (
            f"Internal spend is down and external {industry} pressure may make {name} more "
            f"renewal-sensitive. Lead with adoption value and ROI, not discounting."
        )
    elif positives > negatives and (spend == "up" or growth >= 70):
        takeaway = (
            f"Internal momentum is positive and external {industry} tailwinds suggest expansion "
            f"headroom at {name}. This may be a good moment to open a growth or cross-sell conversation."
        )
    elif negatives > positives:
        takeaway = (
            f"External {industry} headwinds may increase urgency at {name}. Acknowledge the market "
            f"context and lead with stability, ROI and a clear value narrative."
        )
    elif positives > negatives:
        takeaway = (
            f"External {industry} signals look constructive for {name}. Use them to support a forward-"
            f"looking conversation, but anchor the ask in the internal evidence."
        )
    else:
        takeaway = (
            f"External context for {name} is mixed. Use it to inform timing and talking points, but "
            f"keep the recommendation anchored in the internal signals and evidence."
        )

    return ExternalSummary(summary=summary, seller_takeaway=takeaway)
