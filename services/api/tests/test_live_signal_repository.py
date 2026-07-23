"""Durable snapshot repository tests -- Phase 1 (plain-Python, no pytest).

Proves the persistence guarantees that make the detector safe on a platform that
restarts (Render):

* baseline persists and reads back with no prior value,
* a duplicate baseline for the same identity fails closed,
* the event store is idempotent (keyed by fingerprint; a duplicate commit raises),
* mission / write-back bindings are recorded and the column allow-list guard holds,
* RESTART: a file-backed store survives closing and reopening -- the advanced
  snapshot and stored event are still present, and the detector behaves correctly
  when a fresh process reopens the same database.

Run directly:  python services/api/tests/test_live_signal_repository.py
"""

from __future__ import annotations

import os
import shutil
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from live_signals import (  # noqa: E402
    DetectionStatus,
    SignalChangeEvent,
    SignalDetector,
    SignalDirection,
    SignalRepositoryError,
    SignalSnapshotRepository,
    change_fingerprint,
    event_id_for,
)

BASE = "2026-09-03"
EARLIER = "2026-08-10"
EARLIER_STILL = "2026-07-01"
T0 = "2026-07-20T09:00:00Z"
T1 = "2026-07-20T10:00:00Z"
T2 = "2026-07-20T11:00:00Z"
T3 = "2026-07-20T12:00:00Z"

_IDENT = dict(
    portal_id="P-TEST", account_id="A-CURE", account_ref="curefoods-test",
    monitored_field="renewal_date", source_record_type="company",
    source_record_id="C-1001", source="hubspot_test",
)

_KEY = dict(
    portal_id="P-TEST", account_id="A-CURE",
    source_record_id="C-1001", monitored_field="renewal_date",
)

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


def _expect_raises(name: str, fn, exc=SignalRepositoryError) -> None:
    try:
        fn()
    except exc:
        _check(name, True)
    except Exception as other:  # noqa: BLE001
        _check(name, False, f"wrong exception {type(other).__name__}: {other}")
    else:
        _check(name, False, "no exception raised")


def _make_event(old: str, new: str, detected_at: str,
                direction: SignalDirection = SignalDirection.adverse) -> SignalChangeEvent:
    fp = change_fingerprint(
        portal_id="P-TEST", account_id="A-CURE", source_record_id="C-1001",
        monitored_field="renewal_date", normalized_old_value=old, normalized_new_value=new)
    return SignalChangeEvent(
        event_id=event_id_for(fp), portal_id="P-TEST", account_id="A-CURE",
        account_ref="curefoods-test", monitored_field="renewal_date",
        old_value=old, new_value=new, direction=direction, detected_at=detected_at,
        source="hubspot_test", source_record_type="company", source_record_id="C-1001",
        normalized_old_value=old, normalized_new_value=new, change_fingerprint=fp)


def _seed_baseline(repo: SignalSnapshotRepository, normalized: str = BASE) -> None:
    repo.establish_baseline(
        **_KEY, account_ref="curefoods-test", source="hubspot_test",
        source_record_type="company", raw_value=normalized, normalized_value=normalized,
        last_sync_at=T0, created_at=T0)


def test_baseline_persists_and_reads() -> None:
    repo = SignalSnapshotRepository()
    _seed_baseline(repo)
    snap = repo.get_snapshot(**_KEY)
    _check("baseline: snapshot exists", snap is not None)
    _check("baseline: current normalized == BASE", snap and snap.current_normalized_value == BASE)
    _check("baseline: prior is None", snap and snap.prior_normalized_value is None)
    _check("baseline: mission/writeback unset",
           snap and snap.mission_id is None and snap.writeback_id is None)
    repo.close()


def test_duplicate_baseline_rejected() -> None:
    repo = SignalSnapshotRepository()
    _seed_baseline(repo)
    _expect_raises("duplicate baseline for same identity fails closed",
                   lambda: _seed_baseline(repo))
    repo.close()


