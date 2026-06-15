"""Executive Intelligence Fusion (Phase 4.1).

Turns raw external search results into *seller-useful* executive context by
fusing them with the account's internal CRM trajectory. The output answers four
questions a seller actually cares about:

* what changed outside the CRM
* why it matters
* how it changes the conversation
* what the seller should do differently

Design rules (non-negotiable):

* **Explanatory only.** Nothing here changes ranking, scoring, governance,
  confidence or CRM write-back. It only narrates.
* **Internal CRM remains the source of truth.** External context is supporting
  intelligence; it is always hedged ("may", "could", "suggests") and cited.
* **Deterministic.** The same account + signals always yield the same brief, so
  the demo is stable and the result is cacheable.

The builder reads the ``Account`` fields read-only and never mutates anything.
"""

from __future__ import annotations

from typing import List, Optional, Tuple

from external_signals.base import (
    EXTERNAL_CONTEXT_CAVEAT,
    ExecutiveBrief,
    ExternalSignal,
    ExternalSource,
    IMPACT_NEGATIVE,
    IMPACT_POSITIVE,
)
from external_signals.signal_mapper import spend_direction

#: Standing caveat carried on every fused brief.
FUSION_CAVEAT = (
    "External context is supporting intelligence and should be verified before action."
)


# -- small read-only helpers ----------------------------------------------


def _num(account, attr: str, default: float = 0.0) -> float:
    try:
        return float(getattr(account, attr, default) or default)
    except (TypeError, ValueError):
        return default


def _spend_pct(account) -> Optional[int]:
    """Signed month-over-month spend change as a whole percent, or None."""
    prev = _num(account, "previous_month_spend")
    cur = _num(account, "current_month_spend")
    if prev <= 0:
        return None
    return int(round((cur - prev) / prev * 100))


def _sources_from_signals(signals: List[ExternalSignal]) -> List[ExternalSource]:
    sources: List[ExternalSource] = []
    seen = set()
    for s in signals:
        key = (s.url or "", s.title)
        if key in seen:
            continue
        seen.add(key)
        sources.append(
            ExternalSource(
                title=s.title,
                url=s.url,
                source=s.source,
                published_at=s.published_at,
            )
        )
    return sources


# -- internal / external prose --------------------------------------------


def internal_summary(account) -> str:
    """Plain-English summary of the account's internal CRM trajectory."""
    parts: List[str] = []

    spend = spend_direction(account)
    pct = _spend_pct(account)
    if spend == "down":
        parts.append(
            f"spend is down {abs(pct)}% month-over-month" if pct is not None else "spend is declining month-over-month"
        )
    elif spend == "up":
        parts.append(
            f"spend is up {pct}% month-over-month" if pct is not None else "spend is rising month-over-month"
        )

    support = _num(account, "support_risk_score")
    if support >= 60:
        parts.append(f"support risk is elevated ({int(support)}/100)")

    engagement = _num(account, "engagement_score")
    if engagement <= 45:
        parts.append(f"engagement is soft ({int(engagement)}/100)")

    last_contact = int(_num(account, "last_contact_days"))
    if last_contact >= 30:
        parts.append(f"no seller contact in {last_contact} days")

    renewal = int(_num(account, "renewal_days"))
    if 0 <= renewal <= 30:
        parts.append(f"renewal is {renewal} days out")
    elif renewal < 0:
        parts.append("renewal is already overdue")

    growth = _num(account, "growth_potential_score")
    campaign = _num(account, "campaign_response_score")
    if growth >= 65:
        parts.append(f"growth potential is high ({int(growth)}/100)")
    if campaign >= 65:
        parts.append(f"campaign response is strong ({int(campaign)}/100)")

    if not parts:
        return "Internal CRM signals are broadly stable, with no single metric standing out."

    name = getattr(account, "account_name", "this account")
    return f"For {name}, " + "; ".join(parts) + "."


def external_summary(signals: List[ExternalSignal]) -> str:
    """One- to two-sentence prose roll-up of the external signals."""
    if not signals:
        return "No notable public signals surfaced for this account in the latest scan."
    bullets = [s.summary for s in signals[:3] if s.summary]
    if not bullets:
        bullets = [s.title for s in signals[:3] if s.title]
    joined = " ".join(b.rstrip(".") + "." for b in bullets)
    return f"Public signals indicate: {joined}"


# -- confidence -----------------------------------------------------------


def _confidence(account, signals: List[ExternalSignal]) -> Tuple[str, str]:
    """Conservative confidence in the *external read* + a one-line rationale.

    External signals alone never earn "high"; that requires internal
    corroboration (the internal trajectory pointing the same way).
    """
    if not signals:
        return "low", "Minimal external context was found, so this read leans on internal signals."

    strong = sum(1 for s in signals if s.confidence == "high" and s.relevance in ("high", "medium"))
    negatives = sum(1 for s in signals if s.impact == IMPACT_NEGATIVE)
    positives = sum(1 for s in signals if s.impact == IMPACT_POSITIVE)
    spend = spend_direction(account)
    growth = _num(account, "growth_potential_score")

    corroborated = (negatives > positives and spend == "down") or (
        positives > negatives and (spend == "up" or growth >= 70)
    )

    if strong >= 2 and corroborated:
        return "high", "Multiple credible external signals align with the internal trajectory."
    if corroborated or strong >= 1:
        return "medium", "External signals broadly align with the internal trajectory."
    return "low", "External signals are limited or do not clearly align with the internal data."


# -- the fused narrative --------------------------------------------------


