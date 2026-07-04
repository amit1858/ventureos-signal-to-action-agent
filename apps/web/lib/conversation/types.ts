// Release 2.1C — Conversation Runtime
// ====================================
// Contracts for the deterministic Conversation Runtime. This layer sits strictly
// AFTER 2.1B Retrieval Intelligence and BEFORE the future 2.1D Memory Experience
// and 2.2 Voice Companion:
//
//   MemoryStore (2.1A) -> Retrieval (2.1B) -> Conversation Runtime (2.1C)
//     -> Memory Experience (2.1D) -> Voice Companion (2.2)
//
// APEF v1.0 enforced by these contracts:
//   * Architecture First      — the pipeline direction is encoded in the types.
//   * Deterministic AI        — no field derives from randomness or a wall clock.
//                               Time enters only as `asOfMs`; turns are integers.
//   * Evidence Before Confidence — every non-fallback segment carries >= 1
//                               citation projected from record provenance.
//   * Explainability          — each segment forwards the 2.1B retrieval
//                               explanation unmodified, plus a thin `composedFrom`.
//   * Protected Engine Boundaries — the runtime only READS the store/retrieval.
//                               It owns session state; it never re-ranks, never
//                               recomputes scores, never implements anti-repetition
//                               math (retrieval owns that), and invents no facts.

import type {
  ConfidenceBand,
  MemoryCategory,
  MemoryImportanceTier,
  MemorySourceModule,
  RetrievalFactor,
  ServedRecord,
  SourceQuality,
} from "../memory";

// ---------------------------------------------------------------------------
// Persona + intent
// ---------------------------------------------------------------------------

/** Opaque persona identifier supplied by the caller (seller AI, coach, etc.). */
export type PersonaId = string;

/**
 * Persona tone. Selects deterministic framing language ONLY. Tone never adds
 * facts and never reorders memories — retrieval order is always preserved.
 */
export type PersonaTone = "executive" | "coaching" | "advisory" | "neutral";

/** The persona speaking this turn. */
export interface PersonaProfile {
  id: PersonaId;
  /** Display role, e.g. "Manager Coach". */
  role: string;
  tone: PersonaTone;
  /**
   * Optional display cap on how many retrieved memories are woven into a
   * response. Applied AFTER retrieval, preserving rank order — this is a
   * truncation, never a re-ranking.
   */
  maxSegments?: number;
}

/**
 * A closed set of conversation intents. Each selects a deterministic template
 * family. There is no free-form prompt parsing and no model call.
 */
export type ConversationIntent =
  | "resume"
  | "status"
  | "risk_review"
  | "next_step"
  | "recap";

// ---------------------------------------------------------------------------
// Conversation context (the request)
// ---------------------------------------------------------------------------

/**
 * A deterministic conversation request. `asOfMs` is REQUIRED (injected clock)
 * and is forwarded verbatim into the 2.1B retrieval query. Scope fields map
 * one-to-one onto the retrieval query.
 */
export interface ConversationContext {
  persona: PersonaProfile;
  intent: ConversationIntent;
  /** Scope to a single subject (typically an account id). */
  subjectId?: string;
  /** Scope to one or more categories. Empty/absent means all. */
  categories?: MemoryCategory[];
  /** Optional deterministic literal match terms tested against summaries. */
  matchTerms?: string[];
  /** Maximum ranked memories to retrieve. */
  limit?: number;
  /** Injected reference epoch-ms used for decay. REQUIRED. Never Date.now(). */
  asOfMs: number;
}

// ---------------------------------------------------------------------------
// Conversation session (the runtime-owned state)
// ---------------------------------------------------------------------------

/**
 * The runtime-owned conversation state. This is the ONLY stateful thing in the
 * pipeline: retrieval is stateless and requires this state to be handed back to
 * it each turn. `servedHistory` reuses the 2.1B `ServedRecord` type verbatim.
 */
export interface ConversationSession {
  sessionId: string;
  /** Monotonic integer conversation turn. Owned + incremented by the runtime. */
  currentTurn: number;
  /** Records already served this conversation. Drives 2.1B anti-repetition. */
  servedHistory: ServedRecord[];
}

