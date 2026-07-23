"""Demo Journey Orchestrator -- Real HubSpot Signal Vertical Slice (application-facing).

Additive composition ONLY. This module wires the already validated public interfaces
into two honest demo modes; it re-implements no engine logic:

    SignalChangeEvent
      -> generate_mission_for_event        (public mission service)
      -> integrate_live_mission            (public governance adapter -> protected harness)
      -> build_governed_facts              (public explainability)
      -> explain_governed_mission          (public explainability, optional NVIDIA provider)
      -> validate_journey                  (this module -- pure, over real typed results)
      -> DemoJourneyResult

Hard boundaries (this orchestrator NEVER):

* re-implements detection, mission selection, identity resolution, approval rules,
  execution, audit hashing, or groundedness logic;
* infers, defaults, or hard-codes an approval decision;
* constructs an implicit ``":memory:"`` ledger or invents a filesystem path;
* references, sets, or modifies the HubSpot write-back feature flag;
* imports or calls any CRM write function, or calls HubSpot;
* runs the full Evaluation Pack to score a single journey;
* presents controlled offline corroboration as live multi-source, a simulated receipt
  as real, or CRM write-back as enabled/performed.

CRM write-back is an explicit demo capability boundary that is always disabled and
never performed here.
"""

from __future__ import annotations

from typing import List, Optional

from harness.service import HarnessServiceDependencies
from live_signals.contracts import SignalChangeEvent
from live_signals.demo_contracts import (
    VERDICT_FAIL,
    VERDICT_PASS,
    VERDICT_PASS_WITH_OPTIONAL_SKIPS,
    BaselineEvaluationSummary,
    DemoJourneyError,
    DemoJourneyResult,
    ExecutionMode,
    JourneyMode,
    JourneyValidationResult,
)
from live_signals.explainability import (
    ExplanationProvider,
    ExplanationResult,
    GovernedFacts,
    ProvenanceMode,
    build_governed_facts,
    explain_governed_mission,
    validate_groundedness,
)
from live_signals.mission_contracts import LiveMission, MissionSelectionStatus
from live_signals.mission_governance_adapter import (
    EXECUTED,
    REJECTED,
    STOPPED_AWAITING_APPROVAL,
    STOPPED_IDENTITY_UNVERIFIED,
    LiveMissionIntegrationError,
    LiveMissionIntegrationResult,
    integrate_live_mission,
)
from live_signals.mission_service import generate_mission_for_event

DEMO_JOURNEY_VERSION = "DEMO-JOURNEY-ORCHESTRATOR-v1"

#: Explicit, immutable demo capability boundary. This orchestrator supports NO
#: CRM write-back. These constants are never derived from caller input.
CRM_WRITEBACK_ENABLED = False
CRM_WRITEBACK_PERFORMED = False

# Deterministic mode -> (provenance, execution mode) policy.
_MODE_POLICY = {
    JourneyMode.live_single_source: (
        ProvenanceMode.live_single_source,
        ExecutionMode.governance_stop_only,
    ),
    JourneyMode.controlled_governed_execution: (
        ProvenanceMode.controlled_offline_corroborated,
        ExecutionMode.simulation_only,
    ),
}

_STOPPED_STATES = (STOPPED_IDENTITY_UNVERIFIED, STOPPED_AWAITING_APPROVAL, REJECTED)


# -- durability probe --------------------------------------------------------


def _ledger_is_durable(ledger: object) -> bool:
    """Best-effort, read-only check that a caller-owned ledger is FILE-backed.

    A transient ``":memory:"`` SQLite database reports an empty ``file`` for its
    ``main`` schema; a durable database reports a real path. We introspect via the
    connection without mutating the protected ledger. If durability cannot be proven,
    we fail closed (return ``False``).
    """
    conn = getattr(ledger, "_conn", None)
    if conn is None:
        return False
    try:
        rows = conn.execute("PRAGMA database_list").fetchall()
    except Exception:  # noqa: BLE001 - any probe failure -> not provably durable
        return False
    for row in rows:
        name = row["name"] if _has_key(row, "name") else row[1]
        path = row["file"] if _has_key(row, "file") else row[2]
        if name == "main":
            return bool(path)
    return False


