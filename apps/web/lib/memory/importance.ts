// Release 2.1A — Shared Enterprise Memory Core
// ============================================
// Deterministic business importance.
//
// APEF: Deterministic AI + Explainability. Importance is business importance,
// not model importance. No ML, no hidden heuristics. It is a weighted sum of
// five published dimensions, each normalized 0..1:
//   governance, customer impact, revenue impact, seller impact, manager impact.
//
// Same signals -> same score, always. Every dimension's contribution is
// itemized so the reasoning can be shown to a human.

import type {
  EventSignals,
  ImportanceFactor,
  MemoryImportance,
  MemoryImportanceTier,
} from "./types";

// -- published, fixed weights (must sum to 1.0) ----------------------------
export const IMPORTANCE_WEIGHTS = {
  governance: 0.3,
  customer_impact: 0.25,
  revenue_impact: 0.25,
  seller_impact: 0.12,
  manager_impact: 0.08,
} as const;

// -- tier thresholds on the 0..100 score -----------------------------------
export const IMPORTANCE_TIERS = {
  critical: 75,
  high: 50,
  medium: 25,
} as const;

/** Clamp a value into 0..1. Non-finite / missing inputs collapse to 0. */
function clamp01(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function tierFor(score: number): MemoryImportanceTier {
  if (score >= IMPORTANCE_TIERS.critical) return "critical";
  if (score >= IMPORTANCE_TIERS.high) return "high";
  if (score >= IMPORTANCE_TIERS.medium) return "medium";
  return "low";
}

/**
 * Compute deterministic, explainable business importance from event signals.
 * Governance is a boolean promoted to 1.0 when present. Pure function.
 */
export function computeImportance(signals: EventSignals): MemoryImportance {
  const governanceValue = signals.governance ? 1 : 0;
  const customerValue = clamp01(signals.customerImpact);
  const revenueValue = clamp01(signals.revenueImpact);
  const sellerValue = clamp01(signals.sellerImpact);
  const managerValue = clamp01(signals.managerImpact);

  const factors: ImportanceFactor[] = [
    {
      dimension: "governance",
      weight: IMPORTANCE_WEIGHTS.governance,
      value: governanceValue,
      contribution: round2(governanceValue * IMPORTANCE_WEIGHTS.governance * 100),
      rationale: signals.governance
        ? "Touches governance (caveat / approval / policy)."
        : "No governance dimension on this memory.",
    },
    {
      dimension: "customer_impact",
      weight: IMPORTANCE_WEIGHTS.customer_impact,
      value: customerValue,
      contribution: round2(customerValue * IMPORTANCE_WEIGHTS.customer_impact * 100),
      rationale: `Customer impact magnitude ${customerValue}.`,
    },
    {
      dimension: "revenue_impact",
      weight: IMPORTANCE_WEIGHTS.revenue_impact,
      value: revenueValue,
      contribution: round2(revenueValue * IMPORTANCE_WEIGHTS.revenue_impact * 100),
      rationale: `Revenue impact magnitude ${revenueValue}.`,
    },
    {
      dimension: "seller_impact",
      weight: IMPORTANCE_WEIGHTS.seller_impact,
      value: sellerValue,
      contribution: round2(sellerValue * IMPORTANCE_WEIGHTS.seller_impact * 100),
      rationale: `Seller impact magnitude ${sellerValue}.`,
    },
    {
      dimension: "manager_impact",
      weight: IMPORTANCE_WEIGHTS.manager_impact,
      value: managerValue,
      contribution: round2(managerValue * IMPORTANCE_WEIGHTS.manager_impact * 100),
      rationale: `Manager impact magnitude ${managerValue}.`,
    },
  ];

  const score = round2(factors.reduce((sum, f) => sum + f.contribution, 0));
  return { tier: tierFor(score), score, factors };
}

/**
 * Deterministically consolidate signals across merged events by taking the
 * element-wise strongest value. Commutative and associative -> merge order does
 * not change the result.
 */
export function mergeSignals(a: EventSignals, b: EventSignals): EventSignals {
  return {
    governance: Boolean(a.governance) || Boolean(b.governance),
    customerImpact: Math.max(clamp01(a.customerImpact), clamp01(b.customerImpact)),
    revenueImpact: Math.max(clamp01(a.revenueImpact), clamp01(b.revenueImpact)),
    sellerImpact: Math.max(clamp01(a.sellerImpact), clamp01(b.sellerImpact)),
    managerImpact: Math.max(clamp01(a.managerImpact), clamp01(b.managerImpact)),
  };
}
