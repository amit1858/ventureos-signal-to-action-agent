"""Planning tests for the Adaptive Mission Harness (Release 2.2, Commit 2).

Plain-Python, no pytest. Covers registries, templates, deterministic selection,
planning and policy validation.

Run directly:  python services/api/harness/tests/test_planning.py
"""

from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, "..", ".."))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from pydantic import ValidationError  # noqa: E402

from harness.contracts import CanonicalAccountRef  # noqa: E402
from harness.planner import (  # noqa: E402
    MissionPlan,
    NoMatchingMissionTemplate,
    plan_mission,
    plan_mission_for_signals,
)
from harness.policy_validator import (  # noqa: E402
    NO_MATCHING_TEMPLATE,
    result_for_unsupported_selection,
    validate,
)
from harness.registries import (  # noqa: E402
    AgentEntry,
    AgentRegistry,
    DuplicateIdError,
    InactiveError,
    ToolEntry,
    ToolRegistry,
    UnknownIdError,
    default_agent_registry,
    default_tool_registry,
)
from harness.selector import NO_MATCHING_TEMPLATE_RULE, select  # noqa: E402
from harness.templates import (  # noqa: E402
    RENEWAL_RISK_PARALLEL_V1,
    SUPPORT_ESCALATION_SEQUENTIAL_V1,
    AgentStep,
    MissionTemplate,
    TemplateBudgets,
    default_template_registry,
    renewal_risk_parallel_v1,
    support_escalation_sequential_v1,
)

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


def _account() -> CanonicalAccountRef:
    return CanonicalAccountRef(venture_os_id="VOS-CUREFOODS", canonical_name="Curefoods")


def _registries():
    return default_agent_registry(), default_tool_registry(), default_template_registry()


# -- registries -------------------------------------------------------------


def test_registry_duplicate_rejection() -> None:
    reg = AgentRegistry()
    reg.register(AgentEntry(agent_id="a1", protected_agent_name="Action Agent", description="d"))
    raised = False
    try:
        reg.register(AgentEntry(agent_id="a1", protected_agent_name="Action Agent", description="d2"))
    except DuplicateIdError:
        raised = True
    _check("registry rejects duplicate ids", raised)


def test_registry_unknown_rejection() -> None:
    agents, tools, _ = _registries()
    raised_a = False
    try:
        agents.get("ghost")
    except UnknownIdError:
        raised_a = True
    raised_t = False
    try:
        tools.get("ghost_tool")
    except UnknownIdError:
        raised_t = True
    _check("registry rejects unknown agent id", raised_a)
    _check("registry rejects unknown tool id", raised_t)


def test_registry_inactive_rejection() -> None:
    reg = AgentRegistry()
    reg.register(AgentEntry(agent_id="a1", protected_agent_name="Action Agent", description="d", active=False))
    raised = False
    try:
        reg.get_active("a1")
    except InactiveError:
        raised = True
    _check("registry rejects inactive component on active lookup", raised)
    _check("registry still returns inactive via get()", reg.get("a1").active is False)


def test_registry_deterministic_ordering() -> None:
    ids1 = default_agent_registry().ids()
    ids2 = default_agent_registry().ids()
    expected = ["signal_ingestion", "account_health", "opportunity", "governance", "action", "communication"]
    _check("agent registry ordering is deterministic", ids1 == ids2 == expected, str(ids1))
    tool_ids = default_tool_registry().ids()
    _check("tool registry ordering is deterministic",
           tool_ids == ["simulate_renewal_outreach", "simulate_support_escalation", "simulate_stakeholder_brief"],
           str(tool_ids))


def test_tool_registry_rejects_non_simulated() -> None:
    raised = False
    try:
        ToolEntry(tool_id="danger", description="real write", simulated=False)
    except ValidationError:
        raised = True
    _check("tool registry rejects non-simulated tool (no production writeback)", raised)


# -- selector ---------------------------------------------------------------


def test_selector_renewal() -> None:
    result = select({"mission_type": "renewal_risk", "signal_id": "SIG-1"}, {"ventureOsId": "VOS-CUREFOODS"})
    _check("renewal signal selects renewal-risk-parallel-v1",
           result.selected_template_id == RENEWAL_RISK_PARALLEL_V1, result.selected_template_id)
    _check("renewal selection is not fallback", result.is_fallback is False)


