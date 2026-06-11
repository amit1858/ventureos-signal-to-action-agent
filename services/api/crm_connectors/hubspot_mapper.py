"""Mapping between HubSpot CRM objects and the internal account/signal schema.

Two directions:

* **Seed** (internal -> HubSpot): turn a synthetic :class:`Account` into HubSpot
  company properties so a test portal can be populated with demo records.
* **Sync** (HubSpot -> internal): turn HubSpot companies / deals / engagements
  back into typed :class:`Account` / :class:`Signal` / :class:`Note` objects the
  existing scoring engine and agents already understand.

Score fidelity is preserved when the demo custom properties (prefix ``s2a_``)
are present on the company. When they are not -- e.g. a portal seeded by hand or
a token without schema-write scope -- we fall back to *deterministic* values
derived from the company id, so the scoring engine always has valid inputs and
the same company always maps to the same scores.
"""

from __future__ import annotations

import hashlib
import os
from datetime import date, timedelta
from typing import Dict, List, Optional

from schemas.account import Account, Note
from schemas.signal import Signal, SignalPolarity

PREFIX = os.getenv("HUBSPOT_PROPERTY_PREFIX", "s2a_")

# Custom numeric/string properties that carry the synthetic signal intelligence.
SCORE_PROPS = [
    "product_usage_score",
    "engagement_score",
    "support_risk_score",
    "campaign_response_score",
    "growth_potential_score",
    "last_contact_days",
    "renewal_days",
    "current_month_spend",
    "previous_month_spend",
]
TEXT_PROPS = ["segment", "account_id", "industry"]

PROPERTY_GROUP = f"{PREFIX}signal_intelligence"

_FALLBACK_INDUSTRIES = ["Retail", "SaaS", "Logistics", "Healthcare", "Manufacturing", "FinTech"]
_FALLBACK_REGIONS = ["North", "South", "East", "West", "Central"]
_FALLBACK_SEGMENTS = ["SMB", "SMB", "Mid-Market", "Startup"]

TODAY = date.today()


def prop(name: str) -> str:
    """Namespaced custom property name, e.g. ``s2a_support_risk_score``."""
    return f"{PREFIX}{name}"


# -- deterministic fallback -----------------------------------------------


def _unit(seed: str, salt: str) -> float:
    """Stable pseudo-random float in [0, 1) from a string seed (md5-based)."""
    h = hashlib.md5(f"{seed}:{salt}".encode("utf-8")).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def _scaled(seed: str, salt: str, lo: float, hi: float) -> float:
    return round(lo + (hi - lo) * _unit(seed, salt), 1)


def _pick(seed: str, salt: str, options: List[str]) -> str:
    return options[int(_unit(seed, salt) * len(options)) % len(options)]


def property_definitions() -> List[dict]:
    """HubSpot company property definitions for the demo custom properties."""
    defs: List[dict] = []
    for name in SCORE_PROPS:
        defs.append(
            {
                "name": prop(name),
                "label": f"S2A {name.replace('_', ' ').title()}",
                "type": "number",
                "fieldType": "number",
                "groupName": PROPERTY_GROUP,
            }
        )
    for name in TEXT_PROPS:
        defs.append(
            {
                "name": prop(name),
                "label": f"S2A {name.replace('_', ' ').title()}",
                "type": "string",
                "fieldType": "text",
                "groupName": PROPERTY_GROUP,
            }
        )
    return defs


# -- internal -> HubSpot (seeding) ----------------------------------------


