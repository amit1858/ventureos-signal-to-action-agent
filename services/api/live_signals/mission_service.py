"""Mission orchestration service -- Real HubSpot Signal Vertical Slice, Phase 2B.

The single deterministic entry point that turns one validated ``SignalChangeEvent``
into exactly one persisted mission, idempotently. It wires the pieces and owns the
fail-closed status contract; it holds no business rules of its own::

    SignalChangeEvent
      -> mission_selector.select_mission   (versioned rules + template)
      -> MissionRepository.add_if_absent    (idempotent, source_event_id UNIQUE)
      -> MissionSelectionResult             (mission_created | mission_exists
                                             | no_eligible_mission | selection_error)
      -> stop

No governance, no approval, no CRM write-back, no communication, no clock read
(``now`` is injected), no model, no network.
"""

from __future__ import annotations

from live_signals.contracts import SignalChangeEvent
from live_signals.mission_contracts import (
    MissionSelectionResult,
    MissionSelectionStatus,
)
from live_signals.mission_repository import MissionRepository, MissionRepositoryError
from live_signals.mission_selector import select_mission
from live_signals.mission_templates import MissionTemplateError


def generate_mission_for_event(
    event: SignalChangeEvent,
    repository: MissionRepository,
    *,
    now: str,
) -> MissionSelectionResult:
    """Deterministically generate and persist at most one mission for ``event``.

    * No matching rule            -> ``no_eligible_mission`` (nothing persisted).
    * First time for this event   -> ``mission_created`` (mission persisted).
    * Replay of the same event    -> ``mission_exists`` (existing mission returned).
    * Any persistence/template err -> ``selection_error`` (fails closed, no partial state).
    """
    try:
        selection = select_mission(event, now=now)
    except MissionTemplateError as exc:
        return MissionSelectionResult(
            status=MissionSelectionStatus.selection_error,
            mission=None,
            detail=f"template resolution failed: {exc}",
        )

    if selection.status is MissionSelectionStatus.no_eligible_mission:
        return selection

    candidate = selection.mission
    try:
        inserted = repository.add_if_absent(candidate)
        stored = repository.get_by_source_event_id(candidate.source_event_id)
    except MissionRepositoryError as exc:
        return MissionSelectionResult(
            status=MissionSelectionStatus.selection_error,
            mission=None,
            detail=f"persistence failed: {exc}",
        )

    if stored is None:  # pragma: no cover - defensive; insert-then-read must succeed
        return MissionSelectionResult(
            status=MissionSelectionStatus.selection_error,
            mission=None,
            detail="mission not durable after write.",
        )

    status = (
        MissionSelectionStatus.mission_created
        if inserted
        else MissionSelectionStatus.mission_exists
    )
    return MissionSelectionResult(status=status, mission=stored, detail=candidate.selection_reason)


__all__ = ["generate_mission_for_event"]
