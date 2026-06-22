// Phase 14F — Executive Daily Briefing.
//
// Pure composer that synthesizes a leadership-voice morning briefing from
// the existing analysis output (recommendations), the live drift engine,
// the recommendation delta log, the external system change monitor, and
// the local decision ledger.
//
// Answers three questions in the language a Chief Revenue Officer uses:
//
//   1. What changed?           — composed narrative
//   2. Why does it matter?     — business-impact reasoning
//   3. What should leadership do next? — ranked action list with deep links
//
// Strictly additive. Never mutates source data, never calls the backend.

import type { Account, Recommendation } from "@/lib/types";
import { loadDriftSnapshot, type DriftEvent } from "@/lib/driftEngine";
import { loadDeltas, type RecommendationDelta } from "@/lib/recommendationDelta";
import { loadExternalEvents, type ExternalChangeEvent } from "@/lib/externalChangeMonitor";
import { listLedger, type LedgerEntry } from "@/lib/decisionLedger";

// ---------- types ----------

export type BriefingUrgency = "calm" | "watch" | "act";

export interface BriefingActionItem {
  id: string;
  rank: number;
  account_id: string | null;
  account_name: string | null;
  title: string;                 // imperative — "Approve renewal play for Curefoods"
  rationale: string;             // why this is on the list
  category: "approval" | "outreach" | "escalation" | "review";
  est_minutes: number | null;
}

export interface BriefingPillar {
  headline: string;              // one-line bold takeaway
  detail: string;                // 1-2 sentence narrative
  evidence_count: number;        // how many underlying signals contributed
}

export interface ExecutiveDailyBriefing {
  generated_at: string;
  greeting: string;              // "Good morning" / "Good afternoon" / "Good evening"
  window_label: string;          // "Since session start (3h)" / "Since yesterday"
  urgency: BriefingUrgency;
  headline: string;              // one sentence opening line
  what_changed: BriefingPillar;
  why_it_matters: BriefingPillar;
  what_to_do_next: BriefingPillar;
  recommended_actions: BriefingActionItem[]; // top 5, ranked
  source_counts: {
    drift_events: number;
    recommendation_deltas: number;
    external_changes: number;
    pending_approvals: number;
    accounts_in_brief: number;
  };
}

// ---------- helpers ----------

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 5) return "Late tonight";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function windowLabel(sessionStartIso: string | null, now: Date): string {
  if (!sessionStartIso) return "Since yesterday";
  const start = new Date(sessionStartIso).getTime();
  const h = Math.max(1, Math.round((now.getTime() - start) / 3_600_000));
  if (h < 24) return `Since session start (${h}h)`;
  return "Since yesterday";
}

function inr(amount: number): string {
  if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(1)}Cr`;
  if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(1)}L`;
  if (amount >= 1e3) return `₹${(amount / 1e3).toFixed(0)}K`;
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}

// At-risk monthly spend exposed by risk-direction drift events on accounts
// the user actually has in scope. Conservative — only counts spend dips and
// support-risk spikes against the affected account's current spend.
function expectedRiskExposure(
  driftEvents: DriftEvent[],
  accounts: Account[],
): number {
  const byId = new Map(accounts.map((a) => [a.account_id, a]));
  const seen = new Set<string>();
  let total = 0;
  for (const e of driftEvents) {
    if (seen.has(e.account_id)) continue;
    const a = byId.get(e.account_id);
    if (!a) continue;
    if (e.dimension === "spend" && e.after < e.before) {
      total += a.current_month_spend;
      seen.add(e.account_id);
    } else if (e.dimension === "support_risk" && e.after > e.before && e.magnitude !== "minor") {
      total += a.current_month_spend * 0.4; // partial exposure
      seen.add(e.account_id);
    }
  }
  return total;
}

// ---------- main composer ----------

export interface BuildOptions {
  accounts: Account[];
  recommendations: Recommendation[];
  sessionStartIso?: string | null;
}

