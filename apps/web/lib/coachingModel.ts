// Release 2.0 — Manager AI Coach: deterministic coaching model.
//
// PURE, presentation-free derivations that turn the existing GET /api/accounts +
// POST /api/recommendations payloads into the seller-coaching view the Manager
// AI Coach renders. Everything here is a deterministic function of data the API
// already returns — there is NO randomness, NO backend, and NO mutation of
// scoring / ranking / governance / approvals / the Decision Ledger.
//
// The "seller" is a presentation construct: the synthetic dataset has no seller
// entity, so we deterministically partition the 150-account book across a fixed
// roster (stable round-robin over the id-sorted account list). The same input
// always yields the same sellers, the same metrics, and the same narrative.

import type { Account, Recommendation } from "./types";
import {
  annualValue,
  isAtRisk,
  spendChangePct,
  RISK_HIGH,
  ENGAGE_LOW,
  INACTIVE_DAYS,
  RENEWAL_SOON,
  OPP_HIGH,
} from "./portfolio";

// -- Fixed seller roster ----------------------------------------------------
// Order matters: round-robin assignment fills earlier sellers first, so the
// four named in the product spec (Rahul, Sneha, Aman, Vikram) always own a
// book of accounts regardless of dataset size.
interface RosterEntry {
  id: string;
  firstName: string;
  lastName: string;
  region: string;
}

const ROSTER: RosterEntry[] = [
  { id: "slr_rahul", firstName: "Rahul", lastName: "Mehta", region: "West" },
  { id: "slr_sneha", firstName: "Sneha", lastName: "Iyer", region: "South" },
  { id: "slr_aman", firstName: "Aman", lastName: "Gupta", region: "North" },
  { id: "slr_vikram", firstName: "Vikram", lastName: "Rao", region: "South" },
  { id: "slr_priya", firstName: "Priya", lastName: "Nair", region: "West" },
  { id: "slr_karthik", firstName: "Karthik", lastName: "Menon", region: "East" },
];

// Deterministic 0..1 pseudo-value seeded by a string. Used only for stable
// per-seller "recovery factors" — never for data that must be auditable.
function seed01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // map to 0..1
  return ((h >>> 0) % 1000) / 1000;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

// -- Coaching focus ---------------------------------------------------------
export type CoachFocus =
  | "renewal_recovery"
  | "engagement_recovery"
  | "support_recovery"
  | "adoption_recovery"
  | "expansion_execution";

export const FOCUS_LABEL: Record<CoachFocus, string> = {
  renewal_recovery: "Renewal recovery coaching",
  engagement_recovery: "Engagement recovery coaching",
  support_recovery: "Support-risk recovery coaching",
  adoption_recovery: "Adoption recovery coaching",
  expansion_execution: "Expansion execution coaching",
};

export const FOCUS_SHORT: Record<CoachFocus, string> = {
  renewal_recovery: "Renewal recovery",
  engagement_recovery: "Engagement recovery",
  support_recovery: "Support recovery",
  adoption_recovery: "Adoption recovery",
  expansion_execution: "Expansion execution",
};

// -- Seller view model ------------------------------------------------------
export interface CoachSeller {
  id: string;
  name: string;
  firstName: string;
  region: string;
  accountIds: string[];
  accountCount: number;

  // Money (annualised, INR — consistent with the executive surfaces).
  portfolioAcv: number;
  revenueExposureBefore: number;
  revenueExposureAfter: number;

  // Execution health.
  blockedBefore: number;
  blockedAfter: number;
  adoptionBefore: number; // 0..1 — recommendation adoption
  adoptionAfter: number; // 0..1

  // Derived coaching signal.
  focus: CoachFocus;
  needScore: number; // higher = should be coached sooner
  recoveryFactor: number; // 0..1 deterministic improvement strength
  topAccountName: string;
  strengths: string[];
  risks: string[];
}

