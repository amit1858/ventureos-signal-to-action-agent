"""Deterministic signal detector -- Real HubSpot Signal Vertical Slice, Phase 1.

``SignalDetector.detect(...)`` is deterministic and offline. Given a normalized
current observation of a monitored field plus an INJECTED ``detected_at``
timestamp, it loads the prior durable snapshot, compares, classifies the change
direction, computes a stable fingerprint/event id, persists, and returns exactly
one :class:`DetectionResult`. It never reads the system clock inside its logic
and never calls HubSpot or any network (Phase 1 is deterministic-only).

Outcomes (fail-closed set):

* ``baseline_established`` -- first observation; snapshot stored, no event, no mission.
* ``unchanged``            -- normalized value identical to prior; no event.
* ``change_detected``      -- one typed ``SignalChangeEvent`` (new, or replayed).
* ``invalid_input``        -- missing identity / unknown field / unparseable value.
* ``ambiguous_change``     -- values differ but direction is indeterminate (defensive).
* ``persistence_failure``  -- the durable store failed; nothing is emitted or advanced.

Also exposes :func:`to_selector_signals`, a pure bridge that maps an event to the
harness selector's ``signals`` dict WITHOUT importing or modifying the selector.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime
from typing import Callable, Dict, Optional

from live_signals.contracts import (
    DetectionResult,
    DetectionStatus,
    SignalChangeEvent,
    SignalDirection,
)
from live_signals.repository import SignalRepositoryError, SignalSnapshotRepository

# -- known monitored fields -------------------------------------------------

RENEWAL_DATE = "renewal_date"
SUPPORT_ESCALATION = "support_escalation"

DEFAULT_SOURCE = "hubspot_test"


class NormalizationError(ValueError):
    """A monitored value could not be normalized -> the detector fails closed."""


# -- deterministic hashing --------------------------------------------------


def _canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def change_fingerprint(
    *, portal_id: str, account_id: str, source_record_id: str, monitored_field: str,
    normalized_old_value: str, normalized_new_value: str,
) -> str:
    """Stable, clock-free fingerprint of a specific old->new transition."""
    core = {
        "accountId": account_id,
        "monitoredField": monitored_field,
        "normalizedNewValue": normalized_new_value,
        "normalizedOldValue": normalized_old_value,
        "portalId": portal_id,
        "sourceRecordId": source_record_id,
    }
    return "sig1:" + _sha256(_canonical_json(core))


def event_id_for(fingerprint: str) -> str:
    """Deterministic event id derived from the fingerprint (excludes detected_at)."""
    return "SCE-" + _sha256(fingerprint)[:16]


# -- field semantics registry (normalize + classify) ------------------------


def _normalize_iso_date(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        raise NormalizationError("value is missing or empty")
    candidate = text.replace("Z", "+00:00")
    for parse in (lambda s: date.fromisoformat(s), lambda s: datetime.fromisoformat(s).date()):
        try:
            return parse(candidate).isoformat()
        except ValueError:
            continue
    raise NormalizationError(f"value is not an ISO-8601 date: {text!r}")


def _classify_earlier_is_adverse(old_norm: str, new_norm: str) -> SignalDirection:
    """For a horizon date: an earlier date means less runway -> adverse."""
    if new_norm == old_norm:
        return SignalDirection.unchanged
    # ISO 'YYYY-MM-DD' strings sort chronologically.
    return SignalDirection.adverse if new_norm < old_norm else SignalDirection.positive


@dataclass(frozen=True)
class FieldSpec:
    field: str
    normalize: Callable[[str], str]
    classify: Callable[[str, str], SignalDirection]


_FIELD_SPECS: Dict[str, FieldSpec] = {
    RENEWAL_DATE: FieldSpec(RENEWAL_DATE, _normalize_iso_date, _classify_earlier_is_adverse),
}


def _identity_missing(values: Dict[str, str]) -> Optional[str]:
    for name, value in values.items():
        if value is None or not str(value).strip():
            return name
    return None


# -- the detector -----------------------------------------------------------


class SignalDetector:
    """Deterministic change detector over a durable snapshot repository."""

    def __init__(self, repository: SignalSnapshotRepository) -> None:
        self._repo = repository

    def detect(
        self, *, portal_id: str, account_id: str, account_ref: str, monitored_field: str,
        source_record_type: str, source_record_id: str, raw_value: str, detected_at: str,
        source: str = DEFAULT_SOURCE,
    ) -> DetectionResult:
        # 1. Identity / input validation -- fail closed.
        missing = _identity_missing({
            "portal_id": portal_id, "account_id": account_id, "account_ref": account_ref,
            "monitored_field": monitored_field, "source_record_type": source_record_type,
            "source_record_id": source_record_id, "detected_at": detected_at,
        })
        if missing is not None:
            return DetectionResult(
                status=DetectionStatus.invalid_input,
                detail=f"missing required input: {missing}",
            )

        spec = _FIELD_SPECS.get(monitored_field)
        if spec is None:
            return DetectionResult(
                status=DetectionStatus.invalid_input,
                detail=f"unsupported monitored_field: {monitored_field!r}",
            )

        # 2. Normalize the current observation.
        try:
            current_norm = spec.normalize(raw_value)
        except NormalizationError as exc:
            return DetectionResult(
                status=DetectionStatus.invalid_input,
                detail=f"normalization failed: {exc}",
            )
        raw_text = str(raw_value).strip()
        src = (source or DEFAULT_SOURCE).strip() or DEFAULT_SOURCE

        # 3. Load the prior durable snapshot.
        try:
            prior = self._repo.get_snapshot(
                portal_id=portal_id, account_id=account_id,
                source_record_id=source_record_id, monitored_field=monitored_field,
            )
        except SignalRepositoryError as exc:
            return DetectionResult(status=DetectionStatus.persistence_failure, detail=str(exc))

        # 4. First observation -> establish baseline, no event, no mission.
        if prior is None:
            try:
                snap = self._repo.establish_baseline(
                    portal_id=portal_id, account_id=account_id,
                    source_record_id=source_record_id, monitored_field=monitored_field,
                    account_ref=account_ref, source=src, source_record_type=source_record_type,
                    raw_value=raw_text, normalized_value=current_norm,
                    last_sync_at=detected_at, created_at=detected_at,
                )
            except SignalRepositoryError as exc:
                return DetectionResult(status=DetectionStatus.persistence_failure, detail=str(exc))
            return DetectionResult(
                status=DetectionStatus.baseline_established,
                detail="baseline established; no prior state existed.",
                snapshot=snap,
            )

        # 5. No change -> no event, no snapshot side effect.
        if prior.current_normalized_value == current_norm:
            return DetectionResult(
                status=DetectionStatus.unchanged,
                detail="normalized value unchanged since last observation.",
                snapshot=prior,
            )

        # 6. Classify the change direction.
        direction = spec.classify(prior.current_normalized_value, current_norm)
        if direction is SignalDirection.unchanged:
            # Values differ textually but the field's classifier cannot order them.
            return DetectionResult(
                status=DetectionStatus.ambiguous_change,
                detail="values differ but change direction is indeterminate.",
                snapshot=prior,
            )

        fingerprint = change_fingerprint(
            portal_id=portal_id, account_id=account_id, source_record_id=source_record_id,
            monitored_field=monitored_field,
            normalized_old_value=prior.current_normalized_value,
            normalized_new_value=current_norm,
        )

        # 7. Idempotent replay -> return the stored event, do not advance state.
        try:
            existing = self._repo.find_event(fingerprint)
        except SignalRepositoryError as exc:
            return DetectionResult(status=DetectionStatus.persistence_failure, detail=str(exc))
        if existing is not None:
            return DetectionResult(
                status=DetectionStatus.change_detected,
                detail="replay: previously recorded event returned (no duplicate).",
                event=existing, snapshot=prior, replayed=True,
            )

        # 8. Build and durably commit exactly one new event.
        event = SignalChangeEvent(
            event_id=event_id_for(fingerprint),
            portal_id=portal_id, account_id=account_id, account_ref=account_ref,
            monitored_field=monitored_field,
            old_value=prior.current_raw_value, new_value=raw_text,
            direction=direction, detected_at=detected_at, source=src,
            source_record_type=source_record_type, source_record_id=source_record_id,
            normalized_old_value=prior.current_normalized_value,
            normalized_new_value=current_norm, change_fingerprint=fingerprint,
        )
        try:
            snap = self._repo.commit_change(event, created_at=detected_at)
        except SignalRepositoryError as exc:
            return DetectionResult(status=DetectionStatus.persistence_failure, detail=str(exc))
        return DetectionResult(
            status=DetectionStatus.change_detected,
            detail="deterministic change detected; one event emitted.",
            event=event, snapshot=snap, replayed=False,
        )


# -- pure selector bridge (no harness import, no selector change) ------------


def to_selector_signals(event: SignalChangeEvent) -> dict:
    """Map a ``SignalChangeEvent`` to the harness selector's ``signals`` dict.

    Only *adverse* changes carry an actionable mission signal; positive or benign
    changes return ``{}`` so the deterministic selector fails closed (no mission).
    This function imports nothing from the harness -- it returns a plain mapping
    that the existing, unmodified ``harness.selector.select`` already understands.
    """
    if event.direction is not SignalDirection.adverse:
        return {}
    field = (event.monitored_field or "").strip().lower()
    if field == RENEWAL_DATE:
        return {
            "mission_type": "renewal_risk", "signal_type": "renewal_risk",
            "severity": "high", "signal_id": event.event_id,
        }
    if field == SUPPORT_ESCALATION:
        return {
            "mission_type": "support_escalation", "signal_type": "support_escalation",
            "severity": "critical", "signal_id": event.event_id,
        }
    return {}


__all__ = [
    "RENEWAL_DATE",
    "SUPPORT_ESCALATION",
    "DEFAULT_SOURCE",
    "NormalizationError",
    "FieldSpec",
    "SignalDetector",
    "change_fingerprint",
    "event_id_for",
    "to_selector_signals",
]
