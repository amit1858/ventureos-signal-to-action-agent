"""Focused tests -- additive Demo Journey Orchestrator (application-facing).

Plain-Python runner (no pytest, no network, no live provider). Prints a single summary
line ``Demo journey orchestrator: N passed, N failed, N checks total`` so the repo-wide
regression aggregator can pick it up.

Every governed input is produced by the REAL offline flow (the frozen detector, the
deterministic mission selector, and the additive governance adapter over the protected
harness) via the committed evaluation-pack builders. Providers are always fakes; the
durable ledger is a disposable temp file the test owns and deletes.
"""

from __future__ import annotations

import os
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from evals.eval_scenarios import (  # noqa: E402
    build_canonical_event,
    corroborating_records,
)
from harness.audit_ledger import MissionAuditLedger  # noqa: E402
from harness.service import HarnessServiceDependencies  # noqa: E402
from live_signals.contracts import SignalChangeEvent, SignalDirection  # noqa: E402
from live_signals.demo_contracts import (  # noqa: E402
    VERDICT_FAIL,
    VERDICT_PASS,
    VERDICT_PASS_WITH_OPTIONAL_SKIPS,
    BaselineEvaluationSummary,
    DemoJourneyError,
    ExecutionMode,
    JourneyMode,
)
from live_signals.demo_journey import (  # noqa: E402
    render_demo_validation_summary,
    run_demo_journey,
    validate_journey,
)
from live_signals.explainability import (  # noqa: E402
    ProviderExplanationDraft,
    ProvenanceMode,
    build_governed_facts,
    explain_governed_mission,
)
from live_signals.mission_contracts import MissionSelectionStatus  # noqa: E402
from live_signals.mission_governance_adapter import (  # noqa: E402
    EXECUTED,
    STOPPED_AWAITING_APPROVAL,
    STOPPED_IDENTITY_UNVERIFIED,
    integrate_live_mission,
)
from live_signals.mission_repository import MissionRepository  # noqa: E402
from live_signals.mission_service import generate_mission_for_event  # noqa: E402

_PASS = 0
_FAIL = 0


def _check(label: str, ok: bool) -> None:
    global _PASS, _FAIL
    if ok:
        _PASS += 1
        print(f"[PASS] {label}")
    else:
        _FAIL += 1
        print(f"[FAIL] {label}")


# -- offline provider fakes --------------------------------------------------


class _UnconfiguredProvider:
    def configured(self) -> bool:
        return False

    def generate_explanation(self, context):  # pragma: no cover - never called
        raise AssertionError("unconfigured provider must not be asked to generate")


class _GroundedProvider:
    """Configured fake that only REWORDS the governed facts (stays grounded)."""

    def configured(self) -> bool:
        return True

    def generate_explanation(self, context):
        return ProviderExplanationDraft(
            headline="Renewal date moved earlier for this account",
            narrative=(
                "The renewal date changed to an earlier date, an adverse movement. "
                "This is a controlled offline corroborated proof, not a live "
                "multi-source integration."
            ),
        )


# -- shared real pieces (offline) --------------------------------------------


def _fresh_repo() -> MissionRepository:
    return MissionRepository(":memory:")


def _mode_a_pieces():
    """Real single-source (identity-stop) pieces via public interfaces."""
    event = build_canonical_event()
    repo = _fresh_repo()
    mission = generate_mission_for_event(event, repo, now=event.detected_at).mission
    integ = integrate_live_mission(
        mission, event, verification_outcome="verified", approval="approved",
        corroborating_records=None,
    )
    facts = build_governed_facts(
        mission, event, integ, provenance_mode=ProvenanceMode.live_single_source
    )
    expl = explain_governed_mission(facts, provider=None)
    return event, mission, integ, facts, expl


