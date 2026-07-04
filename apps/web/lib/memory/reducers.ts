// Release 2.1A — Shared Enterprise Memory Core
// ============================================
// Pure memory reducers: MemoryEvent -> MemoryRecord.
//
// APEF: Deterministic AI + Pure reducers.
//   * No side effects.
//   * No randomness.
//   * No timestamps generated internally (all time comes from the event or the
//     injected ReducerContext.asOfMs).
//   * Same input -> same MemoryRecord, always.
//
//   MemoryEvent  --reduce-->  MemoryReducerResult { op, record, reason }

import type {
  MemoryEvent,
  MemoryHistoryEntry,
  MemoryRecord,
  MemoryReducerResult,
  ReducerContext,
} from "./types";
import { computeConfidence } from "./confidence";
import { computeImportance, mergeSignals } from "./importance";
import { deriveLifecycle } from "./lifecycle";
import {
  assertEventProvenance,
  buildProvenance,
  mergeEvidence,
} from "./provenance";

// ---------------------------------------------------------------------------
// Deterministic record id (FNV-1a, no randomness)
// ---------------------------------------------------------------------------

/** 32-bit FNV-1a hash rendered as 8 hex chars. Stable across runs/machines. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts (keeps it in uint32 range).
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** The dedupe discriminator for an event (defaults to its source module). */
export function dedupeKeyOf(event: MemoryEvent): string {
  return event.dedupeKey && event.dedupeKey.length > 0
    ? event.dedupeKey
    : event.source.module;
}

/** Deterministic record id from (subjectId, category, dedupeKey). */
export function deriveRecordId(event: MemoryEvent): string {
  const key = `${event.subjectId}::${event.category}::${dedupeKeyOf(event)}`;
  return `mem_${fnv1a(key)}`;
}

// ---------------------------------------------------------------------------
// Time helpers (operate on provided values only — never Date.now())
// ---------------------------------------------------------------------------

function minIso(a: string, b: string): string {
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

function maxIso(a: string, b: string): string {
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Reduce one event against the existing record for its key (or undefined).
 * Returns a new record; never mutates `existing`.
 *
 * Ops:
 *   created              — first event for this key
 *   merged               — a new event folded into an existing record
 *   duplicate_suppressed — the event id is already present; record unchanged
 */
export function reduceEvent(
  event: MemoryEvent,
  ctx: ReducerContext,
  existing?: MemoryRecord,
): MemoryReducerResult {
  assertEventProvenance(event);

  if (!existing) {
    return { op: "created", record: createRecord(event, ctx), reason: "First event for this memory key." };
  }

  // Deterministic duplicate suppression: an event id can only contribute once.
  if (existing.history.some((h) => h.eventId === event.eventId)) {
    return {
      op: "duplicate_suppressed",
      record: existing,
      reason: `Event ${event.eventId} already folded into ${existing.recordId}.`,
    };
  }

  return {
    op: "merged",
    record: mergeRecord(existing, event, ctx),
    reason: `Event ${event.eventId} merged into ${existing.recordId}.`,
  };
}

function createRecord(event: MemoryEvent, ctx: ReducerContext): MemoryRecord {
  const provenance = buildProvenance(event);
  const signals = mergeSignals(event.signals, {});
  const history: MemoryHistoryEntry[] = [
    { eventId: event.eventId, timestamp: event.timestamp, summary: event.summary },
  ];

  return finalize({
    recordId: deriveRecordId(event),
    subjectId: event.subjectId,
    subjectLabel: event.subjectLabel,
    category: event.category,
    summary: event.summary,
    provenance,
    signals,
    sourceQuality: event.source.quality,
    firstSeen: event.timestamp,
    lastUpdated: event.timestamp,
    eventCount: 1,
    flags: {},
    history,
  }, ctx);
}

function mergeRecord(
  existing: MemoryRecord,
  event: MemoryEvent,
  ctx: ReducerContext,
): MemoryRecord {
  const signals = mergeSignals(existing.signals, event.signals);
  const isNewer = Date.parse(event.timestamp) >= Date.parse(existing.lastUpdated);

  // The record's headline summary tracks the most recent event; provenance is
  // re-anchored to whichever event is newest so freshness stays honest.
  const summary = isNewer ? event.summary : existing.summary;
  const anchorEvent = isNewer ? event : undefined;

  const provenance = {
    ...existing.provenance,
    supportingEvidence: mergeEvidence(existing.provenance, event),
    ...(anchorEvent
      ? {
          origin: anchorEvent.source.module,
          sourceModule: anchorEvent.source.module,
          sourceEntity: anchorEvent.source.entity,
          timestamp: anchorEvent.timestamp,
          eventId: anchorEvent.eventId,
        }
      : {}),
  };

  const history = [
    ...existing.history,
    { eventId: event.eventId, timestamp: event.timestamp, summary: event.summary },
  ].sort(sortHistory);

  return finalize({
    recordId: existing.recordId,
    subjectId: existing.subjectId,
    subjectLabel: isNewer ? event.subjectLabel : existing.subjectLabel,
    category: existing.category,
    summary,
    provenance,
    sourceQuality: isNewer ? event.source.quality : existing.sourceQuality,
    signals,
    firstSeen: minIso(existing.firstSeen, event.timestamp),
    lastUpdated: maxIso(existing.lastUpdated, event.timestamp),
    eventCount: existing.eventCount + 1,
    flags: existing.flags,
    history,
  }, ctx);
}

/** Chronological, then eventId-stable ordering of history entries. */
function sortHistory(a: MemoryHistoryEntry, b: MemoryHistoryEntry): number {
  const ta = Date.parse(a.timestamp);
  const tb = Date.parse(b.timestamp);
  if (ta !== tb) return ta - tb;
  return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
}

interface RecordDraft {
  recordId: string;
  subjectId: string;
  subjectLabel: string;
  category: MemoryRecord["category"];
  summary: string;
  provenance: MemoryRecord["provenance"];
  sourceQuality: MemoryRecord["sourceQuality"];
  signals: MemoryRecord["signals"];
  firstSeen: string;
  lastUpdated: string;
  eventCount: number;
  flags: MemoryRecord["flags"];
  history: MemoryHistoryEntry[];
}

/**
 * Attach the deterministic derived fields (importance, confidence, lifecycle)
 * to a draft. This is the single place those three engines are invoked so their
 * inputs are consistent.
 */
function finalize(draft: RecordDraft, ctx: ReducerContext): MemoryRecord {
  const evidenceCount = draft.provenance.supportingEvidence.length;
  const importance = computeImportance(draft.signals);
  const confidence = computeConfidence({
    quality: draft.sourceQuality,
    timestampIso: draft.lastUpdated,
    asOfMs: ctx.asOfMs,
    evidenceCount,
  });
  const lifecycle = deriveLifecycle({
    eventCount: draft.eventCount,
    lastUpdatedIso: draft.lastUpdated,
    asOfMs: ctx.asOfMs,
    flags: draft.flags,
  });

  return {
    recordId: draft.recordId,
    subjectId: draft.subjectId,
    subjectLabel: draft.subjectLabel,
    category: draft.category,
    summary: draft.summary,
    provenance: draft.provenance,
    importance,
    confidence,
    lifecycle,
    sourceQuality: draft.sourceQuality,
    signals: draft.signals,
    firstSeen: draft.firstSeen,
    lastUpdated: draft.lastUpdated,
    eventCount: draft.eventCount,
    flags: draft.flags,
    history: draft.history,
  };
}

