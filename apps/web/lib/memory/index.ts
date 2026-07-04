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

// -- retrieval (placeholder) -----------------------------------------------
export { retrieve, type RetrievalQuery, type RetrievalResult } from "./retrieval";

// -- read-only ingestion adapters ------------------------------------------
export * as adapters from "./adapters";
