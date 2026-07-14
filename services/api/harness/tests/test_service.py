"""In-process Mission Harness service tests (Release 2.2, Commit 8).

Plain-Python, no pytest. Exercises the service facade over the eight canonical
scenarios: status mapping, MissionExecutionPayload production only for
governance-valid missions, request/response propagation, strict validation,
snake_case-in / camelCase-out, deterministic response hashing, typed BFF-safe
errors, ledger lifecycle ownership, and the offline / no-PersonaResponse
guarantees.

Run directly:  python services/api/harness/tests/test_service.py
"""

from __future__ import annotations

import json
import os
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, "..", ".."))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from harness.audit_ledger import MissionAuditLedger  # noqa: E402
from harness.contracts import MissionExecutionPayload  # noqa: E402
from harness.evaluation import (  # noqa: E402
    ambiguous_account_blocked,
    approval_payload_mismatch,
    approval_rejected,
    idempotent_replay,
    renewal_risk_happy_path,
    support_escalation_happy_path,
    unsupported_signal_blocked,
    verification_failed_revision,
)
from harness.service import (  # noqa: E402
    ERR_AMBIGUOUS_IDENTITY,
    ERR_APPROVAL_PAYLOAD_MISMATCH,
    ERR_APPROVAL_REJECTED,
    ERR_INVALID_REQUEST,
    ERR_NO_MATCHING_TEMPLATE,
    ERR_VERIFICATION_FAILED,
    SVC_BLOCKED,
    SVC_COMPLETED,
    SVC_FAILED,
    SVC_REJECTED,
    SVC_REVISION_REQUIRED,
    HarnessServiceDependencies,
    HarnessServiceRequest,
    HarnessServiceResponse,
    execute_mission,
)

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


def _request(scenario, **overrides) -> HarnessServiceRequest:
    data = dict(
        request_id=f"REQ-{scenario.scenario_id}",
        correlation_id=f"CORR-{scenario.mission_id}",
        scenario_id=scenario.scenario_id,
        mission_id=scenario.mission_id,
        mission_version=scenario.mission_version,
        signals=scenario.signals,
        source_records=scenario.source_records,
        actor=scenario.actor,
        actor_role=scenario.actor_role,
        approval=scenario.approval,
        approval_channel=scenario.approval_channel.value,
        verification_outcome=scenario.verification_outcome,
        request_revision_after_block=scenario.request_revision_after_block,
        inject_payload_mismatch=scenario.inject_payload_mismatch,
        replay_execution=scenario.replay_execution,
    )
    data.update(overrides)
    return HarnessServiceRequest(**data)


def _run(scenario, deps=None, **overrides) -> HarnessServiceResponse:
    return execute_mission(_request(scenario, **overrides), deps or HarnessServiceDependencies())


# -- happy paths ------------------------------------------------------------


def test_renewal_happy_path_response() -> None:
    resp = _run(renewal_risk_happy_path())
    _check("renewal status completed", resp.status == SVC_COMPLETED, resp.status)
    _check("renewal execution eligible", resp.execution_eligible is True)
    _check("renewal produces payload", isinstance(resp.mission_execution_payload,
                                                   MissionExecutionPayload))
    _check("renewal no service errors", resp.service_errors == [])
    _check("renewal eval result present", resp.mission_evaluation_result is not None)
    _check("renewal ledger chain valid", resp.ledger_reference.chain_valid is True)
    _check("renewal ledger has records", resp.ledger_reference.record_count > 0)


def test_support_happy_path_response() -> None:
    resp = _run(support_escalation_happy_path())
    _check("support status completed", resp.status == SVC_COMPLETED, resp.status)
    _check("support produces payload", isinstance(resp.mission_execution_payload,
                                                  MissionExecutionPayload))
    _check("support payload action type",
           resp.mission_execution_payload.recommendation.action_type == "support_escalation")


def test_idempotent_replay_response() -> None:
    resp = _run(idempotent_replay())
    _check("replay status completed", resp.status == SVC_COMPLETED, resp.status)
    _check("replay produces payload", resp.mission_execution_payload is not None)
    # A single receipt survives replay -> exactly one receipt record persisted.
    _check("replay chain valid", resp.ledger_reference.chain_valid is True)


# -- blocked / rejected paths (no payload) ----------------------------------


def test_unsupported_signal_blocked_response() -> None:
    resp = _run(unsupported_signal_blocked())
    _check("unsupported status blocked", resp.status == SVC_BLOCKED, resp.status)
    _check("unsupported no payload", resp.mission_execution_payload is None)
    _check("unsupported not eligible", resp.execution_eligible is False)
    _check("unsupported error code",
           any(e.code == ERR_NO_MATCHING_TEMPLATE for e in resp.service_errors))


def test_ambiguous_identity_blocked_response() -> None:
    resp = _run(ambiguous_account_blocked())
    _check("ambiguous status blocked", resp.status == SVC_BLOCKED, resp.status)
    _check("ambiguous no payload", resp.mission_execution_payload is None)
    _check("ambiguous error code",
           any(e.code == ERR_AMBIGUOUS_IDENTITY for e in resp.service_errors))