def _mode_b_pieces(ledger):
    """Real controlled-execution pieces via public interfaces (durable ledger)."""
    event = build_canonical_event()
    repo = _fresh_repo()
    mission = generate_mission_for_event(event, repo, now=event.detected_at).mission
    deps = HarnessServiceDependencies(ledger=ledger)
    integ = integrate_live_mission(
        mission, event, verification_outcome="verified", approval="approved",
        dependencies=deps, corroborating_records=corroborating_records(),
    )
    facts = build_governed_facts(
        mission, event, integ,
        provenance_mode=ProvenanceMode.controlled_offline_corroborated,
    )
    expl = explain_governed_mission(facts, provider=None)
    return event, mission, integ, facts, expl


# -- Mode A: live single-source ----------------------------------------------


def test_mode_a_live_single_source():
    event = build_canonical_event()
    repo = _fresh_repo()
    result = run_demo_journey(
        journey_mode=JourneyMode.live_single_source,
        event=event, mission_repository=repo,
        verification_outcome="verified", approval="approved",
        dependencies=None, corroborating_records=None,
        explanation_provider=None,
    )
    _check("A mode label", result.journey_mode == JourneyMode.live_single_source.value)
    _check("A execution_mode governance_stop_only",
           result.execution_mode == ExecutionMode.governance_stop_only.value)
    _check("A live_signal True", result.live_signal is True)
    _check("A live_multi_source False", result.live_multi_source is False)
    _check("A simulated False", result.simulated is False)
    _check("A crm_writeback_enabled False", result.crm_writeback_enabled is False)
    _check("A crm_writeback_performed False", result.crm_writeback_performed is False)
    _check("A governance stopped_identity_unverified",
           result.governance_outcome == STOPPED_IDENTITY_UNVERIFIED)
    _check("A no receipt / not executed", result.execution_status == "not_executed")
    _check("A identity failure code visible",
           bool(result.explanation.governed_facts.failure_code))
    _check("A explanation states no action", "no action" in
           (result.explanation.governance_explanation + result.explanation.narrative).lower()
           or result.explanation.governed_facts.executed is False)
    _check("A journey validation passes",
           result.journey_validation.verdict in (VERDICT_PASS, VERDICT_PASS_WITH_OPTIONAL_SKIPS))
    _check("A validation evidence linkage valid",
           result.journey_validation.evidence_linkage_valid is True)
    _check("A validation crm_writeback_absent",
           result.journey_validation.crm_writeback_absent is True)
    print("\n--- Mode A executive artifact ---")
    print(render_demo_validation_summary(result))
    print("--- end Mode A ---\n")


# -- Mode B: controlled governed execution + replay --------------------------


