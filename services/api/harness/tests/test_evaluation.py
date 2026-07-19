"""Deterministic mission evaluation tests (Release 2.2, Commit 7).

Plain-Python, no pytest. Exercises the full evaluation composition over the eight
canonical scenarios (A-H), the scorecard, deterministic result hashing, audit
completeness for successful missions, auditability of blocked/rejected paths, and
the offline/no-PersonaResponse guarantees.

Run directly:  python services/api/harness/tests/test_evaluation.py
"""

from __future__ import annotations

import json
import os
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, "..", ".."))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from harness.audit_ledger import MissionAuditLedger  # noqa: E402
from harness.contracts import ActionReceipt  # noqa: E402
from harness.evaluation import (  # noqa: E402
    FAIL_AMBIGUOUS_IDENTITY,
    FAIL_APPROVAL_PAYLOAD_MISMATCH,
    FAIL_APPROVAL_REJECTED,
    FAIL_NO_MATCHING_TEMPLATE,
    FAIL_VERIFICATION,
    STATUS_BLOCKED,
    STATUS_PASSED,
    STATUS_REJECTED,
    STATUS_REVISION_REQUIRED,
    MissionEvaluationResult,
    approval_payload_mismatch,
    approval_rejected,
    ambiguous_account_blocked,
    default_injected_timestamps,
    default_scenarios,
    evaluate_mission_scenario,
    idempotent_replay,
    renewal_risk_happy_path,
    support_escalation_happy_path,
    unsupported_signal_blocked,
    verification_failed_revision,
)

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


def _evaluate(scenario, ts=None) -> tuple[MissionEvaluationResult, MissionAuditLedger]:
    ts = ts or default_injected_timestamps()
    ledger = MissionAuditLedger(":memory:")
    result = evaluate_mission_scenario(scenario, ledger, ts)
    return result, ledger


# -- scenario A: renewal happy path -----------------------------------------


def test_renewal_happy_path_reaches_closed() -> None:
    r, led = _evaluate(renewal_risk_happy_path())
    _check("A renewal final_status passed", r.final_status == STATUS_PASSED, r.final_status)
    _check("A lifecycle reaches closed", r.lifecycle_status == "closed", str(r.lifecycle_status))
    _check("A renewal template selected", r.selected_template_id == "renewal-risk-parallel-v1")
    _check("A identity resolved", r.identity_resolution_status == "resolved")
    _check("A canonical is Curefoods", r.canonical_account["ventureOsId"] == "VOS-CUREFOODS")
    _check("A produces a simulated receipt",
           r.simulated_action_receipt is not None and r.simulated_action_receipt.simulated is True)
    _check("A execution eligible", r.execution_eligible is True)
    _check("A no failure code", r.failure_code is None)
    _check("A audit chain valid", r.audit_chain_valid is True)
    led.close()


# -- scenario B: support happy path -----------------------------------------


def test_support_happy_path_reaches_closed() -> None:
    r, led = _evaluate(support_escalation_happy_path())
    _check("B support final_status passed", r.final_status == STATUS_PASSED, r.final_status)
    _check("B lifecycle reaches closed", r.lifecycle_status == "closed")
    _check("B support template selected",
           r.selected_template_id == "support-escalation-sequential-v1", str(r.selected_template_id))
    _check("B produces a simulated receipt", r.simulated_action_receipt is not None)
    _check("B audit chain valid", r.audit_chain_valid is True)
    led.close()


# -- scenario C: unsupported signal -----------------------------------------


def test_unsupported_signal_stops_before_planning() -> None:
    r, led = _evaluate(unsupported_signal_blocked())
    _check("C final_status blocked", r.final_status == STATUS_BLOCKED, r.final_status)
    _check("C failure_code no_matching_template", r.failure_code == FAIL_NO_MATCHING_TEMPLATE)
    _check("C no template selected", r.selected_template_id is None)
    _check("C no plan built", r.mission_plan is None)
    _check("C no approval request", r.approval_request is None)
    _check("C no receipt", r.simulated_action_receipt is None)
    present = {x.record_type for x in led.list_mission_records("M-UNSUPPORTED-1")}
    _check("C intake persisted", "mission_intake" in present)
    _check("C template selection persisted", "template_selection_result" in present)
    _check("C mission_blocked persisted", "mission_blocked" in present)
    _check("C no mission_opened persisted", "mission_opened" not in present)
    _check("C no approval_request persisted", "approval_request" not in present)
    _check("C no receipt persisted", "simulated_action_receipt" not in present)
    led.close()