def test_selector_support_escalation_critical() -> None:
    result = select({"mission_type": "support_escalation", "severity": "critical"}, None)
    _check("critical support signal selects support-escalation-sequential-v1",
           result.selected_template_id == SUPPORT_ESCALATION_SEQUENTIAL_V1, result.selected_template_id)


def test_selector_different_signals_diverge_topology() -> None:
    reg = default_template_registry()
    renewal = select({"mission_type": "renewal_risk"}, None)
    support = select({"mission_type": "support_escalation", "severity": "critical"}, None)
    _check("different signals select different templates",
           renewal.selected_template_id != support.selected_template_id)
    topo_renewal = reg.get(renewal.selected_template_id).topology
    topo_support = reg.get(support.selected_template_id).topology
    _check("selected templates have divergent topologies",
           topo_renewal == "parallel" and topo_support == "sequential",
           f"{topo_renewal} vs {topo_support}")


def test_selector_no_matching_template_fails_closed() -> None:
    result = select({"mission_type": "unknown_thing"}, None)
    _check("unmatched signal selects no template (None)", result.selected_template_id is None)
    _check("unmatched signal is blocked", result.blocked is True)
    _check("unmatched signal is marked fallback", result.is_fallback is True)
    _check("unmatched signal uses R_no_matching_template rule",
           result.matched_rule_id == NO_MATCHING_TEMPLATE_RULE)


def test_selector_unmatched_never_selects_renewal() -> None:
    for signals in ({"mission_type": "unknown_thing"}, {}, {"signal_type": "weather"}, {"severity": "low"}):
        result = select(signals, None)
        _check(f"unmatched {signals} never selects renewal-risk-parallel-v1",
               result.selected_template_id != RENEWAL_RISK_PARALLEL_V1
               and result.selected_template_id is None,
               str(result.selected_template_id))


def test_selector_no_match_explanation_stable() -> None:
    a = select({"mission_type": "unknown_thing"}, None)
    b = select({"mission_type": "unknown_thing"}, None)
    _check("no-match selection is identical for identical input", a == b)
    _check("no-match explanation is stable",
           a.rationale == b.rationale and a.matched_rules == b.matched_rules)


def test_selector_explanation_stability() -> None:
    signals = {"mission_type": "renewal_risk", "signal_id": "SIG-9"}
    a = select(signals, None)
    b = select(signals, None)
    _check("selector result is identical for identical input", a == b)
    _check("selector explanation is stable",
           a.matched_rules == b.matched_rules and a.rationale == b.rationale and a.matched_rule_id == b.matched_rule_id)


# -- planner ----------------------------------------------------------------


def _plan_renewal() -> MissionPlan:
    agents, tools, _ = _registries()
    return plan_mission(
        mission_id="MSN-1", template=renewal_risk_parallel_v1(),
        signal_context={"signal_id": "SIG-1", "severity": "high"},
        canonical_account=_account(), agent_registry=agents, tool_registry=tools,
    )


def _plan_support() -> MissionPlan:
    agents, tools, _ = _registries()
    return plan_mission(
        mission_id="MSN-2", template=support_escalation_sequential_v1(),
        signal_context={"signal_id": "SIG-2", "severity": "critical"},
        canonical_account=_account(), agent_registry=agents, tool_registry=tools,
    )


def test_planner_determinism() -> None:
    a = _plan_renewal().model_dump_json(by_alias=True)
    b = _plan_renewal().model_dump_json(by_alias=True)
    _check("planner is deterministic (identical plan bytes)", a == b)


def test_planner_stable_task_ids_and_order() -> None:
    plan = _plan_renewal()
    task_ids = [t.task_id for t in plan.tasks]
    _check("first task is ingest", task_ids[0] == "MSN-1:ingest", str(task_ids))
    _check("last task is communicate", task_ids[-1] == "MSN-1:communicate", str(task_ids))
    _check("order_index is 0..n-1 contiguous",
           [t.order_index for t in plan.tasks] == list(range(len(plan.tasks))))
    # topological property: every dependency appears earlier in the order.
    pos = {t.task_id: i for i, t in enumerate(plan.tasks)}
    topo_ok = all(pos[dep] < pos[t.task_id] for t in plan.tasks for dep in t.depends_on)
    _check("task order respects dependencies (topological)", topo_ok)


