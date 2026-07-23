"""Phase 2B mission-selector tests -- plain-Python, no pytest.

Proves the deterministic selector turns one validated ``SignalChangeEvent`` into
exactly one ``LiveMission`` (or an explicit ``no_eligible_mission``), with:

* deterministic, event-derived mission identity (stable across injected clocks),
* proof-scoped priority buckets (medium / high / critical) from adverse day movement,
* complete one-directional evidence linkage back to the event,
* an advisory-only recommended next step (no execution authority),
* and NO model / network dependency anywhere in the selection path (AST scan).

Run directly:  python services/api/tests/test_live_mission_selector.py
"""

from __future__ import annotations

import ast
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from live_signals.contracts import SignalChangeEvent, SignalDirection  # noqa: E402
from live_signals import mission_rules  # noqa: E402
from live_signals.mission_contracts import (  # noqa: E402
    MissionPriority,
    MissionSelectionStatus,
    MissionStatus,
)
from live_signals.mission_selector import derive_mission_id, select_mission  # noqa: E402

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


# -- eligibility -------------------------------------------------------------


def test_adverse_renewal_produces_one_mission() -> None:
    result = select_mission(_event(), now=T0)
    _check("adverse renewal: mission_created", result.status is MissionSelectionStatus.mission_created)
    _check("adverse renewal: mission present", result.mission is not None)
    _check("adverse renewal: type renewal_risk", result.mission.mission_type == "renewal_risk")
    _check("adverse renewal: status generated", result.mission.status is MissionStatus.generated)
    _check("adverse renewal: template renewal_risk/v1",
           result.mission.template_id == "renewal_risk" and result.mission.template_version == "v1")
    _check("adverse renewal: rule linked",
           result.mission.rule_id == "R-RENEWAL-ADVERSE" and result.mission.rule_version == "v1")


def test_unsupported_field_no_eligible_mission() -> None:
    result = select_mission(_event(field="lifecycle_stage"), now=T0)
    _check("unsupported field: no_eligible_mission",
           result.status is MissionSelectionStatus.no_eligible_mission)
    _check("unsupported field: no mission", result.mission is None)


def test_positive_direction_no_eligible_mission() -> None:
    result = select_mission(
        _event(old="2026-06-30", new="2026-08-31", direction=SignalDirection.positive), now=T0)
    _check("positive direction: no_eligible_mission",
           result.status is MissionSelectionStatus.no_eligible_mission)
    _check("positive direction: no mission", result.mission is None)


# -- priority policy (proof-scoped) ------------------------------------------


def test_priority_bucket_medium() -> None:
    result = select_mission(_event(old="2026-08-31", new="2026-08-16"), now=T0)  # 15 days
    _check("15 days earlier: medium", result.mission.priority is MissionPriority.medium)


def test_priority_bucket_high() -> None:
    result = select_mission(_event(old="2026-08-31", new="2026-06-30"), now=T0)  # 62 days
    _check("62 days earlier: high", result.mission.priority is MissionPriority.high)


def test_priority_bucket_critical() -> None:
    result = select_mission(_event(old="2026-12-31", new="2026-06-30"), now=T0)  # >90 days
    _check("184 days earlier: critical", result.mission.priority is MissionPriority.critical)


def test_priority_boundaries() -> None:
    _check("boundary 30 -> medium",
           mission_rules.priority_for_days_earlier(30) is MissionPriority.medium)
    _check("boundary 31 -> high",
           mission_rules.priority_for_days_earlier(31) is MissionPriority.high)
    _check("boundary 90 -> high",
           mission_rules.priority_for_days_earlier(90) is MissionPriority.high)
    _check("boundary 91 -> critical",
           mission_rules.priority_for_days_earlier(91) is MissionPriority.critical)


# -- deterministic identity --------------------------------------------------


def test_mission_id_is_deterministic_across_clocks() -> None:
    a = select_mission(_event(), now=T0).mission
    b = select_mission(_event(), now=T1).mission
    _check("mission id stable across injected clocks", a.mission_id == b.mission_id)
    _check("mission id derives from source event id",
           a.mission_id == derive_mission_id(a.source_event_id))
    _check("mission id prefix", a.mission_id.startswith("MSN-"))


# -- evidence linkage --------------------------------------------------------


def test_evidence_linkage_is_complete() -> None:
    mission = select_mission(_event(), now=T0).mission
    _check("source_event_id linked", mission.source_event_id == "SCE-e85ee65385e06647")
    _check("change_fingerprint linked", mission.change_fingerprint == FINGERPRINT)
    _check("exactly one evidence ref", len(mission.evidence_refs) == 1)
    ref = mission.evidence_refs[0]
    _check("evidence old value", ref.normalized_old_value == "2026-08-31")
    _check("evidence new value", ref.normalized_new_value == "2026-06-30")
    _check("evidence field", ref.monitored_field == "renewal_date")
    _check("evidence record id", ref.source_record_id == ACCOUNT)
    _check("evidence event id", ref.event_id == "SCE-e85ee65385e06647")
    _check("selection_reason non-empty", bool(mission.selection_reason.strip()))


# -- advisory-only, LLM-free -------------------------------------------------


def test_recommended_next_step_is_advisory_only() -> None:
    mission = select_mission(_event(), now=T0).mission
    step = mission.recommended_next_step
    _check("recommended_next_step present", bool(step.strip()))
    # STRUCTURAL boundary (not keyword policing): the field is inert advisory text --
    # a plain string, never an executable tool call, action-command object, or callable.
    _check("recommended_next_step is plain text (str)", isinstance(step, str))
    _check("recommended_next_step is not a command/collection object",
           not isinstance(step, (dict, list, tuple)))
    _check("recommended_next_step is not callable", not callable(step))
    # The mission contract exposes NO execution-authority surface: no approval flag,
    # no execution permission, no embedded tool call / action command object.
    field_names = set(type(mission).model_fields.keys())
    authority = {
        "approved", "approval", "execute", "execution", "permission", "permissions",
        "tool_call", "tool_calls", "action_command", "command", "side_effect",
        "authorized", "authorization",
    }
    intersection = field_names & authority
    _check("mission exposes no execution-authority field",
           not intersection, ", ".join(sorted(intersection)))


def test_selection_path_has_no_model_or_network() -> None:
    modules = [
        "live_signals/mission_contracts.py",
        "live_signals/mission_templates.py",
        "live_signals/mission_rules.py",
        "live_signals/mission_selector.py",
        "live_signals/mission_repository.py",
        "live_signals/mission_service.py",
    ]
    banned = {"requests", "httpx", "urllib", "socket", "openai", "nvidia"}
    clean = True
    hits: list[str] = []
    for rel in modules:
        tree = ast.parse(open(os.path.join(_API_DIR, rel), encoding="utf-8").read())
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name.split(".")[0] for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module.split(".")[0]]
            for n in names:
                if n in banned:
                    clean = False
                    hits.append(f"{rel}:{n}")
    _check("mission path imports no model/network module", clean, ", ".join(hits))


_TESTS = [
    test_adverse_renewal_produces_one_mission,
    test_unsupported_field_no_eligible_mission,
    test_positive_direction_no_eligible_mission,
    test_priority_bucket_medium,
    test_priority_bucket_high,
    test_priority_bucket_critical,
    test_priority_boundaries,
    test_mission_id_is_deterministic_across_clocks,
    test_evidence_linkage_is_complete,
    test_recommended_next_step_is_advisory_only,
    test_selection_path_has_no_model_or_network,
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
    print(f"\nLive mission selector: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
