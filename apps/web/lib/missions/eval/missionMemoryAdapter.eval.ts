// Release 2.2 — Mission memory + conversation adapter eval (F1.5)
// ==============================================================
// Deterministic, dependency-free evaluation of the F1.5 adapter that maps a
// governance-valid `MissionExecutionPayload` onto the EXISTING public Memory
// (2.1A/2.1B) and Conversation Runtime (2.1C) interfaces — reading a store
// seeded through the PUBLIC api only, and modifying no protected engine.
//
// It proves the locked adapter invariants:
//   * canonicalAccount.ventureOsId -> RetrievalQuery.subjectId (verbatim);
//   * the governed retrieval limit and the injected asOfMs are preserved;
//   * the PersonaResponse is TypeScript-generated, deterministic, and cited;
//   * governance facts (state / verification / approval / recommendation /
//     evidence / audit) are forwarded UNCHANGED — never recomputed;
//   * empty memory yields an HONEST runtime fallback, surfaced unchanged;
//   * the session's anti-repetition context is handed to retrieval on later turns;
//   * a structural violation (unknown intent / subject mismatch / missing
//     canonical account) fails CLOSED with a stable MissionAdapterError code.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/missions/eval/missionMemoryAdapter.eval.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { MemoryStore, retrieve } from "../../memory";
import type { MemoryEvent, ReducerContext } from "../../memory";
import { createSession, advance } from "../../conversation";
import {
  composeMissionMemory,
  extractGovernanceContext,
  mapPayloadIntent,
  mapPayloadToConversationContext,
  mapPayloadToRetrievalQuery,
  MissionAdapterError,
} from "../memoryAdapter";
import type { MissionMemoryDeps } from "../memoryAdapter";
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

