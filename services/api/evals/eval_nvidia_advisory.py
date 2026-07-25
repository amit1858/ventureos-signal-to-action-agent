"""VentureOS Release 2.3B — NVIDIA advisory evaluation runner (Gate 1).

Backend-only. Two modes:

    python services/api/evals/eval_nvidia_advisory.py            # offline (default)
    python services/api/evals/eval_nvidia_advisory.py --write    # (re)write offline golden
    python services/api/evals/eval_nvidia_advisory.py --check    # verify offline golden
    python services/api/evals/eval_nvidia_advisory.py --nvidia-live [--limit N]

Offline mode is deterministic, network-free, and CI-safe: it never calls NVIDIA and never
touches the committed deterministic goldens of ``eval_assurance``. Live mode is opt-in,
refuses to run when NVIDIA is unconfigured, never silently falls back to fake scores, and
writes a timestamped local artifact (git-ignored). The overall verdict is ALWAYS the
deterministic result; NVIDIA is advisory only.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from typing import Dict, List, Optional, Union

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # evals/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from evals.nvidia_advisory.artifacts import write_artifact  # noqa: E402
from evals.nvidia_advisory.contracts import AdvisoryError, AdvisoryResult, DisagreementOutcome  # noqa: E402
from evals.nvidia_advisory.disagreement import resolve_disagreement  # noqa: E402
from evals.nvidia_advisory.evaluator import evaluate_case_live, evaluate_case_offline  # noqa: E402
from evals.nvidia_advisory.projection import build_synthetic_cases  # noqa: E402
from evals.nvidia_advisory.prompt_builder import PROMPT_VERSION  # noqa: E402
from evals.nvidia_advisory.rubric import (  # noqa: E402
    OFFLINE_MODEL,
    OFFLINE_PROVIDER,
    RUBRIC_VERSION,
)

_DEFAULT_GOLDEN = os.path.join(_HERE, "golden", "nvidia_advisory_offline_golden.json")

Advisory = Union[AdvisoryResult, AdvisoryError]


def _git_commit() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=_API_DIR, capture_output=True, text=True, timeout=5,
        )
        return out.stdout.strip() or "unknown"
    except Exception:  # noqa: BLE001
        return "unknown"


def _golden_row(case, advisory: Advisory, outcome: DisagreementOutcome) -> Dict[str, object]:
    scored = isinstance(advisory, AdvisoryResult)
    return {
        "deterministic_dimension": case.deterministic_dimension,
        "advisory_dimension": case.advisory_dimension,
        "deterministic_result": case.deterministic_result,
        "advisory_status": outcome.advisory_status,
        "advisory_verdict": outcome.advisory_verdict.value if outcome.advisory_verdict else None,
        "advisory_score": outcome.advisory_score,
        "overall_verdict": outcome.overall_verdict,
        "review_state": outcome.review_state.value,
        "agreement": outcome.agreement.value,
        "authority_violation": advisory.authority_violation if scored else None,
        "approval_violation": advisory.approval_violation if scored else None,
        "execution_claim_violation": advisory.execution_claim_violation if scored else None,
        "unsupported_claim_detected": advisory.unsupported_claim_detected if scored else None,
    }


def run(mode: str, complete_fn=None, model: str = "", limit: Optional[int] = None) -> Dict[str, object]:
    cases = build_synthetic_cases()
    if limit is not None:
        cases = cases[:limit]

    started = datetime.now(timezone.utc)
    results: List[Dict[str, object]] = []
    golden: Dict[str, Dict[str, object]] = {}
    provider_failures = 0
    contract_failures = 0
    disagreements = 0
    review_suggested = 0
    review_required = 0
    scored = 0

    for case in cases:
        if mode == "live":
            advisory: Advisory = evaluate_case_live(case, complete_fn, model=model)
        else:
            advisory = evaluate_case_offline(case)

        outcome = resolve_disagreement(case.deterministic_result, advisory)
        golden[case.scenario_id] = _golden_row(case, advisory, outcome)

        if isinstance(advisory, AdvisoryResult):
            scored += 1
        elif isinstance(advisory, AdvisoryError):
            if advisory.category == "invalid_output":
                contract_failures += 1
            else:
                provider_failures += 1
        if outcome.agreement.value == "disagreement":
            disagreements += 1
        if outcome.review_state.value == "review_suggested":
            review_suggested += 1
        elif outcome.review_state.value == "review_required":
            review_required += 1

        row = {
            "scenario_id": case.scenario_id,
            "task": case.task,
            "deterministic_dimension": case.deterministic_dimension,
            "deterministic_result": case.deterministic_result,
            "advisory": advisory.model_dump(),
            "disagreement": outcome.model_dump(),
        }
        results.append(row)

    finished = datetime.now(timezone.utc)
    provider = "nvidia" if mode == "live" else OFFLINE_PROVIDER
    model_name = model if mode == "live" else OFFLINE_MODEL
    summary: Dict[str, object] = {
        "mode": mode,
        "rubric_version": RUBRIC_VERSION,
        "prompt_version": PROMPT_VERSION if mode == "live" else "offline-reference",
        "provider": provider,
        "model": model_name,
        "commit": _git_commit(),
        "started_at": started.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "finished_at": finished.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "duration_ms": int((finished - started).total_seconds() * 1000),
        "total_cases": len(cases),
        "scored": scored,
        "provider_failures": provider_failures,
        "contract_failures": contract_failures,
        "disagreement_count": disagreements,
        "review_suggested_count": review_suggested,
        "review_required_count": review_required,
        "results": results,
        "golden": golden,
    }
    # Hard invariant: overall verdict never differs from the deterministic result.
    for row in results:
        assert row["disagreement"]["overall_verdict"] == row["deterministic_result"], (
            "NVIDIA advisory must never change the deterministic verdict"
        )
    return summary


def _canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=True) + "\n"


def write_golden(path: str) -> Dict[str, object]:
    summary = run("offline")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(_canonical_json(summary["golden"]))
    return summary


def check_golden(path: str) -> tuple[bool, str]:
    summary = run("offline")
    current = _canonical_json(summary["golden"])
    if not os.path.exists(path):
        return False, f"golden file missing: {path}"
    with open(path, "r", encoding="utf-8") as handle:
        committed = handle.read()
    if current != committed:
        return False, "golden mismatch: regenerate with --write and review the diff"
    return True, "golden matches"


def _print_human(summary: Dict[str, object]) -> None:
    print("VentureOS NVIDIA Advisory Evaluation")
    print("")
    print(f"mode:     {summary['mode']}")
    print(f"provider: {summary['provider']}   model: {summary['model']}")
    print(f"rubric:   {summary['rubric_version']}   prompt: {summary['prompt_version']}")
    print("")
    for row in summary["results"]:
        d = row["disagreement"]
        adv = row["advisory"]
        score = adv.get("score", "-") if isinstance(adv, dict) else "-"
        verdict = d.get("advisory_verdict") or d.get("advisory_status")
        print(f"  [{row['deterministic_result']:4}] {row['scenario_id']:26} "
              f"advisory={str(verdict):13} score={score} "
              f"overall={d['overall_verdict']:4} review={d['review_state']}")
    print("")
    print(f"cases: {summary['total_cases']}  scored: {summary['scored']}  "
          f"provider_failures: {summary['provider_failures']}  contract_failures: {summary['contract_failures']}")
    print(f"disagreements: {summary['disagreement_count']}  "
          f"review_suggested: {summary['review_suggested_count']}  review_required: {summary['review_required_count']}")


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="VentureOS NVIDIA advisory evaluation")
    parser.add_argument("--write", action="store_true", help="(re)write the offline golden")
    parser.add_argument("--check", action="store_true", help="verify the offline golden")
    parser.add_argument("--out", default=_DEFAULT_GOLDEN, help="offline golden path")
    parser.add_argument("--json", action="store_true", help="print machine-readable summary")
    parser.add_argument("--nvidia-live", action="store_true", help="opt-in: call the live NVIDIA endpoint")
    parser.add_argument("--limit", type=int, default=None, help="run only the first N cases (live proof)")
    args = parser.parse_args(argv)

    if args.write:
        summary = write_golden(args.out)
        print(f"offline advisory golden written: {args.out}")
        print(json.dumps({k: summary[k] for k in ("total_cases", "scored", "disagreement_count",
                                                   "review_suggested_count", "review_required_count")}))
        return 0

    if args.check:
        ok, detail = check_golden(args.out)
        print(f"offline advisory golden check: {detail}")
        return 0 if ok else 1

    if args.nvidia_live:
        from config import get_settings
        from evals.nvidia_advisory.transport import NvidiaAdvisoryTransport

        transport = NvidiaAdvisoryTransport(get_settings())
        if not transport.configured():
            print("Live NVIDIA Evaluation: BLOCKED — NVIDIA is not configured "
                  "(set NVIDIA_API_KEY / NVIDIA_MODEL / NVIDIA_BASE_URL).")
            return 2
        summary = run("live", complete_fn=transport.complete, model=transport.model_name(), limit=args.limit)
        path = write_artifact(summary, commit=str(summary["commit"]))
        print(f"live advisory artifact: {path}")
        if args.json:
            # never include raw results verbatim in stdout json to keep it compact
            compact = {k: summary[k] for k in (
                "mode", "provider", "model", "commit", "total_cases", "scored",
                "provider_failures", "contract_failures", "disagreement_count",
                "review_suggested_count", "review_required_count", "duration_ms")}
            print(json.dumps(compact, sort_keys=True))
        else:
            _print_human(summary)
        return 0

    summary = run("offline")
    if args.json:
        print(json.dumps(summary, sort_keys=True, default=str))
    else:
        _print_human(summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
