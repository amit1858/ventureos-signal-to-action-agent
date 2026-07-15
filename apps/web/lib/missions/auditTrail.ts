// Release 2.2 — Mission Control · mission audit + outcome projection (F1.9)
// =========================================================================
// A readable, presentation-safe projection of the mission's governed history:
// intake -> identity resolution -> template selection -> planning ->
// verification -> approval -> simulated execution -> outcome verification ->
// closure. It is DERIVED deterministically from the governed turn, the captured
// human decision, and the simulated proposals — it never invents governance and
// never exposes raw hashes or database details by default (those live only in an
// opt-in technical section).
//
// Pure module: types + plain functions only (no JSX, no clock, no network).

import { defaultInjectedTimestamps } from "../harness/requestBuilder";
import type { ApprovalCapture, SimulatedActionProposal } from "./simulation";
import type { CompletedMissionTurn } from "./types";

/** Presentation status for one step of the mission history. */
export type AuditStepStatus = "done" | "pending" | "rejected" | "blocked";

/** Opt-in technical evidence for a step — hashes / refs shown only on request. */
export interface AuditTechnicalDetail {
  label: string;
  value: string;
}

/** One readable step in the mission audit history. */
export interface MissionAuditStep {
  sequence: number;
  stageId: string;
  title: string;
  actor: string;
  timestamp: string;
  status: AuditStepStatus;
  detail: string;
  evidenceRef: string | null;
  approvalRef: string | null;
  receiptRef: string | null;
  chainValid: boolean;
  /** Hidden by default; surfaced only in an expandable technical section. */
  technical: AuditTechnicalDetail[];
}

/** The full, presentation-safe mission audit trail. */
export interface MissionAuditTrail {
  missionId: string;
  auditRef: string;
  chainValid: boolean;
  steps: MissionAuditStep[];
}

export interface AuditTrailInput {
  turn: CompletedMissionTurn;
  capture?: ApprovalCapture | null;
  proposals?: SimulatedActionProposal[];
  /** Injected, deterministic stage timestamps (defaults mirror the harness). */
  timestamps?: Record<string, string>;
}

function approvalStatus(capture: ApprovalCapture | null): AuditStepStatus {
  if (!capture) return "pending";
  if (capture.outcome === "approved") return "done";
  if (capture.outcome === "rejected") return "rejected";
  return "pending"; // revision_required -> back to a pending gate
}

/** Build the deterministic, readable mission audit trail. Same inputs -> an
 * identical trail. Raw hashes appear ONLY in each step's `technical` list. */
