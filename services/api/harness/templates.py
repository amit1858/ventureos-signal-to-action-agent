"""Mission templates for the Adaptive Mission Harness (Release 2.2).

A ``MissionTemplate`` is a *declarative*, deterministic plan skeleton -- never
executable code. It names an ordered set of agent steps (each referencing a
registered protected agent and simulation-only tools), a dependency graph, the
verification checks the mission must clear, a mandatory human-approval flag, and
bounded runtime / retry / cost budgets.

Two templates are defined:

* ``renewal-risk-parallel-v1`` -- fully implemented, parallel topology.
* ``support-escalation-sequential-v1`` -- structurally complete, sequential
  topology, registered and selectable (its execution is proven only structurally
  this release).

Templates are internally validated (unique steps, acyclic dependencies, tools
drawn from ``allowed_tools``, human approval required). Cross-registry validation
(agents/tools actually registered and active, budgets within limits) is the job
of ``policy_validator.py``.
"""

from __future__ import annotations

from typing import List, Literal

from pydantic import Field, model_validator

from harness.contracts import HarnessModel

# -- template ids -----------------------------------------------------------

RENEWAL_RISK_PARALLEL_V1 = "renewal-risk-parallel-v1"
SUPPORT_ESCALATION_SEQUENTIAL_V1 = "support-escalation-sequential-v1"

# -- published budget limits (policy_validator enforces these) --------------

BUDGET_LIMITS = {
    "max_runtime_ms": 60_000,
    "max_retries": 3,
    "max_cost": 1.0,
}

# Verification checks every governed mission template must declare.
REQUIRED_VERIFICATION_CHECKS = ("evidence_sufficient", "governance_ok", "approval_present")


# -- template value objects -------------------------------------------------


class TemplateBudgets(HarnessModel):
    max_runtime_ms: int = Field(..., gt=0)
    max_retries: int = Field(..., ge=0)
    max_cost: float = Field(..., ge=0.0)


class AgentStep(HarnessModel):
    """One agent step in a mission template.

    ``agent_id`` / ``tool_ids`` are registry ids (validated against the registries
    by the policy validator). ``depends_on`` lists the ``step_id``s that must
    complete first; an empty list means the step may start immediately.
    """

    step_id: str
    agent_id: str = Field(..., description="Registered AgentEntry id (reference only)")
    description: str
    tool_ids: List[str] = Field(default_factory=list)
    depends_on: List[str] = Field(default_factory=list)


class TemplateDependency(HarnessModel):
    """A single directed dependency edge (derived from the steps)."""

    step_id: str
    requires: str


class MissionTemplate(HarnessModel):
    """A declarative, deterministic mission plan skeleton."""

    template_id: str
    version: str
    mission_type: str
    description: str
    topology: Literal["parallel", "sequential"]
    preconditions: List[str] = Field(default_factory=list)
    agent_steps: List[AgentStep]
    dependencies: List[TemplateDependency] = Field(default_factory=list)
    allowed_tools: List[str] = Field(default_factory=list)
    verification_checks: List[str] = Field(default_factory=list)
    requires_human_approval: Literal[True] = True
    budgets: TemplateBudgets
    active: bool = True

    @model_validator(mode="after")
    def _validate_structure(self) -> "MissionTemplate":
        steps = self.agent_steps
        if not steps:
            raise ValueError(f"template {self.template_id!r} has no agent steps")

        # Unique step ids.
        ids = [s.step_id for s in steps]
        if len(set(ids)) != len(ids):
            raise ValueError(f"template {self.template_id!r} has duplicate step ids")
        id_set = set(ids)

        # depends_on must reference existing steps; tools must be allowed.
        allowed = set(self.allowed_tools)
        for step in steps:
            for dep in step.depends_on:
                if dep not in id_set:
                    raise ValueError(
                        f"template {self.template_id!r} step {step.step_id!r} depends on unknown step {dep!r}"
                    )
            for tool in step.tool_ids:
                if tool not in allowed:
                    raise ValueError(
                        f"template {self.template_id!r} step {step.step_id!r} uses tool {tool!r} "
                        f"not in allowed_tools"
                    )

        # Acyclic dependency graph (Kahn).
        if _has_cycle(steps):
            raise ValueError(f"template {self.template_id!r} dependency graph has a cycle")

        # Human approval is non-negotiable.
        if self.requires_human_approval is not True:
            raise ValueError(f"template {self.template_id!r} must require human approval")

        # Derive the canonical dependency edge list from the steps (single source
        # of truth), overwriting whatever was supplied.
        object.__setattr__(
            self,
            "dependencies",
            [TemplateDependency(step_id=s.step_id, requires=dep) for s in steps for dep in s.depends_on],
        )
        return self


