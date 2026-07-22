"""Phase 2C governance-adapter tests -- plain-Python, no pytest.

Proves the additive LiveMission -> existing governance harness integration end to end,
offline, with zero protected-engine changes:

* a LiveMission maps to the existing renewal-risk harness scenario and severity is
  the versioned LIVE-MISSION-SEVERITY-MAP-v1 mapping (never inferred),
* the real, provider-qualified HubSpot SourceAccountRecord is derived from evidence,
* the human approval gate is honoured: missing ("none") and rejected approvals never
  execute; only an explicit approved decision permits simulated execution,
* approval can never be defaulted (it is a required argument),
* broken evidence linkage and unsupported mission types fail closed,
* the audit ledger is durable and retries are idempotent,
* no HubSpot / network / LLM dependency exists in the adapter path.

Run directly:  python services/api/tests/test_live_mission_governance_adapter.py
"""

from __future__ import annotations

import ast
import inspect
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from harness.audit_ledger import MissionAuditLedger  # noqa: E402
from harness.fabric import SourceAccountRecord  # noqa: E402
from harness.service import HarnessServiceDependencies  # noqa: E402
from live_signals.contracts import SignalChangeEvent, SignalDirection  # noqa: E402
from live_signals.mission_contracts import MissionPriority  # noqa: E402
from live_signals.mission_selector import select_mission  # noqa: E402
import live_signals.mission_governance_adapter as adapter_module  # noqa: E402
from live_signals.mission_governance_adapter import (  # noqa: E402
    EXECUTED,
    REJECTED,
    SEVERITY_MAP_VERSION,
    STOPPED_AWAITING_APPROVAL,
    STOPPED_IDENTITY_UNVERIFIED,
    LiveMissionIntegrationError,
    build_source_account_record,
    integrate_live_mission,
    map_severity,
)

PORTAL = "246820626"
COMPANY = "335064019691"
FINGERPRINT = "sig1:716f86dcaf33cc3c80930e16ae196e2725f6cb7aa2422ff285e1e23ff5931b21"
T0 = "2026-07-21T18:10:00Z"

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


def _event(*, old="2026-08-31", new="2026-06-30", field="renewal_date",
           direction=SignalDirection.adverse, event_id="SCE-e85ee65385e06647") -> SignalChangeEvent:
    return SignalChangeEvent(
        event_id=event_id, portal_id=PORTAL, account_id=COMPANY, account_ref="curefoods-test",
        monitored_field=field, old_value=old, new_value=new, direction=direction,
        detected_at=T0, source="hubspot_test", source_record_type="company",
        source_record_id=COMPANY, normalized_old_value=old, normalized_new_value=new,
        change_fingerprint=FINGERPRINT,
    )


def _mission(event: SignalChangeEvent):
    return select_mission(event, now=T0).mission


def _corroborating() -> list[SourceAccountRecord]:
    """OFFLINE-ONLY corroboration: a second real-shaped source system that agrees on
    the same provider-qualified crosswalk id, so the protected identity fabric (which
    requires >= 2 corroborating systems) can resolve the account for the executed proof."""
    return [
        SourceAccountRecord(
            source_system="salesforce",
            source_record_id="SF-CUREFOODS-1",
            account_name="curefoods-test",
            external_ids={"venture_os_ref": f"hubspot:{PORTAL}:{COMPANY}"},
        )
    ]


def _integrate(event, mission, *, approval, verification_outcome="verified",
               dependencies=None, corroborating=True):
    return integrate_live_mission(
        mission, event,
        verification_outcome=verification_outcome, approval=approval,
        dependencies=dependencies,
        corroborating_records=_corroborating() if corroborating else None,
    )


# -- mapping + identity ------------------------------------------------------


def test_live_mission_maps_to_renewal_risk_scenario() -> None:
    event = _event()
    mission = _mission(event)
    res = _integrate(event, mission, approval="approved")
    _check("mission maps to renewal-risk executed", res.status == EXECUTED, res.failure_reason or "")
    _check("governance status completed", res.governance_status == "completed")


def test_source_account_record_is_provider_qualified() -> None:
    event = _event()
    mission = _mission(event)
    record = build_source_account_record(mission, event)
    _check("provider is hubspot", record.source_system == "hubspot")
    _check("record id is the company id", record.source_record_id == COMPANY)
    _check("crosswalk is provider-qualified",
           record.external_ids.get("venture_os_ref") == f"hubspot:{PORTAL}:{COMPANY}")
    _check("portal id carried", record.external_ids.get("hubspot_portal_id") == PORTAL)
    _check("company id carried", record.external_ids.get("hubspot_company_id") == COMPANY)


def test_severity_mapping_is_deterministic_and_versioned() -> None:
    _check("severity map version", SEVERITY_MAP_VERSION == "LIVE-MISSION-SEVERITY-MAP-v1")
    _check("medium->medium", map_severity(MissionPriority.medium) == "medium")
    _check("high->high", map_severity(MissionPriority.high) == "high")
    _check("critical->critical", map_severity(MissionPriority.critical) == "critical")
    res = _integrate(_event(), _mission(_event()), approval="approved")
    _check("canonical high severity carried", res.severity == "high")


# -- approval gate -----------------------------------------------------------


def test_missing_approval_never_executes() -> None:
    event = _event()
    res = _integrate(event, _mission(event), approval="none")
    _check("missing approval -> stopped awaiting approval", res.status == STOPPED_AWAITING_APPROVAL)
    _check("missing approval -> not executed", res.executed is False)
    _check("missing approval -> no receipt", res.simulated_receipt_id is None)
    _check("missing approval -> approval required", res.approval_required is True)
    _check("missing approval -> audit still recorded", res.ledger_record_count > 0)


