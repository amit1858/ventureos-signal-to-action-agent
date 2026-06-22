// Phase 14E — External System Change Detection.
//
// Pure client-side selector + snapshot store that detects field-level changes
// from the external data source (HubSpot or synthetic) since the last
// recorded sync, surfaces what changed in executive language, names the
// agents that would react, and correlates each change with the most recent
// recommendation delta for the same account (recommendation impact).
//
// Strictly additive. Never calls the backend, never mutates source data.

import type { Account } from "@/lib/types";
import { loadDriftSnapshot, type DriftOverlay } from "@/lib/driftEngine";
import { loadDeltas, type RecommendationDelta } from "@/lib/recommendationDelta";

// ---------- types ----------

export type ExternalDimension =
  | "spend"
  | "support_risk"
  | "usage"
  | "engagement"
  | "renewal"
  | "growth_potential";

export type ExternalImpact = "risk" | "opportunity" | "neutral";
export type ExternalMagnitude = "minor" | "moderate" | "major";

export interface ExternalChangeEvent {
  id: string;
  timestamp: string;        // ISO of detection
  source: string;            // "HubSpot test CRM" | "Synthetic dataset"
  account_id: string;
  account_name: string;
  dimension: ExternalDimension;
  before: number;
  after: number;
  delta: number;             // absolute (after - before)
  pct_change: number | null; // signed pct change (null when before == 0)
  magnitude: ExternalMagnitude;
  impact: ExternalImpact;
  executive_summary: string; // "Spend dropped 22% in HubSpot since last sync"
  reacting_agents: string[]; // ["Risk Agent", "Telemetry Agent"]
  linked_delta_id?: string;  // recommendation delta correlated with this change
  linked_delta_kind?: RecommendationDelta["kind"];
  linked_delta_action?: string | null; // resulting action when delta = action_changed
}

export interface ExternalSyncMetadata {
  source: string;
  last_sync: string | null;
  account_count: number;
  events_total: number;
  events_last_window: number;
  records_changed: number;     // unique accounts impacted in last window
  records_added: number;       // accounts new to external since prior sync
  records_removed: number;     // accounts disappeared since prior sync
}

interface AccountSnapshotRow {
  account_id: string;
  account_name: string;
  spend: number;
  support_risk: number;
  usage: number;
  engagement: number;
  renewal_days: number;
  growth_potential: number;
}

interface ExternalSnapshot {
  source: string;
  taken_at: string;
  byId: Record<string, AccountSnapshotRow>;
}

// ---------- storage ----------

const SNAPSHOT_KEY = "s2a_ext_snapshot_v1";
const EVENTS_KEY = "s2a_ext_events_v1";
const META_KEY = "s2a_ext_meta_v1";
const EVENT_CAP = 200;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

// ---------- helpers ----------

// Apply the drift overlay to a raw account so the "effective" state reflects
// any client-side drift adjustments. Read-only — never mutates the account.
function effectiveRow(a: Account, overlay: DriftOverlay): AccountSnapshotRow {
  const o = overlay[a.account_id] ?? {};
  return {
    account_id: a.account_id,
    account_name: a.account_name,
    spend:           o.spend            ?? a.current_month_spend,
    support_risk:    o.support_risk     ?? a.support_risk_score,
    usage:           o.usage            ?? a.product_usage_score,
    engagement:      o.engagement       ?? a.engagement_score,
    renewal_days:    o.renewal          ?? a.renewal_days,
    growth_potential: o.opportunity     ?? a.growth_potential_score,
  };
}

function classifyMagnitude(dim: ExternalDimension, before: number, after: number): ExternalMagnitude {
  const delta = Math.abs(after - before);
  if (dim === "spend") {
    if (before === 0) return delta > 100000 ? "major" : "moderate";
    const pct = Math.abs((after - before) / before);
    if (pct >= 0.20) return "major";
    if (pct >= 0.10) return "moderate";
    return "minor";
  }
  if (dim === "renewal") {
    // days
    if (delta >= 14) return "major";
    if (delta >= 7) return "moderate";
    return "minor";
  }
  // score dimensions (0-100)
  if (delta >= 15) return "major";
  if (delta >= 8) return "moderate";
  return "minor";
}

