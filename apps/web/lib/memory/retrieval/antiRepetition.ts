// Release 2.1B — Memory Intelligence
// ====================================
// Deterministic anti-repetition + diversity.
//
// APEF: Deterministic AI + Explainability. Two independent, deterministic
// mechanisms keep a conversation from repeating itself:
//
//   1. History-based repetition control (requires caller-supplied servedHistory
//      + currentTurn). A record served recently is hard-suppressed; one served
//      a while ago takes a soft, recovering penalty. CRITICAL-importance records
//      are never hard-suppressed — governance must always be allowed to resurface
//      — so they take the soft penalty instead.
//
//   2. Diversity caps (need no history at all). At most MAX_PER_CATEGORY and
//      MAX_PER_SUBJECT records may appear in one result set; overflow (the
//      lowest-ranked first) is moved to `suppressed`.
//
// All math is integer turn arithmetic — no clock, no randomness.

import type { MemoryRecord } from "../types";
import type { RetrievalFactor, ServedRecord, SuppressedMemory } from "./types";

// -- published constants ----------------------------------------------------

/** A record served fewer than this many turns ago is "recently served". */
export const REPEAT_WINDOW_TURNS = 3;

/** Turn distance at (or beyond) which a soft penalty has fully recovered to 0. */
export const REPEAT_RECOVERY_TURNS = 6;

/** Max records of one category allowed in a single result set. */
export const MAX_PER_CATEGORY = 2;

/** Max records for one subject allowed in a single result set. */
export const MAX_PER_SUBJECT = 3;

/**
 * Published, stepped soft-penalty magnitude keyed by turn distance
 * (currentTurn - servedTurn). Monotonic non-increasing so the penalty always
 * shrinks as a memory ages out of the conversation.
 */
export const REPEAT_PENALTY_BY_DISTANCE: ReadonlyArray<{ maxDistance: number; penalty: number }> = [
  { maxDistance: 1, penalty: 0.3 },
  { maxDistance: 2, penalty: 0.2 },
  { maxDistance: 3, penalty: 0.12 },
  { maxDistance: 4, penalty: 0.06 },
  { maxDistance: 5, penalty: 0.03 },
];

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Most-recent served turn per recordId (max servedTurn wins on duplicates). */
export function buildServedIndex(history: ServedRecord[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const entry of history) {
    const prev = index.get(entry.recordId);
    if (prev === undefined || entry.servedTurn > prev) {
      index.set(entry.recordId, entry.servedTurn);
    }
  }
  return index;
}

/** Deterministic penalty magnitude for a turn distance. 0 once fully recovered. */
export function repeatPenalty(distance: number): number {
  if (distance >= REPEAT_RECOVERY_TURNS) return 0;
  for (const step of REPEAT_PENALTY_BY_DISTANCE) {
    if (distance <= step.maxDistance) return step.penalty;
  }
  return 0;
}

/** A record served fewer than REPEAT_WINDOW_TURNS turns ago is recent. */
export function isRecentlyServed(distance: number): boolean {
  return distance < REPEAT_WINDOW_TURNS;
}

export type AntiRepetitionDecision =
  | { kind: "none" }
  | { kind: "suppress"; reason: string }
  | { kind: "penalty"; factor: RetrievalFactor };

/**
 * Decide how a single record is affected by repetition, given the turn it was
 * last served (or undefined if never served) and the current turn.
 *
 *   * never served                       -> none
 *   * recently served, non-critical      -> hard suppress
 *   * recently served, critical          -> soft penalty (never suppressed)
 *   * served long ago (still penalized)  -> soft penalty
 *   * served past recovery horizon       -> none
 */
export function evaluateAntiRepetition(
  record: MemoryRecord,
  servedTurn: number | undefined,
  currentTurn: number,
): AntiRepetitionDecision {
  if (servedTurn === undefined) return { kind: "none" };

  const distance = currentTurn - servedTurn;
  const recent = isRecentlyServed(distance);
  const isCritical = record.importance.tier === "critical";

  if (recent && !isCritical) {
    return {
      kind: "suppress",
      reason: `Served ${distance} turn(s) ago (< ${REPEAT_WINDOW_TURNS}); suppressed to avoid repetition.`,
    };
  }

  const penalty = repeatPenalty(distance);
  if (penalty <= 0) return { kind: "none" };

  const contribution = round4(-penalty);
  const criticalNote = recent && isCritical ? " (critical: penalized, not suppressed)" : "";
  return {
    kind: "penalty",
    factor: {
      dimension: "anti_repetition",
      weight: -1,
      value: penalty,
      contribution,
      rationale: `Served ${distance} turn(s) ago -> repetition penalty ${contribution}${criticalNote}.`,
    },
  };
}

/**
 * Apply deterministic diversity caps to an already-ranked list. Walks the list
 * in rank order, keeping at most MAX_PER_CATEGORY per category and
 * MAX_PER_SUBJECT per subject; overflow is suppressed with a stable reason.
 */
export function applyDiversityCaps<T extends { record: MemoryRecord }>(
  ranked: T[],
): { kept: T[]; suppressed: SuppressedMemory[] } {
  const kept: T[] = [];
  const suppressed: SuppressedMemory[] = [];
  const perCategory = new Map<string, number>();
  const perSubject = new Map<string, number>();

  for (const item of ranked) {
    const category = item.record.category;
    const subject = item.record.subjectId;
    const catCount = perCategory.get(category) ?? 0;
    const subCount = perSubject.get(subject) ?? 0;

    if (catCount >= MAX_PER_CATEGORY) {
      suppressed.push({
        recordId: item.record.recordId,
        reason: `Diversity cap: category '${category}' already has ${MAX_PER_CATEGORY} result(s).`,
      });
      continue;
    }
    if (subCount >= MAX_PER_SUBJECT) {
      suppressed.push({
        recordId: item.record.recordId,
        reason: `Diversity cap: subject '${subject}' already has ${MAX_PER_SUBJECT} result(s).`,
      });
      continue;
    }

    perCategory.set(category, catCount + 1);
    perSubject.set(subject, subCount + 1);
    kept.push(item);
  }

  return { kept, suppressed };
}
