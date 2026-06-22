// Phase 14A — Live Signal Drift Engine
//
// PURE FRONTEND SIMULATION. Does not call the backend, does not mutate the
// authoritative recommendation/account payloads from the API. Generates
// believable telemetry-style drift events on a 30-60s cadence and persists
// them to localStorage so the "Live Portfolio Drift" panel feels alive
// across refreshes.
//
// Strictly additive: ranking / scoring / governance / agents are untouched.

import type { Account } from "./types";

const STORAGE_KEY_EVENTS = "s2a_drift_events_v1";
const STORAGE_KEY_OVERLAY = "s2a_drift_overlay_v1";
const STORAGE_KEY_STARTED = "s2a_drift_session_start_v1";
const EVENT_CAP = 200;

export type DriftDimension =
  | "support_risk"
  | "usage"
  | "engagement"
  | "opportunity"
  | "renewal"
  | "spend";

export type DriftDirection = "up" | "down";
export type DriftMagnitude = "minor" | "moderate" | "major";
export type DriftImpact = "risk" | "opportunity" | "neutral";

export interface DriftEvent {
  id: string;
  account_id: string;
  account_name: string;
  dimension: DriftDimension;
  direction: DriftDirection;
  delta: number;          // absolute change in points (0-100 scale) or days
  before: number;
  after: number;
  magnitude: DriftMagnitude;
  impact: DriftImpact;    // semantic impact (risk vs opportunity)
  reason: string;         // human-readable single-line reason
  timestamp: string;      // ISO
  agent: string;          // attributed reasoning agent (Phase 14A revision)
  signalLabel: string;    // human-readable signal label (Phase 14A revision)
}

// Per-account overlay capturing the latest drifted values. Not used by the
// ranker. Only used by the panel for "current vs original" visualization.
export interface DriftOverlay {
  [accountId: string]: {
    support_risk?: number;
    usage?: number;
    engagement?: number;
    opportunity?: number;
    renewal?: number; // days
    spend?: number;   // current month spend
  };
}

export interface DriftSnapshot {
  events: DriftEvent[];
  overlay: DriftOverlay;
  sessionStart: string;
  lastTick: string | null;
}

// ---------- storage helpers ----------

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function loadDriftSnapshot(): DriftSnapshot {
  const events = safeRead<DriftEvent[]>(STORAGE_KEY_EVENTS, []);
  const overlay = safeRead<DriftOverlay>(STORAGE_KEY_OVERLAY, {});
  let sessionStart = safeRead<string>(STORAGE_KEY_STARTED, "");
  if (!sessionStart) {
    sessionStart = new Date().toISOString();
    safeWrite(STORAGE_KEY_STARTED, sessionStart);
  }
  const lastTick = events.length > 0 ? events[0].timestamp : null;
  return { events, overlay, sessionStart, lastTick };
}

export function clearDrift() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY_EVENTS);
  window.localStorage.removeItem(STORAGE_KEY_OVERLAY);
  window.localStorage.removeItem(STORAGE_KEY_STARTED);
}

// ---------- believable mutation rules ----------

interface DimensionRule {
  dim: DriftDimension;
  baseField: keyof Account;
  // delta range per tick (points)
  minDelta: number;
  maxDelta: number;
  // clamp range
  min: number;
  max: number;
  // probability skew toward "up" (0..1; 0.5 = symmetric)
  upBias: number;
  // semantic mapping
  upIsRisk: boolean;       // true => increasing this dim raises risk
  upIsOpportunity: boolean; // true => increasing this dim raises opportunity
  // attribution (Phase 14A revision)
  agent: string;
  signalUp: string;
  signalDown: string;
  reasonsUp: string[];
  reasonsDown: string[];
}