// Partition accounts across the roster with a stable, even round-robin over
// the id-sorted list. Deterministic and dataset-size independent.
function partition(accounts: Account[]): Map<string, Account[]> {
  const sorted = [...accounts].sort((a, b) => (a.account_id < b.account_id ? -1 : 1));
  const rosterSize = sorted.length >= 24 ? ROSTER.length : Math.max(3, Math.min(ROSTER.length, Math.ceil(sorted.length / 4)));
  const buckets = new Map<string, Account[]>();
  for (let i = 0; i < rosterSize; i++) buckets.set(ROSTER[i].id, []);
  sorted.forEach((a, i) => {
    const entry = ROSTER[i % rosterSize];
    buckets.get(entry.id)!.push(a);
  });
  return buckets;
}

// "Blocked" proxy: an at-risk account whose seller has gone quiet or whose
// engagement has fallen — i.e. a mission that is stalling and needs help.
function isBlocked(a: Account): boolean {
  return (
    isAtRisk(a) &&
    (a.last_contact_days >= INACTIVE_DAYS ||
      a.engagement_score <= ENGAGE_LOW ||
      a.support_risk_score >= RISK_HIGH ||
      a.renewal_days <= RENEWAL_SOON)
  );
}

// Per-account adoption proxy (0..1): how reliably the seller is acting on the
// system's recommendations, inferred from engagement + recency of contact.
function adoptionProxy(a: Account): number {
  const engage = clamp01(a.engagement_score / 100);
  const recency = clamp01(1 - Math.min(a.last_contact_days, 60) / 60);
  const usage = clamp01(a.product_usage_score / 100);
  return clamp01(engage * 0.45 + recency * 0.35 + usage * 0.2);
}

