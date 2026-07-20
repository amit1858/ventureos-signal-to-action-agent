"""Live-signal contracts -- Real HubSpot Signal Vertical Slice, Phase 1.

Isolated, additive, typed contracts for deterministic change detection over a
single monitored CRM field. They are kept DELIBERATELY separate from the harness
core (``harness.contracts``): HubSpot-specific change semantics must not leak into
the broadly shared mission contracts. This module imports nothing from the
harness and adds no behaviour beyond pure validation -- it is data only.

Serialisation matches the rest of the system: camelCase JSON via
``model_dump(by_alias=True)`` while Python code uses snake_case attributes, so a
``SignalChangeEvent`` can cross the Python -> TypeScript boundary in a later phase
without a reshape.

Truth boundary (unchanged by this slice): the deterministic engine remains the
authority for score/rank/eligibility/governance. A ``SignalChangeEvent`` is a
*supporting* fact about a raw CRM change -- never an authoritative decision.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

SCHEMA_VERSION = "1.0"


# -- camelCase JSON on the (future) cross-language boundary ------------------


def _to_camel(snake: str) -> str:
    """``normalized_old_value`` -> ``normalizedOldValue``."""
    head, *tail = snake.split("_")
    return head + "".join(word[:1].upper() + word[1:] for word in tail)


class LiveSignalModel(BaseModel):
    """Base for every live-signal contract.

    * Serialises to camelCase JSON (``by_alias=True``).
    * Accepts snake_case *or* camelCase on input (``populate_by_name``).

    Defined locally (not imported from the harness) so the live-signal module
    stays self-contained and the harness contracts stay free of HubSpot change
    semantics.
    """

    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)


# -- enumerations -----------------------------------------------------------


class SignalDirection(str, Enum):
    """Deterministic classification of a monitored-field change.

    ``unchanged`` is a valid detector observation but is NEVER carried on a
    ``SignalChangeEvent`` -- an event represents a real, material change only.
    """

    adverse = "adverse"      # change increases risk (renewal moved earlier)
    positive = "positive"    # change reduces risk (renewal moved later)
    unchanged = "unchanged"  # normalized values identical (no event emitted)


class DetectionStatus(str, Enum):
    """The single deterministic outcome of one detector run (fail-closed set)."""

    baseline_established = "baseline_established"
    unchanged = "unchanged"
    change_detected = "change_detected"
    invalid_input = "invalid_input"
    ambiguous_change = "ambiguous_change"
    persistence_failure = "persistence_failure"


# -- the signal change event ------------------------------------------------


class SignalChangeEvent(LiveSignalModel):
    """One deterministic, typed record of a material change to a monitored field.

    Every field is caller/deterministically supplied; ``detected_at`` is an
    injected timestamp (the detector never reads the system clock). ``event_id``
    and ``change_fingerprint`` are pure functions of identity + normalized
    values, so the same change always yields the same identifiers regardless of
    when it is (re)observed -- the basis for idempotent replay.
    """

    schema_version: str = SCHEMA_VERSION
    event_id: str
    portal_id: str
    account_id: str
    account_ref: str
    monitored_field: str
    old_value: str
    new_value: str
    direction: SignalDirection
    detected_at: str = Field(..., description="ISO-8601 timestamp, caller-injected (deterministic)")
    source: str = Field(..., description="Machine source token, e.g. 'hubspot_test'")
    source_record_type: str = Field(..., description="e.g. 'company'")
    source_record_id: str
    normalized_old_value: str
    normalized_new_value: str
    change_fingerprint: str

    @field_validator("direction")
    @classmethod
    def _direction_must_be_material(cls, value: "SignalDirection") -> "SignalDirection":
        if value is SignalDirection.unchanged:
            raise ValueError(
                "SignalChangeEvent.direction must be a material change "
                "(adverse|positive); 'unchanged' never produces an event."
            )
        return value

    @field_validator(
        "event_id", "portal_id", "account_id", "account_ref", "monitored_field",
        "old_value", "new_value", "detected_at", "source", "source_record_type",
        "source_record_id", "normalized_old_value", "normalized_new_value",
        "change_fingerprint",
    )
    @classmethod
    def _non_empty(cls, value: str) -> str:
        # Fail closed: an event never carries a blank identity/value field.
        if value is None or not str(value).strip():
            raise ValueError("required field must be a non-empty string.")
        return value


# -- durable snapshot projection --------------------------------------------


class SignalSnapshot(LiveSignalModel):
    """A read projection of one persisted snapshot row (per monitored identity).

    Exposing it never mutates the store. ``prior_normalized_value`` is ``None``
    only for a freshly established baseline that has not yet changed.
    """

    portal_id: str
    account_id: str
    source_record_id: str
    monitored_field: str
    account_ref: Optional[str] = None
    source: Optional[str] = None
    source_record_type: Optional[str] = None
    prior_raw_value: Optional[str] = None
    prior_normalized_value: Optional[str] = None
    current_raw_value: str
    current_normalized_value: str
    last_sync_at: str
    signal_change_event_id: Optional[str] = None
    change_fingerprint: Optional[str] = None
    last_processed_event_id: Optional[str] = None
    mission_id: Optional[str] = None
    writeback_id: Optional[str] = None
    created_at: str
    updated_at: str


# -- detector outcome -------------------------------------------------------


class DetectionResult(LiveSignalModel):
    """The deterministic outcome of a detector run.

    ``event`` is populated only for ``change_detected``. ``replayed`` is ``True``
    when ``change_detected`` returned a previously stored event (idempotent
    replay) rather than persisting a new one.
    """

    status: DetectionStatus
    detail: str = ""
    event: Optional[SignalChangeEvent] = None
    snapshot: Optional[SignalSnapshot] = None
    replayed: bool = False


__all__ = [
    "SCHEMA_VERSION",
    "LiveSignalModel",
    "SignalDirection",
    "DetectionStatus",
    "SignalChangeEvent",
    "SignalSnapshot",
    "DetectionResult",
]
