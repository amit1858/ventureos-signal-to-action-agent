// Release 2.1A — Shared Enterprise Memory Core · Deterministic Evaluation Suite
// ============================================================================
// APEF: Deterministic AI + Evidence-first + Explainability.
//
// Validates the single hard guarantee of this release:
//     same input  ->  same MemoryRecords  ->  always.
//
// Covered: reducer determinism, merge, merge commutativity, duplicate
// suppression, importance, confidence (incl. freshness), lifecycle transitions,
// provenance completeness, archive/compress, store consistency (replay), and
// end-to-end adapter -> store determinism. No randomness, no wall clock: every
// time input is injected via a fixed `asOfMs`.
//
// Run:  node --disable-warning=ExperimentalWarning --import ./register.mjs ./memoryCore.eval.ts

import {
  MemoryStore,
  reduceEvent,
  deriveRecordId,
  computeImportance,
  computeConfidence,
  deriveLifecycle,
  canTransition,
  isProvenanceComplete,
  ProvenanceError,
} from "../index";
import type { MemoryEvent, ReducerContext, MemoryRecord } from "../index";
import { decisionLedgerToEvents } from "../adapters/decisionLedgerAdapter";
import { driftEngineToEvents } from "../adapters/driftEngineAdapter";
import type { LedgerEntry } from "../../decisionLedger";
import type { DriftEvent } from "../../driftEngine";

// ---------------------------------------------------------------------------
// Tiny deterministic test harness
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

// ---------------------------------------------------------------------------
// Fixed, injected clock + fixtures
// ---------------------------------------------------------------------------

const ASOF = Date.parse("2026-01-15T00:00:00.000Z");
const ctx: ReducerContext = { asOfMs: ASOF };

function baseEvent(overrides: Partial<MemoryEvent> = {}): MemoryEvent {
  return {
    eventId: "decision_ledger:LDG-1:decision",
    source: { module: "decision_ledger", entity: "ACC-1", quality: "authoritative" },
    category: "decision",
    subjectId: "ACC-1",
    subjectLabel: "Acme Corp",
    timestamp: "2026-01-14T00:00:00.000Z",
    summary: "Approved renewal outreach for Acme Corp.",
    evidence: [{ ref: "ledger:LDG-1", label: "Decision ledger entry" }],
    signals: { governance: true, customerImpact: 0.8, revenueImpact: 0.6 },
    dedupeKey: "ledger:REC-1",
    ...overrides,
  };
}

// ===========================================================================
console.log("\n[1] Provenance — no record without provenance");
// ===========================================================================
{
  let threw = false;
  try {
    reduceEvent(baseEvent({ source: { module: "decision_ledger", entity: "", quality: "authoritative" } }), ctx);
  } catch (e) {
    threw = e instanceof ProvenanceError;
  }
  check("rejects event missing source entity", threw);

  const r = reduceEvent(baseEvent(), ctx).record;
  check("created record has complete provenance", isProvenanceComplete(r.provenance));
  check("provenance carries event id", r.provenance.eventId === "decision_ledger:LDG-1:decision");
  check("provenance carries origin module", r.provenance.origin === "decision_ledger");
}

// ===========================================================================
console.log("\n[2] Reducer — creation + determinism");
// ===========================================================================
{
  const r1 = reduceEvent(baseEvent(), ctx);
  const r2 = reduceEvent(baseEvent(), ctx);
  check("op is 'created'", r1.op === "created");
  check("eventCount is 1", r1.record.eventCount === 1);
  check("lifecycle is 'new'", r1.record.lifecycle === "new");
  eq("same input -> identical record", r1.record, r2.record);
  check("record id is deterministic", r1.record.recordId === deriveRecordId(baseEvent()));
}

// ===========================================================================
console.log("\n[3] Duplicate suppression");
// ===========================================================================
{
  const store = new MemoryStore();
  const first = store.write(baseEvent(), ctx);
  const second = store.write(baseEvent(), ctx);
  check("first write creates", first.op === "created");
  check("second identical write is suppressed", second.op === "duplicate_suppressed");
  check("store still holds exactly one record", store.size() === 1);
  eq("suppressed write leaves record unchanged", first.record, second.record);
  check("event log has one accepted event", store.events().length === 1);
}

