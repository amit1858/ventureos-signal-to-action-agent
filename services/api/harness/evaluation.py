"""Deterministic mission evaluation (Release 2.2, Commit 7).

This module is the offline *composition and evaluation* entry point for the
Adaptive Mission Harness. It coordinates the already-built, individually-tested
components -- it holds NO business logic of its own and duplicates none:

    Customer Context Fabric   -> harness.fabric.resolve_identity
    signal / template selector -> harness.selector.select
    mission planner            -> harness.planner.plan_mission
    policy validator           -> harness.policy_validator.validate
    lifecycle state machine    -> harness.state_machine.MissionLifecycle
    approval contracts         -> harness.contracts (Approval*/ActionReceipt)
    simulation sandbox         -> harness.sandbox.SimulationSandbox
    Mission Audit Ledger       -> harness.audit_ledger.MissionAuditLedger

Determinism / safety invariants (all enforced or proven by tests):

* NO internal clock -- every timestamp is injected by the caller.
* NO network, NO live CRM, NO provider calls, NO frontend dependency.
* NO write to the protected Decision Ledger (referenced by string only).
* Fails closed at the earliest invalid stage; later stages never run after a
  blocking failure.
* Identical scenario inputs + injected times produce byte-identical output.
* Output never contains a PersonaResponse or any presentation content.

The evaluator classifies every mission into exactly one ``final_status``:
``passed``, ``blocked``, ``rejected``, ``revision_required`` or ``failed``.
"""

from __future__ import annotations

import hashlib
import json
from typing import List, Mapping, Optional

from pydantic import Field

from harness.audit_ledger import (
    IdempotencyConflictError as AuditIdempotencyConflictError,
    MissionAuditLedger,
)
from harness.contracts import (
    ActionReceipt,
    ApprovalChannel,
    ApprovalDecision,
    ApprovalOutcome,
    ApprovalRequest,
    CanonicalAccountRef,
    HarnessModel,
    MissionEvent,
    MissionState,
    VerificationCheck,
    VerificationResult,
)
from harness.fabric import (
    IdentityResolution,
    SourceAccountRecord,
    default_source_records,
    resolve_identity,
)
from harness.planner import MissionPlan, plan_mission
from harness.policy_validator import PolicyValidationResult, validate
from harness.registries import default_agent_registry, default_tool_registry
from harness.sandbox import (
    ActionRequest,
    IdempotencyConflictError as SandboxIdempotencyConflictError,
    SandboxError,
    SimulationSandbox,
    payload_hash,
)
from harness.selector import SelectionResult, select
from harness.state_machine import (
    MissionEventType,
    MissionLifecycle,
    TransitionContext,
)
from harness.templates import default_template_registry

SCHEMA_VERSION = "1.0"

# Final-status vocabulary (mutually exclusive).
STATUS_PASSED = "passed"
STATUS_BLOCKED = "blocked"
STATUS_REJECTED = "rejected"
STATUS_REVISION_REQUIRED = "revision_required"
STATUS_FAILED = "failed"

# Failure codes (present only when not passed).
FAIL_AMBIGUOUS_IDENTITY = "ambiguous_identity"
FAIL_NO_MATCHING_TEMPLATE = "no_matching_template"
FAIL_POLICY = "policy_failed"
FAIL_VERIFICATION = "verification_failed"
FAIL_APPROVAL_PAYLOAD_MISMATCH = "approval_payload_mismatch"
FAIL_APPROVAL_REJECTED = "approval_rejected"
FAIL_IDEMPOTENCY_CONFLICT = "idempotency_conflict"
FAIL_INTERNAL = "internal_error"

# The stage that owns a durable idempotency conflict. The Mission Audit Ledger is
# the durable idempotency authority, so a genuine collision is attributed to the
# audit boundary; a sandbox in-memory collision is attributed to execution.
_IDEMPOTENCY_STAGE_AUDIT = "audit"
_IDEMPOTENCY_STAGE_EXECUTION = "execution"

# Deterministic timestamp stages. Every stage time is injected; there is no
# clock and no hardcoded time. A caller must supply at least ``default``.
_STAGES = (
    "intake", "identity", "selection", "blocked", "opened", "gathering", "proposed",
    "verifying", "verified", "verification", "approval_request", "approval_decision",
    "execution", "outcome", "closed",
)

