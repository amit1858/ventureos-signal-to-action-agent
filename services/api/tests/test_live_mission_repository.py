"""Phase 2B mission-repository + service tests -- plain-Python, no pytest.

Proves durable, idempotent mission persistence and the fail-closed service contract:

* first processing of an event -> mission_created (exactly one row persisted),
* replay of the same event    -> mission_exists (no duplicate; count stays one),
* unsupported event           -> no_eligible_mission (nothing persisted),
* repository failure          -> selection_error (no partial state),
* cross-restart durability (reopen the same SQLite file),
* additive isolation: the missions table coexists with -- and never touches -- the
  frozen Phase 1 signal_snapshots / signal_events tables.

Run directly:  python services/api/tests/test_live_mission_repository.py
"""

from __future__ import annotations

import os
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from live_signals.contracts import SignalChangeEvent, SignalDirection  # noqa: E402
from live_signals.mission_contracts import MissionSelectionStatus  # noqa: E402
from live_signals.mission_repository import (  # noqa: E402
    MissionRepository,
    MissionRepositoryError,
)
from live_signals.mission_selector import select_mission  # noqa: E402
from live_signals.mission_service import generate_mission_for_event  # noqa: E402
from live_signals.repository import SignalSnapshotRepository  # noqa: E402

PORTAL = "246820626"
ACCOUNT = "335064019691"
FINGERPRINT = "sig1:716f86dcaf33cc3c80930e16ae196e2725f6cb7aa2422ff285e1e23ff5931b21"
T0 = "2026-07-21T18:10:00Z"
T1 = "2026-07-21T19:00:00Z"

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


def _event(*, old="2026-08-31", new="2026-06-30", field="renewal_date",
           direction=SignalDirection.adverse, event_id="SCE-e85ee65385e06647") -> SignalChangeEvent:
    return SignalChangeEvent(
        event_id=event_id, portal_id=PORTAL, account_id=ACCOUNT, account_ref="curefoods-test",
        monitored_field=field, old_value=old, new_value=new, direction=direction,
        detected_at=T0, source="hubspot_test", source_record_type="company",
        source_record_id=ACCOUNT, normalized_old_value=old, normalized_new_value=new,
        change_fingerprint=FINGERPRINT,
    )


class _FailingRepo:
    """Repository stand-in whose write fails, to prove selection_error fails closed."""

    def add_if_absent(self, mission):
        raise MissionRepositoryError("simulated store failure")

    def get_by_source_event_id(self, source_event_id):  # pragma: no cover - not reached
        raise MissionRepositoryError("simulated store failure")


# -- repository idempotency --------------------------------------------------


def test_add_if_absent_is_idempotent() -> None:
    repo = MissionRepository(":memory:")
    mission = select_mission(_event(), now=T0).mission
    first = repo.add_if_absent(mission)
    second = repo.add_if_absent(mission)
    _check("first add inserts", first is True)
    _check("second add is no-op", second is False)
    _check("count stays one", repo.count() == 1)
    stored = repo.get_by_source_event_id(mission.source_event_id)
    _check("stored mission id matches", stored.mission_id == mission.mission_id)
    _check("stored priority matches", stored.priority == mission.priority)
    _check("stored evidence intact",
           stored.evidence_refs[0].normalized_new_value == "2026-06-30")
    repo.close()


def test_distinct_events_yield_distinct_missions() -> None:
    repo = MissionRepository(":memory:")
    repo.add_if_absent(select_mission(_event(event_id="SCE-aaa"), now=T0).mission)
    repo.add_if_absent(select_mission(_event(event_id="SCE-bbb"), now=T0).mission)
    _check("two distinct events -> two missions", repo.count() == 2)
    repo.close()


# -- service contract --------------------------------------------------------


