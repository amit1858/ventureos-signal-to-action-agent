// Phase 14C — Account Timeline & Recommendation Evolution.
//
// Pure selector that joins three persistent client-side streams for a single
// account into one chronological storytelling feed:
//
//   1. Drift events           (driftEngine — telemetry simulator)
//   2. Recommendation deltas  (recommendationDelta — rec evolution)
//   3. Decision-ledger entries (decisionLedger — approvals + outcomes)
//
// Each entry is enriched with a `severity` and a `kindLabel` so the timeline
// component can render it without further classification logic. Pure: no
// side effects, no network, no mutation of any source.

import { loadDriftSnapshot, type DriftEvent } from "@/lib/driftEngine";
import { listLedgerForAccount, type LedgerEntry, OUTCOME_LABEL } from "@/lib/decisionLedger";
import { loadDeltas, type RecommendationDelta } from "@/lib/recommendationDelta";

export type TimelineKind =
  | "drift"
  | "rec_first_seen"
  | "rec_left_queue"
  | "rec_action_changed"
  | "rec_priority_jump"
  | "rec_refined"
  | "approval"
  | "outcome";

export type Severity = "low" | "medium" | "high" | "critical";

export interface TimelineEntry {
  id: string;
  timestamp: string; // ISO
  kind: TimelineKind;
  kindLabel: string;
  severity: Severity;
  account_id: string;
  account_name: string;
  headline: string;          // one-line summary
  detail?: string | null;    // optional secondary line (reason / note / signal label)
  attribution?: string | null; // "Agent · Signal", "Reviewer", etc.
  raw: DriftEvent | RecommendationDelta | LedgerEntry; // pass-through for advanced views
}

// ---------- severity ----------

function severityForDrift(e: DriftEvent): Severity {
  // support_risk + spend deltas are first-class; opportunity moves are quieter.
  if (e.magnitude === "major") {
    if (e.dimension === "support_risk" || e.dimension === "spend" || e.dimension === "renewal") return "critical";
    return "high";
  }
  if (e.magnitude === "moderate") return "medium";
  return "low";
}

function severityForDelta(d: RecommendationDelta): Severity {
  switch (d.kind) {
    case "first_seen":
      // Entering the top-3 is more significant than entering the long tail.
      return (d.current_rank ?? 99) <= 3 ? "high" : "medium";
    case "left_queue":
      return (d.previous_rank ?? 99) <= 3 ? "high" : "medium";
    case "action_changed":
      return "high";
    case "priority_jump":
      if (d.previous_rank != null && d.current_rank != null) {
        const movedToTop = d.current_rank <= 3 && d.previous_rank > 3;
        const movedFromTop = d.previous_rank <= 3 && d.current_rank > 3;
        if (movedToTop || movedFromTop) return "critical";
        return "high";
      }
      return "high";
    case "refined":
      return "low";
  }
}

function severityForApproval(e: LedgerEntry): Severity {
  if (e.decision_type === "approved") return "high";
  if (e.decision_type === "rejected") return "high";
  return "medium"; // review / deferred
}

function severityForOutcome(e: LedgerEntry): Severity {
  if (!e.outcome) return "low";
  switch (e.outcome) {
    case "renewal_risk_reduced":
    case "opportunity_created":
    case "meeting_booked":
      return "high";
    case "no_response":
    case "follow_up_required":
      return "medium";
    default:
      return "low";
  }
}

// ---------- mappers ----------

function fromDrift(e: DriftEvent): TimelineEntry {
  const direction = e.delta >= 0 ? "↑" : "↓";
  return {
    id: `drift-${e.id}`,
    timestamp: e.timestamp,
    kind: "drift",
    kindLabel: e.impact === "risk" ? "Risk signal" : "Opportunity signal",
    severity: severityForDrift(e),
    account_id: e.account_id,
    account_name: e.account_name,
    headline: `${e.signalLabel ?? e.dimension} ${direction}`,
    detail: e.reason,
    attribution: `${e.agent} · ${e.magnitude}`,
    raw: e,
  };
}

