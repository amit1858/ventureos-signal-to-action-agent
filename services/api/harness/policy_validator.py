"""Deterministic Mission Policy Validator (Release 2.2).

``validate(plan, ...) -> PolicyValidationResult`` statically checks a
``MissionPlan`` against the registries and published policy. It executes nothing;
it only inspects references and structure. Any violation is reported as a
structured error (registry lookups are caught and converted to errors rather than
raised), so a caller always receives a verdict.

Checks performed:

* selected template exists and is active,
* every task agent exists and is active,
* every task tool exists, is active and is simulation-only,
* task dependencies reference existing tasks and are acyclic,
* the required verification checks are all present on the template,
* human approval is required (plan + definition + template),
* budgets are within the published limits,
* no tool is used that is outside the template's ``allowed_tools`` (no
  unsupported action), and no non-simulated tool appears (no production writeback).
"""

from __future__ import annotations

from typing import List

from pydantic import Field

from harness.contracts import HarnessModel
from harness.planner import MissionPlan
from harness.registries import (
    AgentRegistry,
    MissionTemplateRegistry,
    RegistryError,
    ToolRegistry,
)
from harness.selector import SelectionResult
from harness.templates import BUDGET_LIMITS, REQUIRED_VERIFICATION_CHECKS

# Structured error codes.
NO_MATCHING_TEMPLATE = "no_matching_template"


class PolicyValidationResult(HarnessModel):
    """Structured verdict of policy validation."""

    passed: bool
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    error_codes: List[str] = Field(default_factory=list)
    execution_eligible: bool = False


def result_for_unsupported_selection(selection: SelectionResult) -> PolicyValidationResult:
    """Blocked policy verdict for a selection that matched no approved template."""
    return PolicyValidationResult(
        passed=False,
        warnings=[],
        errors=[
            "No approved mission template matches the signal; mission is not eligible "
            f"for execution. {selection.rationale}"
        ],
        error_codes=[NO_MATCHING_TEMPLATE],
        execution_eligible=False,
    )


def _tasks_acyclic(plan: MissionPlan) -> bool:
    ids = {t.task_id for t in plan.tasks}
    indeg = {t.task_id: 0 for t in plan.tasks}
    out = {t.task_id: [] for t in plan.tasks}
    for task in plan.tasks:
        for dep in task.depends_on:
            if dep not in ids:
                return False  # dangling dependency -> treat as invalid graph
            out[dep].append(task.task_id)
            indeg[task.task_id] += 1
    ready = [tid for tid, d in indeg.items() if d == 0]
    seen = 0
    while ready:
        node = ready.pop()
        seen += 1
        for nxt in out[node]:
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                ready.append(nxt)
    return seen == len(plan.tasks)


def validate(
    plan: MissionPlan,
    agent_registry: AgentRegistry,
    tool_registry: ToolRegistry,
    template_registry: MissionTemplateRegistry,
) -> PolicyValidationResult:
    """Statically validate a MissionPlan. Never executes anything."""
    errors: List[str] = []
    warnings: List[str] = []

    # 1. Template exists and is active.
    template = None
    try:
        template = template_registry.get_active(plan.template_id)
    except RegistryError as exc:
        errors.append(f"template: {exc}")

    # 2. Dependencies reference existing tasks and are acyclic.
    task_ids = {t.task_id for t in plan.tasks}
    for task in plan.tasks:
        for dep in task.depends_on:
            if dep not in task_ids:
                errors.append(f"task {task.task_id!r} depends on unknown task {dep!r}")
    if not _tasks_acyclic(plan):
        errors.append("task dependency graph is not acyclic")

    # 3. Agents exist and are active.
    for task in plan.tasks:
        try:
            agent_registry.get_active(task.agent_id)
        except RegistryError as exc:
            errors.append(f"agent: {exc}")

    # 4. Tools exist, are active and simulation-only; and are template-allowed.
    allowed_tools = set(template.allowed_tools) if template is not None else set()
    for task in plan.tasks:
        for tool_id in task.tool_ids:
            try:
                tool = tool_registry.get_active(tool_id)
            except RegistryError as exc:
                errors.append(f"tool: {exc}")
                continue
            if tool.simulated is not True:
                errors.append(f"tool {tool_id!r} is not simulation-only (production writeback forbidden)")
            if template is not None and tool_id not in allowed_tools:
                errors.append(f"tool {tool_id!r} used by task {task.task_id!r} is not in template allowed_tools")

    # 5. Required verification checks present on the template.
    if template is not None:
        present = set(template.verification_checks)
        for required in REQUIRED_VERIFICATION_CHECKS:
            if required not in present:
                errors.append(f"missing required verification check: {required!r}")

    # 6. Human approval required (plan + definition + template).
    if plan.requires_human_approval is not True:
        errors.append("plan does not require human approval")
    if plan.mission_definition.requires_human_approval is not True:
        errors.append("mission definition does not require human approval")
    if template is not None and template.requires_human_approval is not True:
        errors.append("template does not require human approval")

    # 7. Budgets within published limits.
    b = plan.budgets
    if b.max_runtime_ms > BUDGET_LIMITS["max_runtime_ms"]:
        errors.append(
            f"budget max_runtime_ms {b.max_runtime_ms} exceeds limit {BUDGET_LIMITS['max_runtime_ms']}"
        )
    if b.max_retries > BUDGET_LIMITS["max_retries"]:
        errors.append(f"budget max_retries {b.max_retries} exceeds limit {BUDGET_LIMITS['max_retries']}")
    if b.max_cost > BUDGET_LIMITS["max_cost"]:
        errors.append(f"budget max_cost {b.max_cost} exceeds limit {BUDGET_LIMITS['max_cost']}")

    passed = not errors
    return PolicyValidationResult(
        passed=passed,
        warnings=warnings,
        errors=errors,
        execution_eligible=passed and plan.requires_human_approval is True,
    )


__all__ = [
    "NO_MATCHING_TEMPLATE",
    "PolicyValidationResult",
    "result_for_unsupported_selection",
    "validate",
]
