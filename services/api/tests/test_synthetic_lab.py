"""Tests for the Synthetic Evaluation Lab (Module B) -- plain-Python, no pytest.

Guards: the bounded dataset covers all nine categories, uses only fictional accounts
(no customer data / secrets), every spec realizes against the REAL engine as declared,
the provider seam falls back deterministically (NeMo unconfigured), and the golden
--write/--check roundtrip is stable and safe.

Run directly:  python services/api/tests/test_synthetic_lab.py
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

from evals import eval_synthetic_lab as L  # noqa: E402

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, cond: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(cond), detail))


def test_provider_seam_deterministic() -> None:
    prov = L.select_synthetic_provider()
    _check("NeMo provider unconfigured (pending creds)", L.nemo_data_designer_provider() is None)
    _check("falls back to deterministic provider", prov.name == "deterministic-synthetic-v1")


def test_dataset_covers_nine_categories() -> None:
    specs = L.generate_dataset()
    cats = {s.category for s in specs}
    for c in L.CATEGORIES:
        _check(f"category present: {c}", c in cats)
    _check("exactly nine declared categories", len(L.CATEGORIES) == 9, str(L.CATEGORIES))
    _check("bounded dataset size", 9 <= len(specs) <= 60, str(len(specs)))


def test_specs_have_required_fields() -> None:
    specs = L.generate_dataset()
    required = ("signal", "identity", "mission", "policy inputs", "expected verdict",
                "approval", "execution", "audit")
    ok = True
    for s in specs:
        has = bool(s.monitored_field) and bool(s.identity_mode) and bool(s.expected_mission) \
            and bool(s.verification_outcome or s.approval) and bool(s.expected_verdict) \
            and bool(s.approval_expectation) and bool(s.execution_expectation) and bool(s.audit_expectation)
        ok = ok and has
    _check("every scenario carries all required fields", ok, f"required={required}")
    _check("every scenario is provenance=synthetic", all(s.provenance == "synthetic" for s in specs))


def test_no_customer_data() -> None:
    specs = L.generate_dataset()
    blob = " ".join(s.model_dump_json() for s in specs).lower()
    for forbidden in ("curefoods", "246820626", "335064019691", "nvapi-", "api_key", "bearer"):
        _check(f"no forbidden token: {forbidden}", forbidden not in blob)
    # Synthetic portal/company ids are the invented 9001*/7002* ranges only.
    for s in specs:
        _check(f"{s.name} synthetic portal", s.portal_id.startswith("9001"))
        _check(f"{s.name} synthetic company", s.company_id.startswith("7002"))


def test_all_specs_realize_as_expected() -> None:
    summary = L.build_summary()
    _check("every scenario matches the deterministic engine",
           summary["matched"] == summary["total_scenarios"],
           f"{summary['matched']}/{summary['total_scenarios']} matched; failed={summary['failed_scenarios']}")
    _check("no missing categories", not summary["missing_categories"], str(summary["missing_categories"]))
    _check("verdict pass", summary["verdict"] == "pass", str(summary["verdict"]))


def test_governance_verdicts_are_strong_invariants() -> None:
    by_name = {r.name: r for r in L.realize_all()}
    _check("single-source stops at identity",
           by_name["identity_single_source_stop"].actual_verdict == L.V_STOPPED_IDENTITY)
    _check("no approval stops at approval gate",
           by_name["policy_corroborated_awaiting_approval"].actual_verdict == L.V_STOPPED_APPROVAL)
    _check("rejection is rejected",
           by_name["approval_rejected"].actual_verdict == L.V_REJECTED)
    _check("approved corroborated executes (simulated)",
           by_name["execution_approved_simulated"].actual_verdict == L.V_EXECUTED)
    _check("tampered fingerprint fails closed",
           by_name["failure_tampered_fingerprint"].actual_verdict == L.V_FAIL_CLOSED)
    _check("invalid approval fails closed",
           by_name["failure_invalid_approval"].actual_verdict == L.V_FAIL_CLOSED)


def test_golden_roundtrip_and_safety() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "golden", "eval_synthetic_golden.json")
        L.write_golden(path)
        _check("golden written", os.path.exists(path))
        ok, detail = L.check_golden(path)
        _check("golden check passes after write", ok, detail)
        missing_ok, _ = L.check_golden(os.path.join(tmp, "nope.json"))
        _check("missing golden fails closed", missing_ok is False)


def test_committed_golden_is_current_and_safe() -> None:
    ok, detail = L.check_golden(L._DEFAULT_GOLDEN)
    _check("committed synthetic golden matches", ok, detail)
    with open(L._DEFAULT_GOLDEN, "r", encoding="utf-8") as handle:
        text = handle.read()
    low = text.lower()
    _check("golden has no ISO timestamp", not re.search(r"\d{4}-\d{2}-\d{2}t\d{2}:\d{2}", low))
    _check("golden has no windows path", ":\\" not in text and "c:/" not in low)
    _check("golden has no memory-db marker", ":memory:" not in low)
    for secret in ("bearer", "api_key", "nvapi-", "authorization"):
        _check(f"golden has no secret token {secret}", secret not in low)


_TESTS = [
    test_provider_seam_deterministic,
    test_dataset_covers_nine_categories,
    test_specs_have_required_fields,
    test_no_customer_data,
    test_all_specs_realize_as_expected,
    test_governance_verdicts_are_strong_invariants,
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
    print(f"\nSynthetic Lab: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
