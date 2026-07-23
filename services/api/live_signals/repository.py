"""Durable snapshot + event repository -- Real HubSpot Signal Vertical Slice, Phase 1.

Process memory must NOT be the source of truth for prior snapshots: Render
instances restart. This module persists the last observed normalized value per
monitored identity in a durable, offline SQLite store, mirroring the conventions
already proven by ``harness.audit_ledger`` (stdlib ``sqlite3``, WAL, canonical
JSON, deterministic hashes, caller-injected timestamps, no network, no clock).

Two tables:

* ``signal_snapshots`` -- exactly one row per monitored identity
  ``(portal_id, account_id, source_record_id, monitored_field)``. Holds the prior
  and current values plus provenance and the last processed event / fingerprint,
  and the (later-phase) ``mission_id`` / ``writeback_id`` bindings.
* ``signal_events`` -- one row per emitted change event, keyed by
  ``change_fingerprint``. This is the durable idempotency authority: a replay of
  the same change returns the stored event instead of creating a duplicate.

This module is additive and touches no protected engine, no CRM, and no network.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Optional, Tuple

from live_signals.contracts import SignalChangeEvent, SignalSnapshot

SCHEMA_VERSION = "1.0"

_IN_MEMORY = ":memory:"


class SignalRepositoryError(RuntimeError):
    """Any durable-store failure. The detector maps this to ``persistence_failure``
    and fails closed (never emits an event or advances a snapshot on failure)."""


def _canonical_json(obj) -> str:
    """Deterministic canonical JSON (identical bytes for identical content)."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


