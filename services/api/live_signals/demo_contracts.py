"""Typed contracts for the additive Demo Journey Orchestrator.

These are presentation- and secret-free typed results that compose the ALREADY
validated public interfaces (detector -> mission service -> governance adapter ->
explainability) into two honest demo modes. Nothing here re-implements engine logic;
it only shapes what the orchestrator observed.

Honest distinctions this module makes explicit:

* live signal vs synthetic signal            -> ``live_signal``
* live single-source vs controlled offline   -> ``journey_mode`` + ``live_multi_source``
* simulated execution vs real execution      -> ``simulated`` (+ ``crm_writeback_performed``)
* provider narrative vs deterministic        -> ``provider_status`` (on the explanation)
* this-journey validation vs Eval-Pack       -> ``journey_validation`` vs ``baseline_evaluation``
* CRM write-back disabled vs performed        -> ``crm_writeback_enabled`` / ``crm_writeback_performed``
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import Field

from live_signals.explainability import ExplanationResult
from live_signals.mission_contracts import MissionModel

# -- verdict vocabulary (shared with the Evaluation Pack semantics) -----------

VERDICT_PASS = "pass"
VERDICT_PASS_WITH_OPTIONAL_SKIPS = "pass_with_optional_skips"
VERDICT_FAIL = "fail"


class JourneyMode(str, Enum):
    """Which honest demo journey the caller is running."""

    live_single_source = "live_single_source"
    controlled_governed_execution = "controlled_governed_execution"


class ExecutionMode(str, Enum):
    """What the journey is permitted to reach.

    * ``governance_stop_only`` -- a real single HubSpot source resolves to a governed
      identity stop; no execution and no receipt are possible.
    * ``simulation_only`` -- with explicit human approval a single SIMULATED receipt may
      be produced; no real CRM write-back ever occurs.
    """

    governance_stop_only = "governance_stop_only"
    simulation_only = "simulation_only"


class DemoJourneyError(ValueError):
    """Fail-closed orchestrator error raised BEFORE returning a misleading result.

    Raised for broken evidence linkage, provenance/mode mismatch, missing durable
    dependencies for controlled execution, an inconsistent governed state, or any
    attempt to represent controlled corroboration as live multi-source, a simulated
    receipt as real, or CRM write-back as enabled/performed.
    """


class BaselineEvaluationSummary(MissionModel):
    """Optional, precomputed result from the committed Evaluation Pack.

    It is an INPUT the caller may pass in. The orchestrator never runs the full
    evaluation suite to produce it -- doing so would derive a per-journey verdict from
    unrelated canonical scenarios. It is surfaced alongside, and kept distinct from,
    the per-journey ``JourneyValidationResult``.
    """

    checks_passed: int
    checks_total: int
    verdict: str
    provider_evaluation_status: str = "unconfigured"
    source_reference: str = ""


class JourneyValidationResult(MissionModel):
    """Validation of THIS specific journey, generated from its real typed results.

    Every boolean is derived from the actual event / mission / integration result /
    explanation -- never hard-coded and never taken from the Evaluation Pack.
    """

    evidence_linkage_valid: bool
    provenance_valid: bool
    approval_consistent: bool
    execution_consistent: bool
    receipt_consistent: bool
    audit_chain_valid: bool
    narrative_grounded: bool
    crm_writeback_absent: bool
    verdict: str
    violations: List[str] = Field(default_factory=list)


class DemoJourneyResult(MissionModel):
    """One assembled, honest demo journey outcome."""

    schema_version: str = "1.0"
    journey_id: str
    journey_mode: str
    execution_mode: str
    account_id: str
    signal_summary: str
    mission_summary: str
    governance_outcome: str
    approval_status: str
    execution_status: str
    explanation: ExplanationResult
    evidence_references: List[str] = Field(default_factory=list)
    audit_reference: Optional[str] = None
    journey_validation: JourneyValidationResult
    baseline_evaluation: Optional[BaselineEvaluationSummary] = None
    provider_status: str
    simulated: bool
    live_signal: bool
    live_multi_source: bool
    crm_writeback_enabled: bool = False
    crm_writeback_performed: bool = False
    warnings: List[str] = Field(default_factory=list)


__all__ = [
    "VERDICT_PASS",
    "VERDICT_PASS_WITH_OPTIONAL_SKIPS",
    "VERDICT_FAIL",
    "JourneyMode",
    "ExecutionMode",
    "DemoJourneyError",
    "BaselineEvaluationSummary",
    "JourneyValidationResult",
    "DemoJourneyResult",
]
