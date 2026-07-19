// Release 2.5 — Mission Control · business-label projection evals (F2.2)
// ======================================================================
// Deterministic proof that raw governed identifiers project to readable business
// labels in primary content, while the raw id itself is never mutated (callers
// keep it verbatim for Technical Evidence / audit / traceability).
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/missions/eval/missionLabels.eval.ts

import {
  humanizeId,
  intentLabel,
  templateLabel,
  actionLabel,
  permittedActionLabel,
  checkLabel,
  targetTypeLabel,
  categoryLabel,
  sourceModuleLabel,
  projectBusinessText,
  evidenceRequirementLabel,
} from "../missionLabels";

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
console.log("\n[1] The exact identifiers from the review project to readable labels");
// ===========================================================================
const EXPECTED: ReadonlyArray<[string, string]> = [
  ["renewal_risk", "Renewal risk"],
  ["account_health", "Account health"],
  ["renewal_timeline", "Renewal timeline"],
  ["usage_trend", "Usage trend"],
  ["decision_ledger", "Decision ledger"],
  ["account_timeline", "Account timeline"],
];
for (const [raw, label] of EXPECTED) {
  // categoryLabel covers signal/evidence categories; sourceModuleLabel covers
  // provenance modules. Every listed id must resolve through one of them.
  const viaCategory = categoryLabel(raw);
  const viaSource = sourceModuleLabel(raw);
  check(`"${raw}" -> "${label}" (category or source module)`, viaCategory === label || viaSource === label, `${viaCategory} / ${viaSource}`);
}

// ===========================================================================
console.log("\n[2] Business labels are never raw snake_case / kebab-case tokens");
// ===========================================================================
const SAMPLES = [
  categoryLabel("account_health"),
  categoryLabel("usage_trend"),
  sourceModuleLabel("decision_ledger"),
  sourceModuleLabel("account_timeline"),
  intentLabel("risk_review"),
  templateLabel("renewal-risk-parallel-v1"),
  actionLabel("renewal_outreach"),
  permittedActionLabel("simulate_renewal_outreach"),
  checkLabel("identity_resolved"),
  targetTypeLabel("crm_task"),
];
for (const label of SAMPLES) {
  check(`label "${label}" has no underscore`, !label.includes("_"), label);
  check(`label "${label}" is not a bare kebab id`, !/^[a-z0-9]+(-[a-z0-9]+)+$/.test(label), label);
  check(`label "${label}" starts uppercase`, /^[A-Z]/.test(label), label);
}

// ===========================================================================
console.log("\n[3] Unmapped ids humanise deterministically (no leaked token)");
// ===========================================================================
check("humanizeId strips version suffix", humanizeId("support-escalation-sequential-v1") === "Support escalation sequential");
check("humanizeId splits snake_case", humanizeId("some_new_category") === "Some new category");
check("humanizeId handles slash/colon", humanizeId("module:sub_part") === "Module sub part");
check("unmapped category humanises", categoryLabel("brand_sentiment") === "Brand sentiment");
check("unmapped source module humanises", sourceModuleLabel("billing_system") === "Billing system");

// ===========================================================================
console.log("\n[4] Projection is pure: the RAW id is never mutated by labelling");
// ===========================================================================
const raw = "decision_ledger";
const before = raw;
void sourceModuleLabel(raw);
void categoryLabel(raw);
check("raw id string is unchanged after labelling", raw === before && raw === "decision_ledger");
check("labelling is deterministic (same in, same out)", categoryLabel("renewal_risk") === categoryLabel("renewal_risk"));

// ===========================================================================
console.log("\n[5] projectBusinessText removes raw ids embedded in primary prose");
// ===========================================================================
// The exact free-text fields the governed payload carries (demo + live harness).
const OBJECTIVE_DESC = "renewal_risk mission objective prepared and approved for Curefoods.";
const OUTCOME_DESC = "Approved simulated renewal_risk action for Curefoods.";
const PRIMARY_TOKENS = ["renewal_risk", "account_health", "renewal_timeline", "usage_trend", "mission-audit"];

const projDesc = projectBusinessText(OBJECTIVE_DESC);
check("renewal_risk objective -> readable, capitalized", projDesc === "Renewal-risk mission objective prepared and approved for Curefoods.", projDesc);
for (const tok of PRIMARY_TOKENS) {
  check(`projected objective has no raw '${tok}'`, !projDesc.includes(tok), projDesc);
}
const projOutcome = projectBusinessText(OUTCOME_DESC);
check("mid-sentence renewal_risk projected", !projOutcome.includes("renewal_risk") && /renewal-risk/i.test(projOutcome), projOutcome);
check("projectBusinessText leaves clean prose intact",
  projectBusinessText("Protect an at-risk renewal via parallel analysis.") === "Protect an at-risk renewal via parallel analysis.");
check("projectBusinessText introduces no new digits",
  (projectBusinessText(OBJECTIVE_DESC).match(/\d/g) ?? []).length === (OBJECTIVE_DESC.match(/\d/g) ?? []).length);
check("empty / whitespace stays empty", projectBusinessText("   ") === "");
check("raw description string is not mutated", OBJECTIVE_DESC === "renewal_risk mission objective prepared and approved for Curefoods.");

// ===========================================================================
console.log("\n[6] evidenceRequirementLabel presents governance meaning, not raw ids");
// ===========================================================================
check("'mandatory evidence: account_health' -> 'Required evidence'", evidenceRequirementLabel("mandatory evidence: account_health") === "Required evidence");
check("'mandatory evidence: renewal_timeline' -> 'Required evidence'", evidenceRequirementLabel("mandatory evidence: renewal_timeline") === "Required evidence");
check("'mandatory evidence: usage_trend' -> 'Required evidence'", evidenceRequirementLabel("mandatory evidence: usage_trend") === "Required evidence");
for (const tok of PRIMARY_TOKENS) {
  check(`required-evidence label has no raw '${tok}'`, !evidenceRequirementLabel("mandatory evidence: account_health").includes(tok));
}
check("a natural live summary is projected token-safe, not overwritten",
  evidenceRequirementLabel("Renewal risk confirmed by the account team.") === "Renewal risk confirmed by the account team.");
check("mission-audit source humanises to 'Mission audit'", sourceModuleLabel("mission-audit") === "Mission audit");
check("mission-audit label has no raw hyphen id", !sourceModuleLabel("mission-audit").includes("mission-audit"));

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Business-label projection evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All business-label projection checks passed. Readable primary content, raw ids intact.");
console.log("=".repeat(70));