# -- scenario D: ambiguous identity -----------------------------------------


def test_ambiguous_identity_stops_before_selection() -> None:
    r, led = _evaluate(ambiguous_account_blocked())
    _check("D final_status blocked", r.final_status == STATUS_BLOCKED, r.final_status)
    _check("D failure_code ambiguous_identity", r.failure_code == FAIL_AMBIGUOUS_IDENTITY)
    _check("D identity not resolved", r.identity_resolution_status == "blocked")
    _check("D no template selected", r.selected_template_id is None)
    _check("D no plan built", r.mission_plan is None)
    _check("D no approval or receipt",
           r.approval_request is None and r.simulated_action_receipt is None)
    present = {x.record_type for x in led.list_mission_records("M-AMBIGUOUS-1")}
    _check("D intake persisted", "mission_intake" in present)
    _check("D identity resolution persisted", "identity_resolution_result" in present)
    _check("D mission_blocked persisted", "mission_blocked" in present)
    _check("D stops before selection (no template_selection_result)",
           "template_selection_result" not in present)
    _check("D no mission_opened persisted", "mission_opened" not in present)
    _check("D no receipt persisted", "simulated_action_receipt" not in present)
    led.close()


# -- scenario E: verification failed -> revision ----------------------------


def test_verification_failure_produces_blocked_and_revision() -> None:
    r, led = _evaluate(verification_failed_revision())
    _check("E final_status revision_required", r.final_status == STATUS_REVISION_REQUIRED, r.final_status)
    _check("E failure_code verification_failed", r.failure_code == FAIL_VERIFICATION)
    _check("E no receipt created", r.simulated_action_receipt is None)
    event_types = [e.event_type for e in r.lifecycle_events]
    _check("E has verification_failed event", "verification_failed" in event_types, str(event_types))
    _check("E has revision_requested event", "revision_requested" in event_types, str(event_types))
    # blocked -> gathering is the ONLY corrective edge; the mission returns to gathering.
    _check("E returns to gathering after revision", r.lifecycle_status == "gathering", str(r.lifecycle_status))
    _check("E blocked path remains auditable (chain valid)", r.audit_chain_valid is True)
    _check("E audit chain verifies in ledger",
           led.verify_mission_chain("M-REVISION-1").valid is True)
    led.close()


def test_no_implicit_retry_in_revision_path() -> None:
    r, led = _evaluate(verification_failed_revision())
    # There must be exactly one revision_requested event -- no implicit retries.
    revisions = [e for e in r.lifecycle_events if e.event_type == "revision_requested"]
    _check("E exactly one revision_requested (no implicit retry)", len(revisions) == 1, str(len(revisions)))
    led.close()


# -- scenario F: approval rejected ------------------------------------------


def test_rejection_produces_no_receipt() -> None:
    r, led = _evaluate(approval_rejected())
    _check("F final_status rejected", r.final_status == STATUS_REJECTED, r.final_status)
    _check("F failure_code approval_rejected", r.failure_code == FAIL_APPROVAL_REJECTED)
    _check("F lifecycle ends rejected", r.lifecycle_status == "rejected", str(r.lifecycle_status))
    _check("F approval decision recorded and rejected",
           r.approval_decision is not None and r.approval_decision.outcome.value == "rejected")
    _check("F no receipt created", r.simulated_action_receipt is None)
    receipts = [x for x in led.list_mission_records("M-REJECTED-1")
                if x.record_type == "simulated_action_receipt"]
    _check("F no receipt persisted", len(receipts) == 0)
    _check("F rejected path remains auditable", r.audit_chain_valid is True)
    led.close()


# -- scenario G: approval payload mismatch ----------------------------------


