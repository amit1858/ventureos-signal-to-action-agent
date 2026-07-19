// Release 2.2 — Mission Control · state-aware copy eval (F1 correction)
// ====================================================================
// Deterministic, dependency-free evaluation of `missionStatusCopy`. It proves the
// Mission Control header no longer shows stale approval copy after a decision:
// every mission phase — awaiting_approval, simulated_executed, closed, and the
// four governed states — maps to distinct, correct copy.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/missions/eval/missionStatusCopy.eval.ts

import { buildRenewalDemoTurn } from "../demo";
import {
  deriveMissionPhase,
  missionPhaseNarrative,
  missionStatusCopy,
} from "../missionStatusCopy";
import type { MissionPhase } from "../missionStatusCopy";
import type { ApprovalCapture } from "../simulation";
import type { CompletedMissionTurn, GovernedMissionTurn } from "../types";

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

const completed: CompletedMissionTurn = buildRenewalDemoTurn();

function capture(outcome: ApprovalCapture["outcome"]): ApprovalCapture {
  return {
    decisionId: "DEC-1",
    outcome,
    actor: "amit",
    actorRole: "owner",
    channel: "screen",
    missionId: completed.missionId,
    missionVersion: "v1",
    approvedActionRef: "payload://M-RENEWAL-1/REC-M-RENEWAL-1",
    approvedPayloadHash: "sha256:demo",
    reason: outcome === "approved" ? null : "needs work",
    simulated: true,
  };
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
console.log("\n[1] Completed turn phases follow the captured decision");
// ===========================================================================
check("no decision -> awaiting_approval", deriveMissionPhase(completed, null) === "awaiting_approval");
check("approved -> simulated_executed", deriveMissionPhase(completed, capture("approved")) === "simulated_executed");
check("rejected -> rejected", deriveMissionPhase(completed, capture("rejected")) === "rejected");
check("revision -> revision_required", deriveMissionPhase(completed, capture("revision_required")) === "revision_required");
check("no gate + no decision -> closed",
  deriveMissionPhase({ ...completed, approvalState: "not_required" }, null) === "closed");

// ===========================================================================
console.log("\n[2] Governed turns map straight to their status phase");
// ===========================================================================
for (const s of ["blocked", "rejected", "revision_required", "failed"] as const) {
  check(`governed ${s} -> ${s}`, deriveMissionPhase(governed(s), null) === s);
}

// ===========================================================================
console.log("\n[3] Every phase has distinct, non-stale copy");
// ===========================================================================
const PHASES: MissionPhase[] = [
  "awaiting_approval", "simulated_executed", "closed",
  "blocked", "rejected", "revision_required", "failed",
];
const headlines = new Set<string>();
const labels = new Set<string>();
for (const phase of PHASES) {
  const copy = missionPhaseNarrative(phase);
  check(`${phase}: phase echoed`, copy.phase === phase);
  check(`${phase}: has a label`, copy.label.length > 0);
  check(`${phase}: has a headline`, copy.headline.length > 0);
  headlines.add(copy.headline);
  labels.add(copy.label);
}
check("all 7 headlines are distinct", headlines.size === PHASES.length, String(headlines.size));
check("all 7 labels are distinct", labels.size === PHASES.length, String(labels.size));

// ===========================================================================
console.log("\n[4] The stale approval headline is gone after a decision");
// ===========================================================================
const awaiting = missionStatusCopy(completed, null);
const executed = missionStatusCopy(completed, capture("approved"));
check("awaiting mentions approval", /approval/i.test(awaiting.headline));
check("executed no longer mentions approval-required",
  !/required/i.test(executed.headline) && /sandbox|simulat/i.test(executed.headline));
check("awaiting and executed differ", awaiting.headline !== executed.headline);
// The old stale line must never appear for a decided mission.
check("no stale 'ready for your approval' after approval",
  !/ready for your approval/i.test(executed.headline));

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Mission status copy evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All mission status copy checks passed. State-aware header holds.");
console.log("=".repeat(70));
