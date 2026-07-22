"""Canonical VentureOS vertical-slice scenarios (L2) -- evaluation pack.

Every scenario runs the REAL, offline flow -- deterministic detector, deterministic
mission selector, and the additive governance adapter over the existing protected
harness -- and reports a typed outcome plus a small set of STABLE business/governance
fields for golden comparison. Nothing here calls HubSpot, the network, or an LLM.

Unstable values (wall-clock time, temp paths, random ids, provider latency) are never
produced: timestamps are injected and ledgers are in-memory/disposable.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel

from harness.audit_ledger import MissionAuditLedger
from harness.fabric import SourceAccountRecord
from harness.service import HarnessServiceDependencies
from live_signals.contracts import (
    DetectionStatus,
    SignalChangeEvent,
    SignalDirection,
)
from live_signals.detector import SignalDetector
from live_signals.mission_contracts import LiveMission, MissionSelectionStatus
from live_signals.mission_selector import select_mission
from live_signals.repository import SignalSnapshotRepository
from live_signals.mission_governance_adapter import (
    EXECUTED,
    REJECTED,
    STOPPED_AWAITING_APPROVAL,
    STOPPED_IDENTITY_UNVERIFIED,
    LiveMissionIntegrationError,
    integrate_live_mission,
)

# -- canonical, deterministic constants --------------------------------------

PORTAL = "246820626"
COMPANY = "335064019691"
ACCOUNT_REF = "curefoods-test"
BASELINE_RENEWAL = "2026-08-31"
ADVERSE_RENEWAL = "2026-06-30"
POSITIVE_RENEWAL = "2026-12-31"
CROSSWALK = f"hubspot:{PORTAL}:{COMPANY}"

_T_BASE = "2026-07-14T09:00:00Z"
_T_CHANGE = "2026-07-21T18:10:00Z"
_T_NOW = "2026-07-21T18:10:00Z"


class ScenarioOutcome(BaseModel):
    """One scenario's result: a pass/fail/skip plus golden-stable fields."""

    name: str
    category: str
    status: str  # "pass" | "fail" | "skip"
    detail: str = ""
    stable: Dict[str, object] = {}


# -- shared builders (real flow, offline) ------------------------------------


def _fresh_detector() -> tuple[SignalDetector, SignalSnapshotRepository]:
    repo = SignalSnapshotRepository(":memory:")
    return SignalDetector(repo), repo


def _baseline_then(repo_detector, new_value: str):
    detector, repo = repo_detector
    detector.detect(
        portal_id=PORTAL, account_id=COMPANY, account_ref=ACCOUNT_REF,
        monitored_field="renewal_date", source_record_type="company",
        source_record_id=COMPANY, raw_value=BASELINE_RENEWAL, detected_at=_T_BASE,
    )
    return detector.detect(
        portal_id=PORTAL, account_id=COMPANY, account_ref=ACCOUNT_REF,
        monitored_field="renewal_date", source_record_type="company",
        source_record_id=COMPANY, raw_value=new_value, detected_at=_T_CHANGE,
    )


def build_canonical_event() -> SignalChangeEvent:
    """Real adverse renewal event, produced by the frozen detector (no HubSpot call)."""
    rd = _fresh_detector()
    result = _baseline_then(rd, ADVERSE_RENEWAL)
    rd[1].close()
    assert result.event is not None, "canonical adverse detection must emit an event"
    return result.event


def build_canonical_mission(event: Optional[SignalChangeEvent] = None) -> LiveMission:
    event = event or build_canonical_event()
    mission = select_mission(event, now=_T_NOW).mission
    assert mission is not None, "canonical adverse event must select a mission"
    return mission


def corroborating_records() -> List[SourceAccountRecord]:
    """OFFLINE-ONLY second source that agrees on the provider-qualified crosswalk so
    the protected identity fabric (>= 2 corroborating systems) can resolve the account.
    This is a controlled test corroboration -- NOT a live multi-source integration."""
    return [
        SourceAccountRecord(
            source_system="salesforce", source_record_id="SF-CUREFOODS-1",
            account_name=ACCOUNT_REF, external_ids={"venture_os_ref": CROSSWALK},
        )
    ]


