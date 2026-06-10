"""Synthetic data generator for the Signal-to-Action Agent.

Produces three files in this directory:
  * synthetic_accounts.csv
  * synthetic_signals.csv
  * synthetic_notes.json

The data is 100% synthetic and seeded for reproducibility. Accounts are built
from a set of *archetypes* so that every demo/eval query has clear, explainable
matches (declining-but-high-growth, support-escalation, campaign-responder with
no follow-up, renewal-due, stable "do not contact", weak-evidence, etc.).

No real companies, customers, or confidential data are used.
"""

from __future__ import annotations

import csv
import json
import os
import random
from datetime import date, timedelta

SEED = 2026
random.seed(SEED)

HERE = os.path.dirname(os.path.abspath(__file__))
TODAY = date.today()

# Clearly-fictional name parts (Contoso/Northwind/Fabrikam are standard fictitious brands).
PREFIXES = [
    "Northwind", "Contoso", "Fabrikam", "Adventure", "Tailspin", "Wingtip", "Proseware",
    "Litware", "Coho", "Lucerne", "Margie", "Trey", "Alpine", "Blue Yonder", "Fourth Coffee",
    "Graphic Design", "Humongous", "Wide World", "Woodgrove", "Fabrico", "Relecloud",
    "VanArsdel", "Best For You", "First Up", "Nod Publishers", "School of Fine Art",
    "Southridge", "Tasty", "City Power", "Consolidated",
]
SUFFIXES = ["Retail", "Logistics", "Systems", "Labs", "Group", "Works", "Partners", "Co", "Digital", "Supply"]
INDUSTRIES = ["Retail", "SaaS", "Logistics", "Healthcare", "Manufacturing", "FinTech", "EdTech", "Hospitality"]
SEGMENTS = ["SMB", "SMB", "SMB", "Mid-Market", "Startup"]  # weighted toward SMB
REGIONS = ["North", "South", "East", "West", "Central"]

# Archetype -> how many accounts to create with that profile.
ARCHETYPES = {
    "at_risk_declining": 7,
    "growth_ready": 7,
    "campaign_responder_no_followup": 6,
    "renewal_due": 6,
    "support_escalation": 5,
    "stable_monitor": 5,
    "weak_evidence": 4,
}


def _rint(lo: int, hi: int) -> int:
    return random.randint(lo, hi)


def _rfloat(lo: float, hi: float) -> float:
    return round(random.uniform(lo, hi), 1)


def _name(used: set) -> str:
    while True:
        name = f"{random.choice(PREFIXES)} {random.choice(SUFFIXES)}"
        if name not in used:
            used.add(name)
            return name