def test_payload_mismatch_produces_no_receipt() -> None:
    r, led = _evaluate(approval_payload_mismatch())
    _check("G final_status blocked", r.final_status == STATUS_BLOCKED, r.final_status)
    _check("G failure_code approval_payload_mismatch", r.failure_code == FAIL_APPROVAL_PAYLOAD_MISMATCH)
    _check("G no receipt created", r.simulated_action_receipt is None)
    _check("G approval_valid is false", r.scorecard.approval_valid is False)
    receipts = [x for x in led.list_mission_records("M-MISMATCH-1")
                if x.record_type == "simulated_action_receipt"]
    _check("G no receipt persisted", len(receipts) == 0)
    _check("G mismatch path remains auditable", r.audit_chain_valid is True)
    led.close()


# -- scenario H: idempotent replay ------------------------------------------


def test_idempotent_replay_does_not_duplicate_receipt() -> None:
    r, led = _evaluate(idempotent_replay())
    _check("H final_status passed", r.final_status == STATUS_PASSED, r.final_status)
    _check("H produces a receipt", r.simulated_action_receipt is not None)
    receipts = [x for x in led.list_mission_records("M-REPLAY-1")
                if x.record_type == "simulated_action_receipt"]
    _check("H exactly one receipt record after replay", len(receipts) == 1, str(len(receipts)))
    _check("H chain remains valid after replay", led.verify_mission_chain("M-REPLAY-1").valid is True)
    led.close()


# -- scorecard correctness --------------------------------------------------


def test_scorecard_fields_correct() -> None:
    # Happy path: everything true.
    r, led = _evaluate(renewal_risk_happy_path())
    sc = r.scorecard.model_dump()
    all_true = all(sc.values())
    _check("scorecard all-true for happy path", all_true, str({k: v for k, v in sc.items() if not v}))
    _check("scorecard simulated_only true", r.scorecard.simulated_only is True)
    _check("scorecard no_external_action true", r.scorecard.no_external_action is True)
    _check("scorecard audit_complete true", r.scorecard.audit_complete is True)
    led.close()
    # Unsupported: identity resolved but template not selected, not complete.
    r2, led2 = _evaluate(unsupported_signal_blocked())
    _check("scorecard identity_resolved true (C)", r2.scorecard.identity_resolved is True)
    _check("scorecard template_selected false (C)", r2.scorecard.template_selected is False)
    _check("scorecard approval_valid false (C)", r2.scorecard.approval_valid is False)
    led2.close()
    # Ambiguous: identity not resolved.
    r3, led3 = _evaluate(ambiguous_account_blocked())
    _check("scorecard identity_resolved false (D)", r3.scorecard.identity_resolved is False)
    led3.close()


# -- determinism ------------------------------------------------------------


def test_result_hash_is_deterministic() -> None:
    sc = renewal_risk_happy_path()
    a, la = _evaluate(sc)
    b, lb = _evaluate(sc)
    _check("hash present", a.result_hash.startswith("sha256:"))
    _check("same inputs -> same hash", a.result_hash == b.result_hash, f"{a.result_hash} vs {b.result_hash}")
    la.close(); lb.close()


def test_same_inputs_byte_identical_json() -> None:
    sc = renewal_risk_happy_path()
    a, la = _evaluate(sc)
    b, lb = _evaluate(sc)
    _check("byte-identical JSON for identical inputs",
           a.model_dump_json(by_alias=True) == b.model_dump_json(by_alias=True))
    la.close(); lb.close()


def test_different_inputs_produce_different_hashes() -> None:
    a, la = _evaluate(renewal_risk_happy_path())
    b, lb = _evaluate(support_escalation_happy_path())
    _check("different missions -> different hashes", a.result_hash != b.result_hash)
    # Blocked scenarios also differ from each other.
    c, lc = _evaluate(unsupported_signal_blocked())
    d, ld = _evaluate(ambiguous_account_blocked())
    _check("different blocked missions -> different hashes", c.result_hash != d.result_hash)
    for ledger in (la, lb, lc, ld):
        ledger.close()


# -- audit completeness -----------------------------------------------------


