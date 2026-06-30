// Release 1.4B — Seller Mission Control state.
//
// Session-only state machine that tracks a seller's progress through a guided
// mission for one account: Review Account → Review Evidence → Prepare Outreach
// → Draft CRM Note → Submit for Approval → Execute Action → Capture Outcome.
//
// This module is a pure FRONTEND workflow layer. It records where a seller is in
// a guided flow so the UI can guide them and so a FUTURE manager view can report
// adoption (missions started/completed, drop-off step, pending approvals,
// outcomes captured, accounts untouched, seller follow-through).
//
// IMPORTANT — it makes NO scoring/ranking/governance/approval decisions and never
// touches the Decision Ledger schema, CRM contracts, or the backend. The real
// approval write + outcome write are delegated to `@/lib/decisionLedger`, and the
// real execution simulation to `@/lib/executionEngine`. This file only remembers
// guided-flow position + lightweight session metrics.
//
// Storage: sessionStorage (per-tab session). The spec calls for "local/session
// only … no backend persistence", so nothing here is durable across sessions.

"use client";

export type MissionStepId =
  | "review_account"
  | "review_evidence"
  | "prepare_outreach"
  | "draft_crm"
  | "submit_approval"
  | "execute_action"
  | "capture_outcome";

export const MISSION_STEPS: MissionStepId[] = [
  "review_account",
  "review_evidence",
  "prepare_outreach",
  "draft_crm",
  "submit_approval",
  "execute_action",
  "capture_outcome",
];

export const MISSION_STEP_LABEL: Record<MissionStepId, string> = {
  review_account: "Review account",
  review_evidence: "Review evidence",
  prepare_outreach: "Prepare outreach",
  draft_crm: "Draft CRM note",
  submit_approval: "Submit for approval",
  execute_action: "Execute action",
  capture_outcome: "Capture outcome",
};

// Short label used in the compact stepper rail.
export const MISSION_STEP_SHORT: Record<MissionStepId, string> = {
  review_account: "Account",
  review_evidence: "Evidence",
  prepare_outreach: "Outreach",
  draft_crm: "CRM note",
  submit_approval: "Approval",
  execute_action: "Execute",
  capture_outcome: "Outcome",
};

// The question each step answers — surfaced to keep the seller oriented.
export const MISSION_STEP_QUESTION: Record<MissionStepId, string> = {
  review_account: "Why am I starting here?",
  review_evidence: "Can I trust this recommendation?",
  prepare_outreach: "What should I say?",
  draft_crm: "What should I record?",
  submit_approval: "What needs human approval?",
  execute_action: "What happens now?",
  capture_outcome: "What did we learn?",
};

// Why this step matters — the "why" the seller always wants visible.
export const MISSION_STEP_WHY: Record<MissionStepId, string> = {
  review_account:
    "Grounds the mission in the recommendation, risk, opportunity, and confidence before any action.",
  review_evidence:
    "Confirms the signals, sources, and strength behind the recommendation so you act with confidence.",
  prepare_outreach:
    "Turns the recommendation into a customer-specific conversation you can run today.",
  draft_crm:
    "Captures a clean, ready-to-paste record so the account history and next step stay current.",
  submit_approval:
    "Routes the action through the existing governance lifecycle before anything is executed.",
  execute_action:
    "Hands off into the existing Revenue Execution Center — no execution logic is duplicated.",
  capture_outcome:
    "Closes the loop so the Decision Ledger reflects what actually happened and the system learns.",
};

export type MissionStatus = "active" | "completed" | "abandoned";

export interface MissionRecord {
  mission_id: string;
  account_id: string;
  recommendation_id: string;
  account_name: string;
  started_at: string;
  last_active_at: string;
  completed_at?: string;
  current_step: MissionStepId;
  // Highest step index the seller has reached (for stepper gating + drop-off).
  furthest_step_index: number;
  completed_steps: MissionStepId[];
  status: MissionStatus;
  // Lightweight flags for the (future) manager view. Derived from the seller's
  // own actions inside the guided flow — NOT a parallel governance state.
  approval_submitted: boolean;
  approval_resolved: boolean;
  outcome_captured: boolean;
  estimated_minutes?: number;
}

const STORAGE_KEY = "s2a_seller_missions_v1";
const REQUEST_KEY = "s2a_seller_mission_request_v1";
const EVENT_NAME = "s2a:missions:changed";
const REQUEST_EVENT = "s2a:mission:request";

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function readAll(): MissionRecord[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as MissionRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: MissionRecord[]): void {
  if (!hasStorage()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* swallow — quota / private mode */
  }
}