// ===========================================================================
console.log("\n[4] Merge — folding events into one record");
// ===========================================================================
{
  const a = baseEvent({
    eventId: "decision_ledger:LDG-1:decision",
    timestamp: "2026-01-10T00:00:00.000Z",
    summary: "Older decision.",
    evidence: [{ ref: "ledger:LDG-1", label: "A" }],
    signals: { governance: false, customerImpact: 0.4, revenueImpact: 0.2 },
  });
  const b = baseEvent({
    eventId: "decision_ledger:LDG-2:decision",
    timestamp: "2026-01-14T00:00:00.000Z",
    summary: "Newer decision.",
    evidence: [{ ref: "ledger:LDG-2", label: "B" }],
    signals: { governance: true, customerImpact: 0.5, revenueImpact: 0.9 },
  });

  const store = new MemoryStore();
  store.write(a, ctx);
  const merged = store.write(b, ctx);
  check("op is 'merged'", merged.op === "merged");
  check("eventCount is 2", merged.record.eventCount === 2);
  check("lifecycle is 'merged'", merged.record.lifecycle === "merged");
  check("history has both events", merged.record.history.length === 2);
  check("summary tracks newest event", merged.record.summary === "Newer decision.");
  check("firstSeen is earliest", merged.record.firstSeen === "2026-01-10T00:00:00.000Z");
  check("lastUpdated is latest", merged.record.lastUpdated === "2026-01-14T00:00:00.000Z");
  check("evidence is unioned", merged.record.provenance.supportingEvidence.length === 2);
  // Signals consolidate to element-wise strongest.
  check("governance OR-merged to true", merged.record.signals.governance === true);
  check("customerImpact max-merged", merged.record.signals.customerImpact === 0.5);
  check("revenueImpact max-merged", merged.record.signals.revenueImpact === 0.9);

  // Merge is order-independent (commutative) -> determinism regardless of order.
  const storeReversed = new MemoryStore();
  storeReversed.write(b, ctx);
  storeReversed.write(a, ctx);
  eq("merge is commutative (order independent)", store.all(), storeReversed.all());
}

// ===========================================================================
console.log("\n[5] Importance — deterministic + explainable");
// ===========================================================================
{
  const govOnly = computeImportance({ governance: true });
  check("governance-only score is 30", govOnly.score === 30);
  check("governance-only tier is medium", govOnly.tier === "medium");

  const maxed = computeImportance({
    governance: true,
    customerImpact: 1,
    revenueImpact: 1,
    sellerImpact: 1,
    managerImpact: 1,
  });
  check("all-maxed score is 100", maxed.score === 100);
  check("all-maxed tier is critical", maxed.tier === "critical");
  check("factors are itemized (5 dimensions)", maxed.factors.length === 5);

  const low = computeImportance({ customerImpact: 0.5 });
  check("customer-0.5-only score is 12.5", low.score === 12.5);
  check("customer-0.5-only tier is low", low.tier === "low");

  // Determinism
  eq("importance is deterministic", computeImportance({ revenueImpact: 0.7 }), computeImportance({ revenueImpact: 0.7 }));
}