def _profile(archetype: str) -> dict:
    """Return score/spend fields tuned for an archetype."""
    prev = _rint(4000, 48000)
    if archetype == "at_risk_declining":
        cur = int(prev * _rfloat(0.55, 0.82))  # 18-45% decline
        return dict(
            current_month_spend=cur, previous_month_spend=prev,
            product_usage_score=_rfloat(20, 45), engagement_score=_rfloat(15, 40),
            support_risk_score=_rfloat(55, 80), campaign_response_score=_rfloat(20, 50),
            last_contact_days=_rint(14, 40), renewal_days=_rint(40, 120),
            growth_potential_score=_rfloat(45, 75),
        )
    if archetype == "growth_ready":
        cur = int(prev * _rfloat(1.08, 1.4))  # rising spend
        return dict(
            current_month_spend=cur, previous_month_spend=prev,
            product_usage_score=_rfloat(65, 92), engagement_score=_rfloat(60, 88),
            support_risk_score=_rfloat(8, 28), campaign_response_score=_rfloat(70, 95),
            last_contact_days=_rint(5, 20), renewal_days=_rint(60, 180),
            growth_potential_score=_rfloat(78, 96),
        )
    if archetype == "campaign_responder_no_followup":
        cur = int(prev * _rfloat(0.95, 1.12))
        return dict(
            current_month_spend=cur, previous_month_spend=prev,
            product_usage_score=_rfloat(50, 75), engagement_score=_rfloat(45, 70),
            support_risk_score=_rfloat(15, 40), campaign_response_score=_rfloat(75, 96),
            last_contact_days=_rint(34, 62), renewal_days=_rint(50, 160),
            growth_potential_score=_rfloat(60, 85),
        )
    if archetype == "renewal_due":
        cur = int(prev * _rfloat(0.9, 1.08))
        return dict(
            current_month_spend=cur, previous_month_spend=prev,
            product_usage_score=_rfloat(45, 72), engagement_score=_rfloat(40, 68),
            support_risk_score=_rfloat(25, 55), campaign_response_score=_rfloat(35, 65),
            last_contact_days=_rint(12, 35), renewal_days=_rint(3, 26),
            growth_potential_score=_rfloat(45, 70),
        )
    if archetype == "support_escalation":
        cur = int(prev * _rfloat(0.8, 1.0))
        return dict(
            current_month_spend=cur, previous_month_spend=prev,
            product_usage_score=_rfloat(35, 60), engagement_score=_rfloat(30, 55),
            support_risk_score=_rfloat(78, 95), campaign_response_score=_rfloat(20, 45),
            last_contact_days=_rint(6, 22), renewal_days=_rint(35, 140),
            growth_potential_score=_rfloat(35, 60),
        )
    if archetype == "stable_monitor":
        cur = int(prev * _rfloat(0.98, 1.05))
        return dict(
            current_month_spend=cur, previous_month_spend=prev,
            product_usage_score=_rfloat(62, 80), engagement_score=_rfloat(60, 80),
            support_risk_score=_rfloat(10, 25), campaign_response_score=_rfloat(40, 60),
            last_contact_days=_rint(5, 16), renewal_days=_rint(120, 320),
            growth_potential_score=_rfloat(30, 50),
        )
    # weak_evidence
    cur = int(prev * _rfloat(0.92, 1.08))
    return dict(
        current_month_spend=cur, previous_month_spend=prev,
        product_usage_score=_rfloat(40, 70), engagement_score=_rfloat(35, 65),
        support_risk_score=_rfloat(20, 50), campaign_response_score=_rfloat(30, 60),
        last_contact_days=_rint(10, 30), renewal_days=_rint(60, 200),
        growth_potential_score=_rfloat(35, 65),
    )


def _signals_for(account_id: str, archetype: str, start_sig: int) -> list:
    """Create archetype-appropriate signals. weak_evidence yields 0-1 signals."""
    def sig(n, stype, strength, desc, src, polarity, days_ago):
        return {
            "signal_id": f"SIG-{n:05d}",
            "account_id": account_id,
            "signal_type": stype,
            "signal_date": (TODAY - timedelta(days=days_ago)).isoformat(),
            "signal_strength": round(strength, 2),
            "signal_description": desc,
            "source_system": src,
            "positive_or_negative": polarity,
        }

    out = []
    n = start_sig
    plans = {
        "at_risk_declining": [
            ("usage_drop", 0.8, "Active seats fell sharply month over month", "Telemetry", "negative", 9),
            ("payment_delay", 0.6, "Invoice paid 12 days late", "Billing", "negative", 18),
            ("login_drop", 0.7, "Weekly logins down ~40%", "Telemetry", "negative", 6),
        ],
        "growth_ready": [
            ("usage_spike", 0.85, "Feature adoption up across 3 new modules", "Telemetry", "positive", 5),
            ("campaign_click", 0.7, "Clicked upgrade campaign twice", "Marketing", "positive", 8),
            ("nps_response", 0.8, "Submitted NPS of 9 (promoter)", "CRM", "positive", 12),
        ],
        "campaign_responder_no_followup": [
            ("campaign_click", 0.8, "Opened and clicked expansion offer", "Marketing", "positive", 7),
            ("nps_response", 0.6, "Positive survey response, no seller reply logged", "CRM", "positive", 16),
        ],
        "renewal_due": [
            ("renewal_upcoming", 0.7, "Contract renewal approaching", "CRM", "neutral", 3),
            ("usage_drop", 0.4, "Slight usage softening pre-renewal", "Telemetry", "negative", 10),
        ],
        "support_escalation": [
            ("support_ticket", 0.9, "Severity-1 ticket open for 5 days", "Support", "negative", 4),
            ("support_ticket", 0.7, "Repeat tickets on same integration", "Support", "negative", 11),
            ("nps_response", 0.6, "Detractor NPS of 4 citing support", "CRM", "negative", 14),
        ],
        "stable_monitor": [
            ("usage_spike", 0.4, "Steady, healthy usage", "Telemetry", "positive", 8),
            ("nps_response", 0.5, "Neutral survey response", "CRM", "neutral", 20),
        ],
        "weak_evidence": [
            ("login_drop", 0.3, "Minor login variance, low signal", "Telemetry", "neutral", 13),
        ],
    }
    chosen = plans.get(archetype, [])
    # weak_evidence: sometimes drop its single signal entirely
    if archetype == "weak_evidence" and random.random() < 0.5:
        chosen = []
    for (stype, strength, desc, src, polarity, days_ago) in chosen:
        out.append(sig(n, stype, strength, desc, src, polarity, days_ago))
        n += 1
    return out


