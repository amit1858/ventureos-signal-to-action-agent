// Release 2.1B — Memory Intelligence
// ====================================
// Deterministic retrieval decay.
//
// APEF: Deterministic AI + Explainability. Decay is a pure, stepped function of
// a record's age (in whole days, measured against the injected `asOfMs`) and its
// lifecycle. It is intentionally SEPARATE from confidence's freshness so that
// retrieval recency can be tuned independently of trust.
//
// Stepped (not exponential) to match the memory core's float-stability
// convention: identical inputs -> identical score on every machine and run.

import type { MemoryLifecycle } from "../types";
import { ageInDays } from "../confidence";

// -- published decay curve --------------------------------------------------

/**
 * Published, fixed decay curve. Every threshold and value is a governance knob,
 * not a hidden heuristic. `agedCap` caps the score of `aged` records so stale
 * memory can never rank as if it were fresh.
 */
export const RETRIEVAL_DECAY = {
  /** age <= 1 day. */
  within1Day: 1.0,
  /** age <= 7 days. */
  within7Days: 0.9,
  /** age <= 30 days. */
  within30Days: 0.7,
  /** age <= 90 days. */
  within90Days: 0.45,
  /** age > 90 days. */
  older: 0.25,
  /** Ceiling applied to records in the `aged` lifecycle. */
  agedCap: 0.4,
} as const;

/** Round to 4 decimals to keep scores stable and comparable across runs. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** The base stepped score for a whole-day age. Monotonic non-increasing. */
function baseDecay(ageDays: number): number {
  if (ageDays <= 1) return RETRIEVAL_DECAY.within1Day;
  if (ageDays <= 7) return RETRIEVAL_DECAY.within7Days;
  if (ageDays <= 30) return RETRIEVAL_DECAY.within30Days;
  if (ageDays <= 90) return RETRIEVAL_DECAY.within90Days;
  return RETRIEVAL_DECAY.older;
}

/**
 * Deterministic retrieval decay score for a record.
 *
 * @param lastUpdatedIso the record's `lastUpdated` timestamp.
 * @param asOfMs         the injected reference clock.
 * @param lifecycle      the record's lifecycle (only `aged` alters the score).
 */
export function retrievalDecayScore(
  lastUpdatedIso: string,
  asOfMs: number,
  lifecycle: MemoryLifecycle,
): number {
  const ageDays = ageInDays(lastUpdatedIso, asOfMs);
  const base = baseDecay(ageDays);
  const capped = lifecycle === "aged" ? Math.min(base, RETRIEVAL_DECAY.agedCap) : base;
  return round4(capped);
}

/** Plain-English decay rationale for an explainability panel. */
export function explainDecay(
  lastUpdatedIso: string,
  asOfMs: number,
  lifecycle: MemoryLifecycle,
): string {
  const ageDays = ageInDays(lastUpdatedIso, asOfMs);
  const score = retrievalDecayScore(lastUpdatedIso, asOfMs, lifecycle);
  const cap =
    lifecycle === "aged" ? ` (capped by 'aged' lifecycle at ${RETRIEVAL_DECAY.agedCap})` : "";
  return `Last updated ${ageDays} day(s) ago -> decay ${score}${cap}.`;
}
