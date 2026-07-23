"""Deterministic SignalDetector tests -- Phase 1 (plain-Python, no pytest).

Proves the full fail-closed outcome set on a durable (in-memory) repository:

* baseline (first observation) -> no event, no mission,
* adverse renewal change (~45d -> ~21d) -> exactly one event, stable fingerprint,
* positive renewal change (~21d -> ~60d) -> classified positive,
* unchanged / re-sync -> no event, no snapshot side effect,
* invalid input (bad date / unknown field / missing identity) -> fail closed,
* replay of the same transition -> the stored event, no duplicate, timestamp preserved,
* fingerprint + event id are stable and clock-free (detected_at excluded from identity),
* ambiguous_change (defensive) and persistence_failure both fail closed.

Run directly:  python services/api/tests/test_signal_detector.py
"""

from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

import live_signals.detector as detector_module  # noqa: E402
from live_signals import (  # noqa: E402
    DetectionStatus,
    FieldSpec,
    SignalDetector,
    SignalDirection,
    SignalSnapshotRepository,
    change_fingerprint,
    event_id_for,
)

# Renewal horizon dates chosen so, as of ~2026-07-20, BASE is ~45 days out and
# EARLIER is ~21 days out (an adverse move); LATER is ~87 days out (positive).
BASE = "2026-09-03"
EARLIER = "2026-08-10"
LATER = "2026-10-15"

T0 = "2026-07-20T09:00:00Z"
T1 = "2026-07-20T10:00:00Z"
T2 = "2026-07-20T11:00:00Z"
T3 = "2026-07-20T12:00:00Z"

_IDENT = dict(
    portal_id="P-TEST", account_id="A-CURE", account_ref="curefoods-test",
    monitored_field="renewal_date", source_record_type="company",
    source_record_id="C-1001", source="hubspot_test",
)

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


def _fresh() -> tuple[SignalSnapshotRepository, SignalDetector]:
    repo = SignalSnapshotRepository()  # in-memory, isolated per test
    return repo, SignalDetector(repo)


def _count_events(repo: SignalSnapshotRepository) -> int:
    return repo._conn.execute("SELECT COUNT(*) FROM signal_events").fetchone()[0]


def test_baseline_establishes_no_event() -> None:
    repo, det = _fresh()
    result = det.detect(**_IDENT, raw_value=BASE, detected_at=T0)
    _check("baseline: status baseline_established",
           result.status is DetectionStatus.baseline_established, result.detail)
    _check("baseline: no event emitted", result.event is None)
    _check("baseline: snapshot persisted", result.snapshot is not None)
    _check("baseline: current normalized == BASE",
           result.snapshot and result.snapshot.current_normalized_value == BASE)
    _check("baseline: no prior value yet",
           result.snapshot and result.snapshot.prior_normalized_value is None)
    _check("baseline: event store empty", _count_events(repo) == 0)


def test_adverse_change_emits_one_event() -> None:
    repo, det = _fresh()
    det.detect(**_IDENT, raw_value=BASE, detected_at=T0)
    result = det.detect(**_IDENT, raw_value=EARLIER, detected_at=T1)
    _check("adverse: status change_detected",
           result.status is DetectionStatus.change_detected, result.detail)
    _check("adverse: not a replay", result.replayed is False)
    _check("adverse: direction adverse",
           result.event and result.event.direction is SignalDirection.adverse)
    _check("adverse: normalized old == BASE",
           result.event and result.event.normalized_old_value == BASE)
    _check("adverse: normalized new == EARLIER",
           result.event and result.event.normalized_new_value == EARLIER)
    expected_fp = change_fingerprint(
        portal_id="P-TEST", account_id="A-CURE", source_record_id="C-1001",
        monitored_field="renewal_date", normalized_old_value=BASE, normalized_new_value=EARLIER,
    )
    _check("adverse: fingerprint matches pure function",
           result.event and result.event.change_fingerprint == expected_fp)
    _check("adverse: event id derived from fingerprint",
           result.event and result.event.event_id == event_id_for(expected_fp))
    _check("adverse: exactly one stored event", _count_events(repo) == 1)
    _check("adverse: snapshot advanced (current EARLIER, prior BASE)",
           result.snapshot and result.snapshot.current_normalized_value == EARLIER
           and result.snapshot.prior_normalized_value == BASE)


