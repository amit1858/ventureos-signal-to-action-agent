"""LiveMission -> governance harness adapter -- Real HubSpot Signal Vertical Slice, Phase 2C.

Additive, deterministic bridge that runs a persisted Phase 2B ``LiveMission`` (plus its
linked ``SignalChangeEvent`` evidence) through the EXISTING, protected governance harness
via its supported public entry point ``harness.service.execute_mission``. It adds no
business logic of its own: it maps inputs, invokes the harness, and shapes a typed result.

Journey (unchanged harness semantics):

    LiveMission + linked SignalChangeEvent
      -> validate evidence linkage
      -> deterministic SourceAccountRecord (provider-qualified, real HubSpot identity)
      -> severity via LIVE-MISSION-SEVERITY-MAP-v1
      -> HarnessServiceRequest
      -> harness.service.execute_mission (governance -> human approval gate ->
         simulated execution -> audit ledger)
      -> typed LiveMissionIntegrationResult
      -> stop

Hard boundaries (this adapter NEVER):
* selects a different mission, alters priority, or infers/defaults an approval decision;
* bypasses verification, executes external tools, calls HubSpot, or uses an LLM;
* modifies harness state, harness contracts, or any protected engine.

Approval and verification are EXPLICIT caller inputs (required, no defaults). A missing
approval (``"none"``) or a rejected approval never executes -- the harness enforces this
and this adapter faithfully surfaces it.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import Field

from harness.evaluation import (
    FAIL_AMBIGUOUS_IDENTITY,
    FAIL_APPROVAL_REJECTED,
    default_injected_timestamps,
)
from harness.fabric import SourceAccountRecord
from harness.service import (
    SVC_BLOCKED,
    SVC_COMPLETED,
    SVC_REJECTED,
    HarnessServiceDependencies,
    HarnessServiceRequest,
    HarnessServiceResponse,
    execute_mission,
)
from live_signals.contracts import SignalChangeEvent
from live_signals.mission_contracts import LiveMission, MissionModel, MissionPriority

# -- versioned, deterministic severity policy (no LLM, no inference) ----------

#: Named/versioned mapping from mission priority to harness signal severity.
SEVERITY_MAP_VERSION = "LIVE-MISSION-SEVERITY-MAP-v1"

_SEVERITY_MAP = {
    MissionPriority.medium: "medium",
    MissionPriority.high: "high",
    MissionPriority.critical: "critical",
}

_VALID_APPROVAL = ("approved", "rejected", "none")
_VALID_VERIFICATION = ("verified", "blocked")

# Integration result status vocabulary (adapter-level, fail-closed).
STOPPED_AWAITING_APPROVAL = "stopped_awaiting_approval"
STOPPED_IDENTITY_UNVERIFIED = "stopped_identity_unverified"
REJECTED = "rejected"
EXECUTED = "executed"
BLOCKED = "blocked"
FAILED = "failed"


class LiveMissionIntegrationError(ValueError):
    """A fail-closed adapter error raised BEFORE any harness invocation (bad input
    or broken evidence linkage). No governance side effect occurs."""


def map_severity(priority: MissionPriority) -> str:
    """Deterministic ``LIVE-MISSION-SEVERITY-MAP-v1`` lookup. Never inferred."""
    try:
        return _SEVERITY_MAP[priority]
    except KeyError as exc:  # pragma: no cover - enum-guarded
        raise LiveMissionIntegrationError(
            f"unmapped mission priority {priority!r} for {SEVERITY_MAP_VERSION}."
        ) from exc


class LiveMissionIntegrationResult(MissionModel):
    """Typed outcome of running one LiveMission through the governance harness.

    Presentation-free and secret-free: it references the durable audit trail and the
    governed decision, never a CRM write, credential, or database path."""

    status: str
    governance_status: str
    approval_input: str
    verification_input: str
    approval_required: bool = False
    executed: bool = False
    execution_eligible: bool = False
    replayed: bool = False
    simulated_receipt_id: Optional[str] = None
    severity: str
    severity_map_version: str = SEVERITY_MAP_VERSION
    failure_code: Optional[str] = None
    ledger_mission_id: Optional[str] = None
    ledger_record_count: int = 0
    ledger_chain_valid: bool = True
    ledger_latest_record_id: Optional[str] = None
    failure_reason: Optional[str] = None


def _validate_linkage(mission: LiveMission, event: SignalChangeEvent) -> None:
    """Fail closed unless the mission's evidence references point at THIS event."""
    if mission.source_event_id != event.event_id:
        raise LiveMissionIntegrationError(
            "evidence linkage mismatch: mission.source_event_id does not match event.event_id."
        )
    if mission.change_fingerprint != event.change_fingerprint:
        raise LiveMissionIntegrationError(
            "evidence linkage mismatch: mission.change_fingerprint does not match "
            "event.change_fingerprint."
        )


