// Executive Command Center derivations.
//
// Pure, presentation-free helpers that turn the existing GET /api/accounts and
// POST /api/recommendations payloads into the aggregates the executive cockpit
// renders. No backend changes: everything here is derived client-side from data
// the API already returns.

import type { Account, Recommendation } from "./types";

// -- thresholds (documented, single source of truth) ----------------------
export const RISK_HIGH = 60; // support_risk_score >= -> high risk
export const RISK_MID = 35;
export const OPP_HIGH = 65; // growth_potential_score >= -> high opportunity
export const OPP_MID = 45;
export const RENEWAL_SOON = 45; // renewal_days <= -> renewal window closing
export const ENGAGE_LOW = 40; // engagement_score <= -> low engagement
export const INACTIVE_DAYS = 30; // last_contact_days >= -> no recent contact
export const USAGE_STRONG = 70; // product_usage_score >= -> strong adoption
export const CAMPAIGN_HOT = 65; // campaign_response_score >= -> campaign engaged
export const HIGH_CONFIDENCE = 0.75;

// Quadrant boundaries use the plot midpoint (50) so they line up with the matrix.
const AXIS_MID = 50;

export type Quadrant = "act_now" | "escalate" | "nurture" | "monitor";

export function quadrantOf(risk: number, opp: number): Quadrant {
  const hiRisk = risk >= AXIS_MID;
  const hiOpp = opp >= AXIS_MID;
  if (hiRisk && hiOpp) return "act_now";
  if (hiRisk && !hiOpp) return "escalate";
  if (!hiRisk && hiOpp) return "nurture";
  return "monitor";
}

export interface QuadrantMeta {
  label: string;
  hint: string;
  color: string; // hex for SVG fills
  tone: string; // tailwind text token
  ring: string; // tailwind border token
  bg: string; // tailwind bg token
}

export const QUADRANT_META: Record<Quadrant, QuadrantMeta> = {
  act_now: {
    label: "Act Now",
    hint: "High risk · high opportunity",
    color: "#76B900",
    tone: "text-accent",
    ring: "border-accent/40",
    bg: "bg-accent/10",
  },
  escalate: {
    label: "Escalate",
    hint: "High risk · lower opportunity",
    color: "#EF6B73",
    tone: "text-risk",
    ring: "border-risk/40",
    bg: "bg-risk/10",
  },
  nurture: {
    label: "Nurture",
    hint: "Low risk · high opportunity",
    color: "#00D4FF",
    tone: "text-cyan",
    ring: "border-cyan/40",
    bg: "bg-cyan/10",
  },
  monitor: {
    label: "Monitor",
    hint: "Low risk · low opportunity",
    color: "#6B7480",
    tone: "text-faint",
    ring: "border-edge",
    bg: "bg-surface2/60",
  },
};

export function spendChangePct(a: Account): number {
  if (!a.previous_month_spend || a.previous_month_spend <= 0) return 0;
  return (a.current_month_spend - a.previous_month_spend) / a.previous_month_spend;
}

// -- thematic insight aggregation -----------------------------------------
export interface Theme {
  key: string;
  label: string;
  detail: string;
  count: number;
}

export function riskThemes(accounts: Account[]): Theme[] {
  const renewSoon = accounts.filter((a) => a.renewal_days <= RENEWAL_SOON);
  const minRenew = renewSoon.length ? Math.min(...renewSoon.map((a) => a.renewal_days)) : 0;
  const themes: Theme[] = [
    {
      key: "renewal",
      label: renewSoon.length ? `Renewal in ${minRenew} days` : "Renewals approaching",
      detail: `Renewal window ≤ ${RENEWAL_SOON} days`,
      count: renewSoon.length,
    },
    {
      key: "usage",
      label: "Usage / spend declining",
      detail: "Spend down >10% month-over-month",
      count: accounts.filter((a) => spendChangePct(a) <= -0.1).length,
    },
    {
      key: "support",
      label: "Support tickets increasing",
      detail: `Support-risk score ≥ ${RISK_HIGH}`,
      count: accounts.filter((a) => a.support_risk_score >= RISK_HIGH).length,
    },
    {
      key: "engagement",
      label: "Engagement dropping",
      detail: `Engagement score ≤ ${ENGAGE_LOW}`,
      count: accounts.filter((a) => a.engagement_score <= ENGAGE_LOW).length,
    },
    {
      key: "inactivity",
      label: "No recent contact",
      detail: `Last touch ≥ ${INACTIVE_DAYS} days`,
      count: accounts.filter((a) => a.last_contact_days >= INACTIVE_DAYS).length,
    },
  ];
  return themes.filter((t) => t.count > 0).sort((a, b) => b.count - a.count).slice(0, 4);
}

