// Deterministic Executive Reasoning Engine.
//
// This is the single, pure reasoning layer that turns the data the API already
// returns (accounts + recommendations) into executive, business-language
// guidance: a morning brief, "why this account" bullets, business impact, why
// now / if ignored / expected outcome, and portfolio-level insights.
//
// It is intentionally provider-agnostic and side-effect free. Today every field
// is derived deterministically from existing signals (no LLM, no backend
// change). Tomorrow an LLM-backed implementation can produce the SAME
// `RecommendationReasoning` / `MorningBrief` shapes, so the UI components stay
// unchanged and we can compare deterministic vs LLM reasoning side by side.

import type { Account, Recommendation } from "./types";
import {
  businessAction,
  estimateActionMinutes,
  resolveActionKey,
  timingPhrase,
  type ActionKey,
  type BusinessAction,
} from "./actions";
import {
  accountReasons,
  annualValue,
  businessImpact,
  countAttention,
  growthOpportunity,
  quadrantOf,
  revenueAtRisk,
  spendChangePct,
  CAMPAIGN_HOT,
  ENGAGE_LOW,
  HIGH_CONFIDENCE,
  INACTIVE_DAYS,
  OPP_HIGH,
  OPP_MID,
  RENEWAL_SOON,
  RISK_HIGH,
  RISK_MID,
  USAGE_STRONG,
  type Reason,
  type ReasonTone,
} from "./portfolio";

// -- business levels (never expose raw 0–100 model scores) -----------------
export type Level = "High" | "Medium" | "Low";

export function levelTone(level: Level, positive: boolean): ReasonTone {
  if (level === "Low") return positive ? "neutral" : "neutral";
  return positive ? "opp" : "risk";
}

export function confidenceLevel(score: number): Level {
  if (score >= HIGH_CONFIDENCE) return "High";
  if (score >= 0.5) return "Medium";
  return "Low";
}

// Composite churn pressure from the existing risk signals.
function churnScore(a: Account): number {
  const sp = spendChangePct(a);
  let s = 0;
  if (a.support_risk_score >= RISK_HIGH) s += 2;
  else if (a.support_risk_score >= RISK_MID) s += 1;
  if (sp <= -0.2) s += 2;
  else if (sp <= -0.1) s += 1;
  if (a.renewal_days >= 0 && a.renewal_days <= RENEWAL_SOON && a.engagement_score <= ENGAGE_LOW) s += 2;
  else if (a.renewal_days >= 0 && a.renewal_days <= RENEWAL_SOON) s += 1;
  if (a.last_contact_days >= INACTIVE_DAYS) s += 1;
  if (a.engagement_score <= ENGAGE_LOW) s += 1;
  return s;
}

export function churnRiskLevel(a: Account): Level {
  const s = churnScore(a);
  if (s >= 4) return "High";
  if (s >= 2) return "Medium";
  return "Low";
}

export function expansionLevel(a: Account): Level {
  const signals =
    (a.campaign_response_score >= CAMPAIGN_HOT ? 1 : 0) +
    (a.product_usage_score >= USAGE_STRONG ? 1 : 0) +
    (spendChangePct(a) >= 0.05 ? 1 : 0);
  if (a.growth_potential_score >= OPP_HIGH && signals >= 1) return "High";
  if (a.growth_potential_score >= OPP_MID) return "Medium";
  return "Low";
}

// Estimated rupee exposure (or upside) for a single account — deterministic
// fractions of annual contract value tied to the churn / expansion level.
export interface RevenueImpact {
  amount: number;
  kind: "risk" | "growth" | "stable";
}

export function revenueImpact(a: Account): RevenueImpact {
  const acv = annualValue(a);
  const churn = churnRiskLevel(a);
  if (churn === "High") return { amount: acv * 0.4, kind: "risk" };
  if (churn === "Medium") return { amount: acv * 0.2, kind: "risk" };
  if (expansionLevel(a) !== "Low") {
    return { amount: acv * (a.growth_potential_score / 100) * 0.5, kind: "growth" };
  }
  return { amount: 0, kind: "stable" };
}

export interface ImpactDetail {
  headline: string;
  headlineTone: ReasonTone;
  churnRisk: Level;
  expansion: Level;
  confidence: Level;
  revenue: RevenueImpact;
}

export function businessImpactDetail(a: Account, rec: Recommendation): ImpactDetail {
  const bi = businessImpact(a);
  return {
    headline: bi.text,
    headlineTone: bi.tone,
    churnRisk: churnRiskLevel(a),
    expansion: expansionLevel(a),
    confidence: confidenceLevel(rec.confidence_score),
    revenue: revenueImpact(a),
  };
}

// -- narrative one-liners (Why Now / If Ignored / Expected Outcome) ---------
type Driver = "renewal" | "support" | "spend" | "contact" | "engagement" | "expansion" | "stable";