def test_service_created_then_exists() -> None:
    repo = MissionRepository(":memory:")
    r1 = generate_mission_for_event(_event(), repo, now=T0)
    r2 = generate_mission_for_event(_event(), repo, now=T1)
    _check("service first -> mission_created", r1.status is MissionSelectionStatus.mission_created)
    _check("service retry -> mission_exists", r2.status is MissionSelectionStatus.mission_exists)
    _check("service retry same mission id", r1.mission.mission_id == r2.mission.mission_id)
    _check("service count stays one", repo.count() == 1)
    repo.close()


def test_service_no_eligible_persists_nothing() -> None:
    repo = MissionRepository(":memory:")
    result = generate_mission_for_event(_event(field="lifecycle_stage"), repo, now=T0)
    _check("service unsupported -> no_eligible_mission",
           result.status is MissionSelectionStatus.no_eligible_mission)
    _check("service unsupported persists nothing", repo.count() == 0)
    repo.close()


def test_service_repo_failure_fails_closed() -> None:
    result = generate_mission_for_event(_event(), _FailingRepo(), now=T0)
    _check("service repo failure -> selection_error",
           result.status is MissionSelectionStatus.selection_error)
    _check("service repo failure returns no mission", result.mission is None)


# -- durability + additive isolation ----------------------------------------


def test_restart_persistence() -> None:
    tmp = tempfile.mkdtemp(prefix="mission-db-")
    db_path = os.path.join(tmp, "live_signals.db")
    try:
        repo = MissionRepository(db_path)
        created = generate_mission_for_event(_event(), repo, now=T0)
        mission_id = created.mission.mission_id
        repo.close()

        reopened = MissionRepository(db_path)
        _check("restart: count is one", reopened.count() == 1)
        stored = reopened.get_by_source_event_id("SCE-e85ee65385e06647")
        _check("restart: mission persisted", stored is not None)
        _check("restart: mission id stable", stored.mission_id == mission_id)
        _check("restart: evidence durable",
               stored.evidence_refs[0].normalized_old_value == "2026-08-31")
        reopened.close()
    finally:
        for name in os.listdir(tmp):
            try:
                os.remove(os.path.join(tmp, name))
            except OSError:  # pragma: no cover - defensive
                pass
        os.rmdir(tmp)


def test_missions_table_is_additive_and_isolated() -> None:
    tmp = tempfile.mkdtemp(prefix="mission-db-")
    db_path = os.path.join(tmp, "live_signals.db")
    try:
        # Phase 1 store owns signal_snapshots / signal_events on the same file.
        signal_repo = SignalSnapshotRepository(db_path)
        signal_repo.close()
        # Phase 2B store adds the missions table without touching the frozen tables.
        mission_repo = MissionRepository(db_path)
        generate_mission_for_event(_event(), mission_repo, now=T0)

        cur = mission_repo._conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = {row["name"] for row in cur.fetchall()}
        _check("frozen signal_snapshots table intact", "signal_snapshots" in tables)
        _check("frozen signal_events table intact", "signal_events" in tables)
        _check("additive missions table present", "missions" in tables)
        # Phase 2B writes nothing into the frozen signal tables.
        n_events = mission_repo._conn.execute("SELECT COUNT(*) AS n FROM signal_events").fetchone()["n"]
        n_snaps = mission_repo._conn.execute("SELECT COUNT(*) AS n FROM signal_snapshots").fetchone()["n"]
        _check("signal_events untouched by 2B", n_events == 0)
        _check("signal_snapshots untouched by 2B", n_snaps == 0)
        mission_repo.close()
    finally:
        for name in os.listdir(tmp):
            try:
                os.remove(os.path.join(tmp, name))
            except OSError:  # pragma: no cover - defensive
                pass
        os.rmdir(tmp)


_TESTS = [
    test_add_if_absent_is_idempotent,
    test_distinct_events_yield_distinct_missions,
    test_service_created_then_exists,
    test_service_no_eligible_persists_nothing,
    test_service_repo_failure_fails_closed,
    test_restart_persistence,
    test_missions_table_is_additive_and_isolated,
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
    print(f"\nLive mission repository: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
