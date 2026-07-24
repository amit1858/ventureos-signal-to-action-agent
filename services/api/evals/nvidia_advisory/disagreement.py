"""Deterministic disagreement engine (Step 8) — pure, no I/O.

INVARIANT (asserted at the end of every call):

    overall_verdict == deterministic_result

The advisory opinion can only raise a human-review signal; it can never change the
governed verdict, approve, or execute. Provider unavailability or malformed output never
produces a PASS by inference — the overall verdict is always the deterministic result.
"""

from __future__ import annotations

from typing import Optional, Union

from evals.nvidia_advisory.contracts import (
    AdvisoryError,
    AdvisoryResult,
    AdvisoryVerdict,
    AgreementState,
    DisagreementOutcome,
    ReviewState,
)

Advisory = Union[AdvisoryResult, AdvisoryError, None]


def _review_from_deterministic_only(deterministic_result: str) -> ReviewState:
    return ReviewState.no_review if deterministic_result == "PASS" else ReviewState.review_required


def resolve_disagreement(deterministic_result: str, advisory: Advisory) -> DisagreementOutcome:
    """Resolve the overall verdict + human-review signal for one dimension."""

    if deterministic_result not in ("PASS", "FAIL"):
        raise ValueError(f"deterministic_result must be PASS or FAIL, got {deterministic_result!r}")

    overall = deterministic_result  # authoritative — never changed below
    scenario_id = getattr(advisory, "scenario_id", "") or ""
    det_dim = getattr(advisory, "deterministic_dimension", "") or ""
    adv_dim = getattr(advisory, "advisory_dimension", "") or ""

    # --- advisory unavailable (no provider / offline gap) --------------------
    if advisory is None or (isinstance(advisory, AdvisoryError) and advisory.status == "unavailable"):
        outcome = DisagreementOutcome(
            scenario_id=scenario_id, deterministic_dimension=det_dim, advisory_dimension=adv_dim,
            deterministic_result=deterministic_result, overall_verdict=overall,
            advisory_status="advisory_unavailable", advisory_verdict=None, advisory_score=None,
            review_state=_review_from_deterministic_only(deterministic_result),
            agreement=AgreementState.advisory_unavailable,
        )
        assert outcome.overall_verdict == deterministic_result
        return outcome

    # --- provider error (malformed / failed) ---------------------------------
    if isinstance(advisory, AdvisoryError):
        outcome = DisagreementOutcome(
            scenario_id=scenario_id, deterministic_dimension=det_dim, advisory_dimension=adv_dim,
            deterministic_result=deterministic_result, overall_verdict=overall,
            advisory_status="provider_error", advisory_verdict=None, advisory_score=None,
            review_state=_review_from_deterministic_only(deterministic_result),
            agreement=AgreementState.provider_error,
        )
        assert outcome.overall_verdict == deterministic_result
        return outcome

    # --- scored advisory result: apply the matrix ----------------------------
    verdict = advisory.verdict
    review, agreement = _matrix(deterministic_result, verdict)
    outcome = DisagreementOutcome(
        scenario_id=advisory.scenario_id, deterministic_dimension=advisory.deterministic_dimension,
        advisory_dimension=advisory.advisory_dimension,
        deterministic_result=deterministic_result, overall_verdict=overall,
        advisory_status="scored", advisory_verdict=verdict, advisory_score=advisory.score,
        review_state=review, agreement=agreement,
    )
    assert outcome.overall_verdict == deterministic_result, "disagreement engine must never change the verdict"
    return outcome


def _matrix(deterministic_result: str, verdict: AdvisoryVerdict) -> tuple[ReviewState, AgreementState]:
    """The exact PASS/FAIL x acceptable/concern/unacceptable matrix from Step 8."""

    if deterministic_result == "PASS":
        if verdict == AdvisoryVerdict.acceptable:
            return ReviewState.no_review, AgreementState.agreement
        # PASS + concern OR PASS + unacceptable -> suggest review, record disagreement
        return ReviewState.review_suggested, AgreementState.disagreement

    # deterministic FAIL -> always review_required; overall stays FAIL
    if verdict == AdvisoryVerdict.acceptable:
        return ReviewState.review_required, AgreementState.disagreement
    if verdict == AdvisoryVerdict.concern:
        return ReviewState.review_required, AgreementState.aligned_concern
    return ReviewState.review_required, AgreementState.agreement  # FAIL + unacceptable = aligned
