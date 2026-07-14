"""Contract tests for the Adaptive Mission Harness (Release 2.2, Commit 1).

Plain-Python, no pytest. Validates:

* MissionState carries exactly the Revision 3 lifecycle states.
* Every contract round-trips through camelCase JSON (by_alias) without loss.
* The cross-language contracts emit the exact camelCase keys from the locked
  spec (ventureOsId, schemaVersion, retrievalQuery, auditRef, ...).
* Hard invariants hold: requires_human_approval must be True; ActionReceipt
  .simulated must be True.
* The additive missionDefinition brief on MissionExecutionPayload is optional
  and round-trips when present.

Run directly:  python services/api/harness/tests/test_contracts.py
"""

from __future__ import annotations

import os
import sys

# -- make ``harness`` importable (services/api on sys.path) ------------------
_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, "..", ".."))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from pydantic import ValidationError  # noqa: E402

from harness.contracts import (  # noqa: E402
    ActionReceipt,
    ApprovalChannel,
    ApprovalDecision,
    ApprovalOutcome,
    CanonicalAccountRef,
    MissionDefinition,
    MissionDefinitionBrief,
    MissionEvaluation,
    MissionExecutionPayload,
    MissionState,
    MissionTurn,
    OutcomeStatus,
    PersonaResponseView,
    RecommendationRef,
    RecommendationSummary,
    RetrievalQuerySpec,
    RiskLevel,
    SuccessCriterion,
    SuccessCriterionBrief,
    SuccessCriterionResult,
    UserDecision,
    VerificationCheck,
    VerificationResult,
)


# -- tiny assertion harness -------------------------------------------------

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


def _roundtrip(model):
    """Serialise to camelCase JSON and parse back into the same type."""
    cls = type(model)
    as_json = model.model_dump_json(by_alias=True)
    return cls.model_validate_json(as_json), as_json


# -- fixtures (deterministic) ----------------------------------------------


def _account() -> CanonicalAccountRef:
    return CanonicalAccountRef(venture_os_id="VOS-CUREFOODS", canonical_name="Curefoods")


def _mission_definition() -> MissionDefinition:
    return MissionDefinition(
        mission_id="MSN-1",
        mission_type="renewal_risk",
        trigger_signal_id="SIG-1",
        canonical_account=_account(),
        objective="Protect the at-risk Curefoods renewal.",
        rationale="Spend is declining and renewal is near.",
        success_criteria=[
            SuccessCriterion(
                criterion_id="SC1",
                description="Renewal outreach prepared and approved.",
                measurement_type="boolean",
                target="true",
            )
        ],
        risk_level=RiskLevel.high,
        permitted_actions=["renewal_prep"],
        selected_template_id="renewal-risk-parallel-v1",
        expected_outcome="Approved simulated renewal outreach.",
    )


def _verification() -> VerificationResult:
    return VerificationResult(
        status="verified",
        checks=[VerificationCheck(name="evidence_sufficient", passed=True, detail="3 evidence items")],
    )


def _recommendation_ref() -> RecommendationRef:
    return RecommendationRef(
        recommendation_id="REC-1",
        ledger_id="LDG-1",
        account_id="ACC-1",
        action_type="renewal_prep",
        priority_rank=1,
        confidence_score=0.82,
        governance_status="ok",
    )


def _payload() -> MissionExecutionPayload:
    return MissionExecutionPayload(
        mission_id="MSN-1",
        turn_index=0,
        mission_state=MissionState.verified,
        canonical_account=_account(),
        intent="risk_review",
        persona_id="seller",
        retrieval_query=RetrievalQuerySpec(subject_id="VOS-CUREFOODS", limit=5),
        recommendation=_recommendation_ref(),
        verification=_verification(),
        mission_definition=MissionDefinitionBrief(
            mission_type="renewal_risk",
            objective="Protect the at-risk Curefoods renewal.",
            rationale="Spend is declining and renewal is near.",
            success_criteria=[SuccessCriterionBrief(criterion_id="SC1", description="Outreach approved.")],
            risk_level="high",
            selected_template_id="renewal-risk-parallel-v1",
            expected_outcome="Approved simulated renewal outreach.",
        ),
        audit_ref="AUD-1",
    )


# -- tests ------------------------------------------------------------------


def test_mission_state_has_revision3_states() -> None:
    expected = {
        "opened", "gathering", "proposed", "verifying", "verified", "blocked",
        "awaiting_approval", "approved", "rejected", "simulated_executed",
        "verified_outcome", "closed",
    }
    actual = {s.value for s in MissionState}
    _check("MissionState carries exactly the Revision 3 states", actual == expected,
           f"missing={expected - actual} extra={actual - expected}")


def test_mission_definition_roundtrip_and_camelcase() -> None:
    md = _mission_definition()
    parsed, as_json = _roundtrip(md)
    _check("MissionDefinition round-trips losslessly", parsed == md)
    data = md.model_dump(by_alias=True)
    _check("MissionDefinition emits camelCase keys",
           "schemaVersion" in data and "triggerSignalId" in data and "requiresHumanApproval" in data,
           str(sorted(data.keys())))
    _check("MissionDefinition canonicalAccount uses ventureOsId",
           data["canonicalAccount"].get("ventureOsId") == "VOS-CUREFOODS")


def test_mission_definition_requires_human_approval_true() -> None:
    raised = False
    try:
        MissionDefinition(
            mission_id="MSN-x", mission_type="renewal_risk", trigger_signal_id="SIG",
            canonical_account=_account(), objective="o", rationale="r",
            risk_level=RiskLevel.high, requires_human_approval=False,  # illegal
        )
    except ValidationError:
        raised = True
    _check("MissionDefinition rejects requires_human_approval=False", raised)