const RULES: DimensionRule[] = [
  {
    dim: "support_risk",
    baseField: "support_risk_score",
    minDelta: 3, maxDelta: 12,
    min: 0, max: 100,
    upBias: 0.55,
    upIsRisk: true, upIsOpportunity: false,
    agent: "Account Health Agent",
    signalUp: "Support risk rising",
    signalDown: "Support risk easing",
    reasonsUp: [
      "New P1 ticket filed by champion",
      "Support backlog crossed SLA threshold",
      "Customer escalated via partner manager",
      "Two open Sev2 tickets aging past 72h",
    ],
    reasonsDown: [
      "Backlog cleared after rapid response",
      "Sev2 ticket resolved with workaround",
      "Customer confirmed mitigation",
    ],
  },
  {
    dim: "usage",
    baseField: "product_usage_score",
    minDelta: 2, maxDelta: 10,
    min: 0, max: 100,
    upBias: 0.4,
    upIsRisk: false, upIsOpportunity: true,
    agent: "Signal Ingestion Agent",
    signalUp: "Usage trending up",
    signalDown: "Usage decline detected",
    reasonsUp: [
      "Weekly active seats grew vs last week",
      "Feature adoption expanded to second team",
      "API call volume up 18% w/w",
    ],
    reasonsDown: [
      "Weekly active seats slipped vs last week",
      "Feature usage declined after admin change",
      "API call volume down 12% w/w",
    ],
  },
  {
    dim: "engagement",
    baseField: "engagement_score",
    minDelta: 2, maxDelta: 9,
    min: 0, max: 100,
    upBias: 0.45,
    upIsRisk: false, upIsOpportunity: false,
    agent: "Communication Agent",
    signalUp: "Engagement rising",
    signalDown: "Engagement slipping",
    reasonsUp: [
      "Champion attended product webinar",
      "Exec sponsor responded to outreach",
      "Re-engaged after dormant period",
    ],
    reasonsDown: [
      "No reply to last two outreach attempts",
      "Champion changed role at customer",
      "Engagement window slipping past 21d",
    ],
  },
  {
    dim: "opportunity",
    baseField: "growth_potential_score",
    minDelta: 2, maxDelta: 8,
    min: 0, max: 100,
    upBias: 0.55,
    upIsRisk: false, upIsOpportunity: true,
    agent: "Opportunity Agent",
    signalUp: "Expansion signal detected",
    signalDown: "Opportunity cooling",
    reasonsUp: [
      "Customer requested pricing for new SKU",
      "Procurement signaled FY budget unlock",
      "Pilot team expanded to adjacent BU",
    ],
    reasonsDown: [
      "Expansion pilot deferred a quarter",
      "Budget owner deprioritized initiative",
    ],
  },
  {
    dim: "renewal",
    baseField: "renewal_days",
    minDelta: 1, maxDelta: 4,
    min: 0, max: 365,
    upBias: 0.05,
    upIsRisk: false, upIsOpportunity: false,
    agent: "Governance Agent",
    signalUp: "Renewal date shifted out",
    signalDown: "Renewal window closing",
    reasonsUp: ["Renewal date shifted later after legal review"],
    reasonsDown: [
      "Renewal window narrowing",
      "Renewal owner asked for proposal",
      "Procurement opened renewal workflow",
    ],
  },
  {
    dim: "spend",
    baseField: "current_month_spend",
    minDelta: 5, maxDelta: 18,
    min: 0, max: 1_000_000_000,
    upBias: 0.5,
    upIsRisk: false, upIsOpportunity: true,
    agent: "Account Health Agent",
    signalUp: "Spend trending up",
    signalDown: "Spend trending down",
    reasonsUp: [
      "Spend trending above prior month",
      "Add-on consumption pushed spend up",
    ],
    reasonsDown: [
      "Spend trending below prior month",
      "Customer pulled back on optional add-ons",
    ],
  },
];

function pickRule(rng: () => number): DimensionRule {
  // Slightly weight toward the more "dramatic" dims for demo feel.
  const weighted: DriftDimension[] = [
    "support_risk", "support_risk",
    "usage", "usage",
    "opportunity", "opportunity",
    "engagement",
    "renewal",
    "spend",
  ];
  const dim = weighted[Math.floor(rng() * weighted.length)];
  return RULES.find((r) => r.dim === dim) ?? RULES[0];
}

