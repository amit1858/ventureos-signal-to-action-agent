"""Phase 2A live-signal adapter tests -- plain-Python, no pytest.

Proves the read-only HubSpot renewal-observation adapter end to end against a
FAKE CompanyReader (no network), covering every fail-closed guard, the detector
outcomes it forwards, cross-restart persistence, and -- critically -- that the
slice can perform ZERO CRM writes:

* the adapter depends only on the narrow read-only ``CompanyReader`` boundary,
* the fake connector records every invoked operation; only ``get_company`` ever
  appears, and no ``create_task`` / ``create_note`` / POST / PATCH / PUT / DELETE
  path is reachable,
* allow-list ordering is proven (account checked before any network request;
  portal checked before the read) by asserting ZERO reader calls on denial,
* a supplemental source scan confirms no write verbs live in the read path.

Run directly:  python services/api/tests/test_live_hubspot_source.py
"""

from __future__ import annotations

import inspect
import os
import shutil
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

import live_signals.hubspot_source as source_module  # noqa: E402
from crm_connectors.hubspot_connector import HubSpotConnector  # noqa: E402
from live_signals.contracts import DetectionStatus, SignalDirection  # noqa: E402
from live_signals.hubspot_source import (  # noqa: E402
    CompanyReader,
    LiveSignalSourceError,
    observe_renewal,
)
from live_signals.repository import SignalRepositoryError, SignalSnapshotRepository  # noqa: E402
from live_signals.settings import LiveSignalSettings  # noqa: E402

# Renewal horizon dates: BASE ~44d out (as of ~2026-07-21), EARLIER ~20d
# (adverse), LATER ~86d (positive).
BASE = "2026-09-03"
EARLIER = "2026-08-10"
LATER = "2026-10-15"

T0 = "2026-07-21T09:00:00Z"
T1 = "2026-07-21T10:00:00Z"
T2 = "2026-07-21T11:00:00Z"

PORTAL = "P-SANDBOX-1"
ACCOUNT = "C-1001"
ACCOUNT_REF = "curefoods-test"

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


def _settings(**over) -> LiveSignalSettings:
    base = dict(
        enabled=True,
        portal_allowlist=frozenset({PORTAL}),
        account_allowlist=frozenset({ACCOUNT}),
        db_path=":memory:",
        renewal_property="s2a_renewal_date",
    )
    base.update(over)
    return LiveSignalSettings(**base)


class FakeReader:
    """Records every invoked operation. Exposes ONLY get_company -- so it mirrors
    the narrow read boundary and cannot be asked to write."""

    def __init__(self, value=None, payload=None, raises=None) -> None:
        self._value = value
        self._payload = payload
        self._raises = raises
        self.ops: list[tuple] = []

    def get_company(self, company_id, properties=None):
        self.ops.append(("get_company", company_id, tuple(properties or [])))
        if self._raises is not None:
            raise self._raises
        if self._payload is not None:
            return self._payload
        return {"id": company_id, "properties": {"s2a_renewal_date": self._value}}


class FailingRepo:
    """A repository stand-in whose reads fail, to prove persistence_failure."""

    def get_snapshot(self, **_kw):
        raise SignalRepositoryError("simulated store failure")

    def close(self) -> None:  # pragma: no cover - defensive
        pass


def _observe(reader, settings, *, account_id=ACCOUNT, portal_id=PORTAL,
             detected_at=T0, repository=None):
    return observe_renewal(
        reader=reader, settings=settings, portal_id=portal_id, account_id=account_id,
        account_ref=ACCOUNT_REF, detected_at=detected_at, repository=repository,
    )


# -- fail-closed guards ------------------------------------------------------


def test_disabled_flag_refuses_and_reads_nothing() -> None:
    reader = FakeReader(BASE)
    raised = False
    try:
        _observe(reader, _settings(enabled=False))
    except LiveSignalSourceError:
        raised = True
    _check("disabled: raises LiveSignalSourceError", raised)
    _check("disabled: zero reads", len(reader.ops) == 0)


def test_empty_portal_allowlist_denies() -> None:
    reader = FakeReader(BASE)
    raised = False
    try:
        _observe(reader, _settings(portal_allowlist=frozenset()))
    except LiveSignalSourceError:
        raised = True
    _check("empty portal allow-list: denied", raised)
    _check("empty portal allow-list: zero reads", len(reader.ops) == 0)


