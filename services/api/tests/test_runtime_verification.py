"""Tests for NVIDIA runtime verification (Module A) -- plain-Python, no pytest.

Guards: the report is assembled from live probes (not hard-coded), reflects the actual
unconfigured-or-configured truth, verifies the always-on safety invariants (server-only,
deterministic-first, groundedness, fallbacks), and NEVER leaks a secret.

Run directly:  python services/api/tests/test_runtime_verification.py
"""

from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from evals import eval_runtime_verification as RV  # noqa: E402

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, cond: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(cond), detail))


def test_report_has_all_fields() -> None:
    report = RV.build_report()
    for field in ("configured", "provider", "model", "health", "server_only",
                  "deterministic_first", "wording_overlay", "groundedness_validation",
                  "timeout_fallback", "rejection_fallback"):
        _check(f"field present: {field}", field in report["fields"])
    _check("provider is nvidia", report["fields"]["provider"]["value"] == "nvidia")


def test_safety_invariants_verified() -> None:
    report = RV.build_report()
    f = report["fields"]
    # These MUST hold whether or not NVIDIA has a key.
    _check("server_only verified", f["server_only"]["value"] is True)
    _check("deterministic_first verified", f["deterministic_first"]["value"] is True)
    _check("groundedness_validation verified", f["groundedness_validation"]["value"] is True)
    _check("wording_overlay verified", f["wording_overlay"]["value"] is True)
    _check("timeout_fallback verified", f["timeout_fallback"]["value"] is True)
    _check("rejection_fallback verified", f["rejection_fallback"]["value"] is True)


def test_configured_reflects_runtime_truth() -> None:
    report = RV.build_report()
    configured = report["fields"]["configured"]["value"]
    health = report["health"]
    _check("configured is a boolean", isinstance(configured, bool))
    if not configured:
        _check("unconfigured -> health unconfigured", health == "unconfigured", str(health))
    else:
        _check("configured -> health resolved", health in ("healthy", "connected", "failed", "error"))


def test_no_secret_leakage() -> None:
    report = RV.build_report()
    leaks = RV.scan_for_secrets(report)
    _check("no secret-like tokens in report", not leaks, str(leaks))
    ok, problems = RV.check()
    _check("consistency check passes", ok, str(problems))


def test_probes_are_live_not_hardcoded() -> None:
    # The groundedness probe must actually exercise the grader (returns True only if it rejects).
    _check("groundedness probe runs the grader", RV._probe_groundedness() is True)
    _check("deterministic fallback probe imports baseline", RV._probe_deterministic_fallback() is True)
    _check("wording overlay probe inspects the seam", RV._probe_wording_overlay() is True)


_TESTS = [
    test_report_has_all_fields,
    test_safety_invariants_verified,
    test_configured_reflects_runtime_truth,
    test_no_secret_leakage,
    test_probes_are_live_not_hardcoded,
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
    print(f"\nRuntime Verification: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