// ---------------------------------------------------------------------------
// Evidence citation (projection of record provenance — never synthesized)
// ---------------------------------------------------------------------------

/**
 * One citation backing a served memory. A pure PROJECTION of a record's
 * provenance evidence — the runtime never invents or paraphrases evidence.
 */
export interface EvidenceCitation {
  recordId: string;
  sourceModule: MemorySourceModule;
  sourceQuality: SourceQuality;
  confidenceBand: ConfidenceBand;
  /** Opaque, stable reference to the underlying artifact. */
  ref: string;
  label: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Segment explanation (2.1B passthrough + thin composition note)
// ---------------------------------------------------------------------------

/**
 * Why a memory was chosen (forwarded UNMODIFIED from the 2.1B retrieval
 * explanation) and how it was phrased (`composedFrom`, the only runtime add).
 */
export interface SegmentExplanation {
  /** Why the record was recalled as a candidate (from retrieval). */
  recallReason: string;
  /** Itemized retrieval factors, forwarded verbatim from 2.1B. */
  factors: RetrievalFactor[];
  /** Deterministic 0..1 retrieval score. Equals the RankedMemory score. */
  finalScore: number;
  /** 1-based retrieval rank (preserved; the runtime never re-ranks). */
  rank: number;
  /** Present only when retrieval resolved a score tie by recordId. */
  tieBreak?: string;
  /** The deterministic template id that rendered this segment (runtime add). */
  composedFrom: string;
}

// ---------------------------------------------------------------------------
// Response segment
// ---------------------------------------------------------------------------

/** One rendered memory in a persona response. */
export interface ResponseSegment {
  recordId: string;
  category: MemoryCategory;
  /** Preserved retrieval rank — the composer never re-orders segments. */
  rank: number;
  confidenceBand: ConfidenceBand;
  importanceTier: MemoryImportanceTier;
  /** Deterministic, template-rendered text. */
  text: string;
  /** Always >= 1 for a non-fallback segment (evidence before confidence). */
  citations: EvidenceCitation[];
  explanation: SegmentExplanation;
}

// ---------------------------------------------------------------------------
// Fallback + diagnostics
// ---------------------------------------------------------------------------

/** Deterministic honest-fallback kinds. */
export type FallbackKind = "no_memory" | "all_recent" | "low_confidence";

/** Deterministic runtime diagnostics (mirrors + extends retrieval diagnostics). */
export interface RuntimeDiagnostics {
  /** Candidates after recall filtering (from retrieval). */
  candidateCount: number;
  /** Segments actually rendered into the response. */
  retrievedCount: number;
  /** Records withheld by retrieval (anti-repetition + diversity). */
  suppressedCount: number;
  /** Records dropped by the runtime for lacking any citation. */
  uncitedCount: number;
  /** Whether history-based anti-repetition ran in retrieval. */
  antiRepetitionApplied: boolean;
  /** Human-readable recall filters (from retrieval). */
  filtersApplied: string[];
}

// ---------------------------------------------------------------------------
// Persona response (the runtime output)
// ---------------------------------------------------------------------------

/** The deterministic output of one conversation turn. */
export interface PersonaResponse {
  personaId: PersonaId;
  intent: ConversationIntent;
  /** The turn this response was composed on. */
  turn: number;
  /** Rendered memories, in preserved retrieval order. */
  segments: ResponseSegment[];
  /** Deduped union of citations across all segments. */
  citations: EvidenceCitation[];
  /**
   * Single spoken-form line for the future 2.2 Voice Companion. ALWAYS defined,
   * markdown-free, and length-bounded (see VOICE_SUMMARY_MAX_CHARS).
   */
  voiceSummary: string;
  /** Set when the runtime fell back (empty / all-recent / low-confidence). */
  fallback?: FallbackKind;
  /** Record ids served this turn — feed straight into `advance(session, ...)`. */
  servedThisTurn: string[];
  diagnostics: RuntimeDiagnostics;
}
