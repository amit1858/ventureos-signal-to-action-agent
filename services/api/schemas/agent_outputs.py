"""Typed outputs for each agent in the workflow.

These are the internal contracts the orchestrator passes between agents. Keeping
them explicit (rather than dicts) is what lets us later swap the Python
orchestrator for NeMo Agent Toolkit without losing the data shape.
"""

from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field

from schemas.account import Account, Note
from schemas.signal import Signal
from schemas.recommendation import Evidence


class AccountContext(BaseModel):
    """Output of the Signal Ingestion Agent: an account with grouped signals."""

    account: Account
    signals: List[Signal] = Field(default_factory=list)
    notes: List[Note] = Field(default_factory=list)
    positive_signal_count: int = 0
    negative_signal_count: int = 0
    spend_delta: float = 0.0
    spend_delta_pct: float = 0.0


class HealthAssessment(BaseModel):
    """Output of the Account Health Agent."""

    account_id: str
    risk_score: float = Field(0.0, ge=0.0, le=1.0)
    risk_factors: List[str] = Field(default_factory=list)
    health_summary: str = ""
    evidence: List[Evidence] = Field(default_factory=list)


class OpportunityAssessment(BaseModel):
    """Output of the Opportunity Agent."""

    account_id: str
    opportunity_score: float = Field(0.0, ge=0.0, le=1.0)
    opportunity_factors: List[str] = Field(default_factory=list)
    opportunity_summary: str = ""
    evidence: List[Evidence] = Field(default_factory=list)


class GovernanceAssessment(BaseModel):
    """Output of the Governance Agent. requires_human_approval is always True."""

    account_id: str
    governance_status: str = "review_required"
    confidence_score: float = Field(0.0, ge=0.0, le=1.0)
    caveats: List[str] = Field(default_factory=list)
    evidence_count: int = 0
    requires_human_approval: bool = True


class ActionProposal(BaseModel):
    """Output of the Action Agent."""

    account_id: str
    action_type: str
    recommended_action: str
    rationale: str = ""
    urgency: str = "this_week"


class CommunicationDraft(BaseModel):
    """Output of the Communication Agent."""

    account_id: str
    draft_email: str
    call_script: str
    voice_summary: str