def _has_key(row: object, key: str) -> bool:
    try:
        return key in row.keys()  # sqlite3.Row
    except Exception:  # noqa: BLE001
        return False


# -- journey validation (pure; never raises) ---------------------------------


def validate_journey(
    *,
    journey_mode: JourneyMode,
    execution_mode: ExecutionMode,
    event: SignalChangeEvent,
    mission: LiveMission,
    integration_result: LiveMissionIntegrationResult,
    facts: GovernedFacts,
    explanation: ExplanationResult,
    provenance_mode: ProvenanceMode,
    live_signal: bool,
    live_multi_source: bool,
    simulated: bool,
    crm_writeback_enabled: bool = CRM_WRITEBACK_ENABLED,
    crm_writeback_performed: bool = CRM_WRITEBACK_PERFORMED,
) -> JourneyValidationResult:
    """Validate THIS journey from its real typed results. Pure and side-effect free.

    Returns a :class:`JourneyValidationResult` with a verdict of ``pass``,
    ``pass_with_optional_skips`` (only when the optional provider was unavailable and
    the deterministic explanation was used), or ``fail``. It NEVER raises; the
    orchestrator turns a ``fail`` verdict into a fail-closed exception.
    """
    violations: List[str] = []

    # 1-3. Evidence linkage (event <-> mission <-> integration).
    evidence_linkage_valid = (
        mission.source_event_id == event.event_id
        and mission.change_fingerprint == event.change_fingerprint
        and facts.source_event_id == event.event_id
        and facts.change_fingerprint == event.change_fingerprint
    )
    if integration_result.ledger_mission_id:
        evidence_linkage_valid = evidence_linkage_valid and (
            integration_result.ledger_mission_id == mission.mission_id
        )
    if not evidence_linkage_valid:
        violations.append("evidence_linkage_broken")

    # 4. Provenance matches the journey mode.
    expected_provenance = _MODE_POLICY[journey_mode][0]
    provenance_valid = (
        provenance_mode == expected_provenance
        and facts.provenance_mode == expected_provenance.value
    )
    if not provenance_valid:
        violations.append("provenance_mode_mismatch")

    status = integration_result.status
    executed = bool(integration_result.executed)
    receipt_present = bool(integration_result.simulated_receipt_id)

    # 5. Approval and governance status are consistent (approval is never inferred).
    approval = integration_result.approval_input
    approval_consistent = True
    if executed and approval != "approved":
        approval_consistent = False
    if status == STOPPED_AWAITING_APPROVAL and approval != "none":
        approval_consistent = False
    if status == REJECTED and approval != "rejected":
        approval_consistent = False
    if facts.approval_status != approval:
        approval_consistent = False
    if not approval_consistent:
        violations.append("approval_inconsistent")

    # 6-7. Executed requires a simulated receipt; stopped/rejected has none.
    execution_consistent = True
    if executed and status != EXECUTED:
        execution_consistent = False
    if status == EXECUTED and not executed:
        execution_consistent = False
    if execution_mode == ExecutionMode.governance_stop_only and executed:
        execution_consistent = False  # a governance-stop journey may never execute
    # simulated execution must never be represented as real execution
    if executed and not simulated:
        execution_consistent = False
    if crm_writeback_performed:
        execution_consistent = False  # no real CRM write path exists in demo mode
    if not execution_consistent:
        violations.append("execution_state_inconsistent")

    receipt_consistent = (executed == receipt_present) and (
        receipt_present or status in _STOPPED_STATES or status == EXECUTED
    )
    if executed and not receipt_present:
        receipt_consistent = False
    if (not executed) and receipt_present:
        receipt_consistent = False  # a receipt on a stopped/rejected journey is invalid
    if not receipt_consistent:
        violations.append("receipt_inconsistent")

    # 8. Replay reuses the original receipt (never a duplicate execution record).
    if integration_result.replayed and not receipt_present:
        violations.append("replay_without_receipt")

    # 10-11. Neither live single-source nor controlled offline may claim multi-source.
    if live_multi_source:
        violations.append("live_multi_source_claimed")

    # 12. The RETURNED explanation must be grounded in the governed facts.
    narrative_violations = validate_groundedness(
        _combined_explanation_text(explanation), facts
    )
    narrative_grounded = not narrative_violations
    if not narrative_grounded:
        violations.append("narrative_ungrounded")

    # 13. Audit chain must be valid whenever a receipt/audit record exists.
    audit_record_exists = receipt_present or integration_result.ledger_record_count > 0
    audit_chain_valid = (not audit_record_exists) or bool(
        integration_result.ledger_chain_valid
    )
    if not audit_chain_valid:
        violations.append("audit_chain_invalid")

    # 14. CRM write-back must be disabled and absent.
    crm_writeback_absent = (not crm_writeback_enabled) and (not crm_writeback_performed)
    if not crm_writeback_absent:
        violations.append("crm_writeback_present")

    if violations:
        verdict = VERDICT_FAIL
    elif explanation.fallback_used:
        # The optional provider was unavailable/degraded and the deterministic
        # explanation was used -- an honest optional skip, not a failure.
        verdict = VERDICT_PASS_WITH_OPTIONAL_SKIPS
    else:
        verdict = VERDICT_PASS

    return JourneyValidationResult(
        evidence_linkage_valid=evidence_linkage_valid,
        provenance_valid=provenance_valid,
        approval_consistent=approval_consistent,
        execution_consistent=execution_consistent,
        receipt_consistent=receipt_consistent,
        audit_chain_valid=audit_chain_valid,
        narrative_grounded=narrative_grounded,
        crm_writeback_absent=crm_writeback_absent,
        verdict=verdict,
        violations=violations,
    )


