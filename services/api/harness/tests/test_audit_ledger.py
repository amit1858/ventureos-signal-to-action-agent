"""Mission Audit Ledger tests (Release 2.2, Commit 6).

Plain-Python, no pytest. Covers append/read of every record type, deterministic
sequencing + canonical JSON + hashes, per-mission hash chains, tamper detection,
append-only surface, durable mission-scoped idempotency (surviving reopen),
audit_ref mapping, receipt/approval binding, fail-closed behaviour, deterministic
bundle export, and the full renewal + blocked/revision persistence paths.

Run directly:  python services/api/harness/tests/test_audit_ledger.py
"""

from __future__ import annotations

import os
import sqlite3
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, "..", ".."))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from harness.audit_ledger import (  # noqa: E402
    ApprovalMismatchError,
    DuplicateRecordError,
    IdempotencyConflictError,
    InvalidMissionVersionError,
    MissingMissionIdError,
    MissionAuditLedger,
    PayloadHashMismatchError,
    RejectedApprovalError,
)
from harness.contracts import (  # noqa: E402
    ActionReceipt,
    ApprovalChannel,
    ApprovalDecision,
    ApprovalOutcome,
    ApprovalRequest,
    MissionEvent,
    MissionState,
    VerificationCheck,
    VerificationResult,
)

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


# -- fixtures ---------------------------------------------------------------

_TS = "2026-07-14T10:00:00Z"
_VERSION = "v1"
_PH = "sha256:payload-abc"


def _event(event_type: str, frm, to, *, mission_id="M1") -> MissionEvent:
    return MissionEvent(
        event_id=f"EVT-{event_type}", mission_id=mission_id, mission_version=_VERSION,
        event_type=event_type, from_state=frm, to_state=to, actor="amit",
        correlation_id=f"corr-{mission_id}", occurred_at=_TS,
    )


def _verification(status="verified") -> VerificationResult:
    return VerificationResult(
        status=status,  # type: ignore[arg-type]
        checks=[VerificationCheck(name="evidence_sufficient", passed=True, detail="ok")],
    )


def _request() -> ApprovalRequest:
    return ApprovalRequest(
        mission_id="M1", mission_version=_VERSION, recommendation_id="R1",
        action_type="renewal_outreach", permitted_actions=["simulate_renewal_outreach"],
        action_payload_ref="payload://M1/1", action_payload_hash=_PH,
        verification_ref="verify://M1/1", prompt="Approve?",
    )


def _approval(*, mission_id="M1", mission_version=_VERSION, payload_hash=_PH,
              outcome=ApprovalOutcome.approved) -> ApprovalDecision:
    return ApprovalDecision(
        decision_id="D1", mission_id=mission_id, mission_version=mission_version, outcome=outcome,
        actor="amit", actor_role="manager", channel=ApprovalChannel.screen,
        approved_action_ref="payload://M1/1", approved_payload_hash=payload_hash,
        confirm_token="tok-1", decided_at=_TS,
    )


def _receipt(*, mission_id="M1", payload_hash=_PH, audit_ref="audit://M1/1") -> ActionReceipt:
    return ActionReceipt(
        receipt_id="RCP-1", mission_id=mission_id, recommendation_id="R1", action_type="renewal_outreach",
        target_type="account", target_id="VOS-CUREFOODS", tool_id="simulate_renewal_outreach",
        approved_payload_hash=payload_hash, before_state={"s": 0}, after_state={"s": 1},
        summary="Simulated.", audit_ref=audit_ref, created_at=_TS,
    )


def _ledger() -> MissionAuditLedger:
    return MissionAuditLedger(":memory:")


def _tmp_db() -> str:
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    os.close(fd)
    return path


def _open_and_seed(led: MissionAuditLedger, mission_id="M1") -> None:
    led.append_mission_opened(
        mission_id=mission_id, mission_version=_VERSION, correlation_id=f"corr-{mission_id}",
        occurred_at=_TS, actor="system", created_at=_TS,
        canonical_account={"ventureOsId": "VOS-CUREFOODS", "canonicalName": "Curefoods"},
        selected_template_id="renewal-risk-parallel-v1",
        evidence_refs=[{"ref": "mem://evidence/1"}], decision_ref="decisionLedger://run/xyz",
    )


