"""Self-contained Mission Harness HTTP adapter (Release 2.2, Commit 9).

A thin, transport-only FastAPI application that exposes the in-process
:func:`harness.service.execute_mission` facade over HTTP. It is *mountable* into
the existing host application later (``app.mount("/harness", create_harness_app())``
or ``include_router``) but this commit does NOT wire it into
``services/api/main.py`` and does NOT bind a network socket or start Uvicorn.

Boundaries (transport only -- never business logic):

* Validate the JSON body into a typed :class:`HarnessServiceRequest`.
* Enforce request-size and content-type limits *before* model validation.
* Reconcile an optional ``X-Correlation-ID`` header with the body correlation id
  (they must match; the adapter never invents one).
* Invoke :func:`execute_mission` exactly once and serialise the resulting
  :class:`HarnessServiceResponse` in camelCase.
* Map governed mission outcomes and typed service errors to HTTP status codes.

The adapter contains NO PersonaResponse, no frontend callback, no provider or
CRM access, no protected Decision Ledger access, no network client, and no
internal clock. All execution is *simulated* by the underlying sandbox.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from harness.service import (
    ERR_AUDIT_FAILURE,
    ERR_IDEMPOTENCY_CONFLICT,
    ERR_INTERNAL,
    ERR_INVALID_REQUEST,
    SCHEMA_VERSION,
    SVC_BLOCKED,
    SVC_COMPLETED,
    SVC_FAILED,
    SVC_REJECTED,
    SVC_REVISION_REQUIRED,
    HarnessServiceDependencies,
    HarnessServiceRequest,
    HarnessServiceResponse,
    ServiceError,
    execute_mission,
)

CORRELATION_HEADER = "X-Correlation-ID"
_JSON_MEDIA_TYPE = "application/json"

# Governed mission outcomes are valid business results, not transport failures:
# their precise status stays in the response body and the HTTP status is 200.
_OK_STATUSES = (SVC_COMPLETED, SVC_BLOCKED, SVC_REJECTED, SVC_REVISION_REQUIRED)

# When status == failed, the HTTP code is chosen from the leading service error.
# A genuine durable idempotency conflict is surfaced by the service as the stable
# ``idempotency_conflict`` code (see evaluation.FAIL_IDEMPOTENCY_CONFLICT ->
# service._FAILURE_MAP), which maps to HTTP 409 here. Unrelated internal failures
# remain ``internal_service_failure`` -> 500.
_FAILED_ERROR_STATUS = {
    ERR_INVALID_REQUEST: 422,
    ERR_IDEMPOTENCY_CONFLICT: 409,
    ERR_AUDIT_FAILURE: 500,
    ERR_INTERNAL: 500,
}


class HarnessHttpConfigError(ValueError):
    """Raised when the adapter is configured with invalid transport limits."""


@dataclass(frozen=True)
class HarnessHttpConfig:
    """Explicit, adapter-level transport limits.

    * ``max_request_bytes`` -- hard cap on the raw request body, enforced BEFORE
      model validation. Oversized bodies are rejected with 413.
    * ``allowed_content_types`` -- the adapter accepts JSON only.
    * ``request_timeout_seconds`` -- validated configuration. A reliable
      in-process request timeout cannot be guaranteed without changing the host
      server architecture, so this release treats it as configuration-only: the
      value is validated and surfaced, not enforced by unsafe thread termination.
    """

    max_request_bytes: int = 256 * 1024
    allowed_content_types: Tuple[str, ...] = (_JSON_MEDIA_TYPE,)
    request_timeout_seconds: float = 15.0
    timeout_enforced: bool = False

    def __post_init__(self) -> None:
        if not isinstance(self.max_request_bytes, int) or self.max_request_bytes <= 0:
            raise HarnessHttpConfigError("max_request_bytes must be a positive integer")
        if not self.allowed_content_types:
            raise HarnessHttpConfigError("allowed_content_types must not be empty")
        if _JSON_MEDIA_TYPE not in self.allowed_content_types:
            raise HarnessHttpConfigError("allowed_content_types must include application/json")
        if not isinstance(self.request_timeout_seconds, (int, float)) or self.request_timeout_seconds <= 0:
            raise HarnessHttpConfigError("request_timeout_seconds must be a positive number")


def http_status_for_response(response: HarnessServiceResponse) -> int:
    """Deterministically map a service response to an HTTP status code.

    Governed outcomes (completed / blocked / rejected / revision_required) are
    200; a failed status is mapped from its leading typed error code. Governed
    mission outcomes are never mapped to 404 or 500.
    """

    if response.status in _OK_STATUSES:
        return 200
    if response.status == SVC_FAILED:
        for err in response.service_errors:
            mapped = _FAILED_ERROR_STATUS.get(err.code)
            if mapped is not None:
                return mapped
        return 500
    return 500


def _error_envelope(
    *,
    errors: List[ServiceError],
    request_id: Optional[str],
    correlation_id: Optional[str],
    result_hash: str = "",
) -> dict:
    """Build a stable, BFF-safe error body. Contains no stack trace, no path, no
    SQL, no environment values, and no secrets."""

    return {
        "schemaVersion": SCHEMA_VERSION,
        "requestId": request_id,
        "correlationId": correlation_id,
        "status": SVC_FAILED,
        "executionEligible": False,
        "missionEvaluationResult": None,
        "missionExecutionPayload": None,
        "serviceErrors": [e.model_dump(by_alias=True) for e in errors],
        "warnings": [],
        "ledgerReference": None,
        "resultHash": result_hash,
    }


def _json_response(status_code: int, body: dict, correlation_id: Optional[str]) -> JSONResponse:
    headers = {CORRELATION_HEADER: correlation_id} if correlation_id else None
    return JSONResponse(status_code=status_code, content=body, headers=headers)


def _safe_body(response: HarnessServiceResponse) -> dict:
    """Serialise a service response for the wire. On a failed status the mission
    evaluation result is withheld so no raw internal error text can leak; the
    typed, static service errors remain."""

    body = response.model_dump(by_alias=True, mode="json")
    if response.status == SVC_FAILED:
        body["missionEvaluationResult"] = None
    return body


def create_harness_app(
    dependencies: Optional[HarnessServiceDependencies] = None,
    config: Optional[HarnessHttpConfig] = None,
) -> FastAPI:
    """Build a mountable, self-contained Harness HTTP application.

    The returned :class:`FastAPI` app is transport-only. It does not bind a
    socket, does not start Uvicorn, and does not import the host application.
    When ``dependencies`` is omitted, each request is served with a fresh,
    private in-memory audit ledger that the service opens and closes itself; a
    caller-supplied ledger remains caller-owned and is left open.

    Route composition: this sub-app exposes ``POST /missions``. The approved
    future host mount is ``app.mount("/api/harness", create_harness_app(...))``,
    which yields the composed public route ``POST /api/harness/missions``. No
    mounting is performed here.
    """

    cfg = config or HarnessHttpConfig()  # validates; fails closed on bad config

    app = FastAPI(
        title="VentureOS Mission Harness HTTP Adapter",
        version=SCHEMA_VERSION,
        description=(
            "Transport-only adapter over the in-process Adaptive Mission Harness. "
            "All execution is SIMULATED; no real messages are sent and no external "
            "system is written. Governed outcomes (completed, blocked, rejected, "
            "revision_required) return HTTP 200 with the precise status in the body."
        ),
    )

    request_schema = HarnessServiceRequest.model_json_schema()

    @app.post(
        "/missions",
        response_model=HarnessServiceResponse,
        summary="Evaluate a governed mission (simulated execution only)",
        openapi_extra={
            "requestBody": {
                "required": True,
                "content": {_JSON_MEDIA_TYPE: {"schema": request_schema}},
            }
        },
    )
    async def create_mission(request: Request) -> JSONResponse:  # noqa: D401
        header_cid = request.headers.get(CORRELATION_HEADER)

        # 1. Content-type: JSON only (before reading / validating the body).
        content_type = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
        if content_type not in cfg.allowed_content_types:
            return _json_response(
                415,
                _error_envelope(
                    errors=[ServiceError(
                        code=ERR_INVALID_REQUEST, stage="transport",
                        message="Unsupported content type; application/json is required.",
                    )],
                    request_id=None, correlation_id=header_cid,
                ),
                header_cid,
            )

        # 2. Request size: enforce the hard cap BEFORE model validation.
        raw = await request.body()
        if len(raw) > cfg.max_request_bytes:
            return _json_response(
                413,
                _error_envelope(
                    errors=[ServiceError(
                        code=ERR_INVALID_REQUEST, stage="transport",
                        message="Request body exceeds the configured maximum size.",
                        details={"maxRequestBytes": cfg.max_request_bytes},
                    )],
                    request_id=None, correlation_id=header_cid,
                ),
                header_cid,
            )

        # 3. Parse + strictly validate into the typed request contract.
        try:
            data = json.loads(raw.decode("utf-8"))
            if not isinstance(data, dict):
                raise ValueError("request body must be a JSON object")
            svc_request = HarnessServiceRequest.model_validate(data)
        except (ValidationError, ValueError, json.JSONDecodeError):
            return _json_response(
                422,
                _error_envelope(
                    errors=[ServiceError(
                        code=ERR_INVALID_REQUEST, stage="request_validation",
                        message="Request body failed validation against the mission request contract.",
                    )],
                    request_id=None, correlation_id=header_cid,
                ),
                header_cid,
            )

        # 4. Correlation id: never silently replaced. If a header is supplied it
        #    must match the validated body correlation id.
        if header_cid is not None and header_cid != svc_request.correlation_id:
            return _json_response(
                422,
                _error_envelope(
                    errors=[ServiceError(
                        code=ERR_INVALID_REQUEST, stage="request_validation",
                        message="X-Correlation-ID header does not match the body correlationId.",
                    )],
                    request_id=svc_request.request_id, correlation_id=svc_request.correlation_id,
                ),
                svc_request.correlation_id,
            )

        # 5. Invoke the in-process service exactly once. A fresh default
        #    dependency set (private in-memory ledger) is created per request
        #    unless a caller-owned dependency set was supplied at app build time.
        deps = dependencies if dependencies is not None else HarnessServiceDependencies()
        response = execute_mission(svc_request, deps)

        status_code = http_status_for_response(response)
        return _json_response(status_code, _safe_body(response), response.correlation_id)

    return app


__all__ = [
    "CORRELATION_HEADER",
    "HarnessHttpConfig",
    "HarnessHttpConfigError",
    "create_harness_app",
    "http_status_for_response",
]