// Tiny deterministic-ish RNG, seeded per tick for stability under StrictMode.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function getCurrent(
  account: Account,
  overlay: DriftOverlay,
  rule: DimensionRule,
): number {
  const ov = overlay[account.account_id];
  if (ov) {
    switch (rule.dim) {
      case "support_risk": if (ov.support_risk != null) return ov.support_risk; break;
      case "usage":        if (ov.usage != null) return ov.usage; break;
      case "engagement":   if (ov.engagement != null) return ov.engagement; break;
      case "opportunity":  if (ov.opportunity != null) return ov.opportunity; break;
      case "renewal":      if (ov.renewal != null) return ov.renewal; break;
      case "spend":        if (ov.spend != null) return ov.spend; break;
    }
  }
  const raw = account[rule.baseField];
  return typeof raw === "number" ? raw : 0;
}

function setOverlayValue(
  overlay: DriftOverlay,
  accountId: string,
  rule: DriftDimension,
  value: number,
) {
  if (!overlay[accountId]) overlay[accountId] = {};
  overlay[accountId][rule] = value;
}

function classifyMagnitude(deltaPct: number): DriftMagnitude {
  if (deltaPct >= 15) return "major";
  if (deltaPct >= 7) return "moderate";
  return "minor";
}

function classifyImpact(rule: DimensionRule, direction: DriftDirection): DriftImpact {
  if (direction === "up") {
    if (rule.upIsRisk) return "risk";
    if (rule.upIsOpportunity) return "opportunity";
  } else {
    if (rule.upIsRisk) return "opportunity";         // risk going down = good
    if (rule.upIsOpportunity) return "risk";         // opportunity going down = bad
    if (rule.dim === "engagement") return "risk";    // engagement down = bad
    if (rule.dim === "renewal") return "risk";       // renewal countdown = pressure
  }
  return "neutral";
}

// ---------- tick generator ----------

export interface TickResult {
  events: DriftEvent[];
  overlay: DriftOverlay;
}

export function generateDriftTick(
  accounts: Account[],
  prev: { events: DriftEvent[]; overlay: DriftOverlay },
  opts: { now?: Date; eventsThisTick?: number; seed?: number } = {},
): TickResult {
  if (!accounts.length) return prev;

  const now = opts.now ?? new Date();
  const seed = opts.seed ?? now.getTime();
  const rng = makeRng(seed);
  const target = opts.eventsThisTick ?? (2 + Math.floor(rng() * 4)); // 2-5 events

  const newEvents: DriftEvent[] = [];
  const overlay: DriftOverlay = { ...prev.overlay };
  // shallow-clone per-account overlays we plan to touch
  const touchedAccounts = new Set<string>();

  let attempts = 0;
  while (newEvents.length < target && attempts < target * 4) {
    attempts++;
    const account = accounts[Math.floor(rng() * accounts.length)];
    if (touchedAccounts.has(account.account_id)) continue;
    const rule = pickRule(rng);
    const direction: DriftDirection = rng() < rule.upBias ? "up" : "down";
    const before = getCurrent(account, overlay, rule);

    let delta: number;
    let after: number;
    let deltaPct: number;

    if (rule.dim === "spend") {
      // delta as percentage of before
      const pct = rule.minDelta + rng() * (rule.maxDelta - rule.minDelta);
      const change = before * (pct / 100) * (direction === "up" ? 1 : -1);
      after = Math.max(rule.min, before + change);
      delta = Math.abs(after - before);
      deltaPct = before > 0 ? (delta / before) * 100 : pct;
    } else {
      delta = rule.minDelta + rng() * (rule.maxDelta - rule.minDelta);
      after = Math.min(rule.max, Math.max(rule.min, before + (direction === "up" ? delta : -delta)));
      delta = Math.abs(after - before);
      // for renewal_days, pct against 90 (typical renewal window)
      const denom = rule.dim === "renewal" ? 90 : 100;
      deltaPct = (delta / denom) * 100;
    }

    if (delta < 0.5) continue; // ignore noise

    if (!overlay[account.account_id]) overlay[account.account_id] = { ...(prev.overlay[account.account_id] ?? {}) };
    setOverlayValue(overlay, account.account_id, rule.dim, after);
    touchedAccounts.add(account.account_id);

    const reasons = direction === "up" ? rule.reasonsUp : rule.reasonsDown;
    const reason = reasons[Math.floor(rng() * reasons.length)] ?? "Telemetry update";

    newEvents.push({
      id: `${now.getTime()}-${account.account_id}-${rule.dim}-${newEvents.length}`,
      account_id: account.account_id,
      account_name: account.account_name,
      dimension: rule.dim,
      direction,
      delta: Math.round(delta * 10) / 10,
      before: Math.round(before * 10) / 10,
      after: Math.round(after * 10) / 10,
      magnitude: classifyMagnitude(deltaPct),
      impact: classifyImpact(rule, direction),
      reason,
      timestamp: now.toISOString(),
      agent: rule.agent,
      signalLabel: direction === "up" ? rule.signalUp : rule.signalDown,
    });
  }

  const merged = [...newEvents, ...prev.events].slice(0, EVENT_CAP);
  safeWrite(STORAGE_KEY_EVENTS, merged);
  safeWrite(STORAGE_KEY_OVERLAY, overlay);
  return { events: merged, overlay };
}

