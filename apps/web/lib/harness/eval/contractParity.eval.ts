// Release 2.2 — Adaptive Mission Harness · Cross-language contract parity eval
// ============================================================================
// Deterministic, dependency-free evaluation that proves the TypeScript contract
// types + validators accept EXACTLY the JSON the Python Harness emits, and that
// the locked governance invariants hold on every committed fixture.
//
// It reads the byte-identical fixtures produced by
//   services/api/harness/generate_contract_fixtures.py --write
// (never regenerates them here) and asserts, per fixture:
//   * the response validates against the TypeScript contract;
//   * status <-> payload <-> error invariants match the manifest;
//   * only `completed` fixtures carry an executable, simulated payload;
//   * blocked / rejected / revision / error fixtures carry none;
//   * no PersonaResponse and no snake_case contract keys cross the boundary;
//   * error fixtures expose the expected typed, BFF-safe error code.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/harness/eval/contractParity.eval.ts

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import {
  validateHarnessServiceResponse,
  validateMissionExecutionPayload,
  containsNoPersonaResponse,
  isCamelCaseOnly,
} from "../contractValidation";
import type {
  ContractFixtureEnvelope,
  ContractFixtureManifest,
} from "../types";

// ---------------------------------------------------------------------------
// Tiny deterministic harness (mirrors the memory/conversation eval suites)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fixture loading (read-only; the fixtures are Python-owned)
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(
  HERE,
  "../../../../../services/api/harness/fixtures/contracts",
);

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf8")) as T;
}

const manifest = loadJson<ContractFixtureManifest>("manifest.json");

const EXPECTED_ERROR_CODES: Record<string, string> = {
  blocked_unsupported_signal: "no_matching_template",
  blocked_ambiguous_account: "ambiguous_identity",
  rejected_approval: "approval_rejected",
  revision_required: "verification_failed",
  error_idempotency_conflict: "idempotency_conflict",
  error_internal_safe_failure: "internal_service_failure",
};

// ===========================================================================
console.log("\n[1] Fixture set + manifest integrity");
// ===========================================================================
{
  const onDisk = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json") && f !== "manifest.json")
    .sort();
  const inManifest = manifest.fixtures.map((f) => f.file).sort();
  check("manifest lists every fixture file on disk",
    JSON.stringify(onDisk) === JSON.stringify(inManifest),
    `disk=${JSON.stringify(onDisk)} manifest=${JSON.stringify(inManifest)}`);
  check("exactly 8 contract fixtures", manifest.fixtures.length === 8,
    String(manifest.fixtures.length));
  check("manifest schemaVersion is 1.0", manifest.schemaVersion === "1.0");
}

// ===========================================================================
console.log("\n[2] Per-fixture contract validation + governance invariants");
// ===========================================================================
for (const entry of manifest.fixtures) {
  const env = loadJson<ContractFixtureEnvelope>(entry.file);
  const resp = env.response;

  // The response validates against the TypeScript contract + validators.
  const result = validateHarnessServiceResponse(resp);
  check(`${entry.name}: response validates`, result.ok, result.errors.join("; "));

  // Manifest <-> response agreement (a cheap stale-fixture tripwire).
  check(`${entry.name}: status matches manifest`, resp.status === entry.status,
    `${resp.status} != ${entry.status}`);
  check(`${entry.name}: resultHash matches manifest`,
    resp.resultHash === entry.resultHash);
  check(`${entry.name}: requestId/correlationId propagated`,
    resp.requestId === env.request.requestId &&
    resp.correlationId === env.request.correlationId);

  const hasPayload = resp.missionExecutionPayload != null;
  check(`${entry.name}: payload presence matches manifest`,
    hasPayload === entry.hasExecutionPayload);

  if (entry.status === "completed") {
    check(`${entry.name}: completed is execution-eligible`, resp.executionEligible === true);
    check(`${entry.name}: completed carries a payload`, hasPayload);
    if (hasPayload) {
      const payloadResult = validateMissionExecutionPayload(resp.missionExecutionPayload);
      check(`${entry.name}: payload is contract-valid`, payloadResult.ok,
        payloadResult.errors.join("; "));
      check(`${entry.name}: payload is simulated`,
        resp.missionExecutionPayload?.simulated === true);
      check(`${entry.name}: payload carries no approvalRequest secrets (has ref+hash)`,
        resp.missionExecutionPayload?.approvalRequest?.actionPayloadHash?.startsWith("sha256:") === true);
    }
  } else {
    check(`${entry.name}: non-completed carries no payload`, !hasPayload);
    check(`${entry.name}: non-completed is not execution-eligible`,
      resp.executionEligible === false);
    check(`${entry.name}: exposes exactly one service error`,
      resp.serviceErrors.length === 1, JSON.stringify(resp.serviceErrors));
    const expectedCode = EXPECTED_ERROR_CODES[entry.name];
    if (expectedCode) {
      check(`${entry.name}: error code is ${expectedCode}`,
        resp.serviceErrors[0]?.code === expectedCode, resp.serviceErrors[0]?.code);
    }
  }
}

// ===========================================================================
console.log("\n[3] Boundary safety — no PersonaResponse, camelCase-only");
// ===========================================================================
for (const entry of manifest.fixtures) {
  const env = loadJson<ContractFixtureEnvelope>(entry.file);
  const noPersona = containsNoPersonaResponse(env.response);
  check(`${entry.name}: response carries no PersonaResponse/voiceSummary`,
    noPersona.ok, noPersona.errors.join("; "));
  const camel = isCamelCaseOnly(env.response);
  check(`${entry.name}: response is camelCase-only`, camel.ok, camel.errors.join("; "));
  const reqCamel = isCamelCaseOnly(env.request);
  check(`${entry.name}: request is camelCase-only`, reqCamel.ok, reqCamel.errors.join("; "));
}

// ===========================================================================
console.log("\n[4] Negative controls — validators reject malformed responses");
// ===========================================================================
{
  const good = loadJson<ContractFixtureEnvelope>("01_completed_renewal_risk.json").response;

  // A completed response stripped of its payload must be rejected.
  const noPayload = { ...good, missionExecutionPayload: null };
  check("completed-without-payload is rejected",
    validateHarnessServiceResponse(noPayload).ok === false);

  // A blocked response that smuggles a payload must be rejected.
  const blocked = loadJson<ContractFixtureEnvelope>("03_blocked_unsupported_signal.json").response;
  const blockedWithPayload = { ...blocked, missionExecutionPayload: good.missionExecutionPayload };
  check("blocked-with-payload is rejected",
    validateHarnessServiceResponse(blockedWithPayload).ok === false);

  // An unknown status must be rejected.
  const badStatus = { ...good, status: "succeeded" };
  check("unknown status is rejected",
    validateHarnessServiceResponse(badStatus).ok === false);

  // A smuggled PersonaResponse must be rejected.
  const withPersona = {
    ...good,
    missionExecutionPayload: { ...good.missionExecutionPayload, personaResponse: { segments: [] } },
  };
  check("smuggled PersonaResponse is rejected",
    validateHarnessServiceResponse(withPersona).ok === false);

  // A snake_case contract key must be rejected.
  const snake = { ...good, result_hash: good.resultHash };
  check("snake_case contract key is rejected",
    validateHarnessServiceResponse(snake).ok === false);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log("\n" + "=".repeat(70));
console.log(`Contract parity evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All contract parity checks passed. Python fixtures ⇄ TypeScript contracts.");
console.log("=".repeat(70));
