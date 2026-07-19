// Release 2.2 — Mission BFF · governed orchestration eval
// =======================================================
// Deterministic, dependency-free evaluation of the Next.js Mission BFF core
// (`executeMissionRequest`) and the Python harness client retry policy. It runs
// with ZERO network: the Python harness is replaced by an injected caller that
// replays the REAL golden contract fixtures (the exact camelCase JSON the Python
// service emits), and the client's retry loop is exercised with a mock `fetch`.
//
// It proves the locked BFF invariants:
//   * completed  -> HTTP 200, carries the simulated MissionExecutionPayload;
//   * blocked/rejected/revision -> HTTP 200, governed narrative, NO payload;
//   * failed     -> typed error mapped to 4xx/5xx, NO payload;
//   * an invalid presentation request fails closed at 422 WITHOUT calling Python;
//   * requestId / correlationId / idempotencyKey are created and propagated;
//   * a caller-supplied correlationId is preserved;
//   * the outgoing Python request carries NO PersonaResponse, token, or endpoint;
//   * an unexpected upstream shape or a correlation mismatch fails closed (502);
//   * a transport failure fails closed as governed-unavailable (503);
//   * the client retries once on network failure / 503 and never on 4xx.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/missions/eval/bff.eval.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { executeMissionRequest } from "../bff";
import type { MissionBffDeps } from "../bff";
import type { MissionExecuteRequest } from "../bffContract";
import { renewalMissionMemoryDeps } from "../demo";
import { createHarnessCaller } from "../../harness/client";
import { containsNoPersonaResponse } from "../../harness/contractValidation";
import type {
  ContractFixtureEnvelope,
  HarnessServiceRequest,
  HarnessServiceResponse,
} from "../../harness/types";

// ---------------------------------------------------------------------------
// Tiny deterministic harness
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
// Fixtures (read-only)
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(
  HERE,
  "../../../../../services/api/harness/fixtures/contracts",
);

function loadResponse(file: string): HarnessServiceResponse {
  const env = JSON.parse(
    readFileSync(join(FIXTURES_DIR, file), "utf8"),
  ) as ContractFixtureEnvelope;
  return env.response;
}

// ---------------------------------------------------------------------------
// Deterministic deps + a fixture-replaying caller
// ---------------------------------------------------------------------------

interface CapturingDeps extends MissionBffDeps {
  readonly captured: HarnessServiceRequest[];
  readonly calls: () => number;
}

/** A caller that replays a fixture response, echoing the request ids as Python
 * does. `mutate` lets a test corrupt the echoed response to prove fail-closed. */
function fixtureDeps(
  file: string,
  opts: {
    presetCorrelation?: string;
    mutate?: (r: HarnessServiceResponse) => HarnessServiceResponse;
    withMemory?: boolean;
  } = {},
): CapturingDeps {
  const captured: HarnessServiceRequest[] = [];
  let counter = 0;
  const next = (p: string) => `${p}-${++counter}`;
  const deps: CapturingDeps = {
    captured,
    calls: () => captured.length,
    newRequestId: () => "REQ-fixed",
    newCorrelationId: () => opts.presetCorrelation ?? "CORR-fixed",
    newIdempotencyKey: () => "IDEM-fixed",
    injectedTimestamps: () => ({ default: "2026-07-14T10:00:00Z" }),
    callHarness: async (request: HarnessServiceRequest) => {
      captured.push(request);
      const base = loadResponse(file);
      let echoed: HarnessServiceResponse = {
        ...base,
        requestId: request.requestId,
        correlationId: request.correlationId,
      };
      if (opts.mutate) echoed = opts.mutate(echoed);
      return { ok: true, httpStatus: 200, body: echoed };
    },
  };
  if (opts.withMemory) deps.buildMemoryDeps = renewalMissionMemoryDeps;
  void next;
  return deps;
}

// ===========================================================================
console.log("\n[1] Completed missions carry the simulated payload (HTTP 200)");
// ===========================================================================
for (const file of ["01_completed_renewal_risk.json", "02_completed_support_escalation.json"]) {
  const deps = fixtureDeps(file);
  const input: MissionExecuteRequest = {
    missionId: "M-DEMO", scenarioId: "renewal_risk_v1", actor: "amit", actorRole: "owner",
  };
  const res = await executeMissionRequest(input, deps);
  check(`${file}: HTTP 200`, res.httpStatus === 200, String(res.httpStatus));
  check(`${file}: status completed`, res.body.status === "completed");
  check(`${file}: executionEligible`, res.body.executionEligible === true);
  check(`${file}: carries payload`, res.body.missionExecutionPayload !== null);
  check(`${file}: payload simulated`, res.body.missionExecutionPayload?.simulated === true);
  check(`${file}: no governed block on success`, res.body.governed === null);
  check(`${file}: Python called exactly once`, deps.calls() === 1, String(deps.calls()));
}

