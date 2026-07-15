// Release 2.2 — Mission payload ⇄ Memory/Conversation compatibility eval
// ======================================================================
// Deterministic, dependency-free evaluation that proves a governance-valid
// `MissionExecutionPayload` (emitted by the Python Harness) can be mapped into
// the EXISTING TypeScript Memory + Conversation Runtime public interfaces —
// WITHOUT modifying, re-deriving, or invoking any protected engine internals.
//
// It only demonstrates INPUT COMPATIBILITY at the locked boundary:
//   * canonical VentureOS id -> RetrievalQuery.subjectId (verbatim);
//   * retrieval limit preserved; asOfMs is the injected clock (never Date.now);
//   * a runtime ConversationSession (public `createSession` / `advance`) accepts
//     the mapping and stays deterministic;
//   * evidence references remain traceable (ids only — memory contents are
//     materialised by the protected MemoryStore, never carried across);
//   * the payload intent is a valid ConversationIntent.
//
// The mapping function here is TEST-ONLY (the real BFF is not built yet). The
// compile-time acceptance of these shapes by the real interfaces is enforced by
// the scoped `tsc` step; this eval adds the runtime, value-level assertions.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/missions/eval/missionPayloadCompatibility.eval.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { createSession, advance, INITIAL_TURN } from "../../conversation";
import type { ConversationSession, ConversationIntent } from "../../conversation";
import type { RetrievalQuery } from "../../memory";
import type {
  ContractFixtureEnvelope,
  MissionExecutionPayload,
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
// Fixtures (read-only) + injected clock
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(
  HERE,
  "../../../../../services/api/harness/fixtures/contracts",
);

function loadEnvelope(file: string): ContractFixtureEnvelope {
  return JSON.parse(
    readFileSync(join(FIXTURES_DIR, file), "utf8"),
  ) as ContractFixtureEnvelope;
}

/** Injected, deterministic reference epoch-ms — NEVER Date.now(). */
const ASOF = Date.parse("2026-07-14T10:00:00.000Z");

const VALID_INTENTS: ReadonlySet<ConversationIntent> = new Set<ConversationIntent>([
  "resume",
  "status",
  "risk_review",
  "next_step",
  "recap",
]);

// ---------------------------------------------------------------------------
// TEST-ONLY mapping — payload -> existing public RetrievalQuery interface.
// The real BFF is not built here; this proves the payload's governed inputs are
// STRUCTURALLY acceptable to the protected retrieval interface. It performs no
// business decision: it forwards the canonical id and preserves the governed
// limit and the injected clock. It reads nothing from the MemoryStore.
// ---------------------------------------------------------------------------

function mapPayloadToRetrievalQuery(
  payload: MissionExecutionPayload,
  asOfMs: number,
  session: ConversationSession,
): RetrievalQuery {
  const query: RetrievalQuery = {
    subjectId: payload.canonicalAccount.ventureOsId,
    limit: payload.retrievalQuery.limit,
    asOfMs,
  };
  if (session.servedHistory.length > 0) {
    query.servedHistory = session.servedHistory;
    query.currentTurn = session.currentTurn;
  }
  return query;
}

const COMPLETED = ["01_completed_renewal_risk.json", "02_completed_support_escalation.json"];

// ===========================================================================
console.log("\n[1] Canonical account -> RetrievalQuery.subjectId (verbatim)");
// ===========================================================================
for (const file of COMPLETED) {
  const env = loadEnvelope(file);
  const payload = env.response.missionExecutionPayload as MissionExecutionPayload;
  const session = createSession(`mission:${payload.missionId}`);
  const query = mapPayloadToRetrievalQuery(payload, ASOF, session);

  check(`${env.name}: subjectId is the canonical VentureOS id`,
    query.subjectId === payload.canonicalAccount.ventureOsId, query.subjectId ?? "<none>");
  check(`${env.name}: subjectId matches the payload retrievalQuery.subjectId`,
    query.subjectId === payload.retrievalQuery.subjectId);
  check(`${env.name}: retrieval limit preserved`,
    query.limit === payload.retrievalQuery.limit, String(query.limit));
  check(`${env.name}: asOfMs is the injected clock`, query.asOfMs === ASOF);
  check(`${env.name}: no wall-clock leaked (asOfMs is a finite number)`,
    Number.isFinite(query.asOfMs));
}

// ===========================================================================
console.log("\n[2] ConversationSession compatibility (public runtime API)");
// ===========================================================================
for (const file of COMPLETED) {
  const env = loadEnvelope(file);
  const payload = env.response.missionExecutionPayload as MissionExecutionPayload;
  const session = createSession(`mission:${payload.missionId}`);

  check(`${env.name}: fresh session starts on INITIAL_TURN`,
    session.currentTurn === INITIAL_TURN);
  check(`${env.name}: fresh session has empty served history`,
    session.servedHistory.length === 0);

  // A first mapping (turn 1) needs no anti-repetition context.
  const q1 = mapPayloadToRetrievalQuery(payload, ASOF, session);
  check(`${env.name}: turn-1 query omits currentTurn (empty history)`,
    q1.currentTurn === undefined && q1.servedHistory === undefined);

  // After serving evidence, the runtime advances deterministically and the
  // subsequent mapping carries anti-repetition context.
  const servedIds = payload.evidenceRefs.map((e) => e.recordId);
  const next = advance(session, servedIds);
  check(`${env.name}: advance increments the turn`, next.currentTurn === INITIAL_TURN + 1);
  const q2 = mapPayloadToRetrievalQuery(payload, ASOF, next);
  check(`${env.name}: turn-2 query carries currentTurn + servedHistory`,
    q2.currentTurn === next.currentTurn && (q2.servedHistory?.length ?? 0) === servedIds.length);

  // Determinism: same inputs -> byte-identical mapping.
  const again = mapPayloadToRetrievalQuery(payload, ASOF, createSession(`mission:${payload.missionId}`));
  check(`${env.name}: mapping is deterministic`,
    JSON.stringify(q1) === JSON.stringify(again));
}

// ===========================================================================
console.log("\n[3] Evidence references remain traceable (ids only)");
// ===========================================================================
for (const file of COMPLETED) {
  const env = loadEnvelope(file);
  const payload = env.response.missionExecutionPayload as MissionExecutionPayload;
  check(`${env.name}: at least one evidence reference`, payload.evidenceRefs.length > 0);
  const allTraceable = payload.evidenceRefs.every(
    (e) => typeof e.recordId === "string" && e.recordId.length > 0 &&
           typeof e.category === "string" && typeof e.source === "string",
  );
  check(`${env.name}: every evidence ref is a traceable id+category+source`, allTraceable);
  // References only — no materialised memory contents cross the boundary.
  const carriesNoContents = payload.evidenceRefs.every(
    (e) => !("content" in (e as unknown as Record<string, unknown>)) &&
           !("record" in (e as unknown as Record<string, unknown>)),
  );
  check(`${env.name}: evidence carries references, not memory contents`, carriesNoContents);
}

// ===========================================================================
console.log("\n[4] Intent maps to a valid ConversationIntent");
// ===========================================================================
for (const file of COMPLETED) {
  const env = loadEnvelope(file);
  const payload = env.response.missionExecutionPayload as MissionExecutionPayload;
  check(`${env.name}: intent '${payload.intent}' is a valid ConversationIntent`,
    VALID_INTENTS.has(payload.intent as ConversationIntent), payload.intent);
}

// ===========================================================================
console.log("\n[5] Governed non-executable outcomes yield no retrieval input");
// ===========================================================================
for (const file of [
  "03_blocked_unsupported_signal.json",
  "05_rejected_approval.json",
  "06_revision_required.json",
]) {
  const env = loadEnvelope(file);
  check(`${env.name}: no payload -> no retrieval is attempted`,
    env.response.missionExecutionPayload == null, env.response.status);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log("\n" + "=".repeat(70));
console.log(`Payload compatibility evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All compatibility checks passed. Payload ⇄ Memory/Conversation inputs align.");
console.log("=".repeat(70));
