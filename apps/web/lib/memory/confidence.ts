// Release 2.1A — Shared Enterprise Memory Core
// ============================================
// Deterministic confidence calculation.
//
// APEF: Deterministic AI + Explainability. Confidence is NEVER AI confidence.
// It is a pure function of three published inputs:
//   1. source quality   — how trustworthy the origin engine is
//   2. event freshness   — how recent the memory is (age vs asOf clock)
//   3. supporting evidence — how much corroboration backs it
//
// Same inputs -> same score, always. Every factor is itemized so an
// explainability panel can render exactly why a confidence is what it is.

import type {
  ConfidenceBand,
  ConfidenceFactor,
  MemoryConfidence,
  SourceQuality,
} from "./types";

// -- published, fixed weights (must sum to 1.0) ----------------------------
export const CONFIDENCE_WEIGHTS = {
  source_quality: 0.5,
  event_freshness: 0.2,
  supporting_evidence: 0.3,
} as const;

// -- deterministic source-quality scores -----------------------------------
export const SOURCE_QUALITY_SCORE: Record<SourceQuality, number> = {
  authoritative: 1.0,
  derived: 0.75,
  inferred: 0.5,
  external: 0.4,
};

// -- freshness step function (age in whole days) ---------------------------
const DAY_MS = 24 * 60 * 60 * 1000;

/** Deterministic freshness score from an age in days. Monotonic, stepped. */
export function freshnessScore(ageDays: number): number {
  if (ageDays <= 1) return 1.0;
  if (ageDays <= 7) return 0.85;
  if (ageDays <= 30) return 0.6;
  if (ageDays <= 90) return 0.4;
  return 0.2;
}

/** Whole-day age between an ISO timestamp and an asOf epoch-ms. Never negative. */
export function ageInDays(timestampIso: string, asOfMs: number): number {
  const t = Date.parse(timestampIso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  const deltaMs = Math.max(0, asOfMs - t);
  return Math.floor(deltaMs / DAY_MS);
}

/** Deterministic evidence score from a count of supporting items. */
export function evidenceScore(evidenceCount: number): number {
  if (evidenceCount <= 0) return 0.3;
  if (evidenceCount === 1) return 0.6;
  if (evidenceCount === 2) return 0.8;
  return 1.0;
}

export interface ConfidenceInput {
  quality: SourceQuality;
  timestampIso: string;
  asOfMs: number;
  evidenceCount: number;
}

/** Round to 4 decimals to keep scores stable and comparable across runs. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function bandFor(score: number): ConfidenceBand {
  if (score < 0.5) return "low";
  if (score < 0.8) return "medium";
  return "high";
}

/**
 * Compute deterministic, explainable confidence. Pure: identical input yields
 * an identical object every time.
 */
export function computeConfidence(input: ConfidenceInput): MemoryConfidence {
  const qualityValue = SOURCE_QUALITY_SCORE[input.quality];
  const ageDays = ageInDays(input.timestampIso, input.asOfMs);
  const freshValue = freshnessScore(ageDays);
  const evidValue = evidenceScore(input.evidenceCount);

  const factors: ConfidenceFactor[] = [
    {
      dimension: "source_quality",
      weight: CONFIDENCE_WEIGHTS.source_quality,
      value: qualityValue,
      contribution: round4(qualityValue * CONFIDENCE_WEIGHTS.source_quality),
      rationale: `Source is '${input.quality}' (quality score ${qualityValue}).`,
    },
    {
      dimension: "event_freshness",
      weight: CONFIDENCE_WEIGHTS.event_freshness,
      value: freshValue,
      contribution: round4(freshValue * CONFIDENCE_WEIGHTS.event_freshness),
      rationale: `Memory is ${ageDays} day(s) old (freshness ${freshValue}).`,
    },
    {
      dimension: "supporting_evidence",
      weight: CONFIDENCE_WEIGHTS.supporting_evidence,
      value: evidValue,
      contribution: round4(evidValue * CONFIDENCE_WEIGHTS.supporting_evidence),
      rationale: `${input.evidenceCount} supporting evidence item(s) (evidence score ${evidValue}).`,
    },
  ];

  const score = round4(factors.reduce((sum, f) => sum + f.contribution, 0));
  return { score, band: bandFor(score), factors };
}
