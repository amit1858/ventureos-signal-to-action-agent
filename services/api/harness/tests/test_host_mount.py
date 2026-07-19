"""Host FastAPI mount regression tests (Release 2.2, Feature 1 / F1.2).

Plain-Python, no pytest. Verifies the feature-flagged mount of the governed
Adaptive Mission Harness onto the host application (``services/api/main.py``)
via ``app.mount("/api/harness", create_harness_app(...))``:

* OFF by default -- no ``/api/harness`` routes, host routes/health/OpenAPI
  unchanged.
* ON (HARNESS_MOUNT_ENABLED=true) -- exposes the single public route
  ``POST /api/harness/missions`` (composed from the sub-app ``/missions``),
  serves governed outcomes with simulated execution only, isolates its own
  OpenAPI, and never alters the host app's OpenAPI paths.
* Fails closed -- refuses to mount when the harness ledger path collides with
  the decision ledger (DB_PATH).
* Uses a DEDICATED file-backed audit ledger (never the decision ledger).

Run directly:  python services/api/harness/tests/test_host_mount.py
"""

from __future__ import annotations

import importlib
import os
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, "..", ".."))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from fastapi.testclient import TestClient  # noqa: E402

from harness.evaluation import (  # noqa: E402
    renewal_risk_happy_path,
    unsupported_signal_blocked,
)
from harness.service import HarnessServiceRequest  # noqa: E402

_RESULTS: list[tuple[str, bool, str]] = []

_HARNESS_ENV_KEYS = (
    "HARNESS_MOUNT_ENABLED",
    "HARNESS_LEDGER_PATH",
    "HARNESS_SERVICE_TOKEN",
    "HARNESS_ALLOW_INSECURE_LOCAL",
    "DB_PATH",
)


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


def _body(scenario, **overrides) -> dict:
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
    return HarnessServiceRequest(**data).model_dump(by_alias=True, mode="json")


def _load_main(**env):
    """Import a fresh ``main`` module with a controlled harness environment.

    The mount is decided at import time from the cached settings snapshot, so
    the settings cache is cleared and ``main`` is re-imported per configuration.
    """
    for key in _HARNESS_ENV_KEYS:
        os.environ.pop(key, None)
    for key, value in env.items():
        os.environ[key] = value
    import config

    config.get_settings.cache_clear()
    sys.modules.pop("main", None)
    return importlib.import_module("main")


def _restore_env() -> None:
    for key in _HARNESS_ENV_KEYS:
        os.environ.pop(key, None)
    import config

    config.get_settings.cache_clear()
    sys.modules.pop("main", None)


def _host_paths(app) -> set:
    return set(app.openapi().get("paths", {}).keys())


# -- OFF by default ---------------------------------------------------------


def test_mount_disabled_by_default() -> None:
    main = _load_main()
    try:
        client = TestClient(main.app)
        # Host health is unaffected.
        _check("host health 200", client.get("/api/health").status_code == 200)
        # No harness route is mounted.
        r = client.post("/api/harness/missions", json=_body(renewal_risk_happy_path()))
        _check("harness route absent -> 404", r.status_code == 404, str(r.status_code))
        # The sub-app OpenAPI is not exposed.
        _check("no sub-app openapi", client.get("/api/harness/openapi.json").status_code == 404)
        # Existing host routes remain registered.
        paths = _host_paths(main.app)
        for route in ("/api/health", "/api/recommendations", "/api/accounts"):
            _check(f"host route present {route}", route in paths, str(sorted(paths))[:200])
        _check("host openapi omits mount", "/api/harness/missions" not in paths)
        _check("host openapi omits sub-app route", "/missions" not in paths)
    finally:
        _restore_env()


# -- ON with a dedicated ledger ---------------------------------------------


