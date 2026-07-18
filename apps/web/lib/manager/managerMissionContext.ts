// Manager Coaching Curefoods Slice — read-only ManagerMissionContext
// ==================================================================
// A pure, presentation-safe projection of the SAME governed Curefoods renewal
// mission through a Manager lens. It answers "where should I intervene?" using
// ONLY facts the protected mission engine already produced — it invents no
// seller, no revenue, no adoption, no effectiveness, and no customer response.
//
// Explicit non-goals (enforced by evals):
//   * No `sellerId` / `managerId` — there is no seller/manager entity in the
//     product; the labels here are presentation-only demo context.
//   * No revenue impact, adoption uplift, coaching effectiveness, risk reduction,
//     or customer-response claim.
//   * No mutation of the mission, approval, simulation, audit, or ledger.
//
// Pure module: types + plain functions only (no JSX, clock, network, storage).

import type { CompletedMissionTurn } from "../missions/types";
import type { MissionApprovalState } from "../missions/types";
import type { MissionView } from "../missions/missionView";
import { projectGovernedOutcome } from "../demo/missionProjection";

// -- Fixed, presentation-only labels ----------------------------------------
// These are demo context, NOT identities. They are never persisted, never used
// as a key other surfaces trust, and never presented as CRM-backed.
export const MANAGER_SELLER_LABEL = "Assigned seller" as const;
export const MANAGER_LABEL = "Sales Manager" as const;

/** How the seller "identity" is sourced. Always presentation-only in this slice:
 * there is no seller entity, id, or CRM record behind the label. */
export type SellerIdentityType = "presentation_only";

/** The single coaching focus this slice supports (one governed mission). */
export type CoachingFocus = "renewal_recovery";

/** The client-only manager review status. Mirrors the localStorage state model;
 * carried on the context so the surface renders one coherent object. */
export type CoachingStatus =
  | "not_reviewed"
  | "reviewed"
  | "simulated_intervention_assigned";

/** The read-only Manager projection of the governed Curefoods renewal mission.
 * Every field is either an existing governed fact (carried verbatim) or a
 * presentation-only demo label — never a new business claim. */
export interface ManagerMissionContext {
  /** Existing — governed canonical account id. */
  accountId: string;
  /** Existing — governed canonical account name. */
  accountName: string;
  /** Existing — governed mission id. */
  missionId: string;
  /** Existing — governed recommendation id. */
  recommendationId: string;
  /** Existing — deterministically selected mission template. */
  selectedTemplateId: string;
  /** Existing — presentation mission-state label from the authoritative view. */
  missionState: string;
  /** Existing — presentation approval state on the completed turn. */
  approvalState: MissionApprovalState;
  /** Existing — number of already-simulated sandbox actions (receipts only). */
  simulatedActionCount: number;
  /** Existing (verbatim) — governed SYSTEM outcome. */
  governedSystemOutcome: string;
  /** Existing (verbatim) — governed BUSINESS outcome. */
  governedBusinessOutcome: string;
  /** Existing — mission audit reference (projection only). */
  auditRef: string;
  /** Existing — reference-only evidence record ids backing the mission. */
  evidenceRefs: string[];
  /** Presentation-only demo label. */
  sellerLabel: typeof MANAGER_SELLER_LABEL;
  /** Presentation-only classification of the seller label. */
  sellerIdentityType: SellerIdentityType;
  /** Presentation-only demo label. */
  managerLabel: typeof MANAGER_LABEL;
  /** Derived — claim-safe reasons to coach, from existing evidence + state. */
  coachingNeedReason: readonly string[];
  /** Derived — fixed for the single governed renewal mission. */
  coachingFocus: CoachingFocus;
  /** Client-only manager review status (defaults to not_reviewed). */
  coachingStatus: CoachingStatus;
}

/** Build the read-only Manager mission context from the seller-completed turn +
 * authoritative view. Deterministic. Carries the System/Business outcomes
 * VERBATIM from `projectGovernedOutcome`; never rewrites or reinterprets them. */
export function buildManagerMissionContext(
  turn: CompletedMissionTurn,
  view: MissionView,
  coachingStatus: CoachingStatus = "not_reviewed",
): ManagerMissionContext {
  const outcome = projectGovernedOutcome(view);

  // Reasons to coach — derived ONLY from existing mission facts. Claim-safe:
  // they describe preparation and pending state, never blame, revenue, or a
  // predicted customer outcome. The last two mirror the governed outcome exactly.
  const coachingNeedReason: readonly string[] = Object.freeze([
    "Renewal timeline requires preparation before the renewal decision.",
    "Usage trend needs discussion with the assigned seller.",
    outcome.systemOutcome, // "Governed work prepared successfully." (verbatim)
    outcome.businessOutcome, // "Awaiting external response." (verbatim)
  ]);

  return {
    accountId: turn.account.ventureOsId,
    accountName: turn.account.canonicalName,
    missionId: turn.missionId,
    recommendationId: turn.recommendation.recommendationId,
    selectedTemplateId: turn.selectedTemplateId,
    missionState: view.missionStateLabel,
    approvalState: turn.approvalState,
    simulatedActionCount: view.simulatedCount,
    governedSystemOutcome: outcome.systemOutcome,
    governedBusinessOutcome: outcome.businessOutcome,
    auditRef: turn.auditRef,
    evidenceRefs: turn.evidence.map((e) => e.recordId),
    sellerLabel: MANAGER_SELLER_LABEL,
    sellerIdentityType: "presentation_only",
    managerLabel: MANAGER_LABEL,
    coachingNeedReason,
    coachingFocus: "renewal_recovery",
    coachingStatus,
  };
}
