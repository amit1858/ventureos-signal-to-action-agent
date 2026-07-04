// Release 2.1B — Memory Intelligence · Deterministic Evaluation Suite
// ==================================================================
// APEF: Deterministic AI + Evidence-first + Explainability.
//
// Validates the retrieval intelligence layer's guarantees:
//     same store + same query  ->  same ranked, explained results  ->  always.
//
// Covered: ranking determinism, replay stability, tie-break by recordId, decay
// monotonicity, factor-sum integrity, store read-only snapshot equality, limit,
// subject/category filters, empty/no-match, evidence-first behavior, and the
// full anti-repetition contract (missing currentTurn throws, valid currentTurn
// deterministic, hard suppression, critical exception, soft-penalty decay,
// empty-history skip). No randomness, no wall clock: time is injected via asOfMs
// and turns are injected integers.
//
// Run:  node --disable-warning=ExperimentalWarning --import ./register.mjs ./memoryIntelligence.eval.ts

import {
  MemoryStore,
  retrieve,
  RetrievalError,
  deriveRecordId,
  retrievalDecayScore,
  repeatPenalty,
  evaluateAntiRepetition,
  REPEAT_WINDOW_TURNS,
  RETRIEVAL_WEIGHTS,
} from "../index";
import type {
  MemoryEvent,
  ReducerContext,
  MemoryRecord,
  RetrievalQuery,
  RankedMemory,
} from "../index";

// ---------------------------------------------------------------------------
// Tiny deterministic test harness (matches memoryCore.eval.ts)
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