def test_rejected_approval_never_executes() -> None:
    event = _event()
    res = _integrate(event, _mission(event), approval="rejected")
    _check("rejected -> status rejected", res.status == REJECTED)
    _check("rejected -> not executed", res.executed is False)
    _check("rejected -> no receipt", res.simulated_receipt_id is None)
    _check("rejected -> audit recorded", res.ledger_record_count > 0)


def test_approved_permits_simulated_execution() -> None:
    event = _event()
    res = _integrate(event, _mission(event), approval="approved")
    _check("approved -> executed", res.status == EXECUTED)
    _check("approved -> receipt present", bool(res.simulated_receipt_id))
    _check("approved -> execution eligible", res.execution_eligible is True)
    _check("approved -> chain valid", res.ledger_chain_valid is True)
    _check("approved -> audit recorded", res.ledger_record_count > 0)


def test_approval_cannot_be_defaulted() -> None:
    sig = inspect.signature(integrate_live_mission)
    _check("approval is a required parameter", sig.parameters["approval"].default is inspect._empty)
    _check("verification is a required parameter",
           sig.parameters["verification_outcome"].default is inspect._empty)


# -- fail-closed guards ------------------------------------------------------


def test_event_fingerprint_mismatch_fails_closed() -> None:
    event = _event()
    mission = _mission(event)
    other = _event(event_id="SCE-DIFFERENT")  # mission still links to the original event id
    raised = False
    try:
        _integrate(other, mission, approval="approved")
    except LiveMissionIntegrationError:
        raised = True
    _check("linkage mismatch fails closed before harness", raised)


def test_unsupported_mission_type_fails_closed() -> None:
    event = _event()
    mission = _mission(event).model_copy(update={"mission_type": "billing_dispute"})
    res = _integrate(event, mission, approval="approved")
    _check("unsupported mission type not executed", res.executed is False)
    _check("unsupported mission type blocked/failed", res.status in {"blocked", "failed"})
    _check("unsupported mission type is NOT an identity stop",
           res.status != STOPPED_IDENTITY_UNVERIFIED)
    _check("unsupported mission type not tagged ambiguous_identity",
           res.failure_code != "ambiguous_identity")


def test_single_source_blocks_at_identity() -> None:
    event = _event()
    res = _integrate(event, _mission(event), approval="approved", corroborating=False)
    _check("single real source -> not executed", res.executed is False)
    _check("single real source -> typed identity stop",
           res.status == STOPPED_IDENTITY_UNVERIFIED)
    _check("single real source -> governance status blocked", res.governance_status == "blocked")
    _check("single real source -> ambiguous_identity failure code",
           res.failure_code == "ambiguous_identity")
    _check("single real source -> distinct from awaiting-approval",
           res.status != STOPPED_AWAITING_APPROVAL)
    _check("single real source -> distinct from rejected", res.status != REJECTED)


# -- durability + idempotency ------------------------------------------------


def test_audit_is_durable_and_retry_is_idempotent() -> None:
    event = _event()
    mission = _mission(event)
    ledger = MissionAuditLedger(":memory:")
    deps = HarnessServiceDependencies(ledger=ledger)
    first = _integrate(event, mission, approval="approved", dependencies=deps)
    second = _integrate(event, mission, approval="approved", dependencies=deps)
    _check("first run executes", first.status == EXECUTED)
    _check("retry executes (replay)", second.status == EXECUTED)
    _check("retry is a durable replay", second.replayed is True)
    _check("retry receipt identical", first.simulated_receipt_id == second.simulated_receipt_id)
    _check("retry adds no new ledger records",
           first.ledger_record_count == second.ledger_record_count)
    ledger.close()


# -- no HubSpot / network / LLM ---------------------------------------------


def test_adapter_has_no_network_or_llm_dependency() -> None:
    src = inspect.getsource(adapter_module)
    tree = ast.parse(src)
    banned = {"requests", "httpx", "urllib", "socket", "openai", "nvidia", "crm_connectors"}
    hits: list[str] = []
    for node in ast.walk(tree):
        names = []
        if isinstance(node, ast.Import):
            names = [a.name.split(".")[0] for a in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module:
            names = [node.module.split(".")[0]]
        for n in names:
            if n in banned:
                hits.append(n)
    _check("adapter imports no network/LLM/CRM module", not hits, ", ".join(hits))
    _check("adapter references no hubspot connector",
           "hubspot_connector" not in src and "create_task" not in src and "create_note" not in src)


_TESTS = [
    test_live_mission_maps_to_renewal_risk_scenario,
    test_source_account_record_is_provider_qualified,
    test_severity_mapping_is_deterministic_and_versioned,
    test_missing_approval_never_executes,
    test_rejected_approval_never_executes,
    test_approved_permits_simulated_execution,
    test_approval_cannot_be_defaulted,
    test_event_fingerprint_mismatch_fails_closed,
    test_unsupported_mission_type_fails_closed,
    test_single_source_blocks_at_identity,
    test_audit_is_durable_and_retry_is_idempotent,
    test_adapter_has_no_network_or_llm_dependency,
]


def run() -> tuple[int, int]:
    del _RESULTS[:]
    for test in _TESTS:
        try:
            test()
        except Exception as exc:  # noqa: BLE001
            _check(f"{test.__name__} raised", False, f"{type(exc).__name__}: {exc}")
    passed = sum(1 for _, ok, _ in _RESULTS if ok)
    failed = sum(1 for _, ok, _ in _RESULTS if not ok)
    for name, ok, detail in _RESULTS:
        line = f"[{'PASS' if ok else 'FAIL'}] {name}"
        if not ok and detail:
            line += f"  -- {detail}"
        print(line)
    print(f"\nLive mission governance adapter: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
