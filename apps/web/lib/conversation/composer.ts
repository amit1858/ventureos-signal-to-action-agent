// Release 2.1C — Conversation Runtime
// ====================================
// Persona response composer — the deterministic orchestrator.
//
// Flow (all deterministic, no clock, no randomness, no model call):
//   runRetrieval (2.1B, READ ONLY)
//     -> preserve retrieval order (NEVER re-rank, NEVER re-score)
//     -> project citations (evidence before confidence; drop uncitable records)
//     -> render template text (confidence-gated wording)
//     -> forward retrieval explanation verbatim (+ thin composedFrom)
//     -> honest fallback when nothing citable survives
//     -> always emit a bounded, markdown-free voiceSummary
//
// APEF: Deterministic AI · Evidence Before Confidence · Explainability ·
// Protected Engine Boundaries. The composer trusts retrieval's ranking and
// suppression entirely — it re-implements none of it.

import type { MemoryStore, RankedMemory } from "../memory";
import { runRetrieval } from "./context";
import { citeRecord, dedupeCitations } from "./evidence";
import { renderSegment } from "./templates";
import type { SegmentView } from "./templates";
import {
  buildFallbackResponse,
  classifyEmpty,
  isAllLowConfidence,
} from "./fallback";
import { buildVoiceSummary } from "./voice";
import type {
  ConversationContext,
  ConversationSession,
  EvidenceCitation,
  PersonaResponse,
  ResponseSegment,
  SegmentExplanation,
} from "./types";

/**
 * Compose one persona response for a turn. Pure: reads the store only, never
 * mutates it, and returns a fully deterministic {@link PersonaResponse}.
 *
 * A malformed session (non-empty servedHistory without a finite currentTurn)
 * causes the 2.1B `RetrievalError` to propagate UNCAUGHT — it is never swallowed.
 */
export function composeResponse(
  store: MemoryStore,
  ctx: ConversationContext,
  session: ConversationSession,
): PersonaResponse {
  const result = runRetrieval(store, ctx, session);

  const effectiveMax = maxSegmentsFor(ctx);
  const segments: ResponseSegment[] = [];
  let uncitedCount = 0;

  for (const ranked of result.results) {
    if (segments.length >= effectiveMax) break;

    // Evidence before confidence: an uncitable record is never surfaced.
    const citations = citeRecord(ranked.record);
    if (citations.length === 0) {
      uncitedCount++;
      continue;
    }

    segments.push(buildSegment(ctx, ranked, citations));
  }

  // Nothing citable survived -> honest fallback (no claims).
  if (segments.length === 0) {
    const kind = result.results.length === 0 ? classifyEmpty(result) : "no_memory";
    return buildFallbackResponse(ctx, session, result, kind, uncitedCount);
  }

  const citations = dedupeCitations(segments.flatMap((s) => s.citations));
  const voiceSummary = buildVoiceSummary({ intent: ctx.intent, segments });
  const servedThisTurn = segments.map((s) => s.recordId);

  const response: PersonaResponse = {
    personaId: ctx.persona.id,
    intent: ctx.intent,
    turn: session.currentTurn,
    segments,
    citations,
    voiceSummary,
    servedThisTurn,
    diagnostics: {
      candidateCount: result.diagnostics.candidateCount,
      retrievedCount: segments.length,
      suppressedCount: result.suppressed.length,
      uncitedCount,
      antiRepetitionApplied: result.diagnostics.antiRepetitionApplied,
      filtersApplied: result.diagnostics.filtersApplied,
    },
  };

  // Surfaced, but every memory is only a tentative signal -> flag it (segments
  // are kept and already hedged by the low-band templates).
  if (isAllLowConfidence(segments)) response.fallback = "low_confidence";

  return response;
}

/** Deterministic per-persona display cap (unbounded when unset). */
function maxSegmentsFor(ctx: ConversationContext): number {
  const max = ctx.persona.maxSegments;
  if (max === undefined || !Number.isFinite(max) || max < 0) return Number.POSITIVE_INFINITY;
  return max;
}

/** Build one response segment, preserving the retrieval rank and explanation. */
function buildSegment(
  ctx: ConversationContext,
  ranked: RankedMemory,
  citations: EvidenceCitation[],
): ResponseSegment {
  const record = ranked.record;
  const view: SegmentView = {
    subjectLabel: record.subjectLabel,
    category: record.category,
    summary: record.summary,
    importanceTier: record.importance.tier,
    confidenceBand: record.confidence.band,
  };
  const rendered = renderSegment(ctx.intent, ctx.persona.tone, view);

  const explanation: SegmentExplanation = {
    recallReason: ranked.explanation.recallReason,
    // Forwarded verbatim from 2.1B — never re-derived.
    factors: ranked.explanation.factors,
    finalScore: ranked.explanation.finalScore,
    rank: ranked.rank,
    composedFrom: rendered.templateId,
  };
  if (ranked.explanation.tieBreak !== undefined) {
    explanation.tieBreak = ranked.explanation.tieBreak;
  }

  return {
    recordId: record.recordId,
    category: record.category,
    rank: ranked.rank,
    confidenceBand: record.confidence.band,
    importanceTier: record.importance.tier,
    text: rendered.text,
    citations,
    explanation,
  };
}
