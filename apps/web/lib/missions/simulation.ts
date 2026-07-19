// Release 2.2 — Mission Control · governed approval + simulated action (F1.8)
// ===========================================================================
// Deterministic, presentation-side capture of a HUMAN approval decision and the
// SIMULATED action proposals that may run only after it. This layer owns NO
// governance policy: the mission was already verified and cleared upstream; here
// a human explicitly confirms the exact reviewed payload, and — only on an
// explicit approval — we render simulated email / CRM task / risk-update
// proposals. Release 2.2 is simulated-only: nothing leaves a controlled sandbox.
//
// Invariants:
//   * Approval binds to the EXACT mission version + reviewed action payload
//     (by ref + hash). A confirmation that does not match the reviewed payload
//     is refused.
//   * Approve requires an EXPLICIT confirmation token (screen or spoken).
//   * Reject / request-revision require a reason.
//   * NO simulated proposal is produced without a captured approval.
//   * Every proposal is `simulated: true`; ids are deterministic (no clock).
//
// Pure module: types + plain functions only (no JSX, no globals, no network).

import type { ApprovalChannel, ApprovalOutcome } from "../harness/types";
import type { ApprovalSummary, CompletedMissionTurn, MissionApprovalState } from "./types";

/** Presentation approval outcomes. `revision_required` is a screen action that is
 * not a terminal `ApprovalOutcome` (approve/reject) — it sends the mission back. */
export type PresentationApprovalOutcome = "approved" | "rejected" | "revision_required";

export interface ApprovalInput {
  outcome: PresentationApprovalOutcome;
  actor: string;
  actorRole?: string;
  channel: ApprovalChannel;
  /** REQUIRED to approve: the reviewer's explicit confirmation of the exact
   * reviewed payload. Must equal the bound `actionPayloadHash`. */
  confirmToken?: string | null;
  /** REQUIRED to reject or request revision. */
  reason?: string | null;
}

/** A captured, presentation-safe human decision bound to one mission version and
 * one reviewed payload. Carries no secrets and no live target details. */
export interface ApprovalCapture {
  decisionId: string;
  outcome: PresentationApprovalOutcome;
  actor: string;
  actorRole: string;
  channel: ApprovalChannel;
  missionId: string;
  missionVersion: string;
  approvedActionRef: string;
  approvedPayloadHash: string;
  reason: string | null;
  simulated: true;
}

/** A single simulated action proposal shown after approval. NEVER a live effect. */
export interface SimulatedActionProposal {
  receiptId: string;
  /** The governed permitted-action id this proposal realises (or a governed
   * mission update). */
  actionId: string;
  targetType: "email" | "crm_task" | "risk_update";
  targetId: string;
  title: string;
  summary: string;
  before: string;
  after: string;
  simulated: true;
}

export class ApprovalError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApprovalError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Approval capture
// ---------------------------------------------------------------------------

/** Map a captured outcome onto the presentation approval state. */
export function nextApprovalState(outcome: PresentationApprovalOutcome): MissionApprovalState {
  if (outcome === "approved") return "approved";
  if (outcome === "rejected") return "rejected";
  return "pending"; // revision_required returns to a pending gate
}

/** Capture a human decision against a completed turn's approval binding. Fails
 * closed: no gate, missing confirmation, mismatched payload, or a missing reason
 * all raise a typed `ApprovalError`. Deterministic — no clock, no randomness. */
