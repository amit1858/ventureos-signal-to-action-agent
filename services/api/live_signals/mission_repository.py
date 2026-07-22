"""Durable, idempotent mission repository -- Real HubSpot Signal Vertical Slice, Phase 2B.

Additive persistence for generated missions. It reuses the SAME local SQLite database
file as the Phase 1 signal store (via ``db_path``) but owns a NEW, separate table --
``missions`` -- created with ``CREATE TABLE IF NOT EXISTS``. It never reads, writes, or
alters the frozen ``signal_snapshots`` / ``signal_events`` tables: evidence linkage is
one-directional (mission -> event) and the Phase 1 snapshot's ``mission_id`` hook is left
untouched in Phase 2B.

Idempotency authority: ``source_event_id`` is UNIQUE. Insert uses
``ON CONFLICT(source_event_id) DO NOTHING`` so a replay of the same event never creates a
duplicate; the caller then reads back the stored mission. All timestamps are caller-injected
(no internal clock); no network, no model, no protected engine.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Optional

from live_signals.mission_contracts import LiveMission

SCHEMA_VERSION = "1.0"

_IN_MEMORY = ":memory:"


class MissionRepositoryError(RuntimeError):
    """Any durable-store failure. The service maps this to ``selection_error`` and
    fails closed (never returns a partially-persisted mission)."""


def _canonical_json(obj) -> str:
    """Deterministic canonical JSON (identical bytes for identical content)."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


class MissionRepository:
    """Durable, idempotent store for generated ``LiveMission`` rows."""

    def __init__(self, db_path: str = _IN_MEMORY) -> None:
        try:
            self._conn = sqlite3.connect(db_path)
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL;")
            self._conn.execute("PRAGMA foreign_keys=ON;")
            self._create_schema()
        except sqlite3.Error as exc:  # pragma: no cover - defensive
            raise MissionRepositoryError(f"failed to open mission store: {exc}") from exc

    def close(self) -> None:
        self._conn.close()

    # -- schema --------------------------------------------------------------

    def _create_schema(self) -> None:
        with self._conn:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS missions (
                    mission_id        TEXT PRIMARY KEY,
                    source_event_id   TEXT NOT NULL UNIQUE,
                    change_fingerprint TEXT NOT NULL,
                    mission_type      TEXT NOT NULL,
                    account_id        TEXT NOT NULL,
                    portal_id         TEXT NOT NULL,
                    priority          TEXT NOT NULL,
                    status            TEXT NOT NULL,
                    template_id       TEXT NOT NULL,
                    template_version  TEXT NOT NULL,
                    rule_id           TEXT NOT NULL,
                    rule_version      TEXT NOT NULL,
                    canonical_mission TEXT NOT NULL,
                    created_at        TEXT NOT NULL
                )
                """
            )

    # -- reads ---------------------------------------------------------------

    def get_by_source_event_id(self, source_event_id: str) -> Optional[LiveMission]:
        try:
            cur = self._conn.execute(
                "SELECT canonical_mission FROM missions WHERE source_event_id = ?",
                (source_event_id,),
            )
            row = cur.fetchone()
        except sqlite3.Error as exc:
            raise MissionRepositoryError(f"mission read failed: {exc}") from exc
        if row is None:
            return None
        return LiveMission.model_validate_json(row["canonical_mission"])

    def count(self) -> int:
        try:
            cur = self._conn.execute("SELECT COUNT(*) AS n FROM missions")
            return int(cur.fetchone()["n"])
        except sqlite3.Error as exc:
            raise MissionRepositoryError(f"mission count failed: {exc}") from exc

    # -- writes --------------------------------------------------------------

    def add_if_absent(self, mission: LiveMission) -> bool:
        """Persist a mission unless one already exists for its ``source_event_id``.

        Returns ``True`` if this call inserted the row, ``False`` if an equivalent
        mission was already present (idempotent no-op). Fails closed on any store
        error -- never leaves a partial row."""
        canonical = _canonical_json(mission.model_dump(by_alias=True))
        try:
            with self._conn:
                cur = self._conn.execute(
                    """
                    INSERT INTO missions (
                        mission_id, source_event_id, change_fingerprint, mission_type,
                        account_id, portal_id, priority, status, template_id,
                        template_version, rule_id, rule_version, canonical_mission,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(source_event_id) DO NOTHING
                    """,
                    (
                        mission.mission_id,
                        mission.source_event_id,
                        mission.change_fingerprint,
                        mission.mission_type,
                        mission.account_id,
                        mission.portal_id,
                        mission.priority.value,
                        mission.status.value,
                        mission.template_id,
                        mission.template_version,
                        mission.rule_id,
                        mission.rule_version,
                        canonical,
                        mission.created_at,
                    ),
                )
            return cur.rowcount > 0
        except sqlite3.Error as exc:
            raise MissionRepositoryError(f"mission write failed: {exc}") from exc


__all__ = ["MissionRepository", "MissionRepositoryError"]