function classifyImpact(dim: ExternalDimension, direction: 1 | -1): ExternalImpact {
  // risk goes UP -> risk; spend/usage/engagement/growth/renewal_days going DOWN -> risk; opposite -> opportunity.
  if (dim === "support_risk") return direction > 0 ? "risk" : "opportunity";
  if (dim === "renewal") return direction < 0 ? "risk" : "neutral";
  // spend, usage, engagement, growth_potential
  return direction < 0 ? "risk" : "opportunity";
}

const DIM_LABEL: Record<ExternalDimension, string> = {
  spend:            "Monthly spend",
  support_risk:     "Support risk",
  usage:            "Product usage",
  engagement:       "Engagement",
  renewal:          "Renewal window",
  growth_potential: "Growth potential",
};

const DIM_AGENTS: Record<ExternalDimension, string[]> = {
  spend:            ["Risk Agent", "Opportunity Agent"],
  support_risk:     ["Risk Agent", "Governance Agent"],
  usage:            ["Telemetry Agent", "Risk Agent"],
  engagement:       ["Telemetry Agent", "Opportunity Agent"],
  renewal:          ["Opportunity Agent", "Governance Agent"],
  growth_potential: ["Opportunity Agent"],
};

function executiveSummary(
  source: string,
  dim: ExternalDimension,
  before: number,
  after: number,
  account_name: string,
  pctChange: number | null,
): string {
  const dimLabel = DIM_LABEL[dim].toLowerCase();
  const directionVerb =
    dim === "renewal"
      ? after < before ? "tightened" : "loosened"
      : after > before ? "climbed" : "dropped";

  if (dim === "spend") {
    const pct = pctChange != null ? `${Math.abs(Math.round(pctChange * 100))}%` : `₹${Math.abs(after - before).toLocaleString("en-IN")}`;
    return `${account_name}'s ${dimLabel} ${directionVerb} ${pct} in ${source} since the last sync.`;
  }
  if (dim === "renewal") {
    return `${account_name}'s ${dimLabel} ${directionVerb} from ${Math.round(before)}d to ${Math.round(after)}d in ${source}.`;
  }
  const delta = Math.round(Math.abs(after - before));
  return `${account_name}'s ${dimLabel} ${directionVerb} ${delta} points in ${source} since the last sync.`;
}

// Threshold to even consider a movement (filters noise).
function isMeaningful(dim: ExternalDimension, before: number, after: number): boolean {
  const delta = Math.abs(after - before);
  if (dim === "spend") {
    if (before === 0) return delta > 50000;
    return Math.abs((after - before) / before) >= 0.05;
  }
  if (dim === "renewal") return delta >= 3;
  return delta >= 3; // 3+ pts on a 0-100 score
}

// ---------- diff core ----------

interface DiffResult {
  events: ExternalChangeEvent[];
  records_added: string[];
  records_removed: string[];
}

function diffSnapshots(prev: ExternalSnapshot, curr: ExternalSnapshot, source: string, now: string, allDeltas: RecommendationDelta[]): DiffResult {
  const events: ExternalChangeEvent[] = [];
  const records_added: string[] = [];
  const records_removed: string[] = [];

  for (const id of Object.keys(curr.byId)) {
    if (!(id in prev.byId)) records_added.push(id);
  }
  for (const id of Object.keys(prev.byId)) {
    if (!(id in curr.byId)) records_removed.push(id);
  }

  const dims: ExternalDimension[] = ["spend", "support_risk", "usage", "engagement", "renewal", "growth_potential"];
  const fieldOf: Record<ExternalDimension, keyof AccountSnapshotRow> = {
    spend: "spend",
    support_risk: "support_risk",
    usage: "usage",
    engagement: "engagement",
    renewal: "renewal_days",
    growth_potential: "growth_potential",
  };

  for (const id of Object.keys(curr.byId)) {
    const c = curr.byId[id];
    const p = prev.byId[id];
    if (!p) continue;
    for (const dim of dims) {
      const before = Number(p[fieldOf[dim]]);
      const after = Number(c[fieldOf[dim]]);
      if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
      if (before === after) continue;
      if (!isMeaningful(dim, before, after)) continue;

      const direction: 1 | -1 = after > before ? 1 : -1;
      const magnitude = classifyMagnitude(dim, before, after);
      const impact = classifyImpact(dim, direction);
      const pct = before !== 0 ? (after - before) / before : null;

      // correlate with most recent recommendation delta for this account that
      // happened around/after the prior snapshot — best-effort.
      const recentDelta = allDeltas.find(
        (d) => d.account_id === id && new Date(d.timestamp).getTime() >= new Date(prev.taken_at).getTime() - 60_000,
      );

      events.push({
        id: `ext-${id}-${dim}-${Date.parse(now)}`,
        timestamp: now,
        source,
        account_id: id,
        account_name: c.account_name,
        dimension: dim,
        before,
        after,
        delta: after - before,
        pct_change: pct,
        magnitude,
        impact,
        executive_summary: executiveSummary(source, dim, before, after, c.account_name, pct),
        reacting_agents: DIM_AGENTS[dim],
        linked_delta_id: recentDelta?.id,
        linked_delta_kind: recentDelta?.kind,
        linked_delta_action: recentDelta?.current_action ?? null,
      });
    }
  }

  return { events, records_added, records_removed };
}