// ===========================================================================
console.log("\n[6] Confidence — deterministic, explainable, freshness-aware");
// ===========================================================================
{
  const best = computeConfidence({
    quality: "authoritative",
    timestampIso: "2026-01-15T00:00:00.000Z",
    asOfMs: ASOF,
    evidenceCount: 3,
  });
  check("authoritative + fresh + 3 evidence = 1.0", best.score === 1);
  check("band is high", best.band === "high");

  const worst = computeConfidence({
    quality: "inferred",
    timestampIso: "2025-06-01T00:00:00.000Z", // ~228 days old
    asOfMs: ASOF,
    evidenceCount: 0,
  });
  check("inferred + stale + no evidence = 0.38", worst.score === 0.38);
  check("band is low", worst.band === "low");

  // Freshness monotonicity: an older asOf-relative age lowers confidence.
  const fresh = computeConfidence({ quality: "derived", timestampIso: "2026-01-14T00:00:00.000Z", asOfMs: ASOF, evidenceCount: 2 });
  const stale = computeConfidence({ quality: "derived", timestampIso: "2025-10-01T00:00:00.000Z", asOfMs: ASOF, evidenceCount: 2 });
  check("fresher memory has higher confidence", fresh.score > stale.score);
  check("confidence factors are itemized (3)", best.factors.length === 3);
  eq("confidence is deterministic", fresh, computeConfidence({ quality: "derived", timestampIso: "2026-01-14T00:00:00.000Z", asOfMs: ASOF, evidenceCount: 2 }));
}

// ===========================================================================
console.log("\n[7] Lifecycle — deterministic transitions");
// ===========================================================================
{
  check("new -> merged allowed", canTransition("new", "merged"));
  check("new -> archived allowed", canTransition("new", "archived"));
  check("archived -> compressed allowed", canTransition("archived", "compressed"));
  check("compressed is terminal", !canTransition("compressed", "active"));
  check("new -> compressed forbidden", !canTransition("new", "compressed"));

  check("single fresh event -> new", deriveLifecycle({ eventCount: 1, lastUpdatedIso: "2026-01-14T00:00:00.000Z", asOfMs: ASOF, flags: {} }) === "new");
  check("two fresh events -> merged", deriveLifecycle({ eventCount: 2, lastUpdatedIso: "2026-01-14T00:00:00.000Z", asOfMs: ASOF, flags: {} }) === "merged");
  check("activated -> active", deriveLifecycle({ eventCount: 1, lastUpdatedIso: "2026-01-14T00:00:00.000Z", asOfMs: ASOF, flags: { activated: true } }) === "active");
  check("stale (>30d) -> aged", deriveLifecycle({ eventCount: 2, lastUpdatedIso: "2025-11-01T00:00:00.000Z", asOfMs: ASOF, flags: {} }) === "aged");
  check("archived flag -> archived", deriveLifecycle({ eventCount: 2, lastUpdatedIso: "2026-01-14T00:00:00.000Z", asOfMs: ASOF, flags: { archived: true } }) === "archived");
  check("compressed flag wins", deriveLifecycle({ eventCount: 2, lastUpdatedIso: "2026-01-14T00:00:00.000Z", asOfMs: ASOF, flags: { archived: true, compressed: true } }) === "compressed");
}

// ===========================================================================
console.log("\n[8] Store — archive / compress (guarded) + hooks");
// ===========================================================================
{
  const store = new MemoryStore();
  store.write(baseEvent(), ctx);
  const id = deriveRecordId(baseEvent());

  const archived = store.archive(id, ctx);
  check("archive sets lifecycle 'archived'", archived?.lifecycle === "archived");

  let hookFired: string | null = null;
  store.registerCompressionHook((rec) => { hookFired = rec.recordId; });
  const compressed = store.compress(id, ctx);
  check("compress sets lifecycle 'compressed'", compressed?.lifecycle === "compressed");
  check("compression hook fired", hookFired === id);

  // Guard: cannot compress a record that is not archived.
  const store2 = new MemoryStore();
  store2.write(baseEvent(), ctx);
  let guarded = false;
  try {
    store2.compress(deriveRecordId(baseEvent()), ctx);
  } catch {
    guarded = true;
  }
  check("compress before archive is rejected", guarded);
}

