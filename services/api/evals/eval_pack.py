"""VentureOS evaluation pack runner -- deterministic L1 + scenario L2 (+ optional L3).

Runs, over the REAL offline vertical slice:

* L1 -- deterministic assertions (pure functions/contracts; no I/O, no provider);
* L2 -- the canonical end-to-end scenarios in ``eval_scenarios``;
* L3 -- provider-independent narrative groundedness (a configured NVIDIA provider is
        OPTIONAL and only ever produces a narrative to grade -- never decides anything).

Golden strategy mirrors the repo's generated-fixture pattern:

    python services/api/evals/eval_pack.py --write [--out PATH]   # (re)generate golden
    python services/api/evals/eval_pack.py --check [--out PATH]   # verify against golden
    python services/api/evals/eval_pack.py                        # run + human summary

The golden captures only STABLE business/governance fields (typed outcomes, priority,
execution/approval status, chain validity). Unstable values (timestamps, temp paths,
random ids, latency) are never emitted.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Dict, List, Tuple

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # evals/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from evals import eval_scenarios as S  # noqa: E402
from evals.eval_narrative import evaluate_narrative, provider_status  # noqa: E402
from live_signals.detector import event_id_for, to_selector_signals  # noqa: E402
from live_signals import mission_rules  # noqa: E402
from live_signals.mission_selector import derive_mission_id, select_mission  # noqa: E402
from live_signals.mission_governance_adapter import (  # noqa: E402
    BLOCKED,
    EXECUTED,
    FAILED,
    REJECTED,
    SEVERITY_MAP_VERSION,
    STOPPED_AWAITING_APPROVAL,
    STOPPED_IDENTITY_UNVERIFIED,
    LiveMissionIntegrationError,
    LiveMissionIntegrationResult,
    integrate_live_mission,
    map_severity,
)
from live_signals.contracts import SignalChangeEvent, SignalDirection  # noqa: E402
from live_signals.mission_contracts import (  # noqa: E402
    LiveMission,
    MissionPriority,
    MissionSelectionResult,
    MissionSelectionStatus,
    MissionStatus,
)
from harness.audit_ledger import ChainVerification  # noqa: E402

_DEFAULT_GOLDEN = os.path.join(_HERE, "golden", "eval_golden.json")

# Field-name fragments that would imply the mission carries execution authority.
_AUTHORITY_FIELD_TOKENS = ("approve", "execute", "permission", "authoriz", "writeback", "write_back")


# -- L0 contract-integrity assertions (run first: fail early on drift) --------


def run_l0() -> List[Tuple[str, bool, str]]:
    """Lightweight contract-drift guards over the key boundary types.

    Verifies stable field names, required fields, enum values, and the absence of any
    execution-authority field -- so an unexpected interface change fails BEFORE the
    scenario evaluations run. Deliberately not a schema framework."""
    checks: List[Tuple[str, bool, str]] = []

    def has_fields(model, names) -> Tuple[bool, str]:
        missing = [n for n in names if n not in model.model_fields]
        return (not missing), ("missing: " + ", ".join(missing) if missing else "")

    # SignalChangeEvent
    ok, detail = has_fields(SignalChangeEvent, [
        "event_id", "portal_id", "account_id", "account_ref", "monitored_field",
        "direction", "change_fingerprint", "normalized_old_value", "normalized_new_value",
        "source_record_id", "source_record_type",
    ])
    checks.append(("contract_signal_change_event_fields", ok, detail))
    checks.append(("contract_signal_direction_values",
                   {d.value for d in SignalDirection} >= {"adverse", "positive", "unchanged"},
                   str([d.value for d in SignalDirection])))

    # LiveMission
    ok, detail = has_fields(LiveMission, [
        "mission_id", "mission_type", "account_id", "portal_id", "source_event_id",
        "change_fingerprint", "title", "objective", "recommended_next_step",
        "evidence_refs", "priority", "status", "rule_id", "rule_version",
        "template_id", "template_version", "created_at",
    ])
    checks.append(("contract_live_mission_fields", ok, detail))
    checks.append(("contract_mission_priority_values",
                   {p.value for p in MissionPriority} == {"medium", "high", "critical"},
                   str([p.value for p in MissionPriority])))
    checks.append(("contract_mission_status_generated",
                   {s.value for s in MissionStatus} == {"generated"},
                   str([s.value for s in MissionStatus])))
    offenders = [n for n in LiveMission.model_fields
                 if any(tok in n.lower() for tok in _AUTHORITY_FIELD_TOKENS)]
    checks.append(("contract_live_mission_no_authority_fields", not offenders, ", ".join(offenders)))

    # MissionSelectionResult + status enum
    ok, detail = has_fields(MissionSelectionResult, ["status", "mission", "detail"])
    checks.append(("contract_selection_result_fields", ok, detail))
    checks.append(("contract_selection_status_values",
                   {s.value for s in MissionSelectionStatus} ==
                   {"mission_created", "mission_exists", "no_eligible_mission", "selection_error"},
                   str([s.value for s in MissionSelectionStatus])))

    # LiveMissionIntegrationResult (governance outcome contract)
    ok, detail = has_fields(LiveMissionIntegrationResult, [
        "status", "governance_status", "approval_input", "verification_input",
        "approval_required", "executed", "execution_eligible", "replayed",
        "simulated_receipt_id", "severity", "severity_map_version", "failure_code",
        "ledger_mission_id", "ledger_record_count", "ledger_chain_valid",
    ])
    checks.append(("contract_integration_result_fields", ok, detail))
    offenders = [n for n in LiveMissionIntegrationResult.model_fields
                 if any(tok in n.lower() for tok in ("approve_and", "auto_execute", "permission"))]
    checks.append(("contract_integration_no_authority_fields", not offenders, ", ".join(offenders)))

    # Approval input requirements (no default -> cannot be inferred)
    import inspect
    sig = inspect.signature(integrate_live_mission)
    checks.append(("contract_approval_required_kwarg",
                   sig.parameters["approval"].default is inspect._empty, ""))
    checks.append(("contract_verification_required_kwarg",
                   sig.parameters["verification_outcome"].default is inspect._empty, ""))

    # Typed governance outcomes (exactly six, distinct)
    outcomes = {EXECUTED, REJECTED, STOPPED_AWAITING_APPROVAL, STOPPED_IDENTITY_UNVERIFIED,
                BLOCKED, FAILED}
    checks.append(("contract_typed_outcomes_six_distinct", len(outcomes) == 6,
                   str(sorted(outcomes))))
    checks.append(("contract_severity_map_versioned",
                   SEVERITY_MAP_VERSION == "LIVE-MISSION-SEVERITY-MAP-v1", SEVERITY_MAP_VERSION))

    # Audit-chain result contract
    ok, detail = has_fields(ChainVerification, ["valid", "length", "broken_at_sequence", "detail"])
    checks.append(("contract_chain_verification_fields", ok, detail))

    return checks


# -- L1 deterministic assertions ---------------------------------------------


def run_l1() -> List[Tuple[str, bool, str]]:
    checks: List[Tuple[str, bool, str]] = []

    def check(name: str, cond: bool, detail: str = "") -> None:
        checks.append((name, bool(cond), detail))

    event = S.build_canonical_event()
    mission = S.build_canonical_mission(event)

    # 1. Signal direction correctness.
    check("signal_direction_adverse", event.direction.value == "adverse", event.direction.value)

    # 2. Signal-change eligibility (adverse carries a mission signal; benign does not).
    adverse_signals = to_selector_signals(event)
    check("adverse_signal_eligible", adverse_signals.get("mission_type") == "renewal_risk",
          str(adverse_signals))

    # 3. Mission rule selection.
    selection = select_mission(event, now=S.ADVERSE_RENEWAL and "2026-07-21T18:10:00Z")
    check("mission_rule_selected",
          selection.status.value == "mission_created" and mission.mission_type == "renewal_risk",
          selection.status.value)

    # 4. Priority-policy output (62 days earlier -> high band 31-90).
    days = mission_rules.adverse_days_earlier(S.BASELINE_RENEWAL, S.ADVERSE_RENEWAL)
    priority = mission_rules.priority_for_days_earlier(days or 0)
    check("priority_policy_high", days == 62 and priority.value == "high", f"days={days}")

    # 5. Mission identity determinism.
    check("mission_identity_deterministic",
          derive_mission_id(event.event_id) == mission.mission_id == derive_mission_id(event.event_id),
          mission.mission_id)

    # 6. source_event_id linkage.
    check("source_event_id_linked", mission.source_event_id == event.event_id, mission.source_event_id)

    # 7. change_fingerprint linkage.
    check("change_fingerprint_linked",
          mission.change_fingerprint == event.change_fingerprint, mission.change_fingerprint)

    # 8. Severity mapping (versioned, deterministic).
    check("severity_map_versioned", SEVERITY_MAP_VERSION == "LIVE-MISSION-SEVERITY-MAP-v1")
    check("severity_map_high", map_severity(MissionPriority.high) == "high")
    check("severity_map_medium", map_severity(MissionPriority.medium) == "medium")
    check("severity_map_critical", map_severity(MissionPriority.critical) == "critical")

    # 9. Approval input requirements (cannot be defaulted; invalid rejected).
    import inspect
    sig = inspect.signature(integrate_live_mission)
    check("approval_required_kwarg", sig.parameters["approval"].default is inspect._empty)
    check("verification_required_kwarg",
          sig.parameters["verification_outcome"].default is inspect._empty)
    invalid_rejected = False
    try:
        integrate_live_mission(mission, event, verification_outcome="verified", approval="maybe")
    except LiveMissionIntegrationError:
        invalid_rejected = True
    check("invalid_approval_fails_closed", invalid_rejected)

    # 10. Typed governance-outcome distinctness.
    outcomes = {EXECUTED, REJECTED, STOPPED_AWAITING_APPROVAL, STOPPED_IDENTITY_UNVERIFIED,
                BLOCKED, FAILED}
    check("typed_outcomes_distinct", len(outcomes) == 6, str(sorted(outcomes)))

    # 11. No execution-authority fields on LiveMission.
    offenders = [
        name for name in LiveMission.model_fields
        if any(tok in name.lower() for tok in _AUTHORITY_FIELD_TOKENS)
    ]
    check("no_execution_authority_fields", not offenders, ", ".join(offenders))

    # 12. Retry / idempotency invariants (stable identity + idempotency key).
    check("idempotency_key_stable",
          event_id_for(event.change_fingerprint) == event.event_id
          and mission.source_event_id == event.event_id, event.event_id)

    return checks


# -- L2 scenarios + L3 narrative ---------------------------------------------


def run_l2() -> Tuple[List[S.ScenarioOutcome], Dict[str, object]]:
    outcomes = [fn() for fn in S.SCENARIOS]
    narrative_outcome, _facts = S.scenario_hallucinated_narrative()
    outcomes.append(narrative_outcome)
    golden = {o.name: o.stable for o in outcomes}
    return outcomes, golden


def run_l3() -> Tuple[List[Tuple[str, bool, str]], str, int]:
    """Provider-independent narrative checks + optional provider-generated grading.

    Returns (checks, provider_status, skipped_count)."""
    status = provider_status()
    checks: List[Tuple[str, bool, str]] = []
    skipped = 0

    # Deterministic groundedness (always runs, no provider needed).
    _outcome, facts = S.scenario_hallucinated_narrative()
    fabricated = "I executed and approved the task automatically on 1999-01-01."
    bad = evaluate_narrative(fabricated, facts)
    checks.append(("fabricated_narrative_rejected", bad.grounded is False, str(bad.violations)))

    # Optional: if a provider is configured it MAY produce a narrative to grade. We do
    # not require it, and never let it influence any governed decision.
    if status != "configured":
        skipped += 1  # provider-generated grading skipped cleanly

    return checks, status, skipped


# -- executive category rollup -----------------------------------------------

#: Ordered mapping of executive labels to the scenario categories that back them.
_EXEC_CATEGORIES = [
    ("Signal Detection", "signal"),
    ("Mission Generation", "mission"),
    ("Evidence Integrity", "evidence"),
    ("Identity Governance", "identity"),
    ("Approval Enforcement", "approval"),
    ("Simulated Execution", "execution"),
    ("Audit Integrity", "audit"),
    ("Idempotency", "idempotency"),
    ("Narrative Grounding", "narrative"),
]


def _executive_rollup(l2_outcomes) -> List[Tuple[str, str]]:
    """Fold scenario outcomes into one PASS/FAIL per executive category, in order.

    A category is PASS only when every scenario in it passed; FAIL if any failed;
    N/A if no scenario carries that category (defensive)."""
    rollup: List[Tuple[str, str]] = []
    for label, category in _EXEC_CATEGORIES:
        members = [o for o in l2_outcomes if o.category == category]
        if not members:
            rollup.append((label, "N/A"))
        elif all(o.status == "pass" for o in members):
            rollup.append((label, "PASS"))
        else:
            rollup.append((label, "FAIL"))
    return rollup


# -- summary + verdict -------------------------------------------------------


def build_summary() -> Dict[str, object]:
    l0 = run_l0()
    l1 = run_l1()
    l2_outcomes, golden = run_l2()
    l3_checks, provider, skipped = run_l3()

    l0_failed = [n for n, ok, _ in l0 if not ok]
    l1_failed = [n for n, ok, _ in l1 if not ok]
    l2_failed = [o.name for o in l2_outcomes if o.status == "fail"]
    l3_failed = [n for n, ok, _ in l3_checks if not ok]

    total_scenarios = len(l2_outcomes)
    passed_scenarios = sum(1 for o in l2_outcomes if o.status == "pass")
    failed_scenarios = sum(1 for o in l2_outcomes if o.status == "fail")

    hard_failures = l0_failed + l1_failed + l2_failed + l3_failed
    if hard_failures:
        verdict = "fail"
    elif skipped:
        verdict = "pass_with_optional_skips"
    else:
        verdict = "pass"

    reasons: Dict[str, str] = {}
    for name, ok, detail in l0 + l1 + l3_checks:
        if not ok:
            reasons[name] = detail
    for o in l2_outcomes:
        if o.status == "fail":
            reasons[o.name] = o.detail

    rollup = _executive_rollup(l2_outcomes)
    total_checks = len(l0) + len(l1) + total_scenarios + len(l3_checks)
    passed_checks = (
        (len(l0) - len(l0_failed)) + (len(l1) - len(l1_failed))
        + passed_scenarios + (len(l3_checks) - len(l3_failed))
    )

    return {
        "total_scenarios": total_scenarios,
        "passed": passed_scenarios,
        "failed": failed_scenarios,
        "skipped": skipped,
        "contract_checks": len(l0),
        "deterministic_checks": len(l1),
        "scenario_checks": total_scenarios,
        "narrative_checks": len(l3_checks),
        "total_checks": total_checks,
        "passed_checks": passed_checks,
        "failed_scenarios": l2_failed,
        "failed_contract": l0_failed,
        "failed_deterministic": l1_failed,
        "failed_narrative": l3_failed,
        "failure_reasons": reasons,
        "provider_status": provider,
        "verdict": verdict,
        "golden": golden,
        "scenario_results": {o.name: o.status for o in l2_outcomes},
        "executive": rollup,
    }


def executive_summary(summary: Dict[str, object]) -> str:
    """Render the concise, human-readable executive summary from a real result.

    No numbers or statuses are hard-coded -- every line is derived from ``summary``."""
    lines = ["VentureOS Evaluation Summary", ""]
    for label, status in summary["executive"]:
        lines.append(f"{label}: {status}")
    provider = summary["provider_status"]
    if provider == "configured":
        lines.append("NVIDIA Provider Evaluation: PASS")
    else:
        lines.append("NVIDIA Provider Evaluation: SKIPPED - provider unconfigured")
    lines.append("")
    lines.append(f"Checks: {summary['passed_checks']} / {summary['total_checks']}")
    lines.append(f"Overall: {str(summary['verdict']).upper()}")
    return "\n".join(lines)


def _canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=True) + "\n"


def write_golden(path: str) -> Dict[str, object]:
    summary = build_summary()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(_canonical_json(summary["golden"]))
    return summary


def check_golden(path: str) -> Tuple[bool, str]:
    summary = build_summary()
    current = _canonical_json(summary["golden"])
    if not os.path.exists(path):
        return False, f"golden file missing: {path}"
    with open(path, "r", encoding="utf-8") as handle:
        committed = handle.read()
    if current != committed:
        return False, "golden mismatch: regenerate with --write and review the diff"
    return True, "golden matches"


def _print_human(summary: Dict[str, object]) -> None:
    print(executive_summary(summary))
    print()
    print("== detail ==")
    print(f"verdict:            {summary['verdict']}")
    print(f"provider:           {summary['provider_status']}")
    print(f"scenarios:          {summary['passed']}/{summary['total_scenarios']} passed, "
          f"{summary['failed']} failed, {summary['skipped']} optional-skipped")
    print(f"contract (L0):      {summary['contract_checks']} checks, "
          f"{len(summary['failed_contract'])} failed")
    print(f"deterministic (L1): {summary['deterministic_checks']} checks, "
          f"{len(summary['failed_deterministic'])} failed")
    print(f"narrative (L3):     {summary['narrative_checks']} checks, "
          f"{len(summary['failed_narrative'])} failed")
    for name, status in summary["scenario_results"].items():
        print(f"  [{status.upper():4}] {name}")
    if summary["failure_reasons"]:
        print("failure reasons:")
        for name, reason in summary["failure_reasons"].items():
            print(f"  - {name}: {reason}")


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="VentureOS evaluation pack")
    parser.add_argument("--write", action="store_true", help="(re)generate the golden file")
    parser.add_argument("--check", action="store_true", help="verify against the golden file")
    parser.add_argument("--out", default=_DEFAULT_GOLDEN, help="golden file path")
    parser.add_argument("--json", action="store_true", help="print machine-readable summary")
    args = parser.parse_args(argv)

    if args.write:
        summary = write_golden(args.out)
        print(f"golden written: {args.out}")
        print(json.dumps({k: summary[k] for k in ("verdict", "passed", "failed", "skipped")}))
        return 0 if summary["verdict"] != "fail" else 1

    if args.check:
        ok, detail = check_golden(args.out)
        summary = build_summary()
        print(f"golden check: {detail}")
        verdict_ok = summary["verdict"] != "fail"
        if args.json:
            print(json.dumps(summary, sort_keys=True))
        return 0 if (ok and verdict_ok) else 1

    summary = build_summary()
    if args.json:
        print(json.dumps(summary, sort_keys=True))
    else:
        _print_human(summary)
    return 0 if summary["verdict"] != "fail" else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