def test_empty_account_allowlist_denies() -> None:
    reader = FakeReader(BASE)
    raised = False
    try:
        _observe(reader, _settings(account_allowlist=frozenset()))
    except LiveSignalSourceError:
        raised = True
    _check("empty account allow-list: denied", raised)
    _check("empty account allow-list: zero reads", len(reader.ops) == 0)


def test_disallowed_portal_denies_before_read() -> None:
    reader = FakeReader(BASE)
    raised = False
    try:
        # account IS allow-listed; portal is not -> portal check must stop the read.
        _observe(reader, _settings(portal_allowlist=frozenset({"P-OTHER"})))
    except LiveSignalSourceError:
        raised = True
    _check("disallowed portal: denied", raised)
    _check("disallowed portal: zero reads (portal checked before read)", len(reader.ops) == 0)


def test_disallowed_account_denies_before_network() -> None:
    reader = FakeReader(BASE)
    raised = False
    try:
        _observe(reader, _settings(), account_id="C-NOT-ALLOWED")
    except LiveSignalSourceError:
        raised = True
    _check("disallowed account: denied", raised)
    _check("disallowed account: zero reads (account checked before network)",
           len(reader.ops) == 0)


def test_malformed_allowlist_denies() -> None:
    # A wildcard-only allow-list parses to empty -> deny (no wildcard support).
    reader = FakeReader(BASE)
    st = LiveSignalSettings.from_env({
        "LIVE_SIGNALS_ENABLED": "true",
        "LIVE_SIGNAL_PORTAL_ALLOWLIST": "*",
        "LIVE_SIGNAL_ACCOUNT_ALLOWLIST": " , , ",
        "LIVE_SIGNALS_DB_PATH": ":memory:",
    })
    raised = False
    try:
        _observe(reader, st)
    except LiveSignalSourceError:
        raised = True
    _check("malformed/wildcard allow-list: denied", raised)
    _check("malformed allow-list: zero reads", len(reader.ops) == 0)


def test_missing_db_path_while_enabled_fails_closed() -> None:
    reader = FakeReader(BASE)
    raised = False
    try:
        _observe(reader, _settings(db_path=""))
    except LiveSignalSourceError:
        raised = True
    _check("missing db path: fails closed", raised)
    _check("missing db path: zero reads", len(reader.ops) == 0)


# -- extraction fail-closed (forwarded to the frozen detector) ---------------


def test_missing_property_is_invalid_input() -> None:
    reader = FakeReader(payload={"id": ACCOUNT, "properties": {}})
    result = _observe(reader, _settings(), repository=SignalSnapshotRepository())
    _check("missing property: invalid_input",
           result.status is DetectionStatus.invalid_input, result.detail)
    _check("missing property: no event", result.event is None)


def test_empty_property_is_invalid_input() -> None:
    reader = FakeReader(value="")
    result = _observe(reader, _settings(), repository=SignalSnapshotRepository())
    _check("empty property: invalid_input",
           result.status is DetectionStatus.invalid_input, result.detail)


def test_malformed_date_is_invalid_input() -> None:
    reader = FakeReader(value="not-a-real-date")
    result = _observe(reader, _settings(), repository=SignalSnapshotRepository())
    _check("malformed date: invalid_input",
           result.status is DetectionStatus.invalid_input, result.detail)
    _check("malformed date: no event", result.event is None)


def test_unexpected_shape_is_invalid_input() -> None:
    reader = FakeReader(payload={"id": ACCOUNT})  # no "properties" key at all
    result = _observe(reader, _settings(), repository=SignalSnapshotRepository())
    _check("unexpected shape: invalid_input",
           result.status is DetectionStatus.invalid_input, result.detail)


# -- detector outcomes forwarded --------------------------------------------


def test_baseline_establishment() -> None:
    repo = SignalSnapshotRepository()
    reader = FakeReader(value=BASE)
    result = _observe(reader, _settings(), repository=repo)
    _check("baseline: status baseline_established",
           result.status is DetectionStatus.baseline_established, result.detail)
    _check("baseline: no event", result.event is None)
    _check("baseline: snapshot current == BASE",
           result.snapshot and result.snapshot.current_normalized_value == BASE)
    _check("baseline: exactly one read", len(reader.ops) == 1)