def account_to_company_properties(account: Account, include_custom: bool = True) -> Dict[str, str]:
    """Build a HubSpot company `properties` dict from a synthetic account.

    Note: the synthetic ``industry`` is intentionally NOT written to HubSpot's
    native ``industry`` property, which is a strict enumeration that rejects
    free-text values (e.g. "Hospitality"). It is carried in the demo custom
    property ``s2a_industry`` (and the human-readable description) and read back
    on sync, so seeding never fails on industry validation.
    """
    props: Dict[str, str] = {
        "name": account.account_name,
        "city": account.region,
        "annualrevenue": str(int(account.current_month_spend * 12)),
        "description": (
            f"Synthetic demo company for Signal-to-Action Agent "
            f"({account.segment}, {account.industry}, {account.region}). No real data."
        ),
    }
    if include_custom:
        props[prop("account_id")] = account.account_id
        props[prop("segment")] = account.segment
        props[prop("industry")] = account.industry
        props[prop("product_usage_score")] = str(account.product_usage_score)
        props[prop("engagement_score")] = str(account.engagement_score)
        props[prop("support_risk_score")] = str(account.support_risk_score)
        props[prop("campaign_response_score")] = str(account.campaign_response_score)
        props[prop("growth_potential_score")] = str(account.growth_potential_score)
        props[prop("last_contact_days")] = str(account.last_contact_days)
        props[prop("renewal_days")] = str(account.renewal_days)
        props[prop("current_month_spend")] = str(account.current_month_spend)
        props[prop("previous_month_spend")] = str(account.previous_month_spend)
    return props


# -- HubSpot -> internal (sync) -------------------------------------------


def _num(props: dict, name: str) -> Optional[float]:
    raw = props.get(prop(name))
    if raw in (None, ""):
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def company_to_account(company: dict) -> Account:
    """Map a HubSpot company object to an internal :class:`Account`.

    Prefers the demo custom properties; falls back to deterministic values so the
    scoring engine always receives valid, stable inputs.
    """
    cid = str(company.get("id", ""))
    props = company.get("properties", {}) or {}

    name = props.get("name") or f"Company {cid}"
    industry = props.get(prop("industry")) or props.get("industry") or _pick(cid, "industry", _FALLBACK_INDUSTRIES)
    region = props.get("city") or props.get("state") or _pick(cid, "region", _FALLBACK_REGIONS)
    segment = props.get(prop("segment")) or _pick(cid, "segment", _FALLBACK_SEGMENTS)

    prev = _num(props, "previous_month_spend")
    cur = _num(props, "current_month_spend")
    if prev is None:
        revenue = props.get("annualrevenue")
        try:
            prev = float(revenue) / 12 if revenue else _scaled(cid, "prev", 4000, 48000)
        except (TypeError, ValueError):
            prev = _scaled(cid, "prev", 4000, 48000)
    if cur is None:
        cur = round(prev * _scaled(cid, "spendmove", 0.6, 1.3) / 1.0, 2)

    def score(field: str, lo: float, hi: float) -> float:
        val = _num(props, field)
        if val is None:
            val = _scaled(cid, field, lo, hi)
        return max(0.0, min(100.0, round(val, 1)))

    last_contact = _num(props, "last_contact_days")
    renewal = _num(props, "renewal_days")

    return Account(
        account_id=cid,
        account_name=name,
        industry=industry,
        segment=segment,
        region=region,
        current_month_spend=max(0.0, round(cur, 2)),
        previous_month_spend=max(0.0, round(prev, 2)),
        product_usage_score=score("product_usage_score", 35, 85),
        engagement_score=score("engagement_score", 30, 80),
        support_risk_score=score("support_risk_score", 15, 80),
        campaign_response_score=score("campaign_response_score", 25, 90),
        last_contact_days=int(last_contact) if last_contact is not None else int(_scaled(cid, "contact", 5, 50)),
        renewal_days=int(renewal) if renewal is not None else int(_scaled(cid, "renewal", 10, 220)),
        growth_potential_score=score("growth_potential_score", 35, 90),
    )


def deal_to_signal(deal: dict, account_id: str, idx: int) -> Optional[Signal]:
    """Map a HubSpot deal into an opportunity-style signal."""
    props = deal.get("properties", {}) or {}
    amount = props.get("amount")
    stage = props.get("dealstage") or "open"
    name = props.get("dealname") or "Open deal"
    try:
        amt = float(amount) if amount else 0.0
    except (TypeError, ValueError):
        amt = 0.0
    strength = max(0.3, min(1.0, amt / 50000)) if amt else 0.5
    return Signal(
        signal_id=f"HS-DEAL-{deal.get('id', idx)}",
        account_id=account_id,
        signal_type="renewal_upcoming" if "renew" in str(stage).lower() else "usage_spike",
        signal_date=TODAY - timedelta(days=idx % 21 + 1),
        signal_strength=round(strength, 2),
        signal_description=f"Open deal '{name}' in stage '{stage}' (amount {amt:.0f}).",
        source_system="CRM",
        positive_or_negative=SignalPolarity.positive,
    )


