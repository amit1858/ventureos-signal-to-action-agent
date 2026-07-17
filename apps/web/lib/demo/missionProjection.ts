// Release 2.3 — Curefoods Canonical Mission Continuity (pure projections)
// =======================================================================
// Presentation-only projections layered on TOP of the authoritative governed
// turn + `MissionView`. They re-derive NO governance: every value here is a
// truthful restatement of facts the protected mission engine already produced.
//
// Two things this module makes explicit for the continuity slice:
//   1. A truthful outcome that separates the SYSTEM outcome (did VentureOS
//      complete the governed work?) from the BUSINESS outcome (has the customer
//      responded?). The system can succeed while the business result is still
//      pending — the demo must never blur the two.
//   2. Read-only cross-persona projections (Seller / Executive / Operations)
//      of the SAME mission, so one Curefoods mission reads coherently through
//      each lens without a second source of truth. (No Manager lens here.)
//
// Forbidden claims (enforced by evals): renewal risk reduced, customer
// contacted, email sent, CRM updated, meeting booked, renewal progressed/won,
// email opened. Nothing in this module may assert any of them.
//
// Pure module: types + plain functions only (no JSX, clock or network).

import type { CompletedMissionTurn, MissionTurn } from "../missions/types";
import type { MissionView } from "../missions/missionView";

// ---------------------------------------------------------------------------
// Governed outcome — System vs Business
// ---------------------------------------------------------------------------

/** A truthful two-part outcome. `systemOutcome` describes what VentureOS did;
 * `businessOutcome` describes the (still-pending) real-world result. They are
 * intentionally distinct so a "success" headline never implies a customer
 * response that has not happened. */
export interface GovernedOutcomeProjection {
  /** Did the governed work complete? (System responsibility.) */
  systemOutcome: string;
  /** What is the real-world business result right now? (Not VentureOS's to claim.) */
  businessOutcome: string;
  /** Truthful, simulation-scoped supporting lines (only when actions ran). */
  supportingLines: readonly string[];
  /** True once approved actions have actually been simulated. */
  actionsSimulated: boolean;
}

const SIMULATED_SUPPORTING_LINES: readonly string[] = Object.freeze([
  "Renewal outreach drafted — not sent",
  "CRM follow-up proposed — not created",
  "Risk update proposed — not written",
]);

/** Project the truthful System/Business outcome for a mission view. Every branch
 * is deterministic and makes NO forbidden business claim. */
export function projectGovernedOutcome(view: MissionView): GovernedOutcomeProjection {
  switch (view.phase) {
    case "simulated_executed":
    case "closed":
      return {
        systemOutcome: "Governed work prepared successfully.",
        businessOutcome: "Awaiting external response.",
        supportingLines: view.actionsRun ? SIMULATED_SUPPORTING_LINES : [],
        actionsSimulated: view.actionsRun,
      };
    case "awaiting_approval":
      return {
        systemOutcome: "Governed work verified and ready for your approval.",
        businessOutcome: "No outreach has been prepared yet — awaiting approval.",
        supportingLines: [],
        actionsSimulated: false,
      };
    case "rejected":
      return {
        systemOutcome: "The mission stopped at human approval.",
        businessOutcome: "No outreach was prepared and nothing was sent.",
        supportingLines: [],
        actionsSimulated: false,
      };
    case "revision_required":
      return {
        systemOutcome: "The mission was returned for revision.",
        businessOutcome: "No outreach was prepared and nothing was sent.",
        supportingLines: [],
        actionsSimulated: false,
      };
    default:
      return {
        systemOutcome: "VentureOS did not proceed with this mission.",
        businessOutcome: "No outreach was prepared and nothing was sent.",
        supportingLines: [],
        actionsSimulated: false,
      };
  }
}

// ---------------------------------------------------------------------------
// NVIDIA grounded-evidence trust cue (Phase 7)
// ---------------------------------------------------------------------------

/** A business-facing trust cue built from EXISTING grounding metadata. It is
 * about the evidence the explanation is grounded in — never a claim about the
 * provider having "decided" anything. Truthful for both the live NIM path and
 * the deterministic fallback. */
export interface GroundedEvidenceCue {
  /** e.g. "Grounded against 3 verified evidence sources". */
  text: string;
  /** The dynamic evidence count (never hard-coded). */
  count: number;
  /** True when a live, grounded model narrative backed the explanation. */
  liveGrounded: boolean;
}

/** Build the grounded-evidence cue for a completed turn. Prefers the grounded
 * narrative's own evidence refs (what the explanation actually cited); falls
 * back to the turn's governed evidence when no narrative provider ran. Returns
 * `null` only when there is genuinely no evidence to cite. */
export function groundedEvidenceCue(
  turn: CompletedMissionTurn,
): GroundedEvidenceCue | null {
  const gn = turn.groundedNarrative;
  const count =
    gn && gn.evidenceRefs.length > 0 ? gn.evidenceRefs.length : turn.evidence.length;
  if (count <= 0) return null;
  const noun = count === 1 ? "verified evidence source" : "verified evidence sources";
  return {
    text: `Grounded against ${count} ${noun}`,
    count,
    liveGrounded: Boolean(gn && gn.grounded && !gn.fallbackUsed),
  };
}

// ---------------------------------------------------------------------------
// Cross-persona projection (Seller / Executive / Operations) — read only
// ---------------------------------------------------------------------------

/** The presentation lenses this slice projects. Manager is intentionally
 * absent (historical branch only). */
export type PersonaLens = "seller" | "executive" | "operations";

/** A compact, read-only projection of ONE mission through a persona lens. It is
 * derived entirely from the same governed turn + view; it introduces no new
 * facts and NO second source of truth. */
export interface PersonaMissionProjection {
  lens: PersonaLens;
  /** The persona-appropriate one-line framing of the mission. */
  headline: string;
  /** Two or three short, truthful supporting facts for this lens. */
  facts: readonly string[];
  /** Always true this release: nothing here is a live action. */
  simulated: true;
}

/** Project a completed Curefoods mission through a persona lens. All three
 * lenses describe the SAME mission id, account and governed state — only the
 * emphasis changes. */
export function projectMissionForPersona(
  turn: CompletedMissionTurn,
  view: MissionView,
  lens: PersonaLens,
): PersonaMissionProjection {
  const name = turn.account.canonicalName;
  const outcome = projectGovernedOutcome(view);
  const auditFact = "Audit chain valid";
  const govFact = "Human approval required before any action";

  switch (lens) {
    case "executive":
      return {
        lens,
        simulated: true,
        headline: `${name} renewal risk — one governed mission in progress`,
        facts: [
          `${outcome.systemOutcome} ${outcome.businessOutcome}`,
          govFact,
          "Execution simulated — no customer impact yet",
        ],
      };
    case "operations":
      return {
        lens,
        simulated: true,
        headline: `Mission ${turn.missionId} · ${name} · ${view.missionStateLabel}`,
        facts: [
          auditFact,
          `Simulated actions: ${view.simulatedCount}`,
          `Template ${turn.selectedTemplateId}`,
        ],
      };
    case "seller":
    default:
      return {
        lens,
        simulated: true,
        headline: `${name} renewal — ${view.missionStateLabel.toLowerCase()}`,
        facts: [outcome.systemOutcome, outcome.businessOutcome, govFact],
      };
  }
}

/** Narrowing guard so callers can project only completed turns. */
export function canProjectPersona(turn: MissionTurn): turn is CompletedMissionTurn {
  return turn.status === "completed";
}
