"""Deterministic mission lifecycle state machine (Release 2.2, Commit 4).

Encodes the governed mission lifecycle (Revision 3, LOCKED) as an explicit,
deterministic transition table with typed guards. It is pure and offline:

* NO internal clock -- every event time is injected by the caller.
* NO randomness, NO model call, NO protected-engine or external call.
* Structurally illegal transitions raise ``IllegalTransitionError``.
* Structurally legal transitions whose guards fail are *rejected* (a
  ``TransitionResult`` with ``accepted=False``) -- never silently retried.
* Every accepted transition produces a ``MissionEvent`` for the audit chain.
* Same current-state + event + context always yields the same result.

Lifecycle (Revision 3):

    opened -> gathering -> proposed -> verifying
      -> verified | blocked
      -> awaiting_approval -> approved | rejected
      -> simulated_executed -> verified_outcome -> closed

Corrective path (no implicit retry):

    blocked --(revision_requested)--> gathering

``revision_requested`` is an EVENT, not a state (MissionState is pinned to the
Revision 3 states). It is the ONLY event that returns a blocked mission to
``gathering`` -- there is no direct ``blocked -> gathering`` edge.

This module is additive and touches no protected engine.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

from pydantic import Field

from harness.contracts import (
    ActionReceipt,
    ApprovalDecision,
    ApprovalOutcome,
    ApprovalRequest,
    HarnessModel,
    MissionEvent,
    MissionState,
    VerificationResult,
)


# -- errors -----------------------------------------------------------------


class StateMachineError(ValueError):
    """Base class for state-machine violations."""


class IllegalTransitionError(StateMachineError):
    """Raised for a structurally illegal (state, event) pair or terminal state."""


# -- event vocabulary -------------------------------------------------------


class MissionEventType:
    """Canonical event-type strings that drive lifecycle transitions."""

    BEGIN_GATHERING = "begin_gathering"
    PROPOSE = "propose"
    BEGIN_VERIFICATION = "begin_verification"
    VERIFICATION_PASSED = "verification_passed"
    VERIFICATION_FAILED = "verification_failed"
    REQUEST_APPROVAL = "request_approval"
    REVISION_REQUESTED = "revision_requested"
    APPROVE = "approve"
    REJECT = "reject"
    EXECUTE_SIMULATED = "execute_simulated"
    VERIFY_OUTCOME = "verify_outcome"
    CLOSE = "close"


TERMINAL_STATES: Tuple[MissionState, ...] = (MissionState.rejected, MissionState.closed)


# -- transition context (internal, never serialized to the boundary) --------


@dataclass(frozen=True)
class TransitionContext:
    """Everything the guards need for one transition. All fields are injected.

    ``occurred_at`` is a caller-supplied ISO-8601 string -- the machine never
    reads a clock.
    """

    mission_id: str
    mission_version: str
    actor: str
    occurred_at: str
    correlation_id: Optional[str] = None
    reason: Optional[str] = None
    verification: Optional[VerificationResult] = None
    identity_resolved: Optional[bool] = None
    policy_passed: Optional[bool] = None
    approval: Optional[ApprovalDecision] = None
    approval_request: Optional[ApprovalRequest] = None
    receipt: Optional[ActionReceipt] = None
    outcome_verification: Optional[VerificationResult] = None


# -- guard + transition results ---------------------------------------------


class GuardResult(HarnessModel):
    name: str
    passed: bool
    detail: str = ""


class TransitionResult(HarnessModel):
    """The deterministic outcome of applying one event to one state."""

    previous_state: MissionState
    next_state: Optional[MissionState] = None
    event_type: str
    accepted: bool
    reason: str
    guard_results: List[GuardResult] = Field(default_factory=list)
    event: Optional[MissionEvent] = None


# -- typed guards -----------------------------------------------------------


def _guard_verification_passed(ctx: TransitionContext) -> GuardResult:
    ok = ctx.verification is not None and ctx.verification.status == "verified"
    return GuardResult(name="verification_passed", passed=ok,
                       detail="" if ok else "verification missing or not 'verified'")


def _guard_identity_resolved(ctx: TransitionContext) -> GuardResult:
    ok = ctx.identity_resolved is True
    return GuardResult(name="identity_resolved", passed=ok,
                       detail="" if ok else "canonical identity not resolved")


def _guard_policy_passed(ctx: TransitionContext) -> GuardResult:
    ok = ctx.policy_passed is True
    return GuardResult(name="policy_validation_passed", passed=ok,
                       detail="" if ok else "policy validation did not pass")


def _guard_approval_present(ctx: TransitionContext) -> GuardResult:
    ok = ctx.approval is not None and ctx.approval.outcome == ApprovalOutcome.approved
    return GuardResult(name="approval_present", passed=ok,
                       detail="" if ok else "no approved ApprovalDecision present")


def _guard_approval_bound_to_version(ctx: TransitionContext) -> GuardResult:
    ok = (
        ctx.approval is not None
        and ctx.approval.mission_version == ctx.mission_version
    )
    return GuardResult(name="approval_bound_to_mission_version", passed=ok,
                       detail="" if ok else "approval mission_version does not match")


def _guard_approval_bound_to_payload(ctx: TransitionContext) -> GuardResult:
    ok = (
        ctx.approval is not None
        and ctx.approval_request is not None
        and bool(ctx.approval.approved_payload_hash)
        and ctx.approval.approved_payload_hash == ctx.approval_request.action_payload_hash
    )
    return GuardResult(name="approval_bound_to_payload_hash", passed=ok,
                       detail="" if ok else "approval payload hash does not match request")


def _guard_simulated_receipt_present(ctx: TransitionContext) -> GuardResult:
    ok = ctx.receipt is not None and ctx.receipt.simulated is True
    return GuardResult(name="simulated_receipt_present", passed=ok,
                       detail="" if ok else "no simulated ActionReceipt present")


def _guard_receipt_hash_matches_approval(ctx: TransitionContext) -> GuardResult:
    ok = (
        ctx.receipt is not None
        and ctx.approval is not None
        and bool(ctx.receipt.approved_payload_hash)
        and ctx.receipt.approved_payload_hash == ctx.approval.approved_payload_hash
    )
    return GuardResult(name="receipt_payload_hash_matches_approval", passed=ok,
                       detail="" if ok else "receipt payload hash does not match approval")


def _guard_outcome_verification_passed(ctx: TransitionContext) -> GuardResult:
    ok = ctx.outcome_verification is not None and ctx.outcome_verification.status == "verified"
    return GuardResult(name="outcome_verification_passed", passed=ok,
                       detail="" if ok else "outcome verification missing or not 'verified'")


Guard = Callable[[TransitionContext], GuardResult]


# -- transition table -------------------------------------------------------
#
# (from_state, event_type) -> (to_state, [guards])
# Only pairs present here are legal; anything else raises IllegalTransitionError.
# Guard failure on a legal edge is a *rejected* transition (accepted=False).

_TRANSITIONS: Dict[Tuple[MissionState, str], Tuple[MissionState, List[Guard]]] = {
    (MissionState.opened, MissionEventType.BEGIN_GATHERING): (MissionState.gathering, []),
    (MissionState.gathering, MissionEventType.PROPOSE): (MissionState.proposed, []),
    (MissionState.proposed, MissionEventType.BEGIN_VERIFICATION): (MissionState.verifying, []),
    (MissionState.verifying, MissionEventType.VERIFICATION_PASSED): (
        MissionState.verified,
        [_guard_verification_passed, _guard_identity_resolved, _guard_policy_passed],
    ),
    (MissionState.verifying, MissionEventType.VERIFICATION_FAILED): (MissionState.blocked, []),
    # Only 'verified' may request approval.
    (MissionState.verified, MissionEventType.REQUEST_APPROVAL): (
        MissionState.awaiting_approval,
        [_guard_verification_passed],
    ),
    # The ONLY edge out of 'blocked' toward gathering -- explicit, no implicit retry.
    (MissionState.blocked, MissionEventType.REVISION_REQUESTED): (MissionState.gathering, []),
    (MissionState.awaiting_approval, MissionEventType.APPROVE): (
        MissionState.approved,
        [_guard_approval_present, _guard_approval_bound_to_version, _guard_approval_bound_to_payload],
    ),
    (MissionState.awaiting_approval, MissionEventType.REJECT): (MissionState.rejected, []),
    (MissionState.approved, MissionEventType.EXECUTE_SIMULATED): (
        MissionState.simulated_executed,
        [_guard_simulated_receipt_present, _guard_receipt_hash_matches_approval],
    ),
    (MissionState.simulated_executed, MissionEventType.VERIFY_OUTCOME): (
        MissionState.verified_outcome,
        [_guard_outcome_verification_passed],
    ),
    (MissionState.verified_outcome, MissionEventType.CLOSE): (MissionState.closed, []),
}


def transition_table() -> List[Tuple[str, str, str, List[str]]]:
    """Return the transition table as ``(from, event, to, [guard names])`` rows.

    Deterministically ordered for documentation and inspection.
    """
    rows: List[Tuple[str, str, str, List[str]]] = []
    for (frm, event), (to, guards) in _TRANSITIONS.items():
        rows.append((frm.value, event, to.value, [g(_EMPTY_CTX).name for g in guards]))
    rows.sort(key=lambda r: (r[0], r[1]))
    return rows


_EMPTY_CTX = TransitionContext(mission_id="", mission_version="", actor="", occurred_at="")


# -- event construction (deterministic) -------------------------------------


def _event_id(mission_id: str, event_type: str, frm: MissionState, to: MissionState, occurred_at: str) -> str:
    """Deterministic event id derived purely from inputs (no clock, no uuid)."""
    canonical = f"{mission_id}|{event_type}|{frm.value}|{to.value}|{occurred_at}"
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:12]
    return f"EVT-{digest}"


def _build_event(
    ctx: TransitionContext, event_type: str, frm: MissionState, to: MissionState
) -> MissionEvent:
    return MissionEvent(
        event_id=_event_id(ctx.mission_id, event_type, frm, to, ctx.occurred_at),
        mission_id=ctx.mission_id,
        mission_version=ctx.mission_version,
        event_type=event_type,
        from_state=frm,
        to_state=to,
        actor=ctx.actor,
        reason=ctx.reason,
        correlation_id=ctx.correlation_id or ctx.mission_id,
        occurred_at=ctx.occurred_at,
    )


# -- pure transition evaluation ---------------------------------------------


def evaluate_transition(
    current_state: MissionState, event_type: str, ctx: TransitionContext
) -> TransitionResult:
    """Apply ``event_type`` to ``current_state`` deterministically.

    Raises ``IllegalTransitionError`` for structurally illegal pairs (including any
    event from a terminal state). Returns a ``TransitionResult`` otherwise; guard
    failures yield ``accepted=False`` and produce no event.
    """
    if current_state in TERMINAL_STATES:
        raise IllegalTransitionError(
            f"'{current_state.value}' is terminal; event '{event_type}' is not allowed."
        )

    key = (current_state, event_type)
    if key not in _TRANSITIONS:
        raise IllegalTransitionError(
            f"illegal transition: no edge for state '{current_state.value}' + event '{event_type}'."
        )

    to_state, guards = _TRANSITIONS[key]
    guard_results = [guard(ctx) for guard in guards]
    failed = [g for g in guard_results if not g.passed]

    if failed:
        reason = "; ".join(f"{g.name}: {g.detail}" for g in failed)
        return TransitionResult(
            previous_state=current_state,
            next_state=None,
            event_type=event_type,
            accepted=False,
            reason=f"rejected: {reason}",
            guard_results=guard_results,
            event=None,
        )

    event = _build_event(ctx, event_type, current_state, to_state)
    return TransitionResult(
        previous_state=current_state,
        next_state=to_state,
        event_type=event_type,
        accepted=True,
        reason="accepted",
        guard_results=guard_results,
        event=event,
    )


# -- stateful convenience wrapper -------------------------------------------


@dataclass
class MissionLifecycle:
    """A thin, deterministic wrapper that advances mission state and logs events.

    Holds no clock and makes no external call. On an accepted transition it moves
    ``state`` forward and appends the produced ``MissionEvent`` to ``events``. On a
    rejected transition ``state`` is unchanged and no event is logged. Illegal
    transitions raise.
    """

    state: MissionState = MissionState.opened
    events: List[MissionEvent] = field(default_factory=list)

    def apply(self, event_type: str, ctx: TransitionContext) -> TransitionResult:
        result = evaluate_transition(self.state, event_type, ctx)
        if result.accepted and result.next_state is not None:
            self.state = result.next_state
            if result.event is not None:
                self.events.append(result.event)
        return result


__all__ = [
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
