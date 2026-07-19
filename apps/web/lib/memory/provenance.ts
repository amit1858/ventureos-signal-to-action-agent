// Release 2.1A — Shared Enterprise Memory Core
// ============================================
// Provenance construction and validation.
//
// APEF: Evidence Before Confidence. "No MemoryRecord may exist without
// provenance." This module is the single gate that enforces that invariant.

import type {
  MemoryEvent,
  MemoryProvenance,
  MemorySourceModule,
} from "./types";

/** Raised when an event cannot yield valid provenance. Deterministic message. */
export class ProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvenanceError";
  }
}

const KNOWN_MODULES: ReadonlyArray<MemorySourceModule> = [
  "decision_ledger",
  "mission_state",
  "account_timeline",
  "recommendation_delta",
  "drift_engine",
  "executive_brief",
  "manager_coaching",
  "operations_health",
];

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validate that an event carries everything provenance requires. Throws a
 * ProvenanceError with a stable, explainable message on the first violation.
 */
export function assertEventProvenance(event: MemoryEvent): void {
  if (!isNonEmpty(event.eventId)) {
    throw new ProvenanceError("provenance: missing eventId");
  }
  if (!event.source || !isNonEmpty(event.source.module)) {
    throw new ProvenanceError(
      `provenance: missing source module (eventId=${event.eventId})`,
    );
  }
  if (!KNOWN_MODULES.includes(event.source.module)) {
    throw new ProvenanceError(
      `provenance: unknown source module '${event.source.module}' (eventId=${event.eventId})`,
    );
  }
  if (!isNonEmpty(event.source.entity)) {
    throw new ProvenanceError(
      `provenance: missing source entity (eventId=${event.eventId})`,
    );
  }
  if (!isNonEmpty(event.timestamp) || Number.isNaN(Date.parse(event.timestamp))) {
    throw new ProvenanceError(
      `provenance: missing or invalid timestamp (eventId=${event.eventId})`,
    );
  }
  if (!Array.isArray(event.evidence)) {
    throw new ProvenanceError(
      `provenance: evidence must be an array (eventId=${event.eventId})`,
    );
  }
}

/**
 * Build provenance for a record from an event. Assumes the event has already
 * passed {@link assertEventProvenance}. Pure and deterministic.
 */
export function buildProvenance(event: MemoryEvent): MemoryProvenance {
  return {
    origin: event.source.module,
    sourceModule: event.source.module,
    sourceEntity: event.source.entity,
    timestamp: event.timestamp,
    eventId: event.eventId,
    supportingEvidence: dedupeEvidence(event),
  };
}

/**
 * Merge new evidence from an event into existing provenance evidence, keeping a
 * stable, de-duplicated order. Deterministic: earlier refs keep their position;
 * new refs append in event order.
 */
export function mergeEvidence(
  existing: MemoryProvenance,
  event: MemoryEvent,
): MemoryProvenance["supportingEvidence"] {
  const seen = new Set(existing.supportingEvidence.map((e) => e.ref));
  const merged = [...existing.supportingEvidence];
  for (const item of event.evidence) {
    if (!seen.has(item.ref)) {
      seen.add(item.ref);
      merged.push({ ref: item.ref, label: item.label, detail: item.detail });
    }
  }
  return sortEvidence(merged);
}

/** Validate that a fully-formed record's provenance is intact. */
export function isProvenanceComplete(p: MemoryProvenance | undefined): boolean {
  return (
    !!p &&
    isNonEmpty(p.origin) &&
    isNonEmpty(p.sourceModule) &&
    isNonEmpty(p.sourceEntity) &&
    isNonEmpty(p.timestamp) &&
    isNonEmpty(p.eventId) &&
    Array.isArray(p.supportingEvidence)
  );
}

function dedupeEvidence(event: MemoryEvent): MemoryProvenance["supportingEvidence"] {
  const seen = new Set<string>();
  const out: MemoryProvenance["supportingEvidence"] = [];
  for (const item of event.evidence) {
    if (!seen.has(item.ref)) {
      seen.add(item.ref);
      out.push({ ref: item.ref, label: item.label, detail: item.detail });
    }
  }
  return sortEvidence(out);
}

/**
 * Canonical, order-independent evidence ordering (by ref). This is what makes
 * merges commutative: ingesting the same events in any order yields identical
 * supporting-evidence lists.
 */
function sortEvidence(
  items: MemoryProvenance["supportingEvidence"],
): MemoryProvenance["supportingEvidence"] {
  return [...items].sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
}