// ---------- public API ----------

export interface RecordSnapshotOptions {
  source: string;        // human label e.g. "HubSpot test CRM"
  lastSync?: string | null; // backend-reported last_synced_at
}

/**
 * Snapshot the current external dataset (accounts + drift overlay applied) and
 * detect changes vs the prior snapshot. New events are appended to the event
 * store; the snapshot is overwritten. Returns the events detected this round.
 */
export function recordExternalSnapshot(accounts: Account[], opts: RecordSnapshotOptions): ExternalChangeEvent[] {
  if (!isBrowser()) return [];
  const now = new Date().toISOString();
  const driftOverlay = loadDriftSnapshot().overlay;
  const byId: Record<string, AccountSnapshotRow> = {};
  for (const a of accounts) byId[a.account_id] = effectiveRow(a, driftOverlay);
  const curr: ExternalSnapshot = { source: opts.source, taken_at: now, byId };

  const prev = readJson<ExternalSnapshot | null>(SNAPSHOT_KEY, null);
  let newEvents: ExternalChangeEvent[] = [];
  let records_added = 0;
  let records_removed = 0;

  if (prev && prev.source === opts.source) {
    const allDeltas = loadDeltas();
    const diff = diffSnapshots(prev, curr, opts.source, now, allDeltas);
    newEvents = diff.events;
    records_added = diff.records_added.length;
    records_removed = diff.records_removed.length;
  }

  writeJson(SNAPSHOT_KEY, curr);

  if (newEvents.length > 0 || records_added > 0 || records_removed > 0) {
    const all = readJson<ExternalChangeEvent[]>(EVENTS_KEY, []);
    const next = [...newEvents, ...all].slice(0, EVENT_CAP);
    writeJson(EVENTS_KEY, next);
  }

  const prevMeta = readJson<ExternalSyncMetadata>(META_KEY, {
    source: opts.source,
    last_sync: opts.lastSync ?? null,
    account_count: accounts.length,
    events_total: 0,
    events_last_window: 0,
    records_changed: 0,
    records_added: 0,
    records_removed: 0,
  });
  const meta: ExternalSyncMetadata = {
    source: opts.source,
    last_sync: opts.lastSync ?? now,
    account_count: accounts.length,
    events_total: prevMeta.events_total + newEvents.length,
    events_last_window: newEvents.length,
    records_changed: new Set(newEvents.map((e) => e.account_id)).size,
    records_added,
    records_removed,
  };
  writeJson(META_KEY, meta);

  return newEvents;
}

export function loadExternalEvents(): ExternalChangeEvent[] {
  return readJson<ExternalChangeEvent[]>(EVENTS_KEY, []);
}

export function loadExternalMeta(): ExternalSyncMetadata | null {
  return readJson<ExternalSyncMetadata | null>(META_KEY, null);
}

export function clearExternalState(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(SNAPSHOT_KEY);
  window.localStorage.removeItem(EVENTS_KEY);
  window.localStorage.removeItem(META_KEY);
}