function dominantDriver(a: Account): Driver {
  const sp = spendChangePct(a);
  if (
    a.renewal_days >= 0 &&
    a.renewal_days <= RENEWAL_SOON &&
    (a.engagement_score <= ENGAGE_LOW || a.support_risk_score >= RISK_MID || sp <= -0.05)
  )
    return "renewal";
  if (a.support_risk_score >= RISK_HIGH) return "support";
  if (sp <= -0.1) return "spend";
  if (a.last_contact_days >= INACTIVE_DAYS) return "contact";
  if (a.engagement_score <= ENGAGE_LOW) return "engagement";
  if (a.growth_potential_score >= OPP_HIGH) return "expansion";
  return "stable";
}

export function whyNow(a: Account): string {
  const inactive = a.last_contact_days >= INACTIVE_DAYS;
  switch (dominantDriver(a)) {
    case "renewal":
      if (a.renewal_days < 0)
        return `Renewal is ${Math.abs(a.renewal_days)} days overdue while account health continues to slip.`;
      return `Renewal is due in ${a.renewal_days} days while customer engagement has steadily declined.`;
    case "support":
      return a.growth_potential_score >= OPP_HIGH
        ? "Recent support activity suggests adoption challenges while expansion potential remains high."
        : "Support activity has been climbing, signalling friction that needs attention before it spreads.";
    case "spend":
      return inactive
        ? "Investment has dropped sharply and no seller interaction has occurred in over a month."
        : "Investment has dropped sharply, and the trend will compound if left unaddressed.";
    case "contact":
      return `No seller interaction has occurred in ${a.last_contact_days} days while risk indicators are climbing.`;
    case "engagement":
      return "Customer engagement has steadily declined and now needs to be re-energised.";
    case "expansion":
      return "Strong product adoption and campaign response make this the right moment to expand the relationship.";
    case "stable":
    default:
      return "The account is healthy today; a light-touch check-in keeps the relationship warm.";
  }
}

export function ifIgnored(a: Account): string {
  const churn = churnRiskLevel(a);
  const driver = dominantDriver(a);
  if (driver === "expansion" && churn === "Low")
    return "The expansion opportunity may lose urgency or shift to a competitor.";
  if (driver === "support" && churn === "Low")
    return "Support friction may continue to reduce product adoption and future spend.";
  if (churn !== "Low") {
    if (a.renewal_days >= 0 && a.renewal_days <= RENEWAL_SOON)
      return "If no action is taken, this customer may churn during the upcoming renewal cycle.";
    return "Left unaddressed, the declining trend is likely to deepen into reduced spend or churn.";
  }
  if (driver === "stable")
    return "There is little immediate downside, but proactive contact preserves goodwill and future growth.";
  return "Momentum may stall, making recovery slower and more costly later.";
}

const EXPECTED_OUTCOME: Record<ActionKey, string> = {
  recover: "A focused recovery conversation can stabilise the account before renewal.",
  renewal: "An executive renewal call can secure the contract and protect recurring revenue.",
  review: "A strategic review can reverse the spend decline and restore account value.",
  winback: "A win-back motion can re-establish value and reopen the relationship.",
  crosssell: "A cross-sell discussion could increase annual account value.",
  adoption: "An adoption workshop could reduce friction and lift product usage.",
  checkin: "A proactive check-in can surface new needs and reinforce the relationship.",
  manual_review: "A quick manual review will confirm whether action is warranted.",
  hold: "Holding outreach now avoids unnecessary noise while the account stays healthy.",
  generic: "Timely follow-through keeps the account on track.",
};

export function expectedOutcome(key: ActionKey): string {
  return EXPECTED_OUTCOME[key];
}

// -- per-recommendation reasoning bundle ------------------------------------
export interface RecommendationReasoning {
  action: BusinessAction;
  reasons: Reason[];
  impact: ImpactDetail;
  whyNow: string;
  ifIgnored: string;
  expectedOutcome: string;
  estimatedMinutes: number;
  timing: string;
}

function fallbackImpact(rec: Recommendation): ImpactDetail {
  return {
    headline: rec.risk_summary || rec.opportunity_summary || "Review the account context.",
    headlineTone: "neutral",
    churnRisk: "Medium",
    expansion: "Medium",
    confidence: confidenceLevel(rec.confidence_score),
    revenue: { amount: 0, kind: "stable" },
  };
}

export function reasonForRecommendation(rec: Recommendation, account?: Account): RecommendationReasoning {
  const ctx = {
    governanceStatus: rec.governance_status,
    growthPotential: account?.growth_potential_score,
    productUsage: account?.product_usage_score,
  };
  const action = businessAction(rec.action_type, ctx);
  return {
    action,
    reasons: account ? accountReasons(account) : [],
    impact: account ? businessImpactDetail(account, rec) : fallbackImpact(rec),
    whyNow: account ? whyNow(account) : rec.priority_reason,
    ifIgnored: account ? ifIgnored(account) : "Acting promptly protects the relationship and its revenue.",
    expectedOutcome: expectedOutcome(action.key),
    estimatedMinutes: estimateActionMinutes(action.key, rec.evidence?.length ?? 0),
    timing: timingPhrase(action.urgency),
  };
}

// -- executive morning brief (P1) -------------------------------------------
export interface MorningBriefTop {
  accountId: string;
  accountName: string;
  industry?: string;
  action: BusinessAction;
  timing: string;
  estimatedMinutes: number;
}

