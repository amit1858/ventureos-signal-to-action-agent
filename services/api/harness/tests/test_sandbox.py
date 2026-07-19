"""Simulation sandbox tests (Release 2.2, Commit 5).

Plain-Python, no pytest. Covers governed simulated execution: approval + payload
binding, per-tool simulation output, idempotency, fail-closed behaviour, the
ActionReceipt.simulated invariant, deterministic receipts, integration with the
state machine, and the absence of any network / CRM / Decision-Ledger path.

Run directly:  python services/api/harness/tests/test_sandbox.py
"""

from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, "..", ".."))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from harness.contracts import (  # noqa: E402
    ApprovalChannel,
    ApprovalDecision,
    ApprovalOutcome,
    MissionState,
)
from harness.registries import ToolEntry, ToolRegistry, default_tool_registry  # noqa: E402
from harness.sandbox import (  # noqa: E402
    ActionRequest,
    ApprovalMismatchError,
    ApprovalRequiredError,
    IdempotencyConflictError,
    IllegalExecutionStateError,
    InactiveToolError,
    PayloadHashMismatchError,
    SimulationSandbox,
    UnsupportedToolError,
    payload_hash,
)
from harness.state_machine import (  # noqa: E402
    MissionEventType as E,
    MissionLifecycle,
    TransitionContext,
)

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


# -- fixtures ---------------------------------------------------------------

_TS = "2026-07-14T10:00:00Z"
_VERSION = "v1"
_PAYLOAD = {"account_name": "Curefoods", "action": "renewal_outreach", "priority": 1}
_PH = payload_hash(_PAYLOAD)


def _request(
    *, tool_id: str = "simulate_renewal_outreach", mission_id: str = "M1",
    mission_version: str = _VERSION, idempotency_key: str = "idem-1", payload: dict = None,
) -> ActionRequest:
    return ActionRequest(
        mission_id=mission_id,
        mission_version=mission_version,
        recommendation_id="R1",
        action_type="renewal_outreach",
        tool_id=tool_id,
        target_type="account",
        target_id="VOS-CUREFOODS",
        idempotency_key=idempotency_key,
        audit_ref="audit://M1/1",
        payload=_PAYLOAD if payload is None else payload,
    )


def _approval(
    *, mission_id: str = "M1", mission_version: str = _VERSION, payload_hash_value: str = _PH,
    outcome: ApprovalOutcome = ApprovalOutcome.approved,
) -> ApprovalDecision:
    return ApprovalDecision(
        decision_id="D1",
        mission_id=mission_id,
        mission_version=mission_version,
        outcome=outcome,
        actor="amit",
        actor_role="manager",
        channel=ApprovalChannel.screen,
        approved_action_ref="payload://M1/1",
        approved_payload_hash=payload_hash_value,
        confirm_token="tok-1",
        decided_at=_TS,
    )


def _tools() -> ToolRegistry:
    return default_tool_registry()


# -- valid simulations ------------------------------------------------------


def test_valid_renewal_simulation() -> None:
    sb = SimulationSandbox()
    receipt = sb.execute(_request(), _approval(), tool_registry=_tools(), occurred_at=_TS)
    _check("renewal receipt is simulated", receipt.simulated is True)
    _check("renewal receipt links approval payload hash", receipt.approved_payload_hash == _PH)
    d = receipt.details
    _check("renewal produces draft email (no send)",
           "draft_email" in d and d["draft_email"]["send"] is False)
    _check("renewal produces CRM task proposal (no write)",
           "crm_task_proposal" in d and d["crm_task_proposal"]["write"] is False)
    _check("renewal produces opportunity-risk update proposal (no write)",
           "opportunity_risk_update_proposal" in d
           and d["opportunity_risk_update_proposal"]["write"] is False)


def test_valid_support_simulation() -> None:
    sb = SimulationSandbox()
    payload = {"account_name": "Curefoods", "severity": "critical"}
    ph = payload_hash(payload)
    req = _request(tool_id="simulate_support_escalation", idempotency_key="idem-s", payload=payload)
    receipt = sb.execute(req, _approval(payload_hash_value=ph), tool_registry=_tools(), occurred_at=_TS)
    d = receipt.details
    _check("support produces internal escalation proposal (no external notify)",
           "internal_escalation_proposal" in d
           and d["internal_escalation_proposal"]["notify_external"] is False)
    _check("support produces follow-up task proposal (no write)",
           "follow_up_task_proposal" in d and d["follow_up_task_proposal"]["write"] is False)


