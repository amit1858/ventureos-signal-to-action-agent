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

// -- executive money model -------------------------------------------------
// Annual contract value (ACV) is derived honestly from monthly spend × 12, in
// rupees. No invented FX. Totals land in the low-crores range — believable for
// an SMB book and consistent across every executive surface.
export function annualValue(a: Account): number {
  return Math.max(0, a.current_month_spend) * 12;
}

export function bookValue(accounts: Account[]): number {
  return accounts.reduce((s, a) => s + annualValue(a), 0);
}

// An account is "at risk" if support risk is high, spend is falling sharply, or
// a renewal is closing while engagement is weak.
export function isAtRisk(a: Account): boolean {
  return (
    a.support_risk_score >= RISK_HIGH ||
    spendChangePct(a) <= -0.1 ||
    (a.renewal_days <= RENEWAL_SOON && a.engagement_score <= ENGAGE_LOW)
  );
}

// Revenue exposure = ACV of every at-risk account.
export function revenueAtRisk(accounts: Account[]): number {
  return accounts.filter(isAtRisk).reduce((s, a) => s + annualValue(a), 0);
}

// Growth opportunity = scaled expansion headroom on high-potential accounts.
export function growthOpportunity(accounts: Account[]): number {
  return accounts
    .filter((a) => a.growth_potential_score >= OPP_HIGH)
    .reduce((s, a) => s + annualValue(a) * (a.growth_potential_score / 100) * 0.5, 0);
}

// Accounts that need immediate executive attention = the Act-Now quadrant
// (high risk AND high opportunity), matching the portfolio matrix.
export function countAttention(accounts: Account[]): number {
  return accounts.filter((a) => quadrantOf(a.support_risk_score, a.growth_potential_score) === "act_now").length;
}

// -- narrative helpers -----------------------------------------------------
export type ReasonTone = "risk" | "opp" | "neutral";

export interface Reason {
  key: string;
  text: string;
  tone: ReasonTone;
}

// Concrete, business-readable "why this account?" bullets derived from the
// account's own metrics. Risks first, then opportunities.
export function accountReasons(a: Account): Reason[] {
  const r: Reason[] = [];
  const sp = spendChangePct(a);
  if (sp <= -0.05) r.push({ key: "spend", tone: "risk", text: `Investment down ${Math.round(Math.abs(sp) * 100)}% month-over-month` });
  else if (sp >= 0.05) r.push({ key: "spend", tone: "opp", text: `Investment up ${Math.round(sp * 100)}% month-over-month` });

  if (a.renewal_days < 0) r.push({ key: "renewal", tone: "risk", text: `Renewal ${Math.abs(a.renewal_days)} days overdue` });
  else if (a.renewal_days <= RENEWAL_SOON) r.push({ key: "renewal", tone: "risk", text: `Renewal due in ${a.renewal_days} days` });

  if (a.support_risk_score >= RISK_HIGH) r.push({ key: "support", tone: "risk", text: `Support risk elevated (${Math.round(a.support_risk_score)}/100)` });
  if (a.engagement_score <= ENGAGE_LOW) r.push({ key: "engage", tone: "risk", text: `Customer engagement low (${Math.round(a.engagement_score)}/100)` });
  if (a.last_contact_days >= INACTIVE_DAYS) r.push({ key: "contact", tone: "risk", text: `No seller contact in ${a.last_contact_days} days` });
  if (a.product_usage_score < 40) r.push({ key: "usage-low", tone: "risk", text: `Product adoption lagging (${Math.round(a.product_usage_score)}/100)` });

  if (a.growth_potential_score >= OPP_HIGH) r.push({ key: "growth", tone: "opp", text: `High expansion potential (${Math.round(a.growth_potential_score)}/100)` });
  if (a.campaign_response_score >= CAMPAIGN_HOT) r.push({ key: "campaign", tone: "opp", text: `Engaged with recent campaign (${Math.round(a.campaign_response_score)}/100)` });
  if (a.product_usage_score >= USAGE_STRONG) r.push({ key: "usage-high", tone: "opp", text: `Strong product adoption (${Math.round(a.product_usage_score)}/100)` });

  const order = (t: ReasonTone) => (t === "risk" ? 0 : t === "opp" ? 1 : 2);
  return r.sort((x, y) => order(x.tone) - order(y.tone)).slice(0, 5);
}

export function businessImpact(a: Account): { text: string; tone: ReasonTone } {
  const q = quadrantOf(a.support_risk_score, a.growth_potential_score);
  if (q === "act_now") return { text: "High-value account at risk — protect and expand", tone: "risk" };
  if (q === "escalate") return { text: "Churn risk — revenue exposure if left unaddressed", tone: "risk" };
  if (q === "nurture") return { text: "Strong expansion upside — grow the relationship", tone: "opp" };
  return { text: "Stable relationship — maintain and monitor", tone: "neutral" };
}

// -- emerging trends (natural-language, for the AI Insights panel) ----------
export interface Trend {
  key: string;
  text: string;
  tone: ReasonTone;
}

export function emergingTrends(accounts: Account[]): Trend[] {
  const out: Trend[] = [];
  const renewWeek = accounts.filter((a) => a.renewal_days >= 0 && a.renewal_days <= 7).length;
  const renewMonth = accounts.filter((a) => a.renewal_days > 7 && a.renewal_days <= 30).length;
  const decliningEngage = accounts.filter((a) => a.engagement_score <= ENGAGE_LOW).length;
  const risingSupport = accounts.filter((a) => a.support_risk_score >= RISK_HIGH).length;
  const crossSell = accounts.filter((a) => a.growth_potential_score >= OPP_HIGH && a.support_risk_score < RISK_MID).length;
  const spendUp = accounts.filter((a) => spendChangePct(a) >= 0.05).length;
  const spendDown = accounts.filter((a) => spendChangePct(a) <= -0.1).length;

  if (renewWeek) out.push({ key: "renew-week", tone: "risk", text: `${renewWeek} account${renewWeek === 1 ? "" : "s"} renew within 7 days` });
  else if (renewMonth) out.push({ key: "renew-month", tone: "risk", text: `${renewMonth} account${renewMonth === 1 ? "" : "s"} renew within 30 days` });
  if (risingSupport) out.push({ key: "support", tone: "risk", text: `${risingSupport} account${risingSupport === 1 ? "" : "s"} with rising support risk` });
  if (decliningEngage) out.push({ key: "engage", tone: "risk", text: `${decliningEngage} account${decliningEngage === 1 ? "" : "s"} showing declining engagement` });
  if (crossSell) out.push({ key: "crosssell", tone: "opp", text: `${crossSell} healthy account${crossSell === 1 ? "" : "s"} ready for cross-sell` });
  if (spendUp) out.push({ key: "spendup", tone: "opp", text: `${spendUp} account${spendUp === 1 ? "" : "s"} expanding investment month-over-month` });
  else if (spendDown) out.push({ key: "spenddown", tone: "risk", text: `${spendDown} account${spendDown === 1 ? "" : "s"} cutting investment month-over-month` });

  return out.slice(0, 5);
}
