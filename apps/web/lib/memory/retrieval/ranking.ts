// Release 2.1B — Memory Intelligence
// ====================================
// Deterministic ranking — the explainable relevance blend.
//
// APEF: Deterministic AI + Evidence Before Confidence. A candidate's relevance
// is a weighted sum of four published, evidence-derived dimensions, each
// normalized 0..1:
//
//   importance (0.40) — business importance already computed by the 2.1A core
//   confidence (0.25) — deterministic confidence (source quality + freshness +
//                       evidence). NOT model confidence.
//   decay      (0.20) — retrieval recency (see decay.ts)
//   match      (0.15) — literal query-term match (neutral when no terms given)
//
// Anti-repetition contributes a fifth, negative factor (see antiRepetition.ts).
// The final score is the sum of every factor's contribution — nothing hidden.

import type { RetrievalFactor } from "./types";
import type { RetrievalCandidate } from "./recall";
import type { RetrievalQuery } from "./types";
import { retrievalDecayScore, explainDecay } from "./decay";

// -- published constants ----------------------------------------------------

/** Published, fixed relevance weights (base dimensions sum to 1.0). */
export const RETRIEVAL_WEIGHTS = {
  importance: 0.4,
  confidence: 0.25,
  decay: 0.2,
  match: 0.15,
} as const;

/** Match value used when a query supplies no terms (a neutral, non-biasing 0.5). */
export const NEUTRAL_MATCH = 0.5;

/** Default number of ranked results when a query omits `limit`. */
export const DEFAULT_RETRIEVAL_LIMIT = 10;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Build the four base (pre-anti-repetition) factors for a candidate. Pure and
 * deterministic given the candidate and the query's `asOfMs`.
 */
export function buildBaseFactors(
  candidate: RetrievalCandidate,
  query: RetrievalQuery,
): RetrievalFactor[] {
  const { record } = candidate;

  const importanceValue = record.importance.score / 100;
  const confidenceValue = record.confidence.score;
  const decayValue = retrievalDecayScore(record.lastUpdated, query.asOfMs, record.lifecycle);

  const hasTerms = query.matchTerms !== undefined && query.matchTerms.length > 0;
  const termCount = hasTerms ? distinctTermCount(query.matchTerms as string[]) : 0;
  const matchValue = hasTerms
    ? termCount === 0
      ? 0
      : Math.min(1, candidate.matchCount / termCount)
    : NEUTRAL_MATCH;

  return [
    {
      dimension: "importance",
      weight: RETRIEVAL_WEIGHTS.importance,
      value: round4(importanceValue),
      contribution: round4(importanceValue * RETRIEVAL_WEIGHTS.importance),
      rationale: `Business importance ${record.importance.score}/100 (${record.importance.tier}).`,
    },
    {
      dimension: "confidence",
      weight: RETRIEVAL_WEIGHTS.confidence,
      value: round4(confidenceValue),
      contribution: round4(confidenceValue * RETRIEVAL_WEIGHTS.confidence),
      rationale: `Deterministic confidence ${record.confidence.score} (${record.confidence.band}).`,
    },
    {
      dimension: "decay",
      weight: RETRIEVAL_WEIGHTS.decay,
      value: decayValue,
      contribution: round4(decayValue * RETRIEVAL_WEIGHTS.decay),
      rationale: explainDecay(record.lastUpdated, query.asOfMs, record.lifecycle),
    },
    {
      dimension: "match",
      weight: RETRIEVAL_WEIGHTS.match,
      value: round4(matchValue),
      contribution: round4(matchValue * RETRIEVAL_WEIGHTS.match),
      rationale: hasTerms
        ? `Matched ${candidate.matchCount}/${termCount} query term(s).`
        : `No query terms supplied; neutral match value ${NEUTRAL_MATCH}.`,
    },
  ];
}

function distinctTermCount(terms: string[]): number {
  const seen = new Set<string>();
  for (const raw of terms) {
    const term = raw.toLowerCase().trim();
    if (term.length > 0) seen.add(term);
  }
  return seen.size;
}

/** Sum of factor contributions, rounded — this IS the final score. */
export function sumContributions(factors: RetrievalFactor[]): number {
  return round4(factors.reduce((sum, f) => sum + f.contribution, 0));
}

/**
 * Stable, total ordering: score DESCENDING, then recordId ASCENDING. The
 * recordId tie-break makes the sort deterministic for equal scores.
 */
export function compareRanked(
  a: { score: number; recordId: string },
  b: { score: number; recordId: string },
): number {
  if (a.score !== b.score) return b.score - a.score;
  return a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0;
}
