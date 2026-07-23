"""Provider-neutral observation core -- Real HubSpot Signal Vertical Slice, Phase 2A.

The deterministic Phase 1 :class:`SignalDetector` is already CRM-agnostic: it
consumes a normalized raw value plus an injected identity/timestamp and knows
nothing about HubSpot. This module keeps the *observation* layer equally neutral,
so additional CRM providers can be added later WITHOUT changing the detector.

Shape:

* a provider implements the narrow :class:`MonitoredFieldSource` interface --
  "fetch the current raw value of one monitored property for one account/record",
* :func:`observe_monitored_field` applies the fail-closed gates (enabled,
  account/portal allow-lists, durable store) in a fixed order and then invokes the
  frozen detector.

HubSpot is merely the FIRST ``MonitoredFieldSource`` implementation
(``hubspot_source.HubSpotCompanySource``). A future Salesforce/Dynamics provider
is a new source class only -- this module and the detector stay untouched. This
module therefore imports NOTHING CRM-specific.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol, runtime_checkable

from live_signals.contracts import DetectionResult
from live_signals.detector import DEFAULT_SOURCE, RENEWAL_DATE, SignalDetector
from live_signals.repository import SignalRepositoryError, SignalSnapshotRepository
from live_signals.settings import LiveSignalSettings


class LiveSignalSourceError(RuntimeError):
    """An observation was refused or could not complete -- fail closed.

    The message is always safe to surface (no token, no environment). No
    ``SignalChangeEvent`` is emitted and no snapshot advances when raised."""


@dataclass(frozen=True)
class RawObservation:
    """A provider-neutral raw reading of one monitored field for one record.

    ``raw_value`` is the UNNORMALIZED value exactly as the source exposed it (or
    ``None`` when absent/blank); the frozen detector performs all normalization
    and classification. ``record_id`` / ``record_type`` let the detector key its
    durable snapshot to the specific source record."""

    raw_value: Optional[str]
    record_id: str
    record_type: str = "record"


@runtime_checkable
class MonitoredFieldSource(Protocol):
    """The narrow, provider-neutral READ boundary the orchestrator depends on.

    A provider (HubSpot today, another CRM later) implements exactly this: fetch
    the current raw value of one monitored *property* for one account/record. The
    interface exposes NO write capability, so the observation path is structurally
    read-only regardless of provider. ``provider`` is a short machine token used
    only for labelling/provenance (never authority)."""

    provider: str

    def fetch(self, *, account_id: str, monitored_property: str) -> RawObservation:
        ...


def observe_monitored_field(
    *,
    source: MonitoredFieldSource,
    settings: LiveSignalSettings,
    portal_id: str,
    account_id: str,
    account_ref: str,
    detected_at: str,
    monitored_field: str = RENEWAL_DATE,
    detector_source: str = DEFAULT_SOURCE,
    repository: Optional[SignalSnapshotRepository] = None,
) -> DetectionResult:
    """Read one monitored value from any provider and run the frozen detector.

    Fail-closed ordering (each guard refuses before doing more work):

    1. the slice must be enabled,
    2. the account must be account-allow-listed -- BEFORE any provider read,
    3. the portal must be portal-allow-listed -- BEFORE the read,
    4. a durable snapshot path + monitored property must be configured.

    ``monitored_field`` is the detector's SEMANTIC field key (e.g. ``renewal_date``);
    ``settings.monitored_property`` is the provider-specific PROPERTY NAME to read
    (e.g. ``s2a_renewal_date``) -- the two are intentionally distinct so the
    property is configurable without changing detector semantics. ``detected_at``
    is an INJECTED timestamp (the detector never reads the clock). Returns exactly
    one :class:`DetectionResult`; raises :class:`LiveSignalSourceError` on any
    fail-closed guard or provider read failure. Never writes to any CRM.
    """
    if not settings.enabled:
        raise LiveSignalSourceError(
            "live signals are disabled (set LIVE_SIGNALS_ENABLED=true to enable)."
        )
    if not settings.account_allowed(account_id):
        raise LiveSignalSourceError(
            "requested account is not on the live-signal account allow-list."
        )
    if not settings.portal_allowed(portal_id):
        raise LiveSignalSourceError(
            "portal is not on the live-signal portal allow-list."
        )
    if not settings.db_path:
        raise LiveSignalSourceError(
            "no durable snapshot path is configured (set LIVE_SIGNALS_DB_PATH)."
        )
    prop = (settings.monitored_property or "").strip()
    if not prop:
        raise LiveSignalSourceError("no monitored property is configured.")

    own_repo = repository is None
    if own_repo:
        try:
            repository = SignalSnapshotRepository(settings.db_path)
        except SignalRepositoryError as exc:
            raise LiveSignalSourceError(f"snapshot store unavailable: {exc}") from exc

    try:
        # Exactly one provider read for the configured monitored property.
        try:
            observation = source.fetch(account_id=account_id, monitored_property=prop)
        except LiveSignalSourceError:
            raise
        except Exception as exc:  # noqa: BLE001 - fail closed with a safe message
            safe = getattr(exc, "message", None)
            raise LiveSignalSourceError(
                f"source read failed: {safe}" if safe else "source read failed."
            ) from exc

        raw_value = "" if observation.raw_value is None else str(observation.raw_value)
        record_id = (observation.record_id or "").strip() or (account_id or "").strip()
        record_type = observation.record_type or "record"

        # Frozen Phase 1 detector -- the single normalization/classification
        # authority. It persists the baseline or emits exactly one event.
        detector = SignalDetector(repository)
        return detector.detect(
            portal_id=portal_id,
            account_id=account_id,
            account_ref=account_ref,
            monitored_field=monitored_field,
            source_record_type=record_type,
            source_record_id=record_id,
            raw_value=raw_value,
            detected_at=detected_at,
            source=detector_source,
        )
    finally:
        if own_repo and repository is not None:
            repository.close()


__all__ = [
    "LiveSignalSourceError",
    "RawObservation",
    "MonitoredFieldSource",
    "observe_monitored_field",
]
