"""Additive, read-only presentation layer over a governed ``DemoJourneyResult``.

Architecture::

    DemoJourneyResult  ->  PresentationViewModel  ->  CLI renderer

This module is a CONSUMER only. It never runs signal detection, generates missions,
invokes governance, infers approval, executes actions, creates audit records, invokes
the Evaluation Pack, calls HubSpot, calls a provider, changes provider state, alters
governed facts, or modifies any production surface. Every field is a faithful, honest
projection of the already-governed typed result -- the presentation can never upgrade a
governed stop into an execution, a simulated receipt into a real one, or controlled
offline corroboration into a live multi-source integration.

The builder ``from_demo_journey_result`` is a pure function: it reads a
``DemoJourneyResult`` and returns a frozen ``PresentationViewModel``. It mutates
nothing.
"""

from __future__ import annotations

from typing import Dict, List

from pydantic import BaseModel, ConfigDict, Field

from live_signals.demo_contracts import (
    DemoJourneyResult,
    JourneyMode,
    VERDICT_FAIL,
    VERDICT_PASS,
    VERDICT_PASS_WITH_OPTIONAL_SKIPS,
)
from live_signals.mission_governance_adapter import (
    BLOCKED,
    EXECUTED,
    FAILED,
    REJECTED,
    STOPPED_AWAITING_APPROVAL,
    STOPPED_IDENTITY_UNVERIFIED,
)

# -- honest safety-label vocabulary (presentation-only strings) ----------------

LABEL_LIVE_SIGNAL = "Live signal"
LABEL_SINGLE_SOURCE_IDENTITY = "Single-source identity"
LABEL_CONTROLLED_OFFLINE = "Controlled offline corroboration"
LABEL_HUMAN_APPROVED = "Human approved"
LABEL_GOVERNED_STOP = "Governed stop"
LABEL_SIMULATED_EXECUTION = "Simulated execution"
LABEL_NO_CRM_WRITEBACK = "No CRM write-back"
LABEL_NVIDIA_GROUNDED = "NVIDIA grounded"
LABEL_NVIDIA_UNCONFIGURED = "NVIDIA unconfigured"
LABEL_DETERMINISTIC_FALLBACK = "Deterministic fallback"
LABEL_AUDIT_VERIFIED = "Audit verified"
LABEL_REPLAY_NO_DUPLICATE = "Replay -- no duplicate action"
LABEL_NOT_LIVE_MULTI_SOURCE = "Not live multi-source execution"

STATUS_TONE_SUCCESS = "success"
STATUS_TONE_CAUTION = "caution"

# Phrases that must never appear in any projected/rendered presentation text. The
# presentation may only describe what the governed result actually proved. This list
# mirrors the approved forbidden-claims set exactly.
FORBIDDEN_PHRASES = (
    "autonomous execution",
    "production execution",
    "live multi-source identity",
    "crm action completed",
    "fully automated",
    "ai approved",
    "nvidia decided",
    "real crm write-back",
    "action executed in hubspot",
)


class PresentationViewModel(BaseModel):
    """Frozen, typed, read-only projection of one governed journey.

    No field carries or implies product authority. Constructing this model never
    changes governed state; ``model_config`` is frozen so the view model itself cannot
    be mutated after projection.
    """

    model_config = ConfigDict(frozen=True)

    schema_version: str = "1.0"
    headline: str
    primary_narrative: str
    recommendation: str
    journey_label: str
    governance_label: str
    approval_label: str
    execution_label: str
    evidence_items: List[str] = Field(default_factory=list)
    audit_label: str
    replay_label: str
    provider_label: str
    safety_disclosures: List[str] = Field(default_factory=list)
    status_tone: str
    technical_details: List[str] = Field(default_factory=list)
    source_result_reference: str


# -- pure projection helpers ---------------------------------------------------


class PresentationEvidenceContext(BaseModel):
    """Optional, presentation-only evidence about SEPARATELY validated capability.

    This carries NO product authority. It never mutates ``DemoJourneyResult``, never
    changes governance or execution state, and must never be used to infer replay from
    simulation. It exists only so a presenter can honestly state that replay safety was
    proven during a separate controlled validation (for example, the Stage-2 end-to-end
    run) rather than observed inside one individual serialized journey result.

    When absent, the presenter defaults to honest "not observed in this result"
    behavior.
    """

    model_config = ConfigDict(frozen=True)

    replay_validated: bool = False
    receipt_reused: bool = False
    duplicate_action_prevented: bool = False
    audit_revalidated: bool = False
    validation_reference: str = ""


