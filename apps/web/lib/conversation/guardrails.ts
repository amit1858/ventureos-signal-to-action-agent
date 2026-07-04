// Release 2.1C — Conversation Runtime
// ====================================
// Guardrails — deterministic, confidence-gated language + text sanitizers.
//
// APEF: Evidence Before Confidence + Deterministic AI. The runtime must never
// overclaim what memory supports. Language is gated ONLY by the deterministic
// `confidence.band` that 2.1A already computed — the runtime invents nothing and
// recomputes nothing. Low-confidence memories must be hedged; high-confidence
// memories may be stated plainly.
//
// These are pure string helpers. No clock, no randomness, no model call.

import type { ConfidenceBand } from "../memory";

/**
 * Deterministic lead phrase per confidence band. High is assertive-but-factual;
 * medium and low are progressively hedged. Every phrase is a published constant.
 */
export const HEDGE_BY_BAND: Record<ConfidenceBand, string> = {
  high: "On record,",
  medium: "Based on what I have,",
  low: "I'm not fully certain, but a tentative signal suggests",
};

/**
 * Tokens that mark hedged language. Used by evals to prove a low-confidence
 * segment is actually hedged. Lower-cased for case-insensitive testing.
 */
export const HEDGE_TOKENS: ReadonlyArray<string> = [
  "not fully certain",
  "tentative",
  "suggests",
  "based on what i have",
  "appears",
  "looks like",
];

/**
 * Assertive-certainty terms that must NEVER appear alongside a low-confidence
 * memory. Lower-cased for case-insensitive testing.
 */
export const FORBIDDEN_LOW_CONFIDENCE_TERMS: ReadonlyArray<string> = [
  "confirmed",
  "certainly",
  "definitely",
  "guaranteed",
  "without doubt",
  "proven",
];

/** The deterministic lead phrase for a band. */
export function hedgePrefix(band: ConfidenceBand): string {
  return HEDGE_BY_BAND[band];
}

/** True for the lowest confidence band. */
export function isLowConfidence(band: ConfidenceBand): boolean {
  return band === "low";
}

/** True when `text` contains at least one hedge token (case-insensitive). */
export function containsHedge(text: string): boolean {
  const lower = text.toLowerCase();
  return HEDGE_TOKENS.some((token) => lower.includes(token));
}

/** True when `text` contains a forbidden overclaim term (case-insensitive). */
export function containsForbiddenOverclaim(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_LOW_CONFIDENCE_TERMS.some((term) => lower.includes(term));
}

/**
 * Deterministic no-overclaim check for a rendered segment. A low-confidence
 * segment must be hedged and must not contain any forbidden certainty term.
 * Higher bands always pass (they are allowed to be plain).
 */
export function respectsConfidence(band: ConfidenceBand, text: string): boolean {
  if (!isLowConfidence(band)) return true;
  return containsHedge(text) && !containsForbiddenOverclaim(text);
}

/**
 * Strip markdown and collapse to a single clean line. Deterministic: removes
 * markdown control characters, converts newlines/tabs to spaces, and collapses
 * runs of whitespace. Used to keep the voice summary markdown-free.
 */
export function sanitizeInline(text: string): string {
  return text
    .replace(/[*_`#>\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
