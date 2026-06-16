"""Executive Decision Brief — intelligence fusion (Phase 4.1, extended in 4.2).

Turns raw external search results into a *seller-useful* executive decision
brief by fusing them with the account's internal CRM trajectory. Phase 4.1
established the fused narrative (what changed, why it matters, how it changes the
conversation, what to do differently). Phase 4.2 adds an executive summary, a
structured internal-evidence table, synthesized external intelligence, an ordered
conversation strategy, explicit "what not to do" cautions and an advisory,
approval-gated CRM write-back recommendation.

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
    CRMTaskRecommendation,
    CRMWritebackRecommendation,
    ExecutiveBrief,
    ExternalSignal,
    ExternalSource,
    IMPACT_NEGATIVE,
    IMPACT_NEUTRAL,
    IMPACT_POSITIVE,
    InternalEvidenceItem,
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


# -- Phase 4.2: Executive Decision Brief builders -------------------------


def _fmt_score(v: float) -> str:
    return f"{int(round(v))}/100"


def _internal_evidence(account) -> List[InternalEvidenceItem]:
    """Structured, read-only view of the internal CRM evidence.

    The numbers come straight from the deterministic engine's account fields;
    this only labels and tones them for presentation. Always returns the same
    six rows so the executive table reads consistently.
    """
    items: List[InternalEvidenceItem] = []

    spend = spend_direction(account)
    pct = _spend_pct(account)
    if spend == "down":
        value = f"Down {abs(pct)}% MoM" if pct is not None else "Declining MoM"
        items.append(InternalEvidenceItem(label="Spend trend", value=value, tone=IMPACT_NEGATIVE))
    elif spend == "up":
        value = f"Up {pct}% MoM" if pct is not None else "Rising MoM"
        items.append(InternalEvidenceItem(label="Spend trend", value=value, tone=IMPACT_POSITIVE))
    else:
        items.append(InternalEvidenceItem(label="Spend trend", value="Flat MoM", tone=IMPACT_NEUTRAL))

    eng = _num(account, "engagement_score")
    items.append(
        InternalEvidenceItem(
            label="Engagement",
            value=f"{_fmt_score(eng)} ({'soft' if eng <= 45 else 'healthy' if eng >= 65 else 'steady'})",
            tone=IMPACT_NEGATIVE if eng <= 45 else IMPACT_POSITIVE if eng >= 70 else IMPACT_NEUTRAL,
        )
    )

    usage = _num(account, "product_usage_score")
    items.append(
        InternalEvidenceItem(
            label="Product usage",
            value=f"{_fmt_score(usage)} ({'low' if usage <= 40 else 'strong' if usage >= 70 else 'moderate'})",
            tone=IMPACT_NEGATIVE if usage <= 40 else IMPACT_POSITIVE if usage >= 70 else IMPACT_NEUTRAL,
        )
    )

    support = _num(account, "support_risk_score")
    items.append(
        InternalEvidenceItem(
            label="Support risk",
            value=f"{_fmt_score(support)} ({'elevated' if support >= 60 else 'low' if support <= 30 else 'moderate'})",
            tone=IMPACT_NEGATIVE if support >= 60 else IMPACT_POSITIVE if support <= 30 else IMPACT_NEUTRAL,
        )
    )

    renewal = int(_num(account, "renewal_days"))
    if renewal < 0:
        items.append(InternalEvidenceItem(label="Renewal timing", value="Overdue", tone=IMPACT_NEGATIVE))
    else:
        items.append(
            InternalEvidenceItem(
                label="Renewal timing",
                value=f"{renewal} days out",
                tone=IMPACT_NEGATIVE if renewal <= 30 else IMPACT_NEUTRAL,
            )
        )

    growth = _num(account, "growth_potential_score")
    items.append(
        InternalEvidenceItem(
            label="Growth potential",
            value=f"{_fmt_score(growth)} ({'high' if growth >= 65 else 'limited' if growth <= 35 else 'moderate'})",
            tone=IMPACT_POSITIVE if growth >= 65 else IMPACT_NEUTRAL,
        )
    )
    return items


#: Synthesized theme per signal type (NOT a raw article dump).
_THEME_BY_TYPE = {
    "funding": "Capital-markets activity (funding/IPO) suggests an investment-led growth posture.",
    "expansion": "Expansion into new markets or formats points to an offensive, growth-oriented stance.",
    "leadership_change": "Leadership changes may reset priorities and decision-making authority.",
    "layoffs": "Cost actions signal efficiency pressure and tighter discretionary spend.",
    "regulatory": "Regulatory or compliance developments could reshape near-term priorities.",
    "competitive_pressure": "Competitive intensity in the segment appears to be rising.",
    "macroeconomic": "Macro conditions may be shifting demand and budget sensitivity.",
    "market_trend": "Sector dynamics (margins, consolidation) are in flux.",
    "customer_growth_signal": "Public signals point to customer-side growth momentum.",
    "customer_risk_signal": "Public signals hint at customer-side risk worth monitoring.",
    "company_news": "Active news flow indicates ongoing developments worth tracking.",
}


def _external_intelligence(signals: List[ExternalSignal]) -> List[str]:
    """Synthesize the external signals into a few themed points (max four).

    Deliberately *not* an article dump: signals are collapsed to their type-level
    theme, de-duplicated, in relevance order (the order the provider returned).
    """
    if not signals:
        return []
    themes: List[str] = []
    for s in signals:
        theme = _THEME_BY_TYPE.get(s.signal_type)
        if theme and theme not in themes:
            themes.append(theme)
        if len(themes) >= 4:
            break
    if not themes:
        themes.append(_THEME_BY_TYPE["company_news"])
    return themes


def _executive_summary(account, name: str, industry_l: str, situation: str) -> str:
    """One-paragraph 'what is happening', grounded in a concrete internal fact."""
    spend = spend_direction(account)
    pct = _spend_pct(account)
    if spend == "down" and pct is not None:
        internal_clause = f"internal spend is down {abs(pct)}% month-over-month"
    elif spend == "up" and pct is not None:
        internal_clause = f"internal spend is up {pct}% month-over-month"
    elif _num(account, "engagement_score") <= 45:
        internal_clause = "internal engagement is the metric to watch"
    else:
        internal_clause = "internal signals are broadly steady"

    templates = {
        "risk_aligned": (
            f"At {name}, {internal_clause} just as external {industry_l} pressure builds. The internal "
            f"and external pictures reinforce each other, pointing to a tighter budget environment and "
            f"rising renewal sensitivity."
        ),
        "opportunity_aligned": (
            f"{name} is showing internal momentum — {internal_clause} — at the same time external "
            f"{industry_l} signals turn constructive, which together suggest real headroom to expand "
            f"the relationship."
        ),
        "external_headwind": (
            f"External {industry_l} conditions are deteriorating while {name}'s internal signals are not "
            f"yet flashing red ({internal_clause}) — an early-warning pattern worth getting ahead of."
        ),
        "external_tailwind": (
            f"External {industry_l} signals look encouraging for {name}, but the internal evidence "
            f"({internal_clause}) does not yet corroborate a shift, so the positive read remains unconfirmed."
        ),
        "mixed": (
            f"The picture for {name} is mixed: external {industry_l} context points in no single "
            f"direction, so the internal signals ({internal_clause}) remain the most reliable guide."
        ),
    }
    return templates[situation]


def _why_it_matters(name: str, situation: str) -> str:
    """Why the seller should care -- distinct from the business implication."""
    return {
        "risk_aligned": (
            f"This is the moment a healthy account can quietly become an at-risk renewal. Acting now — "
            f"with value, not discounts — protects the {name} relationship before procurement reframes it."
        ),
        "opportunity_aligned": (
            "Windows like this do not stay open long. Engaging while internal usage and external momentum "
            "align gives the strongest possible footing for an expansion conversation."
        ),
        "external_headwind": (
            "Waiting for the internal numbers to confirm the headwind usually means reacting late. A "
            "proactive check-in now preserves trust and keeps options open."
        ),
        "external_tailwind": (
            "Positive headlines are easy to over-read. Treating them as a prompt to verify — not as proof — "
            "keeps the recommendation credible and the seller's judgement intact."
        ),
        "mixed": (
            "With no clear external steer, the seller's time is best spent reinforcing what the internal "
            "evidence already supports rather than chasing the news."
        ),
    }[situation]


def _strategy_steps(name: str, industry_l: str, situation: str) -> List[str]:
    """An ordered, practical outreach plan for the conversation."""
    return {
        "risk_aligned": [
            f"Open with empathy for the {industry_l} environment to establish credibility.",
            "Quantify the ROI and adoption already delivered.",
            "Reframe renewal as cost-certainty rather than an upsell.",
            "Surface and commit to removing any adoption blockers.",
            "Agree a concrete next step before renewal planning begins.",
        ],
        "opportunity_aligned": [
            f"Acknowledge the constructive {industry_l} backdrop briefly.",
            "Connect it to where the account is already succeeding internally.",
            "Confirm the executive sponsor and budget owner.",
            "Propose a specific, scoped expansion grounded in current usage.",
            "Define a clear next step and success measure.",
        ],
        "external_headwind": [
            f"Reference the shifting {industry_l} context to show you are paying attention.",
            "Reaffirm the value being delivered today.",
            "Check in on priorities and any budget pressure early.",
            "Offer a stability-focused option ahead of renewal planning.",
        ],
        "external_tailwind": [
            f"Use the {industry_l} tailwind purely as a conversation starter.",
            "Pivot quickly to the account's own usage and engagement data.",
            "Qualify whether real expansion intent exists.",
            "Only advance if the internal evidence supports it.",
        ],
        "mixed": [
            "Lead with the internal evidence and the recommended action.",
            "Reference external context only where it reinforces a specific point.",
            "Validate current priorities directly with the customer.",
            "Keep the next step anchored in the deterministic recommendation.",
        ],
    }[situation]


def _what_not_to_do(situation: str) -> List[str]:
    """Explicit cautions. Two standing governance cautions are always present."""
    specific = {
        "risk_aligned": [
            "Do not lead with discounting — it concedes value you have not lost yet.",
            "Do not assume the renewal is safe just because the product is in use.",
        ],
        "opportunity_aligned": [
            "Do not over-rotate on the upside before confirming budget and sponsor.",
            "Do not propose expansion without tying it to realised usage.",
        ],
        "external_headwind": [
            "Do not wait for internal metrics to deteriorate before engaging.",
            "Do not amplify negative market narratives back to the customer.",
        ],
        "external_tailwind": [
            "Do not infer expansion intent from positive headlines.",
            "Do not lead with pricing on the strength of external news.",
        ],
        "mixed": [
            "Do not let mixed news distract from the internal evidence.",
            "Do not over-interpret ambiguous external signals.",
        ],
    }[situation]
    standing = [
        "Do not treat external news as proof — it is supporting context only.",
        "Do not bypass human approval; nothing is written back to the CRM automatically.",
    ]
    return specific + standing


def _crm_writeback(account, name: str, industry_l: str, situation: str) -> CRMWritebackRecommendation:
    """Advisory CRM write-back content (task + note + follow-up).

    Approval-gated by definition: it only describes what a seller *might* log
    after the conversation. It never triggers a write-back.
    """
    renewal = int(_num(account, "renewal_days"))
    support = _num(account, "support_risk_score")
    growth = _num(account, "growth_potential_score")

    if (0 <= renewal <= 30) or support >= 70 or situation == "risk_aligned":
        priority = "high"
    elif situation == "opportunity_aligned" and growth >= 80:
        priority = "high"
    elif situation in ("opportunity_aligned", "external_headwind"):
        priority = "medium"
    elif situation == "mixed":
        priority = "low"
    else:
        priority = "medium"

    due = {
        "high": "Within 3 business days",
        "medium": "Within 7 business days",
        "low": "Within 2 weeks",
    }[priority]

    title = {
        "risk_aligned": f"Protect {name} renewal — validate ROI and remove adoption blockers",
        "opportunity_aligned": f"Explore expansion with {name} — confirm sponsor and budget",
        "external_headwind": f"Proactive check-in with {name} on shifting {industry_l} priorities",
        "external_tailwind": f"Qualify {name} opportunity against internal usage before positioning",
        "mixed": f"Re-engage {name} grounded in the internal evidence",
    }[situation]

    description = {
        "risk_aligned": (
            f"Reaffirm delivered value and de-risk the upcoming renewal. Treat external {industry_l} "
            f"pressure as context only and verify before acting."
        ),
        "opportunity_aligned": (
            f"Test genuine expansion intent. Confirm the sponsor and budget, and anchor any proposal in "
            f"{name}'s current usage rather than external {industry_l} momentum alone."
        ),
        "external_headwind": (
            f"Check in ahead of any budget or sentiment shift suggested by {industry_l} conditions. Lead "
            f"with stability and a clear value narrative."
        ),
        "external_tailwind": (
            f"Use the {industry_l} tailwind to inform timing only. Qualify the opportunity against internal "
            f"usage and engagement before positioning anything."
        ),
        "mixed": (
            f"Re-engage on the recommended action. Keep external {industry_l} context as colour, not as a "
            f"driver of the conversation."
        ),
    }[situation]

    note = {
        "risk_aligned": (
            f"External {industry_l} signals indicate market/margin pressure while internal engagement and "
            f"spend are softening. Recommend validating executive priorities and reaffirming delivered ROI "
            f"before renewal discussions. External context is supporting intelligence and was treated as "
            f"directional only."
        ),
        "opportunity_aligned": (
            f"External {industry_l} signals look constructive and internal momentum is positive. Recommend "
            f"confirming the executive sponsor and budget, then scoping an expansion grounded in current "
            f"usage. External context is supporting intelligence and was treated as directional only."
        ),
        "external_headwind": (
            f"External {industry_l} headwinds may raise urgency even though internal metrics are not yet "
            f"flashing red. Recommend a proactive value-led check-in ahead of renewal planning. External "
            f"context is supporting intelligence and was treated as directional only."
        ),
        "external_tailwind": (
            f"External {industry_l} signals are encouraging but not yet corroborated internally. Recommend "
            f"using them for timing only and qualifying any opportunity against internal usage. External "
            f"context is supporting intelligence and was treated as directional only."
        ),
        "mixed": (
            f"External {industry_l} context is mixed and does not change the recommendation. Recommend "
            f"re-engaging on the internal evidence and validating current priorities. External context is "
            f"supporting intelligence and was treated as directional only."
        ),
    }[situation]

    follow_up = {
        "risk_aligned": "Revisit in 14 days if no executive sponsor re-engages or renewal risk is unresolved.",
        "opportunity_aligned": "Revisit in 21 days; if sponsor and budget are confirmed, advance to scoping.",
        "external_headwind": "Revisit in 14 days to reassess whether market pressure is reaching internal metrics.",
        "external_tailwind": "Revisit in 21 days; only advance if internal usage corroborates the external signal.",
        "mixed": "Revisit at the next standard cadence (about 30 days).",
    }[situation]

    return CRMWritebackRecommendation(
        task=CRMTaskRecommendation(
            title=title,
            description=description,
            priority=priority,
            owner="Account owner",
            suggested_due_date=due,
        ),
        note=note,
        follow_up_reminder=follow_up,
    )


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
        # -- Phase 4.2 Executive Decision Brief --------------------------
        executive_summary=_executive_summary(account, name, industry_l, situation),
        why_it_matters=_why_it_matters(name, situation),
        internal_evidence=_internal_evidence(account),
        external_intelligence=_external_intelligence(signals),
        conversation_strategy_steps=_strategy_steps(name, industry_l, situation),
        confidence_rationale=conf_rationale,
        what_not_to_do=_what_not_to_do(situation),
        crm_writeback=_crm_writeback(account, name, industry_l, situation),
    )
