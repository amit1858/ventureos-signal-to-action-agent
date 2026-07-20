"""Live-signal contract tests -- Phase 1 (plain-Python, no pytest).

Validates the ``live_signals`` contracts in isolation:

* a valid renewal SignalChangeEvent constructs and round-trips through camelCase JSON,
* the material-change invariant (direction != unchanged),
* fail-closed validation for missing portal / blank identity / blank values,
* the deterministic enum vocabularies,
* the exact camelCase key set on the cross-language boundary.

Run directly:  python services/api/tests/test_live_signal_contracts.py
"""

from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from pydantic import ValidationError  # noqa: E402

from live_signals import (  # noqa: E402
    DetectionResult,
    DetectionStatus,
    SignalChangeEvent,
    SignalDirection,
    change_fingerprint,
    event_id_for,
)

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


def _valid_kwargs(**overrides) -> dict:
    fp = change_fingerprint(
        portal_id="P-TEST", account_id="A-CURE", source_record_id="C-1001",
        monitored_field="renewal_date",
        normalized_old_value="2026-09-03", normalized_new_value="2026-08-10",
    )
    kwargs = dict(
        event_id=event_id_for(fp), portal_id="P-TEST", account_id="A-CURE",
        account_ref="curefoods-test", monitored_field="renewal_date",
        old_value="2026-09-03", new_value="2026-08-10", direction=SignalDirection.adverse,
        detected_at="2026-07-20T10:00:00Z", source="hubspot_test",
        source_record_type="company", source_record_id="C-1001",
        normalized_old_value="2026-09-03", normalized_new_value="2026-08-10",
        change_fingerprint=fp,
    )
    kwargs.update(overrides)
    return kwargs


def test_valid_event_constructs_and_roundtrips() -> None:
    event = SignalChangeEvent(**_valid_kwargs())
    _check("valid event: direction adverse", event.direction is SignalDirection.adverse)
    _check("valid event: schema_version defaults to 1.0", event.schema_version == "1.0")
    dumped = event.model_dump(by_alias=True, mode="json")
    reloaded = SignalChangeEvent.model_validate(dumped)
    _check("valid event: camelCase round-trip is lossless", reloaded == event,
           f"{reloaded!r} != {event!r}")


def test_camelcase_boundary_keys() -> None:
    dumped = SignalChangeEvent(**_valid_kwargs()).model_dump(by_alias=True)
    expected = {
        "schemaVersion", "eventId", "portalId", "accountId", "accountRef",
        "monitoredField", "oldValue", "newValue", "direction", "detectedAt",
        "source", "sourceRecordType", "sourceRecordId", "normalizedOldValue",
        "normalizedNewValue", "changeFingerprint",
    }
    _check("camelCase keys match the locked shape", set(dumped.keys()) == expected,
           f"got {sorted(dumped.keys())}")
    _check("snake_case input is accepted (populate_by_name)",
           SignalChangeEvent.model_validate(_valid_kwargs()).portal_id == "P-TEST")


def test_unchanged_direction_is_rejected() -> None:
    try:
        SignalChangeEvent(**_valid_kwargs(direction=SignalDirection.unchanged))
    except ValidationError:
        _check("event rejects direction=unchanged (material-change invariant)", True)
    else:
        _check("event rejects direction=unchanged (material-change invariant)", False,
               "no ValidationError raised")


def test_missing_portal_is_rejected() -> None:
    try:
        SignalChangeEvent(**_valid_kwargs(portal_id="   "))
    except ValidationError:
        _check("event rejects blank portal_id (fail closed)", True)
    else:
        _check("event rejects blank portal_id (fail closed)", False, "no ValidationError raised")


def test_blank_values_are_rejected() -> None:
    for field in ("account_id", "monitored_field", "normalized_new_value",
                  "change_fingerprint", "source_record_id", "event_id"):
        try:
            SignalChangeEvent(**_valid_kwargs(**{field: ""}))
        except ValidationError:
            _check(f"event rejects blank {field}", True)
        else:
            _check(f"event rejects blank {field}", False, "no ValidationError raised")


def test_enum_vocabularies() -> None:
    _check("SignalDirection vocabulary",
           {d.value for d in SignalDirection} == {"adverse", "positive", "unchanged"})
    _check("DetectionStatus vocabulary",
           {s.value for s in DetectionStatus} == {
               "baseline_established", "unchanged", "change_detected",
               "invalid_input", "ambiguous_change", "persistence_failure"})


def test_detection_result_defaults() -> None:
    result = DetectionResult(status=DetectionStatus.unchanged)
    _check("DetectionResult defaults: no event", result.event is None)
    _check("DetectionResult defaults: not replayed", result.replayed is False)


_TESTS = [
    test_valid_event_constructs_and_roundtrips,
    test_camelcase_boundary_keys,
    test_unchanged_direction_is_rejected,
    test_missing_portal_is_rejected,
    test_blank_values_are_rejected,
    test_enum_vocabularies,
    test_detection_result_defaults,
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
    print(f"\nLive-signal contracts: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
