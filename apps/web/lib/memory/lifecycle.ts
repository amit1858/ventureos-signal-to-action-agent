// Release 2.1A — Shared Enterprise Memory Core
// ============================================
// Deterministic memory lifecycle.
//
// APEF: Deterministic AI. Lifecycle is a pure function of three inputs:
//   * event count (how many events folded into the record)
//   * age in days (lastUpdated vs the asOf clock)
//   * sticky flags (activated / archived / compressed) set by the store via
//     explicit, guarded transitions.
//
// States (in progression order):
//   new -> merged -> active -> aged -> archived -> compressed
//
// Priority when deriving the current state (highest wins):
//   compressed > archived > aged > active > merged > new

import type { LifecycleFlags, MemoryLifecycle } from "./types";

/** A record older than this (by lastUpdated) is considered aged. */
export const AGED_AFTER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Allowed forward transitions. Everything else is rejected by the store. */
export const ALLOWED_TRANSITIONS: Record<MemoryLifecycle, MemoryLifecycle[]> = {
  new: ["merged", "active", "aged", "archived"],
  merged: ["active", "aged", "archived"],
  active: ["merged", "aged", "archived"],
  aged: ["active", "archived"],
  archived: ["compressed"],
  compressed: [],
};

/** Whether a lifecycle transition is permitted. Deterministic. */
export function canTransition(from: MemoryLifecycle, to: MemoryLifecycle): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Whole-day age from an ISO timestamp to an asOf epoch-ms. Never negative. */
export function ageInDays(timestampIso: string, asOfMs: number): number {
  const t = Date.parse(timestampIso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.floor(Math.max(0, asOfMs - t) / DAY_MS);
}

export interface LifecycleInput {
  eventCount: number;
  lastUpdatedIso: string;
  asOfMs: number;
  flags: LifecycleFlags;
}

/**
 * Derive the current lifecycle state. Pure and total: identical input always
 * yields the same state. Sticky flags win over time/merge-derived states.
 */
export function deriveLifecycle(input: LifecycleInput): MemoryLifecycle {
  if (input.flags.compressed) return "compressed";
  if (input.flags.archived) return "archived";

  const age = ageInDays(input.lastUpdatedIso, input.asOfMs);
  if (age > AGED_AFTER_DAYS) return "aged";

  if (input.flags.activated) return "active";
  if (input.eventCount >= 2) return "merged";
  return "new";
}

/**
 * Explain a lifecycle decision in plain English (for explainability panels).
 * Deterministic given the same input as {@link deriveLifecycle}.
 */
export function explainLifecycle(input: LifecycleInput): string {
  if (input.flags.compressed) return "Compressed by the store (cold storage).";
  if (input.flags.archived) return "Archived by the store.";
  const age = ageInDays(input.lastUpdatedIso, input.asOfMs);
  if (age > AGED_AFTER_DAYS) {
    return `Aged: last updated ${age} day(s) ago (> ${AGED_AFTER_DAYS}).`;
  }
  if (input.flags.activated) return "Active: promoted after consolidation.";
  if (input.eventCount >= 2) {
    return `Merged: ${input.eventCount} events folded into one record.`;
  }
  return "New: a single originating event.";
}
