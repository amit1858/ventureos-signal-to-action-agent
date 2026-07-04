// Release 2.1C — Conversation Runtime
// ====================================
// Safe fallbacks — honest responses when there is nothing to recall.
//
// APEF: Evidence Before Confidence + Deterministic AI. When retrieval returns no
// usable memory, the runtime must be HONEST rather than fabricate recall. Three
// deterministic modes:
//   * no_memory      — nothing exists for this scope (no candidates at all).
//   * all_recent     — candidates existed but were all withheld (already served /
//                      diversity-capped) this conversation.
//   * low_confidence — memories WERE surfaced, but every one sits in the lowest
//                      confidence band; the composer keeps them (hedged) and flags
//                      this so downstream surfaces can signal uncertainty.
//
// A fallback response makes NO claims: no segments, no citations. Its voice
// summary is the same honest line.

import type { RetrievalResult } from "../memory";
import { buildVoiceSummary } from "./voice";
import type {
  ConversationContext,
  ConversationSession,
  FallbackKind,
  PersonaResponse,
  ResponseSegment,
} from "./types";

/**
 * Classify an EMPTY retrieval outcome. `no_memory` when nothing was ever a
 * candidate; `all_recent` when candidates existed but were all withheld.
 */
export function classifyEmpty(result: RetrievalResult): FallbackKind {
  return result.diagnostics.candidateCount === 0 ? "no_memory" : "all_recent";
}

/** True when every surfaced segment sits in the lowest confidence band. */
export function isAllLowConfidence(segments: ResponseSegment[]): boolean {
  return segments.length > 0 && segments.every((s) => s.confidenceBand === "low");
}

/** The honest, plain-text line for a fallback kind (no invented facts). */
export function fallbackLine(kind: FallbackKind, subjectLabel: string): string {
  switch (kind) {
    case "no_memory":
      return `I don't have any prior context on ${subjectLabel} yet, so we can start fresh.`;
    case "all_recent":
      return `I've already covered what I have on ${subjectLabel} in this conversation.`;
    case "low_confidence":
      return `What I have on ${subjectLabel} is only a tentative signal, so treat it with caution.`;
  }
}

/**
 * Build a claim-free fallback response for an EMPTY retrieval outcome. Segments
 * and citations are empty; the voice summary carries the honest line.
 */
export function buildFallbackResponse(
  ctx: ConversationContext,
  session: ConversationSession,
  result: RetrievalResult,
  kind: FallbackKind,
  uncitedCount: number,
): PersonaResponse {
  const subjectLabel = ctx.subjectId ?? "that topic";
  const line = fallbackLine(kind, subjectLabel);

  return {
    personaId: ctx.persona.id,
    intent: ctx.intent,
    turn: session.currentTurn,
    segments: [],
    citations: [],
    voiceSummary: buildVoiceSummary({ intent: ctx.intent, segments: [], fallbackLine: line }),
    fallback: kind,
    servedThisTurn: [],
    diagnostics: {
      candidateCount: result.diagnostics.candidateCount,
      retrievedCount: 0,
      suppressedCount: result.suppressed.length,
      uncitedCount,
      antiRepetitionApplied: result.diagnostics.antiRepetitionApplied,
      filtersApplied: result.diagnostics.filtersApplied,
    },
  };
}
