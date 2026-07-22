"""Versioned deterministic rule registry -- Real HubSpot Signal Vertical Slice, Phase 2B.

This is the SINGLE source of mission-eligibility and priority policy. It is kept
deliberately separate from the selector so business rules can be added or reversioned
without touching selection mechanics. Everything here is deterministic and LLM-free:
matching is exact-equality on ``(monitored_field, direction)`` and priority is a pure
function of adverse day movement.

Phase 2B ships exactly one configured rule::

    monitored_field = renewal_date
    direction       = adverse
    -> mission_type = renewal_risk
    -> template     = renewal_risk / v1
    -> priority     = derived from how many days earlier the renewal moved

Adding another field/rule = append a ``MissionRule`` to ``_RULES``; the selector,
repository and service do not change.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import List, Optional, Tuple

from live_signals.mission_contracts import MissionPriority

#: Version of the proof-scoped priority policy below. Bump when thresholds change.
#: NOTE: these thresholds are PROOF-SCOPED, VERSIONED policy for the vertical-slice
#: demo -- NOT permanent business rules.
PRIORITY_POLICY_VERSION = "v1"


@dataclass(frozen=True)
class MissionRule:
    """One deterministic eligibility rule mapping a signal to a mission type.

    Matched by exact equality on ``monitored_field`` + ``direction``. Carries the
    versioned mission type and the template coordinates to render it."""

    rule_id: str
    rule_version: str
    monitored_field: str
    direction: str  # "adverse" | "positive"
    mission_type: str
    template_id: str
    template_version: str


#: The one configured Phase 2B rule. Append siblings to extend -- no selector change.
RENEWAL_ADVERSE_RULE = MissionRule(
    rule_id="R-RENEWAL-ADVERSE",
    rule_version="v1",
    monitored_field="renewal_date",
    direction="adverse",
    mission_type="renewal_risk",
    template_id="renewal_risk",
    template_version="v1",
)

_RULES: List[MissionRule] = [RENEWAL_ADVERSE_RULE]


def resolve_rule(monitored_field: str, direction: str) -> Optional[MissionRule]:
    """Return the deterministic rule for a signal, or ``None`` when no rule matches.

    ``None`` is an explicit, supported outcome (the service returns
    ``no_eligible_mission``); a mission is never fabricated for an unmatched signal."""
    field = (monitored_field or "").strip()
    dir_ = (direction or "").strip()
    for rule in _RULES:
        if rule.monitored_field == field and rule.direction == dir_:
            return rule
    return None


def _parse_iso_date(value: str) -> Optional[date]:
    try:
        return date.fromisoformat((value or "").strip())
    except (ValueError, TypeError):
        return None


def adverse_days_earlier(normalized_old_value: str, normalized_new_value: str) -> Optional[int]:
    """Whole days the value moved EARLIER (old - new). Positive = adverse movement.

    Returns ``None`` if either value is not an ISO date. A non-positive result means
    the value did not move earlier (not an adverse-date movement)."""
    old = _parse_iso_date(normalized_old_value)
    new = _parse_iso_date(normalized_new_value)
    if old is None or new is None:
        return None
    return (old - new).days


def priority_for_days_earlier(days_earlier: int) -> MissionPriority:
    """Proof-scoped, versioned priority policy (``PRIORITY_POLICY_VERSION``):

    * 1-30 days earlier   -> medium
    * 31-90 days earlier  -> high
    * more than 90 days   -> critical

    Non-positive input (no earlier movement) is treated as the lowest bucket; the
    selector only invokes this for a matched adverse-date rule."""
    if days_earlier > 90:
        return MissionPriority.critical
    if days_earlier >= 31:
        return MissionPriority.high
    return MissionPriority.medium


def registry() -> Tuple[MissionRule, ...]:
    """Read-only view of the configured rules (for tests/inspection)."""
    return tuple(_RULES)


__all__ = [
    "PRIORITY_POLICY_VERSION",
    "MissionRule",
    "RENEWAL_ADVERSE_RULE",
    "resolve_rule",
    "adverse_days_earlier",
    "priority_for_days_earlier",
    "registry",
]
