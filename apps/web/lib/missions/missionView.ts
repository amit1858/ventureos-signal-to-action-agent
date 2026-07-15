// Release 2.2 — Mission Control · authoritative mission view-model (F1 correction)
// ================================================================================
// ONE authoritative projection that drives EVERY Mission Control section from the
// same governed turn + captured decision. This fixes the P0 state-consistency
// defect where the header read "awaiting approval" while the outcome panel read
// "mission state: closed": the completed turn's static `outcome.state` is always
// `closed` (Python already ran the mission upstream) and its `outcome.headline`
// is always approval-oriented. The UI must NEVER render those raw fields — it must
// render THIS derived view, whose mission-state, approval, simulation, outcome and
// closure are all computed from the SAME phase, so no contradictory combination
// can appear on screen.
//
// This layer owns NO governance and re-derives no policy: it maps the phase from
// `deriveMissionPhase` onto consistent presentation state. `missionViewInconsistencies`
// exists so deterministic evals can PROVE the invariants hold for every phase.
//
// Pure module: types + plain functions only (no JSX, no clock, no network).

import { deriveMissionPhase } from "./missionStatusCopy";
import type { MissionPhase } from "./missionStatusCopy";
import type { ApprovalCapture, SimulatedActionProposal } from "./simulation";
import type { MissionTurn } from "./types";

/** The status of a governed lifecycle stage as the surfaces render it. */
export type StageState = "not_started" | "complete" | "rejected" | "revision" | "blocked";

/** The presentation approval status the surfaces render. */
export type ApprovalDisplay = "pending" | "approved" | "rejected" | "revision_requested";

/** The single authoritative presentation state for one mission turn. Every
 * Mission Control section reads from this — never from `turn.outcome.*`. */
export interface MissionView {
  phase: MissionPhase;
  /** Business mission-state label. NEVER "Complete"/"Closed" while awaiting. */
  missionStateLabel: string;
  missionStateTone: "gov" | "accent" | "risk" | "muted";
  approval: ApprovalDisplay;
  simulation: StageState;
  outcomeVerification: StageState;
  closure: StageState;
  /** True only once approved actions have actually been simulated. */
  actionsRun: boolean;
  simulatedCount: number;
  /** Outcome-panel headline (state-aware; safe to show verbatim). */
  outcomeHeadline: string;
  /** The "no action has run" guarantee copy for the outcome panel. */
  outcomeNotice: string;
}

function completedView(
  phase: MissionPhase,
  simulatedCount: number,
): MissionView {
  switch (phase) {
    case "simulated_executed":
      return {
        phase,
        missionStateLabel: "Complete",
        missionStateTone: "accent",
        approval: "approved",
        simulation: "complete",
        outcomeVerification: "complete",
        closure: "complete",
        actionsRun: true,
        simulatedCount,
        outcomeHeadline: `The renewal mission is complete. ${simulatedCount} action${
          simulatedCount === 1 ? " was" : "s were"
        } simulated; no email was sent and no CRM record was changed.`,
        outcomeNotice: "Every action ran in a controlled sandbox — nothing was sent and no record was changed.",
      };
    case "rejected":
      return {
        phase,
        missionStateLabel: "Not approved",
        missionStateTone: "risk",
        approval: "rejected",
        simulation: "not_started",
        outcomeVerification: "not_started",
        closure: "rejected",
        actionsRun: false,
        simulatedCount: 0,
        outcomeHeadline: "The proposed renewal mission was not approved.",
        outcomeNotice: "No action was taken and no receipt was produced.",
      };
    case "revision_required":
      return {
        phase,
        missionStateLabel: "Needs revision",
        missionStateTone: "gov",
        approval: "revision_requested",
        simulation: "not_started",
        outcomeVerification: "not_started",
        closure: "revision",
        actionsRun: false,
        simulatedCount: 0,
        outcomeHeadline: "The mission needs revision before it can proceed.",
        outcomeNotice: "No action was taken and no receipt was produced.",
      };
    case "closed":
      // Completed with no approval gate (governance pre-cleared). Not reached by
      // the renewal demo, which always carries a pending human gate.
      return {
        phase,
        missionStateLabel: "Complete",
        missionStateTone: "muted",
        approval: "approved",
        simulation: "not_started",
        outcomeVerification: "complete",
        closure: "complete",
        actionsRun: false,
        simulatedCount: 0,
        outcomeHeadline: "The renewal mission is complete. The governed audit trail is recorded.",
        outcomeNotice: "No human approval gate was required for this mission.",
      };
    case "awaiting_approval":
    default:
      return {
        phase: "awaiting_approval",
        missionStateLabel: "Awaiting approval",
        missionStateTone: "gov",
        approval: "pending",
        simulation: "not_started",
        outcomeVerification: "not_started",
        closure: "not_started",
        actionsRun: false,
        simulatedCount: 0,
        outcomeHeadline: "No action has run.",
        outcomeNotice: "The verified renewal mission is ready for your approval. No action has run.",
      };
  }
}