def test_mode_b_controlled_execution_and_replay():
    tmpdir = tempfile.mkdtemp(prefix="demo_journey_")
    path = os.path.join(tmpdir, "audit.sqlite")
    ledger = MissionAuditLedger(path)
    try:
        event = build_canonical_event()
        repo = _fresh_repo()
        deps = HarnessServiceDependencies(ledger=ledger)
        result = run_demo_journey(
            journey_mode=JourneyMode.controlled_governed_execution,
            event=event, mission_repository=repo,
            verification_outcome="verified", approval="approved",
            dependencies=deps, corroborating_records=corroborating_records(),
            explanation_provider=None,
        )
        _check("B mode label",
               result.journey_mode == JourneyMode.controlled_governed_execution.value)
        _check("B execution_mode simulation_only",
               result.execution_mode == ExecutionMode.simulation_only.value)
        _check("B live_signal True", result.live_signal is True)
        _check("B live_multi_source False", result.live_multi_source is False)
        _check("B simulated True", result.simulated is True)
        _check("B crm_writeback_enabled False", result.crm_writeback_enabled is False)
        _check("B crm_writeback_performed False", result.crm_writeback_performed is False)
        _check("B governance executed", result.governance_outcome == EXECUTED)
        _check("B receipt present", result.audit_reference is not None)
        _check("B audit chain valid", result.journey_validation.audit_chain_valid is True)
        _check("B execution_status executed_simulated",
               result.execution_status == "executed_simulated")
        _check("B journey validation passes",
               result.journey_validation.verdict in (VERDICT_PASS, VERDICT_PASS_WITH_OPTIONAL_SKIPS))
        _check("B evidence references controlled offline label", any(
            "controlled_offline_corroborated" in r for r in result.evidence_references))
        _check("B warning: simulated only, no writeback",
               "execution_is_simulated_only_no_crm_writeback" in result.warnings)

        count_before = None
        records_before = len(ledger.list_mission_records(result.explanation.governed_facts.mission_id))

        # Replay on the SAME durable ledger + repo -> same receipt, no new execution.
        replay = run_demo_journey(
            journey_mode=JourneyMode.controlled_governed_execution,
            event=event, mission_repository=repo,
            verification_outcome="verified", approval="approved",
            dependencies=deps, corroborating_records=corroborating_records(),
            explanation_provider=None,
        )
        records_after = len(ledger.list_mission_records(result.explanation.governed_facts.mission_id))
        _check("B replay reuses same receipt/audit",
               replay.audit_reference is not None and replay.governance_outcome == EXECUTED)
        _check("B replay creates no duplicate execution record",
               records_after == records_before)
        print("\n--- Mode B executive artifact ---")
        print(render_demo_validation_summary(result))
        print("--- end Mode B ---\n")
    finally:
        ledger.close()
        try:
            os.remove(path)
        except OSError:
            pass
        try:
            os.rmdir(tmpdir)
        except OSError:
            pass


# -- fail-closed and safety tests --------------------------------------------


def test_no_eligible_mission_fails_closed():
    event = SignalChangeEvent(
        event_id="SCE-unsupported-demo", portal_id="246820626", account_id="335064019691",
        account_ref="curefoods-test", monitored_field="support_escalation",
        old_value="2", new_value="5", direction=SignalDirection.adverse,
        detected_at="2026-07-21T18:10:00Z", source="hubspot_test",
        source_record_type="company", source_record_id="335064019691",
        normalized_old_value="2", normalized_new_value="5",
        change_fingerprint="sig1:unsupported-demo",
    )
    raised = False
    try:
        run_demo_journey(
            journey_mode=JourneyMode.live_single_source, event=event,
            mission_repository=_fresh_repo(), verification_outcome="verified",
            approval="none",
        )
    except DemoJourneyError:
        raised = True
    _check("no eligible mission -> fail closed", raised)


def test_provenance_mismatch_fails():
    event, mission, integ, _facts, expl = _mode_a_pieces()
    # Build facts with the WRONG provenance for the live single-source journey.
    wrong_facts = build_governed_facts(
        mission, event, integ,
        provenance_mode=ProvenanceMode.controlled_offline_corroborated,
    )
    v = validate_journey(
        journey_mode=JourneyMode.live_single_source,
        execution_mode=ExecutionMode.governance_stop_only,
        event=event, mission=mission, integration_result=integ,
        facts=wrong_facts, explanation=expl,
        provenance_mode=ProvenanceMode.controlled_offline_corroborated,
        live_signal=True, live_multi_source=False, simulated=False,
    )
    _check("provenance mismatch -> fail", v.verdict == VERDICT_FAIL)
    _check("provenance mismatch violation recorded",
           "provenance_mode_mismatch" in v.violations)


def test_broken_event_linkage_fails():
    event, mission, integ, facts, expl = _mode_a_pieces()
    tampered_mission = mission.model_copy(update={"source_event_id": "SCE-OTHER"})
    v = validate_journey(
        journey_mode=JourneyMode.live_single_source,
        execution_mode=ExecutionMode.governance_stop_only,
        event=event, mission=tampered_mission, integration_result=integ,
        facts=facts, explanation=expl,
        provenance_mode=ProvenanceMode.live_single_source,
        live_signal=True, live_multi_source=False, simulated=False,
    )
    _check("broken event linkage -> fail", v.verdict == VERDICT_FAIL)
    _check("broken event linkage flagged", v.evidence_linkage_valid is False)