def governed_facts(result) -> Dict[str, object]:
    """Explicit governed-facts object for the narrative evaluator."""
    return {
        "account_id": COMPANY, "portal_id": PORTAL,
        "monitored_field": "renewal_date",
        "old_value": BASELINE_RENEWAL, "new_value": ADVERSE_RENEWAL,
        "direction": "adverse", "mission_type": "renewal_risk",
        "priority": result.severity, "approval_status": result.approval_input,
        "execution_status": result.status, "executed": result.executed,
    }


# -- the 12 canonical scenarios ----------------------------------------------


def scenario_no_change() -> ScenarioOutcome:
    rd = _fresh_detector()
    result = _baseline_then(rd, BASELINE_RENEWAL)
    rd[1].close()
    ok = result.status == DetectionStatus.unchanged and result.event is None
    return ScenarioOutcome(
        name="no_change", category="signal", status="pass" if ok else "fail",
        detail=f"detection={result.status.value}, event={result.event is not None}",
        stable={"detection_status": result.status.value, "event_emitted": result.event is not None},
    )


def scenario_positive_change() -> ScenarioOutcome:
    rd = _fresh_detector()
    result = _baseline_then(rd, POSITIVE_RENEWAL)
    rd[1].close()
    direction_ok = result.event is not None and result.event.direction is SignalDirection.positive
    selection = select_mission(result.event, now=_T_NOW) if result.event else None
    no_mission = selection is not None and selection.status == MissionSelectionStatus.no_eligible_mission
    ok = direction_ok and no_mission
    return ScenarioOutcome(
        name="positive_change", category="signal", status="pass" if ok else "fail",
        detail=f"direction={result.event.direction.value if result.event else None}, "
               f"selection={selection.status.value if selection else None}",
        stable={"direction": result.event.direction.value if result.event else None,
                "selection_status": selection.status.value if selection else None},
    )


def scenario_adverse_change() -> ScenarioOutcome:
    event = build_canonical_event()
    selection = select_mission(event, now=_T_NOW)
    mission = selection.mission
    # Determinism: same event -> identical mission id.
    again = select_mission(event, now=_T_NOW).mission
    ok = (
        event.direction is SignalDirection.adverse
        and selection.status == MissionSelectionStatus.mission_created
        and mission is not None and mission.mission_type == "renewal_risk"
        and mission.priority.value == "high"
        and mission.mission_id == again.mission_id
    )
    return ScenarioOutcome(
        name="adverse_renewal_change", category="mission", status="pass" if ok else "fail",
        detail=f"mission_type={mission.mission_type if mission else None}, "
               f"priority={mission.priority.value if mission else None}",
        stable={"mission_type": mission.mission_type if mission else None,
                "priority": mission.priority.value if mission else None,
                "mission_id_deterministic": bool(mission and mission.mission_id == again.mission_id)},
    )


def scenario_unsupported_signal() -> ScenarioOutcome:
    event = SignalChangeEvent(
        event_id="SCE-unsupported-1", portal_id=PORTAL, account_id=COMPANY,
        account_ref=ACCOUNT_REF, monitored_field="support_escalation",
        old_value="2", new_value="5", direction=SignalDirection.adverse,
        detected_at=_T_CHANGE, source="hubspot_test", source_record_type="company",
        source_record_id=COMPANY, normalized_old_value="2", normalized_new_value="5",
        change_fingerprint="sig1:unsupported",
    )
    selection = select_mission(event, now=_T_NOW)
    ok = selection.status == MissionSelectionStatus.no_eligible_mission and selection.mission is None
    return ScenarioOutcome(
        name="unsupported_signal", category="mission", status="pass" if ok else "fail",
        detail=f"selection={selection.status.value}",
        stable={"selection_status": selection.status.value},
    )


def scenario_broken_fingerprint() -> ScenarioOutcome:
    event = build_canonical_event()
    mission = build_canonical_mission(event)
    tampered = event.model_copy(update={"change_fingerprint": "sig1:TAMPERED"})
    raised = False
    try:
        integrate_live_mission(
            mission, tampered, verification_outcome="verified", approval="approved",
            corroborating_records=corroborating_records(),
        )
    except LiveMissionIntegrationError:
        raised = True
    return ScenarioOutcome(
        name="broken_event_fingerprint", category="evidence",
        status="pass" if raised else "fail",
        detail="fail-closed before harness" if raised else "did NOT fail closed",
        stable={"failed_closed_before_harness": raised},
    )