function dominantFocus(accounts: Account[]): CoachFocus {
  const renewal = accounts.filter((a) => a.renewal_days <= RENEWAL_SOON).length;
  const engage = accounts.filter((a) => a.engagement_score <= ENGAGE_LOW).length;
  const support = accounts.filter((a) => a.support_risk_score >= RISK_HIGH).length;
  const adoption = accounts.filter((a) => a.product_usage_score < 40).length;
  const expansion = accounts.filter((a) => a.growth_potential_score >= OPP_HIGH).length;
  const ranked: Array<[CoachFocus, number]> = [
    ["renewal_recovery", renewal],
    ["engagement_recovery", engage],
    ["support_recovery", support],
    ["adoption_recovery", adoption],
    ["expansion_execution", expansion],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : "engagement_recovery";
}

function sellerStrengths(accounts: Account[]): string[] {
  const out: string[] = [];
  const expanding = accounts.filter((a) => spendChangePct(a) >= 0.05).length;
  const adopting = accounts.filter((a) => a.product_usage_score >= 70).length;
  const engaged = accounts.filter((a) => a.engagement_score >= 60).length;
  if (expanding) out.push(`${expanding} account${expanding === 1 ? "" : "s"} expanding investment`);
  if (adopting) out.push(`${adopting} with strong product adoption`);
  if (engaged) out.push(`${engaged} actively engaged`);
  return out.slice(0, 3);
}

function sellerRisks(accounts: Account[]): string[] {
  const out: string[] = [];
  const renew = accounts.filter((a) => a.renewal_days >= 0 && a.renewal_days <= RENEWAL_SOON).length;
  const quiet = accounts.filter((a) => a.last_contact_days >= INACTIVE_DAYS).length;
  const support = accounts.filter((a) => a.support_risk_score >= RISK_HIGH).length;
  if (renew) out.push(`${renew} renewal${renew === 1 ? "" : "s"} closing soon`);
  if (quiet) out.push(`${quiet} with no recent contact`);
  if (support) out.push(`${support} with rising support risk`);
  return out.slice(0, 3);
}

export function deriveSellers(accounts: Account[]): CoachSeller[] {
  if (!accounts || accounts.length === 0) return [];
  const buckets = partition(accounts);
  const sellers: CoachSeller[] = [];

  buckets.forEach((book, sellerId) => {
    if (book.length === 0) return;
    const entry = ROSTER.find((r) => r.id === sellerId)!;

    const portfolioAcv = book.reduce((s, a) => s + annualValue(a), 0);
    const atRisk = book.filter(isAtRisk);
    const revenueExposureBefore = atRisk.reduce((s, a) => s + annualValue(a), 0);
    const blockedBefore = book.filter(isBlocked).length;
    const adoptionBefore = clamp01(mean(book.map(adoptionProxy)));

    // Recovery strength is deterministic per seller, biased by how much room
    // there is to improve (low adoption + high exposure => stronger uplift).
    const room = clamp01((1 - adoptionBefore) * 0.6 + (revenueExposureBefore > 0 ? 0.4 : 0));
    const recoveryFactor = clamp01(0.32 + seed01(sellerId) * 0.22 + room * 0.18);

    const adoptionAfter = clamp01(adoptionBefore + (1 - adoptionBefore) * recoveryFactor);
    const blockedAfter = Math.max(0, Math.round(blockedBefore * (1 - recoveryFactor)));
    const revenueExposureAfter = Math.round(revenueExposureBefore * (1 - recoveryFactor * 0.85));

    // Need = exposure (normalised to crores) + adoption gap + blocked load.
    const needScore =
      revenueExposureBefore / 1e7 + (1 - adoptionBefore) * 4 + blockedBefore * 0.6;

    const topAccount = [...book].sort((a, b) => {
      const ra = isAtRisk(a) ? annualValue(a) : 0;
      const rb = isAtRisk(b) ? annualValue(b) : 0;
      return rb - ra;
    })[0];

    sellers.push({
      id: sellerId,
      name: `${entry.firstName} ${entry.lastName}`,
      firstName: entry.firstName,
      region: entry.region,
      accountIds: book.map((a) => a.account_id),
      accountCount: book.length,
      portfolioAcv,
      revenueExposureBefore,
      revenueExposureAfter,
      blockedBefore,
      blockedAfter,
      adoptionBefore,
      adoptionAfter,
      focus: dominantFocus(book),
      needScore,
      recoveryFactor,
      topAccountName: topAccount?.account_name ?? book[0].account_name,
      strengths: sellerStrengths(book),
      risks: sellerRisks(book),
    });
  });

  return sellers;
}

/** Sellers ranked by who needs coaching most (highest need first). */
export function rankCandidates(sellers: CoachSeller[]): CoachSeller[] {
  return [...sellers].sort((a, b) => b.needScore - a.needScore);
}

export function sellerById(sellers: CoachSeller[], id: string | null): CoachSeller | null {
  if (!id) return null;
  return sellers.find((s) => s.id === id) ?? null;
}

// -- Effectiveness ----------------------------------------------------------
export interface Effectiveness {
  adoptionBefore: number;
  adoptionAfter: number;
  adoptionDeltaPts: number;
  blockedBefore: number;
  blockedAfter: number;
  exposureBefore: number;
  exposureAfter: number;
  exposureReduced: number;
  assessment: string;
}

export function effectiveness(s: CoachSeller): Effectiveness {
  const adoptionDeltaPts = Math.round((s.adoptionAfter - s.adoptionBefore) * 100);
  const exposureReduced = Math.max(0, s.revenueExposureBefore - s.revenueExposureAfter);
  const blockedCleared = s.blockedBefore - s.blockedAfter;
  const assessment =
    adoptionDeltaPts >= 15
      ? `Recovery coaching meaningfully improved execution. Adoption rose ${adoptionDeltaPts} points and ${blockedCleared} stalled mission${blockedCleared === 1 ? "" : "s"} cleared.`
      : adoptionDeltaPts >= 6
        ? `Coaching is working. ${s.firstName} is adopting recommendations more consistently and exposure is trending down.`
        : `Early signal. ${s.firstName} has started to respond — keep the follow-up loop tight before declaring recovery.`;
  return {
    adoptionBefore: s.adoptionBefore,
    adoptionAfter: s.adoptionAfter,
    adoptionDeltaPts,
    blockedBefore: s.blockedBefore,
    blockedAfter: s.blockedAfter,
    exposureBefore: s.revenueExposureBefore,
    exposureAfter: s.revenueExposureAfter,
    exposureReduced,
    assessment,
  };
}

// -- Executive narrative (advisor voice, not dashboard stats) ---------------
export function coachNarrative(s: CoachSeller): string[] {
  const eff = effectiveness(s);
  const blockedCleared = eff.blockedBefore - eff.blockedAfter;
  const lines: string[] = [];

  lines.push(
    eff.adoptionDeltaPts >= 12
      ? `${s.firstName} has started recovering.`
      : eff.adoptionDeltaPts >= 6
        ? `${s.firstName} is turning a corner.`
        : `${s.firstName} needs a steady hand this week.`,
  );

  lines.push(
    `Recommendation adoption ${eff.adoptionDeltaPts >= 6 ? "increased meaningfully" : "is beginning to move"} after intervention — now around ${Math.round(s.adoptionAfter * 100)}% of recommended actions.`,
  );

  if (eff.blockedAfter <= 1) {
    lines.push(`Only ${eff.blockedAfter === 0 ? "no" : "one"} stalled mission remains across the book.`);
  } else {
    lines.push(
      `${blockedCleared > 0 ? `${blockedCleared} stalled mission${blockedCleared === 1 ? "" : "s"} cleared, but ` : ""}${eff.blockedAfter} still need a push — start with ${s.topAccountName}.`,
    );
  }

  return lines;
}

/** One-line advisor framing for the queue / hero. */
export function coachOneLiner(s: CoachSeller): string {
  if (s.needScore >= 6) {
    return `${s.firstName} is carrying the most exposure — coach first.`;
  }
  if (s.adoptionAfter - s.adoptionBefore >= 0.12) {
    return `${s.firstName} is responding well to coaching.`;
  }
  return `${s.firstName} is steady — keep the follow-up light.`;
}

// -- AI Sales Director briefing (advisor voice, leads the experience) -------
function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Time-aware greeting. Hour is 0..23 (caller passes a client clock). */
export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Whether a seller's recovery signal is strong enough to call "improving". */
function isImproving(s: CoachSeller): boolean {
  return s.adoptionAfter - s.adoptionBefore >= 0.12;
}

/** A single advisory sentence describing why a seller needs attention now. */
export function situationLine(s: CoachSeller): string {
  const renewals = s.risks.find((r) => r.includes("renewal"));
  const quiet = s.risks.find((r) => r.includes("no recent contact"));
  const support = s.risks.find((r) => r.includes("support"));
  switch (s.focus) {
    case "renewal_recovery":
      return renewals
        ? `${s.firstName} has ${renewals} that need a decision.`
        : `${s.firstName}'s renewals are slipping without a clear plan.`;
    case "support_recovery":
      return support
        ? `${s.firstName} has ${support} on at-risk accounts.`
        : `${s.firstName}'s support risk is climbing on key accounts.`;
    case "engagement_recovery":
      return quiet
        ? `${s.firstName}'s book has gone quiet — ${quiet}.`
        : `${s.firstName}'s engagement has cooled over the last week.`;
    case "adoption_recovery":
      return `${s.firstName}'s accounts are under-adopting the product.`;
    case "expansion_execution":
    default:
      return `${s.firstName} is leaving strong expansion signals unworked.`;
  }
}

export interface ManagerBriefing {
  attentionCount: number;
  situations: string[]; // up to three advisory sentences
  topId: string | null;
  topName: string;
  topExposure: number;
  exposureText: string;
  headline: string; // "<n> sellers need your attention today."
  recommendation: string; // "If you only have fifteen minutes today…"
}

/**
 * The opening brief the AI delivers to the manager. Deterministic: derived
 * entirely from the seller view model. Reads like a Sales Director's verbal
 * read-out, not a dashboard.
 */
export function managerBriefing(
  sellers: CoachSeller[],
  inr: (n: number) => string,
): ManagerBriefing {
  const ranked = rankCandidates(sellers);
  const top = ranked[0] ?? null;
  // "Need attention" = the upper half of the team by need (median split).
  const med = median(ranked.map((s) => s.needScore));
  const attention = ranked.filter((s) => s.needScore >= med);
  const attentionCount = Math.max(1, attention.length);
  const situations = attention.slice(0, 3).map(situationLine);

  const headline =
    attentionCount === 1
      ? `One seller needs your attention today.`
      : `${numberWord(attentionCount)} sellers need your attention today.`;

  const recommendation = top
    ? `If you only have fifteen minutes today, I'd start with ${top.firstName}.`
    : `Your team is steady — keep the follow-up cadence light today.`;

  return {
    attentionCount,
    situations,
    topId: top?.id ?? null,
    topName: top?.firstName ?? "",
    topExposure: top?.revenueExposureBefore ?? 0,
    exposureText: top ? inr(top.revenueExposureBefore) : inr(0),
    headline,
    recommendation,
  };
}

function numberWord(n: number): string {
  const words = ["zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  return words[n] ?? String(n);
}

// -- Story-led intervention (one recommendation, one action) ----------------
export interface Intervention {
  story: string; // why this matters, in plain advisory language
  consequence: string; // what happens if nothing changes
  intervention: string; // the recommended move + duration
  expectedImpact: string; // the projected payoff
  durationMin: number;
}

const FOCUS_STORY: Record<CoachFocus, string> = {
  renewal_recovery: "renewal execution has slipped with key dates approaching",
  engagement_recovery: "engagement across the book has cooled over the last week",
  support_recovery: "support risk is climbing on several strategic accounts",
  adoption_recovery: "product adoption has stalled on priority accounts",
  expansion_execution: "strong expansion signals are going unworked",
};

export function coachIntervention(s: CoachSeller, inr: (n: number) => string): Intervention {
  const eff = effectiveness(s);
  const reduced = eff.exposureReduced;
  const renewals = s.risks.find((r) => r.includes("renewal"));

  const story = isImproving(s)
    ? `${s.firstName} is responding to coaching, but ${FOCUS_STORY[s.focus]}.`
    : `${s.firstName}'s ${FOCUS_STORY[s.focus]}.`;

  const consequence = renewals
    ? `If nothing changes, ${renewals} may slip.`
    : reduced > 0
      ? `If nothing changes, roughly ${inr(s.revenueExposureBefore)} stays exposed.`
      : `If nothing changes, execution keeps drifting on ${s.topAccountName}.`;

  const intervention = `A 15-minute ${FOCUS_SHORT[s.focus].toLowerCase()} session, starting with ${s.topAccountName}.`;

  const expectedImpact =
    reduced > 0
      ? `Expected to reduce revenue exposure by about ${inr(reduced)}.`
      : `Expected to lift recommendation adoption by about ${eff.adoptionDeltaPts} points.`;

  return { story, consequence, intervention, expectedImpact, durationMin: 15 };
}

/** Deterministic talking points the manager can use in a 1:1. */
export function talkingPoints(s: CoachSeller): string[] {
  const eff = effectiveness(s);
  const out: string[] = [];
  out.push(`Open with the win: ${s.strengths[0] ?? "the book is stable where it counts"}.`);
  out.push(`Name the gap plainly — ${FOCUS_SHORT[s.focus].toLowerCase()} on ${s.topAccountName}.`);
  out.push(
    eff.blockedBefore > 0
      ? `Agree one concrete next step to clear ${eff.blockedBefore} stalled mission${eff.blockedBefore === 1 ? "" : "s"}.`
      : `Agree a light cadence to keep momentum.`,
  );
  out.push(`Close on the goal: lift adoption toward ${Math.round(s.adoptionAfter * 100)}% this week.`);
  return out;
}

// -- Manager timeline -------------------------------------------------------
export type TimelineTone = "neutral" | "ok" | "risk" | "gov";

export interface TimelineEvent {
  day: string;
  title: string;
  detail: string;
  tone: TimelineTone;
}

// A compact weekly arc derived from the seller's own book + coaching outcome.
export function managerTimeline(s: CoachSeller, inr: (n: number) => string): TimelineEvent[] {
  const eff = effectiveness(s);
  return [
    {
      day: "Monday",
      title: `Assigned ${FOCUS_SHORT[s.focus].toLowerCase()} coaching`,
      detail: `${s.firstName} · ${s.accountCount} accounts · ${inr(s.revenueExposureBefore)} at risk`,
      tone: "gov",
    },
    {
      day: "Tuesday",
      title: "Seller completed guided mission",
      detail: `${s.topAccountName} reviewed, outreach prepared`,
      tone: "neutral",
    },
    {
      day: "Wednesday",
      title: "Approval received",
      detail: "Action cleared the governance lifecycle",
      tone: "gov",
    },
    {
      day: "Thursday",
      title: "Revenue risk reduced",
      detail: `${inr(eff.exposureBefore)} → ${inr(eff.exposureAfter)} exposure`,
      tone: "ok",
    },
    {
      day: "Friday",
      title: "Follow-up scheduled",
      detail:
        eff.blockedAfter > 0
          ? `${eff.blockedAfter} mission${eff.blockedAfter === 1 ? "" : "s"} still need a push`
          : "Book clear — confirm and close",
      tone: eff.blockedAfter > 0 ? "risk" : "ok",
    },
  ];
}

// -- Deterministic conversation --------------------------------------------
export interface CoachAnswer {
  headline: string;
  why: string;
  businessImpact: string;
  recommendedAction: string;
  confidence: "High" | "Moderate" | "Emerging";
  suggestedFollowUp: string;
  focusSellerId: string | null;
}

export const SUGGESTED_QUESTIONS: string[] = [
  "Who needs my attention?",
  "Who is improving?",
  "Who can wait?",
  "Summarize this week",
  "What approvals matter most?",
  "Prepare tomorrow's coaching",
];

function confidenceFor(sampleSize: number, strong: boolean): CoachAnswer["confidence"] {
  if (sampleSize >= 12 && strong) return "High";
  if (sampleSize >= 6) return "Moderate";
  return "Emerging";
}

export function answerQuestion(
  question: string,
  sellers: CoachSeller[],
  inr: (n: number) => string,
): CoachAnswer {
  const q = question.toLowerCase();
  const ranked = rankCandidates(sellers);
  const top = ranked[0] ?? null;
  const totalAccounts = sellers.reduce((s, x) => s + x.accountCount, 0);
  const bestImprover = [...sellers].sort(
    (a, b) => b.adoptionAfter - b.adoptionBefore - (a.adoptionAfter - a.adoptionBefore),
  )[0];
  const calmest = [...ranked].reverse()[0] ?? null;

  // Intent: talking points — "what should I say to X"
  if (/(what.*say|say to|talk(ing)? point|prep(are)? for the 1|how do i open)/.test(q)) {
    const named = sellers.find((s) => q.includes(s.firstName.toLowerCase())) ?? top;
    if (named) {
      const points = talkingPoints(named);
      return {
        headline: `Here's how I'd open with ${named.firstName}.`,
        why: `${named.firstName} is carrying ${FOCUS_SHORT[named.focus].toLowerCase()} pressure on ${named.topAccountName}, so lead with partnership, not pressure.`,
        businessImpact: `${inr(named.revenueExposureBefore)} of annualised revenue is riding on this book — the conversation sets the recovery in motion.`,
        recommendedAction: points.join(" "),
        confidence: confidenceFor(named.accountCount, true),
        suggestedFollowUp: `Capture the agreed next step and re-check ${named.firstName} after acknowledgement.`,
        focusSellerId: named.id,
      };
    }
  }

  // Intent: who is improving
  if (/(improv|getting better|turning|recover(ing)?|momentum)/.test(q) && !/(work|effective|result|outcome)/.test(q)) {
    if (bestImprover) {
      const eff = effectiveness(bestImprover);
      return {
        headline: `${bestImprover.firstName} is improving the fastest.`,
        why: `Recommendation adoption has moved from ${Math.round(eff.adoptionBefore * 100)}% to ${Math.round(eff.adoptionAfter * 100)}% and ${eff.blockedBefore - eff.blockedAfter} stalled mission${eff.blockedBefore - eff.blockedAfter === 1 ? "" : "s"} cleared.`,
        businessImpact: `Roughly ${inr(eff.exposureReduced)} of exposure has already been pulled back.`,
        recommendedAction: `Reinforce what's working — keep ${bestImprover.firstName}'s cadence and reuse this approach with the rest of the team.`,
        confidence: confidenceFor(bestImprover.accountCount, eff.adoptionDeltaPts >= 12),
        suggestedFollowUp: `Lighten ${bestImprover.firstName}'s follow-up and redirect that time to ${top?.firstName ?? "the next seller"}.`,
        focusSellerId: bestImprover.id,
      };
    }
  }

  // Intent: who can wait
  if (/(wait|can wait|less urgent|lowest|deprioriti|skip)/.test(q)) {
    if (calmest) {
      return {
        headline: `${calmest.firstName} can wait.`,
        why: `${calmest.firstName} has the lowest need signal on the team — adoption around ${Math.round(calmest.adoptionBefore * 100)}% and only ${calmest.blockedBefore} stalled mission${calmest.blockedBefore === 1 ? "" : "s"}.`,
        businessImpact: `Exposure here is ${inr(calmest.revenueExposureBefore)} — protecting it doesn't need your time this week.`,
        recommendedAction: `Hold a light cadence with ${calmest.firstName} and invest your hour in ${top?.firstName ?? "the top seller"} instead.`,
        confidence: confidenceFor(calmest.accountCount, true),
        suggestedFollowUp: `Re-check ${calmest.firstName} next week to confirm the book stays stable.`,
        focusSellerId: calmest.id,
      };
    }
  }

  // Intent: prepare tomorrow
  if (/(prepare|tomorrow|next day|plan for|set up)/.test(q)) {
    if (top) {
      const second = ranked[1];
      return {
        headline: `Here's your coaching plan for tomorrow.`,
        why: `${top.firstName} and ${second?.firstName ?? "the next seller"} carry the most exposure and the weakest execution signals right now.`,
        businessImpact: `Together they hold ${inr(top.revenueExposureBefore + (second?.revenueExposureBefore ?? 0))} of annualised revenue at risk.`,
        recommendedAction: `Block two 15-minute sessions: ${FOCUS_SHORT[top.focus].toLowerCase()} with ${top.firstName} first, then ${FOCUS_SHORT[second?.focus ?? top.focus].toLowerCase()} with ${second?.firstName ?? "the next seller"}.`,
        confidence: confidenceFor(totalAccounts, true),
        suggestedFollowUp: `Pre-load ${top.topAccountName} so the session starts on the real account, not the dashboard.`,
        focusSellerId: top.id,
      };
    }
  }

  // Intent: summarize the week
  if (/(summar|this week|recap|overview|how is the team|state of)/.test(q)) {
    const totalExposure = sellers.reduce((s, x) => s + x.revenueExposureBefore, 0);
    const recovering = sellers.filter(isImproving).length;
    const totalBlocked = sellers.reduce((s, x) => s + x.blockedBefore, 0);
    return {
      headline: `Your team is holding, with a few books that need a push.`,
      why: `${recovering} of ${sellers.length} sellers are responding to coaching; ${totalBlocked} mission${totalBlocked === 1 ? "" : "s"} are still stalled across the org.`,
      businessImpact: `${inr(totalExposure)} of annualised revenue is exposed — concentrated in ${top?.firstName ?? "a few"}'s book.`,
      recommendedAction: `Spend your time on ${top?.firstName ?? "the top seller"} and ${ranked[1]?.firstName ?? "the next"}, and reuse the approach that's working with ${bestImprover?.firstName ?? "your best improver"}.`,
      confidence: confidenceFor(totalAccounts, true),
      suggestedFollowUp: `Re-run this read on Friday to confirm exposure is trending down.`,
      focusSellerId: top?.id ?? null,
    };
  }

  // Intent: approvals that matter
  if (/(approval|sign.?off|govern|decision|pending)/.test(q)) {
    if (top) {
      return {
        headline: `${top.firstName}'s approvals carry the most weight.`,
        why: `${top.firstName}'s stalled missions sit on the highest-value at-risk accounts, so clearing them through governance unblocks the most revenue.`,
        businessImpact: `Approving ${top.firstName}'s next moves protects up to ${inr(top.revenueExposureBefore - top.revenueExposureAfter)} of exposure.`,
        recommendedAction: `Prioritise ${top.topAccountName} for sign-off, then move down ${top.firstName}'s queue.`,
        confidence: confidenceFor(top.accountCount, true),
        suggestedFollowUp: `Confirm the cleared actions executed before the renewal window closes.`,
        focusSellerId: top.id,
      };
    }
  }

  // Intent: effectiveness / did it work
  if (/(work|effective|improv|better|recover|result|outcome)/.test(q)) {
    const best = [...sellers].sort(
      (a, b) => b.adoptionAfter - b.adoptionBefore - (a.adoptionAfter - a.adoptionBefore),
    )[0];
    if (best) {
      const eff = effectiveness(best);
      return {
        headline: `${best.firstName}'s coaching is ${eff.adoptionDeltaPts >= 12 ? "clearly working" : "starting to work"}.`,
        why: `Recommendation adoption moved from ${Math.round(eff.adoptionBefore * 100)}% to ${Math.round(eff.adoptionAfter * 100)}% and ${eff.blockedBefore - eff.blockedAfter} stalled mission${eff.blockedBefore - eff.blockedAfter === 1 ? "" : "s"} cleared after the intervention.`,
        businessImpact: `Revenue exposure fell ${inr(eff.exposureReduced)} — from ${inr(eff.exposureBefore)} to ${inr(eff.exposureAfter)}.`,
        recommendedAction: `Keep ${best.firstName} on the same cadence and graduate the coaching to expansion once the last ${eff.blockedAfter} mission${eff.blockedAfter === 1 ? "" : "s"} clear.`,
        confidence: confidenceFor(best.accountCount, eff.adoptionDeltaPts >= 12),
        suggestedFollowUp: `Schedule a Friday review to confirm ${best.topAccountName} is fully recovered.`,
        focusSellerId: best.id,
      };
    }
  }

  // Intent: follow up today
  if (/(follow.?up|today|review|check.?in|cadence)/.test(q)) {
    if (top) {
      return {
        headline: `Start your follow-ups with ${top.firstName}.`,
        why: `${top.firstName} carries the highest blocked-mission load (${top.blockedBefore}) and ${inr(top.revenueExposureBefore)} of exposure — the most leverage for a single conversation.`,
        businessImpact: `Clearing ${top.firstName}'s stalled missions protects up to ${inr(top.revenueExposureBefore - top.revenueExposureAfter)} of annualised revenue.`,
        recommendedAction: `Open a ${FOCUS_SHORT[top.focus].toLowerCase()} check-in and walk ${top.topAccountName} together.`,
        confidence: confidenceFor(top.accountCount, true),
        suggestedFollowUp: `After ${top.firstName}, review ${ranked[1]?.firstName ?? "the next seller"} who is waiting on acknowledgement.`,
        focusSellerId: top.id,
      };
    }
  }

  // Intent: revenue / risk
  if (/(revenue|risk|exposure|money|cr|crore|churn)/.test(q)) {
    const totalExposure = sellers.reduce((s, x) => s + x.revenueExposureBefore, 0);
    if (top) {
      return {
        headline: `${inr(totalExposure)} of revenue is exposed across the team.`,
        why: `${top.firstName}'s book holds the largest single concentration at ${inr(top.revenueExposureBefore)}, driven by ${FOCUS_SHORT[top.focus].toLowerCase()} gaps.`,
        businessImpact: `Coaching the top three sellers addresses the majority of exposure without spreading your attention thin.`,
        recommendedAction: `Assign ${FOCUS_SHORT[top.focus].toLowerCase()} coaching to ${top.firstName} first, then ${ranked[1]?.firstName ?? ""}.`,
        confidence: confidenceFor(totalAccounts, true),
        suggestedFollowUp: `Re-check exposure after this week's missions execute.`,
        focusSellerId: top.id,
      };
    }
  }

  // Default / "who needs help"
  if (top) {
    return {
      headline: `${top.firstName} needs your help most right now.`,
      why: `Across ${top.accountCount} accounts, ${top.firstName} has ${top.blockedBefore} stalled mission${top.blockedBefore === 1 ? "" : "s"} and adoption around ${Math.round(top.adoptionBefore * 100)}% — the weakest execution signal on the team.`,
      businessImpact: `${inr(top.revenueExposureBefore)} of annualised revenue is exposed in ${top.firstName}'s book.`,
      recommendedAction: `Assign ${FOCUS_SHORT[top.focus].toLowerCase()} coaching and start with ${top.topAccountName}.`,
      confidence: confidenceFor(top.accountCount, true),
      suggestedFollowUp: `Re-review ${top.firstName} after acknowledgement to confirm the missions are moving.`,
      focusSellerId: top.id,
    };
  }

  return {
    headline: "No seller books are loaded yet.",
    why: "Run the portfolio analysis to populate accounts and coaching signals.",
    businessImpact: "Coaching insight activates once account data is available.",
    recommendedAction: "Generate recommendations, then return to the coaching view.",
    confidence: "Emerging",
    suggestedFollowUp: "Refresh the Command Center to load the synthetic dataset.",
    focusSellerId: null,
  };
}