def test_valid_stakeholder_brief_simulation() -> None:
    sb = SimulationSandbox()
    req = _request(tool_id="simulate_stakeholder_brief", idempotency_key="idem-b")
    receipt = sb.execute(req, _approval(), tool_registry=_tools(), occurred_at=_TS)
    d = receipt.details
    _check("brief produces meeting-prep artifact (no schedule/send)",
           "meeting_prep_artifact" in d
           and d["meeting_prep_artifact"]["schedule"] is False
           and d["meeting_prep_artifact"]["send"] is False)


def test_receipt_has_target_and_states() -> None:
    sb = SimulationSandbox()
    receipt = sb.execute(_request(), _approval(), tool_registry=_tools(), occurred_at=_TS)
    _check("receipt has explicit target type/id",
           receipt.target_type == "account" and receipt.target_id == "VOS-CUREFOODS")
    _check("receipt has before and after state",
           bool(receipt.before_state) and bool(receipt.after_state))
    _check("receipt uses injected execution time", receipt.created_at == _TS)


# -- fail-closed: governance ------------------------------------------------


def _raises(exc_type, fn) -> bool:
    try:
        fn()
        return False
    except exc_type:
        return True


def test_execution_without_approval_blocked() -> None:
    sb = SimulationSandbox()
    _check("execution without approval blocked",
           _raises(ApprovalRequiredError,
                   lambda: sb.execute(_request(), None, tool_registry=_tools(), occurred_at=_TS)))


def test_rejected_outcome_blocked() -> None:
    sb = SimulationSandbox()
    rejected = _approval(outcome=ApprovalOutcome.rejected)
    _check("rejected approval cannot execute",
           _raises(ApprovalRequiredError,
                   lambda: sb.execute(_request(), rejected, tool_registry=_tools(), occurred_at=_TS)))


def test_non_approved_state_blocked() -> None:
    sb = SimulationSandbox()
    _check("only approved mission state may execute",
           _raises(IllegalExecutionStateError,
                   lambda: sb.execute(_request(), _approval(), tool_registry=_tools(),
                                      occurred_at=_TS, mission_state=MissionState.awaiting_approval)))
    _check("rejected mission state blocked",
           _raises(IllegalExecutionStateError,
                   lambda: sb.execute(_request(), _approval(), tool_registry=_tools(),
                                      occurred_at=_TS, mission_state=MissionState.rejected)))


def test_mission_id_mismatch_blocked() -> None:
    sb = SimulationSandbox()
    _check("mission id mismatch blocked",
           _raises(ApprovalMismatchError,
                   lambda: sb.execute(_request(), _approval(mission_id="OTHER"),
                                      tool_registry=_tools(), occurred_at=_TS)))


def test_mission_version_mismatch_blocked() -> None:
    sb = SimulationSandbox()
    _check("mission version mismatch blocked",
           _raises(ApprovalMismatchError,
                   lambda: sb.execute(_request(), _approval(mission_version="v2"),
                                      tool_registry=_tools(), occurred_at=_TS)))


def test_payload_hash_mismatch_blocked() -> None:
    sb = SimulationSandbox()
    _check("payload hash mismatch blocked",
           _raises(PayloadHashMismatchError,
                   lambda: sb.execute(_request(), _approval(payload_hash_value="sha256:WRONG"),
                                      tool_registry=_tools(), occurred_at=_TS)))


def test_unsupported_tool_blocked() -> None:
    sb = SimulationSandbox()
    req = _request(tool_id="ghost_tool")
    _check("unsupported tool blocked",
           _raises(UnsupportedToolError,
                   lambda: sb.execute(req, _approval(), tool_registry=_tools(), occurred_at=_TS)))


def test_inactive_tool_blocked() -> None:
    sb = SimulationSandbox()
    reg = ToolRegistry()
    reg.register(ToolEntry(tool_id="simulate_renewal_outreach", description="d", active=False))
    _check("inactive tool blocked",
           _raises(InactiveToolError,
                   lambda: sb.execute(_request(), _approval(), tool_registry=reg, occurred_at=_TS)))


# -- idempotency ------------------------------------------------------------


def test_deterministic_receipt() -> None:
    r1 = SimulationSandbox().execute(_request(), _approval(), tool_registry=_tools(), occurred_at=_TS)
    r2 = SimulationSandbox().execute(_request(), _approval(), tool_registry=_tools(), occurred_at=_TS)
    _check("same input produces identical receipt id", r1.receipt_id == r2.receipt_id)
    _check("same input produces byte-identical receipt",
           r1.model_dump_json(by_alias=True) == r2.model_dump_json(by_alias=True))


