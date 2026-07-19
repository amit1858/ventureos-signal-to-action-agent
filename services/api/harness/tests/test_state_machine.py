"""Mission lifecycle state-machine tests (Release 2.2, Commit 4).

Plain-Python, no pytest. Covers legal + illegal transitions, typed guards,
terminal-state protection, injected event time, deterministic serialization, and
the full renewal happy path plus the blocked/revision corrective path.

Run directly:  python services/api/harness/tests/test_state_machine.py
"""

from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, "..", ".."))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from pydantic import ValidationError  # noqa: E402

from harness.contracts import (  # noqa: E402
    ActionReceipt,
    ApprovalChannel,
    ApprovalDecision,
    ApprovalOutcome,
    ApprovalRequest,
    MissionState,
    VerificationCheck,
    VerificationResult,
)
from harness.state_machine import (  # noqa: E402
    IllegalTransitionError,
    MissionEventType as E,
    MissionLifecycle,
    TransitionContext,
    evaluate_transition,
    transition_table,
)

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


# -- fixtures ---------------------------------------------------------------

_HASH = "sha256:payload-abc"
_VERSION = "v1"
_TS = "2026-07-14T10:00:00Z"


def _verification(status: str = "verified") -> VerificationResult:
    return VerificationResult(
        status=status,  # type: ignore[arg-type]
        checks=[VerificationCheck(name="evidence_sufficient", passed=True, detail="ok")],
    )


def _approval_request() -> ApprovalRequest:
    return ApprovalRequest(
        mission_id="M1",
        mission_version=_VERSION,
        recommendation_id="R1",
        action_type="renewal_outreach",
        permitted_actions=["simulate_renewal_outreach"],
        action_payload_ref="payload://M1/1",
        action_payload_hash=_HASH,
        verification_ref="verify://M1/1",
        prompt="Approve simulated renewal outreach?",
    )


def _approval(
    *, mission_version: str = _VERSION, payload_hash: str = _HASH,
    outcome: ApprovalOutcome = ApprovalOutcome.approved,
) -> ApprovalDecision:
    return ApprovalDecision(
        decision_id="D1",
        mission_id="M1",
        mission_version=mission_version,
        outcome=outcome,
        actor="amit",
        actor_role="manager",
        channel=ApprovalChannel.screen,
        approved_action_ref="payload://M1/1",
        approved_payload_hash=payload_hash,
        confirm_token="tok-1",
        decided_at=_TS,
    )


def _receipt(*, payload_hash: str = _HASH) -> ActionReceipt:
    return ActionReceipt(
        receipt_id="RC1",
        mission_id="M1",
        recommendation_id="R1",
        action_type="renewal_outreach",
        target_type="account",
        target_id="VOS-CUREFOODS",
        tool_id="simulate_renewal_outreach",
        approved_payload_hash=payload_hash,
        before_state={"stage": "at_risk"},
        after_state={"stage": "outreach_scheduled"},
        summary="Simulated renewal outreach drafted.",
        audit_ref="audit://M1/1",
        created_at=_TS,
    )


def _full_ctx(**overrides) -> TransitionContext:
    base = dict(
        mission_id="M1",
        mission_version=_VERSION,
        actor="amit",
        occurred_at=_TS,
        correlation_id="corr-M1",
        verification=_verification(),
        identity_resolved=True,
        policy_passed=True,
        approval=_approval(),
        approval_request=_approval_request(),
        receipt=_receipt(),
        outcome_verification=_verification(),
    )
    base.update(overrides)
    return TransitionContext(**base)


# -- legal transitions ------------------------------------------------------


