// VentureOS — AI Assurance Center · Contract + safety eval
// ========================================================
// Proves the Trust & Governance AI Assurance Center data contract and its safety
// invariants against the REAL build-time-generated projection:
//   * the committed generated JSON passes the mirrored contract validator;
//   * the advisory band is never authoritative and a bare advisory PASS requires a
//     live NVIDIA proof;
//   * every live-proof row keeps the deterministic verdict authoritative
//     (overallVerdict === deterministicResult);
//   * exactly the seven advisory dimensions are present with the documented mapping;
//   * the validator FAILS CLOSED on tampered documents (authoritative band, advisory
//     PASS without proof, verdict override);
//   * the generated document leaks no secret, token, key, or local path;
//   * the AI Assurance Center component never imports a server-only module or reads
//     process.env, and never reaches NVIDIA from the browser.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/assurance/eval/aiAssuranceCenter.eval.ts

import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { validateAiAssuranceDoc, loadAiAssuranceFrom } from "../aiAssuranceCenter";

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

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB_DIR = resolve(HERE, "..");
const WEB_ROOT = resolve(HERE, "../../..");
const read = (f: string): string => readFileSync(f, "utf8");

const GENERATED_PATH = resolve(LIB_DIR, "data/aiAssuranceCenter.generated.json");
const generated = JSON.parse(read(GENERATED_PATH)) as unknown;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const ADVISORY_DIMENSIONS = [
  "evidence_grounding",
  "recommendation_quality",
  "explanation_quality",
  "narrative_usefulness",
  "approval_discipline",
  "authority_safety",
  "tool_correctness",
];

// ===========================================================================
console.log("\n[1] The committed generated document is valid and loadable");
// ===========================================================================
{
  const result = validateAiAssuranceDoc(generated);
  check("aiAssuranceCenter.generated.json passes contract", result.ok, result.errors.join("; "));
  check("schema version is 1.0", (generated as { schemaVersion: string }).schemaVersion === "1.0");
  let loadedOk = true;
  try {
    loadAiAssuranceFrom(generated);
  } catch {
    loadedOk = false;
  }
  check("loadAiAssuranceFrom() returns without throwing", loadedOk);
}

// ===========================================================================
console.log("\n[2] The advisory band is never authoritative");
// ===========================================================================
{
  const doc = generated as unknown as {
    band: { authoritative: boolean; deterministicGovernance: string; nvidiaAdvisory: string; humanReview: string };
    liveProof: unknown;
  };
  check("band.authoritative is false", doc.band.authoritative === false);
  check("deterministicGovernance is PASS|FAIL",
    ["PASS", "FAIL"].includes(doc.band.deterministicGovernance));
  check("nvidiaAdvisory is a known state",
    ["PASS", "CONCERN", "UNAVAILABLE", "PROVIDER_ERROR"].includes(doc.band.nvidiaAdvisory));
  check("humanReview is a known state",
    ["NOT_REQUIRED", "REVIEW_SUGGESTED", "REVIEW_REQUIRED"].includes(doc.band.humanReview));
  if (doc.band.nvidiaAdvisory === "PASS") {
    check("advisory PASS is backed by a live proof", doc.liveProof !== null);
  }
  if (doc.band.deterministicGovernance === "FAIL") {
    check("deterministic FAIL forces human review", doc.band.humanReview === "REVIEW_REQUIRED");
  }
}

// ===========================================================================
console.log("\n[3] Live proof keeps the deterministic verdict authoritative");
// ===========================================================================
{
  const doc = generated as unknown as {
    liveProof: { results: { overallVerdict: string; deterministicResult: string }[] } | null;
  };
  if (doc.liveProof === null) {
    check("no live proof present (advisory unavailable)", true);
  } else {
    let allEqual = true;
    for (const row of doc.liveProof.results) {
      if (row.overallVerdict !== row.deterministicResult) allEqual = false;
    }
    check("every live-proof row overallVerdict === deterministicResult", allEqual);
    check("live proof has at least one scored row", doc.liveProof.results.length > 0);
  }
}