def test_planner_only_registered_components() -> None:
    agents, tools, _ = _registries()
    plan = _plan_renewal()
    _check("all plan agents are registered", all(t.agent_id in agents for t in plan.tasks))
    all_tools = {tid for t in plan.tasks for tid in t.tool_ids}
    _check("all plan tools are registered", all(tid in tools for tid in all_tools))


def test_planner_rejects_unregistered_agent() -> None:
    agents, tools, _ = _registries()
    bad = MissionTemplate(
        template_id="bad-v1", version="1.0", mission_type="renewal_risk",
        description="bad", topology="sequential",
        agent_steps=[AgentStep(step_id="ingest", agent_id="ghost_agent", description="x")],
        allowed_tools=[], verification_checks=["evidence_sufficient", "governance_ok", "approval_present"],
        budgets=TemplateBudgets(max_runtime_ms=1000, max_retries=0, max_cost=0.1),
    )
    raised = False
    try:
        plan_mission(mission_id="MSN-X", template=bad, signal_context={},
                     canonical_account=_account(), agent_registry=agents, tool_registry=tools)
    except UnknownIdError:
        raised = True
    _check("planner refuses to plan with an unregistered agent", raised)


# -- templates / cycle ------------------------------------------------------


def test_template_cycle_detection() -> None:
    raised = False
    try:
        MissionTemplate(
            template_id="cyclic-v1", version="1.0", mission_type="renewal_risk",
            description="cyclic", topology="sequential",
            agent_steps=[
                AgentStep(step_id="a", agent_id="signal_ingestion", description="a", depends_on=["b"]),
                AgentStep(step_id="b", agent_id="account_health", description="b", depends_on=["a"]),
            ],
            allowed_tools=[], verification_checks=["evidence_sufficient", "governance_ok", "approval_present"],
            budgets=TemplateBudgets(max_runtime_ms=1000, max_retries=0, max_cost=0.1),
        )
    except ValidationError:
        raised = True
    _check("template construction rejects a dependency cycle", raised)


# -- policy validator -------------------------------------------------------


def test_policy_valid_renewal_plan_passes() -> None:
    agents, tools, templates = _registries()
    result = validate(_plan_renewal(), agents, tools, templates)
    _check("valid renewal plan passes policy", result.passed, str(result.errors))
    _check("valid renewal plan is execution-eligible", result.execution_eligible)


def test_policy_valid_support_plan_passes() -> None:
    agents, tools, templates = _registries()
    result = validate(_plan_support(), agents, tools, templates)
    _check("valid support plan passes policy structurally", result.passed, str(result.errors))


def test_policy_missing_verification_check_blocked() -> None:
    agents, tools, templates = _registries()
    weak = MissionTemplate(
        template_id="weak-v1", version="1.0", mission_type="renewal_risk",
        description="missing checks", topology="sequential",
        agent_steps=[AgentStep(step_id="ingest", agent_id="signal_ingestion", description="x")],
        allowed_tools=[], verification_checks=["evidence_sufficient"],  # missing governance_ok, approval_present
        budgets=TemplateBudgets(max_runtime_ms=1000, max_retries=0, max_cost=0.1),
    )
    templates.register(weak)
    plan = plan_mission(mission_id="MSN-W", template=weak, signal_context={},
                        canonical_account=_account(), agent_registry=agents, tool_registry=tools)
    result = validate(plan, agents, tools, templates)
    _check("plan missing required verification checks is blocked",
           not result.passed and any("verification check" in e for e in result.errors), str(result.errors))


def test_policy_approval_false_blocked() -> None:
    agents, tools, templates = _registries()
    plan = _plan_renewal().model_copy(update={"requires_human_approval": False})
    result = validate(plan, agents, tools, templates)
    _check("plan without human approval is blocked",
           not result.passed and any("approval" in e for e in result.errors), str(result.errors))
    _check("plan without approval is not execution-eligible", result.execution_eligible is False)


def test_policy_budget_overflow_blocked() -> None:
    agents, tools, templates = _registries()
    over = MissionTemplate(
        template_id="over-v1", version="1.0", mission_type="renewal_risk",
        description="over budget", topology="sequential",
        agent_steps=[AgentStep(step_id="ingest", agent_id="signal_ingestion", description="x")],
        allowed_tools=[], verification_checks=["evidence_sufficient", "governance_ok", "approval_present"],
        budgets=TemplateBudgets(max_runtime_ms=999_999, max_retries=99, max_cost=99.0),
    )
    templates.register(over)
    plan = plan_mission(mission_id="MSN-O", template=over, signal_context={},
                        canonical_account=_account(), agent_registry=agents, tool_registry=tools)
    result = validate(plan, agents, tools, templates)
    _check("plan exceeding published budgets is blocked",
           not result.passed and any("budget" in e for e in result.errors), str(result.errors))