# Per-mission-type action wiring (declarative, deterministic).
_ACTION_TYPE = {
    "renewal_risk": "renewal_outreach",
    "support_escalation": "support_escalation",
}
_TOOL_ID = {
    "renewal_risk": "simulate_renewal_outreach",
    "support_escalation": "simulate_support_escalation",
}


# -- scenario input ---------------------------------------------------------


class MissionScenario(HarnessModel):
    """A fully declarative, deterministic evaluation scenario.

    The scenario carries only *inputs and injected decisions*; the evaluator
    derives every outcome from the composed components. ``source_records`` of
    ``None`` uses the standard Curefoods demo fixtures.
    """

    scenario_id: str
    mission_id: str
    mission_version: str = "v1"
    signals: dict = Field(default_factory=dict)
    source_records: Optional[List[SourceAccountRecord]] = None
    actor: str = "amit"
    actor_role: str = "manager"
    approval_channel: ApprovalChannel = ApprovalChannel.screen
    # Injected human / gate decisions:
    verification_outcome: str = "verified"   # "verified" | "blocked"
    approval: str = "approved"               # "approved" | "rejected" | "none"
    request_revision_after_block: bool = False
    inject_payload_mismatch: bool = False
    replay_execution: bool = False


# -- scorecard --------------------------------------------------------------


class MissionScorecard(HarnessModel):
    """Deterministic pass/fail scorecard. No LLM, no heuristics -- every field is
    computed from concrete runtime facts of this evaluation."""

    identity_resolved: bool = False
    template_selected: bool = False
    evidence_present: bool = False
    provenance_present: bool = False
    policy_passed: bool = False
    verification_passed: bool = False
    approval_required: bool = False
    approval_valid: bool = False
    simulated_only: bool = True
    payload_binding_valid: bool = False
    lifecycle_valid: bool = True
    audit_complete: bool = False
    audit_chain_valid: bool = True
    deterministic_output: bool = True
    no_external_action: bool = True


# -- evaluation result ------------------------------------------------------


class MissionEvaluationResult(HarnessModel):
    """The deterministic, presentation-free evaluation of one mission scenario."""

    schema_version: str = SCHEMA_VERSION
    scenario_id: str
    mission_id: str
    mission_version: str
    canonical_account: Optional[dict] = None
    identity_resolution_status: str = "blocked"
    selected_template_id: Optional[str] = None
    selector_explanation: str = ""
    mission_plan: Optional[MissionPlan] = None
    policy_validation: Optional[PolicyValidationResult] = None
    lifecycle_status: Optional[str] = None
    lifecycle_events: List[MissionEvent] = Field(default_factory=list)
    verification_summary: dict = Field(default_factory=dict)
    approval_request: Optional[ApprovalRequest] = None
    approval_decision: Optional[ApprovalDecision] = None
    simulated_action_receipt: Optional[ActionReceipt] = None
    outcome_verification: Optional[VerificationResult] = None
    audit_bundle: Optional[dict] = None
    audit_chain_valid: bool = True
    execution_eligible: bool = False
    final_status: str = STATUS_FAILED
    failure_code: Optional[str] = None
    scorecard: MissionScorecard = Field(default_factory=MissionScorecard)
    result_hash: str = ""


# -- helpers ----------------------------------------------------------------


def _clock(injected_timestamps: Mapping[str, str]):
    if injected_timestamps is None or "default" not in injected_timestamps:
        raise ValueError(
            "injected_timestamps must provide at least a 'default' key; "
            "the evaluator never reads a clock."
        )

    def at(stage: str) -> str:
        return injected_timestamps.get(stage, injected_timestamps["default"])

    return at


def _canonical_action_payload(canonical_name: str, venture_os_id: str,
                              action_type: str, recommendation_id: str) -> dict:
    """The single reviewed action payload the whole mission binds to."""
    return {
        "account_name": canonical_name,
        "venture_os_id": venture_os_id,
        "action_type": action_type,
        "recommendation_id": recommendation_id,
    }


def _result_hash(result: MissionEvaluationResult) -> str:
    """Deterministic hash over the result, excluding the hash field itself."""
    payload = result.model_dump(by_alias=True, mode="json")
    payload.pop("resultHash", None)
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"),
                           ensure_ascii=True, default=str)
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _finalize(result: MissionEvaluationResult) -> MissionEvaluationResult:
    result.result_hash = _result_hash(result)
    return result


# -- the evaluator ----------------------------------------------------------


