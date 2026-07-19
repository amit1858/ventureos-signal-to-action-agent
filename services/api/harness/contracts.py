"""Adaptive Mission Harness -- typed contracts (Release 2.2, Commit 1).

These are the Python-owned contracts for the mission-driven architecture:

* Internal business-planning contracts -- ``MissionDefinition`` (created by the
  Mission Planner *before* execution) and ``MissionEvaluation`` (recorded after
  simulated execution).
* Governance contracts -- ``ApprovalRequest`` / ``ApprovalDecision`` and
  ``ActionReceipt`` (simulated-only in this release).
* The cross-language execution contract ``MissionExecutionPayload`` that Python
  hands to the Next.js Mission BFF, and the ``MissionTurn`` the BFF packages back
  (modelled here for round-trip validation; the runtime instance is built in
  TypeScript by the protected Conversation Runtime).

Architecture rules encoded here (Revision 3 + Revision 4, both LOCKED):

* ``requires_human_approval`` is always ``True`` -- nothing auto-executes.
* ``ActionReceipt.simulated`` is always ``True`` -- Release 2.2 is simulated-only,
  no external CRM / network write-back.
* JSON is emitted in camelCase (``by_alias=True``) to match the locked spec and
  the TypeScript consumer, while Python code uses snake_case attributes.

This module adds NO behaviour and touches NO protected engine. It is pure data.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator


# -- camelCase JSON on the cross-language boundary --------------------------


def _to_camel(snake: str) -> str:
    """Convert ``snake_case`` field names to ``camelCase`` JSON keys.

    ``venture_os_id`` -> ``ventureOsId`` -- exactly the keys in the locked spec
    and the shape the TypeScript BFF/runtime expects.
    """
    head, *tail = snake.split("_")
    return head + "".join(word[:1].upper() + word[1:] for word in tail)


class HarnessModel(BaseModel):
    """Base for every harness contract.

    * Serialises to camelCase JSON via ``model_dump(by_alias=True)`` /
      ``model_dump_json(by_alias=True)``.
    * Still accepts snake_case *or* camelCase on input (``populate_by_name``), so
      Python callers and the TypeScript boundary can both round-trip cleanly.
    """

    model_config = ConfigDict(
        alias_generator=_to_camel,
        populate_by_name=True,
    )


# -- enumerations -----------------------------------------------------------


class MissionState(str, Enum):
    """The governed mission lifecycle (Revision 3 -- LOCKED, unchanged).

    Transition guards live in the state machine (Commit 4); this enum only names
    the states. ``verifying`` precedes approval; ``simulated_executed`` follows a
    valid ``ApprovalDecision``; ``closed`` carries a ``MissionEvaluation``.
    """

    opened = "opened"
    gathering = "gathering"
    proposed = "proposed"
    verifying = "verifying"
    verified = "verified"
    blocked = "blocked"
    awaiting_approval = "awaiting_approval"
    approved = "approved"
    rejected = "rejected"
    simulated_executed = "simulated_executed"
    verified_outcome = "verified_outcome"
    closed = "closed"


class RiskLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class ApprovalChannel(str, Enum):
    """How a human approval was captured. All channels route to the same gate."""

    screen = "screen"
    voice = "voice"
    avatar = "avatar"


class ApprovalOutcome(str, Enum):
    approved = "approved"
    rejected = "rejected"


class OutcomeStatus(str, Enum):
    """Mission outcome. Release 2.2 only ever records ``simulated``."""

    successful = "successful"
    partial = "partial"
    failed = "failed"
    pending = "pending"
    simulated = "simulated"


class UserDecision(str, Enum):
    approved = "approved"
    rejected = "rejected"
    modified = "modified"


# -- shared value objects ---------------------------------------------------


class CanonicalAccountRef(HarnessModel):
    """The single governed identity for a mission's account.

    Produced by the Customer Context Fabric (Commit 3). ``venture_os_id`` is the
    canonical id and the MemoryStore subject key used by retrieval.
    """

    venture_os_id: str = Field(..., description="Canonical VentureOS account id")
    canonical_name: str = Field(..., description="Canonical display name")


class SuccessCriterion(HarnessModel):
    """A measurable definition of mission success."""

    criterion_id: str
    description: str
    measurement_type: str = Field(..., description="e.g. boolean | numeric | qualitative")
    target: Optional[Union[str, float]] = None


class MissionConstraint(HarnessModel):
    """A boundary the mission must respect (governance, safety, scope)."""

    type: str = Field(..., description="e.g. governance | safety | scope | data")
    description: str


class RequiredEvidence(HarnessModel):
    """A category of evidence the mission requires before it may proceed."""

    category: str
    mandatory: bool = True


# -- MissionDefinition.v1 (internal, Python-owned) --------------------------


class MissionDefinition(HarnessModel):
    """The business plan for a mission -- created by the Mission Planner.

    Internal to Python. It *governs* planning and template selection and then
    *produces* a ``MissionExecutionPayload``. It is not the cross-language
    contract and is never reinterpreted by TypeScript.
    """

    schema_version: Literal["1.0"] = "1.0"
    mission_id: str
    mission_type: str
    trigger_signal_id: str
    canonical_account: CanonicalAccountRef
    objective: str
    rationale: str
    success_criteria: List[SuccessCriterion] = Field(default_factory=list)
    constraints: List[MissionConstraint] = Field(default_factory=list)
    risk_level: RiskLevel
    required_evidence: List[RequiredEvidence] = Field(default_factory=list)
    permitted_actions: List[str] = Field(default_factory=list)
    requires_human_approval: Literal[True] = True
    selected_template_id: Optional[str] = None
    expected_outcome: Optional[str] = None

    @field_validator("requires_human_approval")
    @classmethod
    def _approval_is_mandatory(cls, value: bool) -> bool:
        # Human approval is a hardcoded guarantee, never configurable away.
        if value is not True:
            raise ValueError("requires_human_approval must be True (human-in-the-loop is mandatory).")
        return value


# -- MissionEvaluation.v1 (post-execution, deterministic) -------------------


class SuccessCriterionResult(HarnessModel):
    criterion_id: str
    status: Literal["met", "partially_met", "not_met", "not_measurable"]
    detail: str


class MissionEvaluation(HarnessModel):
    """Outcome evaluation recorded after simulated execution (distinct from
    Verification). For Release 2.2 ``outcome_status`` is always ``simulated`` --
    no real-world business outcome is ever claimed.
    """

    schema_version: Literal["1.0"] = "1.0"
    mission_id: str
    objective_achieved: Optional[bool] = None
    success_criteria_results: List[SuccessCriterionResult] = Field(default_factory=list)
    recommendation_accepted: bool
    action_executed: bool
    outcome_status: OutcomeStatus
    evidence_quality_score: float = Field(..., ge=0.0, le=1.0)
    user_decision: UserDecision
    latency_ms: Optional[int] = Field(None, ge=0)
    estimated_cost: Optional[float] = Field(None, ge=0.0)
    evaluation_notes: List[str] = Field(default_factory=list)
    evaluated_at: str = Field(..., description="ISO-8601 timestamp (caller-supplied, deterministic)")


# -- Approval contracts -----------------------------------------------------


class ApprovalRequest(HarnessModel):
    """A request for a human to approve a verified mission action.

    The request pins the exact mission version, the reviewed action payload (by
    reference and by hash) and the verification that made the action eligible, so
    the human is approving one specific, verified thing -- never a moving target.
    """

    schema_version: Literal["1.0"] = "1.0"
    mission_id: str
    mission_version: str = Field(..., description="Mission version this approval is scoped to")
    recommendation_id: str
    action_type: str
    permitted_actions: List[str] = Field(
        default_factory=list, description="Actions the mission is allowed to take"
    )
    action_payload_ref: str = Field(..., description="Reference to the reviewed action payload")
    action_payload_hash: str = Field(..., description="Hash of the reviewed action payload")
    verification_ref: str = Field(..., description="Verification record that cleared this action")
    requires_human_approval: Literal[True] = True
    simulated: Literal[True] = True
    prompt: str = Field(..., description="Human-facing approval prompt")

    @field_validator("simulated")
    @classmethod
    def _must_be_simulated(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("ApprovalRequest.simulated must be True (Release 2.2 is simulated-only).")
        return value


class ApprovalDecision(HarnessModel):
    """A human's decision, bound to one mission version and one reviewed action.

    A spoken 'approve' still produces this same object and (for the voice channel)
    carries an explicit ``confirm_token``. ``approved_action_ref`` and
    ``approved_payload_hash`` bind the decision to exactly the payload that was
    verified and presented, so an approval cannot be replayed against a different
    action or an unversioned mission.
    """

    schema_version: Literal["1.0"] = "1.0"
    decision_id: str
    mission_id: str
    mission_version: str = Field(..., description="Mission version this decision is bound to")
    outcome: ApprovalOutcome
    actor: str = Field(..., description="Identity of the approving human")
    actor_role: str = Field(..., description="Role of the approving human (e.g. seller | manager)")
    channel: ApprovalChannel = ApprovalChannel.screen
    approved_action_ref: str = Field(..., description="Reference to the action being approved")
    approved_payload_hash: str = Field(
        ..., description="Hash of the approved payload (must match the ApprovalRequest)"
    )
    confirm_token: Optional[str] = Field(
        None, description="Explicit confirmation token (required for voice approvals)"
    )
    simulated: Literal[True] = True
    reason: Optional[str] = None
    decided_at: str = Field(..., description="ISO-8601 timestamp (caller-supplied)")

    @field_validator("simulated")
    @classmethod
    def _must_be_simulated(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("ApprovalDecision.simulated must be True (Release 2.2 is simulated-only).")
        return value


# -- ActionReceipt (simulated-only) -----------------------------------------


class ActionReceipt(HarnessModel):
    """Proof that an approved action was executed in the local deterministic
    sandbox. Release 2.2 is simulated-only: ``simulated`` is always ``True`` and
    nothing is written to any external CRM or network target.

    The receipt is bound to the approved payload (``approved_payload_hash``) and
    to the Mission Audit chain (``audit_ref``), and records the sandbox
    before/after state so the simulated effect is fully inspectable.
    """

    schema_version: Literal["1.0"] = "1.0"
    receipt_id: str
    mission_id: str
    recommendation_id: str
    action_type: str
    target_type: str = Field(..., description="Kind of entity the action targets (e.g. account | ticket)")
    target_id: str = Field(..., description="Identifier of the targeted entity")
    tool_id: str = Field(..., description="Registered sandbox tool that produced this receipt")
    approved_payload_hash: str = Field(
        ..., description="Hash of the approved payload this receipt executed (binds to ApprovalDecision)"
    )
    before_state: dict = Field(default_factory=dict, description="Sandbox state before the simulated action")
    after_state: dict = Field(default_factory=dict, description="Sandbox state after the simulated action")
    simulated: Literal[True] = True
    summary: str
    details: dict = Field(default_factory=dict)
    audit_ref: str = Field(..., description="Mission Audit entry this receipt is recorded under")
    created_at: str = Field(..., description="ISO-8601 timestamp (caller-supplied)")

    @field_validator("simulated")
    @classmethod
    def _must_be_simulated(cls, value: bool) -> bool:
        # Hard invariant for the slice: no receipt may ever claim real execution.
        if value is not True:
            raise ValueError("ActionReceipt.simulated must be True (Release 2.2 is simulated-only).")
        return value


# -- Verification (pre-approval eligibility) --------------------------------


class VerificationCheck(HarnessModel):
    name: str
    passed: bool
    detail: str


class VerificationResult(HarnessModel):
    """The verdict of the pre-approval verification gate."""

    status: Literal["verified", "blocked"]
    checks: List[VerificationCheck] = Field(default_factory=list)


# -- MissionExecutionPayload.v1 (cross-language: Python -> BFF) --------------


class RetrievalQuerySpec(HarnessModel):
    """The retrieval instruction Python hands to the TypeScript runtime. The BFF
    executes it verbatim against the protected MemoryStore -- it makes no
    business decision of its own.
    """

    subject_id: str = Field(..., description="MemoryStore subject key (== ventureOsId)")
    categories: Optional[List[str]] = None
    limit: int = Field(5, ge=1, le=50)


class RecommendationRef(HarnessModel):
    """A reference to the governed recommendation. ``ledger_id`` links to the
    PROTECTED Decision Ledger by reference only -- never written to.
    """

    recommendation_id: str
    ledger_id: str = Field(..., description="Protected Decision Ledger reference (link only)")
    account_id: str
    action_type: str
    priority_rank: int = Field(..., ge=1)
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    governance_status: str
    requires_human_approval: Literal[True] = True


class EvidenceRef(HarnessModel):
    """A reference-only summary of one piece of evidence backing the mission.

    Points at a retrieved memory/record by id and category; the full record is
    materialised by the TypeScript MemoryStore. Python passes references, not
    memory contents, across the boundary.
    """

    record_id: str = Field(..., description="MemoryStore / source record id (reference only)")
    category: str
    source: str = Field(..., description="Provenance of the evidence (e.g. memory | crm | signal)")
    summary: str


class SuccessCriterionBrief(HarnessModel):
    criterion_id: str
    description: str


class MissionDefinitionBrief(HarnessModel):
    """Additive, read-only projection of the MissionDefinition for the UI's
    Mission Brief. TypeScript renders it; it never reinterprets it.
    """

    mission_type: str
    objective: str
    rationale: str
    success_criteria: List[SuccessCriterionBrief] = Field(default_factory=list)
    risk_level: str
    selected_template_id: str
    expected_outcome: Optional[str] = None


class MissionExecutionPayload(HarnessModel):
    """Python -> Next.js Mission BFF. A decision-closed instruction: the TS side
    executes retrieval and composes language, but never overrides mission state,
    verification, approval policy, or the allowed action.

    Carries the selected template, the governed recommendation, the verification
    verdict (by value and by reference), the permitted actions, evidence
    references, and -- once the mission is awaiting approval -- the bound
    ``ApprovalRequest``. It intentionally carries NO PersonaResponse: language is
    composed on the TypeScript side and appears only on ``MissionTurn``.
    """

    schema_version: Literal["1.0"] = "1.0"
    mission_id: str
    turn_index: int = Field(..., ge=0)
    mission_state: MissionState
    canonical_account: CanonicalAccountRef
    intent: str = Field(..., description="ConversationIntent (resume|status|risk_review|next_step|recap)")
    persona_id: str
    selected_template_id: str = Field(..., description="Deterministically selected mission template id")
    retrieval_query: RetrievalQuerySpec
    recommendation: RecommendationRef
    permitted_actions: List[str] = Field(
        default_factory=list, description="Actions the mission is allowed to take"
    )
    evidence_refs: List[EvidenceRef] = Field(
        default_factory=list, description="Reference-only evidence summary backing the mission"
    )
    verification: VerificationResult
    verification_ref: str = Field(..., description="Verification record id (Mission Audit reference)")
    approval_request: Optional[ApprovalRequest] = Field(
        None, description="Present once the mission is awaiting approval; bound to this action/version"
    )
    mission_definition: Optional[MissionDefinitionBrief] = Field(
        None, description="Additive Mission Brief projection (display-only)"
    )
    audit_ref: str = Field(..., description="Mission Audit entry id for this turn")
    simulated: Literal[True] = True

    @field_validator("simulated")
    @classmethod
    def _must_be_simulated(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("MissionExecutionPayload.simulated must be True (Release 2.2 is simulated-only).")
        return value


# -- MissionTurn.v1 (cross-language: BFF -> presentation) -------------------


class RecommendationSummary(HarnessModel):
    """The subset of recommendation fields the presentation layer renders."""

    recommendation_id: str
    action_type: str
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    governance_status: str


class PersonaResponseView(HarnessModel):
    """A permissive view of the TypeScript ``PersonaResponse``. The concrete
    segment/citation/diagnostics shapes are owned by the protected Conversation
    Runtime; here they are validated structurally for round-tripping only.
    """

    segments: List[dict] = Field(default_factory=list)
    citations: List[dict] = Field(default_factory=list)
    diagnostics: dict = Field(default_factory=dict)


class MissionTurnApproval(HarnessModel):
    decision_id: str
    outcome: ApprovalOutcome
    actor: str
    channel: ApprovalChannel


class MissionTurn(HarnessModel):
    """The final packaged turn the BFF returns to presentation. Packaged in
    TypeScript after retrieval + composition; modelled here so both sides can
    pin the JSON shape in contract round-trip tests.
    """

    schema_version: Literal["1.0"] = "1.0"
    mission_id: str
    turn_index: int = Field(..., ge=0)
    mission_state: MissionState
    canonical_account: CanonicalAccountRef
    persona_response: PersonaResponseView
    voice_summary: str
    verification: VerificationResult
    recommendation: RecommendationSummary
    requires_approval: bool
    approval: Optional[MissionTurnApproval] = None
    audit_ref: str
    simulated: Literal[True] = True


# -- MissionEvent.v1 (cross-language: lifecycle transitions) -----------------


class MissionEvent(HarnessModel):
    """A minimal, additive record of one mission lifecycle transition.

    Used to represent the governed state machine on the wire and in the Mission
    Audit chain. ``from_state`` / ``to_state`` are optional so pure events (e.g.
    ``revision_requested``) that gate a return transition can be recorded
    explicitly -- there is no implicit retry. For example, recovering a blocked
    mission is three explicit events:

        blocked  --(revision_requested)-->  gathering

    modelled as an event with ``event_type='revision_requested'``,
    ``from_state='blocked'`` and ``to_state='gathering'``.
    """

    schema_version: Literal["1.0"] = "1.0"
    event_id: str
    mission_id: str
    mission_version: str
    event_type: str = Field(..., description="e.g. opened | verified | blocked | revision_requested | approved")
    from_state: Optional[MissionState] = None
    to_state: Optional[MissionState] = None
    actor: str = Field(..., description="Who/what raised the event (human id or 'system')")
    reason: Optional[str] = None
    correlation_id: str = Field(..., description="Correlates events belonging to the same mission thread")
    occurred_at: str = Field(..., description="ISO-8601 timestamp (caller-supplied, deterministic)")
