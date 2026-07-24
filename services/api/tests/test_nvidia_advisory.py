"""Tests for the NVIDIA advisory evaluation engine (Gate 1).

Repo convention: ``test_*`` functions with a ``_check`` accumulator so the file is runnable
directly for the plain-Python regression harness. Here ``_check`` ALSO asserts, so the same
tests are genuinely enforced (and counted) under ``pytest``. NVIDIA is always mocked — no
test performs a network call.

Run directly:  python services/api/tests/test_nvidia_advisory.py
Run via pytest: pytest services/api/tests/test_nvidia_advisory.py -q
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
from types import SimpleNamespace

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from evals import eval_assurance as ASSURANCE  # noqa: E402
from evals import eval_nvidia_advisory as RUNNER  # noqa: E402
from evals.nvidia_advisory.contracts import (  # noqa: E402
    AdvisoryError,
    AdvisoryResult,
    AdvisoryVerdict,
    AgreementState,
    ReviewState,
    verdict_for_score,
)
from evals.nvidia_advisory.disagreement import resolve_disagreement  # noqa: E402
from evals.nvidia_advisory.evaluator import evaluate_case_live, evaluate_case_offline  # noqa: E402
from evals.nvidia_advisory.projection import build_synthetic_cases  # noqa: E402
from evals.nvidia_advisory.result_parser import parse_advisory_output  # noqa: E402
from evals.nvidia_advisory.rubric import RUBRIC_VERSION  # noqa: E402
from evals.nvidia_advisory.transport import NvidiaAdvisoryTransport  # noqa: E402

_RESULTS: list[tuple[str, bool, str]] = []
_FAKE_KEY = "nvapi-FAKE0123456789abcdef"


def _check(name: str, cond: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(cond), detail))
    assert cond, f"{name}: {detail}"  # genuine enforcement under pytest


def _case():
    return build_synthetic_cases()[0]


def _valid_json(score: int, **overrides) -> str:
    body = {
        "score": score,
        "verdict": verdict_for_score(score).value,
        "reason": "Grounded in the supplied evidence with no unsupported claim.",
        "evidence_references": ["renewal_date", "governed_status"],
        "authority_violation": False,
        "approval_violation": False,
        "execution_claim_violation": False,
        "unsupported_claim_detected": False,
        "human_review_recommended": False,
    }
    body.update(overrides)
    return json.dumps(body)


def _make_result(score: int) -> AdvisoryResult:
    parsed = parse_advisory_output(_valid_json(score), scenario_id="s", advisory_dimension="a")
    assert isinstance(parsed, AdvisoryError) is False
    return AdvisoryResult(
        evaluation_id="s:a", scenario_id="s", deterministic_dimension="d", advisory_dimension="a",
        score=parsed.score, verdict=verdict_for_score(parsed.score), quality_band="x",
        reason=parsed.reason, evidence_references=list(parsed.evidence_references),
        authority_violation=parsed.authority_violation, approval_violation=parsed.approval_violation,
        execution_claim_violation=parsed.execution_claim_violation,
        unsupported_claim_detected=parsed.unsupported_claim_detected,
        human_review_recommended=parsed.human_review_recommended,
        provider="nvidia", model="m", rubric_version=RUBRIC_VERSION, prompt_version="p",
        latency_ms=1, timestamp="2026-01-01T00:00:00Z",
    )


# --------------------------------------------------------------------------- #
# Provider state
# --------------------------------------------------------------------------- #

def _settings(key: str = "", model: str = "nvidia/test-model", base: str = "https://x/v1"):
    return SimpleNamespace(nvidia_api_key=key, nvidia_model=model, nvidia_base_url=base, nvidia_timeout=5.0)


def test_provider_absent_is_not_configured() -> None:
    t = NvidiaAdvisoryTransport(_settings(key=""))
    _check("unconfigured provider reports not configured", t.configured() is False)


def test_provider_configured_resolves_names() -> None:
    t = NvidiaAdvisoryTransport(_settings(key=_FAKE_KEY, model="nvidia/nemotron", base="https://nim/v1"))
    _check("configured provider reports configured", t.configured() is True)
    _check("model resolves from settings", t.model_name() == "nvidia/nemotron")
    _check("base url resolves from settings", t.base_url() == "https://nim/v1")


def test_api_key_never_appears_in_repr() -> None:
    t = NvidiaAdvisoryTransport(_settings(key=_FAKE_KEY))
    _check("api key not in repr", _FAKE_KEY not in repr(t))
    _check("configured true but key stays private", t.configured() is True and _FAKE_KEY not in str(t))


# --------------------------------------------------------------------------- #
# Valid responses (scores 1-5), verdict authority
# --------------------------------------------------------------------------- #

def test_valid_scores_produce_typed_results() -> None:
    case = _case()
    for score, expected in [(5, "acceptable"), (4, "acceptable"), (3, "concern"), (2, "unacceptable"), (1, "unacceptable")]:
        out = evaluate_case_live(case, lambda s, u, sc=score: _valid_json(sc), model="m")
        _check(f"score {score} -> AdvisoryResult", isinstance(out, AdvisoryResult), type(out).__name__)
        _check(f"score {score} verdict recomputed = {expected}", out.verdict.value == expected, out.verdict.value)


def test_verdict_authority_overrides_model_verdict() -> None:
    # Model claims 'acceptable' but score is 1 -> engine must recompute 'unacceptable'.
    case = _case()
    smuggled = _valid_json(1, verdict="acceptable")
    out = evaluate_case_live(case, lambda s, u: smuggled, model="m")
    _check("score 1 forced verdict acceptable is overridden", isinstance(out, AdvisoryResult) and out.verdict == AdvisoryVerdict.unacceptable)


def test_violation_flags_pass_through() -> None:
    case = _case()
    out = evaluate_case_live(case, lambda s, u: _valid_json(2, authority_violation=True, execution_claim_violation=True), model="m")
    _check("authority violation surfaced", isinstance(out, AdvisoryResult) and out.authority_violation is True)
    _check("execution claim violation surfaced", out.execution_claim_violation is True)


# --------------------------------------------------------------------------- #
# Invalid responses -> contained invalid_output error (never raises)
# --------------------------------------------------------------------------- #

def _parse_err(raw: str) -> AdvisoryError:
    out = parse_advisory_output(raw, scenario_id="s", advisory_dimension="a")
    return out  # type: ignore[return-value]


def test_invalid_outputs_fail_closed() -> None:
    cases = {
        "malformed json": "{not json",
        "markdown wrapped": "```json\n" + _valid_json(4) + "\n```",
        "missing field": json.dumps({"score": 4, "reason": "x"}),
        "extra field": _valid_json(4, sneaky_extra="danger"),
        "invalid score high": _valid_json(4).replace('"score": 4', '"score": 6'),
        "invalid score low": _valid_json(4).replace('"score": 4', '"score": 0'),
        "invalid enum verdict": _valid_json(4, verdict="totally_fine"),
        "empty reason": _valid_json(4, reason=""),
        "oversized reason": _valid_json(4, reason="x" * 601),
        "empty response": "",
        "not an object": "[1, 2, 3]",
    }
    for name, raw in cases.items():
        out = _parse_err(raw)
        _check(f"{name} -> AdvisoryError", isinstance(out, AdvisoryError), type(out).__name__)
        _check(f"{name} -> invalid_output category", isinstance(out, AdvisoryError) and out.category == "invalid_output", getattr(out, "category", "?"))


def test_empty_response_via_evaluator_is_error() -> None:
    case = _case()
    out = evaluate_case_live(case, lambda s, u: "", model="m")
    _check("empty provider response -> AdvisoryError", isinstance(out, AdvisoryError))
    _check("empty provider response -> invalid_output", isinstance(out, AdvisoryError) and out.category == "invalid_output")


# --------------------------------------------------------------------------- #
# Transport / HTTP errors -> provider_error (NOT invalid_output), key redacted
# --------------------------------------------------------------------------- #

def _http(code: int):
    def _raise(system: str, user: str):
        raise urllib.error.HTTPError("https://nim/v1", code, f"HTTP {code}", {}, None)
    return _raise


def test_http_errors_are_provider_errors() -> None:
    case = _case()
    for code in (401, 429, 500):
        out = evaluate_case_live(case, _http(code), model="m")
        _check(f"HTTP {code} -> AdvisoryError", isinstance(out, AdvisoryError), type(out).__name__)
        _check(f"HTTP {code} -> provider_error status", isinstance(out, AdvisoryError) and out.status == "provider_error")
        _check(f"HTTP {code} not misclassified as invalid_output", isinstance(out, AdvisoryError) and out.category != "invalid_output")


def test_timeout_and_urlerror_are_provider_errors() -> None:
    case = _case()

    def _timeout(system, user):
        raise TimeoutError("slow")

    def _urlerr(system, user):
        raise urllib.error.URLError("refused")

    for name, fn in [("timeout", _timeout), ("urlerror", _urlerr)]:
        out = evaluate_case_live(case, fn, model="m")
        _check(f"{name} -> provider_error", isinstance(out, AdvisoryError) and out.status == "provider_error")


def test_api_key_never_leaks_into_error_message() -> None:
    case = _case()

    def _leaky(system, user):
        raise Exception(f"boom with {_FAKE_KEY} inside")

    out = evaluate_case_live(case, _leaky, model="m")
    _check("unexpected error contained", isinstance(out, AdvisoryError))
    _check("api key not present in error message", _FAKE_KEY not in out.message, out.message)


# --------------------------------------------------------------------------- #
# Disagreement matrix (all quadrants) + unavailable + provider_error
# --------------------------------------------------------------------------- #

def test_disagreement_matrix() -> None:
    expectations = [
        ("PASS", 5, "PASS", ReviewState.no_review, AgreementState.agreement),
        ("PASS", 3, "PASS", ReviewState.review_suggested, AgreementState.disagreement),
        ("PASS", 2, "PASS", ReviewState.review_suggested, AgreementState.disagreement),
        ("FAIL", 5, "FAIL", ReviewState.review_required, AgreementState.disagreement),
        ("FAIL", 3, "FAIL", ReviewState.review_required, AgreementState.aligned_concern),
        ("FAIL", 2, "FAIL", ReviewState.review_required, AgreementState.agreement),
    ]
    for det, score, overall, review, agree in expectations:
        out = resolve_disagreement(det, _make_result(score))
        _check(f"{det}+score{score} overall={overall}", out.overall_verdict == overall, out.overall_verdict)
        _check(f"{det}+score{score} review={review.value}", out.review_state == review, out.review_state.value)
        _check(f"{det}+score{score} agreement={agree.value}", out.agreement == agree, out.agreement.value)


def test_disagreement_unavailable_and_provider_error() -> None:
    unavailable = AdvisoryError(status="unavailable", category="unavailable", message="no provider")
    err = AdvisoryError(status="provider_error", category="timeout", message="slow")
    for det in ("PASS", "FAIL"):
        o1 = resolve_disagreement(det, unavailable)
        _check(f"{det} unavailable overall=deterministic", o1.overall_verdict == det)
        _check(f"{det} unavailable agreement", o1.agreement == AgreementState.advisory_unavailable)
        _check(f"{det} unavailable review from deterministic only",
               o1.review_state == (ReviewState.no_review if det == "PASS" else ReviewState.review_required))
        o2 = resolve_disagreement(det, err)
        _check(f"{det} provider_error overall=deterministic", o2.overall_verdict == det)
        _check(f"{det} provider_error agreement", o2.agreement == AgreementState.provider_error)
    o3 = resolve_disagreement("PASS", None)
    _check("None advisory treated as unavailable", o3.agreement == AgreementState.advisory_unavailable)


# --------------------------------------------------------------------------- #
# Invariants
# --------------------------------------------------------------------------- #

def test_fail_never_becomes_pass() -> None:
    for score in (1, 2, 3, 4, 5):
        out = resolve_disagreement("FAIL", _make_result(score))
        _check(f"FAIL stays FAIL for advisory score {score}", out.overall_verdict == "FAIL", out.overall_verdict)
    for adv in (AdvisoryError(status="unavailable", category="unavailable", message="x"),
                AdvisoryError(status="provider_error", category="timeout", message="x"), None):
        out = resolve_disagreement("FAIL", adv)
        _check("FAIL stays FAIL for non-scored advisory", out.overall_verdict == "FAIL")


def test_offline_mode_is_deterministic_and_networkless() -> None:
    summary = RUNNER.run("offline")
    _check("offline provider is deterministic-reference", summary["provider"] == "deterministic-reference")
    _check("offline 12 cases", summary["total_cases"] == 12, str(summary["total_cases"]))
    for row in summary["results"]:
        _check(f"{row['scenario_id']} overall == deterministic",
               row["disagreement"]["overall_verdict"] == row["deterministic_result"])
        _check(f"{row['scenario_id']} advisory provider is deterministic-reference",
               row["advisory"]["provider"] == "deterministic-reference")


def test_offline_golden_matches() -> None:
    ok, detail = RUNNER.check_golden(RUNNER._DEFAULT_GOLDEN)
    _check("committed advisory golden matches", ok, detail)


def test_deterministic_assurance_golden_unchanged() -> None:
    ok, detail = ASSURANCE.check_golden(ASSURANCE._DEFAULT_GOLDEN)
    _check("eval_assurance deterministic golden still matches", ok, detail)


def test_offline_golden_has_no_secret_or_path() -> None:
    with open(RUNNER._DEFAULT_GOLDEN, "r", encoding="utf-8") as handle:
        text = handle.read()
    low = text.lower()
    for token in ("nvapi-", "bearer", "authorization", "api_key"):
        _check(f"advisory golden has no {token}", token not in low)
    _check("advisory golden has no windows path", ":\\" not in text and "c:/" not in low)


_TESTS = [
    test_provider_absent_is_not_configured,
    test_provider_configured_resolves_names,
    test_api_key_never_appears_in_repr,
    test_valid_scores_produce_typed_results,
    test_verdict_authority_overrides_model_verdict,
    test_violation_flags_pass_through,
    test_invalid_outputs_fail_closed,
    test_empty_response_via_evaluator_is_error,
    test_http_errors_are_provider_errors,
    test_timeout_and_urlerror_are_provider_errors,
    test_api_key_never_leaks_into_error_message,
    test_disagreement_matrix,
    test_disagreement_unavailable_and_provider_error,
    test_fail_never_becomes_pass,
    test_offline_mode_is_deterministic_and_networkless,
    test_offline_golden_matches,
    test_deterministic_assurance_golden_unchanged,
    test_offline_golden_has_no_secret_or_path,
]


def run() -> tuple[int, int]:
    del _RESULTS[:]
    for test in _TESTS:
        try:
            test()
        except AssertionError:
            pass  # already recorded by _check
        except Exception as exc:  # noqa: BLE001
            _check(f"{test.__name__} raised", False, f"{type(exc).__name__}: {exc}")
    passed = sum(1 for _, ok, _ in _RESULTS if ok)
    failed = sum(1 for _, ok, _ in _RESULTS if not ok)
    for name, ok, detail in _RESULTS:
        line = f"[{'PASS' if ok else 'FAIL'}] {name}"
        if not ok and detail:
            line += f"  -- {detail}"
        print(line)
    print(f"\nNVIDIA Advisory: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
