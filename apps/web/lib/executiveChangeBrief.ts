// Phase 14D — Executive Change Brief.
//
// Pure selector. Aggregates portfolio activity from the existing drift
// engine and recommendation delta log within a configurable time window
// (default: last 24h, or "since session start" — whichever is shorter)
// into an executive-grade morning briefing.
//
// Strictly additive. Never mutates source data, never calls the backend.

import { loadDriftSnapshot, type DriftEvent, type DriftDimension } from "@/lib/driftEngine";
import { loadDeltas, type RecommendationDelta } from "@/lib/recommendationDelta";
import type { Account } from "@/lib/types";

export type ImpactLevel = "low" | "medium" | "high";

export interface QueueEntry {
  account_id: string;
  account_name: string;
  current_rank: number | null;
  current_action: string | null;
  timestamp: string;
  reason: string;
}

export interface QueueExit {
  account_id: string;
  account_name: string;
  previous_rank: number | null;
  previous_action: string | null;
  timestamp: string;
}

export interface ActionChange {
  account_id: string;
  account_name: string;
  previous_action: string | null;
  current_action: string | null;
  reason: string;
  timestamp: string;
}

export interface RiskMovement {
  account_id: string;
  account_name: string;
  dimension: DriftDimension;
  before: number;
  after: number;
  delta: number;
  reason: string;
  timestamp: string;
  magnitude: DriftEvent["magnitude"];
  agent: string;
}

export interface ExecutiveChangeBrief {
  windowLabel: string;            // "Since session start (4h)" / "Since yesterday"
  windowStartIso: string;
  windowEndIso: string;
  driftEventCount: number;
  deltaEventCount: number;
  hasActivity: boolean;
  accountsEnteringQueue: QueueEntry[];
  accountsLeavingQueue: QueueExit[];
  actionChanges: ActionChange[];
  riskMovements: RiskMovement[];        // top N by magnitude, sorted critical → minor
  opportunityMovements: RiskMovement[]; // same shape, opportunity-direction
  expectedImpactInr: number;            // best-effort: at-risk spend exposed by risk increases
  expectedImpactLevel: ImpactLevel;
  headline: string;                      // single-sentence exec summary
}

// ---------- helpers ----------

const RANK_OF_MAGNITUDE: Record<DriftEvent["magnitude"], number> = { minor: 0, moderate: 1, major: 2 };

function within(iso: string, startMs: number, endMs: number): boolean {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= startMs && t <= endMs;
}

function pickWindow(): { startMs: number; endMs: number; label: string } {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const sessionStartRaw = typeof window !== "undefined" ? window.localStorage.getItem("s2a_drift_session_start_v1") : null;
  const sessionStart = sessionStartRaw ? Number(sessionStartRaw) : NaN;
  const useSession = Number.isFinite(sessionStart) && now - sessionStart < dayMs;
  const startMs = useSession ? sessionStart : now - dayMs;
  const hours = Math.max(1, Math.round((now - startMs) / (60 * 60 * 1000)));
  const label = useSession ? `Since session start (${hours}h)` : "Since yesterday";
  return { startMs, endMs: now, label };
}

function impactLevel(amountInr: number): ImpactLevel {
  if (amountInr >= 50_00_000) return "high";   // ≥ ₹50L
  if (amountInr >= 10_00_000) return "medium"; // ≥ ₹10L
  return "low";
}

// ---------- main selector ----------

