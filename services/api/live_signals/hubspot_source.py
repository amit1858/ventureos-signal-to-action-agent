"""HubSpot provider for the live-signal observation core -- Phase 2A.

This is the FIRST (and today only) concrete :class:`MonitoredFieldSource`: it
adapts a read-only HubSpot ``CompanyReader`` (a single ``get_company`` GET) into
the provider-neutral observation interface defined in ``live_signals.observation``.

It generates NO mission, calls NO selector/planner/governance/action, and writes
NOTHING back to HubSpot. It depends only on the narrow read-only ``CompanyReader``
surface, so it is structurally unable to reach any connector write method
(``create_task`` / ``create_note``). All fail-closed gating and detector
invocation live in the neutral core; this module only knows how to read one
HubSpot Company property.

Adding another CRM later means writing a sibling ``*Source`` that implements
``MonitoredFieldSource`` -- the deterministic detector and the observation core
do not change.
"""

from __future__ import annotations

from typing import List, Optional, Protocol, runtime_checkable

from live_signals.contracts import DetectionResult
from live_signals.detector import DEFAULT_SOURCE, RENEWAL_DATE
from live_signals.observation import (
    LiveSignalSourceError,
    MonitoredFieldSource,
    RawObservation,
    observe_monitored_field,
)
from live_signals.repository import SignalSnapshotRepository
from live_signals.settings import LiveSignalSettings


@runtime_checkable
class CompanyReader(Protocol):
    """The narrow, read-only HubSpot surface this provider is allowed to use.

    Deliberately exposes ONLY a single GET-style method. The concrete
    ``HubSpotConnector`` satisfies this structurally, but this provider -- typed
    against the Protocol -- cannot see or call any write method."""

    def get_company(self, company_id: str, properties: Optional[List[str]] = None) -> dict:
        ...


class HubSpotCompanySource:
    """Adapts a read-only ``CompanyReader`` to the neutral ``MonitoredFieldSource``.

    Reads exactly one Company property via a single GET and returns a provider-
    neutral :class:`RawObservation`. It never seeds, updates, or writes anything."""

    provider = "hubspot"

    def __init__(self, reader: CompanyReader) -> None:
        self._reader = reader

    def fetch(self, *, account_id: str, monitored_property: str) -> RawObservation:
        try:
            data = self._reader.get_company(account_id, [monitored_property])
        except Exception as exc:  # noqa: BLE001 - fail closed with a safe message
            safe = getattr(exc, "message", None)
            raise LiveSignalSourceError(
                f"HubSpot read failed: {safe}" if safe else "HubSpot read failed."
            ) from exc

        # Missing / blank / unexpected shapes yield raw_value=None; the frozen
        # detector then fails closed with invalid_input (single normalization
        # authority). We never guess a value here.
        props = data.get("properties") if isinstance(data, dict) else None
        raw = props.get(monitored_property) if isinstance(props, dict) else None
        record_id = ""
        if isinstance(data, dict):
            record_id = str(data.get("id") or "").strip()
        if not record_id:
            record_id = (account_id or "").strip()
        return RawObservation(raw_value=raw, record_id=record_id, record_type="company")


def observe_renewal(
    *,
    reader: CompanyReader,
    settings: LiveSignalSettings,
    portal_id: str,
    account_id: str,
    account_ref: str,
    detected_at: str,
    repository: Optional[SignalSnapshotRepository] = None,
    source: str = DEFAULT_SOURCE,
) -> DetectionResult:
    """HubSpot renewal entry point: wrap the read-only reader as a neutral
    ``MonitoredFieldSource`` and delegate to :func:`observe_monitored_field`.

    Kept as a thin convenience so HubSpot callers have a single obvious function;
    the monitored property is taken from ``settings.monitored_property`` (env
    ``LIVE_SIGNAL_MONITORED_PROPERTY``). New providers should call
    :func:`observe_monitored_field` directly with their own source."""
    return observe_monitored_field(
        source=HubSpotCompanySource(reader),
        settings=settings,
        portal_id=portal_id,
        account_id=account_id,
        account_ref=account_ref,
        detected_at=detected_at,
        monitored_field=RENEWAL_DATE,
        detector_source=source,
        repository=repository,
    )


__all__ = [
    "CompanyReader",
    "HubSpotCompanySource",
    "LiveSignalSourceError",
    "observe_renewal",
]
