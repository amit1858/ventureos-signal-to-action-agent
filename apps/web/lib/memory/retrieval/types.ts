// Release 2.1B — Memory Intelligence
// ====================================
// Retrieval-only contracts. These sit strictly AFTER the 2.1A Memory Store and
// BEFORE the future 2.1C Conversation Runtime:
//
//   MemoryStore (2.1A) -> Retrieval Intelligence (2.1B) -> Conversation (2.1C)
//
// APEF v1.0 enforced here:
//   * Architecture First      — the pipeline direction is encoded in the types.
//   * Deterministic AI        — no field is derived from randomness or a wall
//                               clock. The reference clock arrives as `asOfMs`.
//   * Evidence Before Confidence — every score is decomposed into itemized
//                               factors carrying the evidence that produced it.
//   * Explainability          — RetrievalExplanation exposes factor-level
//                               contributions and plain-English rationale.
//   * Protected Engine Boundaries — retrieval only READS the store; it holds no
//                               session state (turn history is caller-supplied).

import type { MemoryCategory, MemoryLifecycle, MemoryRecord } from "../types";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Raised for a malformed retrieval query (e.g. a missing reference clock, or a
 * non-empty served history without a `currentTurn`). Deterministic message so
 * callers fail loudly-but-safely rather than silently guessing.
 */
export class RetrievalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetrievalError";
  }
}

// ---------------------------------------------------------------------------
// Served history (caller-supplied — retrieval stays stateless)
// ---------------------------------------------------------------------------

/**
 * One record that a caller (the future Conversation Runtime) has already served
 * to the user, tagged with the integer conversation turn it was served on. This
 * is the ONLY input to anti-repetition — retrieval keeps no memory of its own.
 */
export interface ServedRecord {
  recordId: string;
  /** Integer conversation turn the record was served on. No clock involved. */
  servedTurn: number;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * A deterministic retrieval request. `asOfMs` is REQUIRED (the injected clock);
 * `currentTurn` is REQUIRED only when `servedHistory` is non-empty.
 */
export interface RetrievalQuery {
  /** Scope to a single subject (typically an account id). */
  subjectId?: string;
  /** Scope to one or more categories. Empty/absent means all categories. */
  categories?: MemoryCategory[];
  /** Maximum number of ranked results. Defaults to DEFAULT_RETRIEVAL_LIMIT. */
  limit?: number;
  /** Injected reference epoch-ms used for decay. REQUIRED. Never Date.now(). */
  asOfMs: number;
  /**
   * Lifecycle whitelist. When omitted, archived + compressed records are
   * excluded and everything else is eligible.
   */
  includeLifecycles?: MemoryLifecycle[];
  /** Records already served this conversation. Drives anti-repetition. */
  servedHistory?: ServedRecord[];
  /**
   * Current integer conversation turn. REQUIRED when `servedHistory` is
   * non-empty; ignored (and unnecessary) otherwise.
   */
  currentTurn?: number;
  /** Optional deterministic literal match terms tested against `summary`. */
  matchTerms?: string[];
}

// ---------------------------------------------------------------------------
// Explainability
// ---------------------------------------------------------------------------

/** The scoring dimensions a retrieval result can be decomposed into. */
export type RetrievalDimension =
  | "importance"
  | "confidence"
  | "decay"
  | "match"
  | "anti_repetition";

/** One itemized, explainable contribution to a result's final score. */
export interface RetrievalFactor {
  dimension: RetrievalDimension;
  /** Signed weight applied to `value` (anti-repetition uses a negative weight). */
  weight: number;
  /** Normalized input value. */
  value: number;
  /** Signed points this dimension added to the final score (round4). */
  contribution: number;
  /** Plain-English explanation of the contribution. */
  rationale: string;
}

/** Full, human-readable explanation of why a record ranked where it did. */
export interface RetrievalExplanation {
  /** Why the record was recalled as a candidate at all. */
  recallReason: string;
  /** Itemized factors; their contributions sum exactly to `finalScore`. */
  factors: RetrievalFactor[];
  /** Deterministic 0..1 score (sum of factor contributions, round4). */
  finalScore: number;
  /** 1-based rank within the returned result set. */
  rank: number;
  /** Present only when a score tie was resolved by recordId. */
  tieBreak?: string;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** A ranked, explained memory record. */
export interface RankedMemory {
  record: MemoryRecord;
  score: number;
  rank: number;
  explanation: RetrievalExplanation;
}

/** A candidate that was recalled but withheld from the result set. */
export interface SuppressedMemory {
  recordId: string;
  reason: string;
}

/** Deterministic diagnostics describing how the candidate set was formed. */
export interface RetrievalDiagnostics {
  /** Number of candidates after recall filtering, before ranking/suppression. */
  candidateCount: number;
  /** Human-readable list of the filters that were applied during recall. */
  filtersApplied: string[];
  /** Whether history-based anti-repetition ran (false when history was empty). */
  antiRepetitionApplied: boolean;
}

/**
 * The stable 2.1C-facing retrieval contract. Replaces the 2.1A placeholder
 * (which returned `implemented: false`).
 */
export interface RetrievalResult {
  implemented: true;
  query: RetrievalQuery;
  asOfMs: number;
  results: RankedMemory[];
  suppressed: SuppressedMemory[];
  diagnostics: RetrievalDiagnostics;
}