// ---------- live tick subscription ----------

export interface DriftEngineHandle {
  stop: () => void;
  triggerNow: () => void;
}

export interface SubscribeOptions {
  intervalMs?: number;       // default ~45s, jittered each tick
  jitterMs?: number;         // default 15s
  firstTickDelayMs?: number; // default 4s (so it feels alive after page load)
  eventsPerTick?: number;    // default 2-5
}

/**
 * Start a recurring drift tick. Returns a handle to stop / force-tick.
 * Caller passes a snapshot getter so the engine always sees fresh accounts.
 */
export function startDriftEngine(
  getAccounts: () => Account[],
  onTick: (snapshot: DriftSnapshot) => void,
  opts: SubscribeOptions = {},
): DriftEngineHandle {
  const baseInterval = opts.intervalMs ?? 45_000;
  const jitter = opts.jitterMs ?? 15_000;
  const firstDelay = opts.firstTickDelayMs ?? 4_000;

  let stopped = false;
  let timer: number | null = null;

  const tickOnce = () => {
    if (stopped) return;
    const accounts = getAccounts();
    if (accounts.length === 0) {
      schedule();
      return;
    }
    const prev = {
      events: safeRead<DriftEvent[]>(STORAGE_KEY_EVENTS, []),
      overlay: safeRead<DriftOverlay>(STORAGE_KEY_OVERLAY, {}),
    };
    const result = generateDriftTick(accounts, prev, {
      eventsThisTick: opts.eventsPerTick,
    });
    onTick({
      events: result.events,
      overlay: result.overlay,
      sessionStart: safeRead<string>(STORAGE_KEY_STARTED, new Date().toISOString()),
      lastTick: result.events[0]?.timestamp ?? null,
    });
    schedule();
  };

  const schedule = () => {
    if (stopped) return;
    const next = baseInterval + (Math.random() - 0.5) * 2 * jitter;
    timer = window.setTimeout(tickOnce, Math.max(5_000, next));
  };

  // ensure sessionStart is recorded
  loadDriftSnapshot();

  timer = window.setTimeout(tickOnce, firstDelay);

  return {
    stop: () => {
      stopped = true;
      if (timer != null) window.clearTimeout(timer);
    },
    triggerNow: () => {
      if (timer != null) window.clearTimeout(timer);
      tickOnce();
    },
  };
}

// ---------- selectors for the UI panel ----------

export interface DriftSummary {
  accountsChangedSinceStart: number;
  totalEvents: number;
  lastTickIso: string | null;
  largestRiskIncrease: DriftEvent | null;
  largestOpportunityIncrease: DriftEvent | null;
  // Phase 14A revision — operational tiles
  risksUp: number;            // count of risk-classified events
  opportunitiesUp: number;    // count of opportunity-classified events
  newAttentionAccounts: number; // accounts with moderate/major risk drift
  newAttentionList: string[];   // account names (deduped, capped 8)
}