def _combined_explanation_text(explanation: ExplanationResult) -> str:
    return " \n".join(
        [
            explanation.headline,
            explanation.narrative,
            explanation.governance_explanation,
            explanation.evidence_summary,
            explanation.recommended_next_step,
        ]
    )


# -- the public orchestrator -------------------------------------------------


def run_demo_journey(
    *,
    journey_mode: JourneyMode,
    event: SignalChangeEvent,
    mission_repository,
    verification_outcome: str,
    approval: str,
    dependencies: Optional[HarnessServiceDependencies] = None,
    corroborating_records: Optional[list] = None,
    explanation_provider: Optional[ExplanationProvider] = None,
    baseline_evaluation: Optional[BaselineEvaluationSummary] = None,
) -> DemoJourneyResult:
    """Compose one honest demo journey from the validated public interfaces.

    ``verification_outcome`` and ``approval`` are REQUIRED explicit caller inputs; they
    are passed through to the governance adapter verbatim and never defaulted or
    inferred. Fails closed (raising :class:`DemoJourneyError`) before returning any
    result whenever a safety invariant is violated.

    Ledger/durability: for ``controlled_governed_execution`` the caller MUST supply
    ``dependencies`` carrying a durable, caller-owned ``MissionAuditLedger`` (a
    transient ``":memory:"`` ledger is rejected) so the audit chain and replay are
    real. This orchestrator never constructs an implicit ledger or invents a path.

    ``baseline_evaluation`` is an OPTIONAL precomputed Evaluation-Pack summary passed
    in by the caller; the full evaluation suite is never run here.
    """
    if not isinstance(journey_mode, JourneyMode):
        raise DemoJourneyError(f"unknown journey_mode {journey_mode!r}.")

    provenance_mode, execution_mode = _MODE_POLICY[journey_mode]

    # Explicit CRM write-back boundary -- fail closed if it is ever flipped.
    if CRM_WRITEBACK_ENABLED or CRM_WRITEBACK_PERFORMED:  # pragma: no cover - constant guard
        raise DemoJourneyError("CRM write-back is not supported in demo mode.")

    corroboration = list(corroborating_records or [])

    # Mode-specific evidence + durability preconditions (fail closed).
    if journey_mode is JourneyMode.live_single_source:
        if corroboration:
            raise DemoJourneyError(
                "live_single_source must not receive corroborating_records; a second "
                "source would change the governed identity outcome."
            )
    else:  # controlled_governed_execution
        if not corroboration:
            raise DemoJourneyError(
                "controlled_governed_execution requires explicit controlled offline "
                "corroborating_records."
            )
        _require_durable_dependencies(dependencies)

    # 1. Mission generation (public service; fail closed on no/failed selection).
    now = event.detected_at
    selection = generate_mission_for_event(event, mission_repository, now=now)
    if selection.status not in (
        MissionSelectionStatus.mission_created,
        MissionSelectionStatus.mission_exists,
    ) or selection.mission is None:
        raise DemoJourneyError(
            f"no governed mission for event: {selection.status.value} "
            f"({selection.detail})."
        )
    mission: LiveMission = selection.mission

    # 2. Governance integration (public adapter -> protected harness).
    try:
        integration_result = integrate_live_mission(
            mission,
            event,
            verification_outcome=verification_outcome,
            approval=approval,
            dependencies=dependencies,
            corroborating_records=corroboration or None,
        )
    except LiveMissionIntegrationError as exc:
        raise DemoJourneyError(f"governance integration failed closed: {exc}") from exc

    # 3. Governed facts (public explainability; fail closed on broken linkage/state).
    try:
        facts = build_governed_facts(
            mission, event, integration_result, provenance_mode=provenance_mode
        )
    except Exception as exc:  # noqa: BLE001 - surface as a typed fail-closed error
        raise DemoJourneyError(f"governed-facts build failed closed: {exc}") from exc

    # 4. Explanation (deterministic authoritative; optional grounded provider overlay).
    explanation = explain_governed_mission(facts, provider=explanation_provider)

    # Honest presentation flags derived from real results.
    live_signal = (event.source or "").split("_")[0] == "hubspot"
    live_multi_source = False  # never live multi-source in either demo mode
    simulated = bool(integration_result.executed)

    # 5. Per-journey validation over the real typed results.
    validation = validate_journey(
        journey_mode=journey_mode,
        execution_mode=execution_mode,
        event=event,
        mission=mission,
        integration_result=integration_result,
        facts=facts,
        explanation=explanation,
        provenance_mode=provenance_mode,
        live_signal=live_signal,
        live_multi_source=live_multi_source,
        simulated=simulated,
    )
    if validation.verdict == VERDICT_FAIL:
        raise DemoJourneyError(
            "journey validation failed closed: " + ", ".join(validation.violations)
        )

    warnings = _warnings(execution_mode, integration_result, explanation)

    audit_reference = (
        integration_result.ledger_latest_record_id
        or integration_result.ledger_mission_id
    )

    # 6. Assemble the honest result.
    return DemoJourneyResult(
        journey_id=f"demo-{mission.mission_id}",
        journey_mode=journey_mode.value,
        execution_mode=execution_mode.value,
        account_id=mission.account_id,
        signal_summary=facts.movement_summary,
        mission_summary=f"{mission.mission_type} (priority {mission.priority.value})",
        governance_outcome=integration_result.status,
        approval_status=integration_result.approval_input,
        execution_status="executed_simulated" if simulated else "not_executed",
        explanation=explanation,
        evidence_references=_evidence_references(event, mission, facts, corroboration),
        audit_reference=audit_reference,
        journey_validation=validation,
        baseline_evaluation=baseline_evaluation,
        provider_status=explanation.provider_status,
        simulated=simulated,
        live_signal=live_signal,
        live_multi_source=live_multi_source,
        crm_writeback_enabled=CRM_WRITEBACK_ENABLED,
        crm_writeback_performed=CRM_WRITEBACK_PERFORMED,
        warnings=warnings,
    )


