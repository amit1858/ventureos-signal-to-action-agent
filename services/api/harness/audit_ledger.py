"""Additive Mission Audit Ledger (Release 2.2, Commit 6).

A deterministic, append-only, hash-chained SQLite ledger that records the full
governed mission lifecycle. It is ENTIRELY SEPARATE from the protected Decision
Ledger (``services/api/services/ledger_service.py``): it never imports it, never
writes to it, and only ever stores a protected decision/run identifier as an
opaque string reference (``decision_ref``).

Design guarantees:

* Append-only. There is NO update or delete API and no SQL UPDATE/DELETE.
* Per-mission hash chain (``previous_record_hash`` -> ``record_hash``) so any
  tampering is detectable via :meth:`verify_mission_chain`.
* Deterministic: canonical JSON, deterministic ids/hashes, deterministic export.
* No internal clock -- ``occurred_at`` and ``created_at`` are injected by callers.
* Durable idempotency authority for simulated execution receipts, scoped per
  mission, surviving close/reopen of the database.
* Offline only: SQLite, no network, no CRM, no production data.

This module is additive and touches no protected engine.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from typing import List, Optional

from pydantic import Field

from harness.contracts import (
    ActionReceipt,
    ApprovalDecision,
    ApprovalOutcome,
    ApprovalRequest,
    HarnessModel,
    MissionEvent,
    VerificationResult,
)

SCHEMA_VERSION = "1.0"
GENESIS_HASH = "0" * 64

RECORD_TYPES = (
    "mission_opened",
    "mission_transition",
    "verification_result",
    "approval_request",
    "approval_decision",
    "simulated_action_receipt",
    "outcome_verification",
    "mission_closed",
)


# -- errors (all fail closed) -----------------------------------------------


class AuditLedgerError(ValueError):
    """Base class for all audit-ledger violations."""


class MissingMissionIdError(AuditLedgerError):
    pass


class InvalidMissionVersionError(AuditLedgerError):
    pass


class InvalidRecordTypeError(AuditLedgerError):
    pass


class DuplicateRecordError(AuditLedgerError):
    pass


class DuplicateSequenceError(AuditLedgerError):
    pass


class MalformedPayloadError(AuditLedgerError):
    pass


class ChainIntegrityError(AuditLedgerError):
    pass


class IdempotencyConflictError(AuditLedgerError):
    pass


class ApprovalMismatchError(AuditLedgerError):
    pass


class PayloadHashMismatchError(AuditLedgerError):
    pass


class RejectedApprovalError(AuditLedgerError):
    pass


class NonSimulatedReceiptError(AuditLedgerError):
    pass


class TransactionError(AuditLedgerError):
    pass


# -- canonical helpers ------------------------------------------------------


def _canonical_json(obj) -> str:
    """Deterministic canonical JSON. Raises on non-serializable payloads."""
    try:
        return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    except (TypeError, ValueError) as exc:
        raise MalformedPayloadError(f"payload is not canonically serializable: {exc}") from exc


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# -- read models ------------------------------------------------------------


class LedgerRecord(HarnessModel):
    """One immutable, hash-chained audit record."""

    schema_version: str = SCHEMA_VERSION
    ledger_record_id: str
    mission_id: str
    mission_version: str
    record_type: str
    sequence_number: int
    correlation_id: str
    occurred_at: str
    actor: str
    payload_hash: str
    canonical_payload: str
    previous_record_hash: str
    record_hash: str
    decision_ref: Optional[str] = None
    created_at: str


class ChainVerification(HarnessModel):
    valid: bool
    length: int
    broken_at_sequence: Optional[int] = None
    detail: str = ""


class ReceiptAppendResult(HarnessModel):
    ledger_record: LedgerRecord
    receipt: ActionReceipt
    replayed: bool = False


class MissionAuditBundle(HarnessModel):
    schema_version: str = SCHEMA_VERSION
    mission_id: str
    mission_version: Optional[str] = None
    canonical_account: Optional[dict] = None
    selected_template_id: Optional[str] = None
    evidence_refs: List[dict] = Field(default_factory=list)
    lifecycle_events: List[dict] = Field(default_factory=list)
    verification_results: List[dict] = Field(default_factory=list)
    approval_request: Optional[dict] = None
    approval_decision: Optional[dict] = None
    action_receipt: Optional[dict] = None
    outcome_verification: Optional[dict] = None
    decision_ledger_ref: Optional[str] = None
    records: List[LedgerRecord] = Field(default_factory=list)
    chain: ChainVerification


# -- the ledger -------------------------------------------------------------


class MissionAuditLedger:
    """Append-only, hash-chained SQLite mission audit ledger."""

    def __init__(self, db_path: str = ":memory:") -> None:
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL;")
        self._conn.execute("PRAGMA foreign_keys=ON;")
        self._create_schema()

    def close(self) -> None:
        self._conn.close()

    # -- schema --------------------------------------------------------------

    def _create_schema(self) -> None:
        with self._conn:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS mission_audit_records (
                    ledger_record_id     TEXT PRIMARY KEY,
                    schema_version       TEXT NOT NULL,
                    mission_id           TEXT NOT NULL,
                    mission_version      TEXT NOT NULL,
                    record_type          TEXT NOT NULL,
                    sequence_number      INTEGER NOT NULL,
                    correlation_id       TEXT NOT NULL,
                    occurred_at          TEXT NOT NULL,
                    actor                TEXT NOT NULL,
                    payload_hash         TEXT NOT NULL,
                    canonical_payload    TEXT NOT NULL,
                    previous_record_hash TEXT NOT NULL,
                    record_hash          TEXT NOT NULL,
                    decision_ref         TEXT,
                    created_at           TEXT NOT NULL,
                    UNIQUE (mission_id, sequence_number)
                )
                """
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS mission_idempotency (
                    mission_id       TEXT NOT NULL,
                    idempotency_key  TEXT NOT NULL,
                    payload_hash     TEXT NOT NULL,
                    receipt_json     TEXT NOT NULL,
                    ledger_record_id TEXT NOT NULL,
                    created_at       TEXT NOT NULL,
                    PRIMARY KEY (mission_id, idempotency_key)
                )
                """
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_refs (
                    mission_id           TEXT NOT NULL,
                    audit_ref            TEXT NOT NULL,
                    ledger_record_id     TEXT NOT NULL,
                    receipt_id           TEXT NOT NULL,
                    approved_payload_hash TEXT NOT NULL,
                    PRIMARY KEY (mission_id, audit_ref)
                )
                """
            )

    # -- internal insert -----------------------------------------------------

    @staticmethod
    def _ledger_record_id(
        mission_id: str, mission_version: str, record_type: str, payload_hash: str,
        occurred_at: str, actor: str, correlation_id: str,
    ) -> str:
        canonical = "|".join(
            [mission_id, mission_version, record_type, payload_hash, occurred_at, actor, correlation_id]
        )
        return "LR-" + _sha256(canonical)[:16]

    @staticmethod
    def _compute_record_hash(row: dict) -> str:
        core = {
            "schemaVersion": row["schema_version"],
            "ledgerRecordId": row["ledger_record_id"],
            "missionId": row["mission_id"],
            "missionVersion": row["mission_version"],
            "recordType": row["record_type"],
            "sequenceNumber": row["sequence_number"],
            "correlationId": row["correlation_id"],
            "occurredAt": row["occurred_at"],
            "actor": row["actor"],
            "payloadHash": row["payload_hash"],
            "canonicalPayload": row["canonical_payload"],
            "previousRecordHash": row["previous_record_hash"],
            "decisionRef": row["decision_ref"],
            "createdAt": row["created_at"],
        }
        return _sha256(_canonical_json(core))

    def _insert_record(
        self, cur: sqlite3.Cursor, *, mission_id: str, mission_version: str, record_type: str,
        correlation_id: str, occurred_at: str, actor: str, payload: dict, created_at: str,
        decision_ref: Optional[str] = None,
    ) -> LedgerRecord:
        if not mission_id or not str(mission_id).strip():
            raise MissingMissionIdError("mission_id is required.")
        if not mission_version or not str(mission_version).strip():
            raise InvalidMissionVersionError("mission_version is required and must be non-empty.")
        if record_type not in RECORD_TYPES:
            raise InvalidRecordTypeError(f"invalid record_type: {record_type!r}")

        canonical_payload = _canonical_json(payload)
        payload_hash = "sha256:" + _sha256(canonical_payload)

        cur.execute(
            "SELECT COALESCE(MAX(sequence_number), 0) AS mx FROM mission_audit_records WHERE mission_id = ?",
            (mission_id,),
        )
        sequence_number = int(cur.fetchone()["mx"]) + 1

        cur.execute(
            "SELECT record_hash FROM mission_audit_records WHERE mission_id = ? "
            "ORDER BY sequence_number DESC LIMIT 1",
            (mission_id,),
        )
        prev = cur.fetchone()
        previous_record_hash = prev["record_hash"] if prev is not None else GENESIS_HASH

        ledger_record_id = self._ledger_record_id(
            mission_id, mission_version, record_type, payload_hash, occurred_at, actor, correlation_id
        )

        row = {
            "schema_version": SCHEMA_VERSION,
            "ledger_record_id": ledger_record_id,
            "mission_id": mission_id,
            "mission_version": mission_version,
            "record_type": record_type,
            "sequence_number": sequence_number,
            "correlation_id": correlation_id,
            "occurred_at": occurred_at,
            "actor": actor,
            "payload_hash": payload_hash,
            "canonical_payload": canonical_payload,
            "previous_record_hash": previous_record_hash,
            "decision_ref": decision_ref,
            "created_at": created_at,
        }
        row["record_hash"] = self._compute_record_hash(row)

        cur.execute(
            "SELECT 1 FROM mission_audit_records WHERE ledger_record_id = ?", (ledger_record_id,)
        )
        if cur.fetchone() is not None:
            raise DuplicateRecordError(f"duplicate ledger_record_id: {ledger_record_id}")

        try:
            cur.execute(
                """
                INSERT INTO mission_audit_records (
                    ledger_record_id, schema_version, mission_id, mission_version, record_type,
                    sequence_number, correlation_id, occurred_at, actor, payload_hash,
                    canonical_payload, previous_record_hash, record_hash, decision_ref, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["ledger_record_id"], row["schema_version"], row["mission_id"],
                    row["mission_version"], row["record_type"], row["sequence_number"],
                    row["correlation_id"], row["occurred_at"], row["actor"], row["payload_hash"],
                    row["canonical_payload"], row["previous_record_hash"], row["record_hash"],
                    row["decision_ref"], row["created_at"],
                ),
            )
        except sqlite3.IntegrityError as exc:
            msg = str(exc)
            if "sequence_number" in msg:
                raise DuplicateSequenceError(msg) from exc
            if "ledger_record_id" in msg or "PRIMARY KEY" in msg:
                raise DuplicateRecordError(msg) from exc
            raise TransactionError(msg) from exc

        return LedgerRecord(**row)

    @staticmethod
    def _model_payload(model) -> dict:
        return model.model_dump(by_alias=True, mode="json")

    # -- typed append APIs ---------------------------------------------------

    def append_mission_opened(
        self, *, mission_id: str, mission_version: str, correlation_id: str, occurred_at: str,
        actor: str, created_at: str, canonical_account: dict, selected_template_id: str,
        evidence_refs: Optional[List[dict]] = None, decision_ref: Optional[str] = None,
    ) -> LedgerRecord:
        payload = {
            "canonicalAccount": canonical_account,
            "selectedTemplateId": selected_template_id,
            "evidenceRefs": evidence_refs or [],
        }
        with self._conn:
            return self._insert_record(
                self._conn.cursor(), mission_id=mission_id, mission_version=mission_version,
                record_type="mission_opened", correlation_id=correlation_id, occurred_at=occurred_at,
                actor=actor, payload=payload, created_at=created_at, decision_ref=decision_ref,
            )

    def append_mission_event(
        self, event: MissionEvent, *, created_at: str, decision_ref: Optional[str] = None
    ) -> LedgerRecord:
        record_type = "mission_opened" if (event.from_state is None or event.event_type == "mission_opened") else "mission_transition"
        with self._conn:
            return self._insert_record(
                self._conn.cursor(), mission_id=event.mission_id, mission_version=event.mission_version,
                record_type=record_type, correlation_id=event.correlation_id, occurred_at=event.occurred_at,
                actor=event.actor, payload=self._model_payload(event), created_at=created_at,
                decision_ref=decision_ref,
            )

    def append_verification(
        self, verification: VerificationResult, *, mission_id: str, mission_version: str,
        correlation_id: str, occurred_at: str, actor: str, created_at: str,
        record_type: str = "verification_result", decision_ref: Optional[str] = None,
    ) -> LedgerRecord:
        if record_type not in ("verification_result", "outcome_verification"):
            raise InvalidRecordTypeError(f"invalid verification record_type: {record_type!r}")
        with self._conn:
            return self._insert_record(
                self._conn.cursor(), mission_id=mission_id, mission_version=mission_version,
                record_type=record_type, correlation_id=correlation_id, occurred_at=occurred_at,
                actor=actor, payload=self._model_payload(verification), created_at=created_at,
                decision_ref=decision_ref,
            )

    def append_outcome_verification(
        self, verification: VerificationResult, *, mission_id: str, mission_version: str,
        correlation_id: str, occurred_at: str, actor: str, created_at: str,
        decision_ref: Optional[str] = None,
    ) -> LedgerRecord:
        return self.append_verification(
            verification, mission_id=mission_id, mission_version=mission_version,
            correlation_id=correlation_id, occurred_at=occurred_at, actor=actor, created_at=created_at,
            record_type="outcome_verification", decision_ref=decision_ref,
        )

    def append_approval_request(
        self, request: ApprovalRequest, *, correlation_id: str, occurred_at: str, actor: str,
        created_at: str, decision_ref: Optional[str] = None,
    ) -> LedgerRecord:
        with self._conn:
            return self._insert_record(
                self._conn.cursor(), mission_id=request.mission_id, mission_version=request.mission_version,
                record_type="approval_request", correlation_id=correlation_id, occurred_at=occurred_at,
                actor=actor, payload=self._model_payload(request), created_at=created_at,
                decision_ref=decision_ref,
            )

    def append_approval_decision(
        self, decision: ApprovalDecision, *, correlation_id: str, occurred_at: str,
        created_at: str, decision_ref: Optional[str] = None,
    ) -> LedgerRecord:
        with self._conn:
            return self._insert_record(
                self._conn.cursor(), mission_id=decision.mission_id, mission_version=decision.mission_version,
                record_type="approval_decision", correlation_id=correlation_id, occurred_at=occurred_at,
                actor=decision.actor, payload=self._model_payload(decision), created_at=created_at,
                decision_ref=decision_ref,
            )

    def append_action_receipt(
        self, receipt: ActionReceipt, approval: ApprovalDecision, *, mission_version: str,
        idempotency_key: str, correlation_id: str, occurred_at: str, actor: str, created_at: str,
        decision_ref: Optional[str] = None,
    ) -> ReceiptAppendResult:
        # Governance guards (fail closed) -------------------------------------
        if receipt.simulated is not True:
            raise NonSimulatedReceiptError("only simulated=True receipts may be persisted.")
        if approval.outcome != ApprovalOutcome.approved:
            raise RejectedApprovalError("a rejected approval cannot persist an execution receipt.")
        if approval.mission_id != receipt.mission_id:
            raise ApprovalMismatchError("approval mission_id does not match receipt.")
        if approval.mission_version != mission_version:
            raise ApprovalMismatchError("approval mission_version does not match the mission.")
        if not receipt.approved_payload_hash or receipt.approved_payload_hash != approval.approved_payload_hash:
            raise PayloadHashMismatchError("receipt payload hash does not match the approval.")

        ph = receipt.approved_payload_hash

        # Durable idempotency (mission-scoped) --------------------------------
        cur = self._conn.cursor()
        cur.execute(
            "SELECT payload_hash, receipt_json, ledger_record_id FROM mission_idempotency "
            "WHERE mission_id = ? AND idempotency_key = ?",
            (receipt.mission_id, idempotency_key),
        )
        existing = cur.fetchone()
        if existing is not None:
            if existing["payload_hash"] == ph:
                stored_receipt = ActionReceipt(**json.loads(existing["receipt_json"]))
                stored_record = self.get_record(existing["ledger_record_id"])
                return ReceiptAppendResult(ledger_record=stored_record, receipt=stored_receipt, replayed=True)
            raise IdempotencyConflictError(
                f"idempotency key {idempotency_key!r} reused with a different payload for mission "
                f"{receipt.mission_id!r}."
            )

        # Atomic append of record + idempotency row + audit_ref mapping -------
        with self._conn:
            cur = self._conn.cursor()
            record = self._insert_record(
                cur, mission_id=receipt.mission_id, mission_version=mission_version,
                record_type="simulated_action_receipt", correlation_id=correlation_id,
                occurred_at=occurred_at, actor=actor, payload=self._model_payload(receipt),
                created_at=created_at, decision_ref=decision_ref,
            )
            cur.execute(
                "INSERT INTO mission_idempotency (mission_id, idempotency_key, payload_hash, "
                "receipt_json, ledger_record_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (receipt.mission_id, idempotency_key, ph,
                 receipt.model_dump_json(by_alias=True), record.ledger_record_id, created_at),
            )
            cur.execute(
                "INSERT INTO audit_refs (mission_id, audit_ref, ledger_record_id, receipt_id, "
                "approved_payload_hash) VALUES (?, ?, ?, ?, ?)",
                (receipt.mission_id, receipt.audit_ref, record.ledger_record_id, receipt.receipt_id, ph),
            )
        return ReceiptAppendResult(ledger_record=record, receipt=receipt, replayed=False)

    def append_mission_closed(
        self, *, mission_id: str, mission_version: str, correlation_id: str, occurred_at: str,
        actor: str, created_at: str, outcome_status: str, decision_ref: Optional[str] = None,
    ) -> LedgerRecord:
        payload = {"outcomeStatus": outcome_status}
        with self._conn:
            return self._insert_record(
                self._conn.cursor(), mission_id=mission_id, mission_version=mission_version,
                record_type="mission_closed", correlation_id=correlation_id, occurred_at=occurred_at,
                actor=actor, payload=payload, created_at=created_at, decision_ref=decision_ref,
            )

    # -- read-only APIs ------------------------------------------------------

    @staticmethod
    def _row_to_record(row: sqlite3.Row) -> LedgerRecord:
        return LedgerRecord(
            schema_version=row["schema_version"], ledger_record_id=row["ledger_record_id"],
            mission_id=row["mission_id"], mission_version=row["mission_version"],
            record_type=row["record_type"], sequence_number=row["sequence_number"],
            correlation_id=row["correlation_id"], occurred_at=row["occurred_at"], actor=row["actor"],
            payload_hash=row["payload_hash"], canonical_payload=row["canonical_payload"],
            previous_record_hash=row["previous_record_hash"], record_hash=row["record_hash"],
            decision_ref=row["decision_ref"], created_at=row["created_at"],
        )

    def get_record(self, ledger_record_id: str) -> LedgerRecord:
        cur = self._conn.execute(
            "SELECT * FROM mission_audit_records WHERE ledger_record_id = ?", (ledger_record_id,)
        )
        row = cur.fetchone()
        if row is None:
            raise AuditLedgerError(f"unknown ledger_record_id: {ledger_record_id!r}")
        return self._row_to_record(row)

    def list_mission_records(self, mission_id: str) -> List[LedgerRecord]:
        cur = self._conn.execute(
            "SELECT * FROM mission_audit_records WHERE mission_id = ? ORDER BY sequence_number ASC",
            (mission_id,),
        )
        return [self._row_to_record(r) for r in cur.fetchall()]

    def get_latest_record(self, mission_id: str) -> Optional[LedgerRecord]:
        cur = self._conn.execute(
            "SELECT * FROM mission_audit_records WHERE mission_id = ? "
            "ORDER BY sequence_number DESC LIMIT 1",
            (mission_id,),
        )
        row = cur.fetchone()
        return self._row_to_record(row) if row is not None else None

    def verify_mission_chain(self, mission_id: str) -> ChainVerification:
        records = self.list_mission_records(mission_id)
        previous = GENESIS_HASH
        for rec in records:
            if rec.previous_record_hash != previous:
                return ChainVerification(
                    valid=False, length=len(records), broken_at_sequence=rec.sequence_number,
                    detail=f"previous_record_hash mismatch at sequence {rec.sequence_number}",
                )
            recomputed = self._compute_record_hash(
                {
                    "schema_version": rec.schema_version, "ledger_record_id": rec.ledger_record_id,
                    "mission_id": rec.mission_id, "mission_version": rec.mission_version,
                    "record_type": rec.record_type, "sequence_number": rec.sequence_number,
                    "correlation_id": rec.correlation_id, "occurred_at": rec.occurred_at,
                    "actor": rec.actor, "payload_hash": rec.payload_hash,
                    "canonical_payload": rec.canonical_payload,
                    "previous_record_hash": rec.previous_record_hash, "decision_ref": rec.decision_ref,
                    "created_at": rec.created_at,
                }
            )
            if recomputed != rec.record_hash:
                return ChainVerification(
                    valid=False, length=len(records), broken_at_sequence=rec.sequence_number,
                    detail=f"record_hash mismatch at sequence {rec.sequence_number} (tamper detected)",
                )
            previous = rec.record_hash
        return ChainVerification(valid=True, length=len(records), detail="chain valid")

    def find_receipt_by_idempotency_key(
        self, mission_id: str, idempotency_key: str
    ) -> Optional[ActionReceipt]:
        cur = self._conn.execute(
            "SELECT receipt_json FROM mission_idempotency WHERE mission_id = ? AND idempotency_key = ?",
            (mission_id, idempotency_key),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return ActionReceipt(**json.loads(row["receipt_json"]))

    def export_mission_audit_bundle(self, mission_id: str) -> MissionAuditBundle:
        records = self.list_mission_records(mission_id)

        def _payload(rec: LedgerRecord) -> dict:
            return json.loads(rec.canonical_payload)

        def _first(record_type: str) -> Optional[LedgerRecord]:
            for rec in records:
                if rec.record_type == record_type:
                    return rec
            return None

        opened = _first("mission_opened")
        approval_req = _first("approval_request")
        approval_dec = _first("approval_decision")
        receipt_rec = _first("simulated_action_receipt")
        outcome_rec = _first("outcome_verification")

        decision_ref = next((rec.decision_ref for rec in records if rec.decision_ref), None)
        mission_version = records[0].mission_version if records else None

        lifecycle = [
            {
                "sequenceNumber": rec.sequence_number, "recordType": rec.record_type,
                "eventType": _payload(rec).get("eventType"),
                "fromState": _payload(rec).get("fromState"),
                "toState": _payload(rec).get("toState"), "occurredAt": rec.occurred_at,
            }
            for rec in records
            if rec.record_type in ("mission_opened", "mission_transition", "mission_closed")
        ]
        verifications = [
            _payload(rec) for rec in records
            if rec.record_type in ("verification_result", "outcome_verification")
        ]

        return MissionAuditBundle(
            mission_id=mission_id,
            mission_version=mission_version,
            canonical_account=(_payload(opened).get("canonicalAccount") if opened else None),
            selected_template_id=(_payload(opened).get("selectedTemplateId") if opened else None),
            evidence_refs=(_payload(opened).get("evidenceRefs", []) if opened else []),
            lifecycle_events=lifecycle,
            verification_results=verifications,
            approval_request=(_payload(approval_req) if approval_req else None),
            approval_decision=(_payload(approval_dec) if approval_dec else None),
            action_receipt=(_payload(receipt_rec) if receipt_rec else None),
            outcome_verification=(_payload(outcome_rec) if outcome_rec else None),
            decision_ledger_ref=decision_ref,
            records=records,
            chain=self.verify_mission_chain(mission_id),
        )


__all__ = [
    "SCHEMA_VERSION",
    "GENESIS_HASH",
    "RECORD_TYPES",
    "AuditLedgerError",
    "MissingMissionIdError",
    "InvalidMissionVersionError",
    "InvalidRecordTypeError",
    "DuplicateRecordError",
    "DuplicateSequenceError",
    "MalformedPayloadError",
    "ChainIntegrityError",
    "IdempotencyConflictError",
    "ApprovalMismatchError",
    "PayloadHashMismatchError",
    "RejectedApprovalError",
    "NonSimulatedReceiptError",
    "TransactionError",
    "LedgerRecord",
    "ChainVerification",
    "ReceiptAppendResult",
    "MissionAuditBundle",
    "MissionAuditLedger",
]