def test_event_store_is_idempotent() -> None:
    repo = SignalSnapshotRepository()
    _seed_baseline(repo)
    event = _make_event(BASE, EARLIER, T1)
    _check("event store: find_event None before commit", repo.find_event(event.change_fingerprint) is None)
    snap = repo.commit_change(event, created_at=T1)
    _check("event store: snapshot advanced to EARLIER", snap.current_normalized_value == EARLIER)
    _check("event store: prior shifted to BASE", snap.prior_normalized_value == BASE)
    found = repo.find_event(event.change_fingerprint)
    _check("event store: find_event returns the stored event",
           found is not None and found.event_id == event.event_id)
    _expect_raises("event store: duplicate fingerprint commit fails closed",
                   lambda: repo.commit_change(event, created_at=T2))
    repo.close()


def test_mission_and_writeback_bindings() -> None:
    repo = SignalSnapshotRepository()
    _seed_baseline(repo)
    m = repo.bind_mission_id(**_KEY, mission_id="MIS-live-1", updated_at=T2)
    _check("binding: mission_id recorded", m.mission_id == "MIS-live-1")
    w = repo.bind_writeback_id(**_KEY, writeback_id="WB-task-1", updated_at=T3)
    _check("binding: writeback_id recorded", w.writeback_id == "WB-task-1")
    _check("binding: mission_id retained after writeback bind", w.mission_id == "MIS-live-1")
    repo.close()


def test_bind_guard_rejects_unknown_column() -> None:
    repo = SignalSnapshotRepository()
    _seed_baseline(repo)
    _expect_raises("bind guard: arbitrary column refused",
                   lambda: repo._bind_ref(column="current_normalized_value", value="x",
                                          updated_at=T2, **_KEY))
    repo.close()


def test_restart_preserves_snapshot_and_event() -> None:
    workdir = tempfile.mkdtemp(prefix="sig_restart_")
    db_path = os.path.join(workdir, "snap.db")
    try:
        # -- process 1: baseline + one adverse change, then "crash" (close).
        repo1 = SignalSnapshotRepository(db_path)
        det1 = SignalDetector(repo1)
        det1.detect(**_IDENT, raw_value=BASE, detected_at=T0)
        committed = det1.detect(**_IDENT, raw_value=EARLIER, detected_at=T1)
        _check("restart: change committed pre-restart",
               committed.status is DetectionStatus.change_detected, committed.detail)
        original_event_id = committed.event.event_id
        original_fp = committed.event.change_fingerprint
        repo1.close()

        # -- process 2: a fresh instance reopens the SAME database file.
        repo2 = SignalSnapshotRepository(db_path)
        snap = repo2.get_snapshot(**_KEY)
        _check("restart: snapshot survived reopen", snap is not None)
        _check("restart: current value durable (EARLIER)",
               snap and snap.current_normalized_value == EARLIER)
        _check("restart: prior value durable (BASE)",
               snap and snap.prior_normalized_value == BASE)
        durable_event = repo2.find_event(original_fp)
        _check("restart: stored event survived reopen",
               durable_event is not None and durable_event.event_id == original_event_id)

        # -- detector behaves correctly after the restart.
        det2 = SignalDetector(repo2)
        resync = det2.detect(**_IDENT, raw_value=EARLIER, detected_at=T2)
        _check("restart: re-sync same value is unchanged",
               resync.status is DetectionStatus.unchanged, resync.detail)
        further = det2.detect(**_IDENT, raw_value=EARLIER_STILL, detected_at=T3)
        _check("restart: a further adverse change is detected",
               further.status is DetectionStatus.change_detected
               and further.event.direction is SignalDirection.adverse, further.detail)
        _check("restart: event store now holds two events",
               repo2._conn.execute("SELECT COUNT(*) FROM signal_events").fetchone()[0] == 2)
        repo2.close()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


_TESTS = [
    test_baseline_persists_and_reads,
    test_duplicate_baseline_rejected,
    test_event_store_is_idempotent,
    test_mission_and_writeback_bindings,
    test_bind_guard_rejects_unknown_column,
    test_restart_preserves_snapshot_and_event,
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
    print(f"\nLive-signal repository: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