# -- append + retrieve ------------------------------------------------------


def test_append_and_retrieve_each_record_type() -> None:
    led = _ledger()
    _open_and_seed(led)
    led.append_mission_event(_event("begin_gathering", MissionState.opened, MissionState.gathering),
                             created_at=_TS)
    led.append_verification(_verification(), mission_id="M1", mission_version=_VERSION,
                            correlation_id="corr-M1", occurred_at=_TS, actor="system", created_at=_TS)
    led.append_approval_request(_request(), correlation_id="corr-M1", occurred_at=_TS,
                                actor="system", created_at=_TS)
    led.append_approval_decision(_approval(), correlation_id="corr-M1", occurred_at=_TS, created_at=_TS)
    led.append_action_receipt(_receipt(), _approval(), mission_version=_VERSION,
                              idempotency_key="idem-1", correlation_id="corr-M1", occurred_at=_TS,
                              actor="amit", created_at=_TS)
    led.append_outcome_verification(_verification(), mission_id="M1", mission_version=_VERSION,
                                    correlation_id="corr-M1", occurred_at=_TS, actor="system", created_at=_TS)
    led.append_mission_closed(mission_id="M1", mission_version=_VERSION, correlation_id="corr-M1",
                              occurred_at=_TS, actor="system", created_at=_TS, outcome_status="simulated")
    records = led.list_mission_records("M1")
    types = [r.record_type for r in records]
    expected = [
        "mission_opened", "mission_transition", "verification_result", "approval_request",
        "approval_decision", "simulated_action_receipt", "outcome_verification", "mission_closed",
    ]
    _check("all 8 record types appended in order", types == expected, str(types))
    first = records[0]
    _check("get_record round-trips", led.get_record(first.ledger_record_id).ledger_record_id == first.ledger_record_id)
    _check("get_latest_record is the close record", led.get_latest_record("M1").record_type == "mission_closed")


def test_deterministic_sequence_numbering() -> None:
    led = _ledger()
    _open_and_seed(led)
    led.append_mission_event(_event("propose", MissionState.gathering, MissionState.proposed), created_at=_TS)
    seqs = [r.sequence_number for r in led.list_mission_records("M1")]
    _check("sequence numbers are 1..n contiguous", seqs == [1, 2], str(seqs))


def test_deterministic_canonical_and_hash() -> None:
    a = _ledger(); _open_and_seed(a)
    b = _ledger(); _open_and_seed(b)
    ra = a.list_mission_records("M1")[0]
    rb = b.list_mission_records("M1")[0]
    _check("canonical payload is deterministic", ra.canonical_payload == rb.canonical_payload)
    _check("record hash is stable across ledgers", ra.record_hash == rb.record_hash)
    _check("ledger_record_id is deterministic", ra.ledger_record_id == rb.ledger_record_id)


# -- hash chain -------------------------------------------------------------


def test_chain_links_and_verifies() -> None:
    led = _ledger()
    _open_and_seed(led)
    led.append_mission_event(_event("propose", MissionState.gathering, MissionState.proposed), created_at=_TS)
    recs = led.list_mission_records("M1")
    _check("first record links to genesis", recs[0].previous_record_hash == "0" * 64)
    _check("second record links to first hash", recs[1].previous_record_hash == recs[0].record_hash)
    chain = led.verify_mission_chain("M1")
    _check("valid chain verifies", chain.valid is True and chain.length == 2)


def test_tampering_is_detected() -> None:
    path = _tmp_db()
    led = MissionAuditLedger(path)
    _open_and_seed(led)
    led.append_mission_event(_event("propose", MissionState.gathering, MissionState.proposed), created_at=_TS)
    led.close()
    # Tamper directly in the database (no ledger update API exists).
    con = sqlite3.connect(path)
    con.execute("UPDATE mission_audit_records SET canonical_payload = '{\"tampered\":true}' "
                "WHERE sequence_number = 1 AND mission_id = 'M1'")
    con.commit(); con.close()
    led2 = MissionAuditLedger(path)
    chain = led2.verify_mission_chain("M1")
    _check("tampering breaks chain verification", chain.valid is False and chain.broken_at_sequence == 1)
    led2.close()
    os.remove(path)