def test_complete_audit_bundle_for_successful_missions() -> None:
    for scenario in (renewal_risk_happy_path(), support_escalation_happy_path()):
        r, led = _evaluate(scenario)
        _check(f"{scenario.scenario_id} bundle present", r.audit_bundle is not None)
        bundle = r.audit_bundle
        _check(f"{scenario.scenario_id} bundle has canonical account",
               bundle.get("canonicalAccount") is not None)
        _check(f"{scenario.scenario_id} bundle has selected template",
               bundle.get("selectedTemplateId") is not None)
        _check(f"{scenario.scenario_id} bundle has approval request + decision",
               bundle.get("approvalRequest") is not None and bundle.get("approvalDecision") is not None)
        _check(f"{scenario.scenario_id} bundle has simulated receipt",
               bundle.get("actionReceipt") is not None
               and bundle["actionReceipt"]["simulated"] is True)
        _check(f"{scenario.scenario_id} bundle has outcome verification",
               bundle.get("outcomeVerification") is not None)
        record_types = {rec["recordType"] for rec in bundle.get("records", [])}
        expected = {
            "mission_opened", "mission_transition", "verification_result", "approval_request",
            "approval_decision", "simulated_action_receipt", "outcome_verification", "mission_closed",
        }
        _check(f"{scenario.scenario_id} all 8 record types persisted",
               expected.issubset(record_types), str(sorted(record_types)))
        _check(f"{scenario.scenario_id} audit_complete true", r.scorecard.audit_complete is True)
        led.close()


def test_successful_audit_chains_verify() -> None:
    r, led = _evaluate(renewal_risk_happy_path())
    _check("successful chain verifies in ledger", led.verify_mission_chain("M-RENEWAL-1").valid is True)
    _check("bundle chain verdict valid", r.audit_bundle["chain"]["valid"] is True)
    led.close()


def test_blocked_cases_remain_auditable() -> None:
    # E, F, G open a mission and must remain chain-valid; C, D never open one.
    for scenario, mid in (
        (verification_failed_revision(), "M-REVISION-1"),
        (approval_rejected(), "M-REJECTED-1"),
        (approval_payload_mismatch(), "M-MISMATCH-1"),
    ):
        r, led = _evaluate(scenario)
        _check(f"{scenario.scenario_id} chain valid", led.verify_mission_chain(mid).valid is True)
        _check(f"{scenario.scenario_id} bundle present and auditable",
               r.audit_bundle is not None and r.audit_bundle["chain"]["valid"] is True)
        led.close()


# -- all eight scenarios run + classification -------------------------------


def test_all_eight_scenarios_classified() -> None:
    ts = default_injected_timestamps()
    expected = {
        "renewal-risk-happy-path": STATUS_PASSED,
        "support-escalation-happy-path": STATUS_PASSED,
        "unsupported-signal-blocked": STATUS_BLOCKED,
        "ambiguous-account-blocked": STATUS_BLOCKED,
        "verification-failed-revision": STATUS_REVISION_REQUIRED,
        "approval-rejected": STATUS_REJECTED,
        "approval-payload-mismatch": STATUS_BLOCKED,
        "idempotent-replay": STATUS_PASSED,
    }
    scenarios = default_scenarios()
    _check("exactly eight canonical scenarios", len(scenarios) == 8, str(len(scenarios)))
    for scenario in scenarios:
        led = MissionAuditLedger(":memory:")
        r = evaluate_mission_scenario(scenario, led, ts)
        _check(f"{scenario.scenario_id} -> {expected[scenario.scenario_id]}",
               r.final_status == expected[scenario.scenario_id],
               f"got {r.final_status}")
        led.close()


# -- output purity ----------------------------------------------------------


def test_no_personaresponse_in_output() -> None:
    r, led = _evaluate(renewal_risk_happy_path())
    as_json = r.model_dump_json(by_alias=True)
    _check("no 'persona' anywhere in evaluation output", "persona" not in as_json.lower())
    fields = set(MissionEvaluationResult.model_fields)
    _check("result model has no persona field",
           not any("persona" in f.lower() for f in fields), str(fields))
    led.close()