function governedView(phase: MissionPhase): MissionView {
  const label =
    phase === "blocked" ? "Blocked" : phase === "failed" ? "Failed" : phase === "rejected" ? "Not approved" : "Needs revision";
  return {
    phase,
    missionStateLabel: label,
    missionStateTone: "risk",
    approval: "pending",
    simulation: "not_started",
    outcomeVerification: "not_started",
    closure: phase === "revision_required" ? "revision" : "blocked",
    actionsRun: false,
    simulatedCount: 0,
    outcomeHeadline:
      phase === "blocked"
        ? "VentureOS cannot safely proceed with this mission."
        : phase === "failed"
          ? "The renewal mission could not be completed."
          : phase === "rejected"
            ? "The proposed renewal mission was not approved."
            : "The mission needs revision before it can proceed.",
    outcomeNotice: "No action was taken and no receipt was produced.",
  };
}

/** Derive the single authoritative presentation state for a mission turn.
 * `simulatedCount` is taken from the actual proposals when supplied so the
 * outcome copy is honest about how many actions ran. Deterministic. */
export function deriveMissionView(
  turn: MissionTurn,
  capture: ApprovalCapture | null,
  proposals: SimulatedActionProposal[] = [],
): MissionView {
  const phase = deriveMissionPhase(turn, capture);
  if (turn.status !== "completed") return governedView(phase);
  return completedView(phase, proposals.length);
}

/** Return the list of violated presentation invariants for a derived view. An
 * EMPTY list proves the view carries no contradictory state combination. Evals
 * assert this is empty for every reachable phase. */
export function missionViewInconsistencies(view: MissionView): string[] {
  const problems: string[] = [];
  const looksComplete = /complete|closed/i.test(view.missionStateLabel);

  // A pending approval must never render as run / complete / closed.
  if (view.approval === "pending") {
    if (view.actionsRun) problems.push("approval pending but actionsRun=true");
    if (view.simulation !== "not_started") problems.push("approval pending but simulation started");
    if (view.outcomeVerification !== "not_started") problems.push("approval pending but outcome verified");
    if (view.closure === "complete") problems.push("approval pending but closure complete");
    if (view.simulatedCount !== 0) problems.push("approval pending but simulatedCount>0");
    if (view.phase === "awaiting_approval" && looksComplete)
      problems.push("awaiting approval but mission-state reads complete/closed");
  }

  // Simulation can only complete after an approval.
  if (view.simulation === "complete" && view.approval !== "approved")
    problems.push("simulation complete without approval");

  // Actions can only have run after an approval + a completed simulation.
  if (view.actionsRun && (view.approval !== "approved" || view.simulation !== "complete"))
    problems.push("actionsRun without approved+simulated");

  // Rejected / revision must produce no simulation, no receipts.
  if ((view.approval === "rejected" || view.approval === "revision_requested")) {
    if (view.actionsRun) problems.push("rejected/revision but actionsRun=true");
    if (view.simulatedCount !== 0) problems.push("rejected/revision but simulatedCount>0");
    if (view.simulation === "complete") problems.push("rejected/revision but simulation complete");
  }

  // A "run" view must count at least one simulated action.
  if (view.actionsRun && view.simulatedCount < 1)
    problems.push("actionsRun but simulatedCount<1");

  return problems;
}
