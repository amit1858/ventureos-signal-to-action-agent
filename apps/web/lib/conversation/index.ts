// Release 2.1C — Conversation Runtime · public entry point
// ========================================================
// This barrel is the ONLY sanctioned way to consume the Conversation Runtime.
// Downstream layers (future 2.1D Memory Experience, 2.2 Voice Companion) depend
// on THIS module — never on internal files, and never on the memory barrel
// directly. Internally, this layer imports memory ONLY from `../memory` (the
// 2.1B public barrel).
//
// Pipeline:
//   MemoryStore (2.1A) -> Retrieval (2.1B) -> Conversation Runtime (2.1C)
//     -> Memory Experience (2.1D) -> Voice Companion (2.2)
//
// APEF v1.0: Architecture First · Deterministic AI · Evidence Before Confidence
// · Explainability · Progressive Dependency · Protected Engine Boundaries.

// -- contracts -------------------------------------------------------------
export type {
  PersonaId,
  PersonaTone,
  PersonaProfile,
  ConversationIntent,
  ConversationContext,
  ConversationSession,
  EvidenceCitation,
  SegmentExplanation,
  ResponseSegment,
  FallbackKind,
  RuntimeDiagnostics,
  PersonaResponse,
} from "./types";

// -- session (runtime-owned anti-repetition ledger) ------------------------
export { createSession, advance, INITIAL_TURN } from "./session";

// -- context binding (into 2.1B retrieval, read-only) ----------------------
export { buildRetrievalQuery, runRetrieval } from "./context";

// -- guardrails (confidence-gated language + sanitizers) -------------------
export {
  HEDGE_BY_BAND,
  HEDGE_TOKENS,
  FORBIDDEN_LOW_CONFIDENCE_TERMS,
  hedgePrefix,
  isLowConfidence,
  containsHedge,
  containsForbiddenOverclaim,
  respectsConfidence,
  sanitizeInline,
} from "./guardrails";

// -- templates (deterministic persona language) ----------------------------
export { renderSegment } from "./templates";
export type { SegmentView, RenderedSegment } from "./templates";

// -- evidence (provenance projection) --------------------------------------
export { citeRecord, dedupeCitations } from "./evidence";

// -- fallbacks (honest empty-memory responses) -----------------------------
export {
  classifyEmpty,
  isAllLowConfidence,
  fallbackLine,
  buildFallbackResponse,
} from "./fallback";

// -- voice summary (2.2 forward contract) ----------------------------------
export { buildVoiceSummary, VOICE_SUMMARY_MAX_CHARS } from "./voice";
export type { VoiceSummaryInput } from "./voice";

// -- composer (the runtime orchestrator) -----------------------------------
export { composeResponse } from "./composer";