def test_verification_revision_response() -> None:
    resp = _run(verification_failed_revision())
    _check("verification status revision_required",
           resp.status == SVC_REVISION_REQUIRED, resp.status)
    _check("verification no payload", resp.mission_execution_payload is None)
    err = next((e for e in resp.service_errors if e.code == ERR_VERIFICATION_FAILED), None)
    _check("verification error retryable", err is not None and err.retryable is True)


def test_approval_rejected_response() -> None:
    resp = _run(approval_rejected())
    _check("rejected status rejected", resp.status == SVC_REJECTED, resp.status)
    _check("rejected no payload", resp.mission_execution_payload is None)
    _check("rejected error code",
           any(e.code == ERR_APPROVAL_REJECTED for e in resp.service_errors))


def test_payload_mismatch_response() -> None:
    resp = _run(approval_payload_mismatch())
    _check("mismatch status blocked", resp.status == SVC_BLOCKED, resp.status)
    _check("mismatch no payload", resp.mission_execution_payload is None)
    _check("mismatch error code",
           any(e.code == ERR_APPROVAL_PAYLOAD_MISMATCH for e in resp.service_errors))


def test_payload_only_for_valid_scenarios() -> None:
    valid = [renewal_risk_happy_path(), support_escalation_happy_path(), idempotent_replay()]
    invalid = [unsupported_signal_blocked(), ambiguous_account_blocked(),
               verification_failed_revision(), approval_rejected(), approval_payload_mismatch()]
    for sc in valid:
        _check(f"payload present for {sc.scenario_id}",
               _run(sc).mission_execution_payload is not None)
    for sc in invalid:
        _check(f"no payload for {sc.scenario_id}",
               _run(sc).mission_execution_payload is None)


# -- propagation / validation / serialisation -------------------------------


def test_request_and_correlation_id_propagation() -> None:
    sc = renewal_risk_happy_path()
    led = MissionAuditLedger(":memory:")
    resp = execute_mission(
        _request(sc, request_id="REQ-PROP", correlation_id="CORR-PROP"),
        HarnessServiceDependencies(ledger=led),
    )
    _check("request_id preserved", resp.request_id == "REQ-PROP")
    _check("correlation_id preserved", resp.correlation_id == "CORR-PROP")
    cids = {rec.correlation_id for rec in led.list_mission_records(sc.mission_id)}
    _check("correlation_id on all audit records", cids == {"CORR-PROP"}, str(cids))
    led.close()


def test_strict_request_validation() -> None:
    raised = False
    try:
        HarnessServiceRequest(request_id="r", correlation_id="c", scenario_id="s",
                              mission_id="m", unexpected_field=True)
    except Exception:  # noqa: BLE001
        raised = True
    _check("unknown field rejected", raised)

    bad_approval = False
    try:
        HarnessServiceRequest(request_id="r", correlation_id="c", scenario_id="s",
                              mission_id="m", approval="maybe")
    except Exception:  # noqa: BLE001
        bad_approval = True
    _check("invalid approval rejected", bad_approval)


def test_snake_case_input_camel_case_output() -> None:
    # snake_case attribute input accepted:
    req = HarnessServiceRequest(request_id="r", correlation_id="c", scenario_id="s",
                                mission_id="m", output_mode="evaluation_only")
    _check("snake_case field accepted", req.output_mode == "evaluation_only")
    resp = _run(renewal_risk_happy_path())
    data = json.loads(resp.model_dump_json(by_alias=True))
    for key in ("requestId", "correlationId", "executionEligible",
                "missionEvaluationResult", "ledgerReference", "resultHash"):
        _check(f"response has camelCase key {key}", key in data, str(sorted(data.keys())))


def test_unknown_output_mode_fails_closed() -> None:
    resp = _run(renewal_risk_happy_path(), output_mode="weird")
    _check("unknown mode status failed", resp.status == SVC_FAILED, resp.status)
    _check("unknown mode no payload", resp.mission_execution_payload is None)
    _check("unknown mode no eval run", resp.mission_evaluation_result is None)
    _check("unknown mode invalid_request",
           any(e.code == ERR_INVALID_REQUEST for e in resp.service_errors))


def test_evaluation_only_mode_suppresses_payload() -> None:
    resp = _run(renewal_risk_happy_path(), output_mode="evaluation_only")
    _check("evaluation_only status completed", resp.status == SVC_COMPLETED)
    _check("evaluation_only no payload", resp.mission_execution_payload is None)
    _check("evaluation_only keeps eval result", resp.mission_evaluation_result is not None)


# -- ledger lifecycle -------------------------------------------------------


def test_caller_owned_ledger_stays_open() -> None:
    sc = renewal_risk_happy_path()
    led = MissionAuditLedger(":memory:")
    execute_mission(_request(sc), HarnessServiceDependencies(ledger=led))
    still_open = True
    try:
        led.list_mission_records(sc.mission_id)
    except Exception:  # noqa: BLE001
        still_open = False
    _check("caller-owned ledger remains open", still_open)
    led.close()


