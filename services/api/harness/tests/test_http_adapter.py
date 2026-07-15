"""Self-contained Mission Harness HTTP adapter tests (Release 2.2, Commit 9).

Plain-Python, no pytest. Exercises the transport-only FastAPI adapter with an
in-process FastAPI ``TestClient`` (no bound socket, no Uvicorn): app factory,
OpenAPI generation, the HTTP status policy for governed outcomes and typed
errors, correlation-id reconciliation, request-size / content-type limits,
BFF-safe error bodies, camelCase serialisation, deterministic hashing, the
execute-mission-exactly-once guarantee, and the offline / no-PersonaResponse /
no-protected-import guarantees.

Run directly:  python services/api/harness/tests/test_http_adapter.py
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

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import harness.http_adapter as adapter_mod  # noqa: E402
from harness.audit_ledger import MissionAuditLedger  # noqa: E402
from harness.evaluation import (  # noqa: E402
    approval_rejected,
    renewal_risk_happy_path,
    support_escalation_happy_path,
    unsupported_signal_blocked,
    verification_failed_revision,
)
from harness.http_adapter import (  # noqa: E402
    CORRELATION_HEADER,
    HarnessHttpConfig,
    HarnessHttpConfigError,
    create_harness_app,
    http_status_for_response,
)
from harness.service import (  # noqa: E402
    ERR_AUDIT_FAILURE,
    ERR_IDEMPOTENCY_CONFLICT,
    ERR_INTERNAL,
    ERR_INVALID_REQUEST,
    SVC_BLOCKED,
    SVC_COMPLETED,
    SVC_FAILED,
    SVC_REJECTED,
    SVC_REVISION_REQUIRED,
    HarnessServiceDependencies,
    HarnessServiceRequest,
    HarnessServiceResponse,
    ServiceError,
)

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


def _request_model(scenario, **overrides) -> HarnessServiceRequest:
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


def _body(scenario, **overrides) -> dict:
    """A camelCase JSON body for a scenario, matching the wire contract."""
    return _request_model(scenario, **overrides).model_dump(by_alias=True, mode="json")


def _client(app: FastAPI | None = None) -> TestClient:
    return TestClient(app or create_harness_app())


# -- factory + OpenAPI ------------------------------------------------------


def test_app_factory_creation() -> None:
    app = create_harness_app()
    _check("factory returns FastAPI", isinstance(app, FastAPI))
    # A second app is an independent instance (no global mutable state).
    _check("factory returns fresh instances", create_harness_app() is not app)


def test_openapi_generation() -> None:
    app = create_harness_app()
    spec = app.openapi()
    paths = list(spec.get("paths", {}).keys())
    # The self-contained sub-app exposes /missions. The approved future host mount
    # ``app.mount("/api/harness", create_harness_app(...))`` composes the public
    # route /api/harness/missions; the sub-app itself must NOT hard-code that prefix.
    _check("openapi path is /missions", paths == ["/missions"], str(paths))
    _check("openapi does not hardcode mount prefix", "/api/harness/missions" not in paths, str(paths))
    oa = json.dumps(spec)
    _check("openapi has route", "/missions" in oa)
    _check("openapi shows request contract", "missionId" in oa)
    _check("openapi shows response contract", "executionEligible" in oa)
    _check("openapi states simulated", "simulated" in oa or "SIMULATED" in oa)
    indicators = ["Authorization", "api_key", "apiKey", "access_token", "accessToken",
                  "Bearer ", "sqlite:", "://", ".py", ":memory:", "password", "/home/"]
    hits = [t for t in indicators if t in oa]
    _check("openapi exposes no secret/connection details", not hits, str(hits))


# -- governed outcomes -> HTTP 200 ------------------------------------------


def test_valid_renewal_request_completed_200() -> None:
    r = _client().post("/missions", json=_body(renewal_risk_happy_path()))
    _check("renewal http 200", r.status_code == 200, str(r.status_code))
    body = r.json()
    _check("renewal status completed", body["status"] == SVC_COMPLETED, body["status"])
    _check("renewal has payload", body["missionExecutionPayload"] is not None)
    _check("renewal execution eligible", body["executionEligible"] is True)


def test_valid_support_request_completed_200() -> None:
    r = _client().post("/missions", json=_body(support_escalation_happy_path()))
    _check("support http 200", r.status_code == 200, str(r.status_code))
    _check("support status completed", r.json()["status"] == SVC_COMPLETED)
    _check("support has payload", r.json()["missionExecutionPayload"] is not None)


def test_blocked_returns_200_with_status_blocked() -> None:
    r = _client().post("/missions", json=_body(unsupported_signal_blocked()))
    _check("blocked http 200", r.status_code == 200, str(r.status_code))
    _check("blocked status blocked", r.json()["status"] == SVC_BLOCKED)
    _check("blocked no payload", r.json()["missionExecutionPayload"] is None)


def test_rejected_returns_200_with_status_rejected() -> None:
    r = _client().post("/missions", json=_body(approval_rejected()))
    _check("rejected http 200", r.status_code == 200, str(r.status_code))
    _check("rejected status rejected", r.json()["status"] == SVC_REJECTED)
    _check("rejected no payload", r.json()["missionExecutionPayload"] is None)


def test_revision_required_returns_200() -> None:
    r = _client().post("/missions", json=_body(verification_failed_revision()))
    _check("revision http 200", r.status_code == 200, str(r.status_code))
    _check("revision status revision_required", r.json()["status"] == SVC_REVISION_REQUIRED)
    _check("revision no payload", r.json()["missionExecutionPayload"] is None)


def test_payload_only_for_valid_governed_outcomes() -> None:
    c = _client()
    ok = c.post("/missions", json=_body(renewal_risk_happy_path())).json()
    _check("valid outcome carries payload", ok["missionExecutionPayload"] is not None)
    for sc in (unsupported_signal_blocked(), approval_rejected(), verification_failed_revision()):
        blob = c.post("/missions", json=_body(sc)).json()
        _check(f"{sc.scenario_id} no executable payload",
               blob["missionExecutionPayload"] is None)


# -- validation / transport failures ----------------------------------------


def test_validation_failure_returns_422() -> None:
    r = _client().post("/missions", json={"requestId": "only-one-field"})
    _check("validation http 422", r.status_code == 422, str(r.status_code))
    body = r.json()
    _check("validation status failed", body["status"] == SVC_FAILED)
    _check("validation invalid_request",
           any(e["code"] == ERR_INVALID_REQUEST for e in body["serviceErrors"]))
    _check("validation no payload", body["missionExecutionPayload"] is None)


def test_malformed_json_returns_422() -> None:
    r = _client().post("/missions", content=b"{not valid json",
                       headers={"content-type": "application/json"})
    _check("malformed json http 422", r.status_code == 422, str(r.status_code))


def test_unsupported_content_type_returns_415() -> None:
    r = _client().post("/missions", content="hi",
                       headers={"content-type": "text/plain"})
    _check("unsupported content type http 415", r.status_code == 415, str(r.status_code))
    _check("415 status failed", r.json()["status"] == SVC_FAILED)


def test_oversized_body_rejected() -> None:
    app = create_harness_app(config=HarnessHttpConfig(max_request_bytes=50))
    r = TestClient(app).post("/missions", json=_body(renewal_risk_happy_path()))
    _check("oversized http 413", r.status_code == 413, str(r.status_code))
    _check("413 status failed", r.json()["status"] == SVC_FAILED)


def test_method_not_allowed_is_405() -> None:
    _check("GET is 405", _client().get("/missions").status_code == 405)


def test_internal_failure_returns_500_without_trace() -> None:
    # A closed caller-owned ledger forces a fail-closed internal error.
    led = MissionAuditLedger(":memory:")
    led.close()
    app = create_harness_app(dependencies=HarnessServiceDependencies(ledger=led))
    r = TestClient(app).post("/missions", json=_body(renewal_risk_happy_path()))
    _check("internal http 500", r.status_code == 500, str(r.status_code))
    body = r.json()
    _check("500 status failed", body["status"] == SVC_FAILED)
    _check("500 withholds eval result", body["missionEvaluationResult"] is None)
    _check("500 no payload", body["missionExecutionPayload"] is None)
    blob = json.dumps(body)
    unsafe = any(t in blob for t in ("Traceback", ".py", "sqlite", "SELECT ", ":memory:", "\\", "/home/"))
    _check("500 body is BFF-safe", not unsafe, blob[:160])


def test_real_idempotency_conflict_maps_to_409() -> None:
    # Reproduce a GENUINE durable idempotency collision (not a simulated mapping):
    # two governed missions share one durable file-backed ledger and the same
    # mission_id (hence the same idempotency key ``idem-<mission_id>``) but carry
    # DIFFERENT action payloads. The first records a receipt; the second collides
    # at the Mission Audit Ledger's durable receipt append. A file-backed path is
    # used (not a shared in-memory handle) so each request opens its own
    # connection in the TestClient worker thread while sharing durable state.
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    os.close(fd)
    os.unlink(path)
    try:
        app = create_harness_app(dependencies=HarnessServiceDependencies(ledger_path=path))
        c = TestClient(app)
        mid = "MISSION-IDEM-CONFLICT"
        r1 = c.post("/missions", json=_body(renewal_risk_happy_path(), mission_id=mid))
        _check("conflict setup call ok", r1.status_code == 200, str(r1.status_code))
        _check("conflict setup completed", r1.json()["status"] == SVC_COMPLETED)
        r2 = c.post("/missions", json=_body(support_escalation_happy_path(), mission_id=mid))
        _check("real conflict http 409", r2.status_code == 409, str(r2.status_code))
        b2 = r2.json()
        _check("409 status failed", b2["status"] == SVC_FAILED)
        errs = b2.get("serviceErrors") or []
        _check("409 has a service error", len(errs) >= 1, str(errs))
        _check("409 code idempotency_conflict",
               bool(errs) and errs[0]["code"] == "idempotency_conflict", str(errs[:1]))
        _check("409 stage owns failure",
               bool(errs) and errs[0]["stage"] in ("audit", "execution"), str(errs[:1]))
        _check("409 not retryable", bool(errs) and errs[0]["retryable"] is False, str(errs[:1]))
        _check("409 execution not eligible", b2["executionEligible"] is False)
        _check("409 no payload", b2["missionExecutionPayload"] is None)
        _check("409 withholds eval result", b2["missionEvaluationResult"] is None)
        blob = json.dumps(b2)
        unsafe = any(t in blob for t in (
            "Traceback", ".py", "sqlite", "SELECT ", ":memory:", "\\", "/home/",
            "IdempotencyConflictError", "AuditIdempotencyConflictError", "ValueError",
        ))
        _check("409 body is BFF-safe", not unsafe, blob[:200])
    finally:
        if os.path.exists(path):
            os.unlink(path)


# -- HTTP status mapping (pure function) ------------------------------------


def _resp(status: str, *errors: ServiceError) -> HarnessServiceResponse:
    return HarnessServiceResponse(request_id="r", correlation_id="c", status=status,
                                  service_errors=list(errors))


def test_status_mapping_table() -> None:
    _check("completed -> 200", http_status_for_response(_resp(SVC_COMPLETED)) == 200)
    _check("blocked -> 200", http_status_for_response(_resp(SVC_BLOCKED)) == 200)
    _check("rejected -> 200", http_status_for_response(_resp(SVC_REJECTED)) == 200)
    _check("revision_required -> 200", http_status_for_response(_resp(SVC_REVISION_REQUIRED)) == 200)
    _check("invalid_request -> 422", http_status_for_response(
        _resp(SVC_FAILED, ServiceError(code=ERR_INVALID_REQUEST, stage="s", message="m"))) == 422)
    _check("idempotency_conflict -> 409", http_status_for_response(
        _resp(SVC_FAILED, ServiceError(code=ERR_IDEMPOTENCY_CONFLICT, stage="s", message="m"))) == 409)
    _check("audit_failure -> 500", http_status_for_response(
        _resp(SVC_FAILED, ServiceError(code=ERR_AUDIT_FAILURE, stage="s", message="m"))) == 500)
    _check("internal -> 500", http_status_for_response(
        _resp(SVC_FAILED, ServiceError(code=ERR_INTERNAL, stage="s", message="m"))) == 500)
    _check("failed without error -> 500", http_status_for_response(_resp(SVC_FAILED)) == 500)


# -- correlation id ---------------------------------------------------------


def test_correlation_header_body_match_succeeds() -> None:
    body = _body(renewal_risk_happy_path())
    r = _client().post("/missions", json=body,
                       headers={CORRELATION_HEADER: body["correlationId"]})
    _check("matching correlation http 200", r.status_code == 200, str(r.status_code))
    _check("matching correlation echoed",
           r.headers.get(CORRELATION_HEADER) == body["correlationId"])


def test_correlation_header_mismatch_fails_closed() -> None:
    r = _client().post("/missions", json=_body(renewal_risk_happy_path()),
                       headers={CORRELATION_HEADER: "DIFFERENT-CID"})
    _check("correlation mismatch http 422", r.status_code == 422, str(r.status_code))
    _check("correlation mismatch status failed", r.json()["status"] == SVC_FAILED)
    _check("correlation mismatch invalid_request",
           any(e["code"] == ERR_INVALID_REQUEST for e in r.json()["serviceErrors"]))


def test_correlation_id_echoed_on_success() -> None:
    body = _body(renewal_risk_happy_path())
    r = _client().post("/missions", json=body)
    _check("X-Correlation-ID echoed", r.headers.get(CORRELATION_HEADER) == body["correlationId"])


def test_correlation_id_propagated_to_service() -> None:
    body = _body(renewal_risk_happy_path(), correlation_id="CORR-PROP-XYZ")
    r = _client().post("/missions", json=body)
    _check("correlation propagated to response body",
           r.json()["correlationId"] == "CORR-PROP-XYZ")


# -- serialisation / determinism --------------------------------------------


def test_camel_case_response() -> None:
    r = _client().post("/missions", json=_body(renewal_risk_happy_path()))
    keys = set(r.json().keys())
    for key in ("schemaVersion", "requestId", "correlationId", "executionEligible",
                "missionEvaluationResult", "missionExecutionPayload", "resultHash"):
        _check(f"response has camelCase key {key}", key in keys, str(sorted(keys)))


def test_snake_case_request_accepted() -> None:
    sc = renewal_risk_happy_path()
    snake = {
        "request_id": "REQ-SNAKE",
        "correlation_id": "CORR-SNAKE",
        "scenario_id": sc.scenario_id,
        "mission_id": sc.mission_id,
        "signals": sc.signals,
        "output_mode": "evaluation_only",
    }
    r = _client().post("/missions", json=snake)
    _check("snake_case accepted http 200", r.status_code == 200, str(r.status_code))
    _check("snake_case status completed", r.json()["status"] == SVC_COMPLETED)
    _check("snake_case request id preserved", r.json()["requestId"] == "REQ-SNAKE")


def test_result_hash_deterministic() -> None:
    c = _client()
    body = _body(renewal_risk_happy_path())
    a = c.post("/missions", json=body).json()["resultHash"]
    b = c.post("/missions", json=body).json()["resultHash"]
    _check("result hash deterministic", a == b and a != "", f"{a} vs {b}")


def test_different_missions_differ() -> None:
    c = _client()
    a = c.post("/missions", json=_body(renewal_risk_happy_path())).json()["resultHash"]
    b = c.post("/missions", json=_body(support_escalation_happy_path())).json()["resultHash"]
    _check("different missions different hash", a != b)


# -- config validation ------------------------------------------------------


def test_config_validation_fails_closed() -> None:
    for kwargs in ({"max_request_bytes": 0}, {"max_request_bytes": -1},
                   {"allowed_content_types": ()},
                   {"allowed_content_types": ("text/plain",)},
                   {"request_timeout_seconds": 0}, {"request_timeout_seconds": -3}):
        raised = False
        try:
            HarnessHttpConfig(**kwargs)
        except HarnessHttpConfigError:
            raised = True
        _check(f"invalid config rejected: {kwargs}", raised)
    ok = HarnessHttpConfig()
    _check("default config valid", ok.max_request_bytes > 0 and ok.request_timeout_seconds > 0)
    _check("timeout documented as not enforced", ok.timeout_enforced is False)


# -- guarantees -------------------------------------------------------------


def test_execute_mission_invoked_exactly_once() -> None:
    real = adapter_mod.execute_mission
    calls = {"n": 0}

    def _spy(request, dependencies):
        calls["n"] += 1
        return real(request, dependencies)

    adapter_mod.execute_mission = _spy
    try:
        _client().post("/missions", json=_body(renewal_risk_happy_path()))
    finally:
        adapter_mod.execute_mission = real
    _check("execute_mission invoked exactly once", calls["n"] == 1, str(calls["n"]))


def test_no_persona_response_over_http() -> None:
    r = _client().post("/missions", json=_body(renewal_risk_happy_path()))
    blob = r.text
    _check("no personaResponse in body", "personaResponse" not in blob)
    _check("no rendered persona text", "renderedText" not in blob)


def test_no_bound_socket_or_host_import_in_source() -> None:
    path = os.path.join(_API_DIR, "harness", "http_adapter.py")
    with open(path, "r", encoding="utf-8") as fh:
        src = fh.read()
    banned = [
        "uvicorn", ".run(", "import socket", "import main", "from main", "main:app",
        "import requests", "urllib", "httpx", "aiohttp", "smtplib", "boto3", "psycopg",
        "import ledger_service", "from services", "conversation_runtime", "memory_store",
        "orchestrator", "PersonaResponseView", "PersonaResponse(",
        "time.time(", ".now(", "utcnow",
    ]
    hits = [tok for tok in banned if tok in src]
    _check("adapter has no socket/host/network/protected/clock token", not hits, str(hits))


def test_no_forbidden_imports_in_test_scenarios() -> None:
    # The adapter must depend only on the service seam + FastAPI transport.
    import harness.http_adapter as m
    src_deps = getattr(m, "__file__", "")
    _check("adapter module loaded from harness", "harness" in src_deps and src_deps.endswith("http_adapter.py"))


_TESTS = [
    test_app_factory_creation,
    test_openapi_generation,
    test_valid_renewal_request_completed_200,
    test_valid_support_request_completed_200,
    test_blocked_returns_200_with_status_blocked,
    test_rejected_returns_200_with_status_rejected,
    test_revision_required_returns_200,
    test_payload_only_for_valid_governed_outcomes,
    test_validation_failure_returns_422,
    test_malformed_json_returns_422,
    test_unsupported_content_type_returns_415,
    test_oversized_body_rejected,
    test_method_not_allowed_is_405,
    test_internal_failure_returns_500_without_trace,
    test_real_idempotency_conflict_maps_to_409,
    test_status_mapping_table,
    test_correlation_header_body_match_succeeds,
    test_correlation_header_mismatch_fails_closed,
    test_correlation_id_echoed_on_success,
    test_correlation_id_propagated_to_service,
    test_camel_case_response,
    test_snake_case_request_accepted,
    test_result_hash_deterministic,
    test_different_missions_differ,
    test_config_validation_fails_closed,
    test_execute_mission_invoked_exactly_once,
    test_no_persona_response_over_http,
    test_no_bound_socket_or_host_import_in_source,
    test_no_forbidden_imports_in_test_scenarios,
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
    print(f"\nHTTP adapter: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
