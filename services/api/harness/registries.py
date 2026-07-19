"""Deterministic registries for the Adaptive Mission Harness (Release 2.2).

Three read-only registries -- for mission templates, agents and tools -- with
deterministic registration order, duplicate/unknown rejection, and active/inactive
state. They perform NO dynamic code loading and allow NO arbitrary agent or tool
creation: every entry is a pre-defined, fully-formed value object.

* ``AgentRegistry`` entries *reference* the PROTECTED 6-agent orchestrator's
  agents by their canonical name. They never import, instantiate, wrap or modify
  a protected agent -- they are pure references used for planning and validation.
* ``ToolRegistry`` entries are simulation-only for this release: ``simulated`` is
  a hard ``True`` invariant, so no registered tool can ever describe a real write.
* ``MissionTemplateRegistry`` holds ``MissionTemplate`` value objects (defined in
  ``templates.py``). It is typed structurally to avoid an import cycle.

This module is additive and touches no protected engine.
"""

from __future__ import annotations

from typing import Dict, Generic, List, Protocol, TypeVar, runtime_checkable

from pydantic import Field, field_validator

from harness.contracts import HarnessModel


# -- registry errors --------------------------------------------------------


class RegistryError(ValueError):
    """Base class for all registry violations."""


class DuplicateIdError(RegistryError):
    """Raised when registering an id that already exists."""


class UnknownIdError(RegistryError):
    """Raised when looking up an id that was never registered."""


class InactiveError(RegistryError):
    """Raised when an active-only lookup hits an inactive entry."""


# -- registry entry value objects -------------------------------------------


class AgentEntry(HarnessModel):
    """A reference to a PROTECTED orchestrator agent.

    ``protected_agent_name`` must match a name in the protected ``AGENT_SEQUENCE``.
    No callable or class is stored -- this is a reference only.
    """

    agent_id: str = Field(..., description="Stable harness-side agent id (slug)")
    protected_agent_name: str = Field(..., description="Canonical name of the protected agent (reference only)")
    description: str
    active: bool = True


class ToolEntry(HarnessModel):
    """A simulation-only tool available to missions this release."""

    tool_id: str
    description: str
    simulated: bool = True
    active: bool = True

    @field_validator("simulated")
    @classmethod
    def _must_be_simulated(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("ToolEntry.simulated must be True (Release 2.2 tools are simulation-only).")
        return value


@runtime_checkable
class _Registrable(Protocol):
    """Structural type every registry entry satisfies (id + active flag)."""

    active: bool

    def entry_id(self) -> str:  # pragma: no cover - protocol only
        ...


@runtime_checkable
class TemplateLike(Protocol):
    """Structural type for a mission template (avoids importing templates.py)."""

    template_id: str
    version: str
    active: bool


T = TypeVar("T")


# -- generic registry base --------------------------------------------------


class _Registry(Generic[T]):
    """Insertion-ordered, read-only registry with strict id handling."""

    def __init__(self, id_getter, active_getter, label: str) -> None:
        self._items: Dict[str, T] = {}
        self._order: List[str] = []
        self._id_of = id_getter
        self._active_of = active_getter
        self._label = label

    def register(self, entry: T) -> T:
        entry_id = self._id_of(entry)
        if entry_id in self._items:
            raise DuplicateIdError(f"{self._label} id already registered: {entry_id!r}")
        self._items[entry_id] = entry
        self._order.append(entry_id)
        return entry

    def register_all(self, entries) -> None:
        for entry in entries:
            self.register(entry)

    def get(self, entry_id: str) -> T:
        if entry_id not in self._items:
            raise UnknownIdError(f"unknown {self._label} id: {entry_id!r}")
        return self._items[entry_id]

    def get_active(self, entry_id: str) -> T:
        entry = self.get(entry_id)
        if not self._active_of(entry):
            raise InactiveError(f"{self._label} id is inactive: {entry_id!r}")
        return entry

    def list(self) -> List[T]:
        """All entries in deterministic registration order."""
        return [self._items[i] for i in self._order]

    def list_active(self) -> List[T]:
        return [self._items[i] for i in self._order if self._active_of(self._items[i])]

    def ids(self) -> List[str]:
        return list(self._order)

    def __contains__(self, entry_id: str) -> bool:
        return entry_id in self._items

    def __len__(self) -> int:
        return len(self._order)


class MissionTemplateRegistry(_Registry["TemplateLike"]):
    def __init__(self) -> None:
        super().__init__(lambda t: t.template_id, lambda t: t.active, "template")


class AgentRegistry(_Registry[AgentEntry]):
    def __init__(self) -> None:
        super().__init__(lambda a: a.agent_id, lambda a: a.active, "agent")


class ToolRegistry(_Registry[ToolEntry]):
    def __init__(self) -> None:
        super().__init__(lambda t: t.tool_id, lambda t: t.active, "tool")


# -- canonical agent references (PROTECTED AGENT_SEQUENCE) -------------------

# agent_id -> protected agent canonical name. These mirror the protected
# orchestrator's AGENT_SEQUENCE and are references only.
PROTECTED_AGENTS = (
    ("signal_ingestion", "Signal Ingestion Agent", "Ingests and normalises the triggering signal."),
    ("account_health", "Account Health Agent", "Assesses account health and risk posture."),
    ("opportunity", "Opportunity Agent", "Surfaces renewal / expansion opportunities."),
    ("governance", "Governance Agent", "Applies governance policy and approval gating."),
    ("action", "Action Agent", "Prepares the governed, simulation-only action."),
    ("communication", "Communication Agent", "Composes the stakeholder-facing communication."),
)

# Simulation-only tools available to missions this release.
SIMULATION_TOOLS = (
    ("simulate_renewal_outreach", "Prepare a simulated renewal-risk outreach package."),
    ("simulate_support_escalation", "Prepare a simulated support-escalation package."),
    ("simulate_stakeholder_brief", "Prepare a simulated internal stakeholder brief."),
)


def default_agent_registry() -> AgentRegistry:
    """A fresh AgentRegistry populated with the protected-agent references."""
    reg = AgentRegistry()
    reg.register_all(
        AgentEntry(agent_id=aid, protected_agent_name=name, description=desc)
        for aid, name, desc in PROTECTED_AGENTS
    )
    return reg


def default_tool_registry() -> ToolRegistry:
    """A fresh ToolRegistry populated with the simulation-only tools."""
    reg = ToolRegistry()
    reg.register_all(ToolEntry(tool_id=tid, description=desc) for tid, desc in SIMULATION_TOOLS)
    return reg


__all__ = [
    "RegistryError",
    "DuplicateIdError",
    "UnknownIdError",
    "InactiveError",
    "AgentEntry",
    "ToolEntry",
    "TemplateLike",
    "MissionTemplateRegistry",
    "AgentRegistry",
    "ToolRegistry",
    "PROTECTED_AGENTS",
    "SIMULATION_TOOLS",
    "default_agent_registry",
    "default_tool_registry",
]
