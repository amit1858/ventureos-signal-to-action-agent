"""Module C -- AI Assurance evaluator (deterministic-authoritative, NVIDIA advisory).

Grades the governed slice across TEN assurance dimensions. Every dimension is decided by
the REAL deterministic engine and the frozen groundedness grader -- NVIDIA is advisory
only and is STRUCTURALLY unable to change a verdict:

    overall(dimension) = deterministic_result       # NVIDIA never flips FAIL -> PASS

When no NVIDIA provider is configured (the current slice), the advisory column reads
"not_configured" and a deterministic reference quality score is shown, clearly labelled as
advisory / pending credentials. Nothing here calls a network, an LLM, or reads a secret.

Dimensions: governance correctness, evidence grounding, recommendation quality, explanation
quality, approval discipline, replay safety, execution safety, audit integrity, narrative
usefulness, tool correctness.

Usage::

    python services/api/evals/eval_assurance.py            # run + human summary
    python services/api/evals/eval_assurance.py --write    # (re)generate golden
    python services/api/evals/eval_assurance.py --check    # verify against golden
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Callable, Dict, List, Tuple

from pydantic import BaseModel

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # evals/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from evals import eval_scenarios as S  # noqa: E402
from evals import eval_synthetic_lab as L  # noqa: E402
from evals.eval_narrative import evaluate_narrative, provider_status  # noqa: E402
from live_signals.mission_contracts import LiveMission  # noqa: E402
from live_signals.mission_governance_adapter import (  # noqa: E402
    BLOCKED,
    EXECUTED,
    FAILED,
    REJECTED,
    STOPPED_AWAITING_APPROVAL,
    STOPPED_IDENTITY_UNVERIFIED,
)

RUBRIC_VERSION = "assurance-rubric-v1"
DATASET_VERSION = L.DATASET_VERSION
# Injected, stable timestamp for the golden (never wall-clock).
STABLE_TIMESTAMP = "2026-05-08T18:10:00Z"
_DEFAULT_GOLDEN = os.path.join(_HERE, "golden", "eval_assurance_golden.json")

_AUTHORITY_FIELD_TOKENS = ("approve", "execute", "permission", "authoriz", "writeback", "write_back")


class AssuranceDimension(BaseModel):
    """One assurance dimension: deterministic verdict + advisory NVIDIA annotation."""

    key: str
    label: str
    expected: str
    actual: str
    deterministic_result: str  # "PASS" | "FAIL"
    nvidia_assessment: str  # advisory only; "not_configured" when unconfigured
    human_review: str  # "not_required" | "required"
    provider: str
    dataset_version: str = DATASET_VERSION
    rubric_version: str = RUBRIC_VERSION
    quality_score: int = 0  # deterministic reference score (advisory)
    timestamp: str = STABLE_TIMESTAMP
    evidence: List[str] = []
    kind: str = "deterministic"  # evidence provenance label


def overall_dimension_verdict(dim: AssuranceDimension) -> str:
    """The authoritative verdict for a dimension.

    Deterministic result is authoritative. NVIDIA is advisory and can NEVER upgrade a
    deterministic FAIL to PASS. This function is the single enforcement point.
    """
    return "PASS" if dim.deterministic_result == "PASS" else "FAIL"


# -- dimension evaluators (each returns pass, expected, actual, evidence) -----


def _dim_governance_correctness() -> Tuple[bool, str, str, List[str]]:
    realized = L.realize_all()
    matched = sum(1 for r in realized if r.match)
    ok = matched == len(realized)
    ev = [f"{r.name}: expected {r.expected_verdict} / actual {r.actual_verdict}" for r in realized]
    return ok, "all synthetic verdicts match the deterministic engine", \
        f"{matched}/{len(realized)} scenarios matched", ev


def _dim_evidence_grounding() -> Tuple[bool, str, str, List[str]]:
    tampered = L.realize(next(s for s in L.generate_dataset() if s.name == "failure_tampered_fingerprint"))
    failed_closed = bool(tampered.stable.get("failed_closed_before_harness"))
    fp = S.scenario_broken_fingerprint()
    ok = failed_closed and fp.status == "pass"
    return ok, "tampered evidence fails closed; fingerprints are linked", \
        f"tamper_failed_closed={failed_closed}, fingerprint_guard={fp.status}", \
        ["synthetic: failure_tampered_fingerprint", f"canonical: {fp.name}={fp.status}"]


def _dim_recommendation_quality() -> Tuple[bool, str, str, List[str]]:
    mission: LiveMission = S.build_canonical_mission()
    step = (mission.recommended_next_step or "").strip()
    objective = (mission.objective or "").strip()
    ok = bool(step) and bool(objective) and mission.mission_type == "renewal_risk"
    return ok, "governed mission carries a concrete recommendation and objective", \
        f"has_recommendation={bool(step)}, has_objective={bool(objective)}", \
        [f"mission_type={mission.mission_type}", f"recommended_next_step_present={bool(step)}"]


def _dim_explanation_quality() -> Tuple[bool, str, str, List[str]]:
    _outcome, facts = S.scenario_hallucinated_narrative()
    fabricated = "I automatically approved and executed the write-back on your behalf on 2025-01-01."
    bad = evaluate_narrative(fabricated, facts)
    ok = bad.grounded is False and len(bad.violations) >= 2
    return ok, "fabricated explanation is rejected by the deterministic grader", \
        f"grounded={bad.grounded}, violations={len(bad.violations)}", \
        [f"violation: {v}" for v in bad.violations]


def _dim_approval_discipline() -> Tuple[bool, str, str, List[str]]:
    specs = {s.name: s for s in L.generate_dataset()}
    checks = []
    for name in ("identity_single_source_stop", "policy_corroborated_awaiting_approval", "approval_rejected"):
        r = L.realize(specs[name])
        checks.append((name, r.stable.get("executed") in (False, None)))
    ok = all(c[1] for c in checks)
    return ok, "no execution occurs without corroboration + explicit approval", \
        f"non_executing_stops={sum(1 for c in checks if c[1])}/{len(checks)}", \
        [f"{n}: executed={'no' if v else 'YES'}" for n, v in checks]


def _dim_replay_safety() -> Tuple[bool, str, str, List[str]]:
    specs = {s.name: s for s in L.generate_dataset()}
    r = L.realize(specs["replay_idempotent"])
    replayed = bool(r.stable.get("replayed"))
    same_receipt = bool(r.stable.get("same_receipt"))
    unchanged = bool(r.stable.get("record_count_unchanged"))
    ok = replayed and same_receipt and unchanged
    return ok, "replay reuses one receipt and adds no duplicate action", \
        f"replayed={replayed}, same_receipt={same_receipt}, record_count_unchanged={unchanged}", \
        ["synthetic: replay_idempotent"]


def _dim_execution_safety() -> Tuple[bool, str, str, List[str]]:
    specs = {s.name: s for s in L.generate_dataset()}
    executed = L.realize(specs["execution_approved_simulated"])
    stopped = L.realize(specs["identity_single_source_stop"])
    exec_ok = executed.stable.get("status") == EXECUTED and executed.stable.get("has_receipt") is True
    stop_ok = stopped.stable.get("has_receipt") in (False, None)
    ok = exec_ok and stop_ok
    return ok, "execution is simulated-only; a receipt exists only after governed approval", \
        f"approved_has_receipt={exec_ok}, stopped_has_no_receipt={stop_ok}", \
        ["execution is simulated: no CRM write-back", "receipt gated behind approval"]


def _dim_audit_integrity() -> Tuple[bool, str, str, List[str]]:
    specs = {s.name: s for s in L.generate_dataset()}
    chain = L.realize(specs["audit_chain_valid"])
    chain_valid = chain.stable.get("chain_valid") is True
    tamper = S.scenario_audit_tamper()
    ok = chain_valid and tamper.status == "pass"
    return ok, "audit chain verifies valid and detects tampering", \
        f"chain_valid={chain_valid}, tamper_detected={tamper.status == 'pass'}", \
        ["synthetic: audit_chain_valid", f"canonical: {tamper.name}={tamper.status}"]


def _dim_narrative_usefulness() -> Tuple[bool, str, str, List[str]]:
    _outcome, facts = S.scenario_hallucinated_narrative()
    grounded_text = (
        "Curefoods' renewal moved earlier, from 2026-08-31 to 2026-06-30 -- an adverse signal. "
        "I recommend reviewing the renewal risk. This is awaiting your approval; no action has been taken."
    )
    good = evaluate_narrative(grounded_text, facts)
    ok = good.grounded is True
    return ok, "a grounded narrative is accepted by the deterministic grader", \
        f"grounded={good.grounded}, violations={len(good.violations)}", \
        ["grounded narrative accepted"]


def _dim_tool_correctness() -> Tuple[bool, str, str, List[str]]:
    outcomes = {EXECUTED, REJECTED, STOPPED_AWAITING_APPROVAL, STOPPED_IDENTITY_UNVERIFIED, BLOCKED, FAILED}
    distinct = len(outcomes) == 6
    offenders = [n for n in LiveMission.model_fields
                 if any(tok in n.lower() for tok in _AUTHORITY_FIELD_TOKENS)]
    ok = distinct and not offenders
    return ok, "typed governance outcomes are distinct; no execution-authority fields", \
        f"typed_outcomes={len(outcomes)}, authority_fields={len(offenders)}", \
        [f"typed_outcomes={sorted(outcomes)}", f"authority_fields={offenders}"]


_DIMENSIONS: List[Tuple[str, str, Callable[[], Tuple[bool, str, str, List[str]]]]] = [
    ("governance_correctness", "Governance correctness", _dim_governance_correctness),
    ("evidence_grounding", "Evidence grounding", _dim_evidence_grounding),
    ("recommendation_quality", "Recommendation quality", _dim_recommendation_quality),
    ("explanation_quality", "Explanation quality", _dim_explanation_quality),
    ("approval_discipline", "Approval discipline", _dim_approval_discipline),
    ("replay_safety", "Replay safety", _dim_replay_safety),
    ("execution_safety", "Execution safety", _dim_execution_safety),
    ("audit_integrity", "Audit integrity", _dim_audit_integrity),
    ("narrative_usefulness", "Narrative usefulness", _dim_narrative_usefulness),
    ("tool_correctness", "Tool correctness", _dim_tool_correctness),
]


def evaluate_dimensions() -> List[AssuranceDimension]:
    provider = provider_status()  # "configured" | "unconfigured"
    configured = provider == "configured"
    dims: List[AssuranceDimension] = []
    for key, label, fn in _DIMENSIONS:
        ok, expected, actual, evidence = fn()
        det = "PASS" if ok else "FAIL"
        # NVIDIA is advisory ONLY. When unconfigured, advisory is not available and the
        # deterministic reference score is shown (labelled advisory / pending credentials).
        nvidia = "advisory" if configured else "not_configured"
        dims.append(
            AssuranceDimension(
                key=key, label=label, expected=expected, actual=actual,
                deterministic_result=det,
                nvidia_assessment=nvidia,
                human_review="not_required" if ok else "required",
                provider=provider,
                quality_score=100 if ok else 0,  # deterministic reference (advisory)
                evidence=evidence[:8],
                kind="deterministic",
            )
        )
    return dims


def build_summary() -> Dict[str, object]:
    dims = evaluate_dimensions()
    # Enforce the non-override invariant explicitly, per dimension.
    for d in dims:
        assert overall_dimension_verdict(d) == d.deterministic_result, "NVIDIA must not override determinism"
    failed = [d.key for d in dims if overall_dimension_verdict(d) != "PASS"]
    readiness = "READY" if not failed else "NOT_READY"
    provider = dims[0].provider if dims else provider_status()
    golden = {
        d.key: {
            "expected": d.expected,
            "deterministic_result": d.deterministic_result,
            "overall": overall_dimension_verdict(d),
            "human_review": d.human_review,
            "quality_score": d.quality_score,
        }
        for d in dims
    }
    return {
        "rubric_version": RUBRIC_VERSION,
        "dataset_version": DATASET_VERSION,
        "provider": provider,
        "nvidia_advisory_available": provider == "configured",
        "overall_readiness": readiness,
        "total_dimensions": len(dims),
        "passed": sum(1 for d in dims if overall_dimension_verdict(d) == "PASS"),
        "failed_dimensions": failed,
        "verdict": "pass" if not failed else "fail",
        "dimensions": [d.model_dump() for d in dims],
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
    print("VentureOS AI Assurance")
    print("")
    print(f"overall readiness: {summary['overall_readiness']}")
    print(f"provider:          {summary['provider']} (NVIDIA advisory available: {summary['nvidia_advisory_available']})")
    print(f"rubric:            {summary['rubric_version']}   dataset: {summary['dataset_version']}")
    print("")
    for d in summary["dimensions"]:
        print(f"  [{d['deterministic_result']:4}] {d['label']:26} "
              f"nvidia={d['nvidia_assessment']:14} human={d['human_review']}")
    print("")
    print(f"Dimensions: {summary['passed']}/{summary['total_dimensions']} pass")
    print(f"Overall: {str(summary['verdict']).upper()}")


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="VentureOS AI Assurance evaluator")
    parser.add_argument("--write", action="store_true", help="(re)generate the golden file")
    parser.add_argument("--check", action="store_true", help="verify against the golden file")
    parser.add_argument("--out", default=_DEFAULT_GOLDEN, help="golden file path")
    parser.add_argument("--json", action="store_true", help="print machine-readable summary")
    args = parser.parse_args(argv)

    if args.write:
        summary = write_golden(args.out)
        print(f"assurance golden written: {args.out}")
        print(json.dumps({k: summary[k] for k in ("verdict", "overall_readiness", "passed", "total_dimensions")}))
        return 0 if summary["verdict"] != "fail" else 1

    if args.check:
        ok, detail = check_golden(args.out)
        summary = build_summary()
        print(f"assurance golden check: {detail}")
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
