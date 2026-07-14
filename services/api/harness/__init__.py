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

# -- Commit 2: registries, templates, selection, planning, policy ----------

from harness.registries import (  # noqa: E402
    AgentEntry,
    AgentRegistry,
    DuplicateIdError,
    InactiveError,
    MissionTemplateRegistry,
    RegistryError,
    ToolEntry,
    ToolRegistry,
    UnknownIdError,
    default_agent_registry,
    default_tool_registry,
)
from harness.templates import (  # noqa: E402
    RENEWAL_RISK_PARALLEL_V1,
    SUPPORT_ESCALATION_SEQUENTIAL_V1,
    AgentStep,
    MissionTemplate,
    TemplateBudgets,
    default_template_registry,
    renewal_risk_parallel_v1,
    support_escalation_sequential_v1,
)
from harness.selector import SelectionResult, select  # noqa: E402
from harness.planner import MissionPlan, PlannedTask, plan_mission  # noqa: E402
from harness.policy_validator import PolicyValidationResult, validate  # noqa: E402

__all__ += [
    # registries
    "RegistryError",
    "DuplicateIdError",
    "UnknownIdError",
    "InactiveError",
    "AgentEntry",
    "ToolEntry",
    "MissionTemplateRegistry",
    "AgentRegistry",
    "ToolRegistry",
    "default_agent_registry",
    "default_tool_registry",
    # templates
    "RENEWAL_RISK_PARALLEL_V1",
    "SUPPORT_ESCALATION_SEQUENTIAL_V1",
    "AgentStep",
    "TemplateBudgets",
    "MissionTemplate",
    "renewal_risk_parallel_v1",
    "support_escalation_sequential_v1",
    "default_template_registry",
    # selection / planning / policy
    "SelectionResult",
    "select",
    "PlannedTask",
    "MissionPlan",
    "plan_mission",
    "PolicyValidationResult",
    "validate",
]