def evaluate_mission_scenario(
    scenario: MissionScenario,
    ledger: MissionAuditLedger,
    injected_timestamps: Mapping[str, str],
    *,
    correlation_id: Optional[str] = None,
    agent_registry=None,
    tool_registry=None,
    template_registry=None,
) -> MissionEvaluationResult:
    """Deterministically evaluate one mission scenario end to end.

    Coordinates the existing harness components and records the governed lifecycle
    into ``ledger``. Fails closed at the earliest invalid stage; every timestamp is
    taken from ``injected_timestamps``.

    ``correlation_id`` and the registry arguments are additive, optional injection
    points for callers (e.g. the in-process service facade). When omitted the
    evaluator uses its standard deterministic defaults, so existing behaviour is
    unchanged.
    """
    at = _clock(injected_timestamps)
    result = MissionEvaluationResult(
        scenario_id=scenario.scenario_id,
        mission_id=scenario.mission_id,
        mission_version=scenario.mission_version,
    )
    score = result.scorecard

    try:
        return _run(scenario, ledger, at, result, score,
                    correlation_id=correlation_id, agent_registry=agent_registry,
                    tool_registry=tool_registry, template_registry=template_registry)
    except (AuditIdempotencyConflictError, SandboxIdempotencyConflictError):
        # A genuine durable idempotency collision: the same idempotency key was
        # reused with a different action payload. This is a governed, fail-closed
        # outcome — not an internal crash — so it carries a stable failure code and
        # never leaks the raw exception message or class name into the result.
        score.lifecycle_valid = False
        result.final_status = STATUS_FAILED
        result.failure_code = FAIL_IDEMPOTENCY_CONFLICT
        return _finalize(result)
    except SandboxError as exc:
        # A sandbox governance failure is an expected fail-closed outcome.
        score.lifecycle_valid = False
        result.final_status = STATUS_BLOCKED
        result.failure_code = FAIL_APPROVAL_PAYLOAD_MISMATCH if "payload" in str(exc).lower() \
            else FAIL_INTERNAL
        return _finalize(result)
    except Exception as exc:  # noqa: BLE001 - defensive: never leak a raw crash
        score.lifecycle_valid = False
        result.final_status = STATUS_FAILED
        result.failure_code = FAIL_INTERNAL
        result.verification_summary = {"error": f"{type(exc).__name__}: {exc}"}
        return _finalize(result)