def test_two_missions_separate_chains() -> None:
    led = _ledger()
    _open_and_seed(led, "M1")
    _open_and_seed(led, "M2")
    led.append_mission_event(_event("propose", MissionState.gathering, MissionState.proposed, mission_id="M2"),
                             created_at=_TS)
    _check("M1 chain independent and valid", led.verify_mission_chain("M1").valid is True)
    _check("M2 chain independent and valid", led.verify_mission_chain("M2").valid is True)
    _check("M1 has 1 record, M2 has 2",
           len(led.list_mission_records("M1")) == 1 and len(led.list_mission_records("M2")) == 2)


# -- append-only + duplicate protection -------------------------------------


def test_no_update_or_delete_surface() -> None:
    api = set(dir(MissionAuditLedger))
    banned = {name for name in api if not name.startswith("_") and ("update" in name or "delete" in name)}
    _check("ledger exposes no update/delete methods", not banned, str(banned))
    path = os.path.join(_API_DIR, "harness", "audit_ledger.py")
    with open(path, "r", encoding="utf-8") as fh:
        src = fh.read().upper()
    _check("no SQL UPDATE outside PRAGMA", "UPDATE MISSION_AUDIT_RECORDS" not in src)
    _check("no SQL DELETE", "DELETE FROM" not in src)


def test_duplicate_append_protection() -> None:
    led = _ledger()
    _open_and_seed(led)
    ev = _event("propose", MissionState.gathering, MissionState.proposed)
    led.append_mission_event(ev, created_at=_TS)
    raised = False
    try:
        led.append_mission_event(ev, created_at=_TS)  # identical logical record
    except DuplicateRecordError:
        raised = True
    _check("duplicate identical append rejected", raised)
    _check("no partial/extra record persisted (still 2)", len(led.list_mission_records("M1")) == 2)


def test_duplicate_sequence_constraint_exists() -> None:
    path = _tmp_db()
    led = MissionAuditLedger(path)
    _open_and_seed(led)
    # Attempt to force a duplicate (mission_id, sequence_number) via a raw insert.
    raised = False
    try:
        led._conn.execute(
            "INSERT INTO mission_audit_records (ledger_record_id, schema_version, mission_id, "
            "mission_version, record_type, sequence_number, correlation_id, occurred_at, actor, "
            "payload_hash, canonical_payload, previous_record_hash, record_hash, decision_ref, created_at) "
            "VALUES ('LR-DUP','1.0','M1','v1','mission_transition',1,'c','t','a','h','{}','0','r',NULL,'t')"
        )
        led._conn.commit()
    except sqlite3.IntegrityError:
        raised = True
    _check("UNIQUE(mission_id, sequence_number) prevents duplicate sequence", raised)
    led.close(); os.remove(path)


def test_transaction_rollback_on_failure() -> None:
    led = _ledger()
    _open_and_seed(led)
    before = len(led.list_mission_records("M1"))
    # A malformed / duplicate append must not leave a partial record.
    ev = _event("propose", MissionState.gathering, MissionState.proposed)
    led.append_mission_event(ev, created_at=_TS)
    try:
        led.append_mission_event(ev, created_at=_TS)
    except DuplicateRecordError:
        pass
    _check("rollback leaves exactly one new record", len(led.list_mission_records("M1")) == before + 1)
    _check("chain still valid after failed append", led.verify_mission_chain("M1").valid is True)


def test_injected_timestamps_retained() -> None:
    led = _ledger()
    _open_and_seed(led)
    rec = led.list_mission_records("M1")[0]
    _check("occurred_at retained", rec.occurred_at == _TS)
    _check("created_at retained", rec.created_at == _TS)


# -- durable idempotency ----------------------------------------------------