def test_full_happy_path_reaches_closed() -> None:
    lc = MissionLifecycle()
    steps = [
        (E.BEGIN_GATHERING, MissionState.gathering),
        (E.PROPOSE, MissionState.proposed),
        (E.BEGIN_VERIFICATION, MissionState.verifying),
        (E.VERIFICATION_PASSED, MissionState.verified),
        (E.REQUEST_APPROVAL, MissionState.awaiting_approval),
        (E.APPROVE, MissionState.approved),
        (E.EXECUTE_SIMULATED, MissionState.simulated_executed),
        (E.VERIFY_OUTCOME, MissionState.verified_outcome),
        (E.CLOSE, MissionState.closed),
    ]
    ok = True
    for event, expected in steps:
        res = lc.apply(event, _full_ctx())
        ok = ok and res.accepted and lc.state == expected
    _check("full renewal happy path reaches closed", ok and lc.state == MissionState.closed)
    _check("happy path logs one event per accepted transition", len(lc.events) == len(steps),
           str(len(lc.events)))


def test_every_legal_edge_accepts() -> None:
    # Drive each legal edge from its source state with a full context.
    table = transition_table()
    accepted_all = True
    for frm, event, to, _guards in table:
        res = evaluate_transition(MissionState(frm), event, _full_ctx())
        accepted_all = accepted_all and res.accepted and res.next_state == MissionState(to)
    _check("every legal edge accepts under a full context", accepted_all, str(len(table)))


def test_blocked_revision_path_auditable() -> None:
    lc = MissionLifecycle()
    lc.apply(E.BEGIN_GATHERING, _full_ctx())
    lc.apply(E.PROPOSE, _full_ctx())
    lc.apply(E.BEGIN_VERIFICATION, _full_ctx())
    # Verification fails -> blocked.
    r_block = lc.apply(E.VERIFICATION_FAILED, _full_ctx(reason="evidence insufficient"))
    # Explicit revision requested -> gathering.
    r_rev = lc.apply(E.REVISION_REQUESTED, _full_ctx(reason="analyst requested revision"))
    _check("verification_failed moves to blocked", r_block.next_state == MissionState.blocked)
    _check("revision_requested returns blocked -> gathering",
           r_rev.accepted and lc.state == MissionState.gathering)
    _check("blocked/revision path produced audit events",
           any(e.event_type == E.VERIFICATION_FAILED for e in lc.events)
           and any(e.event_type == E.REVISION_REQUESTED for e in lc.events))
    rev_event = next(e for e in lc.events if e.event_type == E.REVISION_REQUESTED)
    _check("revision event records blocked -> gathering",
           rev_event.from_state == MissionState.blocked and rev_event.to_state == MissionState.gathering)


# -- illegal transitions ----------------------------------------------------


def _raises_illegal(state: MissionState, event: str, ctx: TransitionContext) -> bool:
    try:
        evaluate_transition(state, event, ctx)
        return False
    except IllegalTransitionError:
        return True


def test_opened_cannot_jump_to_awaiting_approval() -> None:
    _check("opened -> awaiting_approval is illegal",
           _raises_illegal(MissionState.opened, E.REQUEST_APPROVAL, _full_ctx()))


def test_blocked_cannot_return_directly_to_gathering() -> None:
    # There is no direct begin_gathering edge from blocked.
    _check("blocked -> gathering (begin_gathering) is illegal",
           _raises_illegal(MissionState.blocked, E.BEGIN_GATHERING, _full_ctx()))
    # Only the explicit revision_requested event works.
    res = evaluate_transition(MissionState.blocked, E.REVISION_REQUESTED, _full_ctx())
    _check("blocked -> gathering only via revision_requested",
           res.accepted and res.next_state == MissionState.gathering)


def test_verified_outcome_requires_receipt_stage() -> None:
    # verify_outcome only from simulated_executed, never from approved.
    _check("verify_outcome from approved is illegal",
           _raises_illegal(MissionState.approved, E.VERIFY_OUTCOME, _full_ctx()))


def test_closed_requires_verified_outcome() -> None:
    _check("close from approved is illegal",
           _raises_illegal(MissionState.approved, E.CLOSE, _full_ctx()))
    _check("close from simulated_executed is illegal",
           _raises_illegal(MissionState.simulated_executed, E.CLOSE, _full_ctx()))