def scenario_single_source_identity() -> ScenarioOutcome:
    event = build_canonical_event()
    mission = build_canonical_mission(event)
    result = integrate_live_mission(
        mission, event, verification_outcome="verified", approval="approved",
        corroborating_records=None,
    )
    ok = (
        result.status == STOPPED_IDENTITY_UNVERIFIED
        and result.executed is False
        and result.simulated_receipt_id is None
    )
    return ScenarioOutcome(
        name="single_source_identity", category="identity",
        status="pass" if ok else "fail",
        detail=f"status={result.status}, failure_code={result.failure_code}",
        stable={"status": result.status, "executed": result.executed,
                "has_receipt": result.simulated_receipt_id is not None,
                "failure_code": result.failure_code},
    )


def scenario_corroborated_no_approval() -> ScenarioOutcome:
    event = build_canonical_event()
    mission = build_canonical_mission(event)
    result = integrate_live_mission(
        mission, event, verification_outcome="verified", approval="none",
        corroborating_records=corroborating_records(),
    )
    ok = (
        result.status == STOPPED_AWAITING_APPROVAL
        and result.executed is False and result.simulated_receipt_id is None
    )
    return ScenarioOutcome(
        name="corroborated_no_approval", category="approval",
        status="pass" if ok else "fail", detail=f"status={result.status}",
        stable={"status": result.status, "executed": result.executed,
                "has_receipt": result.simulated_receipt_id is not None},
    )


def scenario_corroborated_rejected() -> ScenarioOutcome:
    event = build_canonical_event()
    mission = build_canonical_mission(event)
    result = integrate_live_mission(
        mission, event, verification_outcome="verified", approval="rejected",
        corroborating_records=corroborating_records(),
    )
    ok = (
        result.status == REJECTED
        and result.executed is False and result.simulated_receipt_id is None
    )
    return ScenarioOutcome(
        name="corroborated_rejected", category="approval",
        status="pass" if ok else "fail", detail=f"status={result.status}",
        stable={"status": result.status, "executed": result.executed,
                "has_receipt": result.simulated_receipt_id is not None},
    )


def scenario_corroborated_approved() -> ScenarioOutcome:
    event = build_canonical_event()
    mission = build_canonical_mission(event)
    result = integrate_live_mission(
        mission, event, verification_outcome="verified", approval="approved",
        corroborating_records=corroborating_records(),
    )
    ok = (
        result.status == EXECUTED and result.executed is True
        and bool(result.simulated_receipt_id) and result.ledger_chain_valid is True
    )
    return ScenarioOutcome(
        name="corroborated_approved", category="execution",
        status="pass" if ok else "fail",
        detail=f"status={result.status}, receipt={bool(result.simulated_receipt_id)}",
        stable={"status": result.status, "executed": result.executed,
                "has_receipt": bool(result.simulated_receipt_id),
                "chain_valid": result.ledger_chain_valid},
    )


def scenario_replay_idempotency() -> ScenarioOutcome:
    event = build_canonical_event()
    mission = build_canonical_mission(event)
    ledger = MissionAuditLedger(":memory:")
    deps = HarnessServiceDependencies(ledger=ledger)
    first = integrate_live_mission(
        mission, event, verification_outcome="verified", approval="approved",
        dependencies=deps, corroborating_records=corroborating_records(),
    )
    second = integrate_live_mission(
        mission, event, verification_outcome="verified", approval="approved",
        dependencies=deps, corroborating_records=corroborating_records(),
    )
    ledger.close()
    ok = (
        first.status == EXECUTED and second.status == EXECUTED
        and second.replayed is True
        and first.simulated_receipt_id == second.simulated_receipt_id
        and first.ledger_record_count == second.ledger_record_count
    )
    return ScenarioOutcome(
        name="replay_idempotency", category="idempotency",
        status="pass" if ok else "fail",
        detail=f"replayed={second.replayed}, same_receipt="
               f"{first.simulated_receipt_id == second.simulated_receipt_id}",
        stable={"replayed": second.replayed,
                "same_receipt": first.simulated_receipt_id == second.simulated_receipt_id,
                "record_count_unchanged": first.ledger_record_count == second.ledger_record_count},
    )


