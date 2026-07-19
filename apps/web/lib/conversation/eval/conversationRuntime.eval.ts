// Release 2.1C — Conversation Runtime · Deterministic Evaluation Suite
// ===================================================================
// APEF: Deterministic AI + Evidence-first + Explainability.
//
// Proves the runtime's guarantees:
//   same store + same context + same session -> same PersonaResponse -> always.
//
// Covered: composition determinism, turn-sequence replay, served-history ledger
// update, anti-repetition handoff into retrieval, malformed currentTurn guard
// (RetrievalError surfaced, not swallowed), evidence-before-confidence, no-
// overclaim wording for low-confidence records, empty-memory fallback, all-
// suppressed fallback, store read-only snapshot equality, explanation passthrough
// integrity, voice-summary always present/markdown-free/length-bounded, and that
// the composer does not re-rank retrieval results. No randomness, no wall clock:
// time is injected via asOfMs and turns are injected integers.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//        --import ../../memory/eval/register.mjs ./conversationRuntime.eval.ts

import { MemoryStore, retrieve, RetrievalError } from "../../memory";
import type { MemoryEvent, ReducerContext } from "../../memory";
import {
  composeResponse,
  createSession,
  advance,
  buildRetrievalQuery,
  containsHedge,
  containsForbiddenOverclaim,
  respectsConfidence,
  VOICE_SUMMARY_MAX_CHARS,
} from "../index";
import type { ConversationContext, ConversationSession, PersonaResponse } from "../index";

// ---------------------------------------------------------------------------
// Tiny deterministic test harness (matches memoryIntelligence.eval.ts)
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

function eq(name: string, a: unknown, b: unknown): void {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  check(name, sa === sb, sa === sb ? "" : `expected ${sb}, got ${sa}`);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Deterministic fixtures — time injected, never read from a clock
// ---------------------------------------------------------------------------

const ASOF = Date.UTC(2026, 0, 1); // fixed reference epoch-ms
const ctx: ReducerContext = { asOfMs: ASOF };
const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number): string => new Date(ASOF - daysAgo * DAY).toISOString();

// High confidence (authoritative + fresh + 3 evidence => score 1.0 => high band),
// non-critical importance.
const evHigh: MemoryEvent = {
  eventId: "e-high",
  source: { module: "decision_ledger", entity: "led-1", quality: "authoritative" },
  category: "decision",
  subjectId: "acme",
  subjectLabel: "Acme Corp",
  timestamp: iso(0),
  summary: "renewal decision approved for Q3",
  evidence: [
    { ref: "ledger:1", label: "Decision ledger entry" },
    { ref: "doc:approval", label: "Signed approval", detail: "VP Sales" },
    { ref: "thread:42", label: "Approval thread" },
  ],
  signals: { revenueImpact: 0.5, customerImpact: 0.5 },
};

// High confidence, different category (derived + fresh + 2 evidence => 0.815 => high).
const evEngagement: MemoryEvent = {
  eventId: "e-eng",
  source: { module: "account_timeline", entity: "acct-1", quality: "derived" },
  category: "engagement",
  subjectId: "acme",
  subjectLabel: "Acme Corp",
  timestamp: iso(0),
  summary: "executive sponsor meeting held",
  evidence: [
    { ref: "cal:9", label: "Calendar event" },
    { ref: "notes:9", label: "Meeting notes" },
  ],
  signals: { customerImpact: 0.4 },
};

// Low confidence (external + stale + 1 evidence => 0.42 => low band), non-critical.
const evLow: MemoryEvent = {
  eventId: "e-low",
  source: { module: "drift_engine", entity: "sig-1", quality: "external" },
  category: "risk",
  subjectId: "acme",
  subjectLabel: "Acme Corp",
  timestamp: iso(200),
  summary: "possible churn signal from support tickets",
  evidence: [{ ref: "ticket:77", label: "Support ticket cluster" }],
  signals: { sellerImpact: 0.2 },
};