def test_unchanged_observation() -> None:
    repo = SignalSnapshotRepository()
    reader = FakeReader(value=BASE)
    _observe(reader, _settings(), repository=repo, detected_at=T0)
    result = _observe(reader, _settings(), repository=repo, detected_at=T1)
    _check("unchanged: status unchanged",
           result.status is DetectionStatus.unchanged, result.detail)
    _check("unchanged: no event", result.event is None)


def test_adverse_date_change_emits_one_event() -> None:
    repo = SignalSnapshotRepository()
    reader = FakeReader(value=BASE)
    _observe(reader, _settings(), repository=repo, detected_at=T0)
    reader._value = EARLIER  # operator moved the renewal date earlier
    result = _observe(reader, _settings(), repository=repo, detected_at=T1)
    _check("adverse: status change_detected",
           result.status is DetectionStatus.change_detected, result.detail)
    _check("adverse: direction adverse",
           result.event and result.event.direction is SignalDirection.adverse)
    _check("adverse: normalized old==BASE new==EARLIER",
           result.event and result.event.normalized_old_value == BASE
           and result.event.normalized_new_value == EARLIER)
    _check("adverse: source token identifies hubspot test",
           result.event and "hubspot" in result.event.source.lower())
    _check("adverse: exactly one stored event",
           repo._conn.execute("SELECT COUNT(*) FROM signal_events").fetchone()[0] == 1)


def test_positive_date_change_classified() -> None:
    repo = SignalSnapshotRepository()
    reader = FakeReader(value=EARLIER)
    _observe(reader, _settings(), repository=repo, detected_at=T0)
    reader._value = LATER
    result = _observe(reader, _settings(), repository=repo, detected_at=T1)
    _check("positive: status change_detected",
           result.status is DetectionStatus.change_detected, result.detail)
    _check("positive: direction positive",
           result.event and result.event.direction is SignalDirection.positive)


def test_deterministic_repeated_input_no_duplicate() -> None:
    # Determinism: identical inputs over two INDEPENDENT stores must yield the
    # same event id/fingerprint (identity excludes detected_at / wall clock).
    def _run_once():
        repo = SignalSnapshotRepository()
        rd = FakeReader(value=BASE)
        _observe(rd, _settings(), repository=repo, detected_at=T0)
        rd._value = EARLIER
        return repo, _observe(rd, _settings(), repository=repo, detected_at=T1)

    repo_a, res_a = _run_once()
    _repo_b, res_b = _run_once()
    _check("deterministic: identical event id across independent runs",
           res_a.event and res_b.event and res_a.event.event_id == res_b.event.event_id)
    _check("deterministic: identical fingerprint across independent runs",
           res_a.event and res_b.event
           and res_a.event.change_fingerprint == res_b.event.change_fingerprint)
    # No duplicate: re-reading the SAME current value is unchanged and adds no event.
    repeat = _observe(FakeReader(value=EARLIER), _settings(), repository=repo_a, detected_at=T2)
    _check("no-duplicate: repeated identical read is unchanged",
           repeat.status is DetectionStatus.unchanged, repeat.detail)
    _check("no-duplicate: still exactly one stored event",
           repo_a._conn.execute("SELECT COUNT(*) FROM signal_events").fetchone()[0] == 1)


# -- persistence across restart ---------------------------------------------


def test_persistence_across_restart() -> None:
    tmp = tempfile.mkdtemp(prefix="live_signals_test_")
    db_path = os.path.join(tmp, "live_signals.db")
    try:
        st = _settings(db_path=db_path)
        # First process "instance": adapter opens + closes its own file-backed store.
        r1 = FakeReader(value=BASE)
        res1 = _observe(r1, st, detected_at=T0)  # no injected repo -> own store
        _check("restart: first read is baseline",
               res1.status is DetectionStatus.baseline_established, res1.detail)
        # Second "instance": brand-new store object over the SAME file; the prior
        # snapshot must survive so a changed value is detected as a real change.
        r2 = FakeReader(value=EARLIER)
        res2 = _observe(r2, st, detected_at=T1)
        _check("restart: prior snapshot survived -> change_detected",
               res2.status is DetectionStatus.change_detected, res2.detail)
        _check("restart: direction adverse after reload",
               res2.event and res2.event.direction is SignalDirection.adverse)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# -- HubSpot / repository failures fail closed -------------------------------