def test_terminal_state_protection() -> None:
    for event in (E.BEGIN_GATHERING, E.EXECUTE_SIMULATED, E.CLOSE, E.APPROVE):
        _check(f"closed rejects '{event}'", _raises_illegal(MissionState.closed, event, _full_ctx()))
        _check(f"rejected rejects '{event}'", _raises_illegal(MissionState.rejected, event, _full_ctx()))


def test_rejected_mission_cannot_execute() -> None:
    lc = MissionLifecycle(state=MissionState.awaiting_approval)
    lc.apply(E.REJECT, _full_ctx())
    _check("reject moves to rejected (terminal)", lc.state == MissionState.rejected)
    _check("rejected mission cannot execute",
           _raises_illegal(MissionState.rejected, E.EXECUTE_SIMULATED, _full_ctx()))


# -- guard failures (legal edge, rejected) ----------------------------------


def test_unverified_mission_cannot_request_approval() -> None:
    res = evaluate_transition(
        MissionState.verified, E.REQUEST_APPROVAL, _full_ctx(verification=_verification("blocked"))
    )
    _check("request_approval rejected without passing verification",
           res.accepted is False and res.next_state is None)


def test_verification_passed_requires_all_guards() -> None:
    res = evaluate_transition(
        MissionState.verifying, E.VERIFICATION_PASSED, _full_ctx(identity_resolved=False)
    )
    _check("verification_passed rejected when identity unresolved", res.accepted is False)
    res2 = evaluate_transition(
        MissionState.verifying, E.VERIFICATION_PASSED, _full_ctx(policy_passed=False)
    )
    _check("verification_passed rejected when policy fails", res2.accepted is False)


def test_missing_approval_blocks_execution_stage() -> None:
    res = evaluate_transition(MissionState.awaiting_approval, E.APPROVE, _full_ctx(approval=None))
    _check("approve rejected when approval absent", res.accepted is False)


def test_mismatched_mission_version_blocks_approval() -> None:
    res = evaluate_transition(
        MissionState.awaiting_approval, E.APPROVE,
        _full_ctx(approval=_approval(mission_version="v2")),
    )
    _check("approve rejected on mission_version mismatch", res.accepted is False)
    _check("rejection names the version guard", "approval_bound_to_mission_version" in res.reason,
           res.reason)


def test_mismatched_payload_hash_blocks_execution() -> None:
    # At approval time.
    res = evaluate_transition(
        MissionState.awaiting_approval, E.APPROVE,
        _full_ctx(approval=_approval(payload_hash="sha256:WRONG")),
    )
    _check("approve rejected on payload hash mismatch", res.accepted is False)
    # At execution time.
    res2 = evaluate_transition(
        MissionState.approved, E.EXECUTE_SIMULATED,
        _full_ctx(receipt=_receipt(payload_hash="sha256:WRONG")),
    )
    _check("execute rejected on receipt hash mismatch with approval", res2.accepted is False)
    _check("execute rejection names the receipt guard",
           "receipt_payload_hash_matches_approval" in res2.reason, res2.reason)


def test_execution_requires_simulated_receipt() -> None:
    res = evaluate_transition(MissionState.approved, E.EXECUTE_SIMULATED, _full_ctx(receipt=None))
    _check("execute rejected when no receipt present", res.accepted is False)


def test_simulated_false_receipt_rejected_at_construction() -> None:
    raised = False
    try:
        ActionReceipt(
            receipt_id="RCX", mission_id="M1", recommendation_id="R1", action_type="x",
            target_type="account", target_id="A", tool_id="t", approved_payload_hash=_HASH,
            simulated=False, summary="s", audit_ref="a", created_at=_TS,
        )
    except ValidationError:
        raised = True
    _check("ActionReceipt(simulated=False) is rejected", raised)


