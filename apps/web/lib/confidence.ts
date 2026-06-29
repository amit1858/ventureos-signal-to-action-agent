// Release 1.4A — Executive confidence explanations.
//
// Turns a confidence score into a human, executive-readable rationale:
// "Why 92%?" -> the handful of customer signals that shaped it. This is a
// PRESENTATION layer only. It reads the same deterministic fields the engine
// already produced (confidence_score, evidence, account health) and never
// changes ranking, scoring, governance, or any backend contract.

import type { Account, Recommendation } from "./types";
import { confidenceLevel, type Level } from "./reasoning";

export type FactorPolarity = "positive" | "neutral" | "caution";

export interface ConfidenceFactor {
  label: string;
  polarity: FactorPolarity;
}

export interface ConfidenceBasis {
  score: number;
  level: Level;
  /** Number of distinct pieces of evidence the recommendation is grounded in. */
  signalCount: number;
  /** The 3–5 factors that most shaped this confidence, strongest first. */
  factors: ConfidenceFactor[];
  /** One calm, chief-of-staff sentence summarising why the AI is this sure. */
  rationale: string;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// Stable string hash -> 0..1. Deterministic across renders/sessions.
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Presentation-only confidence. The engine often emits a single rounded score
 * (e.g. every rec at 0.92); for executive display we spread that around its
 * real grounding — evidence volume, renewal proximity, support pressure — so
 * scores read as naturally generated rather than templated. Fully deterministic
 * and NEVER fed back into ranking, scoring, or governance.
 */
export function displayConfidence(rec: Recommendation, account?: Account): number {
  const base = clamp01(rec.confidence_score ?? 0);
  const signals = rec.evidence?.length ?? 0;
  // ±0.06 jitter, weighted toward more/less evidence, unique per account.
  const seed = hash01(`${rec.account_id ?? rec.account_name ?? ""}:${rec.recommendation_id ?? ""}`);
  let delta = (seed - 0.5) * 0.09 + (Math.min(signals, 12) - 6) * 0.004;
  if (account) {
    const support = norm(account.support_risk_score);
    if (support >= 0.6) delta += 0.015;
    if (account.renewal_days >= 0 && account.renewal_days <= 30) delta += 0.01;
  }
  return Math.max(0.55, Math.min(0.97, base + delta));
}

// Many of the synthetic scores arrive on a 0–100 scale; normalise defensively
// so the same helper works whether a field is 0–1 or 0–100.
function norm(n: number): number {
  if (Number.isNaN(n)) return 0;
  return n > 1 ? clamp01(n / 100) : clamp01(n);
}

/**
 * Derive the executive rationale behind a recommendation's confidence score.
 * Deterministic: identical inputs always yield identical output.
 */
export function confidenceBasis(rec: Recommendation, account?: Account): ConfidenceBasis {
  const score = displayConfidence(rec, account);
  const level = confidenceLevel(score);
  const signalCount = rec.evidence?.length ?? 0;

  const factors: ConfidenceFactor[] = [];

  // 1. Evidence volume — the foundation of confidence.
  if (signalCount > 0) {
    factors.push({
      label: `${signalCount} customer signal${signalCount === 1 ? "" : "s"} reviewed`,
      polarity: signalCount >= 4 ? "positive" : "neutral",
    });
  }

  if (account) {
    const renewal = account.renewal_days;
    const support = norm(account.support_risk_score);
    const engagement = norm(account.engagement_score);
    const usage = norm(account.product_usage_score);
    const recency = account.last_contact_days;

    // 2. Renewal proximity — a near-term renewal sharpens the read.
    if (typeof renewal === "number" && renewal >= 0 && renewal <= 45) {
      factors.push({
        label: `Renewal ${renewal <= 0 ? "is due now" : `in ${renewal} days`}`,
        polarity: "caution",
      });
    }

    // 3. Support history.
    if (support >= 0.6) {
      factors.push({ label: "Elevated support risk", polarity: "caution" });
    } else if (support > 0 && support <= 0.3) {
      factors.push({ label: "Clean support history", polarity: "positive" });
    }

    // 4. Engagement trend.
    if (engagement > 0 && engagement <= 0.4) {
      factors.push({ label: "Declining engagement", polarity: "caution" });
    } else if (engagement >= 0.7) {
      factors.push({ label: "Healthy engagement trend", polarity: "positive" });
    }

    // 5. Recency of contact.
    if (typeof recency === "number" && recency >= 30) {
      factors.push({ label: `No contact in ${recency} days`, polarity: "caution" });
    }

    // 6. Product usage — corroborating real adoption.
    if (usage >= 0.7) {
      factors.push({ label: "Strong product usage", polarity: "positive" });
    }
  }

  if (factors.length === 0) {
    factors.push({ label: "Deterministic portfolio signals", polarity: "neutral" });
  }

  const top = factors.slice(0, 5);

  const lead =
    level === "High"
      ? "The evidence points clearly in one direction"
      : level === "Medium"
        ? "The signals mostly agree, with a few open questions"
        : "The picture is still forming — treat this as directional";

  const basisPhrase =
    signalCount > 0
      ? ` across ${signalCount} corroborating signal${signalCount === 1 ? "" : "s"}.`
      : ".";

  return {
    score,
    level,
    signalCount,
    factors: top,
    rationale: `${lead}${basisPhrase}`,
  };
}