function buildStore(): MemoryStore {
  const store = new MemoryStore();
  store.ingest([evHigh, evEngagement, evLow], ctx);
  return store;
}

const persona = { id: "seller-ai", role: "Seller AI", tone: "advisory" as const };
const baseCtx: ConversationContext = {
  persona,
  intent: "resume",
  subjectId: "acme",
  asOfMs: ASOF,
  limit: 10,
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function assertVoice(name: string, v: string): void {
  check(`${name}: voice defined + non-empty`, typeof v === "string" && v.length > 0);
  check(`${name}: voice length-bounded`, v.length <= VOICE_SUMMARY_MAX_CHARS);
  check(`${name}: voice markdown-free`, !/[*_`#>\[\]\n\t]/.test(v));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const store = buildStore();
const s0 = createSession("conv-1");
const r1 = composeResponse(store, baseCtx, s0);

// 1. Composition determinism -------------------------------------------------
const r1b = composeResponse(store, baseCtx, s0);
eq("composition determinism (same inputs -> same response)", r1, r1b);

// baseline sanity
check("turn 1 surfaces memory", r1.segments.length > 0);
check("turn 1 no fallback path when memory exists", r1.fallback !== "no_memory");

// 2. Evidence-before-confidence ---------------------------------------------
check(
  "every non-fallback segment has >= 1 citation",
  r1.segments.every((s) => s.citations.length >= 1),
);
check("response citations deduped + non-empty", r1.citations.length >= 1);

// 3. Composer does NOT re-rank ----------------------------------------------
const direct1 = retrieve(store, buildRetrievalQuery(baseCtx, s0));
const retrievalOrder = direct1.results.map((r) => r.record.recordId);
const segOrder = r1.segments.map((s) => s.recordId);
eq("composer preserves retrieval order (no re-rank)", segOrder, retrievalOrder);
check(
  "segment ranks are non-decreasing",
  r1.segments.every((s, i, a) => i === 0 || a[i - 1].rank <= s.rank),
);

// 4. Explanation passthrough integrity --------------------------------------
for (const seg of r1.segments) {
  const ranked = direct1.results.find((x) => x.record.recordId === seg.recordId);
  check(`explanation source exists for ${seg.recordId}`, ranked !== undefined);
  if (!ranked) continue;
  eq(`factors forwarded verbatim for ${seg.recordId}`, seg.explanation.factors, ranked.explanation.factors);
  check(
    `finalScore equals retrieval score for ${seg.recordId}`,
    seg.explanation.finalScore === ranked.score,
  );
  const sum = round4(seg.explanation.factors.reduce((a, f) => a + f.contribution, 0));
  check(
    `factor contributions sum to finalScore for ${seg.recordId}`,
    sum === seg.explanation.finalScore,
    `sum=${sum} finalScore=${seg.explanation.finalScore}`,
  );
}

// 5. No-overclaim wording for low-confidence --------------------------------
const lowSeg = r1.segments.find((s) => s.confidenceBand === "low");
check("a low-confidence memory was surfaced", lowSeg !== undefined);
if (lowSeg) {
  check("low-confidence segment is hedged", containsHedge(lowSeg.text));
  check("low-confidence segment avoids overclaim terms", !containsForbiddenOverclaim(lowSeg.text));
  check("low-confidence segment respects confidence", respectsConfidence("low", lowSeg.text));
}
const highSeg = r1.segments.find((s) => s.confidenceBand === "high");
check("a high-confidence memory was surfaced", highSeg !== undefined);

// 6. Voice summary always present / bounded / markdown-free -----------------
assertVoice("turn 1", r1.voiceSummary);

// 7. Served-history ledger update -------------------------------------------
const s1 = advance(s0, r1.servedThisTurn);
check("turn advanced by exactly 1", s1.currentTurn === s0.currentTurn + 1);
check(
  "served records recorded at the serving turn",
  r1.servedThisTurn.every((id) =>
    s1.servedHistory.some((h) => h.recordId === id && h.servedTurn === s0.currentTurn),
  ),
);
check("original session left unmutated", s0.servedHistory.length === 0 && s0.currentTurn === 1);

// 8. Anti-repetition handoff into retrieval + all-suppressed fallback --------
const r2 = composeResponse(store, baseCtx, s1);
check("anti-repetition applied on turn 2", r2.diagnostics.antiRepetitionApplied === true);
const servedTurn1 = new Set(r1.servedThisTurn);
check(
  "records served on turn 1 are not repeated on turn 2",
  r2.segments.every((s) => !servedTurn1.has(s.recordId)),
);
const direct2 = retrieve(store, buildRetrievalQuery(baseCtx, s1));
const suppressed2 = new Set(direct2.suppressed.map((x) => x.recordId));
check(
  "served records were suppressed inside retrieval",
  r1.servedThisTurn.every((id) => suppressed2.has(id)),
);
check("all-recent fallback when everything is suppressed", r2.fallback === "all_recent");
assertVoice("turn 2 (all-recent)", r2.voiceSummary);

// 9. Turn-sequence replay ----------------------------------------------------
function runScript(): { out: PersonaResponse[]; session: ConversationSession } {
  let s: ConversationSession = createSession("conv-replay");
  const out: PersonaResponse[] = [];
  for (let i = 0; i < 3; i++) {
    const r = composeResponse(store, baseCtx, s);
    out.push(r);
    s = advance(s, r.servedThisTurn);
  }
  return { out, session: s };
}
const runA = runScript();
const runB = runScript();
eq("turn-sequence replay: identical responses", runA.out, runB.out);
eq("turn-sequence replay: identical ledger", runA.session.servedHistory, runB.session.servedHistory);
check("turn-sequence replay: identical final turn", runA.session.currentTurn === runB.session.currentTurn);

// 10. Malformed currentTurn guard (RetrievalError surfaced, not swallowed) ---
const malformed = {
  sessionId: "bad",
  currentTurn: undefined as unknown as number,
  servedHistory: [{ recordId: "acme#decision", servedTurn: 1 }],
} as ConversationSession;
let threw = false;
let isRetrievalError = false;
try {
  composeResponse(store, baseCtx, malformed);
} catch (e) {
  threw = true;
  isRetrievalError = e instanceof RetrievalError;
}
check("malformed session (non-empty history, no currentTurn) throws", threw);
check("malformed guard surfaces RetrievalError (not swallowed)", isRetrievalError);

// 11. Empty-memory fallback --------------------------------------------------
const emptyStore = new MemoryStore();
const rEmpty = composeResponse(emptyStore, baseCtx, createSession("empty"));
check("empty store -> no_memory fallback", rEmpty.fallback === "no_memory");
check("empty store -> no segments", rEmpty.segments.length === 0);
check("empty store -> no citations", rEmpty.citations.length === 0);
assertVoice("empty store", rEmpty.voiceSummary);
const rEmpty2 = composeResponse(emptyStore, baseCtx, createSession("empty"));
eq("empty-memory fallback is deterministic", rEmpty, rEmpty2);

// 12. Store read-only snapshot equality -------------------------------------
const roStore = buildStore();
const before = JSON.stringify(roStore.snapshot());
let roSession: ConversationSession = createSession("readonly");
for (let i = 0; i < 4; i++) {
  const r = composeResponse(roStore, baseCtx, roSession);
  roSession = advance(roSession, r.servedThisTurn);
}
const after = JSON.stringify(roStore.snapshot());
check("store snapshot unchanged after a full conversation", before === after);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log("\n" + "=".repeat(70));
console.log(`Deterministic evaluation: ${passed} passed, ${failed} failed.`);
if (failed === 0) {
  console.log("All conversation-runtime evaluations passed. Same inputs -> same persona response.");
} else {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
}
console.log("=".repeat(70));

if (failed > 0) {
  throw new Error(`Conversation-runtime evaluation failed: ${failed} check(s) did not pass.`);
}