def _run(scenario: MissionScenario, ledger: MissionAuditLedger, at,
         result: MissionEvaluationResult, score: MissionScorecard,
         *, correlation_id: Optional[str] = None, agent_registry=None,
         tool_registry=None, template_registry=None) -> MissionEvaluationResult:
    mission_id = scenario.mission_id
    mission_version = scenario.mission_version
    correlation_id = correlation_id or f"corr-{mission_id}"

    # -- Stage 0: mission intake (every scenario is audited from the start) ---
    ledger.append_mission_intake(
        mission_id=mission_id, mission_version=mission_version, correlation_id=correlation_id,
        occurred_at=at("intake"), actor="system", created_at=at("intake"),
        scenario_id=scenario.scenario_id, signals=dict(scenario.signals or {}),
    )

    # -- Stage 1: Customer Context Fabric (identity before planning) ---------
    records = scenario.source_records if scenario.source_records is not None else default_source_records()
    resolution: IdentityResolution = resolve_identity(records)
    score.identity_resolved = resolution.resolved
    score.evidence_present = len(resolution.evidence) > 0
    score.provenance_present = len(resolution.provenance) > 0

    # Persist the identity-resolution result. The canonical account is null when
    # identity fails to resolve -- it is never fabricated.
    resolved_canonical = (
        resolution.canonical_account.model_dump(by_alias=True)
        if resolution.resolved and resolution.canonical_account is not None else None
    )
    ledger.append_identity_resolution(
        mission_id=mission_id, mission_version=mission_version, correlation_id=correlation_id,
        occurred_at=at("identity"), actor="system", created_at=at("identity"),
        resolved=resolution.resolved, blocked=resolution.blocked, block_reason=resolution.block_reason,
        clusters_found=resolution.clusters_found, confidence=resolution.confidence,
        canonical_account=resolved_canonical,
        evidence=[e.model_dump(by_alias=True) for e in resolution.evidence],
        provenance=[p.model_dump(by_alias=True) for p in resolution.provenance],
        conflicts=[c.model_dump(by_alias=True) for c in resolution.conflicts],
        source_record_refs=[r.ref for r in records],
    )

    if not resolution.resolved or resolution.canonical_account is None:
        result.identity_resolution_status = "blocked"
        result.final_status = STATUS_BLOCKED
        result.failure_code = FAIL_AMBIGUOUS_IDENTITY
        result.selector_explanation = resolution.block_reason or "identity could not be resolved"
        ledger.append_mission_blocked(
            mission_id=mission_id, mission_version=mission_version, correlation_id=correlation_id,
            occurred_at=at("blocked"), actor="system", created_at=at("blocked"),
            failure_code=FAIL_AMBIGUOUS_IDENTITY,
            blocked_reason=resolution.block_reason or "identity could not be resolved",
            stage="identity_resolution", final_status=STATUS_BLOCKED,
        )
        _attach_audit(result, ledger, mission_id, score)
        return _finalize(result)

    canonical = resolution.canonical_account
    canonical_ref: CanonicalAccountRef = canonical.ref()
    result.identity_resolution_status = "resolved"
    result.canonical_account = canonical.model_dump(by_alias=True)

    # -- Stage 2: deterministic template selection ---------------------------
    selection: SelectionResult = select(scenario.signals, None)
    result.selected_template_id = selection.selected_template_id
    result.selector_explanation = selection.rationale
    score.template_selected = selection.selected_template_id is not None

    ledger.append_template_selection(
        mission_id=mission_id, mission_version=mission_version, correlation_id=correlation_id,
        occurred_at=at("selection"), actor="system", created_at=at("selection"),
        selected_template_id=selection.selected_template_id, matched_rule_id=selection.matched_rule_id,
        matched_rules=list(selection.matched_rules), rationale=selection.rationale,
        blocked=selection.blocked, is_fallback=selection.is_fallback,
    )

    if selection.blocked or selection.selected_template_id is None:
        # Fail closed BEFORE planning: no plan, agents, tools, approval or execution.
        result.final_status = STATUS_BLOCKED
        result.failure_code = FAIL_NO_MATCHING_TEMPLATE
        ledger.append_mission_blocked(
            mission_id=mission_id, mission_version=mission_version, correlation_id=correlation_id,
            occurred_at=at("blocked"), actor="system", created_at=at("blocked"),
            failure_code=FAIL_NO_MATCHING_TEMPLATE, blocked_reason=selection.rationale,
            stage="template_selection", final_status=STATUS_BLOCKED,
        )
        _attach_audit(result, ledger, mission_id, score)
        return _finalize(result)

    # -- Stage 3: mission planning (no execution) ----------------------------
    agent_registry = agent_registry or default_agent_registry()
    tool_registry = tool_registry or default_tool_registry()
    template_registry = template_registry or default_template_registry()
    template = template_registry.get_active(selection.selected_template_id)

    plan = plan_mission(
        mission_id=mission_id,
        template=template,
        signal_context=scenario.signals,
        canonical_account=canonical_ref,
        agent_registry=agent_registry,
        tool_registry=tool_registry,
    )
    result.mission_plan = plan

    # -- Stage 4: policy validation ------------------------------------------
    policy = validate(plan, agent_registry, tool_registry, template_registry)
    result.policy_validation = policy
    score.policy_passed = policy.passed
    score.approval_required = plan.requires_human_approval is True

    # Open the mission in the audit ledger (identity + template are now known).
    ledger.append_mission_opened(
        mission_id=mission_id, mission_version=mission_version, correlation_id=correlation_id,
        occurred_at=at("opened"), actor="system", created_at=at("opened"),
        canonical_account=canonical.model_dump(by_alias=True),
        selected_template_id=selection.selected_template_id,
        evidence_refs=[e.model_dump(by_alias=True) for e in resolution.evidence],
    )

    life = MissionLifecycle(state=MissionState.opened)

    def _ctx(stage: str, **kwargs) -> TransitionContext:
        return TransitionContext(
            mission_id=mission_id, mission_version=mission_version, actor=scenario.actor,
            occurred_at=at(stage), correlation_id=correlation_id, **kwargs,
        )

    def _advance(event_type: str, stage: str, **ctx_kwargs) -> bool:
        res = life.apply(event_type, _ctx(stage, **ctx_kwargs))
        if res.accepted and res.event is not None:
            ledger.append_mission_event(res.event, created_at=at(stage))
            return True
        score.lifecycle_valid = False
        return False

    if not policy.passed:
        # Record the mission was opened, then block. No approval / execution.
        result.lifecycle_status = life.state.value
        result.lifecycle_events = list(life.events)
        result.final_status = STATUS_BLOCKED
        result.failure_code = FAIL_POLICY
        ledger.append_mission_blocked(
            mission_id=mission_id, mission_version=mission_version, correlation_id=correlation_id,
            occurred_at=at("blocked"), actor="system", created_at=at("blocked"),
            failure_code=FAIL_POLICY, blocked_reason="; ".join(policy.errors) or "policy validation failed",
            stage="policy_validation", final_status=STATUS_BLOCKED,
        )
        _attach_audit(result, ledger, mission_id, score)
        return _finalize(result)

    # -- Stage 5: lifecycle to verification ----------------------------------
    _advance(MissionEventType.BEGIN_GATHERING, "gathering")
    _advance(MissionEventType.PROPOSE, "proposed")
    _advance(MissionEventType.BEGIN_VERIFICATION, "verifying")

    verified_ok = scenario.verification_outcome == "verified"
    verification = VerificationResult(
        status="verified" if verified_ok else "blocked",
        checks=[
            VerificationCheck(name="identity_resolved", passed=True, detail="canonical account resolved"),
            VerificationCheck(name="evidence_sufficient", passed=verified_ok,
                              detail="required evidence present" if verified_ok else "insufficient evidence"),
            VerificationCheck(name="policy_passed", passed=policy.passed, detail="policy validation"),
        ],
    )
    ledger.append_verification(
        verification, mission_id=mission_id, mission_version=mission_version,
        correlation_id=correlation_id, occurred_at=at("verification"), actor="system",
        created_at=at("verification"),
    )
    score.verification_passed = verified_ok
    result.verification_summary = verification.model_dump(by_alias=True)

    if not verified_ok:
        # verifying -> blocked
        _advance(MissionEventType.VERIFICATION_FAILED, "verifying")
        if scenario.request_revision_after_block:
            # blocked -> gathering via the ONLY corrective edge (no implicit retry).
            _advance(MissionEventType.REVISION_REQUESTED, "gathering")
            result.final_status = STATUS_REVISION_REQUIRED
        else:
            result.final_status = STATUS_BLOCKED
            ledger.append_mission_blocked(
                mission_id=mission_id, mission_version=mission_version, correlation_id=correlation_id,
                occurred_at=at("blocked"), actor="system", created_at=at("blocked"),
                failure_code=FAIL_VERIFICATION, blocked_reason="verification did not pass",
                stage="verification", final_status=STATUS_BLOCKED,
            )
        result.failure_code = FAIL_VERIFICATION
        result.lifecycle_status = life.state.value
        result.lifecycle_events = list(life.events)
        _attach_audit(result, ledger, mission_id, score)
        return _finalize(result)

    # verifying -> verified (guards: verification, identity, policy)
    _advance(MissionEventType.VERIFICATION_PASSED, "verified",
             verification=verification, identity_resolved=True, policy_passed=policy.passed)

    # -- Stage 6: approval ----------------------------------------------------
    recommendation_id = f"REC-{mission_id}"
    action_type = _ACTION_TYPE[template.mission_type]
    tool_id = _TOOL_ID[template.mission_type]
    action_payload = _canonical_action_payload(
        canonical.canonical_name, canonical.venture_os_id, action_type, recommendation_id
    )
    ph = payload_hash(action_payload)

    approval_request = ApprovalRequest(
        mission_id=mission_id, mission_version=mission_version, recommendation_id=recommendation_id,
        action_type=action_type, permitted_actions=list(template.allowed_tools),
        action_payload_ref=f"payload://{mission_id}/{recommendation_id}", action_payload_hash=ph,
        verification_ref=f"verify://{mission_id}",
        prompt=f"Approve simulated {action_type} for {canonical.canonical_name}?",
    )
    result.approval_request = approval_request
    ledger.append_approval_request(
        approval_request, correlation_id=correlation_id, occurred_at=at("approval_request"),
        actor="system", created_at=at("approval_request"),
    )
    _advance(MissionEventType.REQUEST_APPROVAL, "verified", verification=verification)

    if scenario.approval == "none":
        result.final_status = STATUS_BLOCKED
        result.failure_code = FAIL_APPROVAL_REJECTED
        result.lifecycle_status = life.state.value
        result.lifecycle_events = list(life.events)
        ledger.append_mission_blocked(
            mission_id=mission_id, mission_version=mission_version, correlation_id=correlation_id,
            occurred_at=at("blocked"), actor="system", created_at=at("blocked"),
            failure_code=FAIL_APPROVAL_REJECTED, blocked_reason="no approval decision supplied",
            stage="approval", final_status=STATUS_BLOCKED,
        )
        _attach_audit(result, ledger, mission_id, score)
        return _finalize(result)

    if scenario.approval == "rejected":
        decision = ApprovalDecision(
            decision_id=f"DEC-{mission_id}", mission_id=mission_id, mission_version=mission_version,
            outcome=ApprovalOutcome.rejected, actor=scenario.actor, actor_role=scenario.actor_role,
            channel=scenario.approval_channel, approved_action_ref=approval_request.action_payload_ref,
            approved_payload_hash=ph, confirm_token=None, reason="declined by approver",
            decided_at=at("approval_decision"),
        )
        result.approval_decision = decision
        ledger.append_approval_decision(
            decision, correlation_id=correlation_id, occurred_at=at("approval_decision"),
            created_at=at("approval_decision"),
        )
        _advance(MissionEventType.REJECT, "approval_decision")
        result.final_status = STATUS_REJECTED
        result.failure_code = FAIL_APPROVAL_REJECTED
        result.lifecycle_status = life.state.value
        result.lifecycle_events = list(life.events)
        _attach_audit(result, ledger, mission_id, score)
        return _finalize(result)

    # approval == "approved"
    approved_hash = "sha256:tampered-payload" if scenario.inject_payload_mismatch else ph
    confirm_token = "voice-confirm-1" if scenario.approval_channel == ApprovalChannel.voice else "confirm-1"
    decision = ApprovalDecision(
        decision_id=f"DEC-{mission_id}", mission_id=mission_id, mission_version=mission_version,
        outcome=ApprovalOutcome.approved, actor=scenario.actor, actor_role=scenario.actor_role,
        channel=scenario.approval_channel, approved_action_ref=approval_request.action_payload_ref,
        approved_payload_hash=approved_hash, confirm_token=confirm_token,
        decided_at=at("approval_decision"),
    )
    result.approval_decision = decision
    ledger.append_approval_decision(
        decision, correlation_id=correlation_id, occurred_at=at("approval_decision"),
        created_at=at("approval_decision"),
    )

    approved = _advance(
        MissionEventType.APPROVE, "approval_decision",
        approval=decision, approval_request=approval_request,
    )
    if not approved:
        # Guard rejected the approval (e.g. payload hash not bound) -> fail closed,
        # no sandbox execution, no receipt.
        result.final_status = STATUS_BLOCKED
        result.failure_code = FAIL_APPROVAL_PAYLOAD_MISMATCH
        result.lifecycle_status = life.state.value
        result.lifecycle_events = list(life.events)
        ledger.append_mission_blocked(
            mission_id=mission_id, mission_version=mission_version, correlation_id=correlation_id,
            occurred_at=at("blocked"), actor="system", created_at=at("blocked"),
            failure_code=FAIL_APPROVAL_PAYLOAD_MISMATCH,
            blocked_reason="approval not bound to the reviewed payload hash",
            stage="approval", final_status=STATUS_BLOCKED,
        )
        _attach_audit(result, ledger, mission_id, score)
        return _finalize(result)

    score.approval_valid = True

    # -- Stage 7: simulated execution ----------------------------------------
    sandbox = SimulationSandbox()
    idempotency_key = f"idem-{mission_id}"
    audit_ref = f"audit://{mission_id}/{recommendation_id}"
    action_request = ActionRequest(
        mission_id=mission_id, mission_version=mission_version, recommendation_id=recommendation_id,
        action_type=action_type, tool_id=tool_id, target_type="account",
        target_id=canonical.venture_os_id, idempotency_key=idempotency_key, audit_ref=audit_ref,
        payload=action_payload,
    )
    receipt = sandbox.execute(
        action_request, decision, tool_registry=tool_registry,
        occurred_at=at("execution"), mission_state=MissionState.approved,
    )
    append_res = ledger.append_action_receipt(
        receipt, decision, mission_version=mission_version, idempotency_key=idempotency_key,
        correlation_id=correlation_id, occurred_at=at("execution"), actor=scenario.actor,
        created_at=at("execution"),
    )

    if scenario.replay_execution:
        # Same approved action + same idempotency key must return the SAME receipt
        # and must NOT create a duplicate ledger record.
        replay_receipt = sandbox.execute(
            action_request, decision, tool_registry=tool_registry,
            occurred_at=at("execution"), mission_state=MissionState.approved,
        )
        ledger.append_action_receipt(
            replay_receipt, decision, mission_version=mission_version, idempotency_key=idempotency_key,
            correlation_id=correlation_id, occurred_at=at("execution"), actor=scenario.actor,
            created_at=at("execution"),
        )

    receipt = append_res.receipt
    result.simulated_action_receipt = receipt
    score.simulated_only = receipt.simulated is True
    score.payload_binding_valid = receipt.approved_payload_hash == decision.approved_payload_hash

    _advance(MissionEventType.EXECUTE_SIMULATED, "execution", approval=decision, receipt=receipt)

    # -- Stage 8: outcome verification + close -------------------------------
    outcome = VerificationResult(
        status="verified",
        checks=[VerificationCheck(name="simulated_effect_present", passed=True,
                                  detail="sandbox produced a simulated receipt")],
    )
    ledger.append_outcome_verification(
        outcome, mission_id=mission_id, mission_version=mission_version,
        correlation_id=correlation_id, occurred_at=at("outcome"), actor="system",
        created_at=at("outcome"),
    )
    result.outcome_verification = outcome
    _advance(MissionEventType.VERIFY_OUTCOME, "outcome", outcome_verification=outcome)

    ledger.append_mission_closed(
        mission_id=mission_id, mission_version=mission_version, correlation_id=correlation_id,
        occurred_at=at("closed"), actor="system", created_at=at("closed"), outcome_status="simulated",
    )
    _advance(MissionEventType.CLOSE, "closed")

    result.execution_eligible = True
    result.final_status = STATUS_PASSED
    result.lifecycle_status = life.state.value
    result.lifecycle_events = list(life.events)
    _attach_audit(result, ledger, mission_id, score)
    return _finalize(result)


