"""Deterministic mission selector -- Real HubSpot Signal Vertical Slice, Phase 2B.

Pure selection mechanics ONLY. This module holds no business rules and no priority
policy -- it consumes the versioned registries in ``mission_rules`` and renders the
versioned framing from ``mission_templates``. Given one ``SignalChangeEvent`` it
either builds exactly one deterministic ``LiveMission`` candidate or reports
``no_eligible_mission``. It never persists, never reads a clock (``now`` is injected),
never calls a model, and never touches the network.

``mission_id`` is a pure function of ``source_event_id`` so the same event always maps
to the same mission -- the identity that makes generation idempotent downstream.
"""

from __future__ import annotations

import hashlib

from live_signals.contracts import SignalChangeEvent
from live_signals.mission_contracts import (
    EvidenceRef,
    LiveMission,
    MissionSelectionResult,
    MissionSelectionStatus,
    MissionStatus,
)
from live_signals import mission_rules, mission_templates


def derive_mission_id(source_event_id: str) -> str:
    """Deterministic mission identity: ``MSN-`` + first 16 hex of sha256(event id)."""
    digest = hashlib.sha256(source_event_id.encode("utf-8")).hexdigest()
    return "MSN-" + digest[:16]


def select_mission(event: SignalChangeEvent, *, now: str) -> MissionSelectionResult:
    """Deterministically build a mission candidate for one change event.

    Returns a result with status ``mission_created`` and a populated ``mission`` when
    a rule matches, or ``no_eligible_mission`` (mission ``None``) otherwise. Persistence
    and idempotency are the caller's concern (``mission_service``)."""
    direction = event.direction.value if event.direction is not None else ""
    rule = mission_rules.resolve_rule(event.monitored_field, direction)
    if rule is None:
        return MissionSelectionResult(
            status=MissionSelectionStatus.no_eligible_mission,
            mission=None,
            detail=(
                f"no rule for monitored_field={event.monitored_field!r} "
                f"direction={direction!r}"
            ),
        )

    template = mission_templates.get_template(rule.template_id, rule.template_version)

    days_earlier = mission_rules.adverse_days_earlier(
        event.normalized_old_value, event.normalized_new_value
    )
    movement = days_earlier if days_earlier is not None else 0
    priority = mission_rules.priority_for_days_earlier(movement)

    evidence = EvidenceRef(
        event_id=event.event_id,
        change_fingerprint=event.change_fingerprint,
        monitored_field=event.monitored_field,
        normalized_old_value=event.normalized_old_value,
        normalized_new_value=event.normalized_new_value,
        source_record_type=event.source_record_type,
        source_record_id=event.source_record_id,
    )

    title = template.render_title(
        account_ref=event.account_ref,
        old=event.normalized_old_value,
        new=event.normalized_new_value,
    )

    selection_reason = (
        f"{event.monitored_field} moved {movement} day(s) earlier ({direction}); "
        f"matched rule {rule.rule_id}/{rule.rule_version} -> {rule.mission_type}; "
        f"priority {priority.value} via policy {mission_rules.PRIORITY_POLICY_VERSION}."
    )

    mission = LiveMission(
        mission_id=derive_mission_id(event.event_id),
        mission_type=rule.mission_type,
        account_id=event.account_id,
        portal_id=event.portal_id,
        source_event_id=event.event_id,
        change_fingerprint=event.change_fingerprint,
        title=title,
        objective=template.objective,
        recommended_next_step=template.recommended_next_step,
        evidence_refs=[evidence],
        priority=priority,
        status=MissionStatus.generated,
        selection_reason=selection_reason,
        rule_id=rule.rule_id,
        rule_version=rule.rule_version,
        template_id=template.template_id,
        template_version=template.template_version,
        created_at=now,
    )

    return MissionSelectionResult(
        status=MissionSelectionStatus.mission_created,
        mission=mission,
        detail=selection_reason,
    )


__all__ = ["derive_mission_id", "select_mission"]