def engagement_to_signal(text: str, account_id: str, idx: int) -> Signal:
    """Map a HubSpot note/task body into an engagement/support signal."""
    low = text.lower()
    if any(w in low for w in ("support", "escalat", "ticket", "bug", "outage")):
        stype, polarity, src = "support_ticket", SignalPolarity.negative, "Support"
    elif any(w in low for w in ("campaign", "webinar", "email", "clicked", "opened")):
        stype, polarity, src = "campaign_click", SignalPolarity.positive, "Marketing"
    elif any(w in low for w in ("renew", "contract")):
        stype, polarity, src = "renewal_upcoming", SignalPolarity.neutral, "CRM"
    else:
        stype, polarity, src = "nps_response", SignalPolarity.neutral, "CRM"
    return Signal(
        signal_id=f"HS-ENG-{account_id}-{idx}",
        account_id=account_id,
        signal_type=stype,
        signal_date=TODAY - timedelta(days=idx % 18 + 1),
        signal_strength=0.6,
        signal_description=text[:180],
        source_system=src,
        positive_or_negative=polarity,
    )


def engagement_to_note(text: str, account_id: str, note_type: str = "crm") -> Note:
    return Note(
        account_id=account_id,
        note_type=note_type,
        note_text=text[:400],
        created_date=TODAY - timedelta(days=3),
    )


def derive_context(account: Account) -> tuple[List[Signal], List[Note]]:
    """Deterministically derive signals + a note from an account's profile.

    Used during sync so the existing health/opportunity/governance agents and the
    query router (which looks for e.g. ``support_ticket``) have realistic evidence
    even when a HubSpot test portal has no associated engagements to read.
    """
    aid = account.account_id
    signals: List[Signal] = []
    n = 0

    def add(stype: str, strength: float, desc: str, src: str, polarity: SignalPolarity, days: int) -> None:
        nonlocal n
        n += 1
        signals.append(
            Signal(
                signal_id=f"HS-SIG-{aid}-{n}",
                account_id=aid,
                signal_type=stype,
                signal_date=TODAY - timedelta(days=days),
                signal_strength=round(strength, 2),
                signal_description=desc,
                source_system=src,
                positive_or_negative=polarity,
            )
        )

    spend_drop = account.previous_month_spend > 0 and (
        (account.previous_month_spend - account.current_month_spend) / account.previous_month_spend >= 0.15
    )

    if account.support_risk_score >= 60:
        add("support_ticket", 0.9, "Open support escalation flagged in CRM.", "Support", SignalPolarity.negative, 4)
    if spend_drop:
        add("usage_drop", 0.75, "Spend declined materially month over month.", "Telemetry", SignalPolarity.negative, 8)
    if account.campaign_response_score >= 65 and account.last_contact_days > 30:
        add("campaign_click", 0.8, "Engaged with a recent campaign; no seller follow-up logged.", "Marketing", SignalPolarity.positive, 7)
    if account.renewal_days <= 45:
        add("renewal_upcoming", 0.7, "Contract renewal approaching.", "CRM", SignalPolarity.neutral, 3)
    if account.growth_potential_score >= 70 and not spend_drop:
        add("usage_spike", 0.8, "Healthy product adoption and expansion signals.", "Telemetry", SignalPolarity.positive, 6)

    note = engagement_to_note(
        text=(
            f"Synced from HubSpot test CRM. Support risk {account.support_risk_score:.0f}, "
            f"growth potential {account.growth_potential_score:.0f}, last contact "
            f"{account.last_contact_days}d ago."
        ),
        account_id=aid,
        note_type="crm",
    )
    return signals, [note]

