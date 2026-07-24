"""Focused tests -- build-time AI Assurance exporter (``assurance_web_export``).

Plain-Python runner (no pytest, no network, no provider, no ledger). Prints a single
summary line ``Assurance export: N passed, N failed, N checks total`` for the repo-wide
regression aggregator.

These tests prove the exporter projects the REAL deterministic evaluators into a
web-safe document, enforces the NVIDIA-advisory invariants (advisory-only,
never-override), stays in sync with the committed generated JSON, and leaks no secret,
path, key, or wall-clock timestamp.
"""

from __future__ import annotations

import json
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from evals import assurance_web_export as exporter  # noqa: E402

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, cond: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(cond), detail))


def test_document_shape() -> None:
    doc = exporter.build_document()
    for key in ("schemaVersion", "overallReadiness", "deterministicGates", "nvidiaAdvisory",
                "humanReview", "syntheticEvidence", "runtimeVerification", "regressionHistory"):
        _check(f"document has section: {key}", key in doc)
    _check("schema version 1.0", doc["schemaVersion"] == "1.0")


def test_nvidia_advisory_never_authoritative() -> None:
    doc = exporter.build_document()
    nvidia = doc["nvidiaAdvisory"]
    _check("nvidia authoritative is False", nvidia["authoritative"] is False)
    _check("nvidia assessment advisory/not_configured",
           nvidia["assessment"] in ("advisory", "not_configured"))
    for key, value in nvidia["invariants"].items():
        _check(f"invariant verified: {key}", value is True)


def test_gate_verdict_equals_deterministic() -> None:
    doc = exporter.build_document()
    for gate in doc["deterministicGates"]:
        _check(f"{gate['key']} verdict == deterministicResult",
               gate["verdict"] == gate["deterministicResult"])
    _check("ten gates present", len(doc["deterministicGates"]) == 10)


def test_synthetic_evidence_matches() -> None:
    doc = exporter.build_document()
    syn = doc["syntheticEvidence"]
    _check("synthetic matched == total", syn["matched"] == syn["totalScenarios"])
    _check("synthetic failed == 0", syn["failed"] == 0)
    _check("nine categories", len(syn["categories"]) == 9)


def test_in_sync_and_safe() -> None:
    _check("committed generated JSON in sync", exporter.check() is True)
    raw = json.dumps(exporter.build_document()).lower()
    for needle in ("bearer ", "api_key", "nvapi-", "authorization", "secret", "password",
                   "c:\\", "c:/", ":memory:"):
        _check(f"no forbidden token: {needle}", needle not in raw)
    _check("no wall-clock timestamp", not re.search(r"t\d{2}:\d{2}:\d{2}", raw))


_TESTS = [
    test_document_shape,
    test_nvidia_advisory_never_authoritative,
    test_gate_verdict_equals_deterministic,
    test_synthetic_evidence_matches,
    test_in_sync_and_safe,
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
    print(f"\nAssurance export: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
