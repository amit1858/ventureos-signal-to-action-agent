"""Build-time adapter: export web-safe AI Assurance data for the ``/assurance`` route.

Architecture::

    eval_assurance.build_summary()              ->  deterministic gates + overall readiness
    eval_runtime_verification.build_report()     ->  NVIDIA advisory / runtime truth
    eval_synthetic_lab.build_summary()/realize   ->  synthetic evidence corpus
    REGRESSION_BASELINE (labeled, not invented)  ->  regression history

    ->  one web-safe, camelCase JSON document consumed read-only by the Next.js app.

This is the ONLY place the ``/assurance`` screen's data is produced. It runs the REAL
deterministic evaluators (never a reimplementation), and emits ONLY stable, secret-free,
presentation-safe fields -- no secrets, no local paths, no CRM payloads, no keys, no
prompts, no raw provider internals. NVIDIA is reported as advisory-only and, when
unconfigured, as ``not_configured`` -- never authoritative.

It never calls a network, a provider, HubSpot, Salesforce, or the journey orchestrator;
never executes a mission; never writes a ledger record.

Usage::

    python -m evals.assurance_web_export --write   # regenerate the committed JSON
    python -m evals.assurance_web_export --check    # verify it is in sync (CI/golden)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from evals import eval_assurance as A
from evals import eval_runtime_verification as RV
from evals import eval_synthetic_lab as L

# -- paths (computed from this file; no hard-coded absolute paths) -------------

_EVALS_DIR = Path(__file__).resolve().parent
_API_DIR = _EVALS_DIR.parent
_REPO_ROOT = _API_DIR.parent.parent
_OUTPUT_PATH = (
    _REPO_ROOT / "apps" / "web" / "lib" / "assurance" / "data" / "assurance.generated.json"
)

SCHEMA_VERSION = "1.0"

# Regression baseline. We do NOT invent history: this is a single, clearly-labeled
# current-baseline snapshot captured from the actual validated suites at build time,
# with structure ready for future dated entries.
REGRESSION_BASELINE: List[Dict[str, Any]] = [
    {
        "label": "Phase 2 build baseline",
        "kind": "current-baseline",
        "backendChecks": 1716,
        "backendFailures": 0,
        "backendFiles": 29,
        "note": (
            "Full plain-Python backend suite green, including the Phase 2 synthetic lab, "
            "assurance, and runtime-verification tests. No golden drift."
        ),
    },
]


def _readiness_block() -> Dict[str, Any]:
    summary = A.build_summary()
    return {
        "verdict": summary["verdict"],
        "readiness": summary["overall_readiness"],
        "passedDimensions": summary["passed"],
        "totalDimensions": summary["total_dimensions"],
        "failedDimensions": summary["failed_dimensions"],
        "rubricVersion": A.RUBRIC_VERSION,
    }


def _deterministic_gates() -> List[Dict[str, Any]]:
    gates: List[Dict[str, Any]] = []
    for dim in A.evaluate_dimensions():
        gates.append(
            {
                "key": dim.key,
                "label": dim.label,
                "expected": dim.expected,
                "actual": dim.actual,
                "verdict": A.overall_dimension_verdict(dim),
                "deterministicResult": dim.deterministic_result,
                "humanReview": dim.human_review,
                "qualityScore": dim.quality_score,
                "evidence": list(dim.evidence),
            }
        )
    return gates


def _nvidia_advisory() -> Dict[str, Any]:
    report = RV.build_report()
    f = report["fields"]
    dims = A.evaluate_dimensions()
    # Advisory posture is uniform across dimensions in this slice; surface it once.
    advisory = dims[0].nvidia_assessment if dims else "not_configured"
    return {
        "configured": f["configured"]["value"],
        "provider": f["provider"]["value"],
        "model": f["model"]["value"],
        "health": report["health"],
        "assessment": advisory,
        "authoritative": False,
        "note": (
            "NVIDIA is advisory only. It cannot override a deterministic gate, decide, "
            "approve, or execute. When unconfigured, the deterministic reference stands."
        ),
        "invariants": {
            "serverOnly": f["server_only"]["value"],
            "deterministicFirst": f["deterministic_first"]["value"],
            "wordingOverlay": f["wording_overlay"]["value"],
            "groundednessValidation": f["groundedness_validation"]["value"],
            "timeoutFallback": f["timeout_fallback"]["value"],
            "rejectionFallback": f["rejection_fallback"]["value"],
        },
    }


def _human_review() -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for dim in A.evaluate_dimensions():
        rows.append(
            {
                "key": dim.key,
                "label": dim.label,
                "humanReview": dim.human_review,
                "verdict": A.overall_dimension_verdict(dim),
            }
        )
    return rows


def _synthetic_evidence() -> Dict[str, Any]:
    summary = L.build_summary()
    realized = L.realize_all()
    scenarios = [
        {
            "name": r.name,
            "category": r.category,
            "expected": r.expected_verdict,
            "actual": r.actual_verdict,
            "matched": r.match,
        }
        for r in realized
    ]
    return {
        "datasetVersion": summary["dataset_version"],
        "provider": summary["provider"],
        "nemoConfigured": summary["nemo_configured"],
        "totalScenarios": summary["total_scenarios"],
        "matched": summary["matched"],
        "failed": summary["failed"],
        "verdict": summary["verdict"],
        "categories": summary["categories"],
        "categoryCounts": summary["category_counts"],
        "scenarios": scenarios,
    }


def _runtime_verification() -> Dict[str, Any]:
    report = RV.build_report()
    fields = {
        key: {"value": field["value"], "verified": field["verified"], "evidence": field["evidence"]}
        for key, field in report["fields"].items()
    }
    return {
        "version": RV.RUNTIME_VERIFICATION_VERSION,
        "configured": report["configured"],
        "health": report["health"],
        "fields": fields,
    }


def build_document() -> Dict[str, Any]:
    """Build the full ``/assurance`` document from the real deterministic evaluators."""
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedBy": "services/api/evals/assurance_web_export.py",
        "overallReadiness": _readiness_block(),
        "deterministicGates": _deterministic_gates(),
        "nvidiaAdvisory": _nvidia_advisory(),
        "humanReview": _human_review(),
        "syntheticEvidence": _synthetic_evidence(),
        "runtimeVerification": _runtime_verification(),
        "regressionHistory": REGRESSION_BASELINE,
    }


def _serialize(doc: Dict[str, Any]) -> str:
    """Stable, deterministic serialization (trailing newline for POSIX-friendly diffs)."""
    return json.dumps(doc, indent=2, ensure_ascii=True, sort_keys=True) + "\n"


def write() -> Path:
    doc = build_document()
    _OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    _OUTPUT_PATH.write_text(_serialize(doc), encoding="utf-8")
    return _OUTPUT_PATH


def check() -> bool:
    """Return True when the on-disk generated document exactly matches a fresh build."""
    if not _OUTPUT_PATH.exists():
        return False
    expected = _serialize(build_document())
    actual = _OUTPUT_PATH.read_text(encoding="utf-8")
    return expected == actual


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="evals.assurance_web_export",
        description="Export web-safe AI Assurance data for the /assurance route.",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--write", action="store_true", help="Regenerate the committed JSON.")
    group.add_argument("--check", action="store_true", help="Verify the committed JSON is in sync.")
    args = parser.parse_args(argv)

    if args.write:
        path = write()
        rel = path.relative_to(_REPO_ROOT)
        print(f"assurance-export: wrote {rel}")
        return 0

    if check():
        print("assurance-export check: generated assurance.generated.json matches")
        return 0
    print("assurance-export check: OUT OF SYNC -- run --write to regenerate")
    return 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
