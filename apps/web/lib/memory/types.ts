// Release 2.1A — Shared Enterprise Memory Core
// ============================================
// Core type contracts for the deterministic enterprise memory engine.
//
// This is NOT a UI, conversation, voice, or retrieval release. It is ONLY the
// deterministic memory substrate that every future AI persona will consume.
//
// APEF v1.0 principles enforced by these contracts:
//   * Architecture First      — the pipeline direction is encoded in the types.
//   * Deterministic AI        — no field is ever derived from randomness or an
//                               internal clock. Timestamps arrive on events.
//   * Evidence Before Confidence — every record carries provenance + evidence.
//   * Explainability          — importance and confidence expose their factors.
//   * Protected Engine Boundaries — nothing here writes back to source engines.
//
// Pipeline (types flow strictly left -> right):
//   Signal Sources -> MemoryEvent -> Reducers -> MemoryRecord -> Memory Store
//   -> Retrieval (placeholder) -> Conversation Runtime (future) -> Presentation (future)

// ---------------------------------------------------------------------------
// Source taxonomy
// ---------------------------------------------------------------------------

/** The known engines memory READS from (never writes to). */
export type MemorySourceModule =
  | "decision_ledger"
  | "mission_state"
  | "account_timeline"
  | "recommendation_delta"
  | "drift_engine"
  | "executive_brief"
  | "manager_coaching"
  | "operations_health";

/**
 * Trust tier of a source. This is a *deterministic* property of where the data
 * came from, not an AI judgement. It is the primary driver of confidence.
 */
export type SourceQuality =
  | "authoritative" // governed system of record (e.g. Decision Ledger)
  | "derived"       // computed from authoritative data (deltas, timelines)
  | "inferred"      // simulated / heuristic telemetry (drift engine)
  | "external";     // outside-in, unverified context

/** Where a memory event originated. */
export interface MemorySource {
  /** Source module (one of the read-only ingestion engines). */
  module: MemorySourceModule;
  /** Source entity within that module (e.g. account id, ledger id). */
  entity: string;
  /** Deterministic trust tier used by confidence scoring. */
  quality: SourceQuality;
}

// ---------------------------------------------------------------------------
// Business classification
// ---------------------------------------------------------------------------

/** Business category of a memory. Deterministic, assigned by adapters/reducers. */
export type MemoryCategory =
  | "governance"
  | "decision"
  | "risk"
  | "opportunity"
  | "engagement"
  | "outcome"
  | "lifecycle"
  | "coaching"
  | "operations";

// ---------------------------------------------------------------------------
// Provenance — no record may exist without it
// ---------------------------------------------------------------------------

/** One supporting evidence item behind a memory. Evidence precedes confidence. */
export interface MemoryEvidence {
  /** Opaque, stable reference to the underlying artifact (id/url/key). */
  ref: string;
  /** Human-readable label. */
  label: string;
  /** Optional secondary detail. */
  detail?: string;
}

/**
 * Full provenance for a record. Every MemoryRecord MUST carry this; the reducer
 * refuses to build a record whose event lacks the required provenance fields.
 */
export interface MemoryProvenance {
  /** Origin engine. */
  origin: MemorySourceModule;
  /** Source module (kept explicit per the Release 2.1 spec). */
  sourceModule: MemorySourceModule;
  /** Source entity within the module. */
  sourceEntity: string;
  /** ISO timestamp of the originating event (external clock — never internal). */
  timestamp: string;
  /** The event id this provenance was last established from. */
  eventId: string;
  /** Supporting evidence. */
  supportingEvidence: MemoryEvidence[];
}

// ---------------------------------------------------------------------------
// Deterministic signals -> importance & confidence
// ---------------------------------------------------------------------------

/**
 * Deterministic, adapter-supplied signal magnitudes. These are the ONLY inputs
 * to importance/confidence math. No hidden heuristics, no ML — everything a
 * downstream explanation panel needs is here.
 */
export interface EventSignals {
  /** True when this memory touches governance (caveat, approval gate, policy). */
  governance?: boolean;
  /** Customer impact magnitude 0..1. */
  customerImpact?: number;
  /** Revenue impact magnitude 0..1. */
  revenueImpact?: number;
  /** Seller impact magnitude 0..1. */
  sellerImpact?: number;
  /** Manager impact magnitude 0..1. */
  managerImpact?: number;
}

/** Explainable importance factor contribution. */
export type ImportanceDimension =
  | "governance"
  | "customer_impact"
  | "revenue_impact"
  | "seller_impact"
  | "manager_impact";

export interface ImportanceFactor {
  dimension: ImportanceDimension;
  /** Weight applied to this dimension (fixed, published constant). */
  weight: number;
  /** Normalized input value 0..1. */
  value: number;
  /** Points this dimension contributed to the 0..100 score. */
  contribution: number;
  /** Plain-English explanation. */
  rationale: string;
}

