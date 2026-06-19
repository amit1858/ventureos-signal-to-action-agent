// Decision Ledger — Phase 13
//
// Persistent record of every approval / rejection / review-request the user
// makes inside the Account Workspace, plus lifecycle state and outcome
// tracking for each recommendation.
//
// Storage today: browser localStorage (key `s2a_decision_ledger_v1`). The
// shape and the read/write API are deliberately backend-replaceable — a
// future Phase 14 can swap the persistence layer for FastAPI + SQLite
// without changing any caller.
//
// IMPORTANT: this module makes NO scoring/ranking/governance decisions. It
// records what humans decided so the system becomes auditable.

export type LifecycleState =
  | "detected"
  | "recommended"
  | "prepared"
  | "submitted"
  | "approved"
  | "rejected"
  | "executed"
  | "outcome_captured";

export const LIFECYCLE_ORDER: LifecycleState[] = [
  "detected",
  "recommended",
  "prepared",
  "submitted",
  "approved",
  "executed",
  "outcome_captured",
];

export const LIFECYCLE_LABEL: Record<LifecycleState, string> = {
  detected: "Detected",
  recommended: "Recommended",
  prepared: "Prepared",
  submitted: "Submitted for approval",
  approved: "Approved",
  rejected: "Rejected",
  executed: "Executed",
  outcome_captured: "Outcome captured",
};

export type DecisionType = "approved" | "rejected" | "review";
export type LedgerSource = "deterministic" | "ai_assisted" | "multi_agent";

export type OutcomeKind =
  | "meeting_booked"
  | "customer_contacted"
  | "renewal_risk_reduced"
  | "opportunity_created"
  | "no_response"
  | "follow_up_required";

export const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  meeting_booked: "Meeting booked",
  customer_contacted: "Customer contacted",
  renewal_risk_reduced: "Renewal risk reduced",
  opportunity_created: "Opportunity created",
  no_response: "No response",
  follow_up_required: "Follow-up required",
};

export interface LedgerEntry {
  ledger_id: string;
  recommendation_id: string;
  account_id: string;
  account_name: string;
  recommended_action: string;
  decision_type: DecisionType;
  reviewer_name: string;
  reviewer_note?: string;
  confidence: number;
  risk_level: string;
  opportunity_level: number;
  evidence_count: number;
  business_impact: string;
  governance_caveat?: string;
  source: LedgerSource;
  created_at: string;
  outcome?: OutcomeKind;
  outcome_at?: string;
  outcome_note?: string;
}

const STORAGE_KEY = "s2a_decision_ledger_v1";
const EVENT_NAME = "s2a:ledger:changed";

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): LedgerEntry[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as LedgerEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: LedgerEntry[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* swallow — quota/private-mode */
  }
}

function newId(): string {
  return `ldg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listLedger(): LedgerEntry[] {
  return readAll().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function listLedgerForAccount(accountId: string): LedgerEntry[] {
  return listLedger().filter((e) => e.account_id === accountId);
}

export function appendLedgerEntry(input: Omit<LedgerEntry, "ledger_id" | "created_at">): LedgerEntry {
  const entry: LedgerEntry = {
    ...input,
    ledger_id: newId(),
    created_at: new Date().toISOString(),
  };
  const next = [...readAll(), entry];
  writeAll(next);
  return entry;
}

export function recordOutcome(accountId: string, outcome: OutcomeKind, note?: string): boolean {
  const all = readAll();
  // Attach to the most-recent APPROVED entry for this account.
  const idx = [...all]
    .map((e, i) => ({ e, i }))
    .reverse()
    .find(({ e }) => e.account_id === accountId && e.decision_type === "approved")?.i;
  if (idx === undefined) return false;
  const next = [...all];
  next[idx] = {
    ...next[idx],
    outcome,
    outcome_at: new Date().toISOString(),
    outcome_note: note,
  };
  writeAll(next);
  return true;
}

export function subscribeLedger(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}

export function clearLedger(): void {
  writeAll([]);
}

/** Derive the lifecycle state for a given recommendation from the ledger. */
export function lifecycleFor(
  recommendationId: string,
  fallback: LifecycleState = "recommended",
): LifecycleState {
  const entries = readAll().filter((e) => e.recommendation_id === recommendationId);
  if (entries.length === 0) return fallback;
  const latest = entries[entries.length - 1];
  if (latest.outcome) return "outcome_captured";
  if (latest.decision_type === "approved") return "approved";
  if (latest.decision_type === "rejected") return "rejected";
  if (latest.decision_type === "review") return "submitted";
  return fallback;
}

export interface LedgerSummary {
  total: number;
  approved: number;
  rejected: number;
  review: number;
  awaitingApproval: number;
  approvedNotExecuted: number;
  outcomeCaptured: number;
  outcomePending: number;
}

export function summarize(allRecommendationIds: string[]): LedgerSummary {
  const entries = readAll();
  const approved = entries.filter((e) => e.decision_type === "approved");
  const rejected = entries.filter((e) => e.decision_type === "rejected");
  const review = entries.filter((e) => e.decision_type === "review");
  const withOutcome = entries.filter((e) => !!e.outcome);
  const recsWithAnyEntry = new Set(entries.map((e) => e.recommendation_id));
  const awaitingApproval = allRecommendationIds.filter((id) => !recsWithAnyEntry.has(id)).length;
  return {
    total: entries.length,
    approved: approved.length,
    rejected: rejected.length,
    review: review.length,
    awaitingApproval,
    approvedNotExecuted: approved.length - withOutcome.length,
    outcomeCaptured: withOutcome.length,
    outcomePending: approved.length - withOutcome.length,
  };
}