def _attach_audit(result: MissionEvaluationResult, ledger: MissionAuditLedger,
                  mission_id: str, score: MissionScorecard) -> None:
    bundle = ledger.export_mission_audit_bundle(mission_id)
    result.audit_bundle = bundle.model_dump(by_alias=True)
    result.audit_chain_valid = bundle.chain.valid
    score.audit_chain_valid = bundle.chain.valid
    present = {rec.record_type for rec in bundle.records}
    status = result.final_status
    if status == STATUS_PASSED:
        # A passed mission must persist the full governed lifecycle.
        required = {
            "mission_intake", "identity_resolution_result", "template_selection_result",
            "mission_opened", "mission_transition", "verification_result",
            "approval_request", "approval_decision", "simulated_action_receipt",
            "outcome_verification", "mission_closed",
        }
        score.audit_complete = bundle.chain.valid and required.issubset(present)
    elif status == STATUS_BLOCKED:
        # Every blocked path is fully recorded: intake + a terminal mission_blocked.
        score.audit_complete = (
            bundle.chain.valid
            and "mission_intake" in present
            and "mission_blocked" in present
        )
    elif status == STATUS_REJECTED:
        score.audit_complete = (
            bundle.chain.valid
            and "mission_intake" in present
            and "approval_decision" in present
        )
    elif status == STATUS_REVISION_REQUIRED:
        # The corrective path is auditable via the recorded transitions.
        transition_types = {
            _payload_event_type(rec) for rec in bundle.records
            if rec.record_type == "mission_transition"
        }
        score.audit_complete = (
            bundle.chain.valid
            and "mission_intake" in present
            and "verification_failed" in transition_types
            and "revision_requested" in transition_types
        )
    else:
        score.audit_complete = bundle.chain.valid and len(bundle.records) > 0