export function buildExecutiveChangeBrief(accounts: Account[], topN = 5): ExecutiveChangeBrief {
  const { startMs, endMs, label } = pickWindow();
  const accountsById: Record<string, Account> = {};
  for (const a of accounts) accountsById[a.account_id] = a;

  const driftAll = loadDriftSnapshot().events;
  const driftInWindow = driftAll.filter((e) => within(e.timestamp, startMs, endMs));

  const deltasAll = loadDeltas();
  const deltasInWindow = deltasAll.filter((d) => within(d.timestamp, startMs, endMs));

  // queue movements
  const accountsEnteringQueue: QueueEntry[] = deltasInWindow
    .filter((d) => d.kind === "first_seen")
    .map((d) => ({
      account_id: d.account_id,
      account_name: d.account_name,
      current_rank: d.current_rank,
      current_action: d.current_action,
      timestamp: d.timestamp,
      reason: d.reason,
    }))
    .sort((a, b) => (a.current_rank ?? 99) - (b.current_rank ?? 99));

  const accountsLeavingQueue: QueueExit[] = deltasInWindow
    .filter((d) => d.kind === "left_queue")
    .map((d) => ({
      account_id: d.account_id,
      account_name: d.account_name,
      previous_rank: d.previous_rank,
      previous_action: d.previous_action,
      timestamp: d.timestamp,
    }))
    .sort((a, b) => (a.previous_rank ?? 99) - (b.previous_rank ?? 99));

  const actionChanges: ActionChange[] = deltasInWindow
    .filter((d) => d.kind === "action_changed")
    .map((d) => ({
      account_id: d.account_id,
      account_name: d.account_name,
      previous_action: d.previous_action,
      current_action: d.current_action,
      reason: d.reason,
      timestamp: d.timestamp,
    }))
    .sort((a, b) => (b.timestamp < a.timestamp ? -1 : 1));

  // risk / opportunity movements — only moderate+ to keep brief executive-grade
  const meaningful = driftInWindow.filter((e) => e.magnitude !== "minor");
  const sortByMagnitudeThenTime = (a: DriftEvent, b: DriftEvent) => {
    const m = RANK_OF_MAGNITUDE[b.magnitude] - RANK_OF_MAGNITUDE[a.magnitude];
    if (m !== 0) return m;
    return b.timestamp < a.timestamp ? -1 : 1;
  };

  const riskMovements: RiskMovement[] = meaningful
    .filter((e) => e.impact === "risk")
    .sort(sortByMagnitudeThenTime)
    .slice(0, topN)
    .map((e) => ({
      account_id: e.account_id,
      account_name: e.account_name,
      dimension: e.dimension,
      before: e.before,
      after: e.after,
      delta: e.delta,
      reason: e.reason,
      timestamp: e.timestamp,
      magnitude: e.magnitude,
      agent: e.agent,
    }));

  const opportunityMovements: RiskMovement[] = meaningful
    .filter((e) => e.impact === "opportunity")
    .sort(sortByMagnitudeThenTime)
    .slice(0, topN)
    .map((e) => ({
      account_id: e.account_id,
      account_name: e.account_name,
      dimension: e.dimension,
      before: e.before,
      after: e.after,
      delta: e.delta,
      reason: e.reason,
      timestamp: e.timestamp,
      magnitude: e.magnitude,
      agent: e.agent,
    }));

  // expected business impact — sum of current_month_spend for accounts that
  // had a moderate-or-major risk-impact drift in the window (de-duped). This
  // is annualised x12 to express "revenue exposed if churn materialises".
  const atRiskAccountIds = new Set<string>();
  for (const e of meaningful) {
    if (e.impact === "risk") atRiskAccountIds.add(e.account_id);
  }
  let expectedImpactInr = 0;
  for (const id of atRiskAccountIds) {
    const a = accountsById[id];
    if (a && Number.isFinite(a.current_month_spend)) {
      expectedImpactInr += a.current_month_spend * 12;
    }
  }
  const expectedImpactLevelComputed = impactLevel(expectedImpactInr);

  // headline
  const driftEventCount = driftInWindow.length;
  const deltaEventCount = deltasInWindow.length;
  const hasActivity = driftEventCount > 0 || deltaEventCount > 0;

  let headline = "Portfolio is steady — no material changes since the last review.";
  if (hasActivity) {
    const bits: string[] = [];
    if (riskMovements.length > 0) bits.push(`${riskMovements.length} risk increase${riskMovements.length === 1 ? "" : "s"}`);
    if (opportunityMovements.length > 0) bits.push(`${opportunityMovements.length} opportunity move${opportunityMovements.length === 1 ? "" : "s"}`);
    if (accountsEnteringQueue.length > 0) bits.push(`${accountsEnteringQueue.length} new in queue`);
    if (accountsLeavingQueue.length > 0) bits.push(`${accountsLeavingQueue.length} left queue`);
    if (actionChanges.length > 0) bits.push(`${actionChanges.length} action revision${actionChanges.length === 1 ? "" : "s"}`);
    headline = bits.length > 0 ? `${bits.join(" · ")}.` : `${driftEventCount} signal change${driftEventCount === 1 ? "" : "s"} detected.`;
  }

  return {
    windowLabel: label,
    windowStartIso: new Date(startMs).toISOString(),
    windowEndIso: new Date(endMs).toISOString(),
    driftEventCount,
    deltaEventCount,
    hasActivity,
    accountsEnteringQueue,
    accountsLeavingQueue,
    actionChanges,
    riskMovements,
    opportunityMovements,
    expectedImpactInr,
    expectedImpactLevel: expectedImpactLevelComputed,
    headline,
  };
}

