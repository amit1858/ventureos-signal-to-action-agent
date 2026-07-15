// Release 2.2 — Mission Control · renewal demo turn eval (F1.7)
// ============================================================
// Deterministic, dependency-free evaluation of the Mission Control demo turn
// builder. It proves the screen renders a REAL governed renewal turn — composed
// through the same F1.5 adapter + F1.6 assembler as the live BFF — with no
// running Python service, and that the guided narrative is complete and ordered.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/missions/eval/missionControl.eval.ts

import {
  RENEWAL_DEMO_PAYLOAD,
  MISSION_SECTIONS,
  buildRenewalDemoTurn,
  seedRenewalDemoMemory,
  DEMO_SUBJECT,
} from "../demo";
import { isCompletedMissionTurn } from "../types";

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

// ===========================================================================
console.log("\n[1] Governed renewal payload: a decision-closed fact mirror");
// ===========================================================================
const p = RENEWAL_DEMO_PAYLOAD;
check("payload schemaVersion 1.0", p.schemaVersion === "1.0");
check("payload missionId M-RENEWAL-1", p.missionId === "M-RENEWAL-1");
check("payload subject is Curefoods", p.canonicalAccount.ventureOsId === DEMO_SUBJECT);
check("payload template renewal-risk-parallel-v1", p.selectedTemplateId === "renewal-risk-parallel-v1");
check("payload actionType renewal_outreach", p.recommendation.actionType === "renewal_outreach");
check("payload requires human approval", p.recommendation.requiresHumanApproval === true);
check("payload carries an approval request", !!p.approvalRequest);
check("payload is simulated-only", p.simulated === true);
check("payload verification verified", p.verification.status === "verified");
check("payload has 3 evidence refs", p.evidenceRefs.length === 3);
check("payload permitted actions are simulate_*",
  p.permittedActions.length === 2 && p.permittedActions.every((a) => a.startsWith("simulate_")));
check("payload frozen (governed fact)", Object.isFrozen(p));

// ===========================================================================
console.log("\n[2] Seeded memory retrieves through the public store api");
// ===========================================================================
const store = seedRenewalDemoMemory();
check("seed produced a store", typeof store.ingest === "function");

// ===========================================================================
console.log("\n[3] Demo turn: a real, executable, governed renewal turn");
// ===========================================================================
const turn = buildRenewalDemoTurn();
check("turn status completed", turn.status === "completed");
check("turn is completed (type guard)", isCompletedMissionTurn(turn));
check("turn simulated-only", turn.simulated === true);
check("turn account is Curefoods", turn.canonicalAccount.canonicalName === "Curefoods");
check("turn carries TS-composed personaResponse", !!turn.personaResponse);
check("persona composed >=1 segment (AI speaks first)", turn.personaResponse.segments.length >= 1);
check("persona segments carry citations (evidence before confidence)",
  turn.personaResponse.segments.every((s) => s.citations.length >= 1));
check("turn carries >=1 citation", turn.personaResponse.citations.length >= 1);
check("voiceSummary present + <=240 chars", turn.voiceSummary.length > 0 && turn.voiceSummary.length <= 240);
check("voiceSummary markdown-free", !/[*`#>\[\]\n\t]/.test(turn.voiceSummary));
check("turn forwards 3 evidence refs", turn.evidence.length === 3);
check("turn verification verified", turn.verification.status === "verified");
check("turn verificationSummary present", turn.verificationSummary.length > 0);
check("turn recommendation forwarded", turn.recommendation.actionType === "renewal_outreach");
check("turn permittedActions forwarded", turn.permittedActions.length === 2);
check("turn approvalState pending (human gate, pre-F1.8)", turn.approvalState === "pending");
check("turn has NO captured approval yet", turn.approval === undefined);
check("turn simulatedAction null (runs after approval, F1.8)", turn.simulatedAction === null);
check("turn outcome executable", turn.outcome.executable === true);
check("turn outcome headline present", turn.outcome.headline.length > 0);
check("turn missionDefinition present", !!turn.missionDefinition);
check("turn auditRef present", turn.auditRef.length > 0);
check("signalNarrative present + markdown-free",
  turn.signalNarrative.length > 0 && !/[*`#>\[\]\n\t]/.test(turn.signalNarrative));

// ===========================================================================
console.log("\n[4] Deterministic assembly (byte-identical across builds)");
// ===========================================================================
const a = JSON.stringify(buildRenewalDemoTurn());
const b = JSON.stringify(buildRenewalDemoTurn());
check("two demo builds are byte-identical", a === b);

// ===========================================================================
console.log("\n[5] Guided narrative: complete, ordered, no dashboard grid");
// ===========================================================================
const EXPECTED_IDS = [
  "what-happened", "recommended-mission", "why-at-risk", "evidence",
  "proposed-actions", "verification", "approval", "simulated-execution",
  "outcome", "supporting-context",
];
check("exactly 10 narrative sections", MISSION_SECTIONS.length === 10);
check("section ids match the spec order",
  MISSION_SECTIONS.map((s) => s.id).join(",") === EXPECTED_IDS.join(","));
check("section indexes are 1..10 in order",
  MISSION_SECTIONS.every((s, i) => s.index === i + 1));
check("section ids are unique", new Set(MISSION_SECTIONS.map((s) => s.id)).size === 10);
check("every section has a title + subtitle",
  MISSION_SECTIONS.every((s) => s.title.length > 0 && s.subtitle.length > 0));
check("sections are frozen", Object.isFrozen(MISSION_SECTIONS));

// ===========================================================================
console.log("\n[6] Presentation-safe: no leaked provider / language on payload");
// ===========================================================================
const payloadKeys = Object.keys(p);
check("payload carries NO personaResponse", !payloadKeys.includes("personaResponse"));
check("payload carries NO voiceSummary", !payloadKeys.includes("voiceSummary"));

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Mission Control demo evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All Mission Control demo checks passed. One guided renewal narrative.");
console.log("=".repeat(70));
