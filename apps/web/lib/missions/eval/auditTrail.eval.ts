// Release 2.2 — Mission Control · mission audit + outcome eval (F1.9)
// ===================================================================
// Deterministic, dependency-free evaluation of the readable mission audit trail.
// It proves the history covers every governed stage in order, reflects the human
// decision and simulated proposals, keeps the chain-valid state honest, and NEVER
// exposes raw hashes outside the opt-in technical section.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/missions/eval/auditTrail.eval.ts

import { buildRenewalDemoTurn } from "../demo";
import { captureApproval, simulateApprovedActions } from "../simulation";
import type { ApprovalInput } from "../simulation";
import { buildMissionAuditTrail } from "../auditTrail";

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

const turn = buildRenewalDemoTurn();
const HASH = turn.approvalBinding!.actionPayloadHash;
const approveInput: ApprovalInput = {
  outcome: "approved",
  actor: "amit",
  actorRole: "account_owner",
  channel: "screen",
  confirmToken: HASH,
};

const EXPECTED_STAGES = [
  "intake", "identity_resolution", "template_selection", "planning", "verification",
  "approval", "simulated_execution", "outcome_verification", "closure",
];

// ===========================================================================
console.log("\n[1] Pre-approval trail: complete, ordered, honest about pending");
// ===========================================================================
const pending = buildMissionAuditTrail({ turn });
check("nine stages", pending.steps.length === 9);
check("stages in the governed order",
  pending.steps.map((s) => s.stageId).join(",") === EXPECTED_STAGES.join(","));
check("sequence is 1..9", pending.steps.every((s, i) => s.sequence === i + 1));
check("every step has an actor + timestamp + status",
  pending.steps.every((s) => s.actor.length > 0 && s.timestamp.length > 0 && s.status.length > 0));
check("intake..verification are done",
  pending.steps.slice(0, 5).every((s) => s.status === "done"));
check("approval is pending pre-decision",
  pending.steps.find((s) => s.stageId === "approval")!.status === "pending");
check("simulated execution is pending pre-approval",
  pending.steps.find((s) => s.stageId === "simulated_execution")!.status === "pending");
check("no approval ref before a decision",
  pending.steps.find((s) => s.stageId === "approval")!.approvalRef === null);
check("no receipt ref before simulation",
  pending.steps.every((s) => s.receiptRef === null));
check("chain-valid (audit reference present, no inconsistency)", pending.chainValid === true);

// ===========================================================================
console.log("\n[2] Hashes never appear outside the technical section");
// ===========================================================================
function nonTechnicalBlob(trail: ReturnType<typeof buildMissionAuditTrail>): string {
  return JSON.stringify(
    trail.steps.map((s) => ({
      title: s.title, actor: s.actor, timestamp: s.timestamp, status: s.status,
      detail: s.detail, evidenceRef: s.evidenceRef, approvalRef: s.approvalRef,
      receiptRef: s.receiptRef, chainValid: s.chainValid,
    })),
  );
}
check("payload hash is NOT in the default (non-technical) view",
  !nonTechnicalBlob(pending).includes(HASH));
check("payload hash IS available in a technical detail",
  pending.steps.some((s) => s.technical.some((t) => t.value === HASH)));

// ===========================================================================
console.log("\n[3] Approved trail: reflects the decision, receipts, closure");
// ===========================================================================
const approved = captureApproval(turn, approveInput);
const proposals = simulateApprovedActions(turn, approved);
const trail = buildMissionAuditTrail({ turn, capture: approved, proposals });

const approvalStep = trail.steps.find((s) => s.stageId === "approval")!;
check("approval step done", approvalStep.status === "done");
check("approval step carries the decision ref", approvalStep.approvalRef === approved.decisionId);
check("approval step actor is the human", approvalStep.actor === "amit");
const simStep = trail.steps.find((s) => s.stageId === "simulated_execution")!;
check("simulated execution done", simStep.status === "done");
check("simulated execution carries a receipt ref", simStep.receiptRef === proposals[0].receiptId);
check("outcome verification done after approval",
  trail.steps.find((s) => s.stageId === "outcome_verification")!.status === "done");
check("closure done after approval",
  trail.steps.find((s) => s.stageId === "closure")!.status === "done");
check("approved trail still chain-valid", trail.chainValid === true);
check("approved default view still hides the hash", !nonTechnicalBlob(trail).includes(HASH));

// Determinism.
const a = JSON.stringify(buildMissionAuditTrail({ turn, capture: approved, proposals }));
const b = JSON.stringify(buildMissionAuditTrail({
  turn,
  capture: captureApproval(turn, approveInput),
  proposals: simulateApprovedActions(turn, captureApproval(turn, approveInput)),
}));
check("audit trail is deterministic (byte-identical)", a === b);

// ===========================================================================
console.log("\n[4] Rejected trail: no simulation, honest closure");
// ===========================================================================
const rejected = captureApproval(turn, {
  outcome: "rejected", actor: "amit", channel: "screen", reason: "budget frozen",
});
const rejTrail = buildMissionAuditTrail({ turn, capture: rejected, proposals: [] });
check("approval step rejected", rejTrail.steps.find((s) => s.stageId === "approval")!.status === "rejected");
check("simulated execution blocked on rejection",
  rejTrail.steps.find((s) => s.stageId === "simulated_execution")!.status === "blocked");
check("closure blocked on rejection",
  rejTrail.steps.find((s) => s.stageId === "closure")!.status === "blocked");
check("no receipt ref on a rejected mission",
  rejTrail.steps.every((s) => s.receiptRef === null));

// ===========================================================================
console.log("\n[5] Tampered binding breaks the chain-valid state");
// ===========================================================================
const tampered = { ...approved, approvedPayloadHash: "sha256:tampered" };
const tamperedTrail = buildMissionAuditTrail({ turn, capture: tampered, proposals: [] });
check("chain-valid is FALSE when the approval binding is inconsistent",
  tamperedTrail.chainValid === false);

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Mission audit + outcome evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All mission audit checks passed. Readable history; hashes opt-in only.");
console.log("=".repeat(70));