export function summarizeDrift(events: DriftEvent[]): DriftSummary {
  const accountsChanged = new Set(events.map((e) => e.account_id));

  const riskEvents = events.filter((e) => e.impact === "risk");
  const oppEvents = events.filter((e) => e.impact === "opportunity");

  const score = (e: DriftEvent) => {
    if (e.dimension === "spend") return e.before > 0 ? (e.delta / e.before) * 100 : e.delta;
    if (e.dimension === "renewal") return (e.delta / 90) * 100;
    return e.delta;
  };
  riskEvents.sort((a, b) => score(b) - score(a));
  oppEvents.sort((a, b) => score(b) - score(a));

  // "New attention" = accounts that picked up a moderate/major risk-flavored
  // drift event. These are the accounts a seller likely needs to look at
  // even though the deterministic ranker has not necessarily re-ordered.
  const attentionSet = new Set<string>();
  const attentionNames: string[] = [];
  for (const e of riskEvents) {
    if (e.magnitude === "minor") continue;
    if (attentionSet.has(e.account_id)) continue;
    attentionSet.add(e.account_id);
    attentionNames.push(e.account_name);
  }

  return {
    accountsChangedSinceStart: accountsChanged.size,
    totalEvents: events.length,
    lastTickIso: events[0]?.timestamp ?? null,
    largestRiskIncrease: riskEvents[0] ?? null,
    largestOpportunityIncrease: oppEvents[0] ?? null,
    risksUp: riskEvents.length,
    opportunitiesUp: oppEvents.length,
    newAttentionAccounts: attentionSet.size,
    newAttentionList: attentionNames.slice(0, 8),
  };
}

// ---------- impact summary (Phase 14A revision 2) ----------
//
// "Impact summary" connects drift events to seller action. It looks at the
// most recent pulse cycle AND the running tallies, then anchors them to the
// authoritative recommendation list (`recs`) so the highest-priority affected
// account is the one a seller should look at first. The summary never
// mutates `recs` — it only reads `priority_rank` for ordering.

export interface RecommendationLike {
  account_id: string;
  account_name: string;
  priority_rank: number;
  recommended_action: string;
}

export interface ImpactSummary {
  // events in the latest tick (same timestamp as `lastTickIso`)
  cycleEvents: DriftEvent[];
  cycleRiskEvents: number;
  cycleOpportunityEvents: number;

  // strongest events in the latest cycle (fall back to all-time if cycle empty)
  mostSignificantRisk: DriftEvent | null;
  mostSignificantOpportunity: DriftEvent | null;

  // accounts touched in the latest cycle that warrant immediate attention
  // (moderate+ risk magnitude). Falls back to running list if cycle is empty.
  immediateAttention: {
    account_id: string;
    account_name: string;
    reason: string;
  }[];

  // highest-priority recommendation that had any drift event in the cycle
  // (fallback: highest-priority among all drifted accounts ever this session).
  highestPriorityAffected:
    | {
        rec: RecommendationLike;
        latestEvent: DriftEvent;
      }
    | null;
}

function scoreFor(e: DriftEvent): number {
  if (e.dimension === "spend") return e.before > 0 ? (e.delta / e.before) * 100 : e.delta;
  if (e.dimension === "renewal") return (e.delta / 90) * 100;
  return e.delta;
}

