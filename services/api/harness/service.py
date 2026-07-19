"""In-process Mission Harness service boundary (Release 2.2, Commit 8).

A thin, offline Python facade over the deterministic mission evaluator and the
Mission Audit Ledger. It is the stable seam a future Python HTTP adapter (and,
above it, the Next.js Mission BFF) will call -- but it contains NO HTTP, no
FastAPI, no network, no provider, no CRM, and no frontend code.

Responsibilities (coordination only -- never business logic):

* Validate a typed :class:`HarnessServiceRequest` strictly.
* Manage the Mission Audit Ledger lifecycle (create-and-own, or use a
  caller-owned instance and leave it open).
* Run :func:`evaluate_mission_scenario`, which owns identity resolution,
  template selection, planning, policy, state transitions, sandbox execution and
  all audit rules. The service duplicates none of them.
* Map a *governance-valid* :class:`MissionEvaluationResult` to the existing
  cross-language :class:`MissionExecutionPayload`. Blocked / rejected / ambiguous
  missions never produce an executable payload.
* Map internal failures to typed, BFF-safe service errors (no stack traces, no
  paths, no SQL, no secrets).
* Return a deterministic, fully-serialisable :class:`HarnessServiceResponse`.

The response carries NO PersonaResponse and no presentation text: language is
composed later, on the TypeScript side, from the MissionExecutionPayload.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Dict, List, Optional

from pydantic import ConfigDict, Field, field_validator

from harness.contracts import (
    ApprovalRequest,
    CanonicalAccountRef,
    EvidenceRef,
    HarnessModel,
    MissionDefinitionBrief,
    MissionExecutionPayload,
    MissionState,
    RecommendationRef,
    RetrievalQuerySpec,
    SuccessCriterionBrief,
    VerificationResult,
    _to_camel,
)
from harness.audit_ledger import MissionAuditLedger
from harness.evaluation import (
    FAIL_AMBIGUOUS_IDENTITY,
    FAIL_APPROVAL_PAYLOAD_MISMATCH,
    FAIL_APPROVAL_REJECTED,
    FAIL_IDEMPOTENCY_CONFLICT,
    FAIL_INTERNAL,
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
    default_injected_timestamps,
    evaluate_mission_scenario,
)
from harness.fabric import SourceAccountRecord

SCHEMA_VERSION = "1.0"

# -- service status values --------------------------------------------------

SVC_COMPLETED = "completed"
SVC_BLOCKED = "blocked"
SVC_REJECTED = "rejected"
SVC_REVISION_REQUIRED = "revision_required"
SVC_FAILED = "failed"

_STATUS_MAP = {
    STATUS_PASSED: SVC_COMPLETED,
    STATUS_BLOCKED: SVC_BLOCKED,
    STATUS_REJECTED: SVC_REJECTED,
    STATUS_REVISION_REQUIRED: SVC_REVISION_REQUIRED,
    STATUS_FAILED: SVC_FAILED,
}

# -- stable service error codes ---------------------------------------------

ERR_INVALID_REQUEST = "invalid_request"
ERR_AMBIGUOUS_IDENTITY = "ambiguous_identity"
ERR_NO_MATCHING_TEMPLATE = "no_matching_template"
ERR_POLICY_BLOCKED = "policy_blocked"
ERR_VERIFICATION_FAILED = "verification_failed"
ERR_APPROVAL_REJECTED = "approval_rejected"
ERR_APPROVAL_PAYLOAD_MISMATCH = "approval_payload_mismatch"
ERR_IDEMPOTENCY_CONFLICT = "idempotency_conflict"
ERR_AUDIT_FAILURE = "audit_failure"
ERR_INTERNAL = "internal_service_failure"

# failure_code (from the evaluator) -> (service error code, stage, retryable, safe message)
_FAILURE_MAP = {
    FAIL_AMBIGUOUS_IDENTITY: (
        ERR_AMBIGUOUS_IDENTITY, "identity_resolution", False,
        "Customer identity could not be resolved unambiguously; mission did not proceed.",
    ),
    FAIL_NO_MATCHING_TEMPLATE: (
        ERR_NO_MATCHING_TEMPLATE, "template_selection", False,
        "No approved mission template matched the supplied signals.",
    ),
    FAIL_POLICY: (
        ERR_POLICY_BLOCKED, "policy_validation", False,
        "The mission plan failed governance policy validation.",
    ),
    FAIL_VERIFICATION: (
        ERR_VERIFICATION_FAILED, "verification", True,
        "Mission verification did not pass; revision is required before approval.",
    ),
    FAIL_APPROVAL_REJECTED: (
        ERR_APPROVAL_REJECTED, "approval", False,
        "Human approval was not granted; no action was executed.",
    ),
    FAIL_APPROVAL_PAYLOAD_MISMATCH: (
        ERR_APPROVAL_PAYLOAD_MISMATCH, "approval", False,
        "Approval was not bound to the reviewed action payload; execution was refused.",
    ),
    FAIL_IDEMPOTENCY_CONFLICT: (
        ERR_IDEMPOTENCY_CONFLICT, "audit", False,
        "A durable idempotency conflict was detected; the idempotency key was reused "
        "with a different action payload and no new receipt was created.",
    ),
    FAIL_INTERNAL: (
        ERR_INTERNAL, "internal", False,
        "An internal service error occurred while evaluating the mission.",
    ),
}

_VALID_OUTPUT_MODES = ("full", "evaluation_only", "payload_only")

# Deterministic, non-presentation mapping helpers.
_INTENT_BY_MISSION_TYPE = {
    "renewal_risk": "risk_review",
    "support_escalation": "next_step",
}


# -- typed request / response contracts -------------------------------------


class _StrictHarnessModel(HarnessModel):
    """HarnessModel + strict input (unknown keys rejected). Keeps camelCase
    serialisation and snake_case/camelCase input via the inherited alias config.
    """

    model_config = ConfigDict(
        alias_generator=_to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class HarnessServiceRequest(_StrictHarnessModel):
    """The typed, offline request into the in-process Harness service.

    Carries only structured mission inputs and injected governance decisions --
    never presentation content, provider credentials, live CRM connection
    details, or arbitrary executable instructions.
    """

    schema_version: str = SCHEMA_VERSION
    request_id: str = Field(..., min_length=1)
    correlation_id: str = Field(..., min_length=1)
    scenario_id: str = Field(..., min_length=1)
    mission_id: str = Field(..., min_length=1)
    mission_version: str = "v1"
    signals: dict = Field(default_factory=dict)
    source_records: Optional[List[SourceAccountRecord]] = None
    actor: str = "amit"
    actor_role: str = "manager"
    approval_channel: str = "screen"
    # injected governance decisions
    verification_outcome: str = "verified"
    approval: str = "approved"
    request_revision_after_block: bool = False
    inject_payload_mismatch: bool = False
    replay_execution: bool = False
    # service-level concerns
    injected_timestamps: Optional[Dict[str, str]] = None
    idempotency_key: Optional[str] = None
    output_mode: str = "full"
    protected_decision_ref: Optional[str] = None

    @field_validator("approval")
    @classmethod
    def _approval_valid(cls, value: str) -> str:
        if value not in ("approved", "rejected", "none"):
            raise ValueError("approval must be one of approved|rejected|none")
        return value

    @field_validator("verification_outcome")
    @classmethod
    def _verification_valid(cls, value: str) -> str:
        if value not in ("verified", "blocked"):
            raise ValueError("verification_outcome must be one of verified|blocked")
        return value


class ServiceError(HarnessModel):
    """A structured, BFF-safe error. Contains no stack trace, no path, no SQL."""

    code: str
    stage: str
    message: str
    retryable: bool = False
    details: dict = Field(default_factory=dict)


class LedgerReference(HarnessModel):
    """Reference-only pointer to the persisted mission audit trail. Carries no
    database path and no connection detail."""

    mission_id: str
    record_count: int = 0
    latest_ledger_record_id: Optional[str] = None
    chain_valid: bool = True


class HarnessServiceResponse(HarnessModel):
    """The deterministic, fully-serialisable service result."""

    schema_version: str = SCHEMA_VERSION
    request_id: str
    correlation_id: str
    status: str
    execution_eligible: bool = False
    mission_evaluation_result: Optional[MissionEvaluationResult] = None
    mission_execution_payload: Optional[MissionExecutionPayload] = None
    service_errors: List[ServiceError] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    ledger_reference: Optional[LedgerReference] = None
    result_hash: str = ""


# -- explicit dependencies (no global mutable state) ------------------------


@dataclass
class HarnessServiceDependencies:
    """Explicitly-supplied service dependencies.

    * ``ledger`` -- a caller-owned :class:`MissionAuditLedger`. If supplied, the
      service uses it and leaves it OPEN (the caller owns its lifecycle).
    * ``ledger_path`` -- an explicit SQLite path (or ``":memory:"``) the service
      opens and CLOSES itself. Ignored when ``ledger`` is supplied.

    When neither is supplied the service creates and closes a private in-memory
    ledger. Registries are owned by the deterministic evaluator in this release;
    optional overrides may be injected for forward-compatibility.
    """

    ledger: Optional[MissionAuditLedger] = None
    ledger_path: Optional[str] = None
    agent_registry: object = None
    tool_registry: object = None
    template_registry: object = None


# -- the service ------------------------------------------------------------


def execute_mission(
    request: HarnessServiceRequest,
    dependencies: HarnessServiceDependencies,
) -> HarnessServiceResponse:
    """Coordinate a single deterministic mission evaluation and shape a typed,
    serialisable response. Fails closed at the earliest invalid stage."""

    # Stage A: strict request-shape guards that precede any evaluation.
    if request.output_mode not in _VALID_OUTPUT_MODES:
        return _failed_response(
            request,
            ServiceError(
                code=ERR_INVALID_REQUEST, stage="request_validation",
                message=f"Unknown output mode: {request.output_mode!r}.",
                retryable=False, details={"allowedModes": list(_VALID_OUTPUT_MODES)},
            ),
        )

    injected = request.injected_timestamps or default_injected_timestamps()
    if "default" not in injected:
        return _failed_response(
            request,
            ServiceError(
                code=ERR_INVALID_REQUEST, stage="request_validation",
                message="injected_timestamps must include a 'default' key.",
                retryable=False,
            ),
        )

    # Stage B: ledger lifecycle (own only what we create).
    owns_ledger = dependencies.ledger is None
    if dependencies.ledger is not None:
        ledger = dependencies.ledger
    else:
        ledger = MissionAuditLedger(dependencies.ledger_path or ":memory:")

    try:
        scenario = _scenario_from_request(request)
        result = evaluate_mission_scenario(
            scenario, ledger, injected,
            correlation_id=request.correlation_id,
            agent_registry=dependencies.agent_registry,
            tool_registry=dependencies.tool_registry,
            template_registry=dependencies.template_registry,
        )
        ledger_ref = _ledger_reference(ledger, request.mission_id)
    except Exception as exc:  # noqa: BLE001 - never leak a raw crash to the BFF
        # Fail closed with a generic, safe error (no trace, no path).
        _maybe_close(ledger, owns_ledger)
        return _failed_response(
            request,
            ServiceError(
                code=ERR_INTERNAL, stage="service", retryable=False,
                message="An internal service error occurred.",
                details={"errorType": type(exc).__name__},
            ),
        )
    else:
        _maybe_close(ledger, owns_ledger)

    return _shape_response(request, result, ledger_ref)


# -- request -> scenario ----------------------------------------------------


def _scenario_from_request(request: HarnessServiceRequest) -> MissionScenario:
    from harness.contracts import ApprovalChannel

    channel = ApprovalChannel(request.approval_channel)
    return MissionScenario(
        scenario_id=request.scenario_id,
        mission_id=request.mission_id,
        mission_version=request.mission_version,
        signals=dict(request.signals or {}),
        source_records=request.source_records,
        actor=request.actor,
        actor_role=request.actor_role,
        approval_channel=channel,
        verification_outcome=request.verification_outcome,
        approval=request.approval,
        request_revision_after_block=request.request_revision_after_block,
        inject_payload_mismatch=request.inject_payload_mismatch,
        replay_execution=request.replay_execution,
        idempotency_key=request.idempotency_key,
    )


# -- result -> response -----------------------------------------------------


def _shape_response(request: HarnessServiceRequest, result: MissionEvaluationResult,
                    ledger_ref: LedgerReference) -> HarnessServiceResponse:
    status = _STATUS_MAP.get(result.final_status, SVC_FAILED)
    errors: List[ServiceError] = []
    warnings: List[str] = []

    if result.failure_code is not None:
        mapped = _FAILURE_MAP.get(result.failure_code)
        if mapped is not None:
            code, stage, retryable, message = mapped
            errors.append(ServiceError(code=code, stage=stage, retryable=retryable,
                                       message=message,
                                       details={"failureCode": result.failure_code}))
        else:
            errors.append(ServiceError(code=ERR_INTERNAL, stage="internal", retryable=False,
                                       message="An internal service error occurred."))

    payload: Optional[MissionExecutionPayload] = None
    if request.output_mode != "evaluation_only":
        # A payload is only produced for a governance-valid, execution-eligible mission.
        if result.final_status == STATUS_PASSED and result.execution_eligible:
            try:
                payload = _map_execution_payload(request, result)
            except Exception:  # noqa: BLE001 - a mapping fault must not leak
                payload = None
                warnings.append("mission_execution_payload could not be produced")

    include_eval = request.output_mode != "payload_only"
    response = HarnessServiceResponse(
        request_id=request.request_id,
        correlation_id=request.correlation_id,
        status=status,
        execution_eligible=result.execution_eligible,
        mission_evaluation_result=result if include_eval else None,
        mission_execution_payload=payload,
        service_errors=errors,
        warnings=warnings,
        ledger_reference=ledger_ref,
    )
    response.result_hash = _response_hash(response)
    return response


def _map_execution_payload(request: HarnessServiceRequest,
                           result: MissionEvaluationResult) -> MissionExecutionPayload:
    """Deterministically map a passed MissionEvaluationResult to the locked
    cross-language MissionExecutionPayload. Draws only from governed result data;
    generates no presentation text and carries no PersonaResponse."""

    assert result.canonical_account is not None
    assert result.mission_plan is not None
    assert result.approval_request is not None
    assert result.simulated_action_receipt is not None

    canonical = CanonicalAccountRef.model_validate(result.canonical_account)
    md = result.mission_plan.mission_definition
    approval_request: ApprovalRequest = result.approval_request
    receipt = result.simulated_action_receipt
    verification = VerificationResult.model_validate(result.verification_summary)

    ledger_id = request.protected_decision_ref or f"decisionLedger://unlinked/{result.mission_id}"
    intent = _INTENT_BY_MISSION_TYPE.get(md.mission_type, "status")

    recommendation = RecommendationRef(
        recommendation_id=approval_request.recommendation_id,
        ledger_id=ledger_id,
        account_id=canonical.venture_os_id,
        action_type=approval_request.action_type,
        priority_rank=1,
        confidence_score=1.0,
        governance_status="approved",
    )

    evidence_refs = [
        EvidenceRef(
            record_id=f"evidence://{result.mission_id}/{ev.category}",
            category=ev.category,
            source="mission-audit",
            summary=f"{'mandatory' if ev.mandatory else 'optional'} evidence: {ev.category}",
        )
        for ev in md.required_evidence
    ]

    mission_brief = MissionDefinitionBrief(
        mission_type=md.mission_type,
        objective=md.objective,
        rationale=md.rationale,
        success_criteria=[
            SuccessCriterionBrief(criterion_id=c.criterion_id, description=c.description)
            for c in md.success_criteria
        ],
        risk_level=md.risk_level.value if hasattr(md.risk_level, "value") else str(md.risk_level),
        selected_template_id=result.selected_template_id or md.selected_template_id or "",
        expected_outcome=md.expected_outcome,
    )

    return MissionExecutionPayload(
        mission_id=result.mission_id,
        turn_index=0,
        mission_state=MissionState(result.lifecycle_status),
        canonical_account=canonical,
        intent=intent,
        persona_id=f"persona-{md.mission_type}",
        selected_template_id=result.selected_template_id or "",
        retrieval_query=RetrievalQuerySpec(subject_id=canonical.venture_os_id),
        recommendation=recommendation,
        permitted_actions=list(approval_request.permitted_actions),
        evidence_refs=evidence_refs,
        verification=verification,
        verification_ref=approval_request.verification_ref,
        approval_request=approval_request,
        mission_definition=mission_brief,
        audit_ref=receipt.audit_ref,
    )


# -- helpers ----------------------------------------------------------------


def _ledger_reference(ledger: MissionAuditLedger, mission_id: str) -> LedgerReference:
    records = ledger.list_mission_records(mission_id)
    latest = ledger.get_latest_record(mission_id)
    chain = ledger.verify_mission_chain(mission_id)
    return LedgerReference(
        mission_id=mission_id,
        record_count=len(records),
        latest_ledger_record_id=latest.ledger_record_id if latest is not None else None,
        chain_valid=chain.valid,
    )


def _failed_response(request: HarnessServiceRequest, error: ServiceError) -> HarnessServiceResponse:
    response = HarnessServiceResponse(
        request_id=request.request_id,
        correlation_id=request.correlation_id,
        status=SVC_FAILED,
        execution_eligible=False,
        mission_evaluation_result=None,
        mission_execution_payload=None,
        service_errors=[error],
        warnings=[],
        ledger_reference=None,
    )
    response.result_hash = _response_hash(response)
    return response


def _response_hash(response: HarnessServiceResponse) -> str:
    payload = response.model_dump(by_alias=True, mode="json")
    payload.pop("resultHash", None)
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"),
                           ensure_ascii=True, default=str)
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _maybe_close(ledger: MissionAuditLedger, owns: bool) -> None:
    if owns:
        ledger.close()


__all__ = [
    "SCHEMA_VERSION",
    "SVC_COMPLETED",
    "SVC_BLOCKED",
    "SVC_REJECTED",
    "SVC_REVISION_REQUIRED",
    "SVC_FAILED",
    "ERR_INVALID_REQUEST",
    "ERR_AMBIGUOUS_IDENTITY",
    "ERR_NO_MATCHING_TEMPLATE",
    "ERR_POLICY_BLOCKED",
    "ERR_VERIFICATION_FAILED",
    "ERR_APPROVAL_REJECTED",
    "ERR_APPROVAL_PAYLOAD_MISMATCH",
    "ERR_IDEMPOTENCY_CONFLICT",
    "ERR_AUDIT_FAILURE",
    "ERR_INTERNAL",
    "HarnessServiceRequest",
    "HarnessServiceResponse",
    "HarnessServiceDependencies",
    "ServiceError",
    "LedgerReference",
    "execute_mission",
]
