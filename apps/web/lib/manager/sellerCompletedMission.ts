// Manager Coaching Curefoods Slice — seller-completed mission reconstruction
// ==========================================================================
// READ-ONLY. This module deterministically reconstructs the SAME governed
// Curefoods renewal mission the *seller* already completed in Production, so the
// Manager surface can OBSERVE it. It grants the manager no new capability:
//
//   * The manager NEVER approves — the approval captured here represents the
//     human decision the seller/owner already made on the governed mission.
//   * The manager NEVER executes or sends — the simulated actions here are the
//     seller's already-simulated receipts (sandbox only; nothing is sent).
//   * No governed fact is invented, re-ranked, or mutated: every value is the
//     deterministic output of the protected mission engine, identical to what
//     Mission Control and the Seller/Executive/Operations projections read.
//
// It reuses the sanctioned functions (`buildRenewalDemoTurn`, `captureApproval`,
// `simulateApprovedActions`, `deriveMissionView`) exactly as the canonical
// continuity eval and the offline Mission Control loader do. Pure + deterministic
// (no clock, no network): the same input always yields the same turn and view.

import type { CompletedMissionTurn } from "../missions/types";
import type { MissionView } from "../missions/missionView";
import { buildRenewalDemoTurn } from "../missions/demo";
import { captureApproval, simulateApprovedActions } from "../missions/simulation";
import { deriveMissionView } from "../missions/missionView";
import { isCompletedMissionTurn } from "../missions/types";

/** The governed mission the manager observes: the seller-completed turn plus its
 * single authoritative presentation view. */
export interface SellerCompletedMission {
  turn: CompletedMissionTurn;
  view: MissionView;
}

/** Reconstruct the seller-completed Curefoods renewal mission (read-only).
 * Deterministic: builds the governed demo turn, applies the seller/owner's
 * already-made approval, replays the already-simulated sandbox actions, and
 * derives the one authoritative `MissionView`. The manager code calls this only
 * to READ the outcome — it exposes no approval, execution, or send control. */
export function reconstructSellerCompletedMission(): SellerCompletedMission {
  const turn = buildRenewalDemoTurn();
  if (!isCompletedMissionTurn(turn)) {
    // The renewal demo is always a completed governed turn; guard defensively so
    // the manager surface never renders an inconsistent state.
    throw new Error("Curefoods renewal demo did not produce a completed governed turn");
  }

  // The human approval already captured on the governed mission (owner decision).
  const approval = captureApproval(turn, {
    outcome: "approved",
    actor: "amit",
    actorRole: "owner",
    channel: "screen",
    confirmToken: turn.approvalBinding?.actionPayloadHash ?? "",
  });

  // The already-simulated sandbox actions (receipts only — nothing was sent).
  const proposals = simulateApprovedActions(turn, approval);
  const view = deriveMissionView(turn, approval, proposals);

  return { turn, view };
}
