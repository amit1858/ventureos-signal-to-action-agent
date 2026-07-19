// Manager Coaching Curefoods Slice — simulated manager review state
// =================================================================
// A minimal, CLIENT-ONLY state machine for the manager's review of the governed
// Curefoods renewal mission. It is SIMULATED presentation state only:
//
//   not_reviewed  ->  reviewed  ->  simulated_intervention_assigned
//
// Hard rules (enforced by evals + comments):
//   * No seeded assignments, no fabricated historical timeline.
//   * No automatic completion, no coaching-effectiveness calculation.
//   * No seller notification, no backend persistence.
//   * NEVER mutates the governed mission, approval, simulation, audit, or ledger.
//   * Every stored value is labelled simulated.
//
// Persistence: browser localStorage under a single namespaced key:
//   ventureos_manager_coaching_curefoods_v1
// (documented here and asserted in `managerCoaching.eval.ts`).

"use client";

/** The simulated manager review status. */
export type ManagerCoachingStatus =
  | "not_reviewed"
  | "reviewed"
  | "simulated_intervention_assigned";

/** The namespaced localStorage key for the simulated manager state. */
export const MANAGER_COACHING_STORAGE_KEY =
  "ventureos_manager_coaching_curefoods_v1";

/** Event dispatched on same-tab changes so the surface can re-render. */
const EVENT_NAME = "ventureos:manager-coaching:changed";

/** The persisted shape. `simulated` is always true and is written to storage so
 * the record is self-describing and can never be mistaken for a real outcome. */
export interface ManagerCoachingState {
  status: ManagerCoachingStatus;
  /** Always true — this is simulated presentation state, not a real action. */
  simulated: true;
  /** ISO timestamp of the last manager interaction (presentation only). */
  updatedAt: string;
}

export const DEFAULT_MANAGER_COACHING_STATE: ManagerCoachingState = Object.freeze({
  status: "not_reviewed",
  simulated: true,
  updatedAt: "",
});

function hasStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

/** Read the current simulated manager state. Defaults to `not_reviewed` — there
 * is NO seed, so a fresh manager always starts un-reviewed. */
export function loadManagerCoachingState(): ManagerCoachingState {
  if (!hasStorage()) return DEFAULT_MANAGER_COACHING_STATE;
  try {
    const raw = window.localStorage.getItem(MANAGER_COACHING_STORAGE_KEY);
    if (!raw) return DEFAULT_MANAGER_COACHING_STATE;
    const parsed = JSON.parse(raw) as Partial<ManagerCoachingState>;
    const status = parsed.status;
    if (
      status === "not_reviewed" ||
      status === "reviewed" ||
      status === "simulated_intervention_assigned"
    ) {
      return { status, simulated: true, updatedAt: parsed.updatedAt ?? "" };
    }
    return DEFAULT_MANAGER_COACHING_STATE;
  } catch {
    return DEFAULT_MANAGER_COACHING_STATE;
  }
}

function write(status: ManagerCoachingStatus): ManagerCoachingState {
  const next: ManagerCoachingState = {
    status,
    simulated: true,
    updatedAt: new Date().toISOString(),
  };
  if (hasStorage()) {
    try {
      window.localStorage.setItem(
        MANAGER_COACHING_STORAGE_KEY,
        JSON.stringify(next),
      );
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    } catch {
      /* swallow — quota / private mode */
    }
  }
  return next;
}

/** Manager marks the coaching guidance as reviewed (simulated). */
export function markReviewed(): ManagerCoachingState {
  return write("reviewed");
}

/** Manager assigns a SIMULATED coaching intervention. This sends no
 * notification, changes no CRM record, and does not touch the mission. */
export function assignSimulatedIntervention(): ManagerCoachingState {
  return write("simulated_intervention_assigned");
}

/** Reset back to not_reviewed (presentation only). */
export function resetManagerCoachingState(): ManagerCoachingState {
  return write("not_reviewed");
}

/** Subscribe to same-tab + cross-tab changes. Returns an unsubscribe fn. */
export function subscribeManagerCoaching(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}