function stable(o: unknown): string {
  return JSON.stringify(o);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Fixed, injected clock + fixtures
// ---------------------------------------------------------------------------

const ASOF = Date.parse("2026-01-15T00:00:00.000Z");
const ctx: ReducerContext = { asOfMs: ASOF };
const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO timestamp for `n` whole days before the fixed ASOF clock. */
function daysBefore(n: number): string {
  return new Date(ASOF - n * DAY_MS).toISOString();
}

interface EvOpts {
  eventId: string;
  subjectId: string;
  category?: MemoryEvent["category"];
  quality?: MemoryEvent["source"]["quality"];
  module?: MemoryEvent["source"]["module"];
  entity?: string;
  timestamp: string;
  summary?: string;
  evidence?: MemoryEvent["evidence"];
  signals?: MemoryEvent["signals"];
  dedupeKey?: string;
  subjectLabel?: string;
}

function ev(o: EvOpts): MemoryEvent {
  return {
    eventId: o.eventId,
    source: {
      module: o.module ?? "decision_ledger",
      entity: o.entity ?? o.subjectId,
      quality: o.quality ?? "authoritative",
    },
    category: o.category ?? "decision",
    subjectId: o.subjectId,
    subjectLabel: o.subjectLabel ?? o.subjectId,
    timestamp: o.timestamp,
    summary: o.summary ?? "Generic memory summary.",
    evidence: o.evidence ?? [{ ref: `${o.eventId}:e1`, label: "Evidence 1" }],
    signals: o.signals ?? {},
    dedupeKey: o.dedupeKey ?? "dk",
  };
}

const q = (over: Partial<RetrievalQuery> = {}): RetrievalQuery => ({ asOfMs: ASOF, ...over });

// ===========================================================================
console.log("\n[1] Ranking determinism + store read-only");
// ===========================================================================
{
  const events: MemoryEvent[] = [
    ev({ eventId: "e-a", subjectId: "ACC-1", category: "decision", timestamp: daysBefore(1),
      signals: { governance: true, customerImpact: 0.8, revenueImpact: 0.6 },
      evidence: [{ ref: "a1", label: "l" }, { ref: "a2", label: "l" }], dedupeKey: "d-a" }),
    ev({ eventId: "e-b", subjectId: "ACC-1", category: "risk", timestamp: daysBefore(10),
      quality: "inferred", module: "drift_engine",
      signals: { revenueImpact: 0.4 }, dedupeKey: "d-b" }),
    ev({ eventId: "e-c", subjectId: "ACC-2", category: "opportunity", timestamp: daysBefore(3),
      quality: "derived", module: "recommendation_delta",
      signals: { revenueImpact: 0.7, customerImpact: 0.5 }, dedupeKey: "d-c" }),
  ];
  const store = MemoryStore.replay(events, ctx);
  const before = stable(store.snapshot());

  const r1 = retrieve(store, q());
  const r2 = retrieve(store, q());
  eq("identical query -> identical result", r1, r2);
  check("result is implemented", r1.implemented === true);
  check("all candidates returned (no limit hit)", r1.results.length === 3);
  check("diagnostics candidateCount = 3", r1.diagnostics.candidateCount === 3);
  check("anti-repetition NOT applied (no history)", r1.diagnostics.antiRepetitionApplied === false);

  const after = stable(store.snapshot());
  check("store snapshot unchanged after retrieve (read-only)", before === after);

  // Ranks are contiguous 1..N and sorted by score desc then recordId asc.
  let ok = true;
  for (let i = 0; i < r1.results.length; i++) {
    if (r1.results[i].rank !== i + 1) ok = false;
    if (i > 0) {
      const prev = r1.results[i - 1];
      const cur = r1.results[i];
      if (prev.score < cur.score) ok = false;
      if (prev.score === cur.score && prev.record.recordId > cur.record.recordId) ok = false;
    }
  }
  check("results ranked score-desc, recordId-asc, contiguous ranks", ok);
}

// ===========================================================================
console.log("\n[2] Replay stability — same events+clock -> same retrieval");
// ===========================================================================
{
  const events: MemoryEvent[] = [
    ev({ eventId: "r-1", subjectId: "ACC-9", category: "decision", timestamp: daysBefore(2),
      signals: { governance: true, revenueImpact: 0.5 }, dedupeKey: "r1" }),
    ev({ eventId: "r-2", subjectId: "ACC-9", category: "risk", timestamp: daysBefore(40),
      quality: "inferred", signals: { customerImpact: 0.9 }, dedupeKey: "r2" }),
  ];
  const a = MemoryStore.replay(events, ctx);
  const b = MemoryStore.replay(events, ctx);
  eq("replayed stores retrieve identically", retrieve(a, q()), retrieve(b, q()));
}

// ===========================================================================
console.log("\n[3] Tie-break by recordId");
// ===========================================================================
{
  // Two records with identical scoring inputs but different subjects -> equal
  // score, distinct recordId -> deterministic tie broken by recordId ascending.
  const events: MemoryEvent[] = [
    ev({ eventId: "t-1", subjectId: "ACC-T1", category: "decision", timestamp: daysBefore(5),
      quality: "authoritative", signals: { revenueImpact: 0.5 },
      evidence: [{ ref: "t1a", label: "l" }], dedupeKey: "t" }),
    ev({ eventId: "t-2", subjectId: "ACC-T2", category: "decision", timestamp: daysBefore(5),
      quality: "authoritative", signals: { revenueImpact: 0.5 },
      evidence: [{ ref: "t2a", label: "l" }], dedupeKey: "t" }),
  ];
  const store = MemoryStore.replay(events, ctx);
  const res = retrieve(store, q());
  check("two tied candidates returned", res.results.length === 2);
  check("scores are equal (a genuine tie)", res.results[0].score === res.results[1].score);
  const ids = res.results.map((r) => r.record.recordId);
  const sorted = [...ids].sort();
  eq("tied results ordered by recordId ascending", ids, sorted);
  check("tie-break note present on tied results",
    res.results[0].explanation.tieBreak !== undefined &&
    res.results[1].explanation.tieBreak !== undefined);
}

// ===========================================================================
console.log("\n[4] Decay monotonicity + aged cap");
// ===========================================================================
{
  const ages = [0, 1, 2, 7, 8, 30, 31, 90, 91, 200, 400];
  let monotone = true;
  let prev = Number.POSITIVE_INFINITY;
  for (const age of ages) {
    const s = retrievalDecayScore(daysBefore(age), ASOF, "new");
    if (s > prev) monotone = false;
    prev = s;
  }
  check("decay score is non-increasing as age grows", monotone);
  check("fresh (<=1d) decay is 1.0", retrievalDecayScore(daysBefore(0), ASOF, "new") === 1.0);
  const agedScore = retrievalDecayScore(daysBefore(5), ASOF, "aged");
  check("aged lifecycle caps decay at <= 0.4", agedScore <= 0.4);
}

// ===========================================================================
console.log("\n[5] Factor-sum integrity — finalScore === sum(contributions)");
// ===========================================================================
{
  const events: MemoryEvent[] = [
    ev({ eventId: "f-1", subjectId: "ACC-1", category: "decision", timestamp: daysBefore(1),
      signals: { governance: true, customerImpact: 1, revenueImpact: 1 }, dedupeKey: "f1" }),
    ev({ eventId: "f-2", subjectId: "ACC-1", category: "risk", timestamp: daysBefore(200),
      quality: "inferred", signals: { revenueImpact: 0.3 }, dedupeKey: "f2" }),
  ];
  const store = MemoryStore.replay(events, ctx);
  const res = retrieve(store, q({ matchTerms: ["memory", "summary"] }));
  let allOk = res.results.length > 0;
  for (const r of res.results) {
    const sum = round4(r.explanation.factors.reduce((s, f) => s + f.contribution, 0));
    if (sum !== r.explanation.finalScore) allOk = false;
    if (r.explanation.finalScore !== r.score) allOk = false;
    // per-factor: contribution === round4(value * weight)
    for (const f of r.explanation.factors) {
      if (round4(f.value * f.weight) !== f.contribution) allOk = false;
    }
  }
  check("every result: sum(contributions) === finalScore === score", allOk);
  check("importance weight is the published 0.40", RETRIEVAL_WEIGHTS.importance === 0.4);
}

// ===========================================================================
console.log("\n[6] Limit honored");
// ===========================================================================
{
  const events: MemoryEvent[] = [
    ev({ eventId: "l-1", subjectId: "ACC-1", category: "decision", timestamp: daysBefore(1),
      signals: { governance: true }, dedupeKey: "l1" }),
    ev({ eventId: "l-2", subjectId: "ACC-2", category: "risk", timestamp: daysBefore(2),
      signals: { revenueImpact: 0.9 }, dedupeKey: "l2" }),
    ev({ eventId: "l-3", subjectId: "ACC-3", category: "opportunity", timestamp: daysBefore(3),
      signals: { customerImpact: 0.5 }, dedupeKey: "l3" }),
  ];
  const store = MemoryStore.replay(events, ctx);
  check("limit=1 returns exactly one result", retrieve(store, q({ limit: 1 })).results.length === 1);
  check("limit=0 returns no results", retrieve(store, q({ limit: 0 })).results.length === 0);
  check("candidateCount still reflects full recall under limit",
    retrieve(store, q({ limit: 1 })).diagnostics.candidateCount === 3);
}

// ===========================================================================
console.log("\n[7] Subject / category filters");
// ===========================================================================
{
  const events: MemoryEvent[] = [
    ev({ eventId: "s-1", subjectId: "ACC-1", category: "decision", timestamp: daysBefore(1), dedupeKey: "s1" }),
    ev({ eventId: "s-2", subjectId: "ACC-1", category: "risk", timestamp: daysBefore(2), dedupeKey: "s2" }),
    ev({ eventId: "s-3", subjectId: "ACC-2", category: "risk", timestamp: daysBefore(3), dedupeKey: "s3" }),
  ];
  const store = MemoryStore.replay(events, ctx);

  const bySubject = retrieve(store, q({ subjectId: "ACC-1" }));
  check("subject filter returns only ACC-1", bySubject.results.every((r) => r.record.subjectId === "ACC-1"));
  check("subject filter count = 2", bySubject.results.length === 2);

  const byCategory = retrieve(store, q({ categories: ["risk"] }));
  check("category filter returns only risk", byCategory.results.every((r) => r.record.category === "risk"));
  check("category filter count = 2", byCategory.results.length === 2);
}

// ===========================================================================
console.log("\n[8] Empty store / no-match");
// ===========================================================================
{
  const empty = new MemoryStore();
  const er = retrieve(empty, q());
  check("empty store -> implemented true", er.implemented === true);
  check("empty store -> zero results", er.results.length === 0);
  check("empty store -> zero candidates", er.diagnostics.candidateCount === 0);

  const store = MemoryStore.replay(
    [ev({ eventId: "n-1", subjectId: "ACC-1", category: "decision", timestamp: daysBefore(1), dedupeKey: "n1" })],
    ctx,
  );
  const nomatch = retrieve(store, q({ matchTerms: ["zzznotpresentzzz"] }));
  check("no-match term -> zero results", nomatch.results.length === 0);
  check("no-match term -> zero candidates", nomatch.diagnostics.candidateCount === 0);
}

// ===========================================================================
console.log("\n[9] Evidence-first ranking behavior");
// ===========================================================================
{
  // Y: high raw importance (governance) but stale + inferred + single evidence.
  // X: lower raw importance but fresh + authoritative + rich evidence.
  // Confidence + decay should temper Y so the well-evidenced fresh X outranks it.
  const events: MemoryEvent[] = [
    ev({ eventId: "x-1", subjectId: "ACC-X", category: "opportunity", timestamp: daysBefore(1),
      quality: "authoritative",
      signals: { revenueImpact: 0.6, customerImpact: 0.5 },
      evidence: [{ ref: "x1", label: "l" }, { ref: "x2", label: "l" }, { ref: "x3", label: "l" }],
      dedupeKey: "x" }),
    ev({ eventId: "y-1", subjectId: "ACC-Y", category: "risk", timestamp: daysBefore(300),
      quality: "inferred", module: "drift_engine",
      signals: { governance: true, revenueImpact: 1, customerImpact: 1 },
      evidence: [{ ref: "y1", label: "l" }],
      dedupeKey: "y" }),
  ];
  const store = MemoryStore.replay(events, ctx);
  const res = retrieve(store, q());
  const xId = deriveRecordId(events[0]);
  const yId = deriveRecordId(events[1]);
  check("fresh well-evidenced record outranks stale high-importance one",
    res.results[0].record.recordId === xId && res.results[1].record.recordId === yId,
    `order=${res.results.map((r) => r.record.recordId).join(",")} (x=${xId}, y=${yId})`);
}

// ===========================================================================
console.log("\n[10] Anti-repetition — missing currentTurn throws");
// ===========================================================================
{
  const store = MemoryStore.replay(
    [ev({ eventId: "ar-1", subjectId: "ACC-1", category: "decision", timestamp: daysBefore(1), dedupeKey: "ar1" })],
    ctx,
  );
  const rid = deriveRecordId(
    ev({ eventId: "ar-1", subjectId: "ACC-1", category: "decision", timestamp: daysBefore(1), dedupeKey: "ar1" }),
  );
  let threw = false;
  let isRetrievalError = false;
  try {
    retrieve(store, q({ servedHistory: [{ recordId: rid, servedTurn: 1 }] }));
  } catch (e) {
    threw = true;
    isRetrievalError = e instanceof RetrievalError;
  }
  check("non-empty servedHistory without currentTurn throws", threw);
  check("thrown error is a RetrievalError", isRetrievalError);
}

// ===========================================================================
console.log("\n[11] Anti-repetition — valid currentTurn is deterministic");
// ===========================================================================
{
  const events: MemoryEvent[] = [
    ev({ eventId: "v-1", subjectId: "ACC-1", category: "decision", timestamp: daysBefore(1),
      signals: { governance: true }, dedupeKey: "v1" }),
    ev({ eventId: "v-2", subjectId: "ACC-2", category: "risk", timestamp: daysBefore(2),
      signals: { revenueImpact: 0.5 }, dedupeKey: "v2" }),
  ];
  const store = MemoryStore.replay(events, ctx);
  const served = [{ recordId: deriveRecordId(events[1]), servedTurn: 4 }];
  const query = q({ servedHistory: served, currentTurn: 10 });
  eq("valid currentTurn retrieval is repeatable", retrieve(store, query), retrieve(store, query));
  check("anti-repetition applied flag is true", retrieve(store, query).diagnostics.antiRepetitionApplied === true);
}

// ===========================================================================
console.log("\n[12] Anti-repetition — hard suppression (recent, non-critical)");
// ===========================================================================
{
  const events: MemoryEvent[] = [
    ev({ eventId: "h-1", subjectId: "ACC-1", category: "decision", timestamp: daysBefore(1),
      signals: { customerImpact: 0.5 }, dedupeKey: "h1" }), // low importance
    ev({ eventId: "h-2", subjectId: "ACC-2", category: "risk", timestamp: daysBefore(2),
      signals: { revenueImpact: 0.5 }, dedupeKey: "h2" }),
  ];
  const store = MemoryStore.replay(events, ctx);
  const suppressedId = deriveRecordId(events[0]);
  const res = retrieve(store, q({
    servedHistory: [{ recordId: suppressedId, servedTurn: 9 }],
    currentTurn: 10, // distance 1 < REPEAT_WINDOW_TURNS
  }));
  check(`recently-served non-critical record is suppressed (window=${REPEAT_WINDOW_TURNS})`,
    res.suppressed.some((s) => s.recordId === suppressedId));
  check("suppressed record absent from results",
    !res.results.some((r) => r.record.recordId === suppressedId));
  check("the other record still ranks", res.results.some((r) => r.record.recordId === deriveRecordId(events[1])));
}

// ===========================================================================
console.log("\n[13] Anti-repetition — critical exception (penalized, not suppressed)");
// ===========================================================================
{
  const criticalEvent = ev({
    eventId: "c-1", subjectId: "ACC-1", category: "decision", timestamp: daysBefore(1),
    signals: { governance: true, customerImpact: 1, revenueImpact: 1 }, dedupeKey: "c1",
  });
  const store = MemoryStore.replay([criticalEvent], ctx);
  const critId = deriveRecordId(criticalEvent);
  const rec = store.read(critId) as MemoryRecord;
  check("fixture record is critical tier", rec.importance.tier === "critical");

  const res = retrieve(store, q({
    servedHistory: [{ recordId: critId, servedTurn: 9 }],
    currentTurn: 10, // distance 1 -> would suppress a non-critical record
  }));
  check("critical record NOT suppressed", !res.suppressed.some((s) => s.recordId === critId));
  check("critical record present in results", res.results.some((r) => r.record.recordId === critId));
  const critResult = res.results.find((r) => r.record.recordId === critId) as RankedMemory;
  const arFactor = critResult.explanation.factors.find((f) => f.dimension === "anti_repetition");
  check("critical record carries a negative anti_repetition factor",
    arFactor !== undefined && arFactor.contribution < 0);
}

// ===========================================================================
console.log("\n[14] Anti-repetition — soft penalty decreases with turn distance");
// ===========================================================================
{
  // Direct penalty curve is monotonic non-increasing and recovers to 0.
  let monotone = true;
  let prev = Number.POSITIVE_INFINITY;
  for (let d = 1; d <= 7; d++) {
    const p = repeatPenalty(d);
    if (p > prev) monotone = false;
    prev = p;
  }
  check("repeatPenalty is non-increasing over distance 1..7", monotone);
  check("penalty fully recovers to 0 at recovery horizon", repeatPenalty(6) === 0 && repeatPenalty(7) === 0);

  // Via evaluateAntiRepetition on a critical record (soft-penalized at any dist).
  const critEvent = ev({
    eventId: "sp-1", subjectId: "ACC-1", category: "decision", timestamp: daysBefore(1),
    signals: { governance: true, customerImpact: 1, revenueImpact: 1 }, dedupeKey: "sp1",
  });
  const store = MemoryStore.replay([critEvent], ctx);
  const rec = store.read(deriveRecordId(critEvent)) as MemoryRecord;
  const near = evaluateAntiRepetition(rec, 7, 10); // distance 3
  const far = evaluateAntiRepetition(rec, 6, 10); // distance 4
  const pNear = near.kind === "penalty" ? Math.abs(near.factor.contribution) : 0;
  const pFar = far.kind === "penalty" ? Math.abs(far.factor.contribution) : 0;
  check("soft penalty at distance 3 >= penalty at distance 4", pNear >= pFar);
}

// ===========================================================================
console.log("\n[15] Anti-repetition — empty/absent history skips history logic");
// ===========================================================================
{
  const events: MemoryEvent[] = [
    ev({ eventId: "sk-1", subjectId: "ACC-1", category: "decision", timestamp: daysBefore(1),
      signals: { governance: true }, dedupeKey: "sk1" }),
  ];
  const store = MemoryStore.replay(events, ctx);

  const absent = retrieve(store, q()); // no servedHistory
  const empty = retrieve(store, q({ servedHistory: [] })); // empty servedHistory
  check("absent history -> antiRepetitionApplied false", absent.diagnostics.antiRepetitionApplied === false);
  check("empty history -> antiRepetitionApplied false", empty.diagnostics.antiRepetitionApplied === false);
  const noArFactors = [...absent.results, ...empty.results].every(
    (r) => !r.explanation.factors.some((f) => f.dimension === "anti_repetition"),
  );
  check("no anti_repetition factors when history is empty/absent", noArFactors);
  check("empty history: no history-based suppression", empty.suppressed.length === 0 && absent.suppressed.length === 0);
  // currentTurn is ignored (not required) when history is empty.
  let ok = true;
  try {
    retrieve(store, q({ servedHistory: [] }));
  } catch {
    ok = false;
  }
  check("empty history + no currentTurn does NOT throw", ok);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log("\n" + "=".repeat(70));
console.log(`Deterministic evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All deterministic retrieval evaluations passed. Same store -> same ranked memory.");
console.log("=".repeat(70));