export function buildExecutiveDailyBriefing(opts: BuildOptions): ExecutiveDailyBriefing {
  const now = new Date();
  const greeting = greetingFor(now);
  const window_label = windowLabel(opts.sessionStartIso ?? null, now);

  // Pull from live stores (all client-side, read-only).
  const drift = loadDriftSnapshot();
  const driftEvents: DriftEvent[] = drift.events;
  const recDeltas: RecommendationDelta[] = loadDeltas();
  const extEvents: ExternalChangeEvent[] = loadExternalEvents();
  const ledger: LedgerEntry[] = listLedger();

  const driftRisk = driftEvents.filter((e) => e.impact === "risk");
  const driftOpp = driftEvents.filter((e) => e.impact === "opportunity");
  const majorRisk = driftRisk.filter((e) => e.magnitude === "major").length;
  const majorOpp = driftOpp.filter((e) => e.magnitude === "major").length;

  const entering = recDeltas.filter((d) => d.kind === "first_seen").length;
  const leaving = recDeltas.filter((d) => d.kind === "left_queue").length;
  const actionChanges = recDeltas.filter((d) => d.kind === "action_changed").length;
  const priorityJumps = recDeltas.filter((d) => d.kind === "priority_jump").length;

  const externalMajor = extEvents.filter((e) => e.magnitude === "major").length;
  const externalImpacted = new Set(extEvents.map((e) => e.account_id)).size;

  const exposure = expectedRiskExposure(driftRisk, opts.accounts);
  const topRecs = [...opts.recommendations].sort((a, b) => a.priority_rank - b.priority_rank).slice(0, 5);
  const pendingApprovals = topRecs.filter((r) => {
    const e = ledger.find((l) => l.recommendation_id === r.recommendation_id);
    return !e || e.decision_type === "review";
  });

  // ---------- urgency ----------
  let urgency: BriefingUrgency = "calm";
  if (majorRisk >= 3 || exposure >= 10_000_000 || externalMajor >= 4) urgency = "act";
  else if (majorRisk >= 1 || actionChanges + priorityJumps >= 2 || externalMajor >= 1 || pendingApprovals.length >= 3) urgency = "watch";

  // ---------- headline ----------
  let headline: string;
  if (urgency === "act") {
    headline = `${greeting}. The portfolio shifted overnight — ${pluralize(pendingApprovals.length, "decision")} ${pendingApprovals.length === 1 ? "needs" : "need"} leadership attention before momentum slips.`;
  } else if (urgency === "watch") {
    const opener = entering > 0
      ? `${entering} ${entering === 1 ? "account has" : "accounts have"} entered the priority queue`
      : `${pluralize(majorRisk + majorOpp, "material signal change")} surfaced`;
    headline = `${greeting}. ${opener} — worth a focused review before the day fills up.`;
  } else {
    headline = `${greeting}. Portfolio is steady — no leadership intervention required this cycle.`;
  }

  // ---------- pillar 1: what changed ----------
  const changedParts: string[] = [];
  if (majorRisk > 0) changedParts.push(`${pluralize(majorRisk, "major risk increase")}`);
  if (majorOpp > 0) changedParts.push(`${pluralize(majorOpp, "expansion signal")}`);
  if (entering > 0) changedParts.push(`${entering} ${entering === 1 ? "new entry" : "new entries"} into the priority queue`);
  if (leaving > 0) changedParts.push(`${leaving} ${leaving === 1 ? "exit" : "exits"} from the queue`);
  if (actionChanges > 0) changedParts.push(`${pluralize(actionChanges, "recommendation revision")}`);
  if (externalMajor > 0) changedParts.push(`${externalMajor} material ${externalMajor === 1 ? "change" : "changes"} in connected systems`);

  const what_changed: BriefingPillar = {
    headline:
      changedParts.length === 0
        ? "Portfolio held steady across the review window."
        : `${changedParts[0].charAt(0).toUpperCase() + changedParts[0].slice(1)} detected across ${pluralize(externalImpacted || opts.accounts.length, "account")}.`,
    detail:
      changedParts.length === 0
        ? "No drift, no rank changes, and no external system updates have crossed the materiality threshold."
        : `${window_label.toLowerCase()}, we recorded ${changedParts.slice(0, 3).join(", ")}${changedParts.length > 3 ? ", and more" : ""}.`,
    evidence_count: driftEvents.length + recDeltas.length + extEvents.length,
  };

  // ---------- pillar 2: why it matters ----------
  const why_headline =
    urgency === "act"
      ? "Without action, escalation likelihood rises within the next decision window."
      : urgency === "watch"
        ? "A short review now prevents these signals from compounding."
        : "No material revenue exposure detected this cycle.";

  const why_detail_parts: string[] = [];
  if (pendingApprovals.length > 0) {
    why_detail_parts.push(`${pluralize(pendingApprovals.length, "recommendation")} from the top of the queue ${pendingApprovals.length === 1 ? "is" : "are"} still awaiting your decision`);
  }
  if (majorRisk > 0 || externalMajor > 0) {
    why_detail_parts.push(`${pluralize(majorRisk + externalMajor, "high-severity signal")} could escalate without action`);
  }
  if (entering > 0) {
    why_detail_parts.push(`${entering} ${entering === 1 ? "new account" : "new accounts"} crossed the priority threshold and ${entering === 1 ? "needs" : "need"} an owner`);
  }
  if (why_detail_parts.length === 0) why_detail_parts.push("The team can continue executing on the existing plan");

  const why_it_matters: BriefingPillar = {
    headline: why_headline,
    detail: `${why_detail_parts.join("; ")}.`,
    evidence_count: pendingApprovals.length + majorRisk + externalMajor + entering,
  };

  // ---------- pillar 3: what to do next ----------
  const actions: BriefingActionItem[] = [];

  // Approvals first
  for (const r of pendingApprovals.slice(0, 3)) {
    actions.push({
      id: `approval-${r.recommendation_id}`,
      rank: actions.length + 1,
      account_id: r.account_id,
      account_name: r.account_name,
      title: `Approve "${r.recommended_action}" for ${r.account_name}`,
      rationale: r.priority_reason || r.risk_summary || r.opportunity_summary,
      category: "approval",
      est_minutes: 5,
    });
  }

  // Then escalations from recommendation deltas (action_changed)
  const escalations = recDeltas
    .filter((d) => d.kind === "action_changed")
    .slice(0, 2);
  for (const d of escalations) {
    if (actions.length >= 5) break;
    if (actions.some((a) => a.account_id === d.account_id)) continue;
    actions.push({
      id: `escalation-${d.id}`,
      rank: actions.length + 1,
      account_id: d.account_id,
      account_name: d.account_name,
      title: `Reconfirm escalation path for ${d.account_name}`,
      rationale: `Recommendation revised to "${d.current_action ?? "updated action"}".`,
      category: "escalation",
      est_minutes: 7,
    });
  }

  // Then outreach for entering-queue accounts
  const entries = recDeltas.filter((d) => d.kind === "first_seen");
  for (const d of entries) {
    if (actions.length >= 5) break;
    if (actions.some((a) => a.account_id === d.account_id)) continue;
    actions.push({
      id: `outreach-${d.id}`,
      rank: actions.length + 1,
      account_id: d.account_id,
      account_name: d.account_name,
      title: `Brief the account team on ${d.account_name}`,
      rationale: "Newly entered the priority queue — assign an owner and confirm next contact.",
      category: "outreach",
      est_minutes: 10,
    });
  }

  // Fallback: top remaining recommendations
  for (const r of topRecs) {
    if (actions.length >= 5) break;
    if (actions.some((a) => a.account_id === r.account_id)) continue;
    actions.push({
      id: `review-${r.recommendation_id}`,
      rank: actions.length + 1,
      account_id: r.account_id,
      account_name: r.account_name,
      title: `Review next-best action for ${r.account_name}`,
      rationale: r.priority_reason || "Top-of-queue recommendation.",
      category: "review",
      est_minutes: 4,
    });
  }

  const what_to_do_next: BriefingPillar = {
    headline:
      actions.length === 0
        ? "No leadership actions required this cycle."
        : `${actions.length === 1 ? "1 priority move" : `${actions.length} priority moves`} — about ${actions.reduce((s, a) => s + (a.est_minutes ?? 0), 0)} minutes of focused work.`,
    detail:
      actions.length === 0
        ? "Continue normal cadence. Reassess after the next signal cycle."
        : `Start with the highest-confidence approval, then move through escalations and new-account outreach in order.`,
    evidence_count: actions.length,
  };

  return {
    generated_at: now.toISOString(),
    greeting,
    window_label,
    urgency,
    headline,
    what_changed,
    why_it_matters,
    what_to_do_next,
    recommended_actions: actions,
    source_counts: {
      drift_events: driftEvents.length,
      recommendation_deltas: recDeltas.length,
      external_changes: extEvents.length,
      pending_approvals: pendingApprovals.length,
      accounts_in_brief: new Set([
        ...actions.map((a) => a.account_id).filter(Boolean),
        ...driftEvents.map((d) => d.account_id),
      ]).size,
    },
  };
}
