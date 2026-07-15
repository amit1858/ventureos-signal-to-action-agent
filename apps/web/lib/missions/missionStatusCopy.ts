// Release 2.2 — Mission Control · state-aware mission copy (F1 correction)
// =======================================================================
// Deterministic, presentation-only derivation of the CURRENT mission phase and
// its human copy. This fixes stale header language: the completed turn's
// `outcome.headline` is always approval-oriented ("… is ready for your
// approval"), so once a human approves (and the sandbox simulates the action) or
// rejects the mission, the header must reflect the NEW state — not the original
// pre-approval prompt.
//
// This layer owns NO governance: it reads the governed turn and the captured
// human decision and maps them to a phase + copy. It never re-decides anything,
// never calls a model, and is pure (same inputs -> same copy).

import type { ApprovalCapture } from "./simulation";
import type { MissionTurn } from "./types";

/** The presentation phase a mission is currently in, from a governed turn plus an
 * optional captured human decision. */
export type MissionPhase =
  | "awaiting_approval"
  | "simulated_executed"
  | "closed"
  | "blocked"
  | "rejected"
  | "revision_required"
  | "failed";

/** Human copy for a mission phase. `label` is a short badge; `headline` is the
 * one-line Mission Control header subtitle; `tone` guides styling only. */
export interface MissionPhaseCopy {
  phase: MissionPhase;
  label: string;
  headline: string;
  tone: "gov" | "accent" | "risk" | "muted";
}

/** Derive the current mission phase from the governed turn and the captured human
 * decision. Governed (non-completed) turns map straight to their status; a
 * completed turn's phase depends on whether a human has approved, rejected, or
 * requested revision — and, before any decision, on whether an approval gate is
 * still pending. Deterministic; no clock, no model. */
export function deriveMissionPhase(
  turn: MissionTurn,
  capture: ApprovalCapture | null,
): MissionPhase {
  if (turn.status !== "completed") {
    // "blocked" | "rejected" | "revision_required" | "failed"
    return turn.status;
  }
  if (capture) {
    if (capture.outcome === "approved") return "simulated_executed";
    if (capture.outcome === "rejected") return "rejected";
    return "revision_required"; // revision_required -> back to a pending gate
  }
  if (turn.approvalState === "pending") return "awaiting_approval";
  return "closed";
}

const PHASE_COPY: Record<MissionPhase, Omit<MissionPhaseCopy, "phase">> = {
  awaiting_approval: {
    label: "Awaiting approval",
    headline: "The verified renewal mission is ready for your approval. No action has run.",
    tone: "gov",
  },
  simulated_executed: {
    label: "Complete",
    headline:
      "Your approved renewal actions were simulated. The mission is complete — no email was sent and no CRM record was changed.",
    tone: "accent",
  },
  closed: {
    label: "Closed",
    headline: "The renewal mission is complete. The governed audit trail is recorded.",
    tone: "muted",
  },
  blocked: {
    label: "Blocked",
    headline: "VentureOS cannot safely proceed with this mission.",
    tone: "risk",
  },
  rejected: {
    label: "Not approved",
    headline: "The proposed renewal mission was not approved.",
    tone: "risk",
  },
  revision_required: {
    label: "Revision requested",
    headline: "The mission needs revision before it can proceed.",
    tone: "gov",
  },
  failed: {
    label: "Failed",
    headline: "The renewal mission could not be completed.",
    tone: "risk",
  },
};

/** The human copy for a mission phase (deterministic, no interpolation). */
export function missionPhaseNarrative(phase: MissionPhase): MissionPhaseCopy {
  return { phase, ...PHASE_COPY[phase] };
}

/** Convenience: derive the phase and its copy in one call. */
export function missionStatusCopy(
  turn: MissionTurn,
  capture: ApprovalCapture | null,
): MissionPhaseCopy {
  return missionPhaseNarrative(deriveMissionPhase(turn, capture));
}