function fromDelta(d: RecommendationDelta): TimelineEntry {
  const map: Record<RecommendationDelta["kind"], { kind: TimelineKind; label: string }> = {
    first_seen:     { kind: "rec_first_seen",     label: "Entered priority queue" },
    left_queue:     { kind: "rec_left_queue",     label: "Left priority queue" },
    action_changed: { kind: "rec_action_changed", label: "Action revised" },
    priority_jump:  { kind: "rec_priority_jump",  label: "Priority jump" },
    refined:        { kind: "rec_refined",        label: "Rank refined" },
  };
  const m = map[d.kind];
  const headline =
    d.kind === "action_changed" && d.previous_action && d.current_action
      ? `${d.previous_action} → ${d.current_action}`
      : d.kind === "first_seen"
        ? `Entered queue at #${d.current_rank ?? "?"} · ${d.current_action ?? ""}`.trim()
        : d.kind === "left_queue"
          ? `Dropped off queue (was #${d.previous_rank ?? "?"})`
          : d.previous_rank != null && d.current_rank != null
            ? `#${d.previous_rank} → #${d.current_rank}`
            : "Rank changed";
  return {
    id: `delta-${d.id}`,
    timestamp: d.timestamp,
    kind: m.kind,
    kindLabel: m.label,
    severity: severityForDelta(d),
    account_id: d.account_id,
    account_name: d.account_name,
    headline,
    detail: d.reason,
    attribution: d.inferred_drift_agent
      ? `Inferred from ${d.inferred_drift_agent}${d.inferred_drift_signal ? ` · ${d.inferred_drift_signal}` : ""}`
      : null,
    raw: d,
  };
}

function fromApproval(e: LedgerEntry): TimelineEntry {
  const label =
    e.decision_type === "approved" ? "Approved" :
    e.decision_type === "rejected" ? "Rejected" : "Review requested";
  return {
    id: `appr-${e.ledger_id}`,
    timestamp: e.created_at,
    kind: "approval",
    kindLabel: label,
    severity: severityForApproval(e),
    account_id: e.account_id,
    account_name: e.account_name,
    headline: `${label}: ${e.recommended_action}`,
    detail: e.reviewer_note ?? e.business_impact ?? null,
    attribution: `${e.reviewer_name}${e.source ? ` · ${e.source}` : ""}`,
    raw: e,
  };
}

function fromOutcome(e: LedgerEntry): TimelineEntry | null {
  if (!e.outcome || !e.outcome_at) return null;
  return {
    id: `outcome-${e.ledger_id}`,
    timestamp: e.outcome_at,
    kind: "outcome",
    kindLabel: "Outcome recorded",
    severity: severityForOutcome(e),
    account_id: e.account_id,
    account_name: e.account_name,
    headline: OUTCOME_LABEL[e.outcome] ?? e.outcome,
    detail: e.outcome_note ?? null,
    attribution: e.reviewer_name ? `${e.reviewer_name} · ${e.recommended_action}` : e.recommended_action,
    raw: e,
  };
}

// ---------- public API ----------

export function buildAccountTimeline(account_id: string): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  const driftSnap = loadDriftSnapshot();
  for (const e of driftSnap.events) {
    if (e.account_id === account_id) entries.push(fromDrift(e));
  }

  const deltas = loadDeltas();
  for (const d of deltas) {
    if (d.account_id === account_id) entries.push(fromDelta(d));
  }

  const ledger = listLedgerForAccount(account_id);
  for (const e of ledger) {
    entries.push(fromApproval(e));
    const out = fromOutcome(e);
    if (out) entries.push(out);
  }

  entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
  return entries;
}

/**
 * Reasoning trail — chronological list of `reason` strings drawn from
 * recommendation deltas for this account, oldest → newest. Used to show
 * "how the recommendation has been reasoned over time".
 */
