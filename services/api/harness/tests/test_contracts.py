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
    ApprovalRequest,
    CanonicalAccountRef,
    EvidenceRef,
    MissionDefinition,
    MissionDefinitionBrief,
    MissionEvaluation,
    MissionEvent,
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


def _approval_request() -> ApprovalRequest:
    return ApprovalRequest(
        mission_id="MSN-1",
        mission_version="v1",
        recommendation_id="REC-1",
        action_type="renewal_prep",
        permitted_actions=["renewal_prep"],
        action_payload_ref="PAY-1",
        action_payload_hash="sha256:abc123",
        verification_ref="VER-1",
        prompt="Approve simulated renewal outreach for Curefoods?",
    )


def _payload() -> MissionExecutionPayload:
    return MissionExecutionPayload(
        mission_id="MSN-1",
        turn_index=0,
        mission_state=MissionState.verified,
        canonical_account=_account(),
        intent="risk_review",
        persona_id="seller",
        selected_template_id="renewal-risk-parallel-v1",
        retrieval_query=RetrievalQuerySpec(subject_id="VOS-CUREFOODS", limit=5),
        recommendation=_recommendation_ref(),
        permitted_actions=["renewal_prep"],
        evidence_refs=[
            EvidenceRef(record_id="mem-1", category="spend", source="memory", summary="Spend down 22% QoQ.")
        ],
        verification=_verification(),
        verification_ref="VER-1",
        approval_request=_approval_request(),
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


def _approval_decision(channel: ApprovalChannel = ApprovalChannel.voice) -> ApprovalDecision:
    return ApprovalDecision(
        decision_id="DEC-1", mission_id="MSN-1", mission_version="v1",
        outcome=ApprovalOutcome.approved, actor="amit", actor_role="manager",
        channel=channel, approved_action_ref="PAY-1", approved_payload_hash="sha256:abc123",
        confirm_token="confirm-approve" if channel is ApprovalChannel.voice else None,
        decided_at="2026-07-14T00:00:00Z",
    )


def test_action_receipt_simulated_invariant() -> None:
    ok = ActionReceipt(
        receipt_id="RCP-1", mission_id="MSN-1", recommendation_id="REC-1",
        action_type="renewal_prep", target_type="account", target_id="VOS-CUREFOODS",
        tool_id="simulate_renewal_outreach", approved_payload_hash="sha256:abc123",
        before_state={"outreach": "none"}, after_state={"outreach": "drafted"},
        summary="Simulated outreach prepared.", audit_ref="AUD-1",
        created_at="2026-07-14T00:00:00Z",
    )
    _check("ActionReceipt defaults simulated=True", ok.simulated is True)
    parsed, _ = _roundtrip(ok)
    _check("ActionReceipt round-trips losslessly", parsed == ok)
    _check("ActionReceipt records before/after state",
           ok.before_state == {"outreach": "none"} and ok.after_state == {"outreach": "drafted"})

    raised = False
    try:
        ActionReceipt(
            receipt_id="RCP-2", mission_id="MSN-1", recommendation_id="REC-1",
            action_type="renewal_prep", target_type="account", target_id="VOS-CUREFOODS",
            tool_id="simulate_renewal_outreach", approved_payload_hash="sha256:abc123",
            simulated=False,  # illegal
            summary="x", audit_ref="AUD-1", created_at="2026-07-14T00:00:00Z",
        )
    except ValidationError:
        raised = True
    _check("ActionReceipt rejects simulated=False", raised)


def test_approval_decision_roundtrip_voice_channel() -> None:
    dec = _approval_decision(ApprovalChannel.voice)
    parsed, as_json = _roundtrip(dec)
    _check("ApprovalDecision round-trips losslessly (voice)", parsed == dec)
    _check("ApprovalDecision emits confirmToken", '"confirmToken"' in as_json)


def test_approval_bound_to_mission_version_and_payload() -> None:
    req = _approval_request()
    dec = _approval_decision(ApprovalChannel.screen)
    _check("ApprovalDecision bound to same mission version as request",
           dec.mission_version == req.mission_version)
    _check("ApprovalDecision bound to reviewed action payload hash",
           dec.approved_payload_hash == req.action_payload_hash)
    _check("ApprovalDecision carries actor role", dec.actor_role == "manager")


def test_approval_request_roundtrip() -> None:
    req = _approval_request()
    parsed, as_json = _roundtrip(req)
    _check("ApprovalRequest round-trips losslessly", parsed == req)
    _check("ApprovalRequest emits actionPayloadHash key", '"actionPayloadHash"' in as_json)
    _check("ApprovalRequest emits verificationRef key", '"verificationRef"' in as_json)


def test_governance_contracts_reject_simulated_false() -> None:
    for label, kwargs, cls in (
        ("ApprovalRequest", dict(
            mission_id="M", mission_version="v1", recommendation_id="R", action_type="a",
            action_payload_ref="P", action_payload_hash="h", verification_ref="V",
            prompt="?", simulated=False), ApprovalRequest),
        ("ApprovalDecision", dict(
            decision_id="D", mission_id="M", mission_version="v1", outcome=ApprovalOutcome.approved,
            actor="a", actor_role="r", approved_action_ref="P", approved_payload_hash="h",
            decided_at="2026-07-14T00:00:00Z", simulated=False), ApprovalDecision),
    ):
        raised = False
        try:
            cls(**kwargs)
        except ValidationError:
            raised = True
        _check(f"{label} rejects simulated=False", raised)


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
                "canonicalAccount", "selectedTemplateId", "retrievalQuery", "permittedActions",
                "evidenceRefs", "verificationRef", "approvalRequest", "auditRef", "missionDefinition"):
        _check(f"MissionExecutionPayload has camelCase key '{key}'", key in data, str(sorted(data.keys())))
    _check("MissionExecutionPayload.simulated is True", data["simulated"] is True)
    _check("retrievalQuery.subjectId present",
           data["retrievalQuery"].get("subjectId") == "VOS-CUREFOODS")