def _has_cycle(steps: List[AgentStep]) -> bool:
    graph = {s.step_id: list(s.depends_on) for s in steps}
    outdeg = {sid: [] for sid in graph}
    indeg = {sid: 0 for sid in graph}
    for sid, deps in graph.items():
        for dep in deps:
            outdeg[dep].append(sid)
            indeg[sid] += 1
    queue = sorted([sid for sid, d in indeg.items() if d == 0])
    visited = 0
    while queue:
        node = queue.pop(0)
        visited += 1
        for nxt in sorted(outdeg[node]):
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                queue.append(nxt)
        queue.sort()
    return visited != len(graph)


# -- concrete templates -----------------------------------------------------


def renewal_risk_parallel_v1() -> MissionTemplate:
    """Fully-implemented renewal-risk mission (parallel analysis fan-out)."""
    return MissionTemplate(
        template_id=RENEWAL_RISK_PARALLEL_V1,
        version="1.0",
        mission_type="renewal_risk",
        description="Protect an at-risk renewal via parallel health/opportunity analysis, "
        "governed action prep and stakeholder communication.",
        topology="parallel",
        preconditions=["canonical_account_resolved", "renewal_signal_present"],
        agent_steps=[
            AgentStep(step_id="ingest", agent_id="signal_ingestion",
                      description="Normalise the renewal-risk signal.", depends_on=[]),
            AgentStep(step_id="health", agent_id="account_health",
                      description="Assess account health.", depends_on=["ingest"]),
            AgentStep(step_id="opportunity", agent_id="opportunity",
                      description="Assess renewal / expansion opportunity.", depends_on=["ingest"]),
            AgentStep(step_id="governance", agent_id="governance",
                      description="Apply governance policy and approval gating.",
                      depends_on=["health", "opportunity"]),
            AgentStep(step_id="action", agent_id="action",
                      description="Prepare the simulated renewal outreach.",
                      tool_ids=["simulate_renewal_outreach"], depends_on=["governance"]),
            AgentStep(step_id="communicate", agent_id="communication",
                      description="Compose the stakeholder communication.",
                      tool_ids=["simulate_stakeholder_brief"], depends_on=["action"]),
        ],
        allowed_tools=["simulate_renewal_outreach", "simulate_stakeholder_brief"],
        verification_checks=["evidence_sufficient", "governance_ok", "account_matched", "approval_present"],
        budgets=TemplateBudgets(max_runtime_ms=45_000, max_retries=2, max_cost=0.5),
        active=True,
    )


def support_escalation_sequential_v1() -> MissionTemplate:
    """Structurally-complete support-escalation mission (strict sequential chain)."""
    return MissionTemplate(
        template_id=SUPPORT_ESCALATION_SEQUENTIAL_V1,
        version="1.0",
        mission_type="support_escalation",
        description="Escalate a critical support situation through a strict sequential "
        "chain with governed action prep and stakeholder communication.",
        topology="sequential",
        preconditions=["canonical_account_resolved", "support_escalation_signal_present"],
        agent_steps=[
            AgentStep(step_id="ingest", agent_id="signal_ingestion",
                      description="Normalise the support-escalation signal.", depends_on=[]),
            AgentStep(step_id="health", agent_id="account_health",
                      description="Assess account health impact.", depends_on=["ingest"]),
            AgentStep(step_id="governance", agent_id="governance",
                      description="Apply governance policy and approval gating.", depends_on=["health"]),
            AgentStep(step_id="action", agent_id="action",
                      description="Prepare the simulated support escalation.",
                      tool_ids=["simulate_support_escalation"], depends_on=["governance"]),
            AgentStep(step_id="communicate", agent_id="communication",
                      description="Compose the stakeholder communication.",
                      tool_ids=["simulate_stakeholder_brief"], depends_on=["action"]),
        ],
        allowed_tools=["simulate_support_escalation", "simulate_stakeholder_brief"],
        verification_checks=["evidence_sufficient", "governance_ok", "approval_present"],
        budgets=TemplateBudgets(max_runtime_ms=45_000, max_retries=2, max_cost=0.5),
        active=True,
    )


def default_template_registry():
    """A fresh MissionTemplateRegistry populated with both templates."""
    from harness.registries import MissionTemplateRegistry

    reg = MissionTemplateRegistry()
    reg.register(renewal_risk_parallel_v1())
    reg.register(support_escalation_sequential_v1())
    return reg


__all__ = [
    "RENEWAL_RISK_PARALLEL_V1",
    "SUPPORT_ESCALATION_SEQUENTIAL_V1",
    "BUDGET_LIMITS",
    "REQUIRED_VERIFICATION_CHECKS",
    "TemplateBudgets",
    "AgentStep",
    "TemplateDependency",
    "MissionTemplate",
    "renewal_risk_parallel_v1",
    "support_escalation_sequential_v1",
    "default_template_registry",
]
