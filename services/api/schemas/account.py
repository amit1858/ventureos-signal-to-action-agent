"""Account contracts -- the synthetic SMB account and its enrichment."""

from __future__ import annotations

from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field

from schemas.signal import Signal


class Account(BaseModel):
    """A synthetic SMB account with the metrics our scoring engine consumes.

    All score fields are 0..100. Spend fields are in generic currency units.
    """

    account_id: str = Field(..., description="Stable unique id, e.g. ACC-0007")
    account_name: str = Field(..., description="Synthetic company name")
    industry: str = Field(..., description="e.g. Retail, SaaS, Logistics, Healthcare")
    segment: str = Field(..., description="e.g. SMB, Mid-Market, Startup")
    region: str = Field(..., description="e.g. North, South, East, West, Central")
    country: Optional[str] = Field(default=None, description="Country for CRM realism, e.g. India, US")

    current_month_spend: float = Field(..., ge=0, description="This month spend (units)")
    previous_month_spend: float = Field(..., ge=0, description="Prior month spend (units)")

    product_usage_score: float = Field(..., ge=0, le=100, description="Usage health 0..100")
    engagement_score: float = Field(..., ge=0, le=100, description="Engagement 0..100")
    support_risk_score: float = Field(..., ge=0, le=100, description="Support risk 0..100 (high = risky)")
    campaign_response_score: float = Field(..., ge=0, le=100, description="Campaign responsiveness 0..100")

    last_contact_days: int = Field(..., ge=0, description="Days since last seller contact")
    renewal_days: int = Field(..., description="Days until renewal (can be negative if overdue)")
    growth_potential_score: float = Field(..., ge=0, le=100, description="Growth potential 0..100")


class Note(BaseModel):
    """A free-text CRM-style note attached to an account."""

    account_id: str = Field(..., description="Account this note belongs to")
    note_type: str = Field(..., description="e.g. call, meeting, support, internal")
    note_text: str = Field(..., description="Synthetic note body")
    created_date: date = Field(..., description="Date the note was created")


class AccountDetail(Account):
    """An account enriched with its signals and notes (GET /api/accounts/{id})."""

    signals: List[Signal] = Field(default_factory=list)
    notes: List[Note] = Field(default_factory=list)


class AccountListResponse(BaseModel):
    """Paginated account listing (GET /api/accounts)."""

    total: int
    limit: int
    offset: int
    accounts: List[Account]