def test_idempotent_replay_returns_same_receipt() -> None:
    sb = SimulationSandbox()
    r1 = sb.execute(_request(), _approval(), tool_registry=_tools(), occurred_at=_TS)
    r2 = sb.execute(_request(), _approval(), tool_registry=_tools(), occurred_at="2026-07-14T23:59:59Z")
    # Same idempotency key + same payload -> exact same cached receipt (even if a
    # different execution time is passed).
    _check("idempotent replay returns the same receipt object", r1 is r2)
    _check("idempotent replay keeps original receipt id", r1.receipt_id == r2.receipt_id)


def test_idempotency_collision_different_payload_fails() -> None:
    sb = SimulationSandbox()
    sb.execute(_request(), _approval(), tool_registry=_tools(), occurred_at=_TS)
    other_payload = {"account_name": "Curefoods", "action": "renewal_outreach", "priority": 99}
    other_ph = payload_hash(other_payload)
    req2 = _request(payload=other_payload)  # same idempotency key idem-1, different payload
    _check("idempotency collision with different payload fails closed",
           _raises(IdempotencyConflictError,
                   lambda: sb.execute(req2, _approval(payload_hash_value=other_ph),
                                      tool_registry=_tools(), occurred_at=_TS)))


# -- invariants + integration -----------------------------------------------


def test_simulated_invariant_holds() -> None:
    sb = SimulationSandbox()
    for tool in ("simulate_renewal_outreach", "simulate_support_escalation", "simulate_stakeholder_brief"):
        payload = {"account_name": "Curefoods", "tool": tool}
        ph = payload_hash(payload)
        req = _request(tool_id=tool, idempotency_key=f"idem-{tool}", payload=payload)
        receipt = sb.execute(req, _approval(payload_hash_value=ph), tool_registry=_tools(), occurred_at=_TS)
        _check(f"{tool} receipt simulated=True", receipt.simulated is True)


def test_full_approved_to_simulated_executed_with_state_machine() -> None:
    sb = SimulationSandbox()
    approval = _approval()
    receipt = sb.execute(_request(), approval, tool_registry=_tools(), occurred_at=_TS)

    lc = MissionLifecycle(state=MissionState.approved)
    ctx = TransitionContext(
        mission_id="M1", mission_version=_VERSION, actor="amit", occurred_at=_TS,
        approval=approval, receipt=receipt,
    )
    result = lc.apply(E.EXECUTE_SIMULATED, ctx)
    _check("approved -> simulated_executed accepts sandbox receipt",
           result.accepted and lc.state == MissionState.simulated_executed)
    _check("state machine bound receipt hash to approval",
           receipt.approved_payload_hash == approval.approved_payload_hash)


def test_no_network_or_ledger_dependency_in_source() -> None:
    path = os.path.join(_API_DIR, "harness", "sandbox.py")
    with open(path, "r", encoding="utf-8") as fh:
        src = fh.read()
    banned = [
        "import requests", "urllib", "http.client", "httpx", "socket", "smtplib",
        "ledger_service", "DecisionLedger", "boto3", "psycopg", "sqlite3", "aiohttp",
    ]
    hits = [tok for tok in banned if tok in src]
    _check("sandbox has no network / CRM / ledger dependency", not hits, str(hits))
    _check("sandbox uses no internal clock",
           not any(t in src for t in ["datetime", "time.time(", ".now(", "utcnow"]))


_TESTS = [
    test_valid_renewal_simulation,
    test_valid_support_simulation,
    test_valid_stakeholder_brief_simulation,
    test_receipt_has_target_and_states,
    test_execution_without_approval_blocked,
    test_rejected_outcome_blocked,
    test_non_approved_state_blocked,
    test_mission_id_mismatch_blocked,
    test_mission_version_mismatch_blocked,
    test_payload_hash_mismatch_blocked,
    test_unsupported_tool_blocked,
    test_inactive_tool_blocked,
    test_deterministic_receipt,
    test_idempotent_replay_returns_same_receipt,
    test_idempotency_collision_different_payload_fails,
    test_simulated_invariant_holds,
    test_full_approved_to_simulated_executed_with_state_machine,
    test_no_network_or_ledger_dependency_in_source,
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
    print(f"\nSandbox: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