def build_source_account_record(
    mission: LiveMission, event: SignalChangeEvent
) -> SourceAccountRecord:
    """Deterministically derive the REAL, provider-qualified HubSpot identity record
    from the mission + event evidence. No demo fixture is used at runtime."""
    portal_id = event.portal_id
    company_id = event.source_record_id
    return SourceAccountRecord(
        source_system="hubspot",
        source_record_id=company_id,
        account_name=event.account_ref or mission.account_id,
        external_ids={
            # Stable, provider-qualified identity values (the crosswalk authority).
            "venture_os_ref": f"hubspot:{portal_id}:{company_id}",
            "hubspot_portal_id": portal_id,
            "hubspot_company_id": company_id,
        },
    )


def build_harness_request(
    mission: LiveMission,
    event: SignalChangeEvent,
    *,
    verification_outcome: str,
    approval: str,
    source_records: List[SourceAccountRecord],
    injected_timestamps: Optional[dict] = None,
    output_mode: str = "full",
) -> HarnessServiceRequest:
    """Construct the minimal HarnessServiceRequest. Approval/verification are passed
    through verbatim -- never defaulted here."""
    severity = map_severity(mission.priority)
    signals = {
        # The harness selector is the authority on eligibility; we only supply signals.
        "mission_type": mission.mission_type,
        "signal_type": mission.mission_type,
        "severity": severity,
        "priority": severity,
        "monitored_field": event.monitored_field,
        "source_event_id": mission.source_event_id,
        "change_fingerprint": mission.change_fingerprint,
    }
    return HarnessServiceRequest(
        request_id=f"live-req-{mission.mission_id}",
        correlation_id=f"live-corr-{mission.mission_id}",
        scenario_id=f"live-{mission.mission_type}",
        mission_id=mission.mission_id,
        mission_version="v1",
        signals=signals,
        source_records=source_records,
        verification_outcome=verification_outcome,
        approval=approval,
        injected_timestamps=injected_timestamps or default_injected_timestamps(),
        # Idempotency authority = the content-derived source event id (stable across retries).
        idempotency_key=mission.source_event_id,
        output_mode=output_mode,
    )


def _classify(response: HarnessServiceResponse, approval_input: str) -> str:
    result = response.mission_evaluation_result
    failure_code = result.failure_code if result is not None else None
    if response.status == SVC_COMPLETED and response.execution_eligible:
        return EXECUTED
    if response.status == SVC_REJECTED:
        return REJECTED
    if (
        response.status == SVC_BLOCKED
        and approval_input == "none"
        and failure_code == FAIL_APPROVAL_REJECTED
    ):
        return STOPPED_AWAITING_APPROVAL
    if response.status == SVC_BLOCKED and failure_code == FAIL_AMBIGUOUS_IDENTITY:
        # A governed stop: identity could not be corroborated to the confidence the
        # protected fabric requires. Distinct from policy/template/approval blocks.
        return STOPPED_IDENTITY_UNVERIFIED
    if response.status == SVC_BLOCKED:
        return BLOCKED
    return FAILED


