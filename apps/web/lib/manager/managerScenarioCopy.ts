// Manager Coaching — bounded "Post-mission Guided Scenario" copy
// ==============================================================
// Presentation-only strings that keep the Manager surface truthful about its
// relationship to Mission Control. The Manager view renders a DETERMINISTIC
// post-completion snapshot of the canonical Curefoods mission; it does NOT read
// the live, session-local Mission Control mission state (which may still be
// awaiting approval). Centralised here so the copy is DRY and directly testable
// by the manager + integration evals — no protected engine is involved.

/** Bounded status label for the Manager route. Deliberately NOT "same live
 * state as Mission Control". */
export const MANAGER_SCENARIO_LABEL = "Post-mission Guided Scenario" as const;

/** Explicit disclaimer: Manager is a completed-mission snapshot, not live state. */
export const MANAGER_SCENARIO_DISCLAIMER =
  "This view demonstrates the manager experience after a completed simulated mission and is not reading the current browser mission state." as const;

/** Continuity label that asserts canonical identity WITHOUT implying live
 * Mission Control state equivalence. */
export const MANAGER_CONTINUITY_LABEL =
  "Same canonical mission · post-completion snapshot" as const;
