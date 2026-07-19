// Release 2.2 — Mission Control · governed approval + simulation eval (F1.8)
// ==========================================================================
// Deterministic, dependency-free evaluation of the human approval capture and
// the simulated action proposals. It proves the human gate is real and fails
// closed, that approval binds to the exact reviewed payload, and that nothing is
// simulated without an approval.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/missions/eval/simulation.eval.ts

import { buildRenewalDemoTurn } from "../demo";
import {
  captureApproval,
  simulateApprovedActions,
  approvalSummaryFrom,
  nextApprovalState,
  ApprovalError,
} from "../simulation";
import type { ApprovalInput } from "../simulation";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

function threw(name: string, code: string, fn: () => unknown): void {
  try {
    fn();
    check(name, false, "did not throw");
  } catch (err) {
    const ok = err instanceof ApprovalError && err.code === code;
    check(name, ok, ok ? "" : `unexpected: ${String(err)}`);
  }
}

const turn = buildRenewalDemoTurn();
const HASH = turn.approvalBinding!.actionPayloadHash;
const approveInput: ApprovalInput = {
  outcome: "approved",
  actor: "amit",
  actorRole: "account_owner",
  channel: "screen",
  confirmToken: HASH,
};

// ===========================================================================
console.log("\n[1] Approval binding is present + reviewable");
// ===========================================================================
check("turn carries an approval binding", !!turn.approvalBinding);
check("binding has mission version", turn.approvalBinding!.missionVersion === "v1");
check("binding has payload ref + hash",
  turn.approvalBinding!.actionPayloadRef.length > 0 && HASH.startsWith("sha256:"));
check("binding lists permitted actions", turn.approvalBinding!.permittedActions.length === 2);

// ===========================================================================
console.log("\n[2] Approve requires an explicit, matching confirmation");
// ===========================================================================
threw("approve without confirm token fails closed", "confirmation_required",
  () => captureApproval(turn, { ...approveInput, confirmToken: "" }));
threw("approve with a mismatched confirmation is refused", "payload_binding_mismatch",
  () => captureApproval(turn, { ...approveInput, confirmToken: "sha256:not-the-payload" }));
threw("approve without an actor fails closed", "actor_required",
  () => captureApproval(turn, { ...approveInput, actor: "" }));

const approved = captureApproval(turn, approveInput);
check("approval captured", approved.outcome === "approved");
check("bound to mission version", approved.missionVersion === "v1");
check("bound to reviewed payload hash", approved.approvedPayloadHash === HASH);
check("bound to reviewed payload ref", approved.approvedActionRef === turn.approvalBinding!.actionPayloadRef);
check("approval is simulated-only", approved.simulated === true);
check("approval has no reason", approved.reason === null);
check("deterministic decision id",
  approved.decisionId === `decision://${turn.missionId}/v1/approved`);
check("approved state maps to approved", nextApprovalState("approved") === "approved");

// ===========================================================================
console.log("\n[3] Reject / request-revision require a reason");
// ===========================================================================
threw("reject without reason fails closed", "reason_required",
  () => captureApproval(turn, { outcome: "rejected", actor: "amit", channel: "screen" }));
threw("revision without reason fails closed", "reason_required",
  () => captureApproval(turn, { outcome: "revision_required", actor: "amit", channel: "screen" }));

const rejected = captureApproval(turn, {
  outcome: "rejected", actor: "amit", channel: "screen", reason: "budget frozen",
});
check("rejection captured with reason", rejected.outcome === "rejected" && rejected.reason === "budget frozen");
check("rejected state maps to rejected", nextApprovalState("rejected") === "rejected");

const revision = captureApproval(turn, {
  outcome: "revision_required", actor: "amit", channel: "screen", reason: "add usage evidence",
});
check("revision captured with reason", revision.outcome === "revision_required");
check("revision returns to a pending gate", nextApprovalState("revision_required") === "pending");

// ===========================================================================
console.log("\n[4] Approval summary: terminal outcomes only");
// ===========================================================================
const sumApproved = approvalSummaryFrom(approved);
check("approved -> terminal summary", !!sumApproved && sumApproved.outcome === "approved");
check("summary carries actor + channel",
  sumApproved!.actor === "amit" && sumApproved!.channel === "screen");
const sumRejected = approvalSummaryFrom(rejected);
check("rejected -> terminal summary", !!sumRejected && sumRejected.outcome === "rejected");
check("revision -> NO terminal summary", approvalSummaryFrom(revision) === null);

// ===========================================================================
console.log("\n[5] Simulated actions ONLY after an approval");
// ===========================================================================
threw("no simulation on rejection", "not_approved", () => simulateApprovedActions(turn, rejected));
threw("no simulation on revision", "not_approved", () => simulateApprovedActions(turn, revision));

const tampered = { ...approved, approvedPayloadHash: "sha256:tampered" };
threw("simulation refuses a tampered payload binding", "payload_binding_mismatch",
  () => simulateApprovedActions(turn, tampered));

const proposals = simulateApprovedActions(turn, approved);
check("three simulated proposals (email + CRM task + risk update)", proposals.length === 3);
check("every proposal is simulated=true", proposals.every((p) => p.simulated === true));
check("proposals cover email, crm_task, risk_update",
  new Set(proposals.map((p) => p.targetType)).size === 3);
check("email proposal bound to renewal outreach action",
  proposals.some((p) => p.targetType === "email" && p.actionId === "simulate_renewal_outreach"));
check("crm task bound to stakeholder brief action",
  proposals.some((p) => p.targetType === "crm_task" && p.actionId === "simulate_stakeholder_brief"));
check("each proposal has a before + after", proposals.every((p) => p.before.length > 0 && p.after.length > 0));
check("receipt ids are deterministic",
  proposals.every((p) => p.receiptId === `receipt://${turn.missionId}/${p.targetType}`));

// Determinism across two runs.
const a = JSON.stringify(simulateApprovedActions(turn, approved));
const b = JSON.stringify(simulateApprovedActions(turn, captureApproval(turn, approveInput)));
check("simulation is deterministic (byte-identical)", a === b);

// ===========================================================================
console.log("\n[6] Safety: no secrets / live targets leak into a proposal");
// ===========================================================================
check("no proposal exposes the payload hash", !a.includes(HASH));
check("no live provider/credential words",
  !/gnani|nvidia|apiKey|api_key|password|token|secret/i.test(a));

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Governed approval + simulation evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All approval + simulation checks passed. Human gate is real; sim-only.");
console.log("=".repeat(70));