def _notes_for(account_id: str, archetype: str) -> list:
    templates = {
        "at_risk_declining": ("call", "Customer mentioned budget review; usage has dropped."),
        "growth_ready": ("meeting", "Champion wants to expand to two more teams next quarter."),
        "campaign_responder_no_followup": ("internal", "Marketing flagged engagement; no seller follow-up yet."),
        "renewal_due": ("call", "Renewal conversation not yet scheduled."),
        "support_escalation": ("support", "Escalation in progress; customer frustrated with response time."),
        "stable_monitor": ("internal", "Account healthy; no action needed this cycle."),
        "weak_evidence": ("internal", "Limited recent activity; insufficient context to act."),
    }
    note_type, text = templates.get(archetype, ("internal", "General account note."))
    return [{
        "account_id": account_id,
        "note_type": note_type,
        "note_text": text,
        "created_date": (TODAY - timedelta(days=_rint(2, 25))).isoformat(),
    }]


def generate() -> dict:
    accounts: list = []
    signals: list = []
    notes: list = []
    used_names: set = set()

    archetype_plan = []
    for archetype, count in ARCHETYPES.items():
        archetype_plan.extend([archetype] * count)
    random.shuffle(archetype_plan)

    sig_counter = 1
    for idx, archetype in enumerate(archetype_plan, start=1):
        account_id = f"ACC-{idx:04d}"
        prof = _profile(archetype)
        account = {
            "account_id": account_id,
            "account_name": _name(used_names),
            "industry": random.choice(INDUSTRIES),
            "segment": random.choice(SEGMENTS),
            "region": random.choice(REGIONS),
            **prof,
            "_archetype": archetype,  # kept only for traceability in CSV comment column
        }
        accounts.append(account)

        acc_signals = _signals_for(account_id, archetype, sig_counter)
        sig_counter += len(acc_signals)
        signals.extend(acc_signals)
        notes.extend(_notes_for(account_id, archetype))

    _write_accounts(accounts)
    _write_signals(signals)
    _write_notes(notes)

    return {"accounts": len(accounts), "signals": len(signals), "notes": len(notes)}


ACCOUNT_FIELDS = [
    "account_id", "account_name", "industry", "segment", "region",
    "current_month_spend", "previous_month_spend", "product_usage_score",
    "engagement_score", "support_risk_score", "campaign_response_score",
    "last_contact_days", "renewal_days", "growth_potential_score",
]


def _write_accounts(accounts: list) -> None:
    path = os.path.join(HERE, "synthetic_accounts.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=ACCOUNT_FIELDS)
        writer.writeheader()
        for a in accounts:
            writer.writerow({k: a[k] for k in ACCOUNT_FIELDS})


SIGNAL_FIELDS = [
    "signal_id", "account_id", "signal_type", "signal_date", "signal_strength",
    "signal_description", "source_system", "positive_or_negative",
]


def _write_signals(signals: list) -> None:
    path = os.path.join(HERE, "synthetic_signals.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=SIGNAL_FIELDS)
        writer.writeheader()
        for s in signals:
            writer.writerow(s)


def _write_notes(notes: list) -> None:
    path = os.path.join(HERE, "synthetic_notes.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(notes, f, indent=2)


if __name__ == "__main__":
    counts = generate()
    print("Synthetic data generated (seed={}):".format(SEED))
    print(f"  accounts : {counts['accounts']:>4}  -> synthetic_accounts.csv")
    print(f"  signals  : {counts['signals']:>4}  -> synthetic_signals.csv")
    print(f"  notes    : {counts['notes']:>4}  -> synthetic_notes.json")
