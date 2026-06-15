"""Deterministic mock external-signal provider.

Returns believable, **deterministic** outside-in context for the demo portfolio
without any network call -- so the feature works with no Serper key and the demo
is identical on every run. Marquee accounts (Curefoods, Unacademy, Razorpay,
Zepto, and more) get bespoke context; everything else is covered by per-industry
templates, with a generic fallback so no account is ever left blank.

Honesty note: in mock mode the ``source`` names are illustrative and ``url`` is a
news *search* link (not a specific fabricated article). The response always
carries the "external context only" caveat, and ``/api/system/status`` reports
``provider = mock`` so the demo is never misrepresented as live intelligence.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Dict, List
from urllib.parse import quote_plus

from external_signals.base import (
    ExternalSignal,
    ExternalSignalsProvider,
    IMPACT_NEGATIVE,
    IMPACT_NEUTRAL,
    IMPACT_POSITIVE,
)

# A template is a light dict; we add deterministic url/date when materializing.
#   keys: signal_type, title, summary, source, impact, confidence, keyword,
#         seller_takeaway
_T = Dict[str, str]


def _seed(text: str) -> int:
    return int(hashlib.sha256((text or "").encode("utf-8")).hexdigest(), 16)


def _days_ago_iso(n: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=n)).date().isoformat()


def _news_url(company: str, keyword: str) -> str:
    return f"https://news.google.com/search?q={quote_plus(f'{company} {keyword}'.strip())}"


# -- bespoke context for marquee demo accounts ----------------------------

NAMED_CONTEXT: Dict[str, List[_T]] = {
    "Curefoods": [
        {
            "signal_type": "market_trend",
            "title": "Food-delivery margins stay under pressure in India",
            "summary": "Food delivery margins remain under pressure in India as discounting and rider costs persist.",
            "source": "Economic Times",
            "impact": IMPACT_NEGATIVE,
            "confidence": "high",
            "keyword": "food delivery margins",
            "seller_takeaway": "Margin pressure can make spend cuts more likely; lead with efficiency and ROI.",
        },
        {
            "signal_type": "competitive_pressure",
            "title": "Cloud-kitchen brands consolidate operations",
            "summary": "Cloud kitchen brands are consolidating operations and rationalising underperforming kitchens.",
            "source": "Inc42",
            "impact": IMPACT_NEGATIVE,
            "confidence": "medium",
            "keyword": "cloud kitchen consolidation",
            "seller_takeaway": "Consolidation raises renewal sensitivity; reinforce switching cost and adoption value.",
        },
        {
            "signal_type": "macroeconomic",
            "title": "Food-tech funding activity slows",
            "summary": "Funding activity in food-tech has slowed, tightening budgets across the sector.",
            "source": "YourStory",
            "impact": IMPACT_NEGATIVE,
            "confidence": "medium",
            "keyword": "foodtech funding slowdown",
            "seller_takeaway": "Tighter budgets favour ROI-led conversations over expansion asks.",
        },
    ],
    "Unacademy": [
        {
            "signal_type": "macroeconomic",
            "title": "EdTech funding slowdown continues",
            "summary": "Edtech funding has slowed sharply, pushing players toward profitability over growth.",
            "source": "Moneycontrol",
            "impact": IMPACT_NEGATIVE,
            "confidence": "high",
            "keyword": "edtech funding slowdown",
            "seller_takeaway": "Budget scrutiny is high; quantify cost-per-outcome and retention value.",
        },
        {
            "signal_type": "competitive_pressure",
            "title": "EdTech players push cost optimisation",
            "summary": "Edtech companies are optimising costs and trimming non-core spend to extend runway.",
            "source": "Business Standard",
            "impact": IMPACT_NEGATIVE,
            "confidence": "medium",
            "keyword": "edtech cost optimization",
            "seller_takeaway": "Position the platform as a consolidation play that reduces total tooling spend.",
        },
        {
            "signal_type": "customer_risk_signal",
            "title": "Learner retention pressure across edtech",
            "summary": "Retention pressure is rising across edtech as learner engagement normalises post-pandemic.",
            "source": "Entrackr",
            "impact": IMPACT_NEGATIVE,
            "confidence": "medium",
            "keyword": "edtech retention",
            "seller_takeaway": "Tie your value to measurable engagement/retention to protect the renewal.",
        },
    ],
    "Razorpay": [
        {
            "signal_type": "expansion",
            "title": "Fintech infrastructure expansion accelerates",
            "summary": "Payment infrastructure providers are expanding product lines and merchant coverage.",
            "source": "Economic Times",
            "impact": IMPACT_POSITIVE,
            "confidence": "high",
            "keyword": "fintech expansion",
            "seller_takeaway": "Expansion appetite is high; explore cross-sell into adjacent products.",
        },
        {
            "signal_type": "market_trend",
            "title": "Payment volumes keep growing",
            "summary": "Digital payment infrastructure growth remains strong across Indian merchants.",
            "source": "Mint",
            "impact": IMPACT_POSITIVE,
            "confidence": "medium",
            "keyword": "payments growth India",
            "seller_takeaway": "Growing volumes support an expansion / higher-tier conversation.",
        },
        {
            "signal_type": "regulatory",
            "title": "Fintech compliance bar continues to rise",
            "summary": "Regulatory expectations for fintech keep rising, raising the value of compliant tooling.",
            "source": "Reuters",
            "impact": IMPACT_NEUTRAL,
            "confidence": "medium",
            "keyword": "fintech regulation India",
            "seller_takeaway": "Lead with compliance and reliability as expansion enablers, not blockers.",
        },
    ],
    "Zepto": [
        {
            "signal_type": "expansion",
            "title": "Quick-commerce expansion continues at pace",
            "summary": "Quick commerce players are expanding dark-store footprints into new cities.",
            "source": "Economic Times",
            "impact": IMPACT_POSITIVE,
            "confidence": "high",
            "keyword": "quick commerce expansion",
            "seller_takeaway": "High growth supports expansion; align capacity and onboarding to the roadmap.",
        },
        {
            "signal_type": "customer_growth_signal",
            "title": "Strong order-volume growth in quick commerce",
            "summary": "Quick commerce demand keeps climbing, driving high order volumes and headcount.",
            "source": "Inc42",
            "impact": IMPACT_POSITIVE,
            "confidence": "medium",
            "keyword": "quick commerce growth",
            "seller_takeaway": "Growth is a tailwind; propose scaling the engagement with the volume.",
        },
        {
            "signal_type": "market_trend",
            "title": "Operational complexity rises with scale",
            "summary": "Rapid scaling is increasing operational complexity across quick-commerce operations.",
            "source": "YourStory",
            "impact": IMPACT_NEUTRAL,
            "confidence": "medium",
            "keyword": "quick commerce operations",
            "seller_takeaway": "Frame your platform as the way to scale without adding operational risk.",
        },
    ],
    "Swiggy": [
        {
            "signal_type": "market_trend",
            "title": "Food-delivery demand steadies post-IPO scrutiny",
            "summary": "Food-delivery demand is steady while investors scrutinise path-to-profit metrics.",
            "source": "Mint",
            "impact": IMPACT_NEUTRAL,
            "confidence": "medium",
            "keyword": "food delivery demand",
            "seller_takeaway": "Profitability focus rewards ROI-led expansion, not broad spend.",
        },
        {
            "signal_type": "expansion",
            "title": "Quick-commerce arm scales rapidly",
            "summary": "Instamart-style quick-commerce expansion is a key growth vector for delivery majors.",
            "source": "Economic Times",
            "impact": IMPACT_POSITIVE,
            "confidence": "medium",
            "keyword": "instamart quick commerce",
            "seller_takeaway": "New growth arms create cross-sell openings into adjacent teams.",
        },
    ],
    "CRED": [
        {
            "signal_type": "market_trend",
            "title": "Fintech focus shifts to monetisation",
            "summary": "Premium fintech players are sharpening monetisation and unit economics.",
            "source": "Entrackr",
            "impact": IMPACT_NEUTRAL,
            "confidence": "medium",
            "keyword": "fintech monetization",
            "seller_takeaway": "Tie spend to revenue impact; economics scrutiny is high.",
        },
        {
            "signal_type": "competitive_pressure",
            "title": "Crowded rewards / payments space",
            "summary": "Competition for affluent users is intensifying across rewards and payments.",
            "source": "Inc42",
            "impact": IMPACT_NEGATIVE,
            "confidence": "low",
            "keyword": "fintech rewards competition",
            "seller_takeaway": "Differentiation matters; emphasise reliability and data advantage.",
        },
    ],
    "Meesho": [
        {
            "signal_type": "market_trend",
            "title": "Value e-commerce gains share in Bharat",
            "summary": "Value-focused e-commerce continues to gain share in tier-2/3 India.",
            "source": "Economic Times",
            "impact": IMPACT_POSITIVE,
            "confidence": "medium",
            "keyword": "value ecommerce India",
            "seller_takeaway": "Tailwind exists, but watch margins; lead with efficiency at scale.",
        },
        {
            "signal_type": "customer_risk_signal",
            "title": "Take-rate and margin pressure persist",
            "summary": "Thin take-rates keep margin discipline front of mind for value marketplaces.",
            "source": "Mint",
            "impact": IMPACT_NEGATIVE,
            "confidence": "medium",
            "keyword": "marketplace take rate",
            "seller_takeaway": "Anchor on cost-to-serve reductions to protect spend.",
        },
    ],
    "Delhivery": [
        {
            "signal_type": "customer_risk_signal",
            "title": "Logistics pricing stays competitive",
            "summary": "Logistics pricing remains intensely competitive, pressuring per-shipment margins.",
            "source": "Business Standard",
            "impact": IMPACT_NEGATIVE,
            "confidence": "medium",
            "keyword": "logistics pricing pressure",
            "seller_takeaway": "Margin pressure + support risk: lead with reliability and SLA value.",
        },
        {
            "signal_type": "market_trend",
            "title": "E-commerce shipment volumes recover",
            "summary": "Shipment volumes are recovering with festive and e-commerce demand.",
            "source": "Economic Times",
            "impact": IMPACT_POSITIVE,
            "confidence": "low",
            "keyword": "ecommerce shipment volumes",
            "seller_takeaway": "Volume recovery can offset risk if service quality holds.",
        },
    ],
    "BigBasket": [
        {
            "signal_type": "competitive_pressure",
            "title": "Quick-commerce squeezes scheduled grocery",
            "summary": "Quick commerce is pressuring scheduled e-grocery on convenience and speed.",
            "source": "Inc42",
            "impact": IMPACT_NEGATIVE,
            "confidence": "medium",
            "keyword": "egrocery quick commerce",
            "seller_takeaway": "Support risk is high; protect the renewal with reliability and roadmap.",
        },
    ],
    "Nykaa": [
        {
            "signal_type": "market_trend",
            "title": "Beauty e-commerce stays resilient",
            "summary": "Beauty and personal-care e-commerce demand remains resilient across metros.",
            "source": "Mint",
            "impact": IMPACT_POSITIVE,
            "confidence": "medium",
            "keyword": "beauty ecommerce India",
            "seller_takeaway": "Healthy demand supports a measured expansion conversation.",
        },
    ],
    "Lenskart": [
        {
            "signal_type": "expansion",
            "title": "Eyewear retailer expands store network",
            "summary": "Omnichannel eyewear expansion continues across India and overseas markets.",
            "source": "Economic Times",
            "impact": IMPACT_POSITIVE,
            "confidence": "medium",
            "keyword": "eyewear retail expansion",
            "seller_takeaway": "Expansion appetite is real; align growth offers to new-store rollout.",
        },
    ],
}

# -- per-industry fallback context ---------------------------------------

INDUSTRY_CONTEXT: Dict[str, List[_T]] = {
    "Food Delivery": [
        {"signal_type": "market_trend", "title": "Food-delivery margins under pressure", "summary": "Food delivery margins remain under pressure on discounting and delivery cost.", "source": "Economic Times", "impact": IMPACT_NEGATIVE, "confidence": "medium", "keyword": "food delivery margins", "seller_takeaway": "Lead with ROI; budgets are sensitive."},
        {"signal_type": "competitive_pressure", "title": "Intensifying delivery competition", "summary": "Competition for order volume keeps customer acquisition costs elevated.", "source": "Inc42", "impact": IMPACT_NEGATIVE, "confidence": "low", "keyword": "food delivery competition", "seller_takeaway": "Stress retention and efficiency over new spend."},
    ],
    "Quick Commerce": [
        {"signal_type": "expansion", "title": "Quick-commerce footprint expands", "summary": "Dark-store expansion continues across cities, driving rapid growth.", "source": "Economic Times", "impact": IMPACT_POSITIVE, "confidence": "medium", "keyword": "quick commerce expansion", "seller_takeaway": "Growth supports expansion conversations."},
        {"signal_type": "market_trend", "title": "Operational complexity rising", "summary": "Scaling is adding operational complexity for quick-commerce operators.", "source": "YourStory", "impact": IMPACT_NEUTRAL, "confidence": "low", "keyword": "quick commerce operations", "seller_takeaway": "Position to scale without added risk."},
    ],
    "FinTech": [
        {"signal_type": "regulatory", "title": "Fintech compliance bar rises", "summary": "Regulatory expectations for fintech continue to tighten across India.", "source": "Reuters", "impact": IMPACT_NEUTRAL, "confidence": "medium", "keyword": "fintech regulation India", "seller_takeaway": "Frame compliance/reliability as enablers."},
        {"signal_type": "market_trend", "title": "Digital payments keep growing", "summary": "Payment and lending volumes keep expanding across digital channels.", "source": "Mint", "impact": IMPACT_POSITIVE, "confidence": "medium", "keyword": "fintech payments growth", "seller_takeaway": "Growth supports a cross-sell motion."},
    ],
    "E-commerce": [
        {"signal_type": "market_trend", "title": "E-commerce demand steady", "summary": "Online retail demand is steady with margin discipline in focus.", "source": "Economic Times", "impact": IMPACT_NEUTRAL, "confidence": "medium", "keyword": "ecommerce India demand", "seller_takeaway": "Balance growth talk with cost-to-serve."},
    ],
    "E-grocery": [
        {"signal_type": "competitive_pressure", "title": "Quick-commerce pressures e-grocery", "summary": "Speed-led quick commerce is pressuring scheduled grocery models.", "source": "Inc42", "impact": IMPACT_NEGATIVE, "confidence": "medium", "keyword": "egrocery competition", "seller_takeaway": "Protect renewals with reliability and roadmap."},
    ],
    "Retail": [
        {"signal_type": "market_trend", "title": "Omnichannel retail momentum", "summary": "Retailers keep investing in omnichannel and store-network growth.", "source": "Business Standard", "impact": IMPACT_POSITIVE, "confidence": "low", "keyword": "omnichannel retail India", "seller_takeaway": "Tie offers to expansion plans."},
    ],
    "Logistics": [
        {"signal_type": "customer_risk_signal", "title": "Logistics pricing stays competitive", "summary": "Per-shipment pricing remains competitive, pressuring margins.", "source": "Business Standard", "impact": IMPACT_NEGATIVE, "confidence": "medium", "keyword": "logistics pricing", "seller_takeaway": "Lead with SLA reliability and total cost."},
        {"signal_type": "market_trend", "title": "Shipment volumes recovering", "summary": "Volumes are recovering with e-commerce and festive demand.", "source": "Economic Times", "impact": IMPACT_POSITIVE, "confidence": "low", "keyword": "logistics volumes India", "seller_takeaway": "Volume upside if service quality holds."},
    ],
    "SaaS": [
        {"signal_type": "market_trend", "title": "SaaS buyers scrutinise tooling spend", "summary": "Software buyers continue to consolidate tools and scrutinise spend.", "source": "TechCrunch", "impact": IMPACT_NEUTRAL, "confidence": "medium", "keyword": "saas spend consolidation", "seller_takeaway": "Position as a consolidation play with clear ROI."},
        {"signal_type": "customer_growth_signal", "title": "AI features drive SaaS upsell", "summary": "AI-led features are creating new upsell motions across B2B SaaS.", "source": "Mint", "impact": IMPACT_POSITIVE, "confidence": "low", "keyword": "saas AI upsell", "seller_takeaway": "Explore AI-bundle cross-sell where adoption is strong."},
    ],
    "EdTech": [
        {"signal_type": "macroeconomic", "title": "EdTech funding slowdown", "summary": "Edtech funding has slowed, pushing the sector toward profitability.", "source": "Moneycontrol", "impact": IMPACT_NEGATIVE, "confidence": "medium", "keyword": "edtech funding slowdown", "seller_takeaway": "Quantify cost-per-outcome; budgets are tight."},
    ],
    "Gaming": [
        {"signal_type": "regulatory", "title": "Gaming taxation and rules in flux", "summary": "Regulatory and taxation changes continue to reshape real-money gaming.", "source": "Economic Times", "impact": IMPACT_NEGATIVE, "confidence": "medium", "keyword": "gaming regulation India", "seller_takeaway": "Acknowledge regulatory risk; emphasise stability."},
    ],
    "Consumer Electronics": [
        {"signal_type": "market_trend", "title": "Wearables demand normalises", "summary": "Audio and wearables demand is normalising after rapid growth.", "source": "Mint", "impact": IMPACT_NEUTRAL, "confidence": "low", "keyword": "wearables demand India", "seller_takeaway": "Balance growth optimism with realistic targets."},
    ],
    "HealthTech": [
        {"signal_type": "regulatory", "title": "E-pharmacy rules under review", "summary": "Health-tech and e-pharmacy regulation remains under active review.", "source": "Reuters", "impact": IMPACT_NEUTRAL, "confidence": "low", "keyword": "epharmacy regulation India", "seller_takeaway": "Lead with compliance and trust."},
    ],
    "Home Services": [
        {"signal_type": "market_trend", "title": "Home-services demand expands", "summary": "Urban home-services demand keeps expanding across metros.", "source": "YourStory", "impact": IMPACT_POSITIVE, "confidence": "low", "keyword": "home services India", "seller_takeaway": "Modest tailwind; align to category growth."},
    ],
    "Home Interiors": [
        {"signal_type": "market_trend", "title": "Interiors demand tied to housing", "summary": "Home-interiors demand tracks the residential real-estate cycle.", "source": "Business Standard", "impact": IMPACT_NEUTRAL, "confidence": "low", "keyword": "home interiors India", "seller_takeaway": "Time outreach to housing demand cycles."},
    ],
    "Energy & Utilities": [
        {"signal_type": "macroeconomic", "title": "Energy transition investment rises", "summary": "Utilities are investing in grid modernisation and clean energy.", "source": "Reuters", "impact": IMPACT_POSITIVE, "confidence": "low", "keyword": "energy transition utilities", "seller_takeaway": "Tie value to modernisation programmes."},
    ],
    "Healthcare": [
        {"signal_type": "market_trend", "title": "Healthcare digitisation continues", "summary": "Providers keep investing in digitisation and patient experience.", "source": "Modern Healthcare", "impact": IMPACT_POSITIVE, "confidence": "low", "keyword": "healthcare digitization", "seller_takeaway": "Anchor on outcomes and compliance."},
    ],
    "Manufacturing": [
        {"signal_type": "macroeconomic", "title": "Manufacturing demand mixed", "summary": "Industrial demand is mixed amid supply-chain normalisation.", "source": "Reuters", "impact": IMPACT_NEUTRAL, "confidence": "low", "keyword": "manufacturing demand", "seller_takeaway": "Expect cautious budgets; lead with efficiency."},
    ],
    "FMCG": [
        {"signal_type": "macroeconomic", "title": "Rural demand recovery watched", "summary": "FMCG players are watching rural demand recovery and input costs.", "source": "Economic Times", "impact": IMPACT_NEUTRAL, "confidence": "low", "keyword": "fmcg rural demand", "seller_takeaway": "Tie spend to demand visibility."},
    ],
    "Marketing & Agency": [
        {"signal_type": "market_trend", "title": "Ad budgets favour performance", "summary": "Marketing budgets keep shifting toward measurable performance channels.", "source": "Campaign", "impact": IMPACT_NEUTRAL, "confidence": "low", "keyword": "ad budgets performance", "seller_takeaway": "Lead with measurable ROI."},
    ],
    "IT Services": [
        {"signal_type": "macroeconomic", "title": "IT-services deal cycles lengthen", "summary": "Discretionary IT spend is cautious with longer deal cycles.", "source": "Reuters", "impact": IMPACT_NEUTRAL, "confidence": "low", "keyword": "IT services demand", "seller_takeaway": "Expect longer cycles; build the business case early."},
    ],
    "Professional Services": [
        {"signal_type": "market_trend", "title": "Advisory demand steady", "summary": "Professional-services demand is steady with a focus on efficiency.", "source": "Business Standard", "impact": IMPACT_NEUTRAL, "confidence": "low", "keyword": "professional services demand", "seller_takeaway": "Efficiency framing resonates."},
    ],
    "Wholesale": [
        {"signal_type": "market_trend", "title": "Distribution digitises", "summary": "Wholesale and distribution continue to digitise ordering and inventory.", "source": "Economic Times", "impact": IMPACT_POSITIVE, "confidence": "low", "keyword": "wholesale digitization", "seller_takeaway": "Tie value to digitisation ROI."},
    ],
}

_GENERIC_CONTEXT: List[_T] = [
    {"signal_type": "market_trend", "title": "Sector demand is mixed", "summary": "Demand in the sector is mixed, keeping budgets under scrutiny.", "source": "Reuters", "impact": IMPACT_NEUTRAL, "confidence": "low", "keyword": "industry trends", "seller_takeaway": "Lead with ROI and a clear business case."},
]


class MockProvider(ExternalSignalsProvider):
    """Deterministic, network-free external signals for the demo portfolio."""

    name = "mock"

    def _materialize(
        self, company_name: str, templates: List[_T], *, base_relevance: str
    ) -> List[ExternalSignal]:
        out: List[ExternalSignal] = []
        seed = _seed(company_name)
        for i, t in enumerate(templates):
            # Deterministic, stable-within-a-day "freshness".
            days = 2 + ((seed >> (i * 4)) % 20)
            out.append(
                ExternalSignal(
                    signal_type=t["signal_type"],
                    title=t["title"],
                    summary=t["summary"],
                    source=t.get("source", "Industry brief"),
                    url=_news_url(company_name, t.get("keyword", "")),
                    published_at=_days_ago_iso(days),
                    confidence=t.get("confidence", "medium"),
                    relevance=t.get("relevance", base_relevance),
                    impact=t.get("impact", IMPACT_NEUTRAL),
                    seller_takeaway=t.get("seller_takeaway"),
                )
            )
        return out

    def search_company_context(
        self, company_name: str, industry: str, region: str
    ) -> List[ExternalSignal]:
        signals: List[ExternalSignal] = []
        named = NAMED_CONTEXT.get(company_name)
        if named:
            signals.extend(self._materialize(company_name, named, base_relevance="high"))
        # Add one or two industry signals for breadth, skipping types already
        # covered by the bespoke context so themes don't repeat.
        industry_templates = INDUSTRY_CONTEXT.get(industry, _GENERIC_CONTEXT)
        seen_types = {s.signal_type for s in signals}
        extra = [t for t in industry_templates if t["signal_type"] not in seen_types]
        limit = 2 if not named else 1
        signals.extend(
            self._materialize(company_name, extra[:limit], base_relevance="medium")
        )
        return signals[:4]

    def get_industry_context(self, industry: str, region: str) -> List[ExternalSignal]:
        templates = INDUSTRY_CONTEXT.get(industry, _GENERIC_CONTEXT)
        return self._materialize(industry, templates, base_relevance="medium")