// ---------- portfolio timeline ----------

export type PortfolioTimelineKind =
  | "drift"
  | "queue_entered"
  | "queue_left"
  | "action_changed"
  | "priority_jump";

export interface PortfolioTimelineEntry {
  id: string;
  timestamp: string;
  kind: PortfolioTimelineKind;
  kindLabel: string;
  account_id: string;
  account_name: string;
  headline: string;
  detail: string;
  severity: "low" | "medium" | "high";
}

function severityForPortfolio(e: DriftEvent | RecommendationDelta, kind: PortfolioTimelineKind): "low" | "medium" | "high" {
  if (kind === "drift") {
    const d = e as DriftEvent;
    if (d.magnitude === "major") return "high";
    if (d.magnitude === "moderate") return "medium";
    return "low";
  }
  if (kind === "queue_entered") {
    const d = e as RecommendationDelta;
    return (d.current_rank ?? 99) <= 3 ? "high" : "medium";
  }
  if (kind === "queue_left") {
    const d = e as RecommendationDelta;
    return (d.previous_rank ?? 99) <= 3 ? "high" : "medium";
  }
  if (kind === "action_changed") return "high";
  if (kind === "priority_jump") return "high";
  return "low";
}

const PORTFOLIO_KIND_LABEL: Record<PortfolioTimelineKind, string> = {
  drift:           "Signal change",
  queue_entered:   "Entered queue",
  queue_left:      "Left queue",
  action_changed:  "Action revised",
  priority_jump:   "Priority jump",
};

export function buildPortfolioTimeline(maxEntries = 40): PortfolioTimelineEntry[] {
  const out: PortfolioTimelineEntry[] = [];

  const drift = loadDriftSnapshot().events;
  for (const e of drift) {
    if (e.magnitude === "minor") continue; // executive view: hide noise
    out.push({
      id: `drift-${e.id}`,
      timestamp: e.timestamp,
      kind: "drift",
      kindLabel: e.impact === "risk" ? "Risk signal" : e.impact === "opportunity" ? "Opportunity signal" : "Signal change",
      account_id: e.account_id,
      account_name: e.account_name,
      headline: `${e.signalLabel ?? e.dimension} ${e.direction === "up" ? "↑" : "↓"}`,
      detail: e.reason,
      severity: severityForPortfolio(e, "drift"),
    });
  }

  const deltas = loadDeltas();
  for (const d of deltas) {
    const map: Partial<Record<RecommendationDelta["kind"], PortfolioTimelineKind>> = {
      first_seen:     "queue_entered",
      left_queue:     "queue_left",
      action_changed: "action_changed",
      priority_jump:  "priority_jump",
    };
    const k = map[d.kind];
    if (!k) continue; // skip "refined" — too noisy for portfolio view
    const headline =
      k === "queue_entered"  ? `Entered queue at #${d.current_rank ?? "?"}` :
      k === "queue_left"     ? `Dropped off queue (was #${d.previous_rank ?? "?"})` :
      k === "action_changed" ? `${d.previous_action ?? "?"} → ${d.current_action ?? "?"}` :
                               `#${d.previous_rank ?? "?"} → #${d.current_rank ?? "?"}`;
    out.push({
      id: `delta-${d.id}`,
      timestamp: d.timestamp,
      kind: k,
      kindLabel: PORTFOLIO_KIND_LABEL[k],
      account_id: d.account_id,
      account_name: d.account_name,
      headline,
      detail: d.reason,
      severity: severityForPortfolio(d, k),
    });
  }

  out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  return out.slice(0, maxEntries);
}