def test_outcome_verification_required_for_verified_outcome() -> None:
    res = evaluate_transition(
        MissionState.simulated_executed, E.VERIFY_OUTCOME,
        _full_ctx(outcome_verification=_verification("blocked")),
    )
    _check("verify_outcome rejected when outcome not verified", res.accepted is False)


# -- determinism ------------------------------------------------------------


def test_injected_event_time_only() -> None:
    res = evaluate_transition(MissionState.opened, E.BEGIN_GATHERING, _full_ctx(occurred_at=_TS))
    _check("event uses the injected occurred_at", res.event is not None and res.event.occurred_at == _TS)


def test_no_internal_clock_in_source() -> None:
    path = os.path.join(_API_DIR, "harness", "state_machine.py")
    with open(path, "r", encoding="utf-8") as fh:
        src = fh.read()
    banned = ["import datetime", "from datetime", "import time", "time.time(", ".now(", "utcnow", "monotonic"]
    hits = [tok for tok in banned if tok in src]
    _check("state_machine.py uses no internal clock", not hits, str(hits))


def test_deterministic_transition_result() -> None:
    a = evaluate_transition(MissionState.opened, E.BEGIN_GATHERING, _full_ctx())
    b = evaluate_transition(MissionState.opened, E.BEGIN_GATHERING, _full_ctx())
    _check("same inputs produce identical transition results",
           a.model_dump_json(by_alias=True) == b.model_dump_json(by_alias=True))


def test_deterministic_event_serialization() -> None:
    a = evaluate_transition(MissionState.opened, E.BEGIN_GATHERING, _full_ctx()).event
    b = evaluate_transition(MissionState.opened, E.BEGIN_GATHERING, _full_ctx()).event
    _check("event serialization is byte-identical",
           a is not None and b is not None
           and a.model_dump_json(by_alias=True) == b.model_dump_json(by_alias=True))
    _check("event id is deterministic", a.event_id == b.event_id, None if a is None else a.event_id)


def test_transition_table_shape() -> None:
    rows = transition_table()
    # 12 legal edges in the Revision 3 lifecycle (incl. revision + reject + fail).
    _check("transition table exposes 12 legal edges", len(rows) == 12, str(len(rows)))
    froms = {r[0] for r in rows}
    _check("terminal states have no outgoing edges",
           "closed" not in froms and "rejected" not in froms, str(sorted(froms)))


_TESTS = [
    test_full_happy_path_reaches_closed,
    test_every_legal_edge_accepts,
    test_blocked_revision_path_auditable,
    test_opened_cannot_jump_to_awaiting_approval,
    test_blocked_cannot_return_directly_to_gathering,
    test_verified_outcome_requires_receipt_stage,
    test_closed_requires_verified_outcome,
    test_terminal_state_protection,
    test_rejected_mission_cannot_execute,
    test_unverified_mission_cannot_request_approval,
    test_verification_passed_requires_all_guards,
    test_missing_approval_blocks_execution_stage,
    test_mismatched_mission_version_blocks_approval,
    test_mismatched_payload_hash_blocks_execution,
    test_execution_requires_simulated_receipt,
    test_simulated_false_receipt_rejected_at_construction,
    test_outcome_verification_required_for_verified_outcome,
    test_injected_event_time_only,
    test_no_internal_clock_in_source,
    test_deterministic_transition_result,
    test_deterministic_event_serialization,
    test_transition_table_shape,
]


def run() -> tuple[int, int]:
    del _RESULTS[:]
    for test in _TESTS:
        try:
            test()
        except Exception as exc:  # noqa: BLE001
            _check(f"{test.__name__} raised", False, f"{type(exc).__name__}: {exc}")
    passed = sum(1 for _, ok, _ in _RESULTS if ok)
    failed = sum(1 for _, ok, _ in _RESULTS if not ok)
    for name, ok, detail in _RESULTS:
        status = "PASS" if ok else "FAIL"
        line = f"[{status}] {name}"
        if not ok and detail:
            line += f"  -- {detail}"
        print(line)
    print(f"\nState machine: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
