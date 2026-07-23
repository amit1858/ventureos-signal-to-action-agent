"""Selector proof -- live SignalChangeEvent -> real harness selector (Phase 1).

This test calls the REAL, UNMODIFIED ``harness.selector.select`` to prove that a
deterministic live signal drives deterministic template selection through the pure
``to_selector_signals`` bridge (which imports nothing from the harness):

* an adverse renewal event      -> ``renewal-risk-parallel-v1``,
* a positive renewal event      -> no eligible template (fails closed / blocked),
* a critical support escalation  -> ``support-escalation-sequential-v1`` (a *different* template),
* the bridge + selector are deterministic (identical input -> identical result).

Run directly:  python services/api/harness/tests/test_live_signal_selector.py
"""

from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, "..", ".."))  # harness/tests -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from harness.selector import NO_MATCHING_TEMPLATE_RULE, select  # noqa: E402
from harness.templates import (  # noqa: E402
    RENEWAL_RISK_PARALLEL_V1,
    SUPPORT_ESCALATION_SEQUENTIAL_V1,
)
from live_signals import (  # noqa: E402
    SUPPORT_ESCALATION,
    SignalChangeEvent,
    SignalDetector,
    SignalDirection,
    SignalSnapshotRepository,
    change_fingerprint,
    event_id_for,
    to_selector_signals,
)

BASE = "2026-09-03"
EARLIER = "2026-08-10"
LATER = "2026-10-15"

_IDENT = dict(
    portal_id="P-TEST", account_id="A-CURE", account_ref="curefoods-test",
    monitored_field="renewal_date", source_record_type="company",
    source_record_id="C-1001", source="hubspot_test",
)

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


def _renewal_event(old: str, new: str) -> SignalChangeEvent:
    """Produce a real renewal event through the actual detector pipeline."""
    det = SignalDetector(SignalSnapshotRepository())
    det.detect(**_IDENT, raw_value=old, detected_at="2026-07-01T00:00:00Z")
    result = det.detect(**_IDENT, raw_value=new, detected_at="2026-07-20T10:00:00Z")
    return result.event


def _support_escalation_event(direction: SignalDirection = SignalDirection.adverse) -> SignalChangeEvent:
    """Hand-construct a critical support-escalation event.

    The Phase 1 detector only normalizes ``renewal_date``; a second signal type is
    constructed directly to prove the selector reaches a *different* template.
    """
    old, new = "normal", "critical"
    fp = change_fingerprint(
        portal_id="P-TEST", account_id="A-CURE", source_record_id="T-9",
        monitored_field=SUPPORT_ESCALATION, normalized_old_value=old, normalized_new_value=new)
    return SignalChangeEvent(
        event_id=event_id_for(fp), portal_id="P-TEST", account_id="A-CURE",
        account_ref="curefoods-test", monitored_field=SUPPORT_ESCALATION,
        old_value=old, new_value=new, direction=direction,
        detected_at="2026-07-20T10:00:00Z", source="hubspot_test",
        source_record_type="ticket", source_record_id="T-9",
        normalized_old_value=old, normalized_new_value=new, change_fingerprint=fp)


def test_adverse_renewal_selects_renewal_template() -> None:
    event = _renewal_event(BASE, EARLIER)
    _check("adverse renewal: event is adverse", event.direction is SignalDirection.adverse)
    signals = to_selector_signals(event)
    result = select(signals)
    _check("adverse renewal: selects renewal-risk-parallel-v1",
           result.selected_template_id == RENEWAL_RISK_PARALLEL_V1, result.rationale)
    _check("adverse renewal: not blocked", result.blocked is False)
    _check("adverse renewal: matched R1_renewal_risk", result.matched_rule_id == "R1_renewal_risk")


def test_positive_renewal_has_no_eligible_template() -> None:
    event = _renewal_event(EARLIER, LATER)
    _check("positive renewal: event is positive", event.direction is SignalDirection.positive)
    signals = to_selector_signals(event)
    _check("positive renewal: bridge yields no actionable signal", signals == {})
    result = select(signals)
    _check("positive renewal: no template selected", result.selected_template_id is None)
    _check("positive renewal: selector fails closed (blocked)", result.blocked is True)
    _check("positive renewal: matched the no-template rule",
           result.matched_rule_id == NO_MATCHING_TEMPLATE_RULE)


def test_support_escalation_selects_a_different_template() -> None:
    event = _support_escalation_event()
    signals = to_selector_signals(event)
    result = select(signals)
    _check("support escalation: selects support-escalation-sequential-v1",
           result.selected_template_id == SUPPORT_ESCALATION_SEQUENTIAL_V1, result.rationale)
    _check("support escalation: matched R2_support_escalation_critical",
           result.matched_rule_id == "R2_support_escalation_critical")
    _check("support escalation: is a DIFFERENT template than renewal",
           SUPPORT_ESCALATION_SEQUENTIAL_V1 != RENEWAL_RISK_PARALLEL_V1)


def test_selector_bridge_is_deterministic() -> None:
    event = _renewal_event(BASE, EARLIER)
    _check("determinism: bridge output is stable",
           to_selector_signals(event) == to_selector_signals(event))
    first = select(to_selector_signals(event))
    second = select(to_selector_signals(event))
    _check("determinism: same template on repeat",
           first.selected_template_id == second.selected_template_id)
    _check("determinism: same matched rule on repeat",
           first.matched_rule_id == second.matched_rule_id)


_TESTS = [
    test_adverse_renewal_selects_renewal_template,
    test_positive_renewal_has_no_eligible_template,
    test_support_escalation_selects_a_different_template,
    test_selector_bridge_is_deterministic,
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
    print(f"\nLive-signal selector proof: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