def test_idempotency_same_payload_returns_stored_receipt() -> None:
    led = _ledger()
    _open_and_seed(led)
    r1 = led.append_action_receipt(_receipt(), _approval(), mission_version=_VERSION,
                                   idempotency_key="idem-1", correlation_id="c", occurred_at=_TS,
                                   actor="amit", created_at=_TS)
    r2 = led.append_action_receipt(_receipt(), _approval(), mission_version=_VERSION,
                                   idempotency_key="idem-1", correlation_id="c", occurred_at=_TS,
                                   actor="amit", created_at="2026-07-14T23:59:59Z")
    _check("second append is a replay", r2.replayed is True)
    _check("replay returns same ledger record", r1.ledger_record.ledger_record_id == r2.ledger_record.ledger_record_id)
    _check("only one receipt record persisted",
           len([r for r in led.list_mission_records("M1") if r.record_type == "simulated_action_receipt"]) == 1)


def test_idempotency_different_payload_fails() -> None:
    led = _ledger()
    _open_and_seed(led)
    led.append_action_receipt(_receipt(), _approval(), mission_version=_VERSION,
                              idempotency_key="idem-1", correlation_id="c", occurred_at=_TS,
                              actor="amit", created_at=_TS)
    other_hash = "sha256:different"
    raised = False
    try:
        led.append_action_receipt(_receipt(payload_hash=other_hash), _approval(payload_hash=other_hash),
                                  mission_version=_VERSION, idempotency_key="idem-1", correlation_id="c",
                                  occurred_at=_TS, actor="amit", created_at=_TS)
    except IdempotencyConflictError:
        raised = True
    _check("idempotency collision with different payload fails closed", raised)


def test_idempotency_survives_reopen() -> None:
    path = _tmp_db()
    led = MissionAuditLedger(path)
    _open_and_seed(led)
    led.append_action_receipt(_receipt(), _approval(), mission_version=_VERSION,
                              idempotency_key="idem-1", correlation_id="c", occurred_at=_TS,
                              actor="amit", created_at=_TS)
    led.close()
    led2 = MissionAuditLedger(path)
    found = led2.find_receipt_by_idempotency_key("M1", "idem-1")
    _check("idempotent receipt survives reopen", found is not None and found.receipt_id == "RCP-1")
    # A replay after reopen must still be recognized, not duplicated.
    res = led2.append_action_receipt(_receipt(), _approval(), mission_version=_VERSION,
                                     idempotency_key="idem-1", correlation_id="c", occurred_at=_TS,
                                     actor="amit", created_at=_TS)
    _check("replay after reopen recognized", res.replayed is True)
    led2.close(); os.remove(path)


def test_idempotency_mission_scoped_isolation() -> None:
    led = _ledger()
    _open_and_seed(led, "M1")
    _open_and_seed(led, "M2")
    led.append_action_receipt(_receipt(mission_id="M1"), _approval(mission_id="M1"),
                              mission_version=_VERSION, idempotency_key="shared", correlation_id="c",
                              occurred_at=_TS, actor="amit", created_at=_TS)
    # Same idempotency key on a DIFFERENT mission must not collide.
    res = led.append_action_receipt(_receipt(mission_id="M2", audit_ref="audit://M2/1"),
                                    _approval(mission_id="M2"), mission_version=_VERSION,
                                    idempotency_key="shared", correlation_id="c", occurred_at=_TS,
                                    actor="amit", created_at=_TS)
    _check("same key on different mission does not collide", res.replayed is False)
    _check("M1 receipt independent of M2",
           led.find_receipt_by_idempotency_key("M1", "shared").mission_id == "M1"
           and led.find_receipt_by_idempotency_key("M2", "shared").mission_id == "M2")


# -- audit_ref mapping + receipt/approval binding ---------------------------


def test_audit_ref_maps_to_ledger_record() -> None:
    led = _ledger()
    _open_and_seed(led)
    res = led.append_action_receipt(_receipt(), _approval(), mission_version=_VERSION,
                                    idempotency_key="idem-1", correlation_id="c", occurred_at=_TS,
                                    actor="amit", created_at=_TS)
    cur = led._conn.execute(
        "SELECT ledger_record_id, receipt_id, approved_payload_hash FROM audit_refs "
        "WHERE mission_id = ? AND audit_ref = ?", ("M1", "audit://M1/1"))
    row = cur.fetchone()
    _check("audit_ref maps to immutable ledger_record_id",
           row is not None and row["ledger_record_id"] == res.ledger_record.ledger_record_id)
    _check("audit_ref mapping records receipt id + payload hash",
           row["receipt_id"] == "RCP-1" and row["approved_payload_hash"] == _PH)