def test_policy_unknown_template_blocked() -> None:
    agents, tools, templates = _registries()
    plan = _plan_renewal().model_copy(update={"template_id": "does-not-exist"})
    result = validate(plan, agents, tools, templates)
    _check("plan referencing unknown template is blocked",
           not result.passed and any("template" in e for e in result.errors), str(result.errors))


# -- fail-closed on unsupported signals -------------------------------------


def test_planner_for_signals_renewal_happy_path() -> None:
    agents, tools, templates = _registries()
    plan = plan_mission_for_signals(
        mission_id="MSN-R", signals={"mission_type": "renewal_risk", "signal_id": "SIG-1", "severity": "high"},
        canonical_account=_account(), agent_registry=agents, tool_registry=tools, template_registry=templates,
    )
    _check("signal-driven planner builds renewal plan",
           plan.template_id == RENEWAL_RISK_PARALLEL_V1 and len(plan.tasks) == 6)


def test_planner_for_signals_support_happy_path() -> None:
    agents, tools, templates = _registries()
    plan = plan_mission_for_signals(
        mission_id="MSN-S", signals={"mission_type": "support_escalation", "severity": "critical", "signal_id": "SIG-2"},
        canonical_account=_account(), agent_registry=agents, tool_registry=tools, template_registry=templates,
    )
    _check("signal-driven planner builds support plan",
           plan.template_id == SUPPORT_ESCALATION_SEQUENTIAL_V1)


def test_planner_fails_closed_on_unsupported_signal() -> None:
    agents, tools, templates = _registries()
    err = None
    try:
        plan_mission_for_signals(
            mission_id="MSN-U", signals={"mission_type": "unknown_thing"},
            canonical_account=_account(), agent_registry=agents, tool_registry=tools, template_registry=templates,
        )
    except NoMatchingMissionTemplate as exc:
        err = exc
    _check("planner raises NoMatchingMissionTemplate on unsupported signal", err is not None)
    if err is not None:
        _check("error carries the blocked selection (no template)",
               err.selection.selected_template_id is None and err.selection.blocked is True)
        _check("error carries signal classification",
               err.signal_context.get("mission_type") == "unknown_thing")
        _check("error carries selector explanation (rationale non-empty)", bool(err.selection.rationale))


def test_policy_unsupported_selection_result() -> None:
    unsupported = select({"mission_type": "unknown_thing"}, None)
    result = result_for_unsupported_selection(unsupported)
    _check("unsupported selection: passed is False", result.passed is False)
    _check("unsupported selection: execution_eligible is False", result.execution_eligible is False)
    _check("unsupported selection: error code no_matching_template",
           NO_MATCHING_TEMPLATE in result.error_codes)
    _check("unsupported selection: has human-readable explanation", bool(result.errors))


_TESTS = [
    test_registry_duplicate_rejection,
    test_registry_unknown_rejection,
    test_registry_inactive_rejection,
    test_registry_deterministic_ordering,
    test_tool_registry_rejects_non_simulated,
    test_selector_renewal,
    test_selector_support_escalation_critical,
    test_selector_different_signals_diverge_topology,
    test_selector_no_matching_template_fails_closed,
    test_selector_unmatched_never_selects_renewal,
    test_selector_no_match_explanation_stable,
    test_selector_explanation_stability,
    test_planner_determinism,
    test_planner_stable_task_ids_and_order,
    test_planner_only_registered_components,
    test_planner_rejects_unregistered_agent,
    test_template_cycle_detection,
    test_policy_valid_renewal_plan_passes,
    test_policy_valid_support_plan_passes,
    test_policy_missing_verification_check_blocked,
    test_policy_approval_false_blocked,
    test_policy_budget_overflow_blocked,
    test_policy_unknown_template_blocked,
    test_planner_for_signals_renewal_happy_path,
    test_planner_for_signals_support_happy_path,
    test_planner_fails_closed_on_unsupported_signal,
    test_policy_unsupported_selection_result,
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
    print(f"\nPlanning: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
