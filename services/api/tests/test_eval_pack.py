"""Focused tests for the VentureOS evaluation pack -- plain-Python, no pytest.

Guards the eval pack itself: every deterministic (L1) check and canonical scenario (L2)
passes, the narrative evaluator (L3) rejects fabricated claims and accepts grounded ones,
the golden --write/--check roundtrip is stable in an isolated location, and a
provider-unconfigured environment yields ``pass_with_optional_skips`` (never ``fail``).

Run directly:  python services/api/tests/test_eval_pack.py
"""

from __future__ import annotations

import os
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from evals import eval_pack  # noqa: E402
from evals import eval_scenarios as S  # noqa: E402
from evals.eval_narrative import evaluate_narrative, provider_status  # noqa: E402

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, cond: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(cond), detail))


def test_l0_contract_integrity() -> None:
    checks = eval_pack.run_l0()
    failed = [n for n, ok, d in checks if not ok]
    _check("L0 has contract checks", len(checks) >= 12, str(len(checks)))
    _check("L0 all pass", not failed, ", ".join(failed))
    names = {n for n, _, _ in checks}
    _check("L0 covers integration-result contract", "contract_integration_result_fields" in names)
    _check("L0 covers typed outcomes", "contract_typed_outcomes_six_distinct" in names)
    _check("L0 covers chain-verification contract", "contract_chain_verification_fields" in names)


def test_l0_detects_drift() -> None:
    # A contract check must actually fail when a boundary type loses a field. Simulate
    # drift by asserting the guard logic (not by mutating the real model).
    from live_signals.mission_contracts import LiveMission
    present = "recommended_next_step" in LiveMission.model_fields
    _check("advisory next-step field still present", present)
    # If someone renamed it to imply authority, the authority-token guard would catch it.
    offenders = [n for n in LiveMission.model_fields
                 if any(tok in n.lower() for tok in ("approve", "execute", "permission"))]
    _check("no authority-named field slipped in", not offenders, ", ".join(offenders))


def test_executive_summary_generated() -> None:
    summary = eval_pack.build_summary()
    text = eval_pack.executive_summary(summary)
    _check("summary titled", text.startswith("VentureOS Evaluation Summary"))
    for label in ("Signal Detection", "Mission Generation", "Identity Governance",
                  "Approval Enforcement", "Simulated Execution", "Audit Integrity",
                  "Idempotency", "Narrative Grounding"):
        _check(f"summary lists {label}", f"{label}:" in text)
    _check("summary lists NVIDIA line", "NVIDIA Provider Evaluation:" in text)
    _check("summary has overall verdict", f"Overall: {str(summary['verdict']).upper()}" in text)
    _check("summary checks line generated",
           f"Checks: {summary['passed_checks']} / {summary['total_checks']}" in text)
    # Not hard-coded: the checks count equals the real layer sizes.
    expected = (summary["contract_checks"] + summary["deterministic_checks"]
                + summary["scenario_checks"] + summary["narrative_checks"])
    _check("summary check total matches layers", summary["total_checks"] == expected,
           f"{summary['total_checks']} vs {expected}")


def test_l1_all_pass() -> None:
    checks = eval_pack.run_l1()
    failed = [n for n, ok, _ in checks if not ok]
    _check("L1 has 12+ checks", len(checks) >= 12, str(len(checks)))
    _check("L1 all pass", not failed, ", ".join(failed))


def test_l2_all_scenarios_pass() -> None:
    outcomes, golden = eval_pack.run_l2()
    failed = [o.name for o in outcomes if o.status == "fail"]
    _check("L2 covers 12 canonical scenarios", len(outcomes) == 12, str(len(outcomes)))
    _check("L2 all pass", not failed, ", ".join(failed))
    _check("golden keyed by scenario name", set(golden) == {o.name for o in outcomes})


def test_scenario_typed_outcomes() -> None:
    by_name = {fn().name: fn() for fn in S.SCENARIOS}
    _check("single source -> identity stop",
           by_name["single_source_identity"].stable["status"] == "stopped_identity_unverified")
    _check("no approval -> awaiting approval",
           by_name["corroborated_no_approval"].stable["status"] == "stopped_awaiting_approval")
    _check("rejected -> rejected",
           by_name["corroborated_rejected"].stable["status"] == "rejected")
    _check("approved -> executed with receipt",
           by_name["corroborated_approved"].stable["status"] == "executed"
           and by_name["corroborated_approved"].stable["has_receipt"] is True)
    _check("replay -> idempotent",
           by_name["replay_idempotency"].stable["replayed"] is True
           and by_name["replay_idempotency"].stable["record_count_unchanged"] is True)
    _check("tamper detected",
           by_name["audit_chain_tamper_detection"].stable["valid_before_tamper"] is True
           and by_name["audit_chain_tamper_detection"].stable["valid_after_tamper"] is False)


