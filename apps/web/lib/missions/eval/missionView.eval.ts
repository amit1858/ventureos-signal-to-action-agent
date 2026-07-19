// Release 2.2 — Mission Control · authoritative view-model eval (F1 correction)
// =============================================================================
// Deterministic, dependency-free proof that the ONE authoritative mission view
// (`deriveMissionView`) can never render a contradictory state combination — the
// P0 defect where the header read "awaiting approval" while the outcome panel
// read "mission state: closed". For every reachable phase we assert the derived
// view is internally consistent (`missionViewInconsistencies` is empty) AND that
// the specific forbidden combinations are impossible.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/missions/eval/missionView.eval.ts

import { buildRenewalDemoTurn } from "../demo";
import { captureApproval, simulateApprovedActions } from "../simulation";
import type { ApprovalInput } from "../simulation";
import { deriveMissionView, missionViewInconsistencies } from "../missionView";
import type { GovernedMissionTurn } from "../types";

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

function approve(): ApprovalInput {
  return { outcome: "approved", actor: "amit", actorRole: "owner", channel: "screen", confirmToken: HASH };
}
function governed(status: GovernedMissionTurn["status"]): GovernedMissionTurn {
  return {
    schemaVersion: "1.0",
    missionId: "M-GOV",
    turnIndex: 0,
    status,
    missionState: status === "revision_required" ? "verifying" : "blocked",
    canonicalAccount: null,
    auditRef: "",
    simulated: true,
    reason: "governed",
    governedNarrative: "governed narrative",
  };
}

// ===========================================================================
console.log("\n[1] Awaiting approval: nothing has run, mission-state is NOT closed");
// ===========================================================================
const awaiting = deriveMissionView(turn, null);
check("awaiting: phase awaiting_approval", awaiting.phase === "awaiting_approval");
check("awaiting: approval pending", awaiting.approval === "pending");
check("awaiting: simulation not_started", awaiting.simulation === "not_started");
check("awaiting: outcome verification not_started", awaiting.outcomeVerification === "not_started");
check("awaiting: closure not_started", awaiting.closure === "not_started");
check("awaiting: actions have NOT run", awaiting.actionsRun === false);
check("awaiting: simulatedCount 0", awaiting.simulatedCount === 0);
check("awaiting: mission-state NEVER reads closed/complete",
  !/clos|complete/i.test(awaiting.missionStateLabel), awaiting.missionStateLabel);
check("awaiting: outcome notice says no action has run",
  /no action has run/i.test(awaiting.outcomeNotice));
check("awaiting: no contradictions", missionViewInconsistencies(awaiting).length === 0,
  missionViewInconsistencies(awaiting).join("; "));

// ===========================================================================
console.log("\n[2] Approved + simulated: complete, closed, receipts, all consistent");
// ===========================================================================
const capA = captureApproval(turn, approve());
const proposals = simulateApprovedActions(turn, capA);
const executed = deriveMissionView(turn, capA, proposals);
check("approved: phase simulated_executed", executed.phase === "simulated_executed");
check("approved: approval approved", executed.approval === "approved");
check("approved: simulation complete", executed.simulation === "complete");
check("approved: outcome verification complete", executed.outcomeVerification === "complete");
check("approved: closure complete", executed.closure === "complete");
check("approved: actions ran", executed.actionsRun === true);
check("approved: simulatedCount matches proposals", executed.simulatedCount === proposals.length);
check("approved: mission-state reads Complete", /complete/i.test(executed.missionStateLabel));
check("approved: headline reports simulated actions", /simulated/i.test(executed.outcomeHeadline));
check("approved: no contradictions", missionViewInconsistencies(executed).length === 0,
  missionViewInconsistencies(executed).join("; "));

// ===========================================================================
console.log("\n[3] Rejected: no simulation, no receipt, honest state");
// ===========================================================================
const capR = captureApproval(turn, { outcome: "rejected", actor: "amit", channel: "screen", reason: "budget frozen" });
const rejected = deriveMissionView(turn, capR, []);
check("rejected: phase rejected", rejected.phase === "rejected");
check("rejected: approval rejected", rejected.approval === "rejected");
check("rejected: simulation not_started", rejected.simulation === "not_started");
check("rejected: actions have NOT run", rejected.actionsRun === false);
check("rejected: simulatedCount 0", rejected.simulatedCount === 0);
check("rejected: mission-state not closed/complete",
  !/clos|complete/i.test(rejected.missionStateLabel), rejected.missionStateLabel);
check("rejected: no contradictions", missionViewInconsistencies(rejected).length === 0,
  missionViewInconsistencies(rejected).join("; "));

// ===========================================================================
console.log("\n[4] Revision required: no simulation, no receipt");
// ===========================================================================
const capV = captureApproval(turn, { outcome: "revision_required", actor: "amit", channel: "screen", reason: "add context" });
const revision = deriveMissionView(turn, capV, []);
check("revision: phase revision_required", revision.phase === "revision_required");
check("revision: approval revision_requested", revision.approval === "revision_requested");
check("revision: simulation not_started", revision.simulation === "not_started");
check("revision: actions have NOT run", revision.actionsRun === false);
check("revision: no contradictions", missionViewInconsistencies(revision).length === 0,
  missionViewInconsistencies(revision).join("; "));

// ===========================================================================
console.log("\n[5] Governed (blocked/failed) turns: no approval, no simulation");
// ===========================================================================
for (const s of ["blocked", "failed"] as const) {
  const v = deriveMissionView(governed(s), null);
  check(`${s}: phase ${s}`, v.phase === s);
  check(`${s}: actions have NOT run`, v.actionsRun === false);
  check(`${s}: simulation never complete`, v.simulation !== "complete");
  check(`${s}: no contradictions`, missionViewInconsistencies(v).length === 0,
    missionViewInconsistencies(v).join("; "));
}

// ===========================================================================
console.log("\n[6] Exhaustive: no reachable capture state is ever contradictory");
// ===========================================================================
const scenarios = [
  { name: "no-decision", view: deriveMissionView(turn, null) },
  { name: "approved", view: deriveMissionView(turn, capA, proposals) },
  { name: "rejected", view: deriveMissionView(turn, capR, []) },
  { name: "revision", view: deriveMissionView(turn, capV, []) },
];
for (const { name, view } of scenarios) {
  const problems = missionViewInconsistencies(view);
  check(`exhaustive ${name}: consistent`, problems.length === 0, problems.join("; "));
  // The forbidden P0 combination can never appear: pending approval + closed state.
  const pendingButClosed = view.approval === "pending" && /clos|complete/i.test(view.missionStateLabel);
  check(`exhaustive ${name}: never pending-yet-closed`, !pendingButClosed);
}

// Determinism.
const a = JSON.stringify(deriveMissionView(turn, captureApproval(turn, approve()), simulateApprovedActions(turn, captureApproval(turn, approve()))));
const b = JSON.stringify(deriveMissionView(turn, captureApproval(turn, approve()), simulateApprovedActions(turn, captureApproval(turn, approve()))));
check("view derivation is deterministic (byte-identical)", a === b);

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Mission view evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All mission view checks passed. One authoritative, non-contradictory state.");
console.log("=".repeat(70));
