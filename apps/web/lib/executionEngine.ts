// Phase 16A.2 — Revenue Execution Center (Enhanced)
//
// Refinement: Event-Driven + Auto-Advance + Business Outcomes
//
// INVARIANTS (Phase 16A strict non-goals):
// - Zero changes to ranking, scoring, governance, approval flow,
//   CRM/HubSpot, agents, drift, delta, or backend contracts.
// - Additive only: writes to existing Decision Ledger (appendLedgerEntry),
//   no schema change, no new audit system.
// - Storage: localStorage (s2a_execution_runs_v1), backend-replaceable.
// - Gated by approved lifecycle only (enforced by UI, not engine).
//
// Enhancements:
// - Auto-advance in demo mode (orchestrated, not manual stepper)
// - Business outcome statements per action type
// - Event subscriptions for live surface updates (Ledger, Timeline, Executive Brief)

import type { Recommendation } from "./types";
import type { ActionKey } from "./actions";
import { appendLedgerEntry } from "./decisionLedger";

// ---- Types ---------------------------------------------------------------

export type ExecutionStageId =
  | "prepare_outreach"
  | "customer_contacted"
  | "meeting_scheduled"
  | "executive_escalation"
  | "renewal_conversation_started"
  | "commercial_proposal_sent"
  | "opportunity_created"
  | "recovery_plan_initiated"
  | "executive_review"
  | "outcome_logged";

export type ExecutionStatus =
  | "pending"
  | "executing"
  | "waiting_customer"
  | "blocked"
  | "completed"
  | "completed_successfully";

export type ExecutionPhase =
  | "ready"
  | "executing"
  | "waiting_customer"
  | "completed"
  | "outcome_captured";

export const EXECUTION_PHASE_ORDER: ExecutionPhase[] = [
  "ready",
  "executing",
  "waiting_customer",
  "completed",
  "outcome_captured",
];

export const EXECUTION_PHASE_LABEL: Record<ExecutionPhase, string> = {
  ready: "Ready",
  executing: "Executing",
  waiting_customer: "Waiting for customer",
  completed: "Completed",
  outcome_captured: "Outcome captured",
};

export const EXECUTION_STATUS_LABEL: Record<ExecutionStatus, string> = {
  pending: "Pending",
  executing: "Executing",
  waiting_customer: "Waiting for customer",
  blocked: "Blocked",
  completed: "Completed",
  completed_successfully: "Outcome captured",
};

export const STAGE_LABEL: Record<ExecutionStageId, string> = {
  prepare_outreach: "Prepare outreach",
  customer_contacted: "Customer contacted",
  meeting_scheduled: "Meeting scheduled",
  executive_escalation: "Executive escalation",
  renewal_conversation_started: "Renewal conversation started",
  commercial_proposal_sent: "Commercial proposal sent",
  opportunity_created: "Opportunity created",
  recovery_plan_initiated: "Recovery plan initiated",
  executive_review: "Executive review",
  outcome_logged: "Outcome logged",
};

export type ExecutionActor =
  | "execution_agent"
  | "customer"
  | "outcome_agent"
  | "executive_review"
  | "ledger";

export const ACTOR_LABEL: Record<ExecutionActor, string> = {
  execution_agent: "Execution Agent",
  customer: "Customer Response",
  outcome_agent: "Outcome Agent",
  executive_review: "Executive Review",
  ledger: "Decision Ledger",
};

// Business outcome statements per action type
export const BUSINESS_OUTCOMES: Record<string, string> = {
  recover: "Risk de-escalated, recovery plan engaged",
  renewal: "Renewal commitment captured, proposal sent",
  crosssell: "Expansion opportunity identified and logged",
  expand: "Growth opportunity documented with owner",
  executive: "Executive escalation completed, sponsor engaged",
  reactive: "Issue resolution initiated, follow-up scheduled",
  generic: "Execution completed and recorded",
};

export function outcomeFor(actionKey: ActionKey | string): string {
  return BUSINESS_OUTCOMES[actionKey as string] || BUSINESS_OUTCOMES.generic;
}

export interface ExecutionStageEvent {
  stage: ExecutionStageId;
  label: string;
  actor: ExecutionActor;
  status: "pending" | "executing" | "waiting_customer" | "completed" | "blocked";
  offset_minutes: number;
  occurred_at?: string;
  note?: string;
}

