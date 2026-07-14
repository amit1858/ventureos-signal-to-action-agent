"""Deterministic simulation sandbox (Release 2.2, Commit 5).

Executes the registered simulation-only tools and returns an ``ActionReceipt``.
It is pure and offline -- the sandbox exists precisely so a mission can produce a
*proof of what would happen* without any real effect:

* NO network access, NO CRM calls, NO email sends, NO external writes.
* NO path writes to the protected Decision Ledger (it is referenced by string
  only, via ``audit_ref``).
* Every result is an ``ActionReceipt`` with ``simulated=True`` (a hard contract
  invariant -- ``simulated=False`` cannot be constructed).
* Execution requires a valid, matching ``ApprovalDecision`` and may only run from
  the ``approved`` mission state.
* Deterministic: same request + approval + injected time yields a byte-identical
  receipt; idempotent replay returns the same receipt; a key collision with a
  different payload fails closed.

This module is additive and touches no protected engine.
"""

from __future__ import annotations

import hashlib
import json
from typing import Callable, Dict, Optional, Tuple

from pydantic import Field

from harness.contracts import (
    ActionReceipt,
    ApprovalDecision,
    ApprovalOutcome,
    HarnessModel,
    MissionState,
)
from harness.registries import InactiveError, ToolRegistry, UnknownIdError


# -- errors -----------------------------------------------------------------


class SandboxError(ValueError):
    """Base class for all sandbox execution failures (all fail closed)."""


class UnsupportedToolError(SandboxError):
    """Raised for a tool that is not a registered simulation tool."""


class InactiveToolError(SandboxError):
    """Raised when the requested tool is registered but inactive."""


class IllegalExecutionStateError(SandboxError):
    """Raised when execution is attempted from a non-approved mission state."""


class ApprovalRequiredError(SandboxError):
    """Raised when no valid approved ApprovalDecision is present."""


class ApprovalMismatchError(SandboxError):
    """Raised when the approval mission id / version does not match the request."""


class PayloadHashMismatchError(SandboxError):
    """Raised when the approved payload hash does not match the requested payload."""


class IdempotencyConflictError(SandboxError):
    """Raised when an idempotency key is reused with a different payload."""


# -- deterministic payload hashing ------------------------------------------


def payload_hash(payload: dict) -> str:
    """Deterministic hash of an action payload (canonical JSON, sorted keys)."""
    canonical = json.dumps(
        payload or {}, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str
    )
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


# -- action request (internal) ----------------------------------------------


class ActionRequest(HarnessModel):
    """A simulation-execution request. Internal to the harness."""

    mission_id: str
    mission_version: str
    recommendation_id: str
    action_type: str
    tool_id: str
    target_type: str
    target_id: str
    idempotency_key: str
    audit_ref: str = Field(..., description="Mission Audit reference (string link only)")
    payload: dict = Field(default_factory=dict)

    @property
    def computed_payload_hash(self) -> str:
        return payload_hash(self.payload)


# -- simulation outputs ------------------------------------------------------


class SimulationOutput(HarnessModel):
    """The deterministic effect a simulator would have produced."""

    summary: str
    before_state: dict = Field(default_factory=dict)
    after_state: dict = Field(default_factory=dict)
    details: dict = Field(default_factory=dict)


def _account_label(payload: dict) -> str:
    return str(payload.get("account_name") or payload.get("target_id") or "the account")


def _simulate_renewal_outreach(request: ActionRequest) -> SimulationOutput:
    account = _account_label(request.payload)
    draft_email = {
        "to_role": "customer_champion",
        "subject": f"Partnering on your upcoming renewal - {account}",
        "body": (
            f"Hi, we noticed some renewal-risk signals on {account} and would like to "
            "align on value delivered and next steps ahead of renewal."
        ),
        "send": False,
    }
    crm_task_proposal = {
        "type": "task",
        "title": f"Schedule renewal check-in with {account}",
        "owner_role": "account_manager",
        "write": False,
    }
    opportunity_risk_update_proposal = {
        "type": "opportunity_update",
        "field": "risk_status",
        "proposed_value": "engaged_mitigation",
        "write": False,
    }
    return SimulationOutput(
        summary=f"Prepared simulated renewal-risk outreach package for {account}.",
        before_state={"renewal_stage": "at_risk", "outreach": "none"},
        after_state={"renewal_stage": "at_risk", "outreach": "prepared", "proposals": 3},
        details={
            "draft_email": draft_email,
            "crm_task_proposal": crm_task_proposal,
            "opportunity_risk_update_proposal": opportunity_risk_update_proposal,
        },
    )


def _simulate_support_escalation(request: ActionRequest) -> SimulationOutput:
    account = _account_label(request.payload)
    internal_escalation_proposal = {
        "type": "internal_escalation",
        "to_role": "support_lead",
        "severity": str(request.payload.get("severity") or "high"),
        "notify_external": False,
    }
    follow_up_task_proposal = {
        "type": "task",
        "title": f"Follow up on escalated support case for {account}",
        "owner_role": "support_engineer",
        "write": False,
    }
    return SimulationOutput(
        summary=f"Prepared simulated support-escalation package for {account}.",
        before_state={"support_stage": "escalation_requested"},
        after_state={"support_stage": "escalation_prepared", "proposals": 2},
        details={
            "internal_escalation_proposal": internal_escalation_proposal,
            "follow_up_task_proposal": follow_up_task_proposal,
        },
    )