def test_hubspot_error_fails_closed_without_leak() -> None:
    reader = FakeReader(raises=Exception("token=SECRET-XYZ leaked in raw error"))
    raised = False
    message = ""
    try:
        _observe(reader, _settings(), repository=SignalSnapshotRepository())
    except LiveSignalSourceError as exc:
        raised = True
        message = str(exc)
    _check("hubspot error: fails closed", raised)
    _check("hubspot error: no secret in message", "SECRET-XYZ" not in message)
    _check("hubspot error: no token substring in message", "token=" not in message)


def test_repository_failure_fails_closed() -> None:
    reader = FakeReader(value=BASE)
    result = _observe(reader, _settings(), repository=FailingRepo())
    _check("repo failure: status persistence_failure",
           result.status is DetectionStatus.persistence_failure, result.detail)
    _check("repo failure: no event", result.event is None)


# -- zero-write / GET-only guarantees ---------------------------------------


def test_zero_write_only_get_company_invoked() -> None:
    repo = SignalSnapshotRepository()
    reader = FakeReader(value=BASE)
    _observe(reader, _settings(), repository=repo, detected_at=T0)
    reader._value = EARLIER
    _observe(reader, _settings(), repository=repo, detected_at=T1)
    ops = {name for (name, *_rest) in reader.ops}
    _check("zero-write: only get_company was invoked", ops == {"get_company"})
    _check("zero-write: fake reader exposes no create_task", not hasattr(reader, "create_task"))
    _check("zero-write: fake reader exposes no create_note", not hasattr(reader, "create_note"))


def test_adapter_source_has_no_write_verbs() -> None:
    # Supplemental (not sufficient alone): the read-path module must not name any
    # write method or mutating HTTP verb.
    src = inspect.getsource(source_module)
    # Match call/attribute forms, not prose: the module docstring names the write
    # methods it deliberately CANNOT reach, so scan for invocation shapes only.
    for needle in ("create_task(", "create_note(", ".create_task", ".create_note",
                   '"POST"', "'POST'", '"PATCH"', '"PUT"', '"DELETE"'):
        _check(f"adapter source contains no {needle}", needle not in src)


def test_connector_get_company_is_get_only() -> None:
    src = inspect.getsource(HubSpotConnector.get_company)
    _check("connector read: uses GET", '"GET"' in src or "'GET'" in src)
    for verb in ('"POST"', '"PATCH"', '"PUT"', '"DELETE"'):
        _check(f"connector read: no {verb}", verb not in src)


def test_adapter_depends_on_narrow_reader_protocol() -> None:
    # The concrete connector satisfies the narrow read boundary structurally...
    _check("connector satisfies CompanyReader", hasattr(HubSpotConnector, "get_company"))
    # ...and the FakeReader (get_company only) is a valid CompanyReader too.
    _check("fake reader is a CompanyReader", isinstance(FakeReader(BASE), CompanyReader))


_TESTS = [
    test_disabled_flag_refuses_and_reads_nothing,
    test_empty_portal_allowlist_denies,
    test_empty_account_allowlist_denies,
    test_disallowed_portal_denies_before_read,
    test_disallowed_account_denies_before_network,
    test_malformed_allowlist_denies,
    test_missing_db_path_while_enabled_fails_closed,
    test_missing_property_is_invalid_input,
    test_empty_property_is_invalid_input,
    test_malformed_date_is_invalid_input,
    test_unexpected_shape_is_invalid_input,
    test_baseline_establishment,
    test_unchanged_observation,
    test_adverse_date_change_emits_one_event,
    test_positive_date_change_classified,
    test_deterministic_repeated_input_no_duplicate,
    test_persistence_across_restart,
    test_hubspot_error_fails_closed_without_leak,
    test_repository_failure_fails_closed,
    test_zero_write_only_get_company_invoked,
    test_adapter_source_has_no_write_verbs,
    test_connector_get_company_is_get_only,
    test_adapter_depends_on_narrow_reader_protocol,
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
    print(f"\nLive HubSpot source: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