def scenario_audit_tamper() -> ScenarioOutcome:
    """Prove the PUBLIC chain verification detects tampering of a DISPOSABLE test
    ledger's underlying rows. No tamper hook is added to the protected engine -- only
    isolated test data is mutated, then ``verify_mission_chain`` (public) is re-run."""
    event = build_canonical_event()
    mission = build_canonical_mission(event)
    ledger = MissionAuditLedger(":memory:")
    deps = HarnessServiceDependencies(ledger=ledger)
    result = integrate_live_mission(
        mission, event, verification_outcome="verified", approval="approved",
        dependencies=deps, corroborating_records=corroborating_records(),
    )
    mission_id = result.ledger_mission_id or mission.mission_id
    before = ledger.verify_mission_chain(mission_id)
    # Controlled mutation of isolated test data (not a production/protected engine).
    ledger._conn.execute(  # noqa: SLF001 - disposable in-memory test ledger
        "UPDATE mission_audit_records SET canonical_payload = canonical_payload || ' '"
        " WHERE mission_id = ? AND sequence_number = ("
        "   SELECT MIN(sequence_number) FROM mission_audit_records WHERE mission_id = ?)",
        (mission_id, mission_id),
    )
    ledger._conn.commit()  # noqa: SLF001
    after = ledger.verify_mission_chain(mission_id)
    ledger.close()
    ok = before.valid is True and after.valid is False
    return ScenarioOutcome(
        name="audit_chain_tamper_detection", category="audit",
        status="pass" if ok else "fail",
        detail=f"before_valid={before.valid}, after_valid={after.valid}",
        stable={"valid_before_tamper": before.valid, "valid_after_tamper": after.valid},
    )


def scenario_hallucinated_narrative():
    """L2/L3 bridge: a deterministic fabricated narrative must fail groundedness.

    Provider-independent -- no configured model is required. Returns the outcome plus
    the governed facts so the pack can also assert a grounded narrative passes."""
    from evals.eval_narrative import evaluate_narrative

    event = build_canonical_event()
    mission = build_canonical_mission(event)
    stopped = integrate_live_mission(
        mission, event, verification_outcome="verified", approval="none",
        corroborating_records=corroborating_records(),
    )
    facts = governed_facts(stopped)
    fabricated = (
        "I automatically approved and executed the renewal task on your behalf; "
        "the write-back complete on 2025-01-01."
    )
    grounded_text = (
        "Curefoods' renewal moved earlier, from 2026-08-31 to 2026-06-30 -- an adverse "
        "signal. I recommend reviewing the renewal risk. This is awaiting your approval; "
        "no action has been taken."
    )
    bad = evaluate_narrative(fabricated, facts)
    good = evaluate_narrative(grounded_text, facts)
    ok = (bad.grounded is False and len(bad.violations) >= 2 and good.grounded is True)
    return ScenarioOutcome(
        name="hallucinated_narrative_claim", category="narrative",
        status="pass" if ok else "fail",
        detail=f"fabricated_grounded={bad.grounded} (violations={len(bad.violations)}), "
               f"grounded_ok={good.grounded}",
        stable={"fabricated_rejected": bad.grounded is False,
                "grounded_accepted": good.grounded is True},
    ), facts


SCENARIOS = [
    scenario_no_change,
    scenario_positive_change,
    scenario_adverse_change,
    scenario_unsupported_signal,
    scenario_broken_fingerprint,
    scenario_single_source_identity,
    scenario_corroborated_no_approval,
    scenario_corroborated_rejected,
    scenario_corroborated_approved,
    scenario_replay_idempotency,
    scenario_audit_tamper,
]


__all__ = [
    "ScenarioOutcome", "SCENARIOS",
    "build_canonical_event", "build_canonical_mission", "corroborating_records",
    "governed_facts", "scenario_hallucinated_narrative",
    "PORTAL", "COMPANY", "ACCOUNT_REF", "BASELINE_RENEWAL", "ADVERSE_RENEWAL",
]