// ===========================================================================
console.log("\n[4] Exactly the seven advisory dimensions with honest coverage");
// ===========================================================================
{
  const doc = generated as unknown as {
    dimensions: {
      advisoryDimension: string;
      source: string;
      score: number | null;
      verdict: string | null;
      overallVerdict: string | null;
      deterministicResult: string | null;
    }[];
  };
  check("seven advisory dimensions present", doc.dimensions.length === 7);
  check("dimension keys match the rubric",
    JSON.stringify(doc.dimensions.map((d) => d.advisoryDimension)) === JSON.stringify(ADVISORY_DIMENSIONS));
  let sourcesOk = true;
  let notEvaluatedHonest = true;
  let evaluatedAuthoritative = true;
  for (const d of doc.dimensions) {
    if (!["live_nvidia", "reference_offline", "not_evaluated"].includes(d.source)) sourcesOk = false;
    if (d.source === "not_evaluated") {
      if (d.score !== null || d.verdict !== null) notEvaluatedHonest = false;
    } else if (d.overallVerdict !== d.deterministicResult) {
      evaluatedAuthoritative = false;
    }
  }
  check("every dimension source is a known value", sourcesOk);
  check("not-evaluated dimensions never fabricate a score/verdict", notEvaluatedHonest);
  check("evaluated dimensions keep deterministic authority", evaluatedAuthoritative);
}

// ===========================================================================
console.log("\n[5] The validator fails closed on tampered documents");
// ===========================================================================
{
  // Tamper 1: advisory band declared authoritative.
  const t1 = clone(generated) as { band: { authoritative: boolean } };
  t1.band.authoritative = true;
  check("authoritative band is rejected", validateAiAssuranceDoc(t1).ok === false);

  // Tamper 2: advisory PASS without a live proof.
  const t2 = clone(generated) as { band: { nvidiaAdvisory: string }; liveProof: unknown };
  t2.band.nvidiaAdvisory = "PASS";
  t2.liveProof = null;
  check("advisory PASS without live proof is rejected", validateAiAssuranceDoc(t2).ok === false);

  // Tamper 3: a live-proof row overrides the deterministic verdict.
  const t3 = clone(generated) as {
    liveProof: { results: { overallVerdict: string; deterministicResult: string }[] } | null;
  };
  if (t3.liveProof && t3.liveProof.results.length > 0) {
    t3.liveProof.results[0].deterministicResult =
      t3.liveProof.results[0].overallVerdict === "PASS" ? "FAIL" : "PASS";
    check("live-proof verdict override is rejected", validateAiAssuranceDoc(t3).ok === false);
  } else {
    check("live-proof verdict override is rejected (no proof — vacuous)", true);
  }

  // Tamper 4: a dimension row overrides the deterministic verdict.
  const t4 = clone(generated) as {
    dimensions: { overallVerdict: string | null; deterministicResult: string | null }[];
  };
  const idx = t4.dimensions.findIndex((d) => d.overallVerdict != null);
  if (idx >= 0) {
    t4.dimensions[idx].deterministicResult =
      t4.dimensions[idx].overallVerdict === "PASS" ? "FAIL" : "PASS";
    check("dimension verdict override is rejected", validateAiAssuranceDoc(t4).ok === false);
  } else {
    check("dimension verdict override is rejected (none evaluated — vacuous)", true);
  }
}

// ===========================================================================
console.log("\n[6] The generated document leaks no secret or local path");
// ===========================================================================
{
  const raw = JSON.stringify(generated).toLowerCase();
  const forbidden = ["bearer ", "api_key", "apikey", "nvapi-", "authorization",
    "password", "token=", "c:\\", "c:/", ":memory:", ".db"];
  for (const needle of forbidden) {
    check(`no forbidden token: '${needle}'`, !raw.includes(needle));
  }
}

// ===========================================================================
console.log("\n[7] The AI Assurance Center component is browser-safe");
// ===========================================================================
{
  const componentPath = resolve(WEB_ROOT, "components/evaluation/AiAssuranceCenter.tsx");
  const text = read(componentPath);
  check("AiAssuranceCenter component exists", statSync(componentPath).size > 0);
  check("component does not import a server-only module", !text.includes(".server"));
  check("component does not read process.env", !text.includes("process.env"));
  check("component does not fetch or reach NVIDIA from the browser",
    !/\bfetch\s*\(/.test(text) && !text.toLowerCase().includes("api.nvidia") &&
      !text.toLowerCase().includes("nvapi-"));
}

console.log(`\nAI Assurance Center contract + safety: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("FAILURES:\n" + failures.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