function newId(): string {
  return `msn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function listMissions(): MissionRecord[] {
  return readAll().sort((a, b) => (a.last_active_at < b.last_active_at ? 1 : -1));
}

export function getMissionForAccount(accountId: string): MissionRecord | null {
  // Latest non-abandoned mission for the account, else latest of any status.
  const forAccount = readAll().filter((m) => m.account_id === accountId);
  if (forAccount.length === 0) return null;
  const sorted = [...forAccount].sort((a, b) => (a.last_active_at < b.last_active_at ? 1 : -1));
  return sorted.find((m) => m.status !== "abandoned") ?? sorted[0];
}

export interface StartMissionInput {
  account_id: string;
  recommendation_id: string;
  account_name: string;
  estimated_minutes?: number;
}

/**
 * Begin (or resume) a mission for an account. If an active mission already
 * exists it is returned untouched so progress is never lost on re-entry.
 */
export function startMission(input: StartMissionInput): MissionRecord {
  const existing = getMissionForAccount(input.account_id);
  if (existing && existing.status === "active") {
    return touchMission(existing.mission_id) ?? existing;
  }
  const record: MissionRecord = {
    mission_id: newId(),
    account_id: input.account_id,
    recommendation_id: input.recommendation_id,
    account_name: input.account_name,
    started_at: nowIso(),
    last_active_at: nowIso(),
    current_step: "review_account",
    furthest_step_index: 0,
    completed_steps: [],
    status: "active",
    approval_submitted: false,
    approval_resolved: false,
    outcome_captured: false,
    estimated_minutes: input.estimated_minutes,
  };
  writeAll([...readAll(), record]);
  return record;
}

function patch(missionId: string, fn: (m: MissionRecord) => MissionRecord): MissionRecord | null {
  const all = readAll();
  const idx = all.findIndex((m) => m.mission_id === missionId);
  if (idx === -1) return null;
  const next = [...all];
  next[idx] = { ...fn(all[idx]), last_active_at: nowIso() };
  writeAll(next);
  return next[idx];
}

export function touchMission(missionId: string): MissionRecord | null {
  return patch(missionId, (m) => m);
}

export function setMissionStep(missionId: string, step: MissionStepId): MissionRecord | null {
  const stepIdx = MISSION_STEPS.indexOf(step);
  return patch(missionId, (m) => ({
    ...m,
    current_step: step,
    furthest_step_index: Math.max(m.furthest_step_index, stepIdx),
  }));
}

export function completeMissionStep(missionId: string, step: MissionStepId): MissionRecord | null {
  return patch(missionId, (m) => ({
    ...m,
    completed_steps: m.completed_steps.includes(step)
      ? m.completed_steps
      : [...m.completed_steps, step],
  }));
}

export function markApprovalSubmitted(missionId: string): MissionRecord | null {
  return patch(missionId, (m) => ({ ...m, approval_submitted: true }));
}

export function markApprovalResolved(missionId: string): MissionRecord | null {
  return patch(missionId, (m) => ({ ...m, approval_submitted: true, approval_resolved: true }));
}

export function markOutcomeCaptured(missionId: string): MissionRecord | null {
  return patch(missionId, (m) => ({ ...m, outcome_captured: true }));
}

export function completeMission(missionId: string): MissionRecord | null {
  return patch(missionId, (m) => ({
    ...m,
    status: "completed",
    completed_at: nowIso(),
    completed_steps: Array.from(new Set([...m.completed_steps, ...MISSION_STEPS])),
    furthest_step_index: MISSION_STEPS.length - 1,
  }));
}

export function abandonMission(missionId: string): MissionRecord | null {
  return patch(missionId, (m) =>
    m.status === "completed" ? m : { ...m, status: "abandoned" },
  );
}

export function subscribeMissions(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}

// -- Session metrics (lightweight; powers the mission HUD + future manager view) --

export interface MissionMetrics {
  started: number;
  completed: number;
  active: number;
  abandoned: number;
  approvalsPending: number;
  outcomesCaptured: number;
  // Drop-off = the step where the most active (non-completed) missions are sitting.
  dropOffStep: MissionStepId | null;
}

export function missionMetrics(): MissionMetrics {
  const all = readAll();
  const active = all.filter((m) => m.status === "active");
  const dropCounts = new Map<MissionStepId, number>();
  active.forEach((m) => dropCounts.set(m.current_step, (dropCounts.get(m.current_step) ?? 0) + 1));
  let dropOffStep: MissionStepId | null = null;
  let dropMax = 0;
  dropCounts.forEach((count, step) => {
    if (count > dropMax) {
      dropMax = count;
      dropOffStep = step;
    }
  });
  return {
    started: all.length,
    completed: all.filter((m) => m.status === "completed").length,
    active: active.length,
    abandoned: all.filter((m) => m.status === "abandoned").length,
    approvalsPending: all.filter((m) => m.approval_submitted && !m.approval_resolved).length,
    outcomesCaptured: all.filter((m) => m.outcome_captured).length,
    dropOffStep,
  };
}

// -- Launch handshake -------------------------------------------------------
// The work-queue row and the Action Hero can request a mission for an account.
// Because selecting an account re-mounts the workspace cockpit asynchronously,
// the request is parked in sessionStorage and consumed once the cockpit for
// that account renders. A custom event lets an already-mounted cockpit react
// immediately.

export function requestMission(accountId: string): void {
  if (!hasStorage()) return;
  try {
    window.sessionStorage.setItem(REQUEST_KEY, accountId);
    window.dispatchEvent(new CustomEvent(REQUEST_EVENT, { detail: { accountId } }));
  } catch {
    /* noop */
  }
}

/** Returns true (and clears the request) if a mission was requested for this account. */
export function consumeMissionRequest(accountId: string): boolean {
  if (!hasStorage()) return false;
  try {
    const pending = window.sessionStorage.getItem(REQUEST_KEY);
    if (pending && pending === accountId) {
      window.sessionStorage.removeItem(REQUEST_KEY);
      return true;
    }
  } catch {
    /* noop */
  }
  return false;
}

export function subscribeMissionRequests(cb: (accountId: string) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as { accountId?: string } | undefined;
    if (detail?.accountId) cb(detail.accountId);
  };
  window.addEventListener(REQUEST_EVENT, handler);
  return () => window.removeEventListener(REQUEST_EVENT, handler);
}
