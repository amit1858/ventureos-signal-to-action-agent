// Release 2.0 — Manager AI Coach: coaching assignment lifecycle.
//
// Session/client-only state machine that tracks a coaching assignment through
// its premium lifecycle:
//
//   Assigned → Acknowledged → In progress → Completed → Manager follow-up → Closed
//
// This is a pure FRONTEND workflow layer, mirroring the established patterns in
// `@/lib/decisionLedger` and `@/lib/missionState`. It makes NO scoring / ranking
// / governance / approval decisions, never touches the Decision Ledger schema,
// the CRM contracts, or the backend. Persistence is browser localStorage only —
// nothing here is durable server-side.
//
// First-load seed: so the Follow-up Center and effectiveness views are alive on
// arrival, we seed a small deterministic set of assignments for the top coaching
// candidates at staggered stages. The seed runs once (guarded by a flag) and is
// thereafter owned by the manager's own interactions.

"use client";

import type { CoachFocus } from "./coachingModel";

export type CoachingStage =
  | "assigned"
  | "acknowledged"
  | "in_progress"
  | "completed"
  | "manager_follow_up"
  | "closed";

export const COACHING_STAGES: CoachingStage[] = [
  "assigned",
  "acknowledged",
  "in_progress",
  "completed",
  "manager_follow_up",
  "closed",
];

export const STAGE_LABEL: Record<CoachingStage, string> = {
  assigned: "Assigned",
  acknowledged: "Seller acknowledged",
  in_progress: "In progress",
  completed: "Completed",
  manager_follow_up: "Manager follow-up",
  closed: "Closed",
};

// Short label for the compact lifecycle rail.
export const STAGE_SHORT: Record<CoachingStage, string> = {
  assigned: "Assigned",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  completed: "Completed",
  manager_follow_up: "Follow-up",
  closed: "Closed",
};

export interface CoachingHistoryItem {
  stage: CoachingStage;
  at: string;
}

export interface CoachingAssignment {
  id: string;
  seller_id: string;
  seller_name: string;
  focus: CoachFocus;
  focus_label: string;
  note?: string;
  stage: CoachingStage;
  created_at: string;
  updated_at: string;
  history: CoachingHistoryItem[];
}

const STORAGE_KEY = "s2a_coaching_assignments_v1";
const SEED_FLAG_KEY = "s2a_coaching_seeded_v1";
const EVENT_NAME = "s2a:coaching:changed";

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): CoachingAssignment[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CoachingAssignment[];
  } catch {
    return [];
  }
}

function writeAll(items: CoachingAssignment[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* swallow — quota / private mode */
  }
}