def test_no_forbidden_imports_in_source() -> None:
    path = os.path.join(_API_DIR, "harness", "evaluation.py")
    with open(path, "r", encoding="utf-8") as fh:
        src = fh.read()
    banned = [
        "fastapi", "flask", "starlette", "uvicorn", "import requests", "urllib", "httpx",
        "socket", "smtplib", "boto3", "psycopg", "aiohttp", "import ledger_service",
        "PersonaResponseView", "PersonaResponse(",
        "datetime", "time.time(", ".now(", "utcnow", "conversation_runtime",
    ]
    hits = [tok for tok in banned if tok in src]
    _check("no HTTP/frontend/network/CRM/provider/clock/protected import", not hits, str(hits))


def test_receipt_is_action_receipt_not_persona() -> None:
    r, led = _evaluate(renewal_risk_happy_path())
    _check("receipt is an ActionReceipt", isinstance(r.simulated_action_receipt, ActionReceipt))
    led.close()


# --- Commit 7b: durable audit for early / blocked mission outcomes -------------


def _record_types(led, mission_id) -> list[str]:
    return [x.record_type for x in led.list_mission_records(mission_id)]


def test_unsupported_creates_durable_audit_bundle() -> None:
    r, led = _evaluate(unsupported_signal_blocked())
    _check("7b C audit_bundle present", r.audit_bundle is not None)
    _check("7b C audit_chain_valid", r.audit_chain_valid is True)
    _check("7b C audit_complete", r.scorecard.audit_complete is True)
    bundle = r.audit_bundle or {}
    _check("7b C bundle failure_code no_matching_template",
           bundle.get("failureCode") == FAIL_NO_MATCHING_TEMPLATE, str(bundle.get("failureCode")))
    _check("7b C bundle no plan/agents/tools/approval/receipt",
           bundle.get("missionPlan") in (None, {})
           and bundle.get("approvalRequest") is None
           and bundle.get("simulatedActionReceipt") is None)
    led.close()


def test_ambiguous_creates_durable_audit_bundle() -> None:
    r, led = _evaluate(ambiguous_account_blocked())
    _check("7b D audit_bundle present", r.audit_bundle is not None)
    _check("7b D audit_chain_valid", r.audit_chain_valid is True)
    _check("7b D audit_complete", r.scorecard.audit_complete is True)
    bundle = r.audit_bundle or {}
    _check("7b D bundle failure_code ambiguous_identity",
           bundle.get("failureCode") == FAIL_AMBIGUOUS_IDENTITY, str(bundle.get("failureCode")))
    _check("7b D identity evidence/conflicts present",
           bundle.get("identityResolution") is not None)
    _check("7b D no fabricated canonical account",
           bundle.get("canonicalAccount") is None, str(bundle.get("canonicalAccount")))
    _check("7b D stops before template selection",
           bundle.get("templateSelection") is None)
    led.close()


def test_early_blocked_paths_have_valid_hash_chains() -> None:
    for scenario in (unsupported_signal_blocked(), ambiguous_account_blocked()):
        r, led = _evaluate(scenario)
        chain = led.verify_mission_chain(scenario.mission_id)
        _check(f"7b {scenario.scenario_id} chain valid",
               chain.valid and chain.length > 0, f"len={chain.length}")
        led.close()


def test_no_blocked_path_executes_sandbox() -> None:
    for scenario in (unsupported_signal_blocked(), ambiguous_account_blocked(),
                     approval_rejected(), approval_payload_mismatch(),
                     verification_failed_revision()):
        r, led = _evaluate(scenario)
        present = set(_record_types(led, scenario.mission_id))
        _check(f"7b {scenario.scenario_id} no receipt record",
               "simulated_action_receipt" not in present)
        _check(f"7b {scenario.scenario_id} no receipt object",
               r.simulated_action_receipt is None)
        led.close()


