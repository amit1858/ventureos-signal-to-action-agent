// Release 2.1B — Memory Intelligence
// ====================================
// Retrieval Engine — deterministic orchestrator.
//
// Replaces the 2.1A placeholder. Given a MemoryStore (READ ONLY) and a query,
// it produces a ranked, de-duplicated, fully explained result set:
//
//   recall -> score (importance + confidence + decay + match)
//          -> anti-repetition (history-gated) -> rank -> diversity -> explain
//
// APEF v1.0:
//   * Deterministic AI            — pure function; identical inputs -> identical
//                                   output. No Date.now(), no randomness.
//   * Evidence Before Confidence  — every score decomposes into itemized,
//                                   evidence-derived factors.
//   * Explainability              — each result carries a RetrievalExplanation.
//   * Protected Engine Boundaries — the store is only read; retrieval is
//                                   stateless (turn history is caller-supplied).
//
// Determinism guardrails enforced here:
//   * `asOfMs` is REQUIRED (throws RetrievalError when absent/non-finite).
//   * `currentTurn` is REQUIRED only when `servedHistory` is non-empty.
//   * When `servedHistory` is empty/absent, history-based anti-repetition is
//     skipped entirely (diversity caps still apply — they need no history).

import type { MemoryStore } from "./store";
import type {
  RankedMemory,
  RetrievalFactor,
  RetrievalResult,
  SuppressedMemory,
} from "./retrieval/types";
import { RetrievalError } from "./retrieval/types";
import { recall } from "./retrieval/recall";
import { buildBaseFactors, compareRanked, sumContributions, DEFAULT_RETRIEVAL_LIMIT } from "./retrieval/ranking";
import {
  applyDiversityCaps,
  buildServedIndex,
  evaluateAntiRepetition,
} from "./retrieval/antiRepetition";
import { assembleExplanation } from "./retrieval/explain";
import type { RetrievalQuery } from "./retrieval/types";

// Re-export the public retrieval surface for barrel consumers.
export type {
  RetrievalQuery,
  RetrievalResult,
  RankedMemory,
  SuppressedMemory,
  ServedRecord,
  RetrievalFactor,
  RetrievalDimension,
  RetrievalExplanation,
  RetrievalDiagnostics,
} from "./retrieval/types";
export { RetrievalError } from "./retrieval/types";

/** Internal scored candidate carried between ranking stages. */
interface ScoredCandidate {
  recordId: string;
  ranked: RankedMemory;
  recallReason: string;
  factors: RetrievalFactor[];
}

/**
 * Deterministic retrieval over the Memory Store. Pure: it never mutates the
 * store and never reads a wall clock.
 */
export function retrieve(store: MemoryStore, query: RetrievalQuery): RetrievalResult {
  validateQuery(query);

  const { candidates, filtersApplied } = recall(store, query);

  const history = query.servedHistory ?? [];
  const antiRepetitionApplied = history.length > 0;
  const servedIndex = antiRepetitionApplied ? buildServedIndex(history) : undefined;
  const currentTurn = query.currentTurn;

  const suppressed: SuppressedMemory[] = [];
  const scored: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    const { record } = candidate;
    const factors = buildBaseFactors(candidate, query);

    if (antiRepetitionApplied && servedIndex && currentTurn !== undefined) {
      const decision = evaluateAntiRepetition(
        record,
        servedIndex.get(record.recordId),
        currentTurn,
      );
      if (decision.kind === "suppress") {
        suppressed.push({ recordId: record.recordId, reason: decision.reason });
        continue;
      }
      if (decision.kind === "penalty") {
        factors.push(decision.factor);
      }
    }

    const score = sumContributions(factors);
    scored.push({
      recordId: record.recordId,
      recallReason: candidate.recallReason,
      factors,
      ranked: {
        record,
        score,
        rank: 0, // assigned after ranking + diversity + limit
        explanation: assembleExplanation({
          recallReason: candidate.recallReason,
          factors,
          rank: 0,
        }),
      },
    });
  }

  // Stable total order: score DESC, then recordId ASC.
  scored.sort((a, b) =>
    compareRanked(
      { score: a.ranked.score, recordId: a.recordId },
      { score: b.ranked.score, recordId: b.recordId },
    ),
  );

  // Identify scores shared by more than one candidate (for tie-break notes).
  const tiedScores = duplicatedScores(scored.map((s) => s.ranked.score));

  // Diversity caps, walked in rank order.
  const { kept, suppressed: diversitySuppressed } = applyDiversityCaps(
    scored.map((s) => s.ranked),
  );
  for (const s of diversitySuppressed) suppressed.push(s);

  // Truncate to the requested limit.
  const limit = query.limit ?? DEFAULT_RETRIEVAL_LIMIT;
  const finalRanked = kept.slice(0, limit);

  // Assign final ranks and finalize explanations (with tie-break notes).
  const byRecordId = new Map(scored.map((s) => [s.recordId, s]));
  const results: RankedMemory[] = finalRanked.map((item, i) => {
    const rank = i + 1;
    const source = byRecordId.get(item.record.recordId);
    const factors = source ? source.factors : item.explanation.factors;
    const recallReason = source ? source.recallReason : item.explanation.recallReason;
    const tieBreak = tiedScores.has(item.score)
      ? `Score ${item.score} tied; ordered by recordId ascending.`
      : undefined;
    return {
      record: item.record,
      score: item.score,
      rank,
      explanation: assembleExplanation({ recallReason, factors, rank, tieBreak }),
    };
  });

  // Deterministic suppressed ordering (unique recordIds).
  suppressed.sort((a, b) => (a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0));

  return {
    implemented: true,
    query,
    asOfMs: query.asOfMs,
    results,
    suppressed,
    diagnostics: {
      candidateCount: candidates.length,
      filtersApplied,
      antiRepetitionApplied,
    },
  };
}

/** Deterministic query validation. Throws RetrievalError on violation. */
function validateQuery(query: RetrievalQuery): void {
  if (typeof query.asOfMs !== "number" || !Number.isFinite(query.asOfMs)) {
    throw new RetrievalError("retrieval: asOfMs is required and must be a finite number.");
  }
  if (query.limit !== undefined && (!Number.isFinite(query.limit) || query.limit < 0)) {
    throw new RetrievalError("retrieval: limit must be a finite, non-negative number.");
  }
  const historyLen = query.servedHistory ? query.servedHistory.length : 0;
  if (historyLen > 0) {
    if (query.currentTurn === undefined || !Number.isFinite(query.currentTurn)) {
      throw new RetrievalError(
        "retrieval: currentTurn is required when servedHistory is non-empty.",
      );
    }
  }
}

/** The set of score values that occur more than once. */
function duplicatedScores(scores: number[]): Set<number> {
  const counts = new Map<number, number>();
  for (const s of scores) counts.set(s, (counts.get(s) ?? 0) + 1);
  const dupes = new Set<number>();
  for (const [score, count] of counts) if (count > 1) dupes.add(score);
  return dupes;
}
