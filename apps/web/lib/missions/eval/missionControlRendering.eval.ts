// Release 2.5 — Mission Control · primary-rendering projection evals (F2.2)
// =========================================================================
// A rendering-level proof (DOM-equivalent) that the PRIMARY business text the
// Mission Control screen shows for the real governed renewal turn contains none
// of the raw governed identifiers, while the raw values remain on the turn for
// title= / Technical Evidence / audit traceability.
//
// It builds the SAME CompletedMissionTurn the screen renders (buildRenewalDemoTurn,
// composed through the F1.5 adapter + F1.6 assembler — identical shape to the live
// BFF payload) and applies the SAME presentation projections the component applies
// to each primary field. The loader cannot render JSX, so this reconstructs the
// visible text deterministically from the exact rendered fields.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/missions/eval/missionControlRendering.eval.ts

import { buildRenewalDemoTurn } from "../demo";
import { categoryLabel, sourceModuleLabel, evidenceRequirementLabel, projectBusinessText } from "../missionLabels";
import { toSupportingEvidenceProse } from "../../nvidia/narrativeProjection";

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

// The raw identifiers that must never be visible in PRIMARY business content.
const FORBIDDEN_TOKENS = ["renewal_risk", "account_health", "renewal_timeline", "usage_trend", "mission-audit"];

const turn = buildRenewalDemoTurn();

// ===========================================================================
console.log("\n[1] Reconstruct the PRIMARY visible text exactly as the screen projects it");
// ===========================================================================
const primaryParts: string[] = [];

// 2. Why this account is at risk — supporting evidence segments (projected).
for (const s of turn.personaResponse.segments) {
  primaryParts.push(toSupportingEvidenceProse(s.text));
  primaryParts.push(categoryLabel(s.category)); // chip label
}
primaryParts.push(toSupportingEvidenceProse(turn.personaResponse.voiceSummary));

// 4. Confidence, evidence & provenance — mandatory evidence lines (projected).
for (const e of turn.evidence) {
  primaryParts.push(categoryLabel(e.category));
  primaryParts.push(evidenceRequirementLabel(e.summary));
  primaryParts.push(sourceModuleLabel(e.source));
}
for (const c of turn.personaResponse.citations) {
  primaryParts.push(sourceModuleLabel(c.sourceModule));
}

// 5. Recommended mission — objective + success criteria (projected).
const def = turn.missionDefinition;
if (def) {
  primaryParts.push(projectBusinessText(def.objective));
  for (const sc of def.successCriteria) primaryParts.push(projectBusinessText(sc.description));
}

const primaryText = primaryParts.join("\n");
check("primary text was assembled (non-empty)", primaryText.trim().length > 0);
check("every primary fragment is non-empty and usable", primaryParts.every((p) => p.trim().length > 0));

// ===========================================================================
console.log("\n[2] No raw governed identifier appears in PRIMARY visible text");
// ===========================================================================
for (const tok of FORBIDDEN_TOKENS) {
  check(`primary content does not visibly contain '${tok}'`, !primaryText.includes(tok), tok);
}

// ===========================================================================
console.log("\n[3] Specific corrected fields render business language");
// ===========================================================================
const firstSeg = toSupportingEvidenceProse(turn.personaResponse.segments[0]?.text ?? "");
check("supporting evidence has no 'Risk to watch on'", !/risk to watch on/i.test(firstSeg), firstSeg);
check("supporting evidence has no 'Based on what I have'", !/based on what i have/i.test(firstSeg), firstSeg);

const firstEvidence = turn.evidence[0];
if (firstEvidence) {
  check("mandatory-evidence summary renders 'Required evidence'", evidenceRequirementLabel(firstEvidence.summary) === "Required evidence");
  check("evidence source renders 'Mission audit'", sourceModuleLabel(firstEvidence.source) === "Mission audit", sourceModuleLabel(firstEvidence.source));
}
if (def) {
  check("success criterion renders 'Renewal-risk' not 'renewal_risk'",
    projectBusinessText(def.successCriteria[0]?.description ?? "").startsWith("Renewal-risk"),
    projectBusinessText(def.successCriteria[0]?.description ?? ""));
}

// ===========================================================================
console.log("\n[4] Raw values remain intact on the turn for traceability (title= / audit)");
// ===========================================================================
// Projection is presentation-only: the underlying governed fields are unchanged,
// so title= attributes and Technical Evidence still expose the raw identifiers.
check("evidence category raw id preserved", turn.evidence.some((e) => e.category === "account_health"));
check("evidence source raw id preserved", turn.evidence.every((e) => e.source === "mission-audit"));
check("segment raw text still contains the internal framing", turn.personaResponse.segments.some((s) => /risk to watch on/i.test(s.text)));
if (def) {
  check("success-criteria raw description preserved", def.successCriteria.some((c) => c.description.includes("renewal_risk")));
}

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Mission Control rendering-projection evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All rendering-projection checks passed. Primary content is business-facing; raw ids traceable.");
console.log("=".repeat(70));