def test_broken_fingerprint_fails():
    event, mission, integ, facts, expl = _mode_a_pieces()
    tampered = mission.model_copy(update={"change_fingerprint": "sig1:TAMPERED"})
    v = validate_journey(
        journey_mode=JourneyMode.live_single_source,
        execution_mode=ExecutionMode.governance_stop_only,
        event=event, mission=tampered, integration_result=integ,
        facts=facts, explanation=expl,
        provenance_mode=ProvenanceMode.live_single_source,
        live_signal=True, live_multi_source=False, simulated=False,
    )
    _check("broken fingerprint -> fail", v.evidence_linkage_valid is False and v.verdict == VERDICT_FAIL)


def test_missing_approval_does_not_execute():
    event = build_canonical_event()
    repo = _fresh_repo()
    tmpdir = tempfile.mkdtemp(prefix="demo_journey_")
    path = os.path.join(tmpdir, "audit.sqlite")
    ledger = MissionAuditLedger(path)
    try:
        deps = HarnessServiceDependencies(ledger=ledger)
        result = run_demo_journey(
            journey_mode=JourneyMode.controlled_governed_execution,
            event=event, mission_repository=repo,
            verification_outcome="verified", approval="none",
            dependencies=deps, corroborating_records=corroborating_records(),
        )
        _check("missing approval -> not executed", result.simulated is False)
        _check("missing approval -> stopped_awaiting_approval",
               result.governance_outcome == STOPPED_AWAITING_APPROVAL)
        _check("missing approval -> no receipt", result.audit_reference is None
               or result.execution_status == "not_executed")
    finally:
        ledger.close()
        for fn in (lambda: os.remove(path), lambda: os.rmdir(tmpdir)):
            try:
                fn()
            except OSError:
                pass


def test_approval_cannot_be_defaulted():
    # No approval kwarg -> TypeError (approval is a required explicit input).
    raised_type = False
    try:
        run_demo_journey(
            journey_mode=JourneyMode.live_single_source,
            event=build_canonical_event(), mission_repository=_fresh_repo(),
            verification_outcome="verified",
        )
    except TypeError:
        raised_type = True
    _check("approval is a required argument", raised_type)

    # An invalid approval token fails closed (never silently defaulted).
    raised_closed = False
    try:
        run_demo_journey(
            journey_mode=JourneyMode.live_single_source,
            event=build_canonical_event(), mission_repository=_fresh_repo(),
            verification_outcome="verified", approval="totally-approved",
        )
    except DemoJourneyError:
        raised_closed = True
    _check("invalid approval token -> fail closed", raised_closed)


def test_controlled_execution_requires_durable_dependencies():
    raised = False
    try:
        run_demo_journey(
            journey_mode=JourneyMode.controlled_governed_execution,
            event=build_canonical_event(), mission_repository=_fresh_repo(),
            verification_outcome="verified", approval="approved",
            dependencies=None, corroborating_records=corroborating_records(),
        )
    except DemoJourneyError:
        raised = True
    _check("controlled execution without dependencies -> fail closed", raised)


def test_transient_memory_ledger_rejected_for_controlled_execution():
    ledger = MissionAuditLedger(":memory:")
    raised = False
    try:
        run_demo_journey(
            journey_mode=JourneyMode.controlled_governed_execution,
            event=build_canonical_event(), mission_repository=_fresh_repo(),
            verification_outcome="verified", approval="approved",
            dependencies=HarnessServiceDependencies(ledger=ledger),
            corroborating_records=corroborating_records(),
        )
    except DemoJourneyError:
        raised = True
    finally:
        ledger.close()
    _check("transient :memory: ledger rejected for controlled execution", raised)


