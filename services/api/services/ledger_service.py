"""Decision ledger persistence (SQLite).

Persists every workflow run and every recommendation so that approvals survive
across requests and the decision trail is auditable. SQLite keeps the MVP
zero-config; the schema is intentionally simple (full typed payloads are stored
as JSON, with a few hot columns promoted for querying).
"""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from typing import List, Optional

from schemas.ledger import DecisionLedger
from schemas.recommendation import ApprovalStatus, Recommendation

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.getenv("DB_PATH", os.path.join(API_DIR, "signal_to_action.db"))


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create tables if they do not exist. Safe to call on every startup."""
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS ledgers (
                ledger_id        TEXT PRIMARY KEY,
                timestamp        TEXT NOT NULL,
                user_query       TEXT NOT NULL,
                model_provider   TEXT,
                confidence_score REAL,
                approval_status  TEXT,
                latency_ms       INTEGER,
                payload_json     TEXT NOT NULL,
                created_at       TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS recommendations (
                recommendation_id TEXT PRIMARY KEY,
                ledger_id         TEXT NOT NULL,
                account_id        TEXT NOT NULL,
                account_name      TEXT NOT NULL,
                priority_rank     INTEGER,
                priority_score    REAL,
                action_type       TEXT,
                confidence_score  REAL,
                governance_status TEXT,
                approval_status   TEXT,
                reject_reason     TEXT,
                payload_json      TEXT NOT NULL,
                created_at        TEXT NOT NULL,
                FOREIGN KEY (ledger_id) REFERENCES ledgers (ledger_id)
            );

            CREATE INDEX IF NOT EXISTS idx_rec_ledger ON recommendations (ledger_id);

            CREATE TABLE IF NOT EXISTS crm_writebacks (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                recommendation_id TEXT NOT NULL,
                connector         TEXT,
                object_type       TEXT,
                external_id       TEXT,
                status            TEXT,
                created_at        TEXT NOT NULL,
                payload_json      TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_wb_rec ON crm_writebacks (recommendation_id);
            """
        )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def save_run(ledger: DecisionLedger, recommendations: List[Recommendation]) -> None:
    """Persist a ledger and its recommendations in a single transaction."""
    created = _now()
    with _connect() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO ledgers
                (ledger_id, timestamp, user_query, model_provider, confidence_score,
                 approval_status, latency_ms, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ledger.ledger_id,
                ledger.timestamp.isoformat(),
                ledger.user_query,
                ledger.model_provider,
                ledger.confidence_score,
                ledger.approval_status,
                ledger.latency_ms,
                ledger.model_dump_json(),
                created,
            ),
        )
        for rec in recommendations:
            conn.execute(
                """
                INSERT OR REPLACE INTO recommendations
                    (recommendation_id, ledger_id, account_id, account_name, priority_rank,
                     priority_score, action_type, confidence_score, governance_status,
                     approval_status, reject_reason, payload_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    rec.recommendation_id,
                    ledger.ledger_id,
                    rec.account_id,
                    rec.account_name,
                    rec.priority_rank,
                    rec.priority_score,
                    rec.action_type,
                    rec.confidence_score,
                    rec.governance_status,
                    rec.approval_status.value,
                    None,
                    rec.model_dump_json(),
                    created,
                ),
            )


def get_recommendation(recommendation_id: str) -> Optional[Recommendation]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT payload_json FROM recommendations WHERE recommendation_id = ?",
            (recommendation_id,),
        ).fetchone()
    if row is None:
        return None
    return Recommendation.model_validate_json(row["payload_json"])


def set_approval(
    recommendation_id: str,
    status: ApprovalStatus,
    reason: Optional[str] = None,
) -> Optional[Recommendation]:
    """Update a recommendation's approval state and return the updated record."""
    rec = get_recommendation(recommendation_id)
    if rec is None:
        return None
    rec.approval_status = status
    with _connect() as conn:
        conn.execute(
            """
            UPDATE recommendations
               SET approval_status = ?, reject_reason = ?, payload_json = ?
             WHERE recommendation_id = ?
            """,
            (status.value, reason, rec.model_dump_json(), recommendation_id),
        )
    return rec


def get_ledger(ledger_id: str) -> Optional[DecisionLedger]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT payload_json FROM ledgers WHERE ledger_id = ?", (ledger_id,)
        ).fetchone()
    if row is None:
        return None
    return DecisionLedger.model_validate_json(row["payload_json"])


def recent_ledgers(limit: int = 20) -> List[dict]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT ledger_id, timestamp, user_query, confidence_score, approval_status, latency_ms
              FROM ledgers ORDER BY created_at DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def save_writeback(result) -> None:
    """Persist a CRM write-back (HubSpot task/note) for the audit trail.

    ``result`` is a ``WritebackResult`` (duck-typed to avoid import coupling).
    """
    payload_json = (
        result.model_dump_json() if hasattr(result, "model_dump_json") else str(result)
    )
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO crm_writebacks
                (recommendation_id, connector, object_type, external_id, status,
                 created_at, payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                getattr(result, "recommendation_id", ""),
                getattr(result, "connector", "hubspot"),
                getattr(result, "object_type", ""),
                getattr(result, "external_id", "") or "",
                getattr(result, "status", ""),
                getattr(result, "created_at", None) or _now(),
                payload_json,
            ),
        )


def get_writebacks(recommendation_id: str) -> List[dict]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT payload_json FROM crm_writebacks
             WHERE recommendation_id = ? ORDER BY id ASC
            """,
            (recommendation_id,),
        ).fetchall()
    import json as _json

    return [_json.loads(r["payload_json"]) for r in rows]