export interface MorningBrief {
  analyzed: number;
  attention: number;
  revenueAtRisk: number;
  growthOpportunity: number;
  hasResult: boolean;
  top: MorningBriefTop | null;
}

export function morningBrief(
  accounts: Account[],
  accountsById: Record<string, Account>,
  recs: Recommendation[],
  hasResult: boolean,
): MorningBrief {
  const topRec = hasResult ? recs[0] : null;
  const topAccount = topRec ? accountsById[topRec.account_id] : undefined;
  let top: MorningBriefTop | null = null;
  if (topRec) {
    const action = businessAction(topRec.action_type, {
      governanceStatus: topRec.governance_status,
      growthPotential: topAccount?.growth_potential_score,
      productUsage: topAccount?.product_usage_score,
    });
    top = {
      accountId: topRec.account_id,
      accountName: topRec.account_name,
      industry: topAccount?.industry,
      action,
      timing: timingPhrase(action.urgency),
      estimatedMinutes: estimateActionMinutes(action.key, topRec.evidence?.length ?? 0),
    };
  }
  return {
    analyzed: accounts.length,
    attention: countAttention(accounts),
    revenueAtRisk: revenueAtRisk(accounts),
    growthOpportunity: growthOpportunity(accounts),
    hasResult,
    top,
  };
}

// -- time-aware greeting + dynamic display name (never hardcoded) -----------
export type GreetingKind = "morning" | "afternoon" | "evening" | "welcome";

export function greetingKind(date: Date): GreetingKind {
  const h = date.getHours();
  if (h >= 5 && h <= 11) return "morning";
  if (h >= 12 && h <= 16) return "afternoon";
  if (h >= 17 && h <= 23) return "evening";
  return "welcome";
}

export function greetingText(date: Date): string {
  switch (greetingKind(date)) {
    case "morning":
      return "Good Morning";
    case "afternoon":
      return "Good Afternoon";
    case "evening":
      return "Good Evening";
    case "welcome":
    default:
      return "Welcome Back";
  }
}

const DISPLAY_NAME_KEY = "s2a_display_name";

function firstName(full: string): string {
  const token = full.trim().split(/\s+/)[0] ?? "";
  if (!token) return "";
  return token.charAt(0).toUpperCase() + token.slice(1);
}

// Resolve the current user's first name WITHOUT hardcoding any value.
// Priority: local-only override (localStorage) → build-time env → omitted.
// There is no auth/session in this MVP, so a name only appears if the operator
// configured one; otherwise the greeting is shown without a name.
export function resolveDisplayName(): string | undefined {
  if (typeof window !== "undefined") {
    try {
      const v = window.localStorage.getItem(DISPLAY_NAME_KEY);
      if (v && v.trim()) return firstName(v);
    } catch {
      /* ignore storage access errors */
    }
  }
  const env = process.env.NEXT_PUBLIC_USER_NAME;
  if (env && env.trim()) return firstName(env);
  return undefined;
}

// -- portfolio-level summary insights (P8) ----------------------------------
export interface PortfolioInsight {
  key: string;
  text: string;
  tone: ReasonTone;
}

export function portfolioInsights(accounts: Account[]): PortfolioInsight[] {
  if (!accounts.length) return [];
  const out: PortfolioInsight[] = [];

  const renew30 = accounts.filter((a) => a.renewal_days >= 0 && a.renewal_days <= 30).length;
  if (renew30)
    out.push({
      key: "renewal",
      tone: "risk",
      text: `${renew30} account${renew30 === 1 ? " has a renewal window" : "s have renewal windows"} within 30 days.`,
    });

  const decliningEngage = accounts.filter((a) => a.engagement_score <= ENGAGE_LOW).length;
  if (decliningEngage)
    out.push({
      key: "engagement",
      tone: "risk",
      text: `${decliningEngage} account${decliningEngage === 1 ? "" : "s"} show${decliningEngage === 1 ? "s" : ""} declining engagement.`,
    });

  const risingSupport = accounts.filter((a) => a.support_risk_score >= RISK_HIGH).length;
  if (risingSupport)
    out.push({
      key: "support",
      tone: "risk",
      text: `${risingSupport} account${risingSupport === 1 ? "" : "s"} show${risingSupport === 1 ? "s" : ""} rising support risk.`,
    });

  const crossSell = accounts.filter(
    (a) => a.growth_potential_score >= OPP_HIGH && a.support_risk_score < RISK_MID,
  ).length;
  if (crossSell)
    out.push({
      key: "crosssell",
      tone: "opp",
      text: `${crossSell} account${crossSell === 1 ? " is a strong cross-sell candidate" : "s are strong cross-sell candidates"}.`,
    });

  const hold = accounts.filter((a) => quadrantOf(a.support_risk_score, a.growth_potential_score) === "monitor").length;
  if (hold)
    out.push({
      key: "hold",
      tone: "neutral",
      text: `${hold} account${hold === 1 ? "" : "s"} should not be contacted yet.`,
    });

  return out.slice(0, 5);
}

// Re-export the resolver so callers can branch on the resolved action key
// without importing from two modules.
export { resolveActionKey };