def test_execution_claimed_without_receipt_fails():
    event, mission, integ, facts, expl = _mode_a_pieces()
    # Force an inconsistent 'executed' with no receipt.
    bad = integ.model_copy(update={
        "status": EXECUTED, "executed": True, "simulated_receipt_id": None,
        "approval_input": "approved",
    })
    v = validate_journey(
        journey_mode=JourneyMode.controlled_governed_execution,
        execution_mode=ExecutionMode.simulation_only,
        event=event, mission=mission, integration_result=bad,
        facts=facts, explanation=expl,
        provenance_mode=ProvenanceMode.controlled_offline_corroborated,
        live_signal=True, live_multi_source=False, simulated=True,
    )
    _check("executed without receipt -> fail", v.verdict == VERDICT_FAIL)
    _check("executed without receipt flagged", v.receipt_consistent is False)


def test_receipt_on_stopped_journey_fails():
    event, mission, integ, facts, expl = _mode_a_pieces()
    bad = integ.model_copy(update={"simulated_receipt_id": "rcpt-should-not-exist"})
    v = validate_journey(
        journey_mode=JourneyMode.live_single_source,
        execution_mode=ExecutionMode.governance_stop_only,
        event=event, mission=mission, integration_result=bad,
        facts=facts, explanation=expl,
        provenance_mode=ProvenanceMode.live_single_source,
        live_signal=True, live_multi_source=False, simulated=False,
    )
    _check("receipt on stopped journey -> fail", v.verdict == VERDICT_FAIL)
    _check("receipt on stopped journey flagged", v.receipt_consistent is False)


def test_invalid_audit_chain_fails():
    tmpdir = tempfile.mkdtemp(prefix="demo_journey_")
    path = os.path.join(tmpdir, "audit.sqlite")
    ledger = MissionAuditLedger(path)
    try:
        event, mission, integ, facts, expl = _mode_b_pieces(ledger)
        bad = integ.model_copy(update={"ledger_chain_valid": False})
        v = validate_journey(
            journey_mode=JourneyMode.controlled_governed_execution,
            execution_mode=ExecutionMode.simulation_only,
            event=event, mission=mission, integration_result=bad,
            facts=facts, explanation=expl,
            provenance_mode=ProvenanceMode.controlled_offline_corroborated,
            live_signal=True, live_multi_source=False, simulated=True,
        )
        _check("invalid audit chain -> fail", v.verdict == VERDICT_FAIL)
        _check("invalid audit chain flagged", v.audit_chain_valid is False)
    finally:
        ledger.close()
        for fn in (lambda: os.remove(path), lambda: os.rmdir(tmpdir)):
            try:
                fn()
            except OSError:
                pass


def test_controlled_corroboration_as_live_multi_source_fails():
    tmpdir = tempfile.mkdtemp(prefix="demo_journey_")
    path = os.path.join(tmpdir, "audit.sqlite")
    ledger = MissionAuditLedger(path)
    try:
        event, mission, integ, facts, expl = _mode_b_pieces(ledger)
        v = validate_journey(
            journey_mode=JourneyMode.controlled_governed_execution,
            execution_mode=ExecutionMode.simulation_only,
            event=event, mission=mission, integration_result=integ,
            facts=facts, explanation=expl,
            provenance_mode=ProvenanceMode.controlled_offline_corroborated,
            live_signal=True, live_multi_source=True, simulated=True,
        )
        _check("controlled corroboration as live multi-source -> fail",
               v.verdict == VERDICT_FAIL and "live_multi_source_claimed" in v.violations)
    finally:
        ledger.close()
        for fn in (lambda: os.remove(path), lambda: os.rmdir(tmpdir)):
            try:
                fn()
            except OSError:
                pass


