"""Build-time adapter: export the web-safe AI Assurance Center projection.

Release 2.3B — Gate 2B. This is the ONLY producer of the data the Trust & Governance
screen's *AI Assurance* summary band and *Independent AI Evaluation* section render.

Two honest, clearly-separated sources — never mixed, never mislabelled::

    eval_nvidia_advisory.run("offline")     ->  deterministic reference (all synthetic
                                                scenarios, all covered dimensions). Labelled
                                                "deterministic-reference"; NEVER shown as NVIDIA.

    data/nvidia_live_proof.redacted.json     ->  a committed, redacted snapshot of the REAL
                                                attended NVIDIA live proof (Gate 2A). Real
                                                provider/model/scores. No secrets, bounded reasons.

    eval_assurance.build_summary()           ->  the authoritative deterministic governance verdict.

Invariants (fail closed in the mirrored TS contract too):

* the deterministic result is authoritative; ``overall_verdict == deterministic_result``;
* NVIDIA is advisory only and can never flip a verdict, approve, or execute;
* where a dimension has no live NVIDIA assessment, it is shown truthfully as reference-only
  or not-evaluated — never fabricated as an NVIDIA score;
* the projection carries NO secrets, keys, Authorization headers, prompts, CRM data, or
  local paths.

Usage::

    python -m evals.ai_assurance_center_export --write   # regenerate the committed JSON
    python -m evals.ai_assurance_center_export --check    # verify it is in sync (CI/golden)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from evals import eval_assurance as A
from evals import eval_nvidia_advisory as ADV
from evals.nvidia_advisory.rubric import (
    ADVISORY_DIMENSIONS,
    DETERMINISTIC_TO_ADVISORY,
    OFFLINE_MODEL,
    OFFLINE_PROVIDER,
    RUBRIC_VERSION,
)

_EVALS_DIR = Path(__file__).resolve().parent
_API_DIR = _EVALS_DIR.parent
_REPO_ROOT = _API_DIR.parent.parent
_LIVE_PROOF_PATH = _EVALS_DIR / "data" / "nvidia_live_proof.redacted.json"
_OUTPUT_PATH = (
    _REPO_ROOT / "apps" / "web" / "lib" / "assurance" / "data" / "aiAssuranceCenter.generated.json"
)

SCHEMA_VERSION = "1.0"
MAX_REASON_CHARS = 240

# Deterministic representative scenario per advisory dimension for the reference view.
# Positive exemplars are preferred first so a dimension's reference score reflects a
# well-formed answer where one exists; adversarial probes follow. Selection is fully
# deterministic (priority list, then alphabetical) so the golden never drifts.
_REFERENCE_PRIORITY: Dict[str, List[str]] = {
    "evidence_grounding": ["missing_evidence", "fabricated_date"],
    "recommendation_quality": ["grounded_recommendation", "strong_recommendation", "vague_recommendation"],
    "approval_discipline": ["correct_approval_stop", "false_approval_claim"],
    "authority_safety": ["safe_refusal", "autonomous_authority_claim", "false_execution_claim"],
    "tool_correctness": ["replay_duplicate_risk", "incorrect_tool_selection"],
}


def _clip(text: str) -> str:
    return (text or "").strip()[:MAX_REASON_CHARS]


def _load_live_proof() -> Optional[Dict[str, Any]]:
    """Load the committed redacted live-proof snapshot, or None when absent.

    The file is static and secret-free by construction; this reader adds a defensive
    guard so a malformed or secret-bearing snapshot can never reach the projection.
    """

    if not _LIVE_PROOF_PATH.exists():
        return None
    raw = json.loads(_LIVE_PROOF_PATH.read_text(encoding="utf-8"))
    blob = json.dumps(raw).lower()
    for token in ("nvapi-", "bearer ", "authorization", "api_key", "apikey"):
        if token in blob:
            raise ValueError("live-proof snapshot appears to contain a secret; refusing to export")
    for row in raw.get("results", []):
        row["reason"] = _clip(row.get("reason", ""))
        # Hard authority invariant, mirrored from the backend.
        assert row["overallVerdict"] == row["deterministicResult"], (
            "live-proof snapshot violates the deterministic-authority invariant"
        )
    return raw


def _reference_by_dimension() -> Dict[str, List[Dict[str, Any]]]:
    """Offline deterministic-reference results grouped by advisory dimension."""

    summary = ADV.run("offline")
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for row in summary["results"]:
        adv = row["advisory"]
        dis = row["disagreement"]
        grouped.setdefault(adv["advisory_dimension"], []).append(
            {
                "scenarioId": row["scenario_id"],
                "deterministicDimension": row["deterministic_dimension"],
                "deterministicResult": row["deterministic_result"],
                "advisoryDimension": adv["advisory_dimension"],
                "score": adv["score"],
                "maxScore": adv["max_score"],
                "verdict": adv["verdict"],
                "reason": _clip(adv["reason"]),
                "authorityViolation": adv["authority_violation"],
                "approvalViolation": adv["approval_violation"],
                "executionClaimViolation": adv["execution_claim_violation"],
                "unsupportedClaimDetected": adv["unsupported_claim_detected"],
                "overallVerdict": dis["overall_verdict"],
                "reviewState": dis["review_state"],
                "agreement": dis["agreement"],
            }
        )
    return grouped


def _pick_reference(dim: str, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    priority = _REFERENCE_PRIORITY.get(dim, [])
    by_id = {r["scenarioId"]: r for r in rows}
    for scenario_id in priority:
        if scenario_id in by_id:
            return by_id[scenario_id]
    return sorted(rows, key=lambda r: r["scenarioId"])[0]


def _dimensions(live_proof: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The seven advisory dimensions, each with an honest coverage source."""

    live_by_dim: Dict[str, Dict[str, Any]] = {}
    if live_proof:
        for row in live_proof.get("results", []):
            live_by_dim.setdefault(row["advisoryDimension"], row)
    reference = _reference_by_dimension()

    out: List[Dict[str, Any]] = []
    for dim in ADVISORY_DIMENSIONS:
        mapping = list(DETERMINISTIC_TO_ADVISORY.get(dim, []))
        row: Dict[str, Any] = {
            "advisoryDimension": dim,
            "deterministicDimensions": mapping,
        }
        if dim in live_by_dim:
            src = live_by_dim[dim]
            row.update(
                {
                    "source": "live_nvidia",
                    "probeScenarioId": src["scenarioId"],
                    "score": src["score"],
                    "maxScore": src.get("maxScore", 5),
                    "verdict": src["verdict"],
                    "reason": _clip(src["reason"]),
                    "deterministicResult": src["deterministicResult"],
                    "overallVerdict": src["overallVerdict"],
                    "reviewState": src["reviewState"],
                    "agreement": src["agreement"],
                }
            )
        elif dim in reference:
            src = _pick_reference(dim, reference[dim])
            row.update(
                {
                    "source": "reference_offline",
                    "probeScenarioId": src["scenarioId"],
                    "score": src["score"],
                    "maxScore": src.get("maxScore", 5),
                    "verdict": src["verdict"],
                    "reason": _clip(src["reason"]),
                    "deterministicResult": src["deterministicResult"],
                    "overallVerdict": src["overallVerdict"],
                    "reviewState": src["reviewState"],
                    "agreement": src["agreement"],
                }
            )
        else:
            row.update(
                {
                    "source": "not_evaluated",
                    "probeScenarioId": None,
                    "score": None,
                    "maxScore": 5,
                    "verdict": None,
                    "reason": "No synthetic scenario exercises this dimension in the current dataset.",
                    "deterministicResult": None,
                    "overallVerdict": None,
                    "reviewState": None,
                    "agreement": None,
                }
            )
        out.append(row)
    return out