def test_mount_enabled_exposes_governed_route() -> None:
    fd, path = tempfile.mkstemp(suffix=".harness.db")
    os.close(fd)
    os.unlink(path)
    token = "s2s-secret-token-123"
    auth = {"X-Harness-Service-Token": token}
    # Capture the host OpenAPI paths with the mount OFF for a strict comparison.
    baseline = _load_main()
    baseline_paths = _host_paths(baseline.app)
    _restore_env()

    main = _load_main(
        HARNESS_MOUNT_ENABLED="true", HARNESS_LEDGER_PATH=path, HARNESS_SERVICE_TOKEN=token
    )
    try:
        client = TestClient(main.app)
        # Host health still works after mounting.
        _check("host health still 200", client.get("/api/health").status_code == 200)

        # Completed governed outcome via the composed public route (authenticated).
        r = client.post("/api/harness/missions", json=_body(renewal_risk_happy_path()), headers=auth)
        _check("mounted renewal http 200", r.status_code == 200, str(r.status_code))
        body = r.json()
        _check("mounted renewal completed", body["status"] == "completed", body.get("status", ""))
        _check("mounted renewal has payload", body["missionExecutionPayload"] is not None)
        _check("mounted renewal simulated", body["missionExecutionPayload"]["simulated"] is True)

        # Blocked governed outcome -> 200 with no executable payload.
        rb = client.post("/api/harness/missions", json=_body(unsupported_signal_blocked()), headers=auth)
        _check("mounted blocked http 200", rb.status_code == 200, str(rb.status_code))
        _check("mounted blocked status", rb.json()["status"] == "blocked")
        _check("mounted blocked no payload", rb.json()["missionExecutionPayload"] is None)

        # Missing token -> 401 before any processing; the token is never echoed.
        rna = client.post("/api/harness/missions", json=_body(renewal_risk_happy_path()))
        _check("missing token http 401", rna.status_code == 401, str(rna.status_code))
        _check("401 code unauthorized",
               (rna.json().get("serviceErrors") or [{}])[0].get("code") == "unauthorized")
        _check("401 body omits token", token not in rna.text)

        # Wrong token -> 401.
        rwrong = client.post("/api/harness/missions", json=_body(renewal_risk_happy_path()),
                             headers={"X-Harness-Service-Token": "wrong"})
        _check("wrong token http 401", rwrong.status_code == 401, str(rwrong.status_code))
        _check("401 body never leaks real token", token not in rwrong.text)

        # No PersonaResponse ever crosses the boundary.
        _check("no personaResponse over mount", "personaResponse" not in r.text)

        # The sub-app owns an isolated OpenAPI describing /missions only.
        sub = client.get("/api/harness/openapi.json")
        _check("sub-app openapi 200", sub.status_code == 200, str(sub.status_code))
        sub_paths = list(sub.json().get("paths", {}).keys())
        _check("sub-app openapi is /missions", sub_paths == ["/missions"], str(sub_paths))

        # The host OpenAPI is byte-for-byte unchanged by mounting (sub-apps are
        # isolated and must never leak into the parent schema).
        mounted_paths = _host_paths(main.app)
        _check("host openapi unchanged by mount", mounted_paths == baseline_paths,
               str(sorted(mounted_paths ^ baseline_paths))[:200])
        _check("host openapi omits mounted route", "/api/harness/missions" not in mounted_paths)

        # A host route is still reachable alongside the mount.
        _check("host route reachable with mount", client.get("/api/accounts").status_code in (200, 500))

        # Diagnostics never reveal the service token.
        _check("settings never expose token in sanitized",
               token not in str(main._settings.sanitized()))
        _check("settings warnings never expose token",
               all(token not in w for w in main._settings.warnings()))

        # The dedicated ledger file was created (file-backed, request-scoped).
        _check("dedicated ledger file created", os.path.exists(path), path)
        _check("ledger is not the decision ledger",
               os.path.abspath(path) != os.path.abspath(main._settings.db_path))
    finally:
        _restore_env()
        for suffix in ("", "-wal", "-shm"):
            p = path + suffix
            if os.path.exists(p):
                os.unlink(p)


# -- fail closed without a token --------------------------------------------


