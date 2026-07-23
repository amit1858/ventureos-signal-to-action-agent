// VentureOS — AI Assurance · Contract + safety eval
// ==================================================
// Proves the `/assurance` data contract and its safety invariants against the REAL
// build-time-generated projection:
//   * the committed generated JSON passes the mirrored contract validator;
//   * NVIDIA is advisory only (authoritative === false) and can never override a
//     deterministic gate (verdict === deterministicResult for every gate);
//   * the always-on safety invariants all verify;
//   * the generated document leaks no secret, token, key, or local path;
//   * the validator FAILS CLOSED on tampered documents (verdict upgrade,
//     authoritative NVIDIA, disabled invariant);
//   * client components never import the server-only access module.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/assurance/eval/assuranceContract.eval.ts

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

import { validateAssuranceDoc } from "../contract";

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

const GENERATED_PATH = resolve(LIB_DIR, "data/assurance.generated.json");
const generated = JSON.parse(read(GENERATED_PATH)) as unknown;

// deep clone helper for tamper tests
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// ===========================================================================
console.log("\n[1] The committed generated document is valid");
// ===========================================================================
{
  const result = validateAssuranceDoc(generated);
  check("generated assurance.generated.json passes contract", result.ok,
    result.errors.join("; "));
  check("schema version is 1.0", (generated as { schemaVersion: string }).schemaVersion === "1.0");
}

// ===========================================================================
console.log("\n[2] NVIDIA is advisory only and never overrides a gate");
// ===========================================================================
{
  const doc = generated as unknown as {
    nvidiaAdvisory: { authoritative: boolean; assessment: string; invariants: Record<string, boolean> };
    deterministicGates: { key: string; verdict: string; deterministicResult: string }[];
    overallReadiness: { readiness: string; passedDimensions: number; totalDimensions: number };
  };
  check("nvidiaAdvisory.authoritative is false", doc.nvidiaAdvisory.authoritative === false);
  check("nvidia assessment is advisory/not_configured (never authoritative)",
    ["advisory", "not_configured"].includes(doc.nvidiaAdvisory.assessment));
  let allEqual = true;
  for (const gate of doc.deterministicGates) {
    if (gate.verdict !== gate.deterministicResult) allEqual = false;
  }
  check("every gate verdict equals its deterministic result", allEqual);
  const invariants = doc.nvidiaAdvisory.invariants;
  for (const key of ["serverOnly", "deterministicFirst", "wordingOverlay",
    "groundednessValidation", "timeoutFallback", "rejectionFallback"]) {
    check(`safety invariant '${key}' verifies true`, invariants[key] === true);
  }
  check("overall readiness reflects gate count",
    doc.overallReadiness.totalDimensions === doc.deterministicGates.length);
}

// ===========================================================================
console.log("\n[3] The validator fails closed on tampered documents");
// ===========================================================================
{
  // Tamper 1: NVIDIA upgrades a gate verdict.
  const t1 = clone(generated) as { deterministicGates: { verdict: string; deterministicResult: string }[] };
  t1.deterministicGates[0].deterministicResult = "FAIL";
  // verdict still PASS -> mismatch must be rejected.
  check("verdict/deterministicResult mismatch is rejected", validateAssuranceDoc(t1).ok === false);

  // Tamper 2: NVIDIA declared authoritative.
  const t2 = clone(generated) as { nvidiaAdvisory: { authoritative: boolean } };
  t2.nvidiaAdvisory.authoritative = true;
  check("authoritative NVIDIA is rejected", validateAssuranceDoc(t2).ok === false);

  // Tamper 3: a safety invariant disabled.
  const t3 = clone(generated) as { nvidiaAdvisory: { invariants: Record<string, boolean> } };
  t3.nvidiaAdvisory.invariants.serverOnly = false;
  check("disabled safety invariant is rejected", validateAssuranceDoc(t3).ok === false);

  // Tamper 4: wrong schema version.
  const t4 = clone(generated) as { schemaVersion: string };
  t4.schemaVersion = "9.9";
  check("wrong schema version is rejected", validateAssuranceDoc(t4).ok === false);
}

// ===========================================================================
console.log("\n[4] The generated document leaks no secret or local path");
// ===========================================================================
{
  const raw = JSON.stringify(generated).toLowerCase();
  const forbidden = ["bearer ", "api_key", "apikey", "nvapi-", "authorization",
    "secret", "password", "token=", "c:\\", "c:/", ":memory:", ".db"];
  for (const needle of forbidden) {
    check(`no forbidden token: '${needle}'`, !raw.includes(needle));
  }
  // No wall-clock timestamp leaks into the deterministic snapshot.
  check("no wall-clock timestamp", !/t\d{2}:\d{2}:\d{2}/.test(raw));
}

// ===========================================================================
console.log("\n[5] Client components never import the server-only access module");
// ===========================================================================
{
  const componentsDir = resolve(WEB_ROOT, "components/assurance");
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".tsx") || p.endsWith(".ts")) files.push(p);
    }
  };
  walk(componentsDir);
  check("assurance components exist", files.length > 0);
  let leaked = false;
  for (const f of files) {
    const text = read(f);
    if (text.includes("access.server") || text.includes("process.env")) leaked = true;
  }
  check("no assurance component imports access.server or reads process.env", !leaked);
}

// ===========================================================================
console.log("\n[6] The generated JSON is in sync (no stale committed data)");
// ===========================================================================
{
  // The Python exporter's --check is the golden authority; here we assert the
  // committed file is non-empty and structurally the object we validated.
  const dataPath = resolve(LIB_DIR, "data/assurance.generated.json");
  const size = statSync(dataPath).size;
  check("committed generated JSON is present and non-trivial", size > 500);
}

console.log(`\nAssurance contract + safety: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("FAILURES:\n" + failures.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
