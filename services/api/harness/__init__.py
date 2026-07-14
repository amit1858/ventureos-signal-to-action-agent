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
from harness.planner import (  # noqa: E402
    MissionPlan,
    NoMatchingMissionTemplate,
    PlannedTask,
    plan_mission,
    plan_mission_for_signals,
)
from harness.policy_validator import (  # noqa: E402
    NO_MATCHING_TEMPLATE,
    PolicyValidationResult,
    result_for_unsupported_selection,
    validate,
)

# -- Commit 3: Customer Context Fabric -------------------------------------

from harness.fabric import (  # noqa: E402
    CanonicalAccount,
    ConflictValue,
    FieldConflict,
    FieldProvenance,
    IdentityResolution,
    MatchEvidence,
    RESOLUTION_THRESHOLD,
    SourceAccountRecord,
    ambiguous_source_records,
    cluster_records,
    default_source_records,
    dynamics_fixtures,
    hubspot_fixtures,
    name_key,
    normalize_account_name,
    normalize_domain,
    resolve_demo_account,
    resolve_identity,
    salesforce_fixtures,
)

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
    "NoMatchingMissionTemplate",
    "plan_mission",
    "plan_mission_for_signals",
    "PolicyValidationResult",
    "result_for_unsupported_selection",
    "NO_MATCHING_TEMPLATE",
    "validate",
    # customer context fabric
    "RESOLUTION_THRESHOLD",
    "normalize_account_name",
    "name_key",
    "normalize_domain",
    "SourceAccountRecord",
    "MatchEvidence",
    "FieldProvenance",
    "ConflictValue",
    "FieldConflict",
    "CanonicalAccount",
    "IdentityResolution",
    "cluster_records",
    "resolve_identity",
    "hubspot_fixtures",
    "salesforce_fixtures",
    "dynamics_fixtures",
    "default_source_records",
    "ambiguous_source_records",
    "resolve_demo_account",
]

# -- Commit 4: mission lifecycle state machine ------------------------------

from harness.state_machine import (  # noqa: E402
    GuardResult,
    IllegalTransitionError,
    MissionEventType,
    MissionLifecycle,
    StateMachineError,
    TERMINAL_STATES,
    TransitionContext,
    TransitionResult,
    evaluate_transition,
    transition_table,
)

__all__ += [
    "StateMachineError",
    "IllegalTransitionError",
    "MissionEventType",
    "TERMINAL_STATES",
    "TransitionContext",
    "GuardResult",
    "TransitionResult",
    "transition_table",
    "evaluate_transition",
    "MissionLifecycle",
]

# -- Commit 5: deterministic simulation sandbox -----------------------------

from harness.sandbox import (  # noqa: E402
    ActionRequest,
    ApprovalMismatchError,
    ApprovalRequiredError,
    IdempotencyConflictError,
    IllegalExecutionStateError,
    InactiveToolError,
    PayloadHashMismatchError,
    SandboxError,
    SimulationOutput,
    SimulationSandbox,
    UnsupportedToolError,
    payload_hash,
)

__all__ += [
    "SandboxError",
    "UnsupportedToolError",
    "InactiveToolError",
    "IllegalExecutionStateError",
    "ApprovalRequiredError",
    "ApprovalMismatchError",
    "PayloadHashMismatchError",
    "IdempotencyConflictError",
    "payload_hash",
    "ActionRequest",
    "SimulationOutput",
    "SimulationSandbox",
]

# -- Commit 6: append-only Mission Audit Ledger -----------------------------

from harness.audit_ledger import (  # noqa: E402
    GENESIS_HASH,
    RECORD_TYPES,
    SCHEMA_VERSION,
    ApprovalMismatchError as AuditApprovalMismatchError,
    AuditLedgerError,
    ChainVerification,
    DuplicateRecordError,
    DuplicateSequenceError,
    IdempotencyConflictError as AuditIdempotencyConflictError,
    InvalidMissionVersionError,
    InvalidRecordTypeError,
    LedgerRecord,
    MalformedPayloadError,
    MissingMissionIdError,
    MissionAuditBundle,
    MissionAuditLedger,
    NonSimulatedReceiptError,
    PayloadHashMismatchError as AuditPayloadHashMismatchError,
    ReceiptAppendResult,
    RejectedApprovalError,
    TransactionError,
)

__all__ += [
    "SCHEMA_VERSION",
    "GENESIS_HASH",
    "RECORD_TYPES",
    "AuditLedgerError",
    "MissingMissionIdError",
    "InvalidMissionVersionError",
    "InvalidRecordTypeError",
    "DuplicateRecordError",
    "DuplicateSequenceError",
    "MalformedPayloadError",
    "AuditIdempotencyConflictError",
    "AuditApprovalMismatchError",
    "AuditPayloadHashMismatchError",
    "RejectedApprovalError",
    "NonSimulatedReceiptError",
    "TransactionError",
    "LedgerRecord",
    "ChainVerification",
    "ReceiptAppendResult",
    "MissionAuditBundle",
    "MissionAuditLedger",
]

# -- Commit 7: deterministic mission evaluation -----------------------------

from harness.evaluation import (  # noqa: E402
    FAIL_AMBIGUOUS_IDENTITY,
    FAIL_APPROVAL_PAYLOAD_MISMATCH,
    FAIL_APPROVAL_REJECTED,
    FAIL_NO_MATCHING_TEMPLATE,
    FAIL_POLICY,
    FAIL_VERIFICATION,
    STATUS_BLOCKED,
    STATUS_FAILED,
    STATUS_PASSED,
    STATUS_REJECTED,
    STATUS_REVISION_REQUIRED,
    MissionEvaluationResult,
    MissionScenario,
    MissionScorecard,
    default_injected_timestamps,
    default_scenarios,
    evaluate_mission_scenario,
)

__all__ += [
    "STATUS_PASSED",
    "STATUS_BLOCKED",
    "STATUS_REJECTED",
    "STATUS_REVISION_REQUIRED",
    "STATUS_FAILED",
    "FAIL_AMBIGUOUS_IDENTITY",
    "FAIL_NO_MATCHING_TEMPLATE",
    "FAIL_POLICY",
    "FAIL_VERIFICATION",
    "FAIL_APPROVAL_PAYLOAD_MISMATCH",
    "FAIL_APPROVAL_REJECTED",
    "MissionScenario",
    "MissionScorecard",
    "MissionEvaluationResult",
    "evaluate_mission_scenario",
    "default_scenarios",
    "default_injected_timestamps",
]
