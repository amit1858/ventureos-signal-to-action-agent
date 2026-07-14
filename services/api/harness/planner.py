"""Deterministic Mission Planner (Release 2.2).

``plan_mission(...)`` turns a selected ``MissionTemplate`` plus signal context and
a canonical account reference into a ``MissionPlan``: a ``MissionDefinition``
(Commit 1/1b contract) paired with an ordered, deterministically-ided task list
derived from the template steps.

The planner is pure planning -- it NEVER:

* executes an agent or tool,
* calls memory, the frontend, providers, or the protected orchestrator,
* invents unregistered agents or tools (every task is looked up read-only in the
  registries; unknown/inactive ids raise).

Same input -> same ``MissionPlan`` (stable task ids and ordering).
"""

from __future__ import annotations

from typing import List, Mapping, Optional

from pydantic import Field

from harness.contracts import (
    CanonicalAccountRef,
    HarnessModel,
    MissionDefinition,
    RequiredEvidence,
    RiskLevel,
    SuccessCriterion,
)
from harness.registries import AgentRegistry, ToolRegistry
from harness.templates import MissionTemplate, TemplateBudgets

_SEVERITY_TO_RISK = {
    "critical": RiskLevel.critical,
    "high": RiskLevel.high,
    "medium": RiskLevel.medium,
    "low": RiskLevel.low,
}

# Evidence categories required per mission type (deterministic).
_REQUIRED_EVIDENCE = {
    "renewal_risk": ["account_health", "renewal_timeline", "usage_trend"],
    "support_escalation": ["support_history", "account_health"],
}


class PlannedTask(HarnessModel):
    """One ordered task in a mission plan (derived from a template step)."""

    task_id: str
    step_id: str
    agent_id: str
    agent_name: str = Field(..., description="Protected agent canonical name (reference only)")
    tool_ids: List[str] = Field(default_factory=list)
    depends_on: List[str] = Field(default_factory=list, description="task_ids this task depends on")
    order_index: int = Field(..., ge=0)


class MissionPlan(HarnessModel):
    """A deterministic, non-executable mission plan."""

    mission_id: str
    template_id: str
    topology: str
    mission_definition: MissionDefinition
    tasks: List[PlannedTask]
    budgets: TemplateBudgets
    requires_human_approval: bool = True


def _lower(value: object) -> str:
    return str(value).strip().lower() if value is not None else ""


def _risk_level(signals: Mapping[str, object], mission_type: str) -> RiskLevel:
    sev = _lower(signals.get("severity") or signals.get("priority"))
    if sev in _SEVERITY_TO_RISK:
        return _SEVERITY_TO_RISK[sev]
    return RiskLevel.high if mission_type == "renewal_risk" else RiskLevel.medium


def _ordered_task_ids(template: MissionTemplate) -> List[str]:
    """Deterministic topological order of step ids (stable tie-break = template order)."""
    step_order = {s.step_id: i for i, s in enumerate(template.agent_steps)}
    indeg = {s.step_id: 0 for s in template.agent_steps}
    outedges = {s.step_id: [] for s in template.agent_steps}
    for step in template.agent_steps:
        for dep in step.depends_on:
            outedges[dep].append(step.step_id)
            indeg[step.step_id] += 1
    ready = sorted([sid for sid, d in indeg.items() if d == 0], key=lambda s: step_order[s])
    order: List[str] = []
    while ready:
        node = ready.pop(0)
        order.append(node)
        for nxt in outedges[node]:
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                ready.append(nxt)
        ready.sort(key=lambda s: step_order[s])
    return order


def plan_mission(
    *,
    mission_id: str,
    template: MissionTemplate,
    signal_context: Mapping[str, object],
    canonical_account: CanonicalAccountRef,
    agent_registry: AgentRegistry,
    tool_registry: ToolRegistry,
    trigger_signal_id: Optional[str] = None,
) -> MissionPlan:
    """Build a deterministic MissionPlan. Does not execute anything."""
    signal_context = dict(signal_context or {})
    mission_type = template.mission_type
    account_name = canonical_account.canonical_name
    trigger = trigger_signal_id or str(signal_context.get("signal_id") or "SIG-UNKNOWN")

    # Build tasks in deterministic topological order. Every agent/tool is looked
    # up read-only -- unregistered or inactive ids raise before any plan is built.
    ordered_step_ids = _ordered_task_ids(template)
    step_by_id = {s.step_id: s for s in template.agent_steps}
    task_id_of = {sid: f"{mission_id}:{sid}" for sid in step_by_id}

    tasks: List[PlannedTask] = []
    for idx, sid in enumerate(ordered_step_ids):
        step = step_by_id[sid]
        agent = agent_registry.get_active(step.agent_id)
        for tool_id in step.tool_ids:
            tool_registry.get_active(tool_id)  # validate registered + active (simulation-only)
        tasks.append(
            PlannedTask(
                task_id=task_id_of[sid],
                step_id=sid,
                agent_id=step.agent_id,
                agent_name=agent.protected_agent_name,
                tool_ids=list(step.tool_ids),
                depends_on=[task_id_of[d] for d in step.depends_on],
                order_index=idx,
            )
        )

    success_criteria = [
        SuccessCriterion(
            criterion_id="SC1",
            description=f"{mission_type} mission objective prepared and approved for {account_name}.",
            measurement_type="boolean",
            target="true",
        )
    ]
    required_evidence = [
        RequiredEvidence(category=cat, mandatory=True)
        for cat in _REQUIRED_EVIDENCE.get(mission_type, ["account_health"])
    ]

    definition = MissionDefinition(
        mission_id=mission_id,
        mission_type=mission_type,
        trigger_signal_id=trigger,
        canonical_account=canonical_account,
        objective=f"{template.description}",
        rationale=f"Signal {trigger} selected template {template.template_id} for {account_name}.",
        success_criteria=success_criteria,
        constraints=[],
        risk_level=_risk_level(signal_context, mission_type),
        required_evidence=required_evidence,
        permitted_actions=list(template.allowed_tools),
        selected_template_id=template.template_id,
        expected_outcome=f"Approved simulated {mission_type} action for {account_name}.",
    )

    return MissionPlan(
        mission_id=mission_id,
        template_id=template.template_id,
        topology=template.topology,
        mission_definition=definition,
        tasks=tasks,
        budgets=template.budgets,
        requires_human_approval=True,
    )


__all__ = ["PlannedTask", "MissionPlan", "plan_mission"]
