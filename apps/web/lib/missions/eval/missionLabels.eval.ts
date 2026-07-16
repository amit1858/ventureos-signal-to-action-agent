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
