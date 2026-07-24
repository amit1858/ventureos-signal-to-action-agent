"""VentureOS Release 2.3B — NVIDIA Advisory Evaluation engine (Gate 1, backend-only).

A live-capable NVIDIA *advisory* evaluator that grades the governed slice on semantic
quality. It is STRUCTURALLY advisory:

    overall_verdict = deterministic_result        # always, no exceptions

NVIDIA can never convert a deterministic FAIL to PASS, approve, execute, change a
recommendation or mission priority, mutate CRM, change governance state, write to the
audit ledger, or become a runtime dependency for deterministic evaluation. The
deterministic assurance framework (``evals.eval_assurance``) remains untouched and
authoritative; this package is additive.

Two execution modes:

* **offline** (default, CI-safe): no network, no key, a deterministic reference scorer.
* **live** (opt-in): calls the configured NVIDIA NIM endpoint; any failure fails closed
  to a contained :class:`AdvisoryError` and never alters the deterministic result.
"""

from evals.nvidia_advisory.contracts import (  # noqa: F401
    AdvisoryError,
    AdvisoryModelOutput,
    AdvisoryResult,
    AdvisoryVerdict,
    AgreementState,
    DisagreementOutcome,
    ReviewState,
    verdict_for_score,
)
from evals.nvidia_advisory.disagreement import resolve_disagreement  # noqa: F401
from evals.nvidia_advisory.evaluator import (  # noqa: F401
    evaluate_case_live,
    evaluate_case_offline,
)
from evals.nvidia_advisory.projection import EvaluationCase, build_synthetic_cases  # noqa: F401
from evals.nvidia_advisory.prompt_builder import (  # noqa: F401
    PROMPT_VERSION,
    AdvisoryPrompt,
    build_advisory_prompt,
)
from evals.nvidia_advisory.rubric import (  # noqa: F401
    ADVISORY_DIMENSIONS,
    DETERMINISTIC_TO_ADVISORY,
    RUBRIC_VERSION,
)

__all__ = [
    "AdvisoryError",
    "AdvisoryModelOutput",
    "AdvisoryResult",
    "AdvisoryVerdict",
    "AgreementState",
    "DisagreementOutcome",
    "ReviewState",
    "verdict_for_score",
    "resolve_disagreement",
    "evaluate_case_live",
    "evaluate_case_offline",
    "EvaluationCase",
    "build_synthetic_cases",
    "PROMPT_VERSION",
    "AdvisoryPrompt",
    "build_advisory_prompt",
    "ADVISORY_DIMENSIONS",
    "DETERMINISTIC_TO_ADVISORY",
    "RUBRIC_VERSION",
]
