"""Recommendation contracts -- the core, human-facing output of the workflow."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List

from pydantic import BaseModel, Field

from schemas.ledger import DecisionLedger


class ApprovalStatus(str, Enum):
    """Human-in-the-loop gate. Nothing executes while pending."""

    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class Evidence(BaseModel):
    """A single, attributable piece of evidence behind a recommendation.

    Evidence is what the UI renders as chips and what governance counts. Each
    item names the agent that produced it and the source system it came from.
    """

    source_agent: str = Field(..., description="Agent that surfaced this evidence")
    label: str = Field(..., description="Short chip label, e.g. 'Spend down 32%'")
    detail: str = Field(..., description="Fuller explanation for the detail panel")
    source_system: str = Field("derived", description="CRM | Billing | Support | Telemetry | Marketing | derived")
    polarity: str = Field("neutral", description="positive | negative | neutral")
    strength: float = Field(0.5, ge=0.0, le=1.0, description="How strong this evidence is 0..1")


class ScoreBreakdown(BaseModel):
    """Transparent decomposition of the deterministic priority score (all 0..1)."""

    support_risk: float = Field(0.0, ge=0.0, le=1.0)
    spend_decline: float = Field(0.0, ge=0.0, le=1.0)
    growth_potential: float = Field(0.0, ge=0.0, le=1.0)
    renewal_urgency: float = Field(0.0, ge=0.0, le=1.0)
    campaign_response: float = Field(0.0, ge=0.0, le=1.0)
    engagement_gap: float = Field(0.0, ge=0.0, le=1.0)
    last_contact_gap: float = Field(0.0, ge=0.0, le=1.0)
    priority_score: float = Field(0.0, ge=0.0, le=1.0, description="Weighted total 0..1")


class Recommendation(BaseModel):
    """A single prioritized, explained, human-approvable next-best action."""

    recommendation_id: str = Field(..., description="Stable id for approval actions")
    account_id: str
    account_name: str
    priority_rank: int = Field(..., ge=1, description="1 = highest priority")
    priority_score: float = Field(..., ge=0.0, le=1.0)
    priority_reason: str = Field(..., description="Why this account ranks where it does")
    risk_summary: str = Field(..., description="Account Health Agent summary")
    opportunity_summary: str = Field(..., description="Opportunity Agent summary")
    recommended_action: str = Field(..., description="The concrete next-best action")
    action_type: str = Field(..., description="follow_up | reactivation | optimization_review | "
                                              "support_escalation | renewal_prep | monitor")
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    evidence: List[Evidence] = Field(default_factory=list)
    governance_caveats: List[str] = Field(default_factory=list)
    governance_status: str = Field("review_required", description="ok | review_required | insufficient_evidence")
    draft_email: str = Field(..., description="Seller-ready email draft")
    call_script: str = Field(..., description="Seller-ready call script")
    voice_summary: str = Field(..., description="Short spoken summary")
    approval_status: ApprovalStatus = Field(ApprovalStatus.pending)
    score_breakdown: ScoreBreakdown
    agents_invoked: List[str] = Field(default_factory=list)


class RecommendationRequest(BaseModel):
    """Input to POST /api/recommendations."""

    query: str = Field(
        "Which SMB accounts need attention this week and why?",
        description="Natural-language business question",
    )
    limit: int = Field(10, ge=1, le=50, description="How many accounts to return")


class RecommendationResponse(BaseModel):
    """Output of POST /api/recommendations."""

    query: str
    recommendations: List[Recommendation]
    decision_ledger: DecisionLedger
    latency_ms: int
    model_provider: str
    generated_at: datetime
    data_source: str = Field(
        "Synthetic local dataset",
        description="Active data source: 'Synthetic local dataset' | 'HubSpot test CRM'",
    )
