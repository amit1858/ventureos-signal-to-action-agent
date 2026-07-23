"""Live-signals module -- Real HubSpot Signal Vertical Slice (Phase 1).

Isolated, additive, deterministic change-detection foundation. It contains NO
live HubSpot call, NO CRM write, NO UI, and touches NO protected engine. It sits
*before* the harness in the typed flow:

    SignalChangeEvent -> (Phase 2) AccountContext -> SourceAccountRecord
    -> CanonicalAccountRef -> MissionDefinition -> ...

Public surface:

* Contracts:  ``SignalChangeEvent``, ``SignalSnapshot``, ``DetectionResult``,
  ``SignalDirection``, ``DetectionStatus``.
* Repository: ``SignalSnapshotRepository`` (durable SQLite) + ``SignalRepositoryError``.
* Detector:   ``SignalDetector``, ``to_selector_signals``, ``change_fingerprint``,
  ``event_id_for`` and the known monitored-field constants.
"""

from __future__ import annotations

from live_signals.contracts import (
    SCHEMA_VERSION,
    DetectionResult,
    DetectionStatus,
    LiveSignalModel,
    SignalChangeEvent,
    SignalDirection,
    SignalSnapshot,
)
from live_signals.detector import (
    DEFAULT_SOURCE,
    RENEWAL_DATE,
    SUPPORT_ESCALATION,
    FieldSpec,
    NormalizationError,
    SignalDetector,
    change_fingerprint,
    event_id_for,
    to_selector_signals,
)
from live_signals.repository import SignalRepositoryError, SignalSnapshotRepository

__all__ = [
    "SCHEMA_VERSION",
    "LiveSignalModel",
    "SignalDirection",
    "DetectionStatus",
    "SignalChangeEvent",
    "SignalSnapshot",
    "DetectionResult",
    "SignalSnapshotRepository",
    "SignalRepositoryError",
    "SignalDetector",
    "NormalizationError",
    "FieldSpec",
    "RENEWAL_DATE",
    "SUPPORT_ESCALATION",
    "DEFAULT_SOURCE",
    "change_fingerprint",
    "event_id_for",
    "to_selector_signals",
]
