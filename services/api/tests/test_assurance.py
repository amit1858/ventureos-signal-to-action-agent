"""Tests for the AI Assurance evaluator (Module C) -- plain-Python, no pytest.

Guards: all ten dimensions are present and deterministic-authoritative, NVIDIA is advisory
and can NEVER flip a deterministic FAIL to PASS, the unconfigured environment reports
advisory "not_configured" (never authoritative), and the golden roundtrip is stable/safe.

Run directly:  python services/api/tests/test_assurance.py
"""

from __future__ import annotations

import os
import re
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from evals import eval_assurance as A  # noqa: E402

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, cond: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(cond), detail))


def test_ten_dimensions_present() -> None:
    dims = A.evaluate_dimensions()
    _check("exactly ten dimensions", len(dims) == 10, str(len(dims)))
    keys = {d.key for d in dims}
    for expected in ("governance_correctness", "evidence_grounding", "recommendation_quality",
                     "explanation_quality", "approval_discipline", "replay_safety",
                     "execution_safety", "audit_integrity", "narrative_usefulness", "tool_correctness"):
        _check(f"dimension present: {expected}", expected in keys)


def test_all_dimensions_pass_deterministically() -> None:
    summary = A.build_summary()
    _check("overall readiness READY", summary["overall_readiness"] == "READY", str(summary["overall_readiness"]))
    _check("all dimensions pass", summary["passed"] == summary["total_dimensions"],
           f"{summary['passed']}/{summary['total_dimensions']}; failed={summary['failed_dimensions']}")
    _check("verdict pass", summary["verdict"] == "pass")


def test_nvidia_is_advisory_only() -> None:
    dims = A.evaluate_dimensions()
    # Provider is unconfigured in this slice -> advisory reads not_configured, never authoritative.
    for d in dims:
        _check(f"{d.key} nvidia advisory not authoritative",
               d.nvidia_assessment in ("advisory", "not_configured"))
        _check(f"{d.key} overall equals deterministic", A.overall_dimension_verdict(d) == d.deterministic_result)


def test_nvidia_cannot_override_a_failure() -> None:
    # Construct a deterministic FAIL dimension with a maximal advisory annotation; the
    # override guard must still return FAIL.
    d = A.AssuranceDimension(
        key="synthetic_fail", label="Synthetic Fail", expected="x", actual="y",
        deterministic_result="FAIL", nvidia_assessment="advisory", human_review="required",
        provider="configured", quality_score=100,
    )
    _check("NVIDIA cannot flip FAIL to PASS", A.overall_dimension_verdict(d) == "FAIL")


def test_metadata_present() -> None:
    dims = A.evaluate_dimensions()
    for d in dims:
        _check(f"{d.key} has rubric version", d.rubric_version == A.RUBRIC_VERSION)
        _check(f"{d.key} has dataset version", d.dataset_version == A.DATASET_VERSION)
        _check(f"{d.key} has stable timestamp", d.timestamp == A.STABLE_TIMESTAMP)
        _check(f"{d.key} has expected + actual", bool(d.expected) and bool(d.actual))


def test_golden_roundtrip_and_safety() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "golden", "eval_assurance_golden.json")
        A.write_golden(path)
        _check("golden written", os.path.exists(path))
        ok, detail = A.check_golden(path)
        _check("golden check passes after write", ok, detail)
        missing_ok, _ = A.check_golden(os.path.join(tmp, "nope.json"))
        _check("missing golden fails closed", missing_ok is False)


def test_committed_golden_is_current_and_safe() -> None:
    ok, detail = A.check_golden(A._DEFAULT_GOLDEN)
    _check("committed assurance golden matches", ok, detail)
    with open(A._DEFAULT_GOLDEN, "r", encoding="utf-8") as handle:
        text = handle.read()
    low = text.lower()
    _check("golden has no wall-clock timestamp", not re.search(r"t\d{2}:\d{2}:\d{2}", low))
    _check("golden has no windows path", ":\\" not in text and "c:/" not in low)
    for secret in ("bearer", "api_key", "nvapi-", "authorization"):
        _check(f"golden has no secret token {secret}", secret not in low)


_TESTS = [
    test_ten_dimensions_present,
    test_all_dimensions_pass_deterministically,
    test_nvidia_is_advisory_only,
    test_nvidia_cannot_override_a_failure,
    test_metadata_present,
    test_golden_roundtrip_and_safety,
    test_committed_golden_is_current_and_safe,
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
    print(f"\nAI Assurance: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