def _replay_label(
    result: DemoJourneyResult, evidence_context: "PresentationEvidenceContext | None"
) -> str:
    facts = result.explanation.governed_facts
    # 1) Observed replay INSIDE this individual result (typed evidence only).
    if facts.replayed:
        return (
            "Observed in this journey result -- the governed journey was replayed and "
            "the same receipt was reused."
        )
    # 2) Separately validated capability, supplied explicitly by the caller.
    if evidence_context is not None and evidence_context.replay_validated:
        return (
            "Validated separately -- the same receipt was reused and no duplicate "
            "action was created."
        )
    # 3) Executed once here, but this fixture carries no replay observation.
    if result.simulated and facts.receipt_present:
        return "Not observed in this journey result."
    # 4) Nothing was executed (for example, a governed identity stop).
    return "Not applicable -- nothing was executed."


def _provider_label(result: DemoJourneyResult) -> str:
    """Honest provider mapping. NVIDIA is only ever an explanation provider."""
    explanation = result.explanation
    if explanation.provider_used and explanation.validation_status != "rejected":
        return LABEL_NVIDIA_GROUNDED
    if explanation.provider_status == "error" or explanation.validation_status == "rejected":
        return LABEL_DETERMINISTIC_FALLBACK
    if explanation.fallback_used:
        return LABEL_DETERMINISTIC_FALLBACK
    return LABEL_NVIDIA_UNCONFIGURED


def _governance_label(result: DemoJourneyResult) -> str:
    outcome = result.governance_outcome
    if outcome == STOPPED_IDENTITY_UNVERIFIED:
        return "Governed stop -- identity not corroborated"
    if outcome == STOPPED_AWAITING_APPROVAL:
        return "Governed stop -- awaiting human approval"
    if outcome == REJECTED:
        return "Stopped -- human rejected the action"
    if outcome == EXECUTED:
        return "Proceeded -- governance cleared after explicit human approval"
    if outcome in (BLOCKED, FAILED):
        return "Governed stop -- policy blocked the action"
    return f"Governed outcome: {outcome}"


def _approval_label(result: DemoJourneyResult) -> str:
    outcome = result.governance_outcome
    if outcome == STOPPED_IDENTITY_UNVERIFIED:
        return "Not reached -- the journey stopped at identity verification"
    if outcome == STOPPED_AWAITING_APPROVAL:
        return "Awaiting explicit human approval"
    if outcome == REJECTED:
        return "Human rejected the action"
    if outcome == EXECUTED:
        return "Human approved (explicitly supplied)"
    return f"Approval status: {result.approval_status}"


def _execution_label(result: DemoJourneyResult) -> str:
    if result.simulated and result.explanation.governed_facts.receipt_present:
        return "Simulated execution -- one receipt recorded (no CRM write-back)"
    return "No execution -- no receipt was produced"


def _audit_label(result: DemoJourneyResult) -> str:
    if result.simulated:
        if result.journey_validation.audit_chain_valid:
            return "Audit chain verified"
        return "Audit chain could not be verified"
    return "Not applicable -- no execution occurred"


def _journey_label(result: DemoJourneyResult) -> str:
    if result.journey_mode == JourneyMode.live_single_source.value:
        return "Live single-source governed stop"
    if result.journey_mode == JourneyMode.controlled_governed_execution.value:
        return "Controlled governed execution (offline corroboration)"
    return f"Journey: {result.journey_mode}"


def _status_tone(result: DemoJourneyResult) -> str:
    """A governed stop is a successful product outcome, not an error."""
    if result.journey_validation.verdict == VERDICT_FAIL:
        return STATUS_TONE_CAUTION
    return STATUS_TONE_SUCCESS


def _evidence_items(result: DemoJourneyResult) -> List[str]:
    facts = result.explanation.governed_facts
    items = [
        f"Account: {facts.account_display_name or facts.account_id} "
        f"({facts.external_reference})",
        f"Signal: {facts.signal_field} {facts.previous_value} -> {facts.current_value} "
        f"({facts.direction})",
        f"Mission: {facts.mission_type} (priority {facts.priority})",
        f"Change event: {facts.source_event_id}",
        f"Evidence fingerprint linked: {bool(facts.change_fingerprint)}",
    ]
    for ref in result.evidence_references:
        if ref.startswith("controlled_offline_corroborated:"):
            items.append(
                "Corroboration: controlled offline source "
                f"({ref.split(':', 1)[1]}) -- not a live multi-source integration"
            )
    return items