// ===========================================================================
console.log("\n[2] Governed non-executable outcomes: 200, no payload");
// ===========================================================================
for (const [file, status] of [
  ["03_blocked_unsupported_signal.json", "blocked"],
  ["05_rejected_approval.json", "rejected"],
  ["06_revision_required.json", "revision_required"],
] as const) {
  const deps = fixtureDeps(file);
  const res = await executeMissionRequest(
    { missionId: "M", scenarioId: "s", actor: "a", actorRole: "r" }, deps);
  check(`${file}: HTTP 200`, res.httpStatus === 200, String(res.httpStatus));
  check(`${file}: status ${status}`, res.body.status === status);
  check(`${file}: no payload`, res.body.missionExecutionPayload === null);
  check(`${file}: not executionEligible`, res.body.executionEligible === false);
  check(`${file}: governed reason present`,
    typeof res.body.governed?.reason === "string" && res.body.governed.reason.length > 0);
  check(`${file}: governed errorCode present`, typeof res.body.governed?.errorCode === "string");
}

// ===========================================================================
console.log("\n[3] Failed outcomes: typed error mapped to HTTP status");
// ===========================================================================
{
  const deps = fixtureDeps("07_error_idempotency_conflict.json");
  const res = await executeMissionRequest(
    { missionId: "M", scenarioId: "s", actor: "a", actorRole: "r" }, deps);
  check("idempotency: HTTP 409", res.httpStatus === 409, String(res.httpStatus));
  check("idempotency: status failed", res.body.status === "failed");
  check("idempotency: errorCode idempotency_conflict",
    res.body.governed?.errorCode === "idempotency_conflict");
  check("idempotency: no payload", res.body.missionExecutionPayload === null);
}
{
  const deps = fixtureDeps("08_error_internal_safe_failure.json");
  const res = await executeMissionRequest(
    { missionId: "M", scenarioId: "s", actor: "a", actorRole: "r" }, deps);
  check("internal: HTTP 502", res.httpStatus === 502, String(res.httpStatus));
  check("internal: status failed", res.body.status === "failed");
  check("internal: no payload", res.body.missionExecutionPayload === null);
}

// ===========================================================================
console.log("\n[4] Invalid presentation request fails closed at 422 (no Python)");
// ===========================================================================
{
  const deps = fixtureDeps("01_completed_renewal_risk.json");
  const res = await executeMissionRequest({ missionId: "" }, deps);
  check("invalid: HTTP 422", res.httpStatus === 422, String(res.httpStatus));
  check("invalid: status failed", res.body.status === "failed");
  check("invalid: errorCode invalid_request", res.body.governed?.errorCode === "invalid_request");
  check("invalid: Python NOT called", deps.calls() === 0, String(deps.calls()));
}
{
  const deps = fixtureDeps("01_completed_renewal_risk.json");
  const res = await executeMissionRequest(
    { missionId: "M", scenarioId: "s", actor: "a", actorRole: "r", personaResponse: { turn: 1 } } as unknown, deps);
  check("forbidden field: HTTP 422", res.httpStatus === 422);
  check("forbidden field: Python NOT called", deps.calls() === 0);
}

// ===========================================================================
console.log("\n[5] Id creation + propagation, and outgoing-request safety");
// ===========================================================================
{
  const deps = fixtureDeps("01_completed_renewal_risk.json");
  const res = await executeMissionRequest(
    { missionId: "M", scenarioId: "s", actor: "a", actorRole: "r" }, deps);
  const sent = deps.captured[0];
  check("propagate: request carries created requestId", sent.requestId === "REQ-fixed");
  check("propagate: request carries created correlationId", sent.correlationId === "CORR-fixed");
  check("propagate: request carries created idempotencyKey", sent.idempotencyKey === "IDEM-fixed");
  check("propagate: response echoes requestId", res.body.requestId === "REQ-fixed");
  check("propagate: response echoes correlationId", res.body.correlationId === "CORR-fixed");
  check("safety: outgoing request has NO PersonaResponse", containsNoPersonaResponse(sent).ok);
  const sentKeys = Object.keys(sent as unknown as Record<string, unknown>);
  check("safety: request has no service token field",
    !sentKeys.some((k) => /token/i.test(k)));
  check("safety: request has no endpoint/url field",
    !sentKeys.some((k) => /url|endpoint/i.test(k)));
  check("safety: outputMode is full", sent.outputMode === "full");
}
{
  const deps = fixtureDeps("01_completed_renewal_risk.json", { presetCorrelation: "IGNORED" });
  const res = await executeMissionRequest(
    { missionId: "M", scenarioId: "s", actor: "a", actorRole: "r", correlationId: "CORR-CALLER" }, deps);
  check("propagate: caller-supplied correlationId preserved", res.body.correlationId === "CORR-CALLER");
  check("propagate: request used caller correlationId", deps.captured[0].correlationId === "CORR-CALLER");
}

