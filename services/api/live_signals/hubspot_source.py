"""Live HubSpot renewal-observation adapter -- Real HubSpot Signal Vertical Slice, Phase 2A.

This is the ONLY module that bridges a real HubSpot sandbox Company read to the
frozen Phase 1 :class:`SignalDetector`. Its single job:

    allow-list validation -> one Company GET -> renewal-date extraction
    -> frozen SignalDetector -> DetectionResult -> stop.

It generates NO mission, calls NO selector/planner/governance/action, and writes
NOTHING back to HubSpot. It depends only on the narrow read-only
:class:`CompanyReader` interface (a single ``get_company`` method), so it is
structurally unable to reach any connector write method (``create_task`` /
``create_note``).

Fail-closed ordering (each guard refuses before doing more work):

1. the slice must be enabled,
2. the requested account/company id must be account-allow-listed
   -- checked BEFORE any HubSpot network request,
3. the portal id must be portal-allow-listed
   -- checked BEFORE the Company read,
4. a durable snapshot path must be configured.

A guard failure raises :class:`LiveSignalSourceError` (safe message, never a
token or environment dump). Everything the frozen detector already classifies
(baseline / unchanged / change / invalid date / persistence failure) is returned
as a :class:`DetectionResult` unchanged.
"""

from __future__ import annotations

from typing import List, Optional, Protocol, runtime_checkable

from live_signals.contracts import DetectionResult
from live_signals.detector import DEFAULT_SOURCE, RENEWAL_DATE, SignalDetector
from live_signals.repository import SignalRepositoryError, SignalSnapshotRepository
from live_signals.settings import LiveSignalSettings


class LiveSignalSourceError(RuntimeError):
    """A live-signal read was refused or could not complete -- fail closed.

    The message is always safe to surface (no token, no environment). No
    ``SignalChangeEvent`` is emitted and no snapshot is advanced when raised."""


@runtime_checkable
class CompanyReader(Protocol):
    """The narrow, read-only surface the adapter is allowed to use.

    Deliberately exposes ONLY a single GET-style method. The concrete
    ``HubSpotConnector`` satisfies this structurally, but the adapter -- typed
    against this Protocol -- cannot see or call any write method."""

    def get_company(self, company_id: str, properties: Optional[List[str]] = None) -> dict:
        ...


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
    source_record_type: str = "company",
) -> DetectionResult:
    """Read one HubSpot sandbox Company's renewal date and run the frozen detector.

    ``detected_at`` is an INJECTED ISO timestamp (the detector never reads the
    clock). ``repository`` may be injected (tests / reuse); otherwise a durable
    store is opened at ``settings.db_path``. Returns exactly one
    :class:`DetectionResult`; raises :class:`LiveSignalSourceError` on any
    fail-closed guard (disabled, not allow-listed, unconfigured store, read
    failure). Never writes to HubSpot.
    """
    # 1. Feature flag -- off by default.
    if not settings.enabled:
        raise LiveSignalSourceError(
            "live signals are disabled (set LIVE_SIGNALS_ENABLED=true to enable)."
        )

    # 2. Account allow-list -- BEFORE any HubSpot network request.
    if not settings.account_allowed(account_id):
        raise LiveSignalSourceError(
            "requested account is not on the live-signal account allow-list."
        )

    # 3. Portal allow-list -- BEFORE the Company read.
    if not settings.portal_allowed(portal_id):
        raise LiveSignalSourceError(
            "portal is not on the live-signal portal allow-list."
        )

    # 4. Durable store must be configured (no silent in-memory fallback).
    if not settings.db_path:
        raise LiveSignalSourceError(
            "no durable snapshot path is configured (set LIVE_SIGNALS_DB_PATH)."
        )
    prop = (settings.renewal_property or "").strip()
    if not prop:
        raise LiveSignalSourceError("no monitored renewal property is configured.")

    # Own the store only if the caller did not inject one.
    own_repo = repository is None
    if own_repo:
        try:
            repository = SignalSnapshotRepository(settings.db_path)
        except SignalRepositoryError as exc:
            raise LiveSignalSourceError(f"snapshot store unavailable: {exc}") from exc

    try:
        # 5. Exactly one read: a single Company GET for the monitored property.
        try:
            data = reader.get_company(account_id, [prop])
        except LiveSignalSourceError:
            raise
        except Exception as exc:  # noqa: BLE001 - fail closed; surface a safe message
            safe = getattr(exc, "message", None)
            raise LiveSignalSourceError(
                f"HubSpot read failed: {safe}" if safe else "HubSpot read failed."
            ) from exc

        # 6. Extract the monitored value. Missing / blank / unexpected shapes fall
        #    through to the frozen detector, which fails closed with invalid_input.
        props = data.get("properties") if isinstance(data, dict) else None
        raw = props.get(prop) if isinstance(props, dict) else None
        raw_value = "" if raw is None else str(raw)
        record_id = ""
        if isinstance(data, dict):
            record_id = str(data.get("id") or "").strip()
        if not record_id:
            record_id = (account_id or "").strip()

        # 7. Frozen Phase 1 detector -- the single normalization/classification
        #    authority. It persists the baseline or emits exactly one event.
        detector = SignalDetector(repository)
        return detector.detect(
            portal_id=portal_id,
            account_id=account_id,
            account_ref=account_ref,
            monitored_field=RENEWAL_DATE,
            source_record_type=source_record_type,
            source_record_id=record_id,
            raw_value=raw_value,
            detected_at=detected_at,
            source=source,
        )
    finally:
        if own_repo and repository is not None:
            repository.close()


__all__ = [
    "CompanyReader",
    "LiveSignalSourceError",
    "observe_renewal",
]