def _require_durable_dependencies(
    dependencies: Optional[HarnessServiceDependencies],
) -> None:
    if dependencies is None:
        raise DemoJourneyError(
            "controlled_governed_execution requires caller-supplied "
            "HarnessServiceDependencies with a durable ledger."
        )
    if dependencies.ledger is None:
        raise DemoJourneyError(
            "controlled_governed_execution requires a caller-owned, durable "
            "MissionAuditLedger (dependencies.ledger); a service-owned or path-only "
            "ledger cannot back cross-call replay."
        )
    if not _ledger_is_durable(dependencies.ledger):
        raise DemoJourneyError(
            "controlled_governed_execution rejects a transient ':memory:' ledger; "
            "supply a durable, file-backed MissionAuditLedger."
        )


def _evidence_references(
    event: SignalChangeEvent,
    mission: LiveMission,
    facts: GovernedFacts,
    corroboration: list,
) -> List[str]:
    refs = [
        f"event_id:{event.event_id}",
        f"source_event_id:{mission.source_event_id}",
        f"change_fingerprint:{mission.change_fingerprint}",
        f"account_ref:{facts.external_reference}",
    ]
    for record in corroboration:
        system = getattr(record, "source_system", "unknown")
        refs.append(f"controlled_offline_corroborated:{system}")
    return refs