def _situation(account, signals: List[ExternalSignal]) -> str:
    """Classify the dominant situation to pick a narrative template."""
    negatives = sum(1 for s in signals if s.impact == IMPACT_NEGATIVE)
    positives = sum(1 for s in signals if s.impact == IMPACT_POSITIVE)
    spend = spend_direction(account)
    growth = _num(account, "growth_potential_score")
    support = _num(account, "support_risk_score")

    risk_internal = spend == "down" or support >= 60
    growth_internal = spend == "up" or growth >= 70

    if negatives > positives and risk_internal:
        return "risk_aligned"
    if positives > negatives and growth_internal:
        return "opportunity_aligned"
    if negatives > positives:
        return "external_headwind"
    if positives > negatives:
        return "external_tailwind"
    return "mixed"


def build_brief(account, signals: List[ExternalSignal]) -> ExecutiveBrief:
    """Build the Executive Intelligence Fusion brief for one account.

    Pure and deterministic. Uses cautious language throughout and cites every
    external source. Returns a fully-populated :class:`ExecutiveBrief`.
    """
    name = getattr(account, "account_name", "this account")
    industry = (getattr(account, "industry", "") or "the sector").strip()
    industry_l = industry.lower()

    intern = internal_summary(account)
    extern = external_summary(signals)
    confidence, conf_rationale = _confidence(account, signals)
    situation = _situation(account, signals)

    if situation == "risk_aligned":
        fused = (
            f"The internal decline at {name} coincides with external {industry_l} pressure. "
            f"Together these may point to tightening budgets and increased renewal sensitivity."
        )
        business = (
            f"If {industry_l} pressure persists, {name} may scrutinise spend and slow new investment, "
            f"making the upcoming renewal the near-term risk to protect."
        )
        seller = (
            "Lead with realised ROI and adoption value rather than discounting, and acknowledge the "
            "market context to build credibility."
        )
        strategy = (
            f"Open with empathy for the {industry_l} environment, quantify the value already delivered, "
            f"and frame renewal as cost-certainty rather than an upsell."
        )
        opening = (
            f"I've been following the pressure across {industry_l} lately — I wanted to share how teams "
            f"like {name} are protecting ROI and de-risking renewal in this environment."
        )
    elif situation == "opportunity_aligned":
        fused = (
            f"Internal momentum at {name} lines up with constructive external {industry_l} signals, "
            f"which may indicate headroom to expand the relationship."
        )
        business = (
            f"Favourable {industry_l} conditions plus internal growth signals suggest {name} could be "
            f"receptive to a forward-looking expansion or cross-sell conversation."
        )
        seller = (
            "Use the external tailwind to support a growth conversation, but anchor the specific ask in "
            "the internal usage and engagement evidence."
        )
        strategy = (
            f"Acknowledge the positive {industry_l} backdrop, connect it to where {name} is already "
            f"succeeding, and propose a concrete next step that scales that success."
        )
        opening = (
            f"With the momentum we're seeing across {industry_l}, it feels like a good moment to talk "
            f"about where {name} could scale next — building on what's already working."
        )
    elif situation == "external_headwind":
        fused = (
            f"External {industry_l} headwinds may raise urgency at {name}, even where internal signals "
            f"are not yet flashing red."
        )
        business = (
            f"Market pressure could change {name}'s priorities, so it is worth getting ahead of any "
            f"budget or sentiment shift before it shows up internally."
        )
        seller = (
            "Lead with stability, ROI and a clear value narrative, and treat the market context as a "
            "reason to engage proactively."
        )
        strategy = (
            f"Reference the {industry_l} context, reaffirm the value being delivered, and check in on "
            f"priorities before renewal planning begins."
        )
        opening = (
            f"I've been tracking what's happening across {industry_l} — I wanted to check in on how it's "
            f"shaping priorities for {name} this quarter."
        )
    elif situation == "external_tailwind":
        fused = (
            f"External {industry_l} signals look constructive for {name}; internal evidence does not yet "
            f"confirm a shift, so treat this as supporting context."
        )
        business = (
            f"Positive {industry_l} momentum may open a window, but the case for any expansion should "
            f"still rest on the internal usage and engagement signals."
        )
        seller = (
            "Use the external context to inform timing and talking points, and keep the ask grounded in "
            "internal evidence."
        )
        strategy = (
            f"Bring the {industry_l} tailwind as a conversation starter, then pivot to the account's own "
            f"data to qualify any opportunity."
        )
        opening = (
            f"There's some encouraging movement across {industry_l} right now — I'd love to compare notes "
            f"on what it might mean for {name}."
        )
    else:  # mixed / neutral
        fused = (
            f"External context for {name} is mixed, so it is best used to inform timing and talking "
            f"points rather than to drive the recommendation."
        )
        business = (
            f"With no clear external direction, the {name} recommendation should stay anchored in the "
            f"internal signals and evidence."
        )
        seller = (
            "Treat external context as colour for the conversation, not as a reason to change the plan."
        )
        strategy = (
            f"Lead with the internal evidence for {name}, and reference external context only where it "
            f"reinforces a specific point."
        )
        opening = (
            f"I wanted to connect on where {name} stands heading into the next cycle, and share a bit of "
            f"market context that may be useful."
        )

    caveats = [FUSION_CAVEAT, EXTERNAL_CONTEXT_CAVEAT, conf_rationale]
    if not signals:
        caveats.insert(
            0,
            "No live external signals were available for this account; this brief is driven by internal data.",
        )

    return ExecutiveBrief(
        account_id=getattr(account, "account_id", ""),
        account_name=name,
        internal_summary=intern,
        external_summary=extern,
        fused_insight=fused,
        business_implication=business,
        seller_implication=seller,
        recommended_conversation_strategy=strategy,
        suggested_opening_line=opening,
        confidence=confidence,
        caveats=caveats,
        sources=_sources_from_signals(signals),
    )
