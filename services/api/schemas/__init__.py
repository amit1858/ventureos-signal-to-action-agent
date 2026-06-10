"""Typed Pydantic contracts for the Signal-to-Action Agent backend.

Every agent input/output and every API payload is a typed model defined here.
This is deliberate: a governed multi-agent workflow needs explicit, validated
contracts -- not free-form chatbot text.
"""

from schemas.account import Account, AccountDetail, Note, AccountListResponse
from schemas.signal import Signal, SignalPolarity
from schemas.recommendation import (
    Evidence,
    Recommendation,
    RecommendationRequest,
    RecommendationResponse,
    ApprovalStatus,
    ScoreBreakdown,
)
from schemas.ledger import DecisionLedger, LedgerAgentStep
from schemas.agent_outputs import (
    AccountContext,
    HealthAssessment,
    OpportunityAssessment,
    GovernanceAssessment,
    ActionProposal,
    CommunicationDraft,
)

__all__ = [
    "Account",
    "AccountDetail",
    "Note",
    "AccountListResponse",
    "Signal",
    "SignalPolarity",
    "Evidence",
    "Recommendation",
    "RecommendationRequest",
    "RecommendationResponse",
    "ApprovalStatus",
    "ScoreBreakdown",
    "DecisionLedger",
    "LedgerAgentStep",
    "AccountContext",
    "HealthAssessment",
    "OpportunityAssessment",
    "GovernanceAssessment",
    "ActionProposal",
    "CommunicationDraft",
]