def test_blocked_bundle_survives_ledger_reopen() -> None:
    ts = default_injected_timestamps()
    tmp = tempfile.mkdtemp()
    db_path = os.path.join(tmp, "audit_reopen.sqlite")
    scenario = unsupported_signal_blocked()
    led = MissionAuditLedger(db_path)
    r1 = evaluate_mission_scenario(scenario, led, ts)
    before = r1.audit_bundle
    led.close()

    led2 = MissionAuditLedger(db_path)
    bundle2 = led2.export_mission_audit_bundle(scenario.mission_id)
    after = bundle2.model_dump(by_alias=True)
    chain = led2.verify_mission_chain(scenario.mission_id)
    _check("7b reopen chain valid", chain.valid and chain.length > 0)
    _check("7b reopen bundle byte-identical",
           json.dumps(before, sort_keys=True) == json.dumps(after, sort_keys=True))
    led2.close()


def test_rejected_and_mismatch_remain_auditable() -> None:
    for scenario, code in ((approval_rejected(), FAIL_APPROVAL_REJECTED),
                           (approval_payload_mismatch(), FAIL_APPROVAL_PAYLOAD_MISMATCH),
                           (verification_failed_revision(), FAIL_VERIFICATION)):
        r, led = _evaluate(scenario)
        _check(f"7b {scenario.scenario_id} audit_complete", r.scorecard.audit_complete is True)
        _check(f"7b {scenario.scenario_id} chain valid", r.audit_chain_valid is True)
        _check(f"7b {scenario.scenario_id} failure_code", r.failure_code == code, r.failure_code)
        present = set(_record_types(led, scenario.mission_id))
        _check(f"7b {scenario.scenario_id} intake recorded", "mission_intake" in present)
        led.close()


def test_successful_scenarios_still_reach_closed() -> None:
    for scenario in (renewal_risk_happy_path(), support_escalation_happy_path(),
                     idempotent_replay()):
        r, led = _evaluate(scenario)
        _check(f"7b {scenario.scenario_id} still passed", r.final_status == STATUS_PASSED,
               r.final_status)
        _check(f"7b {scenario.scenario_id} audit_complete", r.scorecard.audit_complete is True)
        led.close()


def test_determinism_with_early_audit_records() -> None:
    scenario = unsupported_signal_blocked()
    ts = default_injected_timestamps()
    led_a = MissionAuditLedger(":memory:")
    led_b = MissionAuditLedger(":memory:")
    ra = evaluate_mission_scenario(scenario, led_a, ts)
    rb = evaluate_mission_scenario(scenario, led_b, ts)
    _check("7b deterministic result hash", ra.result_hash == rb.result_hash)
    _check("7b deterministic bundle",
           json.dumps(ra.audit_bundle, sort_keys=True)
           == json.dumps(rb.audit_bundle, sort_keys=True))
    led_a.close()
    led_b.close()


_TESTS = [
    test_renewal_happy_path_reaches_closed,
    test_support_happy_path_reaches_closed,
    test_unsupported_signal_stops_before_planning,
    test_ambiguous_identity_stops_before_selection,
    test_verification_failure_produces_blocked_and_revision,
    test_no_implicit_retry_in_revision_path,
    test_rejection_produces_no_receipt,
    test_payload_mismatch_produces_no_receipt,
    test_idempotent_replay_does_not_duplicate_receipt,
    test_scorecard_fields_correct,
    test_result_hash_is_deterministic,
    test_same_inputs_byte_identical_json,
    test_different_inputs_produce_different_hashes,
    test_complete_audit_bundle_for_successful_missions,
    test_successful_audit_chains_verify,
    test_blocked_cases_remain_auditable,
    test_all_eight_scenarios_classified,
    test_no_personaresponse_in_output,
    test_no_forbidden_imports_in_source,
    test_receipt_is_action_receipt_not_persona,
    test_unsupported_creates_durable_audit_bundle,
    test_ambiguous_creates_durable_audit_bundle,
    test_early_blocked_paths_have_valid_hash_chains,
    test_no_blocked_path_executes_sandbox,
    test_blocked_bundle_survives_ledger_reopen,
    test_rejected_and_mismatch_remain_auditable,
    test_successful_scenarios_still_reach_closed,
    test_determinism_with_early_audit_records,
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
    print(f"\nEvaluation: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