// ===========================================================================
console.log("\n[6] Fail closed on bad upstream shape / correlation mismatch");
// ===========================================================================
{
  const deps: MissionBffDeps = {
    newRequestId: () => "REQ-fixed",
    newCorrelationId: () => "CORR-fixed",
    newIdempotencyKey: () => "IDEM-fixed",
    injectedTimestamps: () => ({ default: "2026-07-14T10:00:00Z" }),
    callHarness: async () => ({ ok: true, httpStatus: 200, body: { nonsense: true } }),
  };
  const res = await executeMissionRequest(
    { missionId: "M", scenarioId: "s", actor: "a", actorRole: "r" }, deps);
  check("bad shape: HTTP 502", res.httpStatus === 502, String(res.httpStatus));
  check("bad shape: status failed", res.body.status === "failed");
  check("bad shape: no payload", res.body.missionExecutionPayload === null);
}
{
  const deps = fixtureDeps("01_completed_renewal_risk.json", {
    mutate: (r) => ({ ...r, correlationId: "CORR-WRONG" }),
  });
  const res = await executeMissionRequest(
    { missionId: "M", scenarioId: "s", actor: "a", actorRole: "r" }, deps);
  check("mismatch: HTTP 502", res.httpStatus === 502, String(res.httpStatus));
  check("mismatch: status failed", res.body.status === "failed");
}

// ===========================================================================
console.log("\n[7] Transport failure -> governed unavailable (503)");
// ===========================================================================
{
  const deps: MissionBffDeps = {
    newRequestId: () => "REQ-fixed",
    newCorrelationId: () => "CORR-fixed",
    newIdempotencyKey: () => "IDEM-fixed",
    injectedTimestamps: () => ({ default: "2026-07-14T10:00:00Z" }),
    callHarness: async () => ({ ok: false, kind: "network", message: "harness request failed" }),
  };
  const res = await executeMissionRequest(
    { missionId: "M", scenarioId: "s", actor: "a", actorRole: "r" }, deps);
  check("transport: HTTP 503", res.httpStatus === 503, String(res.httpStatus));
  check("transport: status failed", res.body.status === "failed");
  check("transport: retryable error", res.body.serviceErrors[0]?.retryable === true);
  check("transport: message leaks no endpoint", !/http|url|token/i.test(res.body.governed?.reason ?? ""));
}

// ===========================================================================
console.log("\n[8] Client retry policy (mock fetch, no network)");
// ===========================================================================

const REQ: HarnessServiceRequest = {
  schemaVersion: "1.0", requestId: "R", correlationId: "C", scenarioId: "s", missionId: "M",
  missionVersion: "v1", signals: {}, sourceRecords: null, actor: "a", actorRole: "r",
  approval: "none", approvalChannel: "screen", verificationOutcome: "verified",
  requestRevisionAfterBlock: false, injectPayloadMismatch: false, replayExecution: false,
  injectedTimestamps: { default: "2026-07-14T10:00:00Z" }, idempotencyKey: "I",
  outputMode: "full", protectedDecisionRef: null,
};

function jsonRes(status: number, body: unknown): Response {
  return { status, json: async () => body } as unknown as Response;
}

{
  let n = 0;
  const caller = createHarnessCaller({
    baseUrl: "http://harness.local",
    serviceToken: "tok",
    fetchImpl: (async () => {
      n++;
      if (n === 1) throw Object.assign(new Error("boom"), { name: "TypeError" });
      return jsonRes(200, { ok: true });
    }) as unknown as typeof fetch,
  });
  const out = await caller(REQ);
  check("retry: network failure then success -> ok", out.ok === true);
  check("retry: exactly one retry (2 attempts)", n === 2, String(n));
}
{
  let n = 0;
  const caller = createHarnessCaller({
    baseUrl: "http://harness.local",
    fetchImpl: (async () => { n++; return jsonRes(n === 1 ? 503 : 200, { ok: true }); }) as unknown as typeof fetch,
  });
  const out = await caller(REQ);
  check("retry: 503 then 200 -> ok", out.ok === true && (out as { httpStatus: number }).httpStatus === 200);
  check("retry: retried once on 503", n === 2, String(n));
}
{
  let n = 0;
  const caller = createHarnessCaller({
    baseUrl: "http://harness.local",
    fetchImpl: (async () => { n++; return jsonRes(422, { status: "failed" }); }) as unknown as typeof fetch,
  });
  const out = await caller(REQ);
  check("retry: 4xx is NOT retried", n === 1, String(n));
  check("retry: 4xx surfaced verbatim", out.ok === true && (out as { httpStatus: number }).httpStatus === 422);
}
{
  const caller = createHarnessCaller({ baseUrl: "", fetchImpl: (async () => jsonRes(200, {})) as unknown as typeof fetch });
  const out = await caller(REQ);
  check("misconfigured baseUrl -> failure, no call", out.ok === false);
}