def _shape_result(
    response: HarnessServiceResponse, *, approval_input: str, verification_input: str,
    severity: str,
) -> LiveMissionIntegrationResult:
    result = response.mission_evaluation_result
    receipt = result.simulated_action_receipt if result is not None else None
    ledger = response.ledger_reference
    approval_required = bool(result.scorecard.approval_required) if result is not None else False
    failure_reason = response.service_errors[0].message if response.service_errors else None
    status = _classify(response, approval_input)
    return LiveMissionIntegrationResult(
        status=status,
        governance_status=response.status,
        approval_input=approval_input,
        verification_input=verification_input,
        approval_required=approval_required,
        executed=status == EXECUTED,
        execution_eligible=response.execution_eligible,
        replayed=bool(result.replayed) if result is not None else False,
        simulated_receipt_id=receipt.receipt_id if receipt is not None else None,
        severity=severity,
        failure_code=result.failure_code if result is not None else None,
        ledger_mission_id=ledger.mission_id if ledger is not None else None,
        ledger_record_count=ledger.record_count if ledger is not None else 0,
        ledger_chain_valid=ledger.chain_valid if ledger is not None else True,
        ledger_latest_record_id=ledger.latest_ledger_record_id if ledger is not None else None,
        failure_reason=failure_reason,
    )


def integrate_live_mission(
    mission: LiveMission,
    event: SignalChangeEvent,
    *,
    verification_outcome: str,
    approval: str,
    dependencies: Optional[HarnessServiceDependencies] = None,
    corroborating_records: Optional[List[SourceAccountRecord]] = None,
    injected_timestamps: Optional[dict] = None,
    output_mode: str = "full",
) -> LiveMissionIntegrationResult:
    """Run one persisted LiveMission through the existing governance harness.

    ``verification_outcome`` and ``approval`` are REQUIRED explicit caller inputs
    (never defaulted or inferred). Fails closed before any harness call if the inputs
    are invalid or the mission/event evidence linkage is broken.

    ``corroborating_records`` lets a caller supply additional real source records so
    the protected identity fabric (which requires >= 2 corroborating source systems)
    can resolve the account. At runtime with only HubSpot, the harness blocks at
    identity -- a governed, fail-closed outcome this adapter surfaces truthfully as
    ``stopped_identity_unverified``.

    Ledger/durability boundary: when ``dependencies`` is omitted this call uses an
    in-memory ledger (``ledger_path=":memory:"``) that the harness owns and closes.
    That is suitable for a single evaluation only -- it is NOT durable and cannot back
    cross-process audit or cross-retry idempotency. Application callers MUST inject a
    durable, caller-owned ``HarnessServiceDependencies(ledger=...)`` for real audit and
    replay guarantees; this adapter never claims durability it does not have.
    """
    if approval not in _VALID_APPROVAL:
        raise LiveMissionIntegrationError(
            f"approval must be one of {_VALID_APPROVAL}; got {approval!r}."
        )
    if verification_outcome not in _VALID_VERIFICATION:
        raise LiveMissionIntegrationError(
            f"verification_outcome must be one of {_VALID_VERIFICATION}; got {verification_outcome!r}."
        )

    _validate_linkage(mission, event)

    severity = map_severity(mission.priority)
    primary = build_source_account_record(mission, event)
    records: List[SourceAccountRecord] = [primary] + list(corroborating_records or [])

    request = build_harness_request(
        mission, event,
        verification_outcome=verification_outcome, approval=approval,
        source_records=records, injected_timestamps=injected_timestamps,
        output_mode=output_mode,
    )
    deps = dependencies if dependencies is not None else HarnessServiceDependencies(ledger_path=":memory:")
    response = execute_mission(request, deps)
    return _shape_result(
        response, approval_input=approval, verification_input=verification_outcome,
        severity=severity,
    )


__all__ = [
    "SEVERITY_MAP_VERSION",
    "STOPPED_AWAITING_APPROVAL",
    "STOPPED_IDENTITY_UNVERIFIED",
    "REJECTED",
    "EXECUTED",
    "BLOCKED",
    "FAILED",
    "LiveMissionIntegrationError",
    "LiveMissionIntegrationResult",
    "map_severity",
    "build_source_account_record",
    "build_harness_request",
    "integrate_live_mission",
]
