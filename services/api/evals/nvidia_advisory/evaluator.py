"""Advisory evaluator orchestration (Step 7) — one projected case at a time.

* ``evaluate_case_offline`` runs the deterministic reference scorer (no network).
* ``evaluate_case_live`` builds the prompt, calls the injected completion function,
  measures latency, strictly parses the response, and returns a typed result — OR a
  contained :class:`AdvisoryError`. It NEVER raises and NEVER touches deterministic state.

The completion function is injected (``NvidiaAdvisoryTransport().complete`` in live mode, a
fake in tests) so no test ever performs a network call.
"""

from __future__ import annotations

import time
import urllib.error
from datetime import datetime, timezone
from typing import Callable, Optional, Union

from decision_providers.llm_base import classify_http_error, classify_transport_error
from evals.nvidia_advisory.contracts import (
    QUALITY_BAND,
    AdvisoryError,
    AdvisoryModelOutput,
    AdvisoryResult,
    verdict_for_score,
)
from evals.nvidia_advisory.projection import EvaluationCase
from evals.nvidia_advisory.prompt_builder import PROMPT_VERSION, build_advisory_prompt
from evals.nvidia_advisory.result_parser import parse_advisory_output
from evals.nvidia_advisory.rubric import RUBRIC_VERSION, score_offline

CompleteFn = Callable[[str, str], str]


def evaluate_case_offline(case: EvaluationCase) -> AdvisoryResult:
    """Deterministic offline reference assessment (default mode)."""

    return score_offline(case)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _result_from_output(
    case: EvaluationCase,
    output: AdvisoryModelOutput,
    *,
    model: str,
    latency_ms: int,
    timestamp: str,
) -> AdvisoryResult:
    verdict = verdict_for_score(output.score)  # authoritative: recomputed from score
    return AdvisoryResult(
        evaluation_id=f"{case.scenario_id}:{case.advisory_dimension}",
        scenario_id=case.scenario_id,
        deterministic_dimension=case.deterministic_dimension,
        advisory_dimension=case.advisory_dimension,
        score=output.score,
        verdict=verdict,
        quality_band=QUALITY_BAND[output.score],
        reason=output.reason,
        evidence_references=list(output.evidence_references),
        authority_violation=output.authority_violation,
        approval_violation=output.approval_violation,
        execution_claim_violation=output.execution_claim_violation,
        unsupported_claim_detected=output.unsupported_claim_detected,
        human_review_recommended=output.human_review_recommended,
        provider="nvidia",
        model=model,
        rubric_version=RUBRIC_VERSION,
        prompt_version=PROMPT_VERSION,
        latency_ms=latency_ms,
        timestamp=timestamp,
    )


def evaluate_case_live(
    case: EvaluationCase,
    complete_fn: CompleteFn,
    *,
    model: str,
    now_iso: Optional[str] = None,
) -> Union[AdvisoryResult, AdvisoryError]:
    """Run one live advisory evaluation. Fails closed to a contained error; never raises."""

    prompt = build_advisory_prompt(case)
    timestamp = now_iso or _now_iso()
    start = time.perf_counter()

    def _err(status: str, category: str, message: str, latency: int) -> AdvisoryError:
        from decision_providers.llm_base import _redact_keys

        return AdvisoryError(
            scenario_id=case.scenario_id,
            deterministic_dimension=case.deterministic_dimension,
            advisory_dimension=case.advisory_dimension,
            status=status, category=category, message=_redact_keys(message)[:240],
            provider="nvidia", latency_ms=latency,
        )

    try:
        raw = complete_fn(prompt.system, prompt.user)
    except urllib.error.HTTPError as exc:
        latency = int((time.perf_counter() - start) * 1000)
        category, message = classify_http_error(exc)
        return _err("provider_error", category, message, latency)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        latency = int((time.perf_counter() - start) * 1000)
        category, message = classify_transport_error(exc)
        return _err("provider_error", category, message, latency)
    except Exception as exc:  # noqa: BLE001 -- contain anything; never leak internals
        latency = int((time.perf_counter() - start) * 1000)
        return _err("provider_error", "unknown", f"unexpected error: {type(exc).__name__}", latency)

    latency = int((time.perf_counter() - start) * 1000)
    parsed = parse_advisory_output(
        raw,
        scenario_id=case.scenario_id,
        deterministic_dimension=case.deterministic_dimension,
        advisory_dimension=case.advisory_dimension,
    )
    if isinstance(parsed, AdvisoryError):
        parsed.latency_ms = latency
        return parsed
    return _result_from_output(case, parsed, model=model, latency_ms=latency, timestamp=timestamp)