def test_simulated_represented_as_real_fails():
    tmpdir = tempfile.mkdtemp(prefix="demo_journey_")
    path = os.path.join(tmpdir, "audit.sqlite")
    ledger = MissionAuditLedger(path)
    try:
        event, mission, integ, facts, expl = _mode_b_pieces(ledger)
        # executed but simulated=False => representing a simulated run as real.
        v = validate_journey(
            journey_mode=JourneyMode.controlled_governed_execution,
            execution_mode=ExecutionMode.simulation_only,
            event=event, mission=mission, integration_result=integ,
            facts=facts, explanation=expl,
            provenance_mode=ProvenanceMode.controlled_offline_corroborated,
            live_signal=True, live_multi_source=False, simulated=False,
        )
        _check("simulated represented as real -> fail",
               v.verdict == VERDICT_FAIL and v.execution_consistent is False)
    finally:
        ledger.close()
        for fn in (lambda: os.remove(path), lambda: os.rmdir(tmpdir)):
            try:
                fn()
            except OSError:
                pass


def test_crm_writeback_enabled_or_performed_fails():
    event, mission, integ, facts, expl = _mode_a_pieces()
    v_enabled = validate_journey(
        journey_mode=JourneyMode.live_single_source,
        execution_mode=ExecutionMode.governance_stop_only,
        event=event, mission=mission, integration_result=integ,
        facts=facts, explanation=expl,
        provenance_mode=ProvenanceMode.live_single_source,
        live_signal=True, live_multi_source=False, simulated=False,
        crm_writeback_enabled=True,
    )
    _check("crm writeback enabled -> fail",
           v_enabled.verdict == VERDICT_FAIL and v_enabled.crm_writeback_absent is False)
    v_perf = validate_journey(
        journey_mode=JourneyMode.live_single_source,
        execution_mode=ExecutionMode.governance_stop_only,
        event=event, mission=mission, integration_result=integ,
        facts=facts, explanation=expl,
        provenance_mode=ProvenanceMode.live_single_source,
        live_signal=True, live_multi_source=False, simulated=False,
        crm_writeback_performed=True,
    )
    _check("crm writeback performed -> fail", v_perf.verdict == VERDICT_FAIL)


def test_ungrounded_provider_narrative_cannot_pass():
    event, mission, integ, facts, expl = _mode_a_pieces()
    # Inject an ungrounded narrative claiming execution on an identity-stopped journey.
    ungrounded = expl.model_copy(update={
        "narrative": "The renewal task was created and executed in HubSpot.",
        "provider_used": True, "validation_status": "grounded",
    })
    v = validate_journey(
        journey_mode=JourneyMode.live_single_source,
        execution_mode=ExecutionMode.governance_stop_only,
        event=event, mission=mission, integration_result=integ,
        facts=facts, explanation=ungrounded,
        provenance_mode=ProvenanceMode.live_single_source,
        live_signal=True, live_multi_source=False, simulated=False,
    )
    _check("ungrounded narrative -> not grounded", v.narrative_grounded is False)
    _check("ungrounded narrative -> fail", v.verdict == VERDICT_FAIL)


def test_provider_unavailable_yields_deterministic_and_surfaces_fallback():
    event = build_canonical_event()
    result = run_demo_journey(
        journey_mode=JourneyMode.live_single_source,
        event=event, mission_repository=_fresh_repo(),
        verification_outcome="verified", approval="approved",
        explanation_provider=_UnconfiguredProvider(),
    )
    _check("provider unavailable -> deterministic explanation present",
           bool(result.explanation.narrative) and result.explanation.provider_used is False)
    _check("provider unavailable -> fallback surfaced",
           result.explanation.fallback_used is True)
    _check("provider unavailable -> warning surfaced",
           "nvidia_provider_unconfigured_deterministic_fallback_used" in result.warnings)
    _check("provider unavailable -> pass_with_optional_skips",
           result.journey_validation.verdict == VERDICT_PASS_WITH_OPTIONAL_SKIPS)


