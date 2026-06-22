// Phase 14B — Recommendation Delta Tracking.
//
// Pure client-side store + diff engine. Captures every recommendation snapshot
// the backend returns and emits a "delta event" whenever an account's
// recommended_action or priority_rank changes between runs. Optionally enriches
// each delta with a plausible reason inferred from the most recent drift event
// for that account, so the change log can answer "what changed and why".
//
// Strictly additive. Never mutates the recommendation list, never calls the
// backend, never reorders ranks. The ranker remains the only authority for
// recommendations.

import type { Recommendation } from "@/lib/types";
import { loadDriftSnapshot, type DriftEvent } from "@/lib/driftEngine";

// ---------- types ----------

export type DeltaKind =
  | "first_seen"     // account appeared in recs for the first time this session
  | "left_queue"     // account dropped out of the top-N
  | "action_changed" // recommended_action changed
  | "priority_jump"  // priority_rank changed by >= 2
  | "refined";       // priority_rank shifted by 1 only

export interface RecommendationDelta {
  id: string;
  timestamp: string;            // ISO
  account_id: string;
  account_name: string;
  kind: DeltaKind;
  previous_rank: number | null; // null when first_seen
  current_rank: number | null;  // null when left_queue
  previous_action: string | null;
  current_action: string | null;
  reason: string;
  inferred_drift_event_id?: string;
  inferred_drift_signal?: string;
  inferred_drift_agent?: string;
}

export interface RecommendationSnapshot {
  timestamp: string;
  byId: Record<string, { rank: number; action: string; name: string }>;
}

export interface DeltaSummary {
  totalSinceSession: number;
  totalSinceLastRun: number;
  actionChanges: number;
  priorityJumps: number;
  newToQueue: number;
  leftQueue: number;
  lastRunIso: string | null;
  lastChangeIso: string | null;
}

// ---------- storage ----------

const SNAPSHOT_KEY = "s2a_rec_snapshot_v1";
const DELTAS_KEY = "s2a_rec_deltas_v1";
const LAST_RUN_KEY = "s2a_rec_last_run_v1";
const DELTA_CAP = 200;

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
    /* quota / safari private mode — silent */
  }
}

// ---------- snapshot ----------

export function loadSnapshot(): RecommendationSnapshot | null {
  return readJson<RecommendationSnapshot | null>(SNAPSHOT_KEY, null);
}

function saveSnapshot(snap: RecommendationSnapshot): void {
  writeJson(SNAPSHOT_KEY, snap);
}

function buildSnapshot(recs: Recommendation[]): RecommendationSnapshot {
  const byId: RecommendationSnapshot["byId"] = {};
  for (const r of recs) {
    byId[r.account_id] = {
      rank: r.priority_rank,
      action: r.recommended_action,
      name: r.account_name,
    };
  }
  return { timestamp: new Date().toISOString(), byId };
}

// ---------- delta log ----------

export function loadDeltas(): RecommendationDelta[] {
  return readJson<RecommendationDelta[]>(DELTAS_KEY, []);
}

function saveDeltas(list: RecommendationDelta[]): void {
  writeJson(DELTAS_KEY, list.slice(0, DELTA_CAP));
}

export function getLastRunIso(): string | null {
  return readJson<string | null>(LAST_RUN_KEY, null);
}

function setLastRunIso(iso: string): void {
  writeJson(LAST_RUN_KEY, iso);
}

// ---------- diff ----------

function classifyKind(
  prevRank: number | null,
  currRank: number | null,
  prevAction: string | null,
  currAction: string | null,
): DeltaKind | null {
  if (prevRank == null && currRank != null) return "first_seen";
  if (prevRank != null && currRank == null) return "left_queue";
  if (prevAction != null && currAction != null && prevAction !== currAction) return "action_changed";
  if (prevRank != null && currRank != null) {
    const drift = Math.abs(prevRank - currRank);
    if (drift >= 2) return "priority_jump";
    if (drift === 1) return "refined";
  }
  return null;
}

function reasonFor(kind: DeltaKind, prevRank: number | null, currRank: number | null, drift: DriftEvent | null): string {
  const driftClause = drift ? `${drift.signalLabel ?? drift.dimension} (${drift.agent})` : null;
  switch (kind) {
    case "first_seen":
      return driftClause
        ? `Entered priority queue · triggered by ${driftClause}`
        : `Entered priority queue at rank #${currRank ?? "?"}`;
    case "left_queue":
      return driftClause
        ? `Dropped off priority queue · ${driftClause} eased`
        : `Dropped off priority queue (was #${prevRank ?? "?"})`;
    case "action_changed": {
      const rankClause =
        prevRank != null && currRank != null && prevRank !== currRank
          ? ` · rank ${prevRank < currRank ? "↓" : "↑"} #${prevRank}→#${currRank}`
          : "";
      return driftClause
        ? `Recommended action revised · ${driftClause}${rankClause}`
        : `Recommended action revised by agents on re-evaluation${rankClause}`;
    }
    case "priority_jump":
      if (prevRank != null && currRank != null) {
        const direction = currRank < prevRank ? "Escalated" : "De-prioritised";
        return driftClause
          ? `${direction} #${prevRank} → #${currRank} · ${driftClause}`
          : `${direction} #${prevRank} → #${currRank}`;
      }
      return "Priority rank shifted";
    case "refined":
      return prevRank != null && currRank != null
        ? `Rank refined #${prevRank} → #${currRank}`
        : "Rank refined";
  }
}