def test_mount_refuses_without_token() -> None:
    fd, path = tempfile.mkstemp(suffix=".harness.db")
    os.close(fd)
    os.unlink(path)
    # Mount enabled, isolated ledger, but NO token and no insecure-local flag.
    main = _load_main(HARNESS_MOUNT_ENABLED="true", HARNESS_LEDGER_PATH=path)
    try:
        client = TestClient(main.app)
        _check("no-token mount refused -> 404",
               client.post("/api/harness/missions", json=_body(renewal_risk_happy_path())).status_code == 404)
        _check("host health unaffected by token refusal", client.get("/api/health").status_code == 200)
        _check("settings not authorised without token", main._settings.harness_mount_authorised is False)
    finally:
        _restore_env()
        for suffix in ("", "-wal", "-shm"):
            p = path + suffix
            if os.path.exists(p):
                os.unlink(p)


def test_mount_insecure_local_allows_no_token() -> None:
    fd, path = tempfile.mkstemp(suffix=".harness.db")
    os.close(fd)
    os.unlink(path)
    main = _load_main(
        HARNESS_MOUNT_ENABLED="true", HARNESS_LEDGER_PATH=path, HARNESS_ALLOW_INSECURE_LOCAL="true"
    )
    try:
        client = TestClient(main.app)
        _check("insecure-local authorised", main._settings.harness_mount_authorised is True)
        # No token header required in insecure-local mode.
        r = client.post("/api/harness/missions", json=_body(renewal_risk_happy_path()))
        _check("insecure-local renewal http 200", r.status_code == 200, str(r.status_code))
        _check("insecure-local completed", r.json()["status"] == "completed")
    finally:
        _restore_env()
        for suffix in ("", "-wal", "-shm"):
            p = path + suffix
            if os.path.exists(p):
                os.unlink(p)


# -- fail closed on ledger collision ----------------------------------------


def test_mount_refuses_shared_ledger() -> None:
    fd, shared = tempfile.mkstemp(suffix=".shared.db")
    os.close(fd)
    os.unlink(shared)
    main = _load_main(HARNESS_MOUNT_ENABLED="true", HARNESS_LEDGER_PATH=shared, DB_PATH=shared)
    try:
        client = TestClient(main.app)
        _check("collision does not mount -> 404",
               client.post("/api/harness/missions", json=_body(renewal_risk_happy_path())).status_code == 404)
        _check("host health unaffected by refusal", client.get("/api/health").status_code == 200)
        _check("settings flags collision",
               main._settings.harness_ledger_is_isolated is False)
        _check("warning explains collision",
               any("HARNESS_LEDGER_PATH" in w for w in main._settings.warnings()))
    finally:
        _restore_env()
        for suffix in ("", "-wal", "-shm"):
            p = shared + suffix
            if os.path.exists(p):
                os.unlink(p)


# -- config surface ---------------------------------------------------------


def test_config_reads_harness_flags() -> None:
    import config

    for key in _HARNESS_ENV_KEYS:
        os.environ.pop(key, None)
    os.environ["HARNESS_MOUNT_ENABLED"] = "true"
    os.environ["HARNESS_LEDGER_PATH"] = "custom_harness.db"
    config.get_settings.cache_clear()
    try:
        s = config.Settings.load()
        _check("mount flag parsed", s.harness_mount_enabled is True)
        _check("ledger path parsed", s.harness_ledger_path == "custom_harness.db")
        _check("isolation property true for distinct path", s.harness_ledger_is_isolated is True)
        sanitized = s.sanitized()
        _check("sanitized exposes mount flag", sanitized["harness_mount_enabled"] is True)
        _check("sanitized ledger path is basename",
               sanitized["harness_ledger_path"] == "custom_harness.db")
        _check("sanitized leaks no directory", os.sep not in sanitized["harness_ledger_path"])
    finally:
        _restore_env()


_TESTS = [
    test_mount_disabled_by_default,
    test_mount_enabled_exposes_governed_route,
    test_mount_refuses_without_token,
    test_mount_insecure_local_allows_no_token,
    test_mount_refuses_shared_ledger,
    test_config_reads_harness_flags,
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
    print(f"\nHost mount: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
