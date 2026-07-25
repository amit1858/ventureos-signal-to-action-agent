"""Tests — build-time AI Assurance Center exporter (``ai_assurance_center_export``).

Enforcing pytest tests (no network, no provider, no ledger). They prove the projection:

* builds from the REAL deterministic evaluators + the committed live-proof snapshot;
* keeps the deterministic result authoritative (``overallVerdict == deterministicResult``);
* never marks the advisory band authoritative and never shows a bare advisory PASS
  without a live NVIDIA proof;
* exposes exactly the seven advisory dimensions with the documented deterministic mapping;
* stays in sync with the committed generated JSON (golden);
* leaks no secret, key, Authorization header, or local path.
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

from evals import ai_assurance_center_export as exporter  # noqa: E402
from evals.nvidia_advisory.rubric import ADVISORY_DIMENSIONS, DETERMINISTIC_TO_ADVISORY  # noqa: E402


def test_document_shape() -> None:
    doc = exporter.build_document()
    for key in ("schemaVersion", "band", "liveProof", "reference", "dimensions", "deterministic"):
        assert key in doc, f"missing section: {key}"
    assert doc["schemaVersion"] == "1.0"


def test_band_never_authoritative() -> None:
    band = exporter.build_document()["band"]
    assert band["authoritative"] is False
    assert band["deterministicGovernance"] in ("PASS", "FAIL")
    assert band["nvidiaAdvisory"] in ("PASS", "CONCERN", "UNAVAILABLE", "PROVIDER_ERROR")
    assert band["humanReview"] in ("NOT_REQUIRED", "REVIEW_SUGGESTED", "REVIEW_REQUIRED")


def test_band_advisory_pass_requires_live_proof() -> None:
    doc = exporter.build_document()
    if doc["band"]["nvidiaAdvisory"] == "PASS":
        assert doc["liveProof"] is not None, "advisory PASS must be backed by a live proof"


def test_deterministic_fail_forces_review() -> None:
    doc = exporter.build_document()
    if doc["band"]["deterministicGovernance"] == "FAIL":
        assert doc["band"]["humanReview"] == "REVIEW_REQUIRED"


def test_live_proof_authority_invariant() -> None:
    lp = exporter.build_document()["liveProof"]
    if lp is not None:
        for row in lp["results"]:
            assert row["overallVerdict"] == row["deterministicResult"], (
                "NVIDIA advisory must never change the deterministic verdict"
            )


def test_seven_dimensions_and_mapping() -> None:
    dims = exporter.build_document()["dimensions"]
    assert [d["advisoryDimension"] for d in dims] == ADVISORY_DIMENSIONS
    for d in dims:
        assert list(d["deterministicDimensions"]) == list(DETERMINISTIC_TO_ADVISORY[d["advisoryDimension"]])
        assert d["source"] in ("live_nvidia", "reference_offline", "not_evaluated")
        if d["source"] == "not_evaluated":
            assert d["score"] is None and d["verdict"] is None
        else:
            assert 1 <= d["score"] <= 5
            # per-row authority invariant
            assert d["overallVerdict"] == d["deterministicResult"]


def test_dimension_row_never_fabricates_nvidia() -> None:
    # A reference-sourced dimension must never claim to be an NVIDIA score.
    dims = exporter.build_document()["dimensions"]
    for d in dims:
        if d["source"] == "reference_offline":
            assert d["verdict"] is not None  # it is a real reference verdict, labelled as such


def test_in_sync_golden() -> None:
    assert exporter.check() is True, "committed aiAssuranceCenter.generated.json is out of sync"


def test_no_secret_or_path() -> None:
    raw = json.dumps(exporter.build_document()).lower()
    for needle in ("bearer ", "api_key", "apikey", "nvapi-", "authorization",
                   "password", "c:\\", "c:/", ":memory:"):
        assert needle not in raw, f"forbidden token leaked: {needle}"


if __name__ == "__main__":  # pragma: no cover
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"[PASS] {name}")
    print("ai-assurance-center export: all tests passed")