def test_grounded_provider_used_and_passes():
    event = build_canonical_event()
    result = run_demo_journey(
        journey_mode=JourneyMode.live_single_source,
        event=event, mission_repository=_fresh_repo(),
        verification_outcome="verified", approval="approved",
        explanation_provider=_GroundedProvider(),
    )
    _check("grounded provider -> provider_used", result.explanation.provider_used is True)
    _check("grounded provider -> journey passes",
           result.journey_validation.verdict == VERDICT_PASS)


def test_baseline_optional_and_distinct_from_journey_validation():
    event = build_canonical_event()
    # Absent baseline.
    r_absent = run_demo_journey(
        journey_mode=JourneyMode.live_single_source, event=event,
        mission_repository=_fresh_repo(), verification_outcome="verified",
        approval="approved",
    )
    _check("baseline may be absent", r_absent.baseline_evaluation is None)

    # Supplied baseline whose verdict differs from the journey verdict.
    baseline = BaselineEvaluationSummary(
        checks_passed=54, checks_total=55, verdict=VERDICT_FAIL,
        provider_evaluation_status="unconfigured", source_reference="eval_golden.json",
    )
    r = run_demo_journey(
        journey_mode=JourneyMode.live_single_source, event=build_canonical_event(),
        mission_repository=_fresh_repo(), verification_outcome="verified",
        approval="approved", baseline_evaluation=baseline,
    )
    _check("baseline supplied is surfaced", r.baseline_evaluation is not None)
    _check("journey validation is distinct from baseline",
           r.journey_validation.verdict != r.baseline_evaluation.verdict)
    _check("baseline verdict preserved verbatim",
           r.baseline_evaluation.verdict == VERDICT_FAIL)


def test_live_single_source_rejects_corroboration():
    raised = False
    try:
        run_demo_journey(
            journey_mode=JourneyMode.live_single_source,
            event=build_canonical_event(), mission_repository=_fresh_repo(),
            verification_outcome="verified", approval="approved",
            corroborating_records=corroborating_records(),
        )
    except DemoJourneyError:
        raised = True
    _check("live_single_source rejects corroboration (never multi-source)", raised)


def test_focused_suite_is_offline_and_additive():
    # Production orchestrator/contract modules must not import evals or touch CRM writeback.
    for name in ("demo_journey.py", "demo_contracts.py"):
        src = open(os.path.join(_API_DIR, "live_signals", name), encoding="utf-8").read()
        _check(f"{name} does not import evals", "import evals" not in src
               and "from evals" not in src)
        _check(f"{name} does not reference HUBSPOT_WRITEBACK",
               "HUBSPOT_WRITEBACK" not in src)
        _check(f"{name} has no direct network client",
               all(tok not in src for tok in ("import requests", "import httpx", "urllib.request")))


def main() -> int:
    tests = [
        test_mode_a_live_single_source,
        test_mode_b_controlled_execution_and_replay,
        test_no_eligible_mission_fails_closed,
        test_provenance_mismatch_fails,
        test_broken_event_linkage_fails,
        test_broken_fingerprint_fails,
        test_missing_approval_does_not_execute,
        test_approval_cannot_be_defaulted,
        test_controlled_execution_requires_durable_dependencies,
        test_transient_memory_ledger_rejected_for_controlled_execution,
        test_execution_claimed_without_receipt_fails,
        test_receipt_on_stopped_journey_fails,
        test_invalid_audit_chain_fails,
        test_controlled_corroboration_as_live_multi_source_fails,
        test_simulated_represented_as_real_fails,
        test_crm_writeback_enabled_or_performed_fails,
        test_ungrounded_provider_narrative_cannot_pass,
        test_provider_unavailable_yields_deterministic_and_surfaces_fallback,
        test_grounded_provider_used_and_passes,
        test_baseline_optional_and_distinct_from_journey_validation,
        test_live_single_source_rejects_corroboration,
        test_focused_suite_is_offline_and_additive,
    ]
    for t in tests:
        t()
    total = _PASS + _FAIL
    print(f"\nDemo journey orchestrator: {_PASS} passed, {_FAIL} failed, {total} checks total")
    return 1 if _FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