function pickDriftFor(account_id: string): DriftEvent | null {
  if (!isBrowser()) return null;
  try {
    const snap = loadDriftSnapshot();
    return snap.events.find((e) => e.account_id === account_id) ?? null;
  } catch {
    return null;
  }
}

/**
 * Diff a new recommendation list against the persisted snapshot and emit
 * deltas. Persists the new snapshot + appended deltas. Returns the deltas
 * generated by THIS comparison (sorted newest-first).
 *
 * Pure-ish: only touches localStorage. Never mutates `recs`.
 */
export function ingestRecommendations(recs: Recommendation[]): RecommendationDelta[] {
  const prev = loadSnapshot();
  const next = buildSnapshot(recs);
  setLastRunIso(next.timestamp);

  if (!prev) {
    // First snapshot — record all as first_seen so the user can see the initial queue.
    const seeded: RecommendationDelta[] = recs.map((r) => {
      const drift = pickDriftFor(r.account_id);
      return {
        id: `${next.timestamp}-${r.account_id}-seed`,
        timestamp: next.timestamp,
        account_id: r.account_id,
        account_name: r.account_name,
        kind: "first_seen",
        previous_rank: null,
        current_rank: r.priority_rank,
        previous_action: null,
        current_action: r.recommended_action,
        reason: reasonFor("first_seen", null, r.priority_rank, drift),
        inferred_drift_event_id: drift?.id,
        inferred_drift_signal: drift?.signalLabel,
        inferred_drift_agent: drift?.agent,
      };
    });
    saveDeltas(seeded);
    saveSnapshot(next);
    return seeded;
  }

  const out: RecommendationDelta[] = [];
  const seenInPrev = new Set(Object.keys(prev.byId));

  for (const r of recs) {
    const before = prev.byId[r.account_id];
    const prevRank = before?.rank ?? null;
    const prevAction = before?.action ?? null;
    const kind = classifyKind(prevRank, r.priority_rank, prevAction, r.recommended_action);
    if (!kind) continue;
    const drift = pickDriftFor(r.account_id);
    out.push({
      id: `${next.timestamp}-${r.account_id}-${kind}`,
      timestamp: next.timestamp,
      account_id: r.account_id,
      account_name: r.account_name,
      kind,
      previous_rank: prevRank,
      current_rank: r.priority_rank,
      previous_action: prevAction,
      current_action: r.recommended_action,
      reason: reasonFor(kind, prevRank, r.priority_rank, drift),
      inferred_drift_event_id: drift?.id,
      inferred_drift_signal: drift?.signalLabel,
      inferred_drift_agent: drift?.agent,
    });
  }

  // accounts that dropped off the new list entirely
  const currIds = new Set(recs.map((r) => r.account_id));
  for (const id of seenInPrev) {
    if (currIds.has(id)) continue;
    const before = prev.byId[id];
    const drift = pickDriftFor(id);
    out.push({
      id: `${next.timestamp}-${id}-left_queue`,
      timestamp: next.timestamp,
      account_id: id,
      account_name: before.name,
      kind: "left_queue",
      previous_rank: before.rank,
      current_rank: null,
      previous_action: before.action,
      current_action: null,
      reason: reasonFor("left_queue", before.rank, null, drift),
      inferred_drift_event_id: drift?.id,
      inferred_drift_signal: drift?.signalLabel,
      inferred_drift_agent: drift?.agent,
    });
  }

  if (out.length > 0) {
    const merged = [...out, ...loadDeltas()].slice(0, DELTA_CAP);
    saveDeltas(merged);
  }
  saveSnapshot(next);
  return out;
}

// ---------- selectors ----------

export function summarizeDeltas(all: RecommendationDelta[]): DeltaSummary {
  const lastRun = getLastRunIso();
  let totalSinceLastRun = 0;
  let actionChanges = 0;
  let priorityJumps = 0;
  let newToQueue = 0;
  let leftQueue = 0;
  let lastChangeIso: string | null = null;

  for (const d of all) {
    if (!lastChangeIso || d.timestamp > lastChangeIso) lastChangeIso = d.timestamp;
    if (lastRun && d.timestamp === lastRun) totalSinceLastRun++;
    if (d.kind === "action_changed") actionChanges++;
    else if (d.kind === "priority_jump") priorityJumps++;
    else if (d.kind === "first_seen") newToQueue++;
    else if (d.kind === "left_queue") leftQueue++;
  }

  return {
    totalSinceSession: all.length,
    totalSinceLastRun,
    actionChanges,
    priorityJumps,
    newToQueue,
    leftQueue,
    lastRunIso: lastRun,
    lastChangeIso,
  };
}

export function deltasForAccount(account_id: string, all: RecommendationDelta[]): RecommendationDelta[] {
  return all.filter((d) => d.account_id === account_id);
}

// ---------- test helpers (used by harness, no-op in prod) ----------

export function _resetDeltaState(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(SNAPSHOT_KEY);
  window.localStorage.removeItem(DELTAS_KEY);
  window.localStorage.removeItem(LAST_RUN_KEY);
}
