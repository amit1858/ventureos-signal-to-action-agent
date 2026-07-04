// Release 2.1B — Memory Intelligence
// ====================================
// Deterministic explainability assembly.
//
// APEF: Explainability + Evidence Before Confidence. This module never invents a
// score; it only assembles the already-computed factors into a human-readable
// explanation and asserts the core integrity invariant:
//
//     finalScore === sum(factor.contribution)
//
// Because every factor was rounded (round4) at creation, summing them and
// rounding once more is exact and reproducible.

import type { RetrievalExplanation, RetrievalFactor } from "./types";
import { sumContributions } from "./ranking";

export interface ExplanationInput {
  recallReason: string;
  factors: RetrievalFactor[];
  rank: number;
  /** Set when this record's score tied another and was ordered by recordId. */
  tieBreak?: string;
}

/**
 * Assemble a RetrievalExplanation. `finalScore` is derived here as the sum of
 * the supplied factor contributions so the returned object is internally
 * consistent by construction.
 */
export function assembleExplanation(input: ExplanationInput): RetrievalExplanation {
  const finalScore = sumContributions(input.factors);
  return {
    recallReason: input.recallReason,
    factors: input.factors,
    finalScore,
    rank: input.rank,
    ...(input.tieBreak ? { tieBreak: input.tieBreak } : {}),
  };
}

/**
 * One-line, plain-English narrative of a result's factor breakdown. Useful for
 * a compact explainability chip in a future UI (2.1C+).
 */
export function narrateFactors(factors: RetrievalFactor[]): string {
  return factors
    .map((f) => `${f.dimension} ${f.contribution >= 0 ? "+" : ""}${f.contribution}`)
    .join(", ");
}
