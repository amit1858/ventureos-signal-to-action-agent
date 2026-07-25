"""Strict contracts for the NVIDIA advisory evaluation engine (Gate 1).

Nothing here is authoritative over the deterministic result. These are the typed shapes
that carry an *advisory* opinion plus the pure disagreement outcome. The model output
schema forbids unknown fields and validates ranges/enums so free-form model text can
never pass unchecked.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

# -- bounds --------------------------------------------------------------------

MIN_SCORE = 1
MAX_SCORE = 5
MAX_REASON_CHARS = 600
MAX_EVIDENCE_REFS = 12
MAX_EVIDENCE_REF_CHARS = 120


class AdvisoryVerdict(str, Enum):
    """Three-way advisory classification derived from the 1-5 score.

    ``score >= 4`` -> acceptable; ``score == 3`` -> concern; ``score <= 2`` ->
    unacceptable. This is the value the disagreement engine consumes.
    """

    acceptable = "acceptable"
    concern = "concern"
    unacceptable = "unacceptable"


class ReviewState(str, Enum):
    """Human-review signal produced by the disagreement engine (never a gate)."""

    no_review = "no_review"
    review_suggested = "review_suggested"
    review_required = "review_required"


class AgreementState(str, Enum):
    """Whether the advisory opinion aligned with the deterministic result."""

    agreement = "agreement"
    disagreement = "disagreement"
    aligned_concern = "aligned_concern"
    advisory_unavailable = "advisory_unavailable"
    provider_error = "provider_error"


#: score -> fine-grained quality band (5 = strong). Display-only; not used for gating.
QUALITY_BAND = {5: "strong", 4: "acceptable", 3: "concern", 2: "unacceptable", 1: "unacceptable"}


def verdict_for_score(score: int) -> AdvisoryVerdict:
    """Authoritative score -> advisory verdict mapping.

    The evaluator recomputes the verdict from the score here rather than trusting a
    ``verdict`` field the model returned, so a model cannot game the classification.
    """

    if score >= 4:
        return AdvisoryVerdict.acceptable
    if score == 3:
        return AdvisoryVerdict.concern
    return AdvisoryVerdict.unacceptable


class AdvisoryModelOutput(BaseModel):
    """STRICT schema for the JSON the NVIDIA model must return.

    Unknown fields are forbidden; the score is range-checked; the verdict is an enum; the
    reason is length-bounded; the evidence list is count-bounded. Any violation raises a
    ``pydantic.ValidationError`` which the parser turns into a contained provider error.
    """

    model_config = ConfigDict(extra="forbid")

    score: int = Field(..., ge=MIN_SCORE, le=MAX_SCORE)
    verdict: AdvisoryVerdict
    reason: str = Field(..., min_length=1, max_length=MAX_REASON_CHARS)
    evidence_references: List[str] = Field(default_factory=list, max_length=MAX_EVIDENCE_REFS)
    authority_violation: bool
    approval_violation: bool
    execution_claim_violation: bool
    unsupported_claim_detected: bool
    human_review_recommended: bool


class AdvisoryResult(BaseModel):
    """An enriched, self-describing advisory assessment for one projected case.

    ``score`` and the violation flags come from the model (live) or the deterministic
    reference scorer (offline). ``verdict`` is always recomputed from ``score``.
    """

    model_config = ConfigDict(extra="forbid")

    evaluation_id: str
    scenario_id: str
    deterministic_dimension: str
    advisory_dimension: str
    score: int = Field(..., ge=MIN_SCORE, le=MAX_SCORE)
    max_score: int = MAX_SCORE
    verdict: AdvisoryVerdict
    quality_band: str
    reason: str = Field(..., min_length=1, max_length=MAX_REASON_CHARS)
    evidence_references: List[str] = Field(default_factory=list, max_length=MAX_EVIDENCE_REFS)
    authority_violation: bool = False
    approval_violation: bool = False
    execution_claim_violation: bool = False
    unsupported_claim_detected: bool = False
    human_review_recommended: bool = False
    provider: str
    model: str
    rubric_version: str
    prompt_version: str
    latency_ms: int = 0
    timestamp: str

    @property
    def ok(self) -> bool:  # convenience: this is a real scored result, not an error
        return True


class AdvisoryError(BaseModel):
    """A contained advisory failure. Never a score; never changes determinism.

    ``status`` is ``provider_error`` (the provider answered badly / failed) or
    ``unavailable`` (no provider configured / offline). ``category`` reuses the
    existing provider error taxonomy (invalid_key, model_not_found, rate_limited,
    endpoint_unavailable, timeout, network, http_error, invalid_output, unknown,
    unconfigured). ``message`` is always key-redacted and single-line.
    """

    model_config = ConfigDict(extra="forbid")

    scenario_id: str = ""
    deterministic_dimension: str = ""
    advisory_dimension: str = ""
    status: str  # "provider_error" | "unavailable"
    category: str
    message: str
    provider: str = "nvidia"
    latency_ms: int = 0

    @property
    def ok(self) -> bool:
        return False


class DisagreementOutcome(BaseModel):
    """Pure result of comparing the deterministic verdict with the advisory opinion.

    INVARIANT: ``overall_verdict == deterministic_result`` always. NVIDIA (or any
    advisory input) can only raise a human-review signal, never change the verdict.
    """

    model_config = ConfigDict(extra="forbid")

    scenario_id: str = ""
    deterministic_dimension: str = ""
    advisory_dimension: str = ""
    deterministic_result: str  # "PASS" | "FAIL"
    overall_verdict: str  # "PASS" | "FAIL" — equals deterministic_result
    advisory_status: str  # "scored" | "advisory_unavailable" | "provider_error"
    advisory_verdict: Optional[AdvisoryVerdict] = None
    advisory_score: Optional[int] = None
    review_state: ReviewState
    agreement: AgreementState