def _simulate_stakeholder_brief(request: ActionRequest) -> SimulationOutput:
    account = _account_label(request.payload)
    meeting_prep_artifact = {
        "type": "meeting_prep",
        "title": f"Stakeholder brief - {account}",
        "sections": ["account_health", "open_risks", "recommended_actions"],
        "schedule": False,
        "send": False,
    }
    return SimulationOutput(
        summary=f"Prepared simulated stakeholder brief for {account}.",
        before_state={"brief": "none"},
        after_state={"brief": "prepared"},
        details={"meeting_prep_artifact": meeting_prep_artifact},
    )


_SIMULATORS: Dict[str, Callable[[ActionRequest], SimulationOutput]] = {
    "simulate_renewal_outreach": _simulate_renewal_outreach,
    "simulate_support_escalation": _simulate_support_escalation,
    "simulate_stakeholder_brief": _simulate_stakeholder_brief,
}


# -- deterministic receipt id -----------------------------------------------


def _receipt_id(request: ActionRequest, ph: str) -> str:
    canonical = f"{request.mission_id}|{request.tool_id}|{request.idempotency_key}|{ph}"
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:12]
    return f"RCP-{digest}"


# -- the sandbox -------------------------------------------------------------


class SimulationSandbox:
    """Runs registered simulation tools under governance, idempotently.

    Holds an in-memory idempotency cache keyed by ``idempotency_key``. It makes no
    external call and holds no clock -- execution time is injected.
    """

    def __init__(self) -> None:
        # idempotency_key -> (payload_hash, receipt)
        self._cache: Dict[str, Tuple[str, ActionReceipt]] = {}

    def execute(
        self,
        request: ActionRequest,
        approval: Optional[ApprovalDecision],
        *,
        tool_registry: ToolRegistry,
        occurred_at: str,
        mission_state: MissionState = MissionState.approved,
    ) -> ActionReceipt:
        """Execute a simulated action, failing closed on any governance violation."""
        # 1. Tool must be a registered, active simulation tool.
        try:
            tool = tool_registry.get_active(request.tool_id)
        except UnknownIdError as exc:
            raise UnsupportedToolError(f"unsupported tool: {request.tool_id!r}") from exc
        except InactiveError as exc:
            raise InactiveToolError(f"inactive tool: {request.tool_id!r}") from exc
        if request.tool_id not in _SIMULATORS or not tool.simulated:
            raise UnsupportedToolError(f"no simulator for tool: {request.tool_id!r}")

        # 2. Only an approved mission may execute (rejected / any other -> closed).
        if mission_state != MissionState.approved:
            raise IllegalExecutionStateError(
                f"execution requires mission state 'approved', got {mission_state.value!r}."
            )

        # 3. A valid, approved decision must be present.
        if approval is None or approval.outcome != ApprovalOutcome.approved:
            raise ApprovalRequiredError("a valid approved ApprovalDecision is required to execute.")

        # 4. Approval must be bound to THIS mission id + version.
        if approval.mission_id != request.mission_id:
            raise ApprovalMismatchError("approval mission_id does not match the request.")
        if approval.mission_version != request.mission_version:
            raise ApprovalMismatchError("approval mission_version does not match the request.")

        # 5. Approval must be bound to the exact requested payload.
        ph = request.computed_payload_hash
        if not approval.approved_payload_hash or approval.approved_payload_hash != ph:
            raise PayloadHashMismatchError(
                "approved_payload_hash does not match the requested action payload."
            )

        # 6. Idempotency: replay returns the same receipt; a payload collision fails closed.
        cached = self._cache.get(request.idempotency_key)
        if cached is not None:
            cached_ph, cached_receipt = cached
            if cached_ph == ph:
                return cached_receipt
            raise IdempotencyConflictError(
                f"idempotency key {request.idempotency_key!r} reused with a different payload."
            )

        # 7. Produce the simulated effect and the receipt (simulated=True is enforced).
        output = _SIMULATORS[request.tool_id](request)
        receipt = ActionReceipt(
            receipt_id=_receipt_id(request, ph),
            mission_id=request.mission_id,
            recommendation_id=request.recommendation_id,
            action_type=request.action_type,
            target_type=request.target_type,
            target_id=request.target_id,
            tool_id=request.tool_id,
            approved_payload_hash=approval.approved_payload_hash,
            before_state=output.before_state,
            after_state=output.after_state,
            summary=output.summary,
            details=output.details,
            audit_ref=request.audit_ref,
            created_at=occurred_at,
        )
        self._cache[request.idempotency_key] = (ph, receipt)
        return receipt


__all__ = [
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
