"""Adaptive Mission Harness (Release 2.2).

The Harness is the Python-owned mission orchestration layer that sits over the
PROTECTED 6-agent orchestrator, Decision Ledger, MemoryStore and Conversation
Runtime. It owns mission definition, planning, verification, approval policy,
state transitions, simulated execution, audit and evaluation.

Cross-language direction (LOCKED, Revision 3):

    Presentation -> Next.js Mission BFF -> Python Adaptive Mission Harness
      -> MissionExecutionPayload -> TypeScript Memory + Conversation Runtime
      -> MissionTurn -> Presentation

Python never calls the frontend. This package is additive and modifies no
protected engine.

Commit 1 exposes only the typed contracts; later commits add the registries,
Mission Planner, state machine, Customer Context Fabric, sandbox, Mission Audit
Ledger, Mission Evaluation and the service/API surface.
"""

from __future__ import annotations

from harness.contracts import (
    ActionReceipt,
    ApprovalChannel,
    ApprovalDecision,
    ApprovalOutcome,
    ApprovalRequest,
    CanonicalAccountRef,
    EvidenceRef,
    HarnessModel,
    MissionConstraint,
    MissionDefinition,
    MissionDefinitionBrief,
    MissionEvaluation,
    MissionEvent,
    MissionExecutionPayload,
    MissionState,
    MissionTurn,
    MissionTurnApproval,
    OutcomeStatus,
    PersonaResponseView,
    RecommendationRef,
    RecommendationSummary,
    RequiredEvidence,
    RetrievalQuerySpec,
    RiskLevel,
    SuccessCriterion,
    SuccessCriterionBrief,
    SuccessCriterionResult,
    UserDecision,
    VerificationCheck,
    VerificationResult,
)

__all__ = [
    "ActionReceipt",
    "ApprovalChannel",
    "ApprovalDecision",
    "ApprovalOutcome",
    "ApprovalRequest",
    "CanonicalAccountRef",
    "EvidenceRef",
    "HarnessModel",
    "MissionConstraint",
    "MissionDefinition",
    "MissionDefinitionBrief",
    "MissionEvaluation",
    "MissionEvent",
    "MissionExecutionPayload",
    "MissionState",
    "MissionTurn",
    "MissionTurnApproval",
    "OutcomeStatus",
    "PersonaResponseView",
    "RecommendationRef",
    "RecommendationSummary",
    "RequiredEvidence",
    "RetrievalQuerySpec",
    "RiskLevel",
    "SuccessCriterion",
    "SuccessCriterionBrief",
    "SuccessCriterionResult",
    "UserDecision",
    "VerificationCheck",
    "VerificationResult",
]