def _safety_disclosures(
    result: DemoJourneyResult, evidence_context: "PresentationEvidenceContext | None"
) -> List[str]:
    facts = result.explanation.governed_facts
    disclosures: List[str] = []

    if result.live_signal:
        disclosures.append(LABEL_LIVE_SIGNAL)

    if result.journey_mode == JourneyMode.live_single_source.value:
        disclosures.append(LABEL_SINGLE_SOURCE_IDENTITY)
    if facts.provenance_mode == "controlled_offline_corroborated":
        disclosures.append(LABEL_CONTROLLED_OFFLINE)
        disclosures.append(LABEL_NOT_LIVE_MULTI_SOURCE)

    if result.governance_outcome == STOPPED_IDENTITY_UNVERIFIED:
        disclosures.append(LABEL_GOVERNED_STOP)
    if result.governance_outcome == EXECUTED:
        disclosures.append(LABEL_HUMAN_APPROVED)
        disclosures.append(LABEL_SIMULATED_EXECUTION)

    # Audit is OBSERVED in this result (a receipt was recorded and the chain verified).
    if result.simulated and result.journey_validation.audit_chain_valid:
        disclosures.append(LABEL_AUDIT_VERIFIED)

    # Replay is NEVER inferred from simulation. Disclose no-duplicate safety only when
    # replay is observed in this result or a separately validated capability is supplied.
    replay_observed = facts.replayed
    replay_validated = evidence_context is not None and evidence_context.replay_validated
    if replay_observed or replay_validated:
        disclosures.append(LABEL_REPLAY_NO_DUPLICATE)

    # CRM write-back is always disclosed -- it is never enabled or performed here.
    disclosures.append(LABEL_NO_CRM_WRITEBACK)

    disclosures.append(_provider_label(result))
    return disclosures


def _technical_details(result: DemoJourneyResult) -> List[str]:
    facts = result.explanation.governed_facts
    v = result.journey_validation
    return [
        f"journey_id: {result.journey_id}",
        f"journey_mode: {result.journey_mode}",
        f"execution_mode: {result.execution_mode}",
        f"mission_id: {facts.mission_id}",
        f"rule: {facts.rule_id} {facts.rule_version}".strip(),
        f"template: {facts.template_id} {facts.template_version}".strip(),
        f"governance_status: {facts.governance_status}",
        f"failure_code: {facts.failure_code}",
        f"identity_status: {facts.identity_status}",
        f"provenance_mode: {facts.provenance_mode}",
        f"source_event_id: {facts.source_event_id}",
        f"change_fingerprint: {facts.change_fingerprint}",
        f"ledger_reference: {facts.ledger_reference}",
        f"provider_status: {result.provider_status} "
        f"(used={result.explanation.provider_used}, "
        f"fallback={result.explanation.fallback_used})",
        f"validation_status: {result.explanation.validation_status}",
        "journey_validation: "
        f"evidence={v.evidence_linkage_valid}, provenance={v.provenance_valid}, "
        f"approval={v.approval_consistent}, execution={v.execution_consistent}, "
        f"receipt={v.receipt_consistent}, audit={v.audit_chain_valid}, "
        f"grounded={v.narrative_grounded}, writeback_absent={v.crm_writeback_absent}",
        f"verdict: {v.verdict}",
    ]


def from_demo_journey_result(
    result: DemoJourneyResult,
    *,
    evidence_context: "PresentationEvidenceContext | None" = None,
) -> PresentationViewModel:
    """Pure projection: ``DemoJourneyResult`` -> ``PresentationViewModel``.

    Reads only; never mutates the input and never touches an engine, provider, ledger,
    or network. The returned model is frozen.

    ``evidence_context`` is optional and presentation-only. It never alters governance
    or execution state and is never used to infer replay from simulation -- it only lets
    a presenter honestly state that replay safety was proven during a separate controlled
    validation. When omitted, replay defaults to "not observed in this result".
    """
    explanation = result.explanation
    return PresentationViewModel(
        headline=explanation.headline,
        primary_narrative=explanation.narrative,
        recommendation=explanation.recommended_next_step,
        journey_label=_journey_label(result),
        governance_label=_governance_label(result),
        approval_label=_approval_label(result),
        execution_label=_execution_label(result),
        evidence_items=_evidence_items(result),
        audit_label=_audit_label(result),
        replay_label=_replay_label(result, evidence_context),
        provider_label=_provider_label(result),
        safety_disclosures=_safety_disclosures(result, evidence_context),
        status_tone=_status_tone(result),
        technical_details=_technical_details(result),
        source_result_reference=f"{result.journey_id} (schema {result.schema_version})",
    )


__all__ = [
    "PresentationViewModel",
    "PresentationEvidenceContext",
    "from_demo_journey_result",
    "FORBIDDEN_PHRASES",
    "STATUS_TONE_SUCCESS",
    "STATUS_TONE_CAUTION",
    "LABEL_LIVE_SIGNAL",
    "LABEL_SINGLE_SOURCE_IDENTITY",
    "LABEL_CONTROLLED_OFFLINE",
    "LABEL_HUMAN_APPROVED",
    "LABEL_GOVERNED_STOP",
    "LABEL_SIMULATED_EXECUTION",
    "LABEL_NO_CRM_WRITEBACK",
    "LABEL_NVIDIA_GROUNDED",
    "LABEL_NVIDIA_UNCONFIGURED",
    "LABEL_DETERMINISTIC_FALLBACK",
    "LABEL_AUDIT_VERIFIED",
    "LABEL_REPLAY_NO_DUPLICATE",
    "LABEL_NOT_LIVE_MULTI_SOURCE",
]