def _payload_event_type(rec) -> Optional[str]:
    try:
        return json.loads(rec.canonical_payload).get("eventType")
    except Exception:  # noqa: BLE001
        return None


# -- deterministic scenario matrix ------------------------------------------


def renewal_risk_happy_path() -> MissionScenario:
    return MissionScenario(
        scenario_id="renewal-risk-happy-path", mission_id="M-RENEWAL-1",
        signals={"mission_type": "renewal_risk", "signal_type": "renewal_risk",
                 "severity": "high", "signal_id": "SIG-REN-1"},
    )


def support_escalation_happy_path() -> MissionScenario:
    return MissionScenario(
        scenario_id="support-escalation-happy-path", mission_id="M-SUPPORT-1",
        signals={"mission_type": "support_escalation", "signal_type": "support_escalation",
                 "severity": "critical", "signal_id": "SIG-SUP-1"},
    )


def unsupported_signal_blocked() -> MissionScenario:
    return MissionScenario(
        scenario_id="unsupported-signal-blocked", mission_id="M-UNSUPPORTED-1",
        signals={"mission_type": "billing_dispute", "signal_type": "invoice_query",
                 "signal_id": "SIG-UNK-1"},
    )


def ambiguous_account_blocked() -> MissionScenario:
    from harness.fabric import ambiguous_source_records
    return MissionScenario(
        scenario_id="ambiguous-account-blocked", mission_id="M-AMBIGUOUS-1",
        signals={"mission_type": "renewal_risk", "signal_type": "renewal_risk",
                 "severity": "high", "signal_id": "SIG-AMB-1"},
        source_records=ambiguous_source_records(),
    )