function threw(name: string, code: string, fn: () => unknown): void {
  try {
    fn();
    check(name, false, "did not throw");
  } catch (err) {
    const ok = err instanceof MissionAdapterError && err.code === code;
    check(name, ok, ok ? "" : `unexpected error: ${String(err)}`);
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

function loadPayload(file: string): MissionExecutionPayload {
  const env = JSON.parse(
    readFileSync(join(FIXTURES_DIR, file), "utf8"),
  ) as ContractFixtureEnvelope;
  return env.response.missionExecutionPayload as MissionExecutionPayload;
}

/** Injected, deterministic reference epoch-ms — NEVER Date.now(). */
const ASOF = Date.parse("2026-07-14T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number): string => new Date(ASOF - daysAgo * DAY).toISOString();
const REDUCER_CTX: ReducerContext = { asOfMs: ASOF };

const SUBJECT = "VOS-CUREFOODS";

// A store seeded through the PUBLIC memory api, keyed on the canonical subject
// so the completed-mission payload retrieves real, citable evidence.
function seededStore(): MemoryStore {
  const evDecision: MemoryEvent = {
    eventId: "e-renewal",
    source: { module: "decision_ledger", entity: "led-9", quality: "authoritative" },
    category: "decision",
    subjectId: SUBJECT,
    subjectLabel: "Curefoods",
    timestamp: iso(1),
    summary: "renewal risk flagged for enterprise account",
    evidence: [
      { ref: "ledger:9", label: "Decision ledger entry" },
      { ref: "doc:qbr", label: "QBR notes", detail: "exec sponsor" },
      { ref: "thread:12", label: "Renewal thread" },
    ],
    signals: { revenueImpact: 0.6, customerImpact: 0.5 },
  };
  const evEngagement: MemoryEvent = {
    eventId: "e-eng",
    source: { module: "account_timeline", entity: "acct-9", quality: "derived" },
    category: "engagement",
    subjectId: SUBJECT,
    subjectLabel: "Curefoods",
    timestamp: iso(2),
    summary: "executive sponsor meeting held with buyer",
    evidence: [
      { ref: "cal:3", label: "Calendar event" },
      { ref: "notes:3", label: "Meeting notes" },
    ],
    signals: { customerImpact: 0.4 },
  };
  const store = new MemoryStore();
  store.ingest([evDecision, evEngagement], REDUCER_CTX);
  return store;
}

function deps(store: MemoryStore, session = createSession(`mission:${SUBJECT}`)): MissionMemoryDeps {
  return {
    store,
    session,
    asOfMs: ASOF,
    persona: { role: "Renewal Coach", tone: "advisory" },
  };
}

const COMPLETED = ["01_completed_renewal_risk.json", "02_completed_support_escalation.json"];

// ===========================================================================
console.log("\n[1] Canonical subject, governed limit, injected clock");
// ===========================================================================
for (const file of COMPLETED) {
  const payload = loadPayload(file);
  const q = mapPayloadToRetrievalQuery(payload, deps(seededStore()));
  check(`${file}: subjectId is the canonical VentureOS id`, q.subjectId === payload.canonicalAccount.ventureOsId);
  check(`${file}: subjectId equals payload retrievalQuery.subjectId`, q.subjectId === payload.retrievalQuery.subjectId);
  check(`${file}: governed limit preserved`, q.limit === payload.retrievalQuery.limit, String(q.limit));
  check(`${file}: asOfMs is the injected clock`, q.asOfMs === ASOF);
}

// ===========================================================================
console.log("\n[2] PersonaResponse is TS-generated, cited, and deterministic");
// ===========================================================================
for (const file of COMPLETED) {
  const payload = loadPayload(file);
  const r1 = composeMissionMemory(payload, deps(seededStore()));
  const r2 = composeMissionMemory(payload, deps(seededStore()));
  check(`${file}: persona identity forwarded (personaId)`, r1.personaResponse.personaId === payload.personaId);
  check(`${file}: intent mapped onto the runtime`, r1.personaResponse.intent === payload.intent);
  check(`${file}: surfaced real memory`, r1.personaResponse.segments.length > 0);
  check(`${file}: every segment carries >= 1 citation`,
    r1.personaResponse.segments.every((s) => s.citations.length >= 1));
  check(`${file}: voiceSummary always present`, typeof r1.personaResponse.voiceSummary === "string" && r1.personaResponse.voiceSummary.length > 0);
  check(`${file}: composition deterministic (byte-identical)`,
    JSON.stringify(r1.personaResponse) === JSON.stringify(r2.personaResponse));
  // The adapter composes exactly what the raw runtime query would — no re-rank.
  const direct = retrieve(seededStore(), r1.retrievalQuery);
  check(`${file}: adapter preserves retrieval order (no re-rank)`,
    JSON.stringify(r1.personaResponse.segments.map((s) => s.recordId)) ===
      JSON.stringify(direct.results.slice(0, r1.personaResponse.segments.length).map((m) => m.record.recordId)));
}

// ===========================================================================
console.log("\n[3] Governance facts forwarded verbatim (never recomputed)");
// ===========================================================================
for (const file of COMPLETED) {
  const payload = loadPayload(file);
  const g = extractGovernanceContext(payload);
  check(`${file}: missionState forwarded`, g.missionState === payload.missionState);
  check(`${file}: selectedTemplateId forwarded`, g.selectedTemplateId === payload.selectedTemplateId);
  check(`${file}: permittedActions forwarded verbatim`,
    JSON.stringify(g.permittedActions) === JSON.stringify(payload.permittedActions));
  check(`${file}: evidenceRefs preserved verbatim`,
    JSON.stringify(g.evidenceRefs) === JSON.stringify(payload.evidenceRefs));
  check(`${file}: verification forwarded verbatim`,
    JSON.stringify(g.verification) === JSON.stringify(payload.verification));
  check(`${file}: verificationRef forwarded`, g.verificationRef === payload.verificationRef);
  check(`${file}: recommendation forwarded verbatim`,
    JSON.stringify(g.recommendation) === JSON.stringify(payload.recommendation));
  check(`${file}: approvalRequest forwarded`,
    JSON.stringify(g.approvalRequest) === JSON.stringify(payload.approvalRequest ?? null));
  check(`${file}: auditRef forwarded`, g.auditRef === payload.auditRef);
  check(`${file}: simulated stays true`, g.simulated === true);
}

// ===========================================================================
console.log("\n[4] Empty memory -> honest runtime fallback (surfaced unchanged)");
// ===========================================================================
{
  const payload = loadPayload("01_completed_renewal_risk.json");
  const r = composeMissionMemory(payload, deps(new MemoryStore()));
  check("empty: no fabricated segments", r.personaResponse.segments.length === 0);
  check("empty: an honest fallback kind is set", r.personaResponse.fallback === "no_memory");
  check("empty: no citations invented", r.personaResponse.citations.length === 0);
  check("empty: voiceSummary still present + safe", r.personaResponse.voiceSummary.length > 0);
  check("empty: governance still forwarded", r.governance.missionState === payload.missionState);
}

// ===========================================================================
console.log("\n[5] Session anti-repetition context handed to retrieval");
// ===========================================================================
{
  const payload = loadPayload("01_completed_renewal_risk.json");
  const store = seededStore();
  const s0 = createSession(`mission:${SUBJECT}`);
  const q1 = mapPayloadToRetrievalQuery(payload, deps(store, s0));
  check("turn-1 query has empty served history",
    (q1.servedHistory?.length ?? 0) === 0);
  check("turn-1 query forwards the session turn (2.1C invariant)",
    q1.currentTurn === s0.currentTurn);
  const first = composeMissionMemory(payload, deps(store, s0));
  const s1 = advance(s0, first.personaResponse.servedThisTurn);
  const q2 = mapPayloadToRetrievalQuery(payload, deps(store, s1));
  check("turn-2 query carries currentTurn + servedHistory",
    q2.currentTurn === s1.currentTurn && (q2.servedHistory?.length ?? 0) === s1.servedHistory.length);
}

// ===========================================================================
console.log("\n[6] Structural violations fail closed with stable codes");
// ===========================================================================
{
  const payload = loadPayload("01_completed_renewal_risk.json");
  threw("unknown intent -> invalid_intent", "invalid_intent", () =>
    mapPayloadToConversationContext({ ...payload, intent: "chit_chat" }, deps(seededStore())));
  threw("mapPayloadIntent rejects unknown", "invalid_intent", () => mapPayloadIntent("nonsense"));
  threw("subject mismatch -> subject_mismatch", "subject_mismatch", () =>
    mapPayloadToConversationContext(
      { ...payload, retrievalQuery: { ...payload.retrievalQuery, subjectId: "VOS-OTHER" } },
      deps(seededStore())));
  threw("missing canonical account -> missing_canonical_account", "missing_canonical_account", () =>
    mapPayloadToConversationContext(
      { ...payload, canonicalAccount: { ventureOsId: "", canonicalName: "x" } },
      deps(seededStore())));
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log("\n" + "=".repeat(70));
console.log(`Mission memory adapter evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All adapter checks passed. Payload -> Memory/Conversation mapping holds.");
console.log("=".repeat(70));