def test_execution_payload_has_no_persona_response() -> None:
    payload = _payload()
    data = payload.model_dump(by_alias=True)
    as_json = payload.model_dump_json(by_alias=True)
    banned = {"personaResponse", "persona_response", "segments", "citations", "voiceSummary", "voice_summary"}
    _check("MissionExecutionPayload carries no PersonaResponse fields",
           banned.isdisjoint(data.keys()) and "personaResponse" not in as_json,
           str(sorted(data.keys())))


def test_snake_case_input_camelcase_output() -> None:
    # Python-side snake_case input must parse and serialise to camelCase JSON.
    dec = ApprovalDecision(
        decision_id="DEC-9", mission_id="MSN-9", mission_version="v2",
        outcome=ApprovalOutcome.approved, actor="amit", actor_role="manager",
        approved_action_ref="PAY-9", approved_payload_hash="sha256:zzz",
        decided_at="2026-07-14T00:00:00Z",
    )
    as_json = dec.model_dump_json(by_alias=True)
    _check("snake_case input serialises to camelCase (approvedPayloadHash)",
           '"approvedPayloadHash"' in as_json and '"approved_payload_hash"' not in as_json)
    # camelCase JSON must parse back via populate_by_name.
    reparsed = ApprovalDecision.model_validate_json(as_json)
    _check("camelCase JSON parses back into the model", reparsed == dec)


def test_mission_event_blocked_revision_requested() -> None:
    ev = MissionEvent(
        event_id="EVT-1", mission_id="MSN-1", mission_version="v1",
        event_type="revision_requested", from_state=MissionState.blocked,
        to_state=MissionState.gathering, actor="amit",
        reason="Evidence insufficient; request revision.",
        correlation_id="COR-1", occurred_at="2026-07-14T00:00:00Z",
    )
    parsed, _ = _roundtrip(ev)
    _check("MissionEvent round-trips losslessly", parsed == ev)
    _check("MissionEvent represents blocked -> revision_requested -> gathering",
           ev.from_state is MissionState.blocked
           and ev.event_type == "revision_requested"
           and ev.to_state is MissionState.gathering)