class SignalSnapshotRepository:
    """Durable, append-safe store for monitored-field snapshots and change events."""

    def __init__(self, db_path: str = _IN_MEMORY) -> None:
        try:
            self._conn = sqlite3.connect(db_path)
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL;")
            self._conn.execute("PRAGMA foreign_keys=ON;")
            self._create_schema()
        except sqlite3.Error as exc:  # pragma: no cover - defensive
            raise SignalRepositoryError(f"failed to open snapshot store: {exc}") from exc

    def close(self) -> None:
        self._conn.close()

    # -- schema --------------------------------------------------------------

    def _create_schema(self) -> None:
        with self._conn:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS signal_snapshots (
                    portal_id               TEXT NOT NULL,
                    account_id              TEXT NOT NULL,
                    source_record_id        TEXT NOT NULL,
                    monitored_field         TEXT NOT NULL,
                    account_ref             TEXT,
                    source                  TEXT,
                    source_record_type      TEXT,
                    prior_raw_value         TEXT,
                    prior_normalized_value  TEXT,
                    current_raw_value       TEXT NOT NULL,
                    current_normalized_value TEXT NOT NULL,
                    last_sync_at            TEXT NOT NULL,
                    signal_change_event_id  TEXT,
                    change_fingerprint      TEXT,
                    last_processed_event_id TEXT,
                    mission_id              TEXT,
                    writeback_id            TEXT,
                    created_at              TEXT NOT NULL,
                    updated_at              TEXT NOT NULL,
                    PRIMARY KEY (portal_id, account_id, source_record_id, monitored_field)
                )
                """
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS signal_events (
                    change_fingerprint TEXT PRIMARY KEY,
                    event_id           TEXT NOT NULL,
                    canonical_event    TEXT NOT NULL,
                    created_at         TEXT NOT NULL
                )
                """
            )

    # -- helpers -------------------------------------------------------------

    @staticmethod
    def _row_to_snapshot(row: sqlite3.Row) -> SignalSnapshot:
        return SignalSnapshot(
            portal_id=row["portal_id"],
            account_id=row["account_id"],
            source_record_id=row["source_record_id"],
            monitored_field=row["monitored_field"],
            account_ref=row["account_ref"],
            source=row["source"],
            source_record_type=row["source_record_type"],
            prior_raw_value=row["prior_raw_value"],
            prior_normalized_value=row["prior_normalized_value"],
            current_raw_value=row["current_raw_value"],
            current_normalized_value=row["current_normalized_value"],
            last_sync_at=row["last_sync_at"],
            signal_change_event_id=row["signal_change_event_id"],
            change_fingerprint=row["change_fingerprint"],
            last_processed_event_id=row["last_processed_event_id"],
            mission_id=row["mission_id"],
            writeback_id=row["writeback_id"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    # -- snapshot reads ------------------------------------------------------

    def get_snapshot(
        self, *, portal_id: str, account_id: str, source_record_id: str, monitored_field: str
    ) -> Optional[SignalSnapshot]:
        try:
            cur = self._conn.execute(
                """
                SELECT * FROM signal_snapshots
                WHERE portal_id = ? AND account_id = ? AND source_record_id = ?
                  AND monitored_field = ?
                """,
                (portal_id, account_id, source_record_id, monitored_field),
            )
            row = cur.fetchone()
        except sqlite3.Error as exc:
            raise SignalRepositoryError(f"snapshot read failed: {exc}") from exc
        return self._row_to_snapshot(row) if row is not None else None

    # -- baseline (first observation) ---------------------------------------

    def establish_baseline(
        self, *, portal_id: str, account_id: str, source_record_id: str, monitored_field: str,
        account_ref: str, source: str, source_record_type: str, raw_value: str,
        normalized_value: str, last_sync_at: str, created_at: str,
    ) -> SignalSnapshot:
        """Persist the first observation for an identity. No prior value, no event."""
        try:
            with self._conn:
                self._conn.execute(
                    """
                    INSERT INTO signal_snapshots (
                        portal_id, account_id, source_record_id, monitored_field,
                        account_ref, source, source_record_type,
                        prior_raw_value, prior_normalized_value,
                        current_raw_value, current_normalized_value,
                        last_sync_at, signal_change_event_id, change_fingerprint,
                        last_processed_event_id, mission_id, writeback_id,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
                    """,
                    (
                        portal_id, account_id, source_record_id, monitored_field,
                        account_ref, source, source_record_type,
                        raw_value, normalized_value,
                        last_sync_at, created_at, created_at,
                    ),
                )
        except sqlite3.IntegrityError as exc:
            raise SignalRepositoryError(
                f"baseline already exists for identity {monitored_field!r}: {exc}"
            ) from exc
        except sqlite3.Error as exc:
            raise SignalRepositoryError(f"baseline write failed: {exc}") from exc

        snap = self.get_snapshot(
            portal_id=portal_id, account_id=account_id,
            source_record_id=source_record_id, monitored_field=monitored_field,
        )
        if snap is None:  # pragma: no cover - defensive
            raise SignalRepositoryError("baseline row vanished immediately after insert.")
        return snap

    # -- durable idempotency: events keyed by fingerprint --------------------

    def find_event(self, change_fingerprint: str) -> Optional[SignalChangeEvent]:
        try:
            cur = self._conn.execute(
                "SELECT canonical_event FROM signal_events WHERE change_fingerprint = ?",
                (change_fingerprint,),
            )
            row = cur.fetchone()
        except sqlite3.Error as exc:
            raise SignalRepositoryError(f"event read failed: {exc}") from exc
        if row is None:
            return None
        return SignalChangeEvent.model_validate(json.loads(row["canonical_event"]))

    def commit_change(self, event: SignalChangeEvent, *, created_at: str) -> SignalSnapshot:
        """Atomically store a NEW change event and advance its snapshot.

        The caller must have confirmed via :meth:`find_event` that the event's
        fingerprint is new (the replay path returns before reaching here). The
        snapshot's current value is shifted into ``prior`` in the same statement.
        """
        canonical = _canonical_json(event.model_dump(by_alias=True, mode="json"))
        try:
            with self._conn:
                self._conn.execute(
                    """
                    INSERT INTO signal_events (change_fingerprint, event_id, canonical_event, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (event.change_fingerprint, event.event_id, canonical, created_at),
                )
                cur = self._conn.execute(
                    """
                    UPDATE signal_snapshots SET
                        prior_raw_value = current_raw_value,
                        prior_normalized_value = current_normalized_value,
                        current_raw_value = ?,
                        current_normalized_value = ?,
                        last_sync_at = ?,
                        signal_change_event_id = ?,
                        change_fingerprint = ?,
                        last_processed_event_id = ?,
                        updated_at = ?
                    WHERE portal_id = ? AND account_id = ? AND source_record_id = ?
                      AND monitored_field = ?
                    """,
                    (
                        event.new_value, event.normalized_new_value, event.detected_at,
                        event.event_id, event.change_fingerprint, event.event_id, created_at,
                        event.portal_id, event.account_id, event.source_record_id,
                        event.monitored_field,
                    ),
                )
                if cur.rowcount != 1:
                    raise SignalRepositoryError(
                        "commit_change expected exactly one snapshot row to advance; "
                        f"updated {cur.rowcount}."
                    )
        except sqlite3.IntegrityError as exc:
            raise SignalRepositoryError(
                f"duplicate change event for fingerprint {event.change_fingerprint!r}: {exc}"
            ) from exc
        except sqlite3.Error as exc:
            raise SignalRepositoryError(f"change commit failed: {exc}") from exc

        snap = self.get_snapshot(
            portal_id=event.portal_id, account_id=event.account_id,
            source_record_id=event.source_record_id, monitored_field=event.monitored_field,
        )
        if snap is None:  # pragma: no cover - defensive
            raise SignalRepositoryError("snapshot row vanished immediately after commit.")
        return snap

    # -- later-phase bindings (local only; no CRM write in Phase 1) ----------

    def bind_mission_id(
        self, *, portal_id: str, account_id: str, source_record_id: str, monitored_field: str,
        mission_id: str, updated_at: str,
    ) -> SignalSnapshot:
        return self._bind_ref(
            column="mission_id", value=mission_id, portal_id=portal_id, account_id=account_id,
            source_record_id=source_record_id, monitored_field=monitored_field, updated_at=updated_at,
        )

    def bind_writeback_id(
        self, *, portal_id: str, account_id: str, source_record_id: str, monitored_field: str,
        writeback_id: str, updated_at: str,
    ) -> SignalSnapshot:
        return self._bind_ref(
            column="writeback_id", value=writeback_id, portal_id=portal_id, account_id=account_id,
            source_record_id=source_record_id, monitored_field=monitored_field, updated_at=updated_at,
        )

    def _bind_ref(
        self, *, column: str, value: str, portal_id: str, account_id: str,
        source_record_id: str, monitored_field: str, updated_at: str,
    ) -> SignalSnapshot:
        if column not in {"mission_id", "writeback_id"}:  # guard: never interpolate arbitrary columns
            raise SignalRepositoryError(f"refusing to bind unknown column {column!r}.")
        try:
            with self._conn:
                cur = self._conn.execute(
                    f"""
                    UPDATE signal_snapshots SET {column} = ?, updated_at = ?
                    WHERE portal_id = ? AND account_id = ? AND source_record_id = ?
                      AND monitored_field = ?
                    """,
                    (value, updated_at, portal_id, account_id, source_record_id, monitored_field),
                )
                if cur.rowcount != 1:
                    raise SignalRepositoryError(
                        f"{column} binding expected one snapshot row; updated {cur.rowcount}."
                    )
        except sqlite3.Error as exc:
            raise SignalRepositoryError(f"{column} binding failed: {exc}") from exc
        snap = self.get_snapshot(
            portal_id=portal_id, account_id=account_id,
            source_record_id=source_record_id, monitored_field=monitored_field,
        )
        if snap is None:  # pragma: no cover - defensive
            raise SignalRepositoryError("snapshot row vanished after binding.")
        return snap


__all__ = ["SignalRepositoryError", "SignalSnapshotRepository", "SCHEMA_VERSION"]