export type MemoryImportanceTier = "critical" | "high" | "medium" | "low";

/** Deterministic business importance of a memory. */
export interface MemoryImportance {
  tier: MemoryImportanceTier;
  /** 0..100 deterministic score. */
  score: number;
  /** Fully itemized, explainable contributions. */
  factors: ImportanceFactor[];
}

/** Explainable confidence factor contribution. */
export type ConfidenceDimension =
  | "source_quality"
  | "event_freshness"
  | "supporting_evidence";

export interface ConfidenceFactor {
  dimension: ConfidenceDimension;
  weight: number;
  /** Normalized input value 0..1. */
  value: number;
  /** Weighted contribution to the 0..1 score. */
  contribution: number;
  rationale: string;
}

export type ConfidenceBand = "low" | "medium" | "high";

/** Deterministic confidence — never AI confidence. */
export interface MemoryConfidence {
  /** 0..1 deterministic score. */
  score: number;
  band: ConfidenceBand;
  factors: ConfidenceFactor[];
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Deterministic lifecycle state of a record. */
export type MemoryLifecycle =
  | "new"
  | "merged"
  | "active"
  | "aged"
  | "archived"
  | "compressed";

/** Sticky flags a store applies via explicit, guarded transitions. */
export interface LifecycleFlags {
  activated?: boolean;
  archived?: boolean;
  compressed?: boolean;
}

// ---------------------------------------------------------------------------
// MemoryEvent — the reducer input
// ---------------------------------------------------------------------------

/**
 * A normalized event emitted by a read-only adapter. This is the ONLY thing an
 * adapter produces. It carries its own event time; reducers receive a separate
 * `asOfMs` reference clock (see ReducerContext) so they never read a wall clock.
 */
export interface MemoryEvent {
  /** Stable, deterministic event id (adapters derive it from source ids). */
  eventId: string;
  source: MemorySource;
  category: MemoryCategory;
  /** The memory subject (typically an account id). */
  subjectId: string;
  subjectLabel: string;
  /** ISO timestamp of when the underlying thing happened. */
  timestamp: string;
  /** One-line human summary of the memory. */
  summary: string;
  /** Supporting evidence for this event. */
  evidence: MemoryEvidence[];
  /** Deterministic signal magnitudes feeding importance/confidence. */
  signals: EventSignals;
  /**
   * Optional dedupe discriminator. Events sharing (subjectId, category,
   * dedupeKey) fold into one record. Defaults to the source module.
   */
  dedupeKey?: string;
}

// ---------------------------------------------------------------------------
// MemoryRecord — the reducer output / store citizen
// ---------------------------------------------------------------------------

/** One entry in a record's deterministic merge trail. */
export interface MemoryHistoryEntry {
  eventId: string;
  timestamp: string;
  summary: string;
}

/**
 * The consolidated unit of enterprise memory. Immutable-by-convention: reducers
 * return new records rather than mutating in place.
 */
export interface MemoryRecord {
  /** Deterministic id derived from (subjectId, category, dedupeKey). */
  recordId: string;
  subjectId: string;
  subjectLabel: string;
  category: MemoryCategory;
  summary: string;
  provenance: MemoryProvenance;
  importance: MemoryImportance;
  confidence: MemoryConfidence;
  lifecycle: MemoryLifecycle;
  /**
   * Effective source quality of the record's current anchor event. Carried on
   * the record so a merge recomputes confidence deterministically without
   * needing to re-inspect the original event.
   */
  sourceQuality: SourceQuality;
  /** Consolidated signals (element-wise strongest across merged events). */
  signals: EventSignals;
  /** ISO timestamp of the earliest contributing event. */
  firstSeen: string;
  /** ISO timestamp of the latest contributing event. */
  lastUpdated: string;
  /** Number of events folded into this record. */
  eventCount: number;
  /** Sticky lifecycle flags applied by the store. */
  flags: LifecycleFlags;
  /** Deterministic merge trail (chronological by ingest). */
  history: MemoryHistoryEntry[];
}

// ---------------------------------------------------------------------------
// Reducer result
// ---------------------------------------------------------------------------

export type ReducerOp =
  | "created"
  | "merged"
  | "duplicate_suppressed";

/** The outcome of reducing one event against the current record (if any). */
export interface MemoryReducerResult {
  op: ReducerOp;
  record: MemoryRecord;
  /** Deterministic, human-readable explanation of what happened. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Reducer context — the injected, deterministic "now"
// ---------------------------------------------------------------------------

/**
 * Everything a reducer needs from the outside world. Passing the clock in (as
 * `asOfMs`) is what keeps reducers pure: they never call Date.now().
 */
export interface ReducerContext {
  /** Reference epoch-ms used for freshness. Supplied by the caller. */
  asOfMs: number;
}