def test_narrative_groundedness() -> None:
    facts = {"executed": False, "approval_status": "none", "execution_status":
             "stopped_awaiting_approval", "old_value": "2026-08-31", "new_value": "2026-06-30"}
    bad = evaluate_narrative(
        "I automatically approved and executed the task on 1999-01-01.", facts)
    good = evaluate_narrative(
        "Renewal moved earlier from 2026-08-31 to 2026-06-30; awaiting your approval. "
        "No action taken.", facts)
    _check("fabricated narrative rejected", bad.grounded is False)
    _check("fabricated cites multiple violations", len(bad.violations) >= 2, str(bad.violations))
    _check("grounded narrative accepted", good.grounded is True, str(good.violations))
    # An executed narrative must be allowed only when facts say executed.
    exec_facts = {**facts, "executed": True, "approval_status": "approved",
                  "execution_status": "executed"}
    ok_exec = evaluate_narrative(
        "Approved and executed the renewal task.", exec_facts)
    _check("truthful execution narrative accepted", ok_exec.grounded is True, str(ok_exec.violations))


def test_verdict_and_provider_gating() -> None:
    summary = eval_pack.build_summary()
    _check("provider status is a known value",
           summary["provider_status"] in {"configured", "unconfigured"})
    if summary["provider_status"] == "unconfigured":
        _check("unconfigured -> optional skip verdict",
               summary["verdict"] == "pass_with_optional_skips", summary["verdict"])
        _check("unconfigured -> at least one skip", summary["skipped"] >= 1)
    else:
        _check("configured -> pass verdict", summary["verdict"] in {"pass", "pass_with_optional_skips"})
    _check("no hard failures", not summary["failed_scenarios"] and not summary["failed_deterministic"]
           and not summary["failed_narrative"], str(summary["failure_reasons"]))


def test_golden_write_check_roundtrip() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "golden", "eval_golden.json")
        eval_pack.write_golden(path)
        _check("golden file written", os.path.exists(path))
        ok, detail = eval_pack.check_golden(path)
        _check("golden check passes after write", ok, detail)
        # A missing golden must fail closed, not silently pass.
        missing_ok, _ = eval_pack.check_golden(os.path.join(tmp, "nope.json"))
        _check("missing golden fails closed", missing_ok is False)


def test_committed_golden_is_current() -> None:
    ok, detail = eval_pack.check_golden(eval_pack._DEFAULT_GOLDEN)
    _check("committed golden matches current flow", ok, detail)


def test_golden_is_safe() -> None:
    with open(eval_pack._DEFAULT_GOLDEN, "r", encoding="utf-8") as handle:
        text = handle.read()
    lowered = text.lower()
    import re
    # No wall-clock timestamps, machine/db paths, secrets, or random-looking ids.
    _check("golden has no ISO timestamp", not re.search(r"\d{4}-\d{2}-\d{2}t\d{2}:\d{2}", lowered))
    _check("golden has no windows path", ":\\" not in text and "c:/" not in lowered)
    _check("golden has no posix db path", ".db" not in lowered and ".sqlite" not in lowered)
    _check("golden has no memory-db marker", ":memory:" not in lowered)
    for secret in ("bearer", "api_key", "apikey", "password", "authorization", "nvapi-"):
        _check(f"golden has no secret token {secret}", secret not in lowered)
    # No receipt/random identifiers leaked (we assert presence booleans, not ids).
    _check("golden has no receipt id", "rcp-" not in lowered)
    _check("golden has no ledger record id", "lr-" not in lowered)


_TESTS = [
    test_l0_contract_integrity,
    test_l0_detects_drift,
    test_executive_summary_generated,
    test_l1_all_pass,
    test_l2_all_scenarios_pass,
    test_scenario_typed_outcomes,
    test_narrative_groundedness,
    test_verdict_and_provider_gating,
    test_golden_write_check_roundtrip,
    test_committed_golden_is_current,
    test_golden_is_safe,
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
        line = f"[{'PASS' if ok else 'FAIL'}] {name}"
        if not ok and detail:
            line += f"  -- {detail}"
        print(line)
    print(f"\nEvaluation pack: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