def test_numeric_bounds_enforced() -> None:
    raised_conf = False
    try:
        RecommendationRef(recommendation_id="R", ledger_id="L", account_id="A",
                          action_type="a", priority_rank=1, confidence_score=1.5,  # > 1.0
                          governance_status="ok")
    except ValidationError:
        raised_conf = True
    _check("RecommendationRef rejects confidence_score > 1.0", raised_conf)

    raised_rank = False
    try:
        RecommendationRef(recommendation_id="R", ledger_id="L", account_id="A",
                          action_type="a", priority_rank=0,  # < 1
                          confidence_score=0.5, governance_status="ok")
    except ValidationError:
        raised_rank = True
    _check("RecommendationRef rejects priority_rank < 1", raised_rank)

    raised_score = False
    try:
        MissionEvaluation(
            mission_id="M", recommendation_accepted=True, action_executed=True,
            outcome_status=OutcomeStatus.simulated, evidence_quality_score=-0.1,  # < 0
            user_decision=UserDecision.approved, evaluated_at="2026-07-14T00:00:00Z",
        )
    except ValidationError:
        raised_score = True
    _check("MissionEvaluation rejects evidence_quality_score < 0", raised_score)


def test_schema_version_present_on_cross_language_contracts() -> None:
    cases = {
        "MissionDefinition": _mission_definition(),
        "MissionExecutionPayload": _payload(),
        "MissionTurn": _mission_turn(),
        "ApprovalRequest": _approval_request(),
        "ApprovalDecision": _approval_decision(ApprovalChannel.screen),
        "MissionEvent": MissionEvent(
            event_id="E", mission_id="M", mission_version="v1", event_type="opened",
            actor="system", correlation_id="C", occurred_at="2026-07-14T00:00:00Z"),
    }
    for label, model in cases.items():
        data = model.model_dump(by_alias=True)
        _check(f"{label} exposes schemaVersion", data.get("schemaVersion") == "1.0")
    # ActionReceipt built separately (many required fields).
    receipt = ActionReceipt(
        receipt_id="RCP-1", mission_id="M", recommendation_id="R", action_type="a",
        target_type="account", target_id="X", tool_id="t", approved_payload_hash="h",
        summary="s", audit_ref="A", created_at="2026-07-14T00:00:00Z",
    )
    _check("ActionReceipt exposes schemaVersion",
           receipt.model_dump(by_alias=True).get("schemaVersion") == "1.0")


def test_deterministic_serialization() -> None:
    payload = _payload()
    first = payload.model_dump_json(by_alias=True)
    second = payload.model_dump_json(by_alias=True)
    _check("MissionExecutionPayload serialises deterministically (stable bytes)", first == second)
    reparsed = MissionExecutionPayload.model_validate_json(first).model_dump_json(by_alias=True)
    _check("MissionExecutionPayload re-serialises identically after round-trip", reparsed == first)


def test_execution_payload_missiondefinition_optional() -> None:
    payload = _payload()
    payload_no_brief = payload.model_copy(update={"mission_definition": None})
    parsed, _ = _roundtrip(payload_no_brief)
    _check("MissionExecutionPayload.missionDefinition is optional",
           parsed.mission_definition is None)


def _mission_turn() -> MissionTurn:
    return MissionTurn(
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


def test_mission_turn_roundtrip() -> None:
    turn = _mission_turn()
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
    test_approval_bound_to_mission_version_and_payload,
    test_approval_request_roundtrip,
    test_governance_contracts_reject_simulated_false,
    test_mission_evaluation_simulated_outcome,
    test_execution_payload_roundtrip_and_keys,
    test_execution_payload_has_no_persona_response,
    test_execution_payload_missiondefinition_optional,
    test_snake_case_input_camelcase_output,
    test_mission_event_blocked_revision_requested,
    test_numeric_bounds_enforced,
    test_schema_version_present_on_cross_language_contracts,
    test_deterministic_serialization,
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