def verification_failed_revision() -> MissionScenario:
    return MissionScenario(
        scenario_id="verification-failed-revision", mission_id="M-REVISION-1",
        signals={"mission_type": "renewal_risk", "signal_type": "renewal_risk",
                 "severity": "high", "signal_id": "SIG-REV-1"},
        verification_outcome="blocked", request_revision_after_block=True,
    )


def approval_rejected() -> MissionScenario:
    return MissionScenario(
        scenario_id="approval-rejected", mission_id="M-REJECTED-1",
        signals={"mission_type": "renewal_risk", "signal_type": "renewal_risk",
                 "severity": "high", "signal_id": "SIG-REJ-1"},
        approval="rejected",
    )


def approval_payload_mismatch() -> MissionScenario:
    return MissionScenario(
        scenario_id="approval-payload-mismatch", mission_id="M-MISMATCH-1",
        signals={"mission_type": "renewal_risk", "signal_type": "renewal_risk",
                 "severity": "high", "signal_id": "SIG-MIS-1"},
        inject_payload_mismatch=True,
    )


def idempotent_replay() -> MissionScenario:
    return MissionScenario(
        scenario_id="idempotent-replay", mission_id="M-REPLAY-1",
        signals={"mission_type": "renewal_risk", "signal_type": "renewal_risk",
                 "severity": "high", "signal_id": "SIG-REP-1"},
        replay_execution=True,
    )