// ===========================================================================
console.log("\n[9] Live MissionTurn assembly (memory deps injected)");
// ===========================================================================
{
  // Completed mission -> a live MissionTurn is composed on the TypeScript side
  // (Memory Core + Conversation Runtime) and packaged onto the response.
  const deps = fixtureDeps("01_completed_renewal_risk.json", { withMemory: true });
  const res = await executeMissionRequest(
    { missionId: "M-RENEWAL-1", scenarioId: "renewal-risk-happy-path", actor: "amit", actorRole: "owner" },
    deps);
  const turn = res.body.missionTurn;
  check("live: HTTP 200", res.httpStatus === 200, String(res.httpStatus));
  check("live: missionTurn present", turn !== null);
  check("live: turn status completed", turn?.status === "completed");
  check("live: payload still carried", res.body.missionExecutionPayload !== null);
  const completed = turn?.status === "completed" ? turn : null;
  check("live: personaResponse composed by TS", !!completed && typeof completed.personaResponse === "object" && completed.personaResponse !== null);
  check("live: voiceSummary present", !!completed && typeof completed.voiceSummary === "string" && completed.voiceSummary.length > 0);
  check("live: turn simulated", completed?.simulated === true);
  check("live: turn account is canonical Curefoods", completed?.account.ventureOsId === "VOS-CUREFOODS");
  // The composed turn is NOT a Python artifact: Python carried no PersonaResponse.
  check("live: outgoing request had no PersonaResponse", containsNoPersonaResponse(deps.captured[0]).ok);
}
{
  // A completed replay surfaces `replayed: true` on the BFF envelope.
  const deps = fixtureDeps("01_completed_renewal_risk.json", {
    withMemory: true,
    mutate: (r) => ({
      ...r,
      missionEvaluationResult: r.missionEvaluationResult
        ? { ...r.missionEvaluationResult, replayed: true }
        : r.missionEvaluationResult,
    }),
  });
  const res = await executeMissionRequest(
    { missionId: "M-RENEWAL-1", scenarioId: "renewal-risk-happy-path", actor: "amit", actorRole: "owner" },
    deps);
  check("replay: envelope flags replayed=true", res.body.replayed === true);
  check("replay: still HTTP 200 completed", res.httpStatus === 200 && res.body.status === "completed");
}
{
  // Governed outcome -> a governed, NON-executable turn with NO PersonaResponse.
  const deps = fixtureDeps("03_blocked_unsupported_signal.json", { withMemory: true });
  const res = await executeMissionRequest(
    { missionId: "M", scenarioId: "s", actor: "a", actorRole: "r" }, deps);
  const turn = res.body.missionTurn;
  check("governed: missionTurn present", turn !== null);
  check("governed: turn status blocked", turn?.status === "blocked");
  check("governed: turn carries no personaResponse",
    !!turn && !("personaResponse" in (turn as unknown as Record<string, unknown>)));
  check("governed: no payload", res.body.missionExecutionPayload === null);
}
{
  // Assembly must FAIL CLOSED: a payload whose retrieval subject no longer matches
  // the canonical account cannot be composed -> HTTP 500, no completed turn.
  const deps = fixtureDeps("01_completed_renewal_risk.json", {
    withMemory: true,
    mutate: (r) => {
      const p = r.missionExecutionPayload;
      if (!p) return r;
      return {
        ...r,
        missionExecutionPayload: {
          ...p,
          retrievalQuery: { ...p.retrievalQuery, subjectId: "VOS-WRONG" },
        },
      };
    },
  });
  const res = await executeMissionRequest(
    { missionId: "M-RENEWAL-1", scenarioId: "renewal-risk-happy-path", actor: "amit", actorRole: "owner" },
    deps);
  check("fail-closed: HTTP 500", res.httpStatus === 500, String(res.httpStatus));
  check("fail-closed: status failed", res.body.status === "failed");
  check("fail-closed: no completed turn", res.body.missionTurn === null);
  check("fail-closed: no payload leaked", res.body.missionExecutionPayload === null);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log("\n" + "=".repeat(70));
console.log(`Mission BFF evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All Mission BFF checks passed. Governed one-way boundary holds.");
console.log("=".repeat(70));
