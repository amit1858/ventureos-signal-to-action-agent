// Manager Coaching Curefoods Slice — additive Manager projection
// ==============================================================
// An ADDITIVE manager projection that lives OUTSIDE `demo/missionProjection.ts`
// so the existing Seller / Executive / Operations `PersonaLens` and
// `projectMissionForPersona` are left byte-for-byte unchanged (regression-proof).
//
// It reuses `projectGovernedOutcome` to carry the governed System/Business
// outcomes VERBATIM. It re-derives no governance and asserts no new business fact.

import type { CompletedMissionTurn } from "../missions/types";
import type { MissionView } from "../missions/missionView";
import { projectGovernedOutcome } from "../demo/missionProjection";

/** A read-only projection of the ONE governed Curefoods mission through the
 * Manager lens. Same mission id, account, and governed state as every other
 * lens — only the framing ("where should I intervene?") changes. */
export interface ManagerMissionProjection {
  lens: "manager";
  /** Manager-appropriate one-line framing of the mission. */
  headline: string;
  /** Governed SYSTEM outcome, carried verbatim. */
  systemOutcome: string;
  /** Governed BUSINESS outcome, carried verbatim. */
  businessOutcome: string;
  /** Two or three short, truthful supporting facts for the manager lens. */
  facts: readonly string[];
  /** Always true: nothing here is a live action. */
  simulated: true;
}

/** Project the seller-completed Curefoods mission through the Manager lens.
 * Deterministic; makes no forbidden business claim. */
export function projectMissionForManager(
  turn: CompletedMissionTurn,
  view: MissionView,
): ManagerMissionProjection {
  const name = turn.account.canonicalName;
  const outcome = projectGovernedOutcome(view);
  return {
    lens: "manager",
    simulated: true,
    headline: `Where should I intervene? — ${name} renewal (${turn.missionId})`,
    systemOutcome: outcome.systemOutcome,
    businessOutcome: outcome.businessOutcome,
    facts: [
      "Human approval required before any action",
      "Execution simulated — no customer impact yet",
      "Audit chain valid",
    ],
  };
}