export function computeImpactSummary(
  events: DriftEvent[],
  recs: RecommendationLike[],
): ImpactSummary {
  const recsById = new Map(recs.map((r) => [r.account_id, r]));

  const latestTs = events[0]?.timestamp ?? null;
  const cycleEvents = latestTs
    ? events.filter((e) => e.timestamp === latestTs)
    : [];

  const cycleRisk = cycleEvents.filter((e) => e.impact === "risk");
  const cycleOpp = cycleEvents.filter((e) => e.impact === "opportunity");

  // Pick strongest in cycle; if cycle is degenerate fall back to all-time.
  const allRisk = events.filter((e) => e.impact === "risk").sort((a, b) => scoreFor(b) - scoreFor(a));
  const allOpp = events.filter((e) => e.impact === "opportunity").sort((a, b) => scoreFor(b) - scoreFor(a));
  const cycleRiskSorted = [...cycleRisk].sort((a, b) => scoreFor(b) - scoreFor(a));
  const cycleOppSorted = [...cycleOpp].sort((a, b) => scoreFor(b) - scoreFor(a));

  const mostRisk = cycleRiskSorted[0] ?? allRisk[0] ?? null;
  const mostOpp = cycleOppSorted[0] ?? allOpp[0] ?? null;

  // Immediate attention: prefer cycle moderate+ risks, fallback to running list.
  const cycleAttention = cycleRisk.filter((e) => e.magnitude !== "minor");
  const attentionSource = cycleAttention.length > 0 ? cycleAttention : allRisk.filter((e) => e.magnitude !== "minor");
  const seenAttention = new Set<string>();
  const immediateAttention: ImpactSummary["immediateAttention"] = [];
  for (const e of attentionSource) {
    if (seenAttention.has(e.account_id)) continue;
    seenAttention.add(e.account_id);
    immediateAttention.push({
      account_id: e.account_id,
      account_name: e.account_name,
      reason: e.reason,
    });
    if (immediateAttention.length >= 5) break;
  }

  // Highest-priority affected = lowest priority_rank among drifted accounts.
  // Prefer accounts touched in the cycle; if none of those match a recommendation
  // (recommendations cover a small subset of the portfolio), fall back to the
  // full event history before giving up.
  const cycleIds = new Set(cycleEvents.map((e) => e.account_id));
  const allIds = new Set(events.map((e) => e.account_id));

  const pickBest = (ids: Set<string>): RecommendationLike | null => {
    let best: RecommendationLike | null = null;
    for (const id of ids) {
      const rec = recsById.get(id);
      if (!rec) continue;
      if (best == null || rec.priority_rank < best.priority_rank) best = rec;
    }
    return best;
  };
  let bestRec = pickBest(cycleIds);
  if (!bestRec) bestRec = pickBest(allIds);

  let highestPriorityAffected: ImpactSummary["highestPriorityAffected"] = null;
  if (bestRec) {
    const latestForBest = events.find((e) => e.account_id === bestRec!.account_id) ?? null;
    if (latestForBest) {
      highestPriorityAffected = { rec: bestRec, latestEvent: latestForBest };
    }
  }

  return {
    cycleEvents,
    cycleRiskEvents: cycleRisk.length,
    cycleOpportunityEvents: cycleOpp.length,
    mostSignificantRisk: mostRisk,
    mostSignificantOpportunity: mostOpp,
    immediateAttention,
    highestPriorityAffected,
  };
}
//
// Multiple components need to react to drift ticks (the hero acknowledgement,
// the pulse strip, the activity stream, the full drift panel). Rather than
// each mounting its own engine, we expose a singleton subscription so only
// ONE timer runs per tab.

type Listener = (snapshot: DriftSnapshot) => void;
const listeners = new Set<Listener>();
let singletonHandle: DriftEngineHandle | null = null;
let lastAccountsRef: Account[] = [];

export function subscribeDrift(
  getAccounts: () => Account[],
  listener: Listener,
  opts: SubscribeOptions = {},
): () => void {
  // Always emit the current snapshot immediately so new subscribers don't
  // have to wait for the next tick.
  if (typeof window !== "undefined") listener(loadDriftSnapshot());

  listeners.add(listener);

  if (!singletonHandle && typeof window !== "undefined") {
    singletonHandle = startDriftEngine(
      () => (getAccounts().length > 0 ? getAccounts() : lastAccountsRef),
      (snap) => {
        for (const l of Array.from(listeners)) {
          try { l(snap); } catch { /* ignore listener errors */ }
        }
      },
      opts,
    );
  }
  // Keep the most recent non-empty account list so late ticks survive
  // re-renders that briefly clear `accounts`.
  const current = getAccounts();
  if (current.length > 0) lastAccountsRef = current;

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && singletonHandle) {
      singletonHandle.stop();
      singletonHandle = null;
    }
  };
}

export function forceDriftTick(getAccounts: () => Account[]) {
  if (typeof window === "undefined") return;
  const accounts = getAccounts().length > 0 ? getAccounts() : lastAccountsRef;
  if (accounts.length === 0) return;
  const prev = {
    events: safeRead<DriftEvent[]>(STORAGE_KEY_EVENTS, []),
    overlay: safeRead<DriftOverlay>(STORAGE_KEY_OVERLAY, {}),
  };
  const result = generateDriftTick(accounts, prev, { eventsThisTick: 3 });
  const snap: DriftSnapshot = {
    events: result.events,
    overlay: result.overlay,
    sessionStart: safeRead<string>(STORAGE_KEY_STARTED, new Date().toISOString()),
    lastTick: result.events[0]?.timestamp ?? null,
  };
  for (const l of Array.from(listeners)) {
    try { l(snap); } catch { /* ignore */ }
  }
}