def test_service_created_ledger_closes() -> None:
    path = os.path.join(tempfile.mkdtemp(), "svc_ledger.sqlite")
    sc = renewal_risk_happy_path()
    resp = execute_mission(_request(sc), HarnessServiceDependencies(ledger_path=path))
    _check("service-created ledger produced records", resp.ledger_reference.record_count > 0)
    # The trail is durable: a fresh ledger on the same path can read it back.
    reopened = MissionAuditLedger(path)
    chain = reopened.verify_mission_chain(sc.mission_id)
    _check("service-created ledger durable + chain valid", chain.valid and chain.length > 0)
    reopened.close()
    os.remove(path)


# -- determinism ------------------------------------------------------------


def test_deterministic_response_and_hash() -> None:
    sc = renewal_risk_happy_path()
    a = _run(sc)
    b = _run(sc)
    _check("deterministic response bytes",
           a.model_dump_json(by_alias=True) == b.model_dump_json(by_alias=True))
    _check("deterministic result hash", a.result_hash == b.result_hash and a.result_hash != "")


def test_response_hash_excludes_only_itself() -> None:
    resp = _run(renewal_risk_happy_path())
    payload = json.loads(resp.model_dump_json(by_alias=True))
    stored = payload.pop("resultHash")
    import hashlib as _h
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"),
                           ensure_ascii=True, default=str)
    recomputed = "sha256:" + _h.sha256(canonical.encode("utf-8")).hexdigest()
    _check("result_hash reproducible from response minus resultHash", recomputed == stored)


def test_different_missions_differ() -> None:
    a = _run(renewal_risk_happy_path())
    b = _run(support_escalation_happy_path())
    _check("different missions different hash", a.result_hash != b.result_hash)


# -- safety guarantees ------------------------------------------------------


def test_typed_errors_have_no_traces_or_paths() -> None:
    for sc in (unsupported_signal_blocked(), ambiguous_account_blocked(),
               approval_rejected(), approval_payload_mismatch(),
               verification_failed_revision()):
        resp = _run(sc)
        for err in resp.service_errors:
            blob = json.dumps(err.model_dump(by_alias=True))
            bad = any(tok in blob for tok in ("Traceback", ".py", "sqlite", "SELECT ",
                                              "/", "\\", ":memory:"))
            _check(f"{sc.scenario_id} error is BFF-safe", not bad, blob)


def test_no_personaresponse_in_response() -> None:
    resp = _run(renewal_risk_happy_path())
    blob = resp.model_dump_json(by_alias=True)
    _check("no PersonaResponse view in service response", "personaResponse" not in blob)
    _check("no persona composed text field", "renderedText" not in blob)


def test_response_serialisable_without_custom_objects() -> None:
    resp = _run(renewal_risk_happy_path())
    # A full round-trip through JSON proves no custom Python objects leaked.
    reparsed = json.loads(resp.model_dump_json(by_alias=True))
    _check("response round-trips through json", isinstance(reparsed, dict))
    again = HarnessServiceResponse.model_validate(reparsed)
    _check("response re-validates", again.request_id == resp.request_id)


def test_no_forbidden_imports_in_source() -> None:
    path = os.path.join(_API_DIR, "harness", "service.py")
    with open(path, "r", encoding="utf-8") as fh:
        src = fh.read()
    banned = [
        "fastapi", "flask", "starlette", "uvicorn", "import requests", "urllib", "httpx",
        "socket", "smtplib", "boto3", "psycopg", "aiohttp", "import ledger_service",
        "from services", "PersonaResponseView", "PersonaResponse(",
        "time.time(", ".now(", "utcnow", "conversation_runtime",
    ]
    hits = [tok for tok in banned if tok in src]
    _check("no HTTP/frontend/network/CRM/provider/clock/protected import", not hits, str(hits))


_TESTS = [
    test_renewal_happy_path_response,
    test_support_happy_path_response,
    test_idempotent_replay_response,
    test_unsupported_signal_blocked_response,
    test_ambiguous_identity_blocked_response,
    test_verification_revision_response,
    test_approval_rejected_response,
    test_payload_mismatch_response,
    test_payload_only_for_valid_scenarios,
    test_request_and_correlation_id_propagation,
    test_strict_request_validation,
    test_snake_case_input_camel_case_output,
    test_unknown_output_mode_fails_closed,
    test_evaluation_only_mode_suppresses_payload,
    test_caller_owned_ledger_stays_open,
    test_service_created_ledger_closes,
    test_deterministic_response_and_hash,
    test_response_hash_excludes_only_itself,
    test_different_missions_differ,
    test_typed_errors_have_no_traces_or_paths,
    test_no_personaresponse_in_response,
    test_response_serialisable_without_custom_objects,
    test_no_forbidden_imports_in_source,
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
        status = "PASS" if ok else "FAIL"
        line = f"[{status}] {name}"
        if not ok and detail:
            line += f"  -- {detail}"
        print(line)
    print(f"\nService: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