def test_positive_change_classified() -> None:
    repo, det = _fresh()
    det.detect(**_IDENT, raw_value=EARLIER, detected_at=T0)
    result = det.detect(**_IDENT, raw_value=LATER, detected_at=T1)
    _check("positive: status change_detected",
           result.status is DetectionStatus.change_detected, result.detail)
    _check("positive: direction positive",
           result.event and result.event.direction is SignalDirection.positive)
    _check("positive: one stored event", _count_events(repo) == 1)


def test_unchanged_produces_no_event() -> None:
    repo, det = _fresh()
    det.detect(**_IDENT, raw_value=BASE, detected_at=T0)
    result = det.detect(**_IDENT, raw_value=BASE, detected_at=T1)
    _check("unchanged: status unchanged",
           result.status is DetectionStatus.unchanged, result.detail)
    _check("unchanged: no event", result.event is None)
    _check("unchanged: still no stored event", _count_events(repo) == 0)
    _check("unchanged: snapshot has no prior side effect",
           result.snapshot and result.snapshot.prior_normalized_value is None)


def test_resync_same_value_after_change_is_unchanged() -> None:
    repo, det = _fresh()
    det.detect(**_IDENT, raw_value=BASE, detected_at=T0)
    det.detect(**_IDENT, raw_value=EARLIER, detected_at=T1)  # commit adverse
    result = det.detect(**_IDENT, raw_value=EARLIER, detected_at=T2)  # re-sync same
    _check("resync: status unchanged (idempotent no-op)",
           result.status is DetectionStatus.unchanged, result.detail)
    _check("resync: no duplicate event", _count_events(repo) == 1)


def test_invalid_bad_date_fails_closed() -> None:
    repo, det = _fresh()
    det.detect(**_IDENT, raw_value=BASE, detected_at=T0)
    result = det.detect(**_IDENT, raw_value="not-a-date", detected_at=T1)
    _check("invalid date: status invalid_input",
           result.status is DetectionStatus.invalid_input, result.detail)
    _check("invalid date: no event", result.event is None)
    _check("invalid date: no stored event", _count_events(repo) == 0)


def test_invalid_unknown_field_fails_closed() -> None:
    repo, det = _fresh()
    ident = dict(_IDENT)
    ident["monitored_field"] = "health_score"
    result = det.detect(**ident, raw_value="42", detected_at=T0)
    _check("unknown field: status invalid_input",
           result.status is DetectionStatus.invalid_input, result.detail)
    _check("unknown field: no event", result.event is None)


def test_invalid_missing_identity_fails_closed() -> None:
    repo, det = _fresh()
    ident = dict(_IDENT)
    ident["portal_id"] = "   "
    result = det.detect(**ident, raw_value=BASE, detected_at=T0)
    _check("missing identity: status invalid_input",
           result.status is DetectionStatus.invalid_input, result.detail)
    _check("missing identity: nothing persisted", _count_events(repo) == 0)


def test_replay_returns_stored_event_no_duplicate() -> None:
    repo, det = _fresh()
    det.detect(**_IDENT, raw_value=BASE, detected_at=T0)          # baseline BASE
    first = det.detect(**_IDENT, raw_value=EARLIER, detected_at=T1)  # BASE->EARLIER (e1)
    det.detect(**_IDENT, raw_value=BASE, detected_at=T2)          # EARLIER->BASE (e2)
    replay = det.detect(**_IDENT, raw_value=EARLIER, detected_at=T3)  # BASE->EARLIER again
    _check("replay: status change_detected",
           replay.status is DetectionStatus.change_detected, replay.detail)
    _check("replay: flagged as replay", replay.replayed is True)
    _check("replay: same event id as the original transition",
           replay.event and first.event and replay.event.event_id == first.event.event_id)
    _check("replay: original detected_at preserved (not T3)",
           replay.event and replay.event.detected_at == T1)
    _check("replay: no duplicate stored (still two distinct events)",
           _count_events(repo) == 2)