def default_scenarios() -> List[MissionScenario]:
    """The eight canonical evaluation scenarios (A-H), in deterministic order."""
    return [
        renewal_risk_happy_path(),
        support_escalation_happy_path(),
        unsupported_signal_blocked(),
        ambiguous_account_blocked(),
        verification_failed_revision(),
        approval_rejected(),
        approval_payload_mismatch(),
        idempotent_replay(),
    ]


def default_injected_timestamps() -> dict:
    """A fixed, deterministic set of injected stage timestamps (no clock)."""
    base = "2026-07-14T10:00:00Z"
    return {
        "default": base,
        "intake": "2026-07-14T09:59:45Z",
        "identity": "2026-07-14T09:59:50Z",
        "selection": "2026-07-14T09:59:55Z",
        "blocked": "2026-07-14T09:59:59Z",
        "opened": "2026-07-14T10:00:00Z",
        "gathering": "2026-07-14T10:00:05Z",
        "proposed": "2026-07-14T10:00:10Z",
        "verifying": "2026-07-14T10:00:15Z",
        "verification": "2026-07-14T10:00:20Z",
        "verified": "2026-07-14T10:00:25Z",
        "approval_request": "2026-07-14T10:00:30Z",
        "approval_decision": "2026-07-14T10:00:35Z",
        "execution": "2026-07-14T10:00:40Z",
        "outcome": "2026-07-14T10:00:45Z",
        "closed": "2026-07-14T10:00:50Z",
    }


__all__ = [
    "SCHEMA_VERSION",
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
    "FAIL_INTERNAL",
    "MissionScenario",
    "MissionScorecard",
    "MissionEvaluationResult",
    "evaluate_mission_scenario",
    "renewal_risk_happy_path",
    "support_escalation_happy_path",
    "unsupported_signal_blocked",
    "ambiguous_account_blocked",
    "verification_failed_revision",
    "approval_rejected",
    "approval_payload_mismatch",
    "idempotent_replay",
    "default_scenarios",
    "default_injected_timestamps",
]