def _warnings(
    execution_mode: ExecutionMode,
    integration_result: LiveMissionIntegrationResult,
    explanation: ExplanationResult,
) -> List[str]:
    warnings: List[str] = []
    if integration_result.status == STOPPED_IDENTITY_UNVERIFIED:
        warnings.append("governed_stop_identity_unverified_no_execution")
    if integration_result.status == STOPPED_AWAITING_APPROVAL:
        warnings.append("governed_stop_awaiting_explicit_approval")
    if execution_mode == ExecutionMode.simulation_only and integration_result.executed:
        warnings.append("execution_is_simulated_only_no_crm_writeback")
    if explanation.provider_status == "unconfigured" and explanation.fallback_used:
        warnings.append("nvidia_provider_unconfigured_deterministic_fallback_used")
    if explanation.provider_status == "error":
        warnings.append("nvidia_provider_error_deterministic_fallback_used")
    if explanation.validation_status == "rejected":
        warnings.append("provider_narrative_rejected_deterministic_fallback_used")
    return warnings


# -- executive internal artifact (pure rendering) ----------------------------


def render_demo_validation_summary(result: DemoJourneyResult) -> str:
    """Render a concise INTERNAL text artifact from a real ``DemoJourneyResult``.

    Every line is derived from the typed result and its ``JourneyValidationResult`` --
    no PASS value is hard-coded. This is an internal artifact only (no slides, docs,
    dashboards, or UI).
    """
    v = result.journey_validation

    def mark(ok: bool) -> str:
        return "PASS" if ok else "FAIL"

    identity_line = (
        "GOVERNED STOP"
        if result.governance_outcome == STOPPED_IDENTITY_UNVERIFIED
        else mark(v.provenance_valid and v.evidence_linkage_valid)
    )
    if result.execution_mode == ExecutionMode.simulation_only.value and result.simulated:
        sim_line = mark(v.execution_consistent and v.receipt_consistent)
        audit_line = mark(v.audit_chain_valid)
    else:
        sim_line = "NOT APPLICABLE"
        audit_line = "PASS" if v.audit_chain_valid else "FAIL"
        if not result.simulated:
            audit_line = "NOT APPLICABLE"

    provider = result.provider_status
    if result.explanation.provider_used:
        provider_line = "GROUNDED"
    elif provider == "error":
        provider_line = "FALLBACK"
    elif result.explanation.validation_status == "rejected":
        provider_line = "FALLBACK"
    else:
        provider_line = "UNCONFIGURED"

    lines = [
        "VentureOS Governed Journey",
        "",
        f"Journey Mode: {result.journey_mode}",
        f"Execution Mode: {result.execution_mode}",
        f"Account: {result.account_id}",
        "",
        f"Live Signal: {mark(result.live_signal)}",
        f"Mission Generation: {mark(bool(result.mission_summary))}",
        f"Evidence Integrity: {mark(v.evidence_linkage_valid)}",
        f"Identity Governance: {identity_line}",
        f"Approval Enforcement: {mark(v.approval_consistent)}",
        f"Simulated Execution: {sim_line}",
        f"Audit Integrity: {audit_line}",
        f"Narrative Grounding: {mark(v.narrative_grounded)}",
        f"NVIDIA Provider: {provider_line}",
        "CRM Write-back: "
        + ("NOT ENABLED / NOT PERFORMED" if v.crm_writeback_absent else "PRESENT"),
        "",
        f"Journey Verdict: {v.verdict.upper()}",
        "",
        "Baseline Evaluation:",
    ]
    if result.baseline_evaluation is not None:
        b = result.baseline_evaluation
        lines.append(
            f"- {b.verdict.upper()} ({b.checks_passed}/{b.checks_total}) "
            f"[{b.source_reference or 'supplied'}]"
        )
    else:
        lines.append("- NOT SUPPLIED")
    return "\n".join(lines)


__all__ = [
    "DEMO_JOURNEY_VERSION",
    "CRM_WRITEBACK_ENABLED",
    "CRM_WRITEBACK_PERFORMED",
    "run_demo_journey",
    "validate_journey",
    "render_demo_validation_summary",
]