def test_fingerprint_is_stable_and_discriminating() -> None:
    a = change_fingerprint(
        portal_id="P-TEST", account_id="A-CURE", source_record_id="C-1001",
        monitored_field="renewal_date", normalized_old_value=BASE, normalized_new_value=EARLIER)
    b = change_fingerprint(
        portal_id="P-TEST", account_id="A-CURE", source_record_id="C-1001",
        monitored_field="renewal_date", normalized_old_value=BASE, normalized_new_value=EARLIER)
    c = change_fingerprint(
        portal_id="P-TEST", account_id="A-CURE", source_record_id="C-1001",
        monitored_field="renewal_date", normalized_old_value=BASE, normalized_new_value=LATER)
    _check("fingerprint: deterministic for identical inputs", a == b)
    _check("fingerprint: differs when the new value differs", a != c)
    _check("fingerprint: namespaced prefix", a.startswith("sig1:"))
    _check("event id: namespaced + fixed width", event_id_for(a).startswith("SCE-")
           and len(event_id_for(a)) == 20)


def test_injected_timestamp_excluded_from_identity() -> None:
    repo_a, det_a = _fresh()
    det_a.detect(**_IDENT, raw_value=BASE, detected_at=T0)
    ev_a = det_a.detect(**_IDENT, raw_value=EARLIER, detected_at=T1).event

    repo_b, det_b = _fresh()
    det_b.detect(**_IDENT, raw_value=BASE, detected_at="2099-01-01T00:00:00Z")
    ev_b = det_b.detect(**_IDENT, raw_value=EARLIER, detected_at="2099-02-02T00:00:00Z").event

    _check("determinism: same event id across different clocks",
           ev_a and ev_b and ev_a.event_id == ev_b.event_id)
    _check("determinism: same fingerprint across different clocks",
           ev_a and ev_b and ev_a.change_fingerprint == ev_b.change_fingerprint)
    _check("determinism: detected_at is still carried (and differs)",
           ev_a and ev_b and ev_a.detected_at != ev_b.detected_at)


def test_ambiguous_change_is_defensive_and_fails_closed() -> None:
    # White-box: register a temporary field whose classifier cannot order two
    # differing values, to exercise the defensive ambiguous_change branch.
    detector_module._FIELD_SPECS["__amb__"] = FieldSpec(
        "__amb__", lambda s: str(s).strip(), lambda old, new: SignalDirection.unchanged)
    try:
        repo, det = _fresh()
        ident = dict(_IDENT)
        ident["monitored_field"] = "__amb__"
        det.detect(**ident, raw_value="alpha", detected_at=T0)   # baseline
        result = det.detect(**ident, raw_value="bravo", detected_at=T1)
        _check("ambiguous: status ambiguous_change",
               result.status is DetectionStatus.ambiguous_change, result.detail)
        _check("ambiguous: no event emitted", result.event is None)
        _check("ambiguous: nothing stored", _count_events(repo) == 0)
    finally:
        detector_module._FIELD_SPECS.pop("__amb__", None)


def test_persistence_failure_fails_closed() -> None:
    repo, det = _fresh()
    det.detect(**_IDENT, raw_value=BASE, detected_at=T0)
    repo.close()  # simulate the durable store becoming unavailable
    result = det.detect(**_IDENT, raw_value=EARLIER, detected_at=T1)
    _check("persistence failure: status persistence_failure",
           result.status is DetectionStatus.persistence_failure, result.detail)
    _check("persistence failure: no event", result.event is None)


_TESTS = [
    test_baseline_establishes_no_event,
    test_adverse_change_emits_one_event,
    test_positive_change_classified,
    test_unchanged_produces_no_event,
    test_resync_same_value_after_change_is_unchanged,
    test_invalid_bad_date_fails_closed,
    test_invalid_unknown_field_fails_closed,
    test_invalid_missing_identity_fails_closed,
    test_replay_returns_stored_event_no_duplicate,
    test_fingerprint_is_stable_and_discriminating,
    test_injected_timestamp_excluded_from_identity,
    test_ambiguous_change_is_defensive_and_fails_closed,
    test_persistence_failure_fails_closed,
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
    print(f"\nSignal detector: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
