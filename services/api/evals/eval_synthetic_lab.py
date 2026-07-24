"""Module B -- Synthetic Evaluation Lab (bounded, deterministic, offline).

The Lab GENERATES enterprise-quality synthetic evaluation scenarios and REALIZES each
one against the REAL, offline deterministic slice (detector -> mission selector ->
governance adapter). It never duplicates a deterministic rule: the "expected verdict"
is declared by construction and the ACTUAL verdict is produced by running the frozen
engine, so a drift between expectation and engine behaviour fails the eval.

Provider abstraction
--------------------
Scenario generation goes through a ``SyntheticProvider`` seam. NVIDIA NeMo Data Designer
is DECLARED as the enterprise generator but is NOT configured in this slice (no key), so
``select_synthetic_provider`` falls back to the fully deterministic in-repo provider. No
network, no LLM, and no credentials are read here.

Data safety
-----------
Every scenario uses FICTIONAL accounts (invented names and synthetic portal/company ids).
No customer data, no production identifiers, no secrets are ever produced. Unstable values
(wall-clock time, temp paths, random ids, latency) are never emitted.

Usage::

    python services/api/evals/eval_synthetic_lab.py            # run + human summary
    python services/api/evals/eval_synthetic_lab.py --write    # (re)generate golden
    python services/api/evals/eval_synthetic_lab.py --check    # verify against golden
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Dict, List, Optional, Protocol

from pydantic import BaseModel

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # evals/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from harness.audit_ledger import MissionAuditLedger  # noqa: E402
from harness.fabric import SourceAccountRecord  # noqa: E402
from harness.service import HarnessServiceDependencies  # noqa: E402
from live_signals.contracts import DetectionStatus, SignalDirection  # noqa: E402
from live_signals.detector import SignalDetector  # noqa: E402
from live_signals.mission_contracts import MissionSelectionStatus  # noqa: E402
from live_signals.mission_selector import select_mission  # noqa: E402
from live_signals.repository import SignalSnapshotRepository  # noqa: E402
from live_signals.mission_governance_adapter import (  # noqa: E402
    EXECUTED,
    REJECTED,
    STOPPED_AWAITING_APPROVAL,
    STOPPED_IDENTITY_UNVERIFIED,
    LiveMissionIntegrationError,
    integrate_live_mission,
)

DATASET_VERSION = "synthetic-lab-v1"
_DEFAULT_GOLDEN = os.path.join(_HERE, "golden", "eval_synthetic_golden.json")

# Injected, stable clock values (never wall-clock).
_T_BASE = "2026-05-01T09:00:00Z"
_T_CHANGE = "2026-05-08T18:10:00Z"
_T_NOW = "2026-05-08T18:10:00Z"

# The nine bounded scenario categories the Lab must cover.
CATEGORIES = (
    "signal",
    "identity",
    "policy",
    "approval",
    "execution",
    "audit",
    "replay",
    "failure",
    "edge",
)

# Canonical governance verdict labels (declared expectations map to these).
V_NO_EVENT = "no_event"
V_NO_MISSION = "no_eligible_mission"
V_STOPPED_IDENTITY = "stopped_identity_unverified"
V_STOPPED_APPROVAL = "stopped_awaiting_approval"
V_REJECTED = "rejected"
V_EXECUTED = "executed"
V_FAIL_CLOSED = "fail_closed"

_STATUS_TO_VERDICT = {
    STOPPED_IDENTITY_UNVERIFIED: V_STOPPED_IDENTITY,
    STOPPED_AWAITING_APPROVAL: V_STOPPED_APPROVAL,
    REJECTED: V_REJECTED,
    EXECUTED: V_EXECUTED,
}


# -- generated scenario shape ------------------------------------------------


class SyntheticScenarioSpec(BaseModel):
    """One generated synthetic scenario: fictional inputs + declared expectations.

    This is the enterprise-quality dataset item. It carries a signal, identity evidence,
    the expected mission, policy inputs, and the expected deterministic verdict plus the
    approval / execution / audit expectations. It contains NO customer data.
    """

    name: str
    category: str
    description: str
    account_label: str  # fictional account name
    portal_id: str  # synthetic
    company_id: str  # synthetic
    # signal
    monitored_field: str
    old_value: str
    new_value: str
    # identity evidence
    identity_mode: str  # "none" | "single_source" | "corroborated"
    corroborating_sources: int
    # policy inputs
    verification_outcome: str  # "verified" | "unverified" | ...
    approval: str  # "approved" | "rejected" | "none" | invalid
    tamper_fingerprint: bool = False
    # expectations
    expected_mission: str  # mission_type or "none"
    expected_verdict: str
    approval_expectation: str
    execution_expectation: str
    audit_expectation: str
    provenance: str = "synthetic"


class RealizedScenario(BaseModel):
    """The result of running the REAL engine over a spec: actual vs expected."""

    name: str
    category: str
    expected_verdict: str
    actual_verdict: str
    match: bool
    detail: str = ""
    stable: Dict[str, object] = {}


# -- provider abstraction ----------------------------------------------------


class SyntheticProvider(Protocol):
    name: str

    def generate(self) -> List[SyntheticScenarioSpec]: ...


class DeterministicSyntheticProvider:
    """Fully deterministic, offline generator. The reference synthetic provider."""

    name = "deterministic-synthetic-v1"

    def generate(self) -> List[SyntheticScenarioSpec]:
        return list(_DEFAULT_DATASET)


def nemo_data_designer_provider() -> Optional[SyntheticProvider]:
    """NVIDIA NeMo Data Designer seam.

    NeMo Data Designer is the declared enterprise synthetic-data generator. It requires
    NVIDIA credentials that are NOT configured in this slice, so this returns ``None`` and
    the deterministic provider is used. The seam keeps the integration point explicit
    without ever reading a key or making a network call here.
    """
    return None


def select_synthetic_provider() -> SyntheticProvider:
    return nemo_data_designer_provider() or DeterministicSyntheticProvider()


# -- the bounded synthetic dataset (fictional accounts only) -----------------


def _spec(**kwargs) -> SyntheticScenarioSpec:
    return SyntheticScenarioSpec(**kwargs)


_DEFAULT_DATASET: List[SyntheticScenarioSpec] = [
    # 1. signal -- benign no-change (no event emitted).
    _spec(
        name="signal_no_change", category="signal",
        description="Renewal date unchanged; detector must emit no event.",
        account_label="Northwind Trading Co", portal_id="900100001", company_id="700200001",
        monitored_field="renewal_date", old_value="2026-11-30", new_value="2026-11-30",
        identity_mode="none", corroborating_sources=0,
        verification_outcome="verified", approval="none",
        expected_mission="none", expected_verdict=V_NO_EVENT,
        approval_expectation="not_reached", execution_expectation="none",
        audit_expectation="no_record",
    ),
    # 2. signal -- positive change (event, but no eligible mission).
    _spec(
        name="signal_positive_change", category="signal",
        description="Renewal date moves later (positive); no adverse mission is selected.",
        account_label="Aurora Foods Group", portal_id="900100002", company_id="700200002",
        monitored_field="renewal_date", old_value="2026-09-30", new_value="2027-03-31",
        identity_mode="none", corroborating_sources=0,
        verification_outcome="verified", approval="none",
        expected_mission="none", expected_verdict=V_NO_MISSION,
        approval_expectation="not_reached", execution_expectation="none",
        audit_expectation="no_record",
    ),
    # 3. identity -- single-source stop.
    _spec(
        name="identity_single_source_stop", category="identity",
        description="Adverse renewal with only one identity source; governed identity stop.",
        account_label="Meridian Retail", portal_id="900100003", company_id="700200003",
        monitored_field="renewal_date", old_value="2026-10-31", new_value="2026-08-31",
        identity_mode="single_source", corroborating_sources=0,
        verification_outcome="verified", approval="approved",
        expected_mission="renewal_risk", expected_verdict=V_STOPPED_IDENTITY,
        approval_expectation="not_reached", execution_expectation="none",
        audit_expectation="record_present",
    ),
    # 4. policy -- corroborated & verified but no approval => stop at approval gate.
    _spec(
        name="policy_corroborated_awaiting_approval", category="policy",
        description="Corroborated identity, verified evidence, approval not given; governed stop.",
        account_label="Blue Harbor Logistics", portal_id="900100004", company_id="700200004",
        monitored_field="renewal_date", old_value="2026-10-31", new_value="2026-08-15",
        identity_mode="corroborated", corroborating_sources=1,
        verification_outcome="verified", approval="none",
        expected_mission="renewal_risk", expected_verdict=V_STOPPED_APPROVAL,
        approval_expectation="required_not_given", execution_expectation="none",
        audit_expectation="record_present",
    ),
    # 5. approval -- explicit rejection.
    _spec(
        name="approval_rejected", category="approval",
        description="Human explicitly rejects; no execution, governed rejection.",
        account_label="Cedar & Pine Markets", portal_id="900100005", company_id="700200005",
        monitored_field="renewal_date", old_value="2026-10-31", new_value="2026-08-20",
        identity_mode="corroborated", corroborating_sources=1,
        verification_outcome="verified", approval="rejected",
        expected_mission="renewal_risk", expected_verdict=V_REJECTED,
        approval_expectation="rejected", execution_expectation="none",
        audit_expectation="record_present",
    ),
    # 6. execution -- approved & corroborated => simulated execution + receipt.
    _spec(
        name="execution_approved_simulated", category="execution",
        description="Corroborated, verified, approved; simulated execution with receipt (no CRM).",
        account_label="Summit Provisions", portal_id="900100006", company_id="700200006",
        monitored_field="renewal_date", old_value="2026-10-31", new_value="2026-08-10",
        identity_mode="corroborated", corroborating_sources=1,
        verification_outcome="verified", approval="approved",
        expected_mission="renewal_risk", expected_verdict=V_EXECUTED,
        approval_expectation="approved", execution_expectation="simulated_receipt",
        audit_expectation="chain_valid",
    ),
    # 7. audit -- chain valid after a governed simulated execution.
    _spec(
        name="audit_chain_valid", category="audit",
        description="Governed simulated execution; audit chain must verify as valid.",
        account_label="Harborline Grocers", portal_id="900100007", company_id="700200007",
        monitored_field="renewal_date", old_value="2026-10-31", new_value="2026-07-31",
        identity_mode="corroborated", corroborating_sources=1,
        verification_outcome="verified", approval="approved",
        expected_mission="renewal_risk", expected_verdict=V_EXECUTED,
        approval_expectation="approved", execution_expectation="simulated_receipt",
        audit_expectation="chain_valid",
    ),
    # 8. replay -- idempotent re-run keeps one receipt / record set.
    _spec(
        name="replay_idempotent", category="replay",
        description="Re-running the approved mission replays without a duplicate action.",
        account_label="Ridgeway Foods", portal_id="900100008", company_id="700200008",
        monitored_field="renewal_date", old_value="2026-10-31", new_value="2026-08-05",
        identity_mode="corroborated", corroborating_sources=1,
        verification_outcome="verified", approval="approved",
        expected_mission="renewal_risk", expected_verdict=V_EXECUTED,
        approval_expectation="approved", execution_expectation="simulated_receipt_replayed",
        audit_expectation="chain_valid",
    ),
    # 9. failure -- tampered evidence fingerprint fails closed before the harness.
    _spec(
        name="failure_tampered_fingerprint", category="failure",
        description="Tampered change fingerprint; must fail closed before any execution.",
        account_label="Lakeside Distributors", portal_id="900100009", company_id="700200009",
        monitored_field="renewal_date", old_value="2026-10-31", new_value="2026-08-01",
        identity_mode="corroborated", corroborating_sources=1,
        verification_outcome="verified", approval="approved", tamper_fingerprint=True,
        expected_mission="renewal_risk", expected_verdict=V_FAIL_CLOSED,
        approval_expectation="not_reached", execution_expectation="none",
        audit_expectation="no_record",
    ),
    # 10. failure -- invalid approval token fails closed.
    _spec(
        name="failure_invalid_approval", category="failure",
        description="Invalid approval token; governed flow rejects it fail-closed.",
        account_label="Fieldstone Markets", portal_id="900100010", company_id="700200010",
        monitored_field="renewal_date", old_value="2026-10-31", new_value="2026-08-02",
        identity_mode="corroborated", corroborating_sources=1,
        verification_outcome="verified", approval="maybe",
        expected_mission="renewal_risk", expected_verdict=V_FAIL_CLOSED,
        approval_expectation="invalid", execution_expectation="none",
        audit_expectation="no_record",
    ),
    # 11. edge -- unsupported monitored field yields no eligible mission.
    _spec(
        name="edge_unsupported_field", category="edge",
        description="An unsupported signal field produces no eligible mission.",
        account_label="Copperfield Retail", portal_id="900100011", company_id="700200011",
        monitored_field="support_escalation", old_value="2", new_value="5",
        identity_mode="none", corroborating_sources=0,
        verification_outcome="verified", approval="none",
        expected_mission="none", expected_verdict=V_NO_MISSION,
        approval_expectation="not_reached", execution_expectation="none",
        audit_expectation="no_record",
    ),
    # 12. edge -- small adverse move (near-term band) still governed-stops without approval.
    _spec(
        name="edge_small_adverse_move", category="edge",
        description="A small adverse renewal move; corroborated but unapproved governed stop.",
        account_label="Willowbrook Foods", portal_id="900100012", company_id="700200012",
        monitored_field="renewal_date", old_value="2026-10-31", new_value="2026-10-15",
        identity_mode="corroborated", corroborating_sources=1,
        verification_outcome="verified", approval="none",
        expected_mission="renewal_risk", expected_verdict=V_STOPPED_APPROVAL,
        approval_expectation="required_not_given", execution_expectation="none",
        audit_expectation="record_present",
    ),
]


# -- realization against the REAL deterministic engine -----------------------


def _corroborating_records(spec: SyntheticScenarioSpec) -> Optional[List[SourceAccountRecord]]:
    """Offline-only second identity source keyed to the synthetic crosswalk.

    A controlled test corroboration -- NOT a live multi-source integration."""
    if spec.identity_mode != "corroborated" or spec.corroborating_sources < 1:
        return None
    crosswalk = f"hubspot:{spec.portal_id}:{spec.company_id}"
    return [
        SourceAccountRecord(
            source_system="salesforce",
            source_record_id=f"SF-{spec.company_id}",
            account_name=spec.account_label,
            external_ids={"venture_os_ref": crosswalk},
        )
    ]


def _detect_change(spec: SyntheticScenarioSpec):
    repo = SignalSnapshotRepository(":memory:")
    detector = SignalDetector(repo)
    detector.detect(
        portal_id=spec.portal_id, account_id=spec.company_id, account_ref=spec.account_label,
        monitored_field=spec.monitored_field, source_record_type="company",
        source_record_id=spec.company_id, raw_value=spec.old_value, detected_at=_T_BASE,
    )
    result = detector.detect(
        portal_id=spec.portal_id, account_id=spec.company_id, account_ref=spec.account_label,
        monitored_field=spec.monitored_field, source_record_type="company",
        source_record_id=spec.company_id, raw_value=spec.new_value, detected_at=_T_CHANGE,
    )
    repo.close()
    return result


def realize(spec: SyntheticScenarioSpec) -> RealizedScenario:
    """Run the REAL offline engine over a synthetic spec and grade actual vs expected."""
    detection = _detect_change(spec)

    # No event emitted (benign / unchanged).
    if detection.event is None:
        actual = V_NO_EVENT if detection.status == DetectionStatus.unchanged else V_NO_MISSION
        return _grade(spec, actual, {
            "detection_status": detection.status.value,
            "event_emitted": False,
        })

    event = detection.event
    selection = select_mission(event, now=_T_NOW)

    # Event emitted but no eligible mission (positive move / unsupported field).
    if selection.status != MissionSelectionStatus.mission_created or selection.mission is None:
        return _grade(spec, V_NO_MISSION, {
            "direction": event.direction.value,
            "selection_status": selection.status.value,
        })

    mission = selection.mission

    # Failure -- tampered fingerprint must fail closed before the harness.
    if spec.tamper_fingerprint:
        tampered = event.model_copy(update={"change_fingerprint": "sig1:TAMPERED"})
        failed_closed = False
        try:
            integrate_live_mission(
                mission, tampered, verification_outcome=spec.verification_outcome,
                approval=spec.approval, corroborating_records=_corroborating_records(spec),
            )
        except LiveMissionIntegrationError:
            failed_closed = True
        actual = V_FAIL_CLOSED if failed_closed else V_EXECUTED
        return _grade(spec, actual, {"failed_closed_before_harness": failed_closed})

    # Failure -- invalid approval token must fail closed.
    if spec.approval not in ("approved", "rejected", "none"):
        failed_closed = False
        try:
            integrate_live_mission(
                mission, event, verification_outcome=spec.verification_outcome,
                approval=spec.approval, corroborating_records=_corroborating_records(spec),
            )
        except LiveMissionIntegrationError:
            failed_closed = True
        actual = V_FAIL_CLOSED if failed_closed else V_EXECUTED
        return _grade(spec, actual, {"invalid_approval_failed_closed": failed_closed})

    # Replay -- integrate twice over one disposable ledger.
    if spec.category == "replay":
        ledger = MissionAuditLedger(":memory:")
        deps = HarnessServiceDependencies(ledger=ledger)
        first = integrate_live_mission(
            mission, event, verification_outcome=spec.verification_outcome,
            approval=spec.approval, dependencies=deps,
            corroborating_records=_corroborating_records(spec),
        )
        second = integrate_live_mission(
            mission, event, verification_outcome=spec.verification_outcome,
            approval=spec.approval, dependencies=deps,
            corroborating_records=_corroborating_records(spec),
        )
        ledger.close()
        actual = _STATUS_TO_VERDICT.get(second.status, second.status)
        return _grade(spec, actual, {
            "status": second.status,
            "replayed": second.replayed,
            "same_receipt": first.simulated_receipt_id == second.simulated_receipt_id,
            "record_count_unchanged": first.ledger_record_count == second.ledger_record_count,
        })

    # Standard governed integration (identity / policy / approval / execution / audit / edge).
    ledger = MissionAuditLedger(":memory:")
    deps = HarnessServiceDependencies(ledger=ledger)
    result = integrate_live_mission(
        mission, event, verification_outcome=spec.verification_outcome,
        approval=spec.approval, dependencies=deps,
        corroborating_records=_corroborating_records(spec),
    )
    chain_valid = None
    if result.ledger_mission_id:
        chain_valid = ledger.verify_mission_chain(result.ledger_mission_id).valid
    ledger.close()
    actual = _STATUS_TO_VERDICT.get(result.status, result.status)
    return _grade(spec, actual, {
        "status": result.status,
        "executed": result.executed,
        "has_receipt": bool(result.simulated_receipt_id),
        "chain_valid": chain_valid,
        "failure_code": result.failure_code,
        "priority": result.severity,
    })


def _grade(spec: SyntheticScenarioSpec, actual: str, stable: Dict[str, object]) -> RealizedScenario:
    match = actual == spec.expected_verdict
    return RealizedScenario(
        name=spec.name, category=spec.category,
        expected_verdict=spec.expected_verdict, actual_verdict=actual, match=match,
        detail=f"expected={spec.expected_verdict}, actual={actual}",
        stable={"expected_verdict": spec.expected_verdict, "actual_verdict": actual,
                "match": match, **stable},
    )


# -- dataset + realization rollup --------------------------------------------


def generate_dataset(provider: Optional[SyntheticProvider] = None) -> List[SyntheticScenarioSpec]:
    provider = provider or select_synthetic_provider()
    return provider.generate()


def realize_all(provider: Optional[SyntheticProvider] = None) -> List[RealizedScenario]:
    return [realize(spec) for spec in generate_dataset(provider)]


def build_summary(provider: Optional[SyntheticProvider] = None) -> Dict[str, object]:
    prov = provider or select_synthetic_provider()
    specs = generate_dataset(prov)
    realized = [realize(spec) for spec in specs]
    by_category: Dict[str, int] = {c: 0 for c in CATEGORIES}
    for s in specs:
        by_category[s.category] = by_category.get(s.category, 0) + 1
    matched = sum(1 for r in realized if r.match)
    missing = [c for c in CATEGORIES if by_category.get(c, 0) == 0]
    verdict = "pass" if (matched == len(realized) and not missing) else "fail"
    golden = {r.name: r.stable for r in realized}
    return {
        "dataset_version": DATASET_VERSION,
        "provider": prov.name,
        "nemo_configured": nemo_data_designer_provider() is not None,
        "total_scenarios": len(specs),
        "matched": matched,
        "failed": len(realized) - matched,
        "categories": list(CATEGORIES),
        "category_counts": by_category,
        "missing_categories": missing,
        "verdict": verdict,
        "results": {r.name: r.match for r in realized},
        "failed_scenarios": [r.name for r in realized if not r.match],
        "golden": golden,
    }


def _canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=True) + "\n"


def write_golden(path: str) -> Dict[str, object]:
    summary = build_summary()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(_canonical_json(summary["golden"]))
    return summary


def check_golden(path: str) -> tuple[bool, str]:
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
    print("VentureOS Synthetic Evaluation Lab")
    print("")
    print(f"provider:        {summary['provider']}")
    print(f"dataset version: {summary['dataset_version']}")
    print(f"NeMo configured: {summary['nemo_configured']}")
    print(f"scenarios:       {summary['matched']}/{summary['total_scenarios']} realized as expected")
    print(f"categories:      {', '.join(summary['categories'])}")
    if summary["missing_categories"]:
        print(f"MISSING CATEGORIES: {', '.join(summary['missing_categories'])}")
    for name, ok in summary["results"].items():
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    print(f"Overall: {str(summary['verdict']).upper()}")


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="VentureOS Synthetic Evaluation Lab")
    parser.add_argument("--write", action="store_true", help="(re)generate the golden file")
    parser.add_argument("--check", action="store_true", help="verify against the golden file")
    parser.add_argument("--out", default=_DEFAULT_GOLDEN, help="golden file path")
    parser.add_argument("--json", action="store_true", help="print machine-readable summary")
    args = parser.parse_args(argv)

    if args.write:
        summary = write_golden(args.out)
        print(f"synthetic golden written: {args.out}")
        print(json.dumps({k: summary[k] for k in ("verdict", "matched", "failed", "total_scenarios")}))
        return 0 if summary["verdict"] != "fail" else 1

    if args.check:
        ok, detail = check_golden(args.out)
        summary = build_summary()
        print(f"synthetic golden check: {detail}")
        if args.json:
            print(json.dumps(summary, sort_keys=True))
        return 0 if (ok and summary["verdict"] != "fail") else 1

    summary = build_summary()
    if args.json:
        print(json.dumps(summary, sort_keys=True))
    else:
        _print_human(summary)
    return 0 if summary["verdict"] != "fail" else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
