"""Deterministic mission contracts -- Real HubSpot Signal Vertical Slice, Phase 2B.

Additive and self-contained: these types describe how exactly ONE validated
``SignalChangeEvent`` becomes exactly ONE guided mission. They import nothing from
the harness and deliberately do NOT reuse ``harness.contracts.MissionDefinition``
(that model is coupled to governance/approval/execution, which is out of Phase 2B
scope). HubSpot change semantics never leak into the shared mission contracts, and
mission semantics never leak back into the frozen Phase 1 contracts.

A ``LiveMission`` is a *supporting business plan* derived deterministically from
evidence. It carries NO execution authority: ``recommended_next_step`` is advisory
text only, and the mission never approves, permits, or triggers any action. Human
approval and governance remain later, separate phases.
"""

from __future__ import annotations

from enum import Enum
from typing import List

from pydantic import BaseModel, ConfigDict, Field, field_validator

SCHEMA_VERSION = "1.0"


def _to_camel(snake: str) -> str:
    """``template_version`` -> ``templateVersion`` (matches the live-signal boundary)."""
    head, *tail = snake.split("_")
    return head + "".join(word[:1].upper() + word[1:] for word in tail)


class MissionModel(BaseModel):
    """Base for every Phase 2B mission contract.

    Serialises to camelCase JSON (``by_alias=True``) and accepts either casing on
    input, mirroring the Phase 1 ``LiveSignalModel`` so a mission can cross the
    Python -> TypeScript boundary later without a reshape."""

    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)


class MissionPriority(str, Enum):
    """Proof-scoped priority derived deterministically from adverse day movement.

    These are PROOF-SCOPED, VERSIONED policy buckets (see ``mission_rules``), not
    permanent business rules."""

    medium = "medium"
    high = "high"
    critical = "critical"


class MissionStatus(str, Enum):
    """Phase 2B mission lifecycle -- intentionally minimal.

    A mission is only ever ``generated`` in Phase 2B: it is created and then stops,
    awaiting a later (separate) governance/approval phase. No further lifecycle
    states are introduced here."""

    generated = "generated"


class MissionSelectionStatus(str, Enum):
    """The deterministic outcome of a mission-generation attempt (fail-closed set)."""

    mission_created = "mission_created"
    mission_exists = "mission_exists"
    no_eligible_mission = "no_eligible_mission"
    selection_error = "selection_error"


class EvidenceRef(MissionModel):
    """A structured, one-directional link back to the source evidence.

    The mission *references* the ``SignalChangeEvent`` -- it copies provenance,
    never authority, and never mutates the event or its snapshot."""

    event_id: str
    change_fingerprint: str
    monitored_field: str
    normalized_old_value: str
    normalized_new_value: str
    source_record_type: str
    source_record_id: str


class LiveMission(MissionModel):
    """One deterministic guided mission derived from one ``SignalChangeEvent``.

    Every field is a pure function of the event plus the versioned rule/template --
    no LLM, no clock read inside logic (``created_at`` is injected). ``mission_id``
    is derived from ``source_event_id`` so the same event always yields the same
    mission (idempotent identity)."""

    schema_version: str = SCHEMA_VERSION
    mission_id: str
    mission_type: str
    account_id: str
    portal_id: str
    source_event_id: str
    change_fingerprint: str
    title: str
    objective: str
    #: Advisory next step ONLY. Carries no execution authority and permits nothing.
    recommended_next_step: str
    evidence_refs: List[EvidenceRef] = Field(default_factory=list)
    priority: MissionPriority
    status: MissionStatus = MissionStatus.generated
    selection_reason: str
    rule_id: str
    rule_version: str
    template_id: str
    template_version: str
    created_at: str = Field(..., description="ISO-8601 timestamp, caller-injected (deterministic)")

    @field_validator("status")
    @classmethod
    def _status_is_generated(cls, value: "MissionStatus") -> "MissionStatus":
        # Phase 2B never advances a mission past 'generated'; downstream lifecycle
        # (governance/approval) is a separate, later phase.
        if value is not MissionStatus.generated:
            raise ValueError("Phase 2B LiveMission.status must be 'generated'.")
        return value

    @field_validator(
        "mission_id", "mission_type", "account_id", "portal_id", "source_event_id",
        "change_fingerprint", "title", "objective", "recommended_next_step",
        "selection_reason", "rule_id", "rule_version", "template_id",
        "template_version", "created_at",
    )
    @classmethod
    def _non_empty(cls, value: str) -> str:
        # Fail closed: a mission never carries a blank identity/plan field.
        if value is None or not str(value).strip():
            raise ValueError("required field must be a non-empty string.")
        return value


class MissionSelectionResult(MissionModel):
    """The deterministic result of generating a mission for one event.

    Exactly one status. ``mission`` is present for ``mission_created`` and
    ``mission_exists``; absent for ``no_eligible_mission`` and ``selection_error``.
    ``detail`` is always safe to surface (no secrets)."""

    status: MissionSelectionStatus
    mission: "LiveMission | None" = None
    detail: str = ""


__all__ = [
    "SCHEMA_VERSION",
    "MissionModel",
    "MissionPriority",
    "MissionStatus",
    "MissionSelectionStatus",
    "EvidenceRef",
    "LiveMission",
    "MissionSelectionResult",
]