export function captureApproval(
  turn: CompletedMissionTurn,
  input: ApprovalInput,
): ApprovalCapture {
  const binding = turn.approvalBinding;
  if (!binding) {
    throw new ApprovalError("no_approval_gate", "This mission has no approval gate to act on.");
  }
  if (!input.actor || input.actor.trim().length === 0) {
    throw new ApprovalError("actor_required", "An approving actor is required.");
  }

  if (input.outcome === "approved") {
    const token = (input.confirmToken ?? "").trim();
    if (token.length === 0) {
      throw new ApprovalError(
        "confirmation_required",
        "Approval requires an explicit confirmation of the reviewed action.",
      );
    }
    if (token !== binding.actionPayloadHash) {
      throw new ApprovalError(
        "payload_binding_mismatch",
        "The confirmation does not match the reviewed action payload.",
      );
    }
  } else {
    const reason = (input.reason ?? "").trim();
    if (reason.length === 0) {
      throw new ApprovalError(
        "reason_required",
        "A reason is required to reject or request revision.",
      );
    }
  }

  return {
    decisionId: `decision://${turn.missionId}/${binding.missionVersion}/${input.outcome}`,
    outcome: input.outcome,
    actor: input.actor.trim(),
    actorRole: (input.actorRole ?? "reviewer").trim(),
    channel: input.channel,
    missionId: turn.missionId,
    missionVersion: binding.missionVersion,
    approvedActionRef: binding.actionPayloadRef,
    approvedPayloadHash: binding.actionPayloadHash,
    reason: input.outcome === "approved" ? null : (input.reason ?? "").trim(),
    simulated: true,
  };
}

/** Project a captured terminal decision onto the turn's `ApprovalSummary`. Only
 * approve/reject are terminal outcomes; `revision_required` returns `null`. */
export function approvalSummaryFrom(capture: ApprovalCapture): ApprovalSummary | null {
  if (capture.outcome === "revision_required") return null;
  const outcome: ApprovalOutcome = capture.outcome;
  return {
    decisionId: capture.decisionId,
    outcome,
    actor: capture.actor,
    channel: capture.channel,
  };
}

// ---------------------------------------------------------------------------
// Simulated action proposals (only after approval)
// ---------------------------------------------------------------------------

function hasAction(turn: CompletedMissionTurn, id: string): boolean {
  return turn.permittedActions.includes(id);
}

/** Build the deterministic simulated action proposals for an APPROVED turn:
 * a renewal-outreach email, a CRM follow-up task, and an account risk update.
 * Email/task proposals are gated on the governed permitted actions. Throws if
 * the capture is not an approval or its payload binding does not match. */
export function simulateApprovedActions(
  turn: CompletedMissionTurn,
  capture: ApprovalCapture,
): SimulatedActionProposal[] {
  if (capture.outcome !== "approved") {
    throw new ApprovalError("not_approved", "Simulated actions require a captured approval.");
  }
  const binding = turn.approvalBinding;
  if (!binding || capture.approvedPayloadHash !== binding.actionPayloadHash) {
    throw new ApprovalError(
      "payload_binding_mismatch",
      "The captured approval does not match the reviewed action payload.",
    );
  }

  const account = turn.account.canonicalName;
  const mid = turn.missionId;
  const proposals: SimulatedActionProposal[] = [];

  if (hasAction(turn, "simulate_renewal_outreach")) {
    proposals.push({
      receiptId: `receipt://${mid}/email`,
      actionId: "simulate_renewal_outreach",
      targetType: "email",
      targetId: `mailto:${turn.account.ventureOsId}`,
      title: `Renewal outreach to ${account}`,
      summary: `Draft renewal-outreach email prepared for ${account}.`,
      before: "No renewal outreach on record.",
      after: `Renewal-outreach email drafted for ${account} (not sent).`,
      simulated: true,
    });
  }
  if (hasAction(turn, "simulate_stakeholder_brief")) {
    proposals.push({
      receiptId: `receipt://${mid}/crm_task`,
      actionId: "simulate_stakeholder_brief",
      targetType: "crm_task",
      targetId: `crm:task:${turn.account.ventureOsId}`,
      title: `Stakeholder brief follow-up for ${account}`,
      summary: `CRM follow-up task proposed for the ${account} renewal.`,
      before: "No open renewal task.",
      after: `CRM task proposed: brief exec sponsor on ${account} renewal (not created).`,
      simulated: true,
    });
  }
  // The governed mission always proposes an account risk-posture update.
  proposals.push({
    receiptId: `receipt://${mid}/risk_update`,
    actionId: turn.recommendation.actionType,
    targetType: "risk_update",
    targetId: `risk:${turn.account.ventureOsId}`,
    title: `Risk update for ${account}`,
    summary: `Account risk posture update proposed for ${account}.`,
    before: "Risk posture: at-risk (unactioned).",
    after: "Risk posture: at-risk (mitigation approved, simulated).",
    simulated: true,
  });

  return proposals;
}
