// Release 2.1A — Shared Enterprise Memory Core · public entry point
// =================================================================
// This barrel is the ONLY sanctioned way to consume the memory core. Everything
// downstream (future Retrieval, Conversation Runtime, Presentation, personas)
// depends on this module — never on internal files directly.
//
// Pipeline:
//   Signal Sources -> MemoryEvent -> Reducers -> MemoryRecord -> MemoryStore
//   -> Retrieval (placeholder) -> Conversation Runtime (future) -> Presentation (future)
//
// APEF v1.0: Architecture First · Deterministic AI · Evidence Before Confidence
// · Explainability · Progressive Dependency · Human Approval · Protected Engine
// Boundaries.

// -- types (contracts) -----------------------------------------------------
export type {
  MemorySourceModule,
  SourceQuality,
  MemorySource,
  MemoryCategory,
  MemoryEvidence,
  MemoryProvenance,
  EventSignals,
  ImportanceDimension,
  ImportanceFactor,
  MemoryImportanceTier,
  MemoryImportance,
  ConfidenceDimension,
  ConfidenceFactor,
  ConfidenceBand,
  MemoryConfidence,
  MemoryLifecycle,
  LifecycleFlags,
  MemoryEvent,
  MemoryHistoryEntry,
  MemoryRecord,
  ReducerOp,
  MemoryReducerResult,
  ReducerContext,
} from "./types";

// -- provenance ------------------------------------------------------------
export {
  ProvenanceError,
  assertEventProvenance,
  buildProvenance,
  mergeEvidence,
  isProvenanceComplete,
} from "./provenance";

// -- deterministic scoring engines -----------------------------------------
export {
  computeConfidence,
  freshnessScore,
  evidenceScore,
  ageInDays as confidenceAgeInDays,
  CONFIDENCE_WEIGHTS,
  SOURCE_QUALITY_SCORE,
  type ConfidenceInput,
} from "./confidence";

export {
  computeImportance,
  mergeSignals,
  IMPORTANCE_WEIGHTS,
  IMPORTANCE_TIERS,
} from "./importance";

export {
  deriveLifecycle,
  explainLifecycle,
  canTransition,
  ageInDays as lifecycleAgeInDays,
  ALLOWED_TRANSITIONS,
  AGED_AFTER_DAYS,
  type LifecycleInput,
} from "./lifecycle";

// -- reducers --------------------------------------------------------------
export { reduceEvent, deriveRecordId, dedupeKeyOf } from "./reducers";

// -- store (the single source of truth) ------------------------------------
export {
  MemoryStore,
  type MemorySummary,
  type CompressionHook,
} from "./store";

// -- retrieval intelligence (Release 2.1B) ---------------------------------
// Deterministic retrieval over the store: recall, ranking, anti-repetition,
// decay, and explainability. Consumed by the future 2.1C Conversation Runtime.
export {
  retrieve,
  RetrievalError,
  type RetrievalQuery,
  type RetrievalResult,
  type RankedMemory,
  type SuppressedMemory,
  type ServedRecord,
  type RetrievalFactor,
  type RetrievalDimension,
  type RetrievalExplanation,
  type RetrievalDiagnostics,
} from "./retrieval";

// Published retrieval constants + pure sub-engines (stable, explainable knobs).
export {
  RETRIEVAL_WEIGHTS,
  NEUTRAL_MATCH,
  DEFAULT_RETRIEVAL_LIMIT,
  buildBaseFactors,
  sumContributions,
  compareRanked,
} from "./retrieval/ranking";

export {
  RETRIEVAL_DECAY,
  retrievalDecayScore,
  explainDecay,
} from "./retrieval/decay";

export {
  REPEAT_WINDOW_TURNS,
  REPEAT_RECOVERY_TURNS,
  REPEAT_PENALTY_BY_DISTANCE,
  MAX_PER_CATEGORY,
  MAX_PER_SUBJECT,
  repeatPenalty,
  evaluateAntiRepetition,
  applyDiversityCaps,
  type AntiRepetitionDecision,
} from "./retrieval/antiRepetition";

export {
  recall,
  DEFAULT_EXCLUDED_LIFECYCLES,
  type RetrievalCandidate,
  type RecallOutcome,
} from "./retrieval/recall";

export { assembleExplanation, narrateFactors } from "./retrieval/explain";

// -- read-only ingestion adapters ------------------------------------------
export * as adapters from "./adapters";