function newId(): string {
  return `coach_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function listAssignments(): CoachingAssignment[] {
  return readAll().sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

export function getAssignmentForSeller(sellerId: string): CoachingAssignment | null {
  const forSeller = readAll().filter((a) => a.seller_id === sellerId);
  if (forSeller.length === 0) return null;
  // Most recent non-closed assignment, else most recent.
  const sorted = [...forSeller].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return sorted.find((a) => a.stage !== "closed") ?? sorted[0];
}

export interface AssignInput {
  seller_id: string;
  seller_name: string;
  focus: CoachFocus;
  focus_label: string;
  note?: string;
}

export function assignCoaching(input: AssignInput): CoachingAssignment {
  // Re-open / reuse an existing live assignment for the seller.
  const existing = getAssignmentForSeller(input.seller_id);
  if (existing && existing.stage !== "closed") {
    return existing;
  }
  const record: CoachingAssignment = {
    id: newId(),
    seller_id: input.seller_id,
    seller_name: input.seller_name,
    focus: input.focus,
    focus_label: input.focus_label,
    note: input.note,
    stage: "assigned",
    created_at: nowIso(),
    updated_at: nowIso(),
    history: [{ stage: "assigned", at: nowIso() }],
  };
  writeAll([...readAll(), record]);
  return record;
}

function patch(id: string, fn: (a: CoachingAssignment) => CoachingAssignment): CoachingAssignment | null {
  const all = readAll();
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const next = [...all];
  next[idx] = { ...fn(all[idx]), updated_at: nowIso() };
  writeAll(next);
  return next[idx];
}

export function stageIndex(stage: CoachingStage): number {
  return COACHING_STAGES.indexOf(stage);
}

export function setStage(id: string, stage: CoachingStage): CoachingAssignment | null {
  return patch(id, (a) => {
    if (a.stage === stage) return a;
    return {
      ...a,
      stage,
      history: [...a.history, { stage, at: nowIso() }],
    };
  });
}

/** Advance to the next lifecycle stage (no-op once Closed). */
export function advanceStage(id: string): CoachingAssignment | null {
  const all = readAll();
  const current = all.find((a) => a.id === id);
  if (!current) return null;
  const idx = stageIndex(current.stage);
  if (idx < 0 || idx >= COACHING_STAGES.length - 1) return current;
  return setStage(id, COACHING_STAGES[idx + 1]);
}

export function subscribeCoaching(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}

export function clearCoaching(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(SEED_FLAG_KEY);
  } catch {
    /* noop */
  }
  writeAll([]);
}

// -- Deterministic first-load seed -----------------------------------------
// Given the ranked coaching candidates, seed a believable, staggered queue the
// first time the manager opens the coach. Idempotent: guarded by a flag and a
// duplicate check, so it never overwrites manager-created assignments.

export interface SeedCandidate {
  seller_id: string;
  seller_name: string;
  focus: CoachFocus;
  focus_label: string;
}

// stage + age (days) for each of the first four candidates, chosen so the
// Follow-up Center shows: due today · waiting · completed yesterday · needs review.
const SEED_PLAN: Array<{ stage: CoachingStage; ageDays: number; updatedDaysAgo: number }> = [
  { stage: "in_progress", ageDays: 2, updatedDaysAgo: 0 }, // due today
  { stage: "acknowledged", ageDays: 5, updatedDaysAgo: 5 }, // waiting 5 days
  { stage: "completed", ageDays: 6, updatedDaysAgo: 1 }, // completed yesterday
  { stage: "manager_follow_up", ageDays: 8, updatedDaysAgo: 2 }, // needs manager review
];

function buildHistory(stage: CoachingStage, createdAt: string, updatedAt: string): CoachingHistoryItem[] {
  const upto = stageIndex(stage);
  const items: CoachingHistoryItem[] = [];
  for (let i = 0; i <= upto; i++) {
    // Spread intermediate stages between created and updated timestamps.
    const at = i === 0 ? createdAt : i === upto ? updatedAt : createdAt;
    items.push({ stage: COACHING_STAGES[i], at });
  }
  return items;
}

export function ensureSeed(candidates: SeedCandidate[]): void {
  if (!hasStorage()) return;
  try {
    if (window.localStorage.getItem(SEED_FLAG_KEY) === "1") return;
  } catch {
    return;
  }

  const existing = readAll();
  const seeded: CoachingAssignment[] = [];

  candidates.slice(0, SEED_PLAN.length).forEach((c, i) => {
    if (existing.some((a) => a.seller_id === c.seller_id)) return;
    const plan = SEED_PLAN[i];
    const createdAt = daysAgoIso(plan.ageDays);
    const updatedAt = daysAgoIso(plan.updatedDaysAgo);
    seeded.push({
      id: `coach_seed_${c.seller_id}`,
      seller_id: c.seller_id,
      seller_name: c.seller_name,
      focus: c.focus,
      focus_label: c.focus_label,
      stage: plan.stage,
      created_at: createdAt,
      updated_at: updatedAt,
      history: buildHistory(plan.stage, createdAt, updatedAt),
    });
  });

  try {
    window.localStorage.setItem(SEED_FLAG_KEY, "1");
  } catch {
    /* noop */
  }

  if (seeded.length > 0) {
    writeAll([...existing, ...seeded]);
  }
}