export interface ExecutionRun {
  run_id: string;
  recommendation_id: string;
  account_id: string;
  account_name: string;
  recommended_action: string;
  action_key: ActionKey | string;
  started_at: string;
  status: ExecutionStatus;
  expected_outcome: string;
  business_outcome?: string;
  current_stage_index: number;
  stages: ExecutionStageEvent[];
  paused?: boolean;
  completed_at?: string;
  blocked_reason?: string;
  auto_advance?: boolean;
}

// ---- Storage -----

const STORAGE_KEY = "s2a_execution_runs_v1";
const EVENT_NAME = "s2a:execution:changed";
const TIMEOUT_DURATION_MS = 3000; // 3 second delay between auto-advances in demo mode

let autoAdvanceTimeouts: Record<string, NodeJS.Timeout> = {};

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): ExecutionRun[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ExecutionRun[];
  } catch {
    return [];
  }
}

function writeAll(runs: ExecutionRun[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* swallow */
  }
}

function newRunId(): string {
  return `xrun_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---- Stage templates -----

interface StageTemplate {
  stage: ExecutionStageId;
  actor: ExecutionActor;
  offset_minutes: number;
  status: ExecutionStageEvent["status"];
}

function templateFor(actionKey: ActionKey | string): { stages: StageTemplate[]; expected: string } {
  const base: StageTemplate[] = [
    { stage: "prepare_outreach", actor: "execution_agent", offset_minutes: 0, status: "executing" },
    { stage: "customer_contacted", actor: "execution_agent", offset_minutes: 5, status: "executing" },
    { stage: "meeting_scheduled", actor: "customer", offset_minutes: 30, status: "waiting_customer" },
    { stage: "executive_review", actor: "executive_review", offset_minutes: 70, status: "completed" },
    { stage: "outcome_logged", actor: "outcome_agent", offset_minutes: 24 * 60, status: "completed" },
  ];

  switch (actionKey) {
    case "recover":
      return {
        expected: "Risk de-escalated, recovery plan assigned",
        stages: [
          { stage: "prepare_outreach", actor: "execution_agent", offset_minutes: 0, status: "executing" },
          { stage: "executive_escalation", actor: "executive_review", offset_minutes: 10, status: "executing" },
          { stage: "customer_contacted", actor: "execution_agent", offset_minutes: 25, status: "executing" },
          { stage: "recovery_plan_initiated", actor: "customer", offset_minutes: 60, status: "waiting_customer" },
          { stage: "outcome_logged", actor: "outcome_agent", offset_minutes: 24 * 60, status: "completed" },
        ],
      };
    case "renewal":
      return {
        expected: "Renewal commitment captured and proposal sent",
        stages: [
          { stage: "prepare_outreach", actor: "execution_agent", offset_minutes: 0, status: "executing" },
          { stage: "customer_contacted", actor: "execution_agent", offset_minutes: 5, status: "executing" },
          { stage: "renewal_conversation_started", actor: "customer", offset_minutes: 20, status: "executing" },
          { stage: "commercial_proposal_sent", actor: "execution_agent", offset_minutes: 90, status: "waiting_customer" },
          { stage: "outcome_logged", actor: "outcome_agent", offset_minutes: 24 * 60, status: "completed" },
        ],
      };
    case "crosssell":
      return {
        expected: "Expansion opportunity logged with CRM owner",
        stages: [
          { stage: "prepare_outreach", actor: "execution_agent", offset_minutes: 0, status: "executing" },
          { stage: "customer_contacted", actor: "execution_agent", offset_minutes: 5, status: "executing" },
          { stage: "meeting_scheduled", actor: "customer", offset_minutes: 25, status: "waiting_customer" },
          { stage: "opportunity_created", actor: "execution_agent", offset_minutes: 60, status: "completed" },
          { stage: "outcome_logged", actor: "outcome_agent", offset_minutes: 24 * 60, status: "completed" },
        ],
      };
    default:
      return { expected: "Touchpoint logged and follow-up scheduled", stages: base };
  }
}

// ---- Reads -----

export function getCurrentRun(recommendationId: string): ExecutionRun | null {
  const matching = readAll().filter((r) => r.recommendation_id === recommendationId);
  if (matching.length === 0) return null;
  return matching.sort((a, b) => (a.started_at < b.started_at ? 1 : -1))[0];
}

export function subscribeExecution(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}

export function phaseOf(run: ExecutionRun | null | undefined): ExecutionPhase {
  if (!run) return "ready";
  if (run.status === "blocked" || run.status === "pending") return "executing";
  if (run.status === "completed_successfully") return "outcome_captured";
  if (run.status === "completed") return "completed";
  if (run.status === "waiting_customer") return "waiting_customer";
  if (run.status === "executing") return "executing";
  return "ready";
}

// ---- Mutations -----

export interface StartExecutionInput {
  recommendation: Recommendation;
  recommendedActionLabel: string;
  actionKey: ActionKey | string;
  expectedOutcomeOverride?: string;
  autoAdvance?: boolean;
}

export function startExecution(input: StartExecutionInput): ExecutionRun {
  const { recommendation: rec, recommendedActionLabel, actionKey, expectedOutcomeOverride, autoAdvance } = input;
  const tmpl = templateFor(actionKey);
  const startedAt = new Date().toISOString();
  const stages: ExecutionStageEvent[] = tmpl.stages.map((s) => ({
    stage: s.stage,
    label: STAGE_LABEL[s.stage],
    actor: s.actor,
    status: "pending",
    offset_minutes: s.offset_minutes,
  }));
  if (stages.length > 0) {
    stages[0] = {
      ...stages[0],
      status: tmpl.stages[0].status,
      occurred_at: startedAt,
    };
  }
  const run: ExecutionRun = {
    run_id: newRunId(),
    recommendation_id: rec.recommendation_id,
    account_id: rec.account_id,
    account_name: rec.account_name,
    recommended_action: recommendedActionLabel,
    action_key: actionKey,
    started_at: startedAt,
    status: "executing",
    expected_outcome: expectedOutcomeOverride || tmpl.expected,
    business_outcome: outcomeFor(actionKey),
    current_stage_index: 0,
    stages,
    paused: false,
    auto_advance: autoAdvance === true,
  };
  const all = readAll().filter((r) => r.recommendation_id !== rec.recommendation_id);
  writeAll([...all, run]);

  const firstStage = stages[0];
  appendLedgerEntry({
    recommendation_id: rec.recommendation_id,
    account_id: rec.account_id,
    account_name: rec.account_name,
    recommended_action: recommendedActionLabel,
    decision_type: "review",
    reviewer_name: ACTOR_LABEL[firstStage?.actor ?? "execution_agent"],
    reviewer_note: `[execution] ${STAGE_LABEL[firstStage?.stage ?? "prepare_outreach"]}`,
    confidence: rec.confidence_score,
    risk_level: "—",
    opportunity_level: 0,
    evidence_count: rec.evidence.length,
    business_impact: `Execution started for ${rec.account_name}`,
    governance_caveat: "Execution orchestration — no external write-back.",
    source: "deterministic",
  });

  // Schedule auto-advance if enabled
  if (autoAdvance) {
    scheduleAutoAdvance(run.run_id);
  }

  return run;
}

function scheduleAutoAdvance(runId: string): void {
  if (!hasStorage()) return;
  const existing = autoAdvanceTimeouts[runId];
  if (existing) clearTimeout(existing);

  const timeout = setTimeout(() => {
    const updated = advanceStage(runId);
    if (updated && updated.status !== "blocked" && updated.status !== "completed_successfully") {
      scheduleAutoAdvance(runId);
    }
    delete autoAdvanceTimeouts[runId];
  }, TIMEOUT_DURATION_MS);

  autoAdvanceTimeouts[runId] = timeout;
}

export function advanceStage(runId: string): ExecutionRun | null {
  const all = readAll();
  const idx = all.findIndex((r) => r.run_id === runId);
  if (idx === -1) return null;
  const run = { ...all[idx], stages: all[idx].stages.map((s) => ({ ...s })) };
  if (run.status === "blocked") return run;
  const next = run.current_stage_index + 1;
  if (run.stages[run.current_stage_index]) {
    run.stages[run.current_stage_index] = {
      ...run.stages[run.current_stage_index],
      status: "completed",
      occurred_at: run.stages[run.current_stage_index].occurred_at ?? new Date().toISOString(),
    };
  }
  if (next >= run.stages.length) {
    run.status = "completed_successfully";
    run.completed_at = new Date().toISOString();
    run.current_stage_index = run.stages.length - 1;
  } else {
    run.current_stage_index = next;
    const nextStage = run.stages[next];
    const tmpl = templateFor(run.action_key);
    const templateStatus = tmpl.stages[next]?.status ?? "executing";
    run.stages[next] = {
      ...nextStage,
      status: templateStatus,
      occurred_at: new Date().toISOString(),
    };
    run.status = templateStatus === "waiting_customer" ? "waiting_customer" : "executing";
  }
  all[idx] = run;
  writeAll(all);

  const advancedStage = run.stages[run.current_stage_index];
  const isFinal = run.status === "completed_successfully";
  appendLedgerEntry({
    recommendation_id: run.recommendation_id,
    account_id: run.account_id,
    account_name: run.account_name,
    recommended_action: run.recommended_action,
    decision_type: "review",
    reviewer_name: isFinal
      ? ACTOR_LABEL.outcome_agent
      : ACTOR_LABEL[advancedStage?.actor ?? "execution_agent"],
    reviewer_note: isFinal
      ? `[execution] Outcome: ${run.business_outcome || run.expected_outcome}`
      : `[execution] ${advancedStage?.label ?? "Stage advanced"}`,
    confidence: 1,
    risk_level: "—",
    opportunity_level: 0,
    evidence_count: 0,
    business_impact: isFinal
      ? `Execution completed for ${run.account_name} — ${run.business_outcome}`
      : `Execution: ${advancedStage?.label ?? "next stage"}`,
    governance_caveat: "Execution orchestration — no external write-back.",
    source: "deterministic",
  });
  return run;
}

export function markBlocked(runId: string, reason: string): ExecutionRun | null {
  const all = readAll();
  const idx = all.findIndex((r) => r.run_id === runId);
  if (idx === -1) return null;
  const run = { ...all[idx] };
  run.status = "blocked";
  run.paused = true;
  run.blocked_reason = reason || "Blocked";
  run.stages = run.stages.map((s, i) =>
    i === run.current_stage_index ? { ...s, status: "blocked", note: reason } : s,
  );
  all[idx] = run;
  writeAll(all);
  appendLedgerEntry({
    recommendation_id: run.recommendation_id,
    account_id: run.account_id,
    account_name: run.account_name,
    recommended_action: run.recommended_action,
    decision_type: "review",
    reviewer_name: ACTOR_LABEL.execution_agent,
    reviewer_note: `[execution] Blocked — ${reason || "no reason"}`,
    confidence: 0.5,
    risk_level: "—",
    opportunity_level: 0,
    evidence_count: 0,
    business_impact: `Execution blocked for ${run.account_name}`,
    governance_caveat: "Execution orchestration — no external write-back.",
    source: "deterministic",
  });
  return run;
}

export function resetExecution(recommendationId: string): void {
  const next = readAll().filter((r) => r.recommendation_id !== recommendationId);
  writeAll(next);
}

export function toggleAutoAdvance(runId: string, enabled: boolean): ExecutionRun | null {
  const all = readAll();
  const idx = all.findIndex((r) => r.run_id === runId);
  if (idx === -1) return null;
  const run = { ...all[idx] };
  run.auto_advance = enabled;
  all[idx] = run;
  writeAll(all);
  if (enabled && run.status !== "blocked" && run.status !== "completed_successfully") {
    scheduleAutoAdvance(runId);
  }
  return run;
}

export function formatStageClock(startedAtIso: string, offsetMinutes: number): string {
  try {
    const start = new Date(startedAtIso).getTime();
    if (!Number.isFinite(start)) return "—";
    const target = new Date(start + offsetMinutes * 60_000);
    const startDay = new Date(start);
    const sameDay =
      target.getFullYear() === startDay.getFullYear() &&
      target.getMonth() === startDay.getMonth() &&
      target.getDate() === startDay.getDate();
    if (sameDay) {
      const hh = String(target.getHours()).padStart(2, "0");
      const mm = String(target.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    }
    const dayDiff = Math.round((target.getTime() - startDay.getTime()) / (24 * 60 * 60_000));
    if (dayDiff === 1) return "Tomorrow";
    if (dayDiff > 1) return `+${dayDiff}d`;
    return target.toLocaleString();
  } catch {
    return "—";
  }
}