def test_receipt_binding_guards() -> None:
    led = _ledger(); _open_and_seed(led)
    # Version mismatch.
    _check("append blocked on approval version mismatch",
           _raises(ApprovalMismatchError, lambda: led.append_action_receipt(
               _receipt(), _approval(mission_version="v2"), mission_version=_VERSION,
               idempotency_key="k1", correlation_id="c", occurred_at=_TS, actor="a", created_at=_TS)))
    # Payload hash mismatch.
    _check("append blocked on receipt/approval hash mismatch",
           _raises(PayloadHashMismatchError, lambda: led.append_action_receipt(
               _receipt(payload_hash="sha256:X"), _approval(), mission_version=_VERSION,
               idempotency_key="k2", correlation_id="c", occurred_at=_TS, actor="a", created_at=_TS)))
    # Rejected approval.
    _check("rejected approval cannot persist a receipt",
           _raises(RejectedApprovalError, lambda: led.append_action_receipt(
               _receipt(), _approval(outcome=ApprovalOutcome.rejected), mission_version=_VERSION,
               idempotency_key="k3", correlation_id="c", occurred_at=_TS, actor="a", created_at=_TS)))


def test_non_simulated_receipt_impossible() -> None:
    from pydantic import ValidationError
    raised = False
    try:
        ActionReceipt(receipt_id="X", mission_id="M1", recommendation_id="R", action_type="a",
                      target_type="account", target_id="A", tool_id="t", approved_payload_hash=_PH,
                      simulated=False, summary="s", audit_ref="a", created_at=_TS)
    except ValidationError:
        raised = True
    _check("simulated=False receipt remains impossible", raised)


# -- validation failures ----------------------------------------------------


def test_missing_mission_id_and_version_fail() -> None:
    led = _ledger()
    _check("missing mission_id fails closed",
           _raises(MissingMissionIdError, lambda: led.append_verification(
               _verification(), mission_id="", mission_version=_VERSION, correlation_id="c",
               occurred_at=_TS, actor="a", created_at=_TS)))
    _check("invalid mission_version fails closed",
           _raises(InvalidMissionVersionError, lambda: led.append_verification(
               _verification(), mission_id="M1", mission_version="  ", correlation_id="c",
               occurred_at=_TS, actor="a", created_at=_TS)))


# -- bundle export ----------------------------------------------------------


def _full_mission(led: MissionAuditLedger, mission_id="M1") -> None:
    _open_and_seed(led, mission_id)
    led.append_mission_event(_event("begin_gathering", MissionState.opened, MissionState.gathering,
                                    mission_id=mission_id), created_at=_TS)
    led.append_mission_event(_event("verification_passed", MissionState.verifying, MissionState.verified,
                                    mission_id=mission_id), created_at=_TS)
    led.append_verification(_verification(), mission_id=mission_id, mission_version=_VERSION,
                            correlation_id=f"corr-{mission_id}", occurred_at=_TS, actor="s", created_at=_TS)
    led.append_approval_request(_request() if mission_id == "M1" else _request(), correlation_id="c",
                                occurred_at=_TS, actor="s", created_at=_TS)
    led.append_approval_decision(_approval(mission_id=mission_id), correlation_id="c", occurred_at=_TS,
                                 created_at=_TS)
    led.append_action_receipt(_receipt(mission_id=mission_id, audit_ref=f"audit://{mission_id}/1"),
                              _approval(mission_id=mission_id), mission_version=_VERSION,
                              idempotency_key=f"idem-{mission_id}", correlation_id="c", occurred_at=_TS,
                              actor="amit", created_at=_TS)
    led.append_outcome_verification(_verification(), mission_id=mission_id, mission_version=_VERSION,
                                    correlation_id="c", occurred_at=_TS, actor="s", created_at=_TS)
    led.append_mission_closed(mission_id=mission_id, mission_version=_VERSION, correlation_id="c",
                              occurred_at=_TS, actor="s", created_at=_TS, outcome_status="simulated")