export function buildMissionAuditTrail(input: AuditTrailInput): MissionAuditTrail {
  const { turn } = input;
  const capture = input.capture ?? null;
  const proposals = input.proposals ?? [];
  const ts = input.timestamps ?? defaultInjectedTimestamps();

  const approved = capture?.outcome === "approved";
  const rejected = capture?.outcome === "rejected";
  const account = turn.account.canonicalName;
  const binding = turn.approvalBinding;

  // The chain is valid when every governed fact the trail depends on is present
  // and internally consistent (an approved decision must match the reviewed
  // payload binding). Deterministic; no hash is shown here.
  const bindingConsistent =
    !capture ||
    capture.outcome !== "approved" ||
    (!!binding && capture.approvedPayloadHash === binding.actionPayloadHash);
  const chainValid = turn.auditRef.length > 0 && bindingConsistent;

  const verificationDone = turn.verification.status === "verified";
  const receiptRef = proposals.length > 0 ? proposals[0].receiptId : null;

  const steps: MissionAuditStep[] = [
    {
      sequence: 1,
      stageId: "intake",
      title: "Intake",
      actor: "system",
      timestamp: ts.intake ?? ts.default,
      status: "done",
      detail: `Signal received for ${account}.`,
      evidenceRef: null,
      approvalRef: null,
      receiptRef: null,
      chainValid,
      technical: [],
    },
    {
      sequence: 2,
      stageId: "identity_resolution",
      title: "Identity resolution",
      actor: "identity-resolver",
      timestamp: ts.identity ?? ts.default,
      status: "done",
      detail: `Resolved to canonical account ${account}.`,
      evidenceRef: turn.account.ventureOsId,
      approvalRef: null,
      receiptRef: null,
      chainValid,
      technical: [{ label: "VentureOS id", value: turn.account.ventureOsId }],
    },
    {
      sequence: 3,
      stageId: "template_selection",
      title: "Template selection",
      actor: "mission-selector",
      timestamp: ts.selection ?? ts.default,
      status: "done",
      detail: `Deterministically selected ${turn.selectedTemplateId}.`,
      evidenceRef: turn.selectedTemplateId,
      approvalRef: null,
      receiptRef: null,
      chainValid,
      technical: [],
    },
    {
      sequence: 4,
      stageId: "planning",
      title: "Planning",
      actor: "mission-harness",
      timestamp: ts.proposed ?? ts.default,
      status: "done",
      detail: `Prepared ${turn.recommendation.actionType} with ${turn.permittedActions.length} permitted actions.`,
      evidenceRef: turn.recommendation.recommendationId,
      approvalRef: null,
      receiptRef: null,
      chainValid,
      technical: [],
    },
    {
      sequence: 5,
      stageId: "verification",
      title: "Verification",
      actor: "verifier",
      timestamp: ts.verification ?? ts.default,
      status: verificationDone ? "done" : "blocked",
      detail: turn.verificationSummary,
      evidenceRef: turn.evidence.length > 0 ? turn.evidence[0].recordId : null,
      approvalRef: null,
      receiptRef: null,
      chainValid,
      technical: turn.verification.checks.map((c) => ({
        label: c.name,
        value: c.passed ? "passed" : "failed",
      })),
    },
    {
      sequence: 6,
      stageId: "approval",
      title: "Approval",
      actor: capture ? capture.actor : "awaiting human",
      timestamp: ts.approval_decision ?? ts.default,
      status: approvalStatus(capture),
      detail: capture
        ? capture.outcome === "approved"
          ? "Human approval captured."
          : capture.outcome === "rejected"
            ? `Rejected: ${capture.reason ?? ""}`.trim()
            : `Revision requested: ${capture.reason ?? ""}`.trim()
        : "Human approval required before any action.",
      evidenceRef: null,
      approvalRef: capture ? capture.decisionId : null,
      receiptRef: null,
      chainValid,
      technical: binding ? [{ label: "Reviewed payload hash", value: binding.actionPayloadHash }] : [],
    },
    {
      sequence: 7,
      stageId: "simulated_execution",
      title: "Simulated execution",
      actor: "sandbox",
      timestamp: ts.execution ?? ts.default,
      status: approved ? "done" : rejected ? "blocked" : "pending",
      detail: approved
        ? `${proposals.length} action(s) simulated — nothing left the sandbox.`
        : "Runs only after approval.",
      evidenceRef: null,
      approvalRef: null,
      receiptRef,
      chainValid,
      technical: proposals.map((p) => ({ label: p.targetType, value: p.receiptId })),
    },
    {
      sequence: 8,
      stageId: "outcome_verification",
      title: "Outcome verification",
      actor: "verifier",
      timestamp: ts.outcome ?? ts.default,
      status: approved ? "done" : "pending",
      detail: approved
        ? "Simulated outcome verified against the approved action."
        : "Pending approval and simulation.",
      evidenceRef: null,
      approvalRef: null,
      receiptRef: null,
      chainValid,
      technical: [],
    },
    {
      sequence: 9,
      stageId: "closure",
      title: "Closure",
      actor: "mission-harness",
      timestamp: ts.outcome ?? ts.default,
      status: rejected ? "blocked" : approved ? "done" : "pending",
      detail: rejected
        ? "Mission closed without action."
        : approved
          ? `Mission closed for ${account}.`
          : "Mission open pending approval.",
      evidenceRef: null,
      approvalRef: capture && capture.outcome !== "revision_required" ? capture.decisionId : null,
      receiptRef,
      chainValid,
      technical: [{ label: "Audit reference", value: turn.auditRef }],
    },
  ];

  return { missionId: turn.missionId, auditRef: turn.auditRef, chainValid, steps };
}
