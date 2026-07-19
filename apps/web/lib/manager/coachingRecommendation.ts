// Manager Coaching Curefoods Slice — deterministic coaching recommendation
// ========================================================================
// ONE deterministic coaching recommendation and a claim-safe 15-minute
// intervention plan for the governed Curefoods renewal mission. Everything here
// is a pure function of the read-only `ManagerMissionContext` — no randomness,
// no backend, no mutation.
//
// Forbidden (enforced by evals): the guidance must NEVER claim the seller is
// underperforming or caused the risk, that coaching will reduce revenue risk or
// improve adoption, that the customer will renew, that a meeting will be booked,
// or that outreach has been sent.
//
// Pure module: types + plain functions only (no JSX, clock, network, storage).

import type { ManagerMissionContext } from "./managerMissionContext";

/** The single supported coaching recommendation title. */
export const COACHING_RECOMMENDATION_TITLE =
  "Coach the Curefoods renewal conversation." as const;

/** A deterministic coaching recommendation for the manager. */
export interface CoachingRecommendation {
  title: typeof COACHING_RECOMMENDATION_TITLE;
  focus: "renewal_recovery";
  /** Claim-safe reasons, derived from existing mission evidence + state. */
  reason: readonly string[];
}

/** A four-section, deterministic 15-minute intervention plan. */
export interface FifteenMinuteIntervention {
  durationMinutes: 15;
  whatToDiscuss: readonly string[];
  whyItMatters: readonly string[];
  whatGoodLooksLike: readonly string[];
  whatRemainsUnknown: readonly string[];
}

/** Build the one deterministic coaching recommendation. The reasons come from
 * the read-only context (which already sourced them from governed facts). */
export function buildCoachingRecommendation(
  ctx: ManagerMissionContext,
): CoachingRecommendation {
  return {
    title: COACHING_RECOMMENDATION_TITLE,
    focus: "renewal_recovery",
    reason: ctx.coachingNeedReason,
  };
}

/** Build the deterministic 15-minute intervention plan. Evidence-based and
 * claim-safe: it prepares a conversation; it predicts no outcome. */
export function buildFifteenMinuteIntervention(
  ctx: ManagerMissionContext,
): FifteenMinuteIntervention {
  return {
    durationMinutes: 15,
    whatToDiscuss: Object.freeze([
      "Review the usage-trend evidence behind the renewal mission.",
      "Confirm the renewal timeline and what preparation is still needed.",
      "Rehearse the customer conversation the seller will lead.",
      `Confirm the assigned seller understands the approved next steps for ${ctx.missionId}.`,
    ]),
    whyItMatters: Object.freeze([
      "The governed mission has completed internal preparation, so the next step is human execution.",
      "A well-prepared conversation is the seller's responsibility — coaching sharpens it.",
    ]),
    whatGoodLooksLike: Object.freeze([
      "The seller can explain the renewal evidence in their own words.",
      "The seller has a clear, approved plan for the customer conversation.",
      "The manager and seller agree on what preparation remains before outreach.",
    ]),
    whatRemainsUnknown: Object.freeze([
      "No external response exists yet — the business outcome is still pending.",
      "Whether the customer will engage is unknown and is not predicted here.",
    ]),
  };
}