def test_action_receipt_simulated_invariant() -> None:
    ok = ActionReceipt(
        receipt_id="RCP-1", mission_id="MSN-1", recommendation_id="REC-1",
        action_type="renewal_prep", tool_id="simulate_renewal_outreach",
        summary="Simulated outreach prepared.", created_at="2026-07-14T00:00:00Z",
    )
    _check("ActionReceipt defaults simulated=True", ok.simulated is True)
    parsed, _ = _roundtrip(ok)
    _check("ActionReceipt round-trips losslessly", parsed == ok)

    raised = False
    try:
        ActionReceipt(
            receipt_id="RCP-2", mission_id="MSN-1", recommendation_id="REC-1",
            action_type="renewal_prep", tool_id="simulate_renewal_outreach",
            simulated=False,  # illegal
            summary="x", created_at="2026-07-14T00:00:00Z",
        )
    except ValidationError:
        raised = True
    _check("ActionReceipt rejects simulated=False", raised)


def test_approval_decision_roundtrip_voice_channel() -> None:
    dec = ApprovalDecision(
        decision_id="DEC-1", mission_id="MSN-1", outcome=ApprovalOutcome.approved,
        actor="amit", channel=ApprovalChannel.voice, confirm_token="confirm-approve",
        decided_at="2026-07-14T00:00:00Z",
    )
    parsed, as_json = _roundtrip(dec)
    _check("ApprovalDecision round-trips losslessly (voice)", parsed == dec)
    _check("ApprovalDecision emits confirmToken", '"confirmToken"' in as_json)


def test_mission_evaluation_simulated_outcome() -> None:
    ev = MissionEvaluation(
        mission_id="MSN-1",
        objective_achieved=None,
        success_criteria_results=[
            SuccessCriterionResult(criterion_id="SC1", status="met", detail="Outreach approved and simulated.")
        ],
        recommendation_accepted=True,
        action_executed=True,
        outcome_status=OutcomeStatus.simulated,
        evidence_quality_score=0.8,
        user_decision=UserDecision.approved,
        evaluation_notes=["No production write occurred."],
        evaluated_at="2026-07-14T00:00:00Z",
    )
    parsed, _ = _roundtrip(ev)
    _check("MissionEvaluation round-trips losslessly", parsed == ev)
    _check("MissionEvaluation outcomeStatus is simulated", ev.outcome_status is OutcomeStatus.simulated)


def test_execution_payload_roundtrip_and_keys() -> None:
    payload = _payload()
    parsed, as_json = _roundtrip(payload)
    _check("MissionExecutionPayload round-trips losslessly", parsed == payload)
    data = payload.model_dump(by_alias=True)
    for key in ("schemaVersion", "missionId", "turnIndex", "missionState",
                "canonicalAccount", "retrievalQuery", "auditRef", "missionDefinition"):
        _check(f"MissionExecutionPayload has camelCase key '{key}'", key in data, str(sorted(data.keys())))
    _check("MissionExecutionPayload.simulated is True", data["simulated"] is True)
    _check("retrievalQuery.subjectId present",
           data["retrievalQuery"].get("subjectId") == "VOS-CUREFOODS")


def test_execution_payload_missiondefinition_optional() -> None:
    payload = _payload()
    payload_no_brief = payload.model_copy(update={"mission_definition": None})
    parsed, _ = _roundtrip(payload_no_brief)
    _check("MissionExecutionPayload.missionDefinition is optional",
           parsed.mission_definition is None)


def test_mission_turn_roundtrip() -> None:
    turn = MissionTurn(
        mission_id="MSN-1",
        turn_index=0,
        mission_state=MissionState.awaiting_approval,
        canonical_account=_account(),
        persona_response=PersonaResponseView(
            segments=[{"text": "Curefoods renewal is at risk."}],
            citations=[{"recordId": "mem-1"}],
            diagnostics={"fallback": False},
        ),
        voice_summary="Risk review of 1 memory. Top: Curefoods renewal is at risk.",
        verification=_verification(),
        recommendation=RecommendationSummary(
            recommendation_id="REC-1", action_type="renewal_prep",
            confidence_score=0.82, governance_status="ok",
        ),
        requires_approval=True,
        audit_ref="AUD-1",
    )
    parsed, as_json = _roundtrip(turn)
    _check("MissionTurn round-trips losslessly", parsed == turn)
    _check("MissionTurn emits voiceSummary key", '"voiceSummary"' in as_json)
    _check("MissionTurn.requiresApproval round-trips", parsed.requires_approval is True)


_TESTS = [
    test_mission_state_has_revision3_states,
    test_mission_definition_roundtrip_and_camelcase,
    test_mission_definition_requires_human_approval_true,
    test_action_receipt_simulated_invariant,
    test_approval_decision_roundtrip_voice_channel,
    test_mission_evaluation_simulated_outcome,
    test_execution_payload_roundtrip_and_keys,
    test_execution_payload_missiondefinition_optional,
    test_mission_turn_roundtrip,
]


def run() -> tuple[int, int]:
    """Run every test. Returns ``(passed, failed)``."""
    del _RESULTS[:]
    for test in _TESTS:
        try:
            test()
        except Exception as exc:  # noqa: BLE001 -- a raising test is a failed check
            _check(f"{test.__name__} raised", False, f"{type(exc).__name__}: {exc}")
    passed = sum(1 for _, ok, _ in _RESULTS if ok)
    failed = sum(1 for _, ok, _ in _RESULTS if not ok)
    for name, ok, detail in _RESULTS:
        status = "PASS" if ok else "FAIL"
        line = f"[{status}] {name}"
        if not ok and detail:
            line += f"  -- {detail}"
        print(line)
    print(f"\nContracts: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