export function opportunityThemes(accounts: Account[]): Theme[] {
  const themes: Theme[] = [
    {
      key: "expansion",
      label: "Cross-sell / upsell fit",
      detail: `Growth-potential score ≥ ${OPP_HIGH}`,
      count: accounts.filter((a) => a.growth_potential_score >= OPP_HIGH).length,
    },
    {
      key: "campaign",
      label: "Campaign-engaged, ready for outreach",
      detail: `Campaign response ≥ ${CAMPAIGN_HOT}`,
      count: accounts.filter((a) => a.campaign_response_score >= CAMPAIGN_HOT).length,
    },
    {
      key: "workload",
      label: "New workload adoption",
      detail: "Spend expanding month-over-month",
      count: accounts.filter((a) => spendChangePct(a) >= 0.05).length,
    },
    {
      key: "adoption",
      label: "Strong product adoption",
      detail: `Product-usage score ≥ ${USAGE_STRONG}`,
      count: accounts.filter((a) => a.product_usage_score >= USAGE_STRONG).length,
    },
  ];
  return themes.filter((t) => t.count > 0).sort((a, b) => b.count - a.count).slice(0, 4);
}

// -- executive statistics --------------------------------------------------
export interface ExecStats {
  count: number;
  avgConfidence: number;
  highConfidence: number;
  pending: number;
  approved: number;
  rejected: number;
  approvalRate: number; // approved / decided
  avgTimeMs: number; // workflow latency / recommendations
}

export function execStats(recs: Recommendation[], latencyMs: number): ExecStats {
  const count = recs.length;
  const avgConfidence = count ? recs.reduce((s, r) => s + r.confidence_score, 0) / count : 0;
  const approved = recs.filter((r) => r.approval_status === "approved").length;
  const rejected = recs.filter((r) => r.approval_status === "rejected").length;
  const decided = approved + rejected;
  return {
    count,
    avgConfidence,
    highConfidence: recs.filter((r) => r.confidence_score >= HIGH_CONFIDENCE).length,
    pending: recs.filter((r) => r.approval_status === "pending").length,
    approved,
    rejected,
    approvalRate: decided ? approved / decided : 0,
    avgTimeMs: count ? latencyMs / count : latencyMs,
  };
}

export interface Distribution {
  high: number;
  med: number;
  low: number;
}

export function riskDistribution(accounts: Account[]): Distribution {
  return {
    high: accounts.filter((a) => a.support_risk_score >= RISK_HIGH).length,
    med: accounts.filter((a) => a.support_risk_score >= RISK_MID && a.support_risk_score < RISK_HIGH).length,
    low: accounts.filter((a) => a.support_risk_score < RISK_MID).length,
  };
}

export function opportunityDistribution(accounts: Account[]): Distribution {
  return {
    high: accounts.filter((a) => a.growth_potential_score >= OPP_HIGH).length,
    med: accounts.filter((a) => a.growth_potential_score >= OPP_MID && a.growth_potential_score < OPP_HIGH).length,
    low: accounts.filter((a) => a.growth_potential_score < OPP_MID).length,
  };
}

export function countHighRisk(accounts: Account[]): number {
  return accounts.filter((a) => a.support_risk_score >= RISK_HIGH).length;
}

export function countHighOpportunity(accounts: Account[]): number {
  return accounts.filter((a) => a.growth_potential_score >= OPP_HIGH).length;
}