export function reasoningTrail(account_id: string): { timestamp: string; reason: string; kind: RecommendationDelta["kind"] }[] {
  const deltas = loadDeltas().filter((d) => d.account_id === account_id);
  return deltas
    .slice()
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))
    .map((d) => ({ timestamp: d.timestamp, reason: d.reason, kind: d.kind }));
}

/**
 * Current severity for the active recommendation — derived from the most
 * recent delta + most recent drift event for the account. Pure heuristic
 * for the workspace header badge; never feeds the ranker.
 */
export function currentSeverityFor(account_id: string): { severity: Severity; basis: string } {
  const deltas = loadDeltas().filter((d) => d.account_id === account_id);
  const drift = loadDriftSnapshot().events.find((e) => e.account_id === account_id);

  let best: Severity = "low";
  const ranks: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  const promote = (s: Severity) => { if (ranks[s] > ranks[best]) best = s; };

  let basis = "Steady state";
  if (deltas.length > 0) {
    const latest = deltas[0];
    promote(severityForDelta(latest));
    basis = `Latest delta: ${latest.kind.replace(/_/g, " ")}`;
  }
  if (drift) {
    const ds = severityForDrift(drift);
    if (ranks[ds] > ranks[best]) {
      best = ds;
      basis = `Latest drift: ${drift.signalLabel ?? drift.dimension} (${drift.magnitude})`;
    }
  }
  return { severity: best, basis };
}

// ---------- recommendation evolution ----------

export interface RecommendationEvolution {
  has_history: boolean;          // false when this is the first time we've seen this account
  kind: RecommendationDelta["kind"] | "baseline";
  kindLabel: string;
  previous_action: string | null;
  current_action: string | null;
  previous_rank: number | null;
  current_rank: number | null;
  reason: string;
  severity: Severity;
  timestamp: string;             // ISO of latest evolution (or first_seen if baseline)
  attribution: string | null;
}

const DELTA_KIND_LABEL: Record<RecommendationDelta["kind"], string> = {
  first_seen:     "Entered priority queue",
  left_queue:     "Left priority queue",
  action_changed: "Action revised",
  priority_jump:  "Priority jump",
  refined:        "Rank refined",
};

/**
 * Latest recommendation evolution for an account — picks the most recent
 * meaningful change. Prefers action_changed / priority_jump (the user-visible
 * decisions) over refined (a one-rank shuffle). Falls back to first_seen so
 * the panel always has something structured to render once the account has
 * appeared at least once in the queue.
 */
export function latestEvolutionFor(account_id: string): RecommendationEvolution | null {
  const deltas = loadDeltas().filter((d) => d.account_id === account_id);
  if (deltas.length === 0) return null;

  const PRIORITY: RecommendationDelta["kind"][] = ["action_changed", "priority_jump", "left_queue", "first_seen", "refined"];
  let chosen: RecommendationDelta | null = null;
  for (const k of PRIORITY) {
    const hit = deltas.find((d) => d.kind === k);
    if (hit) { chosen = hit; break; }
  }
  if (!chosen) chosen = deltas[0];

  const isBaseline = chosen.kind === "first_seen";
  return {
    has_history: !isBaseline,
    kind: chosen.kind,
    kindLabel: DELTA_KIND_LABEL[chosen.kind],
    previous_action: chosen.previous_action,
    current_action: chosen.current_action,
    previous_rank: chosen.previous_rank,
    current_rank: chosen.current_rank,
    reason: chosen.reason,
    severity: severityForDelta(chosen),
    timestamp: chosen.timestamp,
    attribution: chosen.inferred_drift_agent
      ? `Inferred from ${chosen.inferred_drift_agent}${chosen.inferred_drift_signal ? ` · ${chosen.inferred_drift_signal}` : ""}`
      : null,
  };
}