// ===========================================================================
console.log("\n[9] Store consistency — replay is identical");
// ===========================================================================
{
  const events = [
    baseEvent({ eventId: "decision_ledger:LDG-1:decision", timestamp: "2026-01-10T00:00:00.000Z" }),
    baseEvent({ eventId: "decision_ledger:LDG-2:decision", timestamp: "2026-01-12T00:00:00.000Z", summary: "Second." }),
    baseEvent({ eventId: "decision_ledger:LDG-3:decision", subjectId: "ACC-2", subjectLabel: "Beta Ltd", dedupeKey: "ledger:REC-2", summary: "Other account." }),
  ];
  const store = new MemoryStore();
  store.ingest(events, ctx);
  const replayed = MemoryStore.replay(store.events(), ctx);
  eq("replay reproduces snapshot exactly", store.snapshot(), replayed.snapshot());
  check("no record lacks provenance", store.all().every((r: MemoryRecord) => isProvenanceComplete(r.provenance)));

  const summary = store.summarize();
  check("summary is a placeholder", summary.placeholder === true);
  check("summary counts records", summary.recordCount === store.size());
}

// ===========================================================================
console.log("\n[10] End-to-end — adapters -> store determinism (read-only)");
// ===========================================================================
{
  const ledger: LedgerEntry[] = [
    {
      ledger_id: "LDG-100", recommendation_id: "REC-100", account_id: "ACC-9", account_name: "Zenith Inc",
      recommended_action: "Schedule renewal QBR", decision_type: "approved", reviewer_name: "Dana",
      reviewer_note: "Looks good", confidence: 0.82, risk_level: "high", opportunity_level: 70,
      evidence_count: 6, business_impact: "Protects ₹40L renewal", governance_caveat: "Discount needs VP sign-off",
      source: "deterministic", created_at: "2026-01-13T00:00:00.000Z",
    },
  ];
  const drift: DriftEvent[] = [
    {
      id: "DRF-1", account_id: "ACC-9", account_name: "Zenith Inc", dimension: "renewal", direction: "down",
      delta: 12, before: 60, after: 48, magnitude: "major", impact: "risk", reason: "Renewal window slipping",
      timestamp: "2026-01-14T00:00:00.000Z", agent: "Renewal Agent", signalLabel: "Renewal risk",
    },
    {
      id: "DRF-2", account_id: "ACC-9", account_name: "Zenith Inc", dimension: "renewal", direction: "down",
      delta: 8, before: 48, after: 40, magnitude: "moderate", impact: "risk", reason: "Second slip",
      timestamp: "2026-01-14T06:00:00.000Z", agent: "Renewal Agent", signalLabel: "Renewal risk",
    },
  ];

  // Adapters must not mutate their inputs (protected boundary / purity).
  const ledgerBefore = stable(ledger);
  const driftBefore = stable(drift);

  function buildStore(): MemoryStore {
    const s = new MemoryStore();
    s.ingest(decisionLedgerToEvents(ledger), ctx);
    s.ingest(driftEngineToEvents(drift), ctx);
    return s;
  }

  const runA = buildStore();
  const runB = buildStore();

  check("adapter did not mutate ledger input", stable(ledger) === ledgerBefore);
  check("adapter did not mutate drift input", stable(drift) === driftBefore);
  eq("identical inputs -> identical store snapshot", runA.snapshot(), runB.snapshot());

  // Two drift events on the same dimension fold into one record.
  const driftRecords = runA.all().filter((r: MemoryRecord) => r.provenance.origin === "drift_engine");
  check("same-dimension drift merged into one record", driftRecords.length === 1);
  check("merged drift record has eventCount 2", driftRecords[0]?.eventCount === 2);

  // Ledger governance caveat surfaces as a governance memory.
  const ledgerRecords = runA.all().filter((r: MemoryRecord) => r.provenance.origin === "decision_ledger");
  check("ledger produced a record", ledgerRecords.length === 1);
  check("ledger record flags governance", ledgerRecords[0]?.signals.governance === true);
  check("authoritative ledger outranks inferred drift in confidence",
    (ledgerRecords[0]?.confidence.score ?? 0) > (driftRecords[0]?.confidence.score ?? 1));
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
console.log("All deterministic evaluations passed. Same input -> same MemoryRecords.");
console.log("=".repeat(70));