def test_full_renewal_persisted_and_chain_valid() -> None:
    led = _ledger()
    _full_mission(led)
    chain = led.verify_mission_chain("M1")
    _check("full renewal mission chain is valid", chain.valid is True)
    bundle = led.export_mission_audit_bundle("M1")
    _check("bundle has canonical account",
           bundle.canonical_account and bundle.canonical_account["ventureOsId"] == "VOS-CUREFOODS")
    _check("bundle has selected template", bundle.selected_template_id == "renewal-risk-parallel-v1")
    _check("bundle has approval request + decision",
           bundle.approval_request is not None and bundle.approval_decision is not None)
    _check("bundle has simulated action receipt",
           bundle.action_receipt is not None and bundle.action_receipt["simulated"] is True)
    _check("bundle has outcome verification", bundle.outcome_verification is not None)
    _check("bundle carries protected decision-ledger ref (link only)",
           bundle.decision_ledger_ref == "decisionLedger://run/xyz")
    _check("bundle chain verdict valid", bundle.chain.valid is True)


def test_deterministic_bundle_export() -> None:
    a = _ledger(); _full_mission(a)
    b = _ledger(); _full_mission(b)
    ja = a.export_mission_audit_bundle("M1").model_dump_json(by_alias=True)
    jb = b.export_mission_audit_bundle("M1").model_dump_json(by_alias=True)
    _check("bundle export is byte-identical for identical records", ja == jb)


def test_blocked_revision_path_persisted() -> None:
    led = _ledger()
    _open_and_seed(led)
    led.append_mission_event(_event("begin_gathering", MissionState.opened, MissionState.gathering),
                             created_at=_TS)
    led.append_mission_event(_event("verification_failed", MissionState.verifying, MissionState.blocked),
                             created_at=_TS)
    led.append_mission_event(_event("revision_requested", MissionState.blocked, MissionState.gathering),
                             created_at=_TS)
    recs = [r for r in led.list_mission_records("M1")]
    payloads = [r.canonical_payload for r in recs]
    _check("blocked event persisted", any('"blocked"' in p for p in payloads))
    _check("revision_requested event persisted", any("revision_requested" in p for p in payloads))
    _check("blocked/revision chain valid and auditable", led.verify_mission_chain("M1").valid is True)


# -- no protected / network / clock -----------------------------------------


def test_no_protected_or_network_or_clock_in_source() -> None:
    path = os.path.join(_API_DIR, "harness", "audit_ledger.py")
    with open(path, "r", encoding="utf-8") as fh:
        src = fh.read()
    banned = [
        "import ledger_service", "from services", "DecisionLedger(", "import requests", "urllib",
        "httpx", "socket", "smtplib", "boto3", "psycopg", "aiohttp", "datetime", "time.time(",
        ".now(", "utcnow",
    ]
    hits = [tok for tok in banned if tok in src]
    _check("audit ledger has no protected/network/clock dependency", not hits, str(hits))


def _raises(exc_type, fn) -> bool:
    try:
        fn()
        return False
    except exc_type:
        return True


_TESTS = [
    test_append_and_retrieve_each_record_type,
    test_deterministic_sequence_numbering,
    test_deterministic_canonical_and_hash,
    test_chain_links_and_verifies,
    test_tampering_is_detected,
    test_two_missions_separate_chains,
    test_no_update_or_delete_surface,
    test_duplicate_append_protection,
    test_duplicate_sequence_constraint_exists,
    test_transaction_rollback_on_failure,
    test_injected_timestamps_retained,
    test_idempotency_same_payload_returns_stored_receipt,
    test_idempotency_different_payload_fails,
    test_idempotency_survives_reopen,
    test_idempotency_mission_scoped_isolation,
    test_audit_ref_maps_to_ledger_record,
    test_receipt_binding_guards,
    test_non_simulated_receipt_impossible,
    test_missing_mission_id_and_version_fail,
    test_full_renewal_persisted_and_chain_valid,
    test_deterministic_bundle_export,
    test_blocked_revision_path_persisted,
    test_no_protected_or_network_or_clock_in_source,
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
    print(f"\nAudit ledger: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