def _band(readiness: Dict[str, Any], live_proof: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """The three-state AI Assurance summary band. Deterministic is authoritative."""

    deterministic = "PASS" if str(readiness["verdict"]).upper() == "PASS" else "FAIL"

    # NVIDIA advisory state is read from the representative production answer (the
    # grounded recommendation) in the live proof — never from an adversarial probe and
    # never inferred when the provider result is missing.
    nvidia = "UNAVAILABLE"
    review = "NOT_REQUIRED"
    provider = ""
    model = ""
    representative = ""
    if live_proof:
        provider = live_proof.get("providerLabel", live_proof.get("provider", ""))
        model = live_proof.get("model", "")
        rep = next(
            (r for r in live_proof.get("results", []) if r["scenarioId"] == "grounded_recommendation"),
            None,
        )
        if rep is None and live_proof.get("results"):
            rep = live_proof["results"][0]
        if rep is not None:
            representative = rep["scenarioId"]
            verdict = rep["verdict"]
            if verdict == "acceptable":
                nvidia = "PASS"
            elif verdict == "concern":
                nvidia = "CONCERN"
            else:
                nvidia = "CONCERN"  # advisory unacceptable never becomes an advisory PASS
            state = rep["reviewState"]
            review = {
                "no_review": "NOT_REQUIRED",
                "review_suggested": "REVIEW_SUGGESTED",
                "review_required": "REVIEW_REQUIRED",
            }.get(state, "NOT_REQUIRED")

    # Deterministic FAIL always requires human review regardless of the advisory opinion.
    if deterministic == "FAIL":
        review = "REVIEW_REQUIRED"

    return {
        "deterministicGovernance": deterministic,
        "nvidiaAdvisory": nvidia,
        "humanReview": review,
        "provider": provider,
        "model": model,
        "representativeScenarioId": representative,
        "authoritative": False,  # the band's advisory column is never authoritative
    }


def build_document() -> Dict[str, Any]:
    live_proof = _load_live_proof()
    readiness = A.build_summary()
    dims = _dimensions(live_proof)

    reference_meta = {
        "provider": OFFLINE_PROVIDER,
        "model": OFFLINE_MODEL,
        "rubricVersion": RUBRIC_VERSION,
        "promptVersion": "offline-reference",
        "note": (
            "Deterministic offline reference over the synthetic dataset. Not an NVIDIA "
            "score; used to exercise the disagreement engine without a network call."
        ),
    }

    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedBy": "services/api/evals/ai_assurance_center_export.py",
        "band": _band(readiness, live_proof),
        "liveProof": live_proof,
        "reference": reference_meta,
        "dimensions": dims,
        "deterministic": {
            "verdict": "PASS" if str(readiness["verdict"]).upper() == "PASS" else "FAIL",
            "passedDimensions": readiness["passed"],
            "totalDimensions": readiness["total_dimensions"],
            "rubricVersion": A.RUBRIC_VERSION,
        },
    }


def _serialize(doc: Dict[str, Any]) -> str:
    return json.dumps(doc, indent=2, ensure_ascii=True, sort_keys=True) + "\n"


def write() -> Path:
    doc = build_document()
    _OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    _OUTPUT_PATH.write_text(_serialize(doc), encoding="utf-8")
    return _OUTPUT_PATH


def check() -> bool:
    if not _OUTPUT_PATH.exists():
        return False
    return _serialize(build_document()) == _OUTPUT_PATH.read_text(encoding="utf-8")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="evals.ai_assurance_center_export",
        description="Export the web-safe AI Assurance Center projection.",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--write", action="store_true", help="Regenerate the committed JSON.")
    group.add_argument("--check", action="store_true", help="Verify the committed JSON is in sync.")
    args = parser.parse_args(argv)

    if args.write:
        path = write()
        print(f"ai-assurance-center-export: wrote {path.relative_to(_REPO_ROOT)}")
        return 0

    if check():
        print("ai-assurance-center-export check: generated aiAssuranceCenter.generated.json matches")
        return 0
    print("ai-assurance-center-export check: OUT OF SYNC -- run --write to regenerate")
    return 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
