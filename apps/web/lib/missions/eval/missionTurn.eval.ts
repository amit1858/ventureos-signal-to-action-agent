// Release 2.2 — Mission BFF · MissionTurn assembly eval (F1.6)
// ===========================================================
// Deterministic, dependency-free evaluation of the TypeScript-owned MissionTurn
// assembler. Completed turns are assembled from a REAL golden payload plus a
// TypeScript-composed memory result (seeded through the public memory api);
// governed turns are assembled from the golden governed responses.
//
// It proves:
//   * a completed turn is executable, carries the TS-composed PersonaResponse +
//     voiceSummary (no Python persona authority), and forwards every governed
//     fact verbatim (evidence, verification, recommendation, approval, audit);
//   * governed (blocked/rejected/revision/failed) turns are NON-executable and
//     NEVER carry a PersonaResponse or voiceSummary;
//   * one shared shape serves screen / voice / Digital Human — no provider or
//     channel-specific fields leak onto the turn;
//   * assembly is deterministic (byte-identical) and simulated-only;
//   * the unified entry point fails closed when a completed turn lacks memory.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/missions/eval/missionTurn.eval.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { MemoryStore } from "../../memory";
import type { MemoryEvent, ReducerContext } from "../../memory";
import { createSession } from "../../conversation";
import { composeMissionMemory } from "../memoryAdapter";
import type { MissionMemoryDeps, MissionMemoryResult } from "../memoryAdapter";
import {
  assembleCompletedMissionTurn,
  assembleGovernedMissionTurn,
  assembleMissionTurn,
  MissionTurnAssemblyError,
} from "../missionTurn";
import { isCompletedMissionTurn, isGovernedMissionTurn } from "../types";
import type {
  ContractFixtureEnvelope,
  HarnessServiceResponse,
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
    const ok = err instanceof MissionTurnAssemblyError && err.code === code;
    check(name, ok, ok ? "" : `unexpected: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Fixtures (read-only) + a store seeded through the public api
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

const ASOF = Date.parse("2026-07-14T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number): string => new Date(ASOF - daysAgo * DAY).toISOString();
const REDUCER_CTX: ReducerContext = { asOfMs: ASOF };
const SUBJECT = "VOS-CUREFOODS";

function seededStore(): MemoryStore {
  const events: MemoryEvent[] = [
    {
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
    },
    {
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
    },
  ];
  const store = new MemoryStore();
  store.ingest(events, REDUCER_CTX);
  return store;
}

function memoryFor(payload: MissionExecutionPayload): MissionMemoryResult {
  const deps: MissionMemoryDeps = {
    store: seededStore(),
    session: createSession(`mission:${SUBJECT}`),
    asOfMs: ASOF,
    persona: { role: "Renewal Coach", tone: "advisory" },
  };
  return composeMissionMemory(payload, deps);
}

const KNOWN_COMPLETED_KEYS = new Set([
  "schemaVersion", "missionId", "turnIndex", "status", "missionState", "canonicalAccount",
  "auditRef", "simulated", "account", "intent", "selectedTemplateId", "signalNarrative",
  "personaResponse", "voiceSummary", "evidence", "verification", "verificationSummary",
  "recommendation", "permittedActions", "approvalState", "approval", "simulatedAction",
  "outcome", "missionDefinition",
]);

const COMPLETED = ["01_completed_renewal_risk.json", "02_completed_support_escalation.json"];
const GOVERNED = [
  "03_blocked_unsupported_signal.json",
  "04_blocked_ambiguous_account.json",
  "05_rejected_approval.json",
  "06_revision_required.json",
  "07_error_idempotency_conflict.json",
  "08_error_internal_safe_failure.json",
];

// ===========================================================================
console.log("\n[1] Completed turn: executable, TS-owned language, verbatim facts");
// ===========================================================================
for (const file of COMPLETED) {
  const response = loadResponse(file);
  const payload = response.missionExecutionPayload as MissionExecutionPayload;
  const memory = memoryFor(payload);
  const turn = assembleCompletedMissionTurn({ payload, memory });

  check(`${file}: status completed`, turn.status === "completed");
  check(`${file}: is completed (type guard)`, isCompletedMissionTurn(turn));
  check(`${file}: simulated true`, turn.simulated === true);
  check(`${file}: personaResponse is the TS-composed one`, turn.personaResponse === memory.personaResponse);
  check(`${file}: composed real segments (TS authority)`, turn.personaResponse.segments.length > 0);
  check(`${file}: voiceSummary mirrors personaResponse`, turn.voiceSummary === memory.personaResponse.voiceSummary);
  check(`${file}: evidence forwarded verbatim`,
    JSON.stringify(turn.evidence) === JSON.stringify(payload.evidenceRefs));
  check(`${file}: verification forwarded verbatim`,
    JSON.stringify(turn.verification) === JSON.stringify(payload.verification));
  check(`${file}: verificationSummary deterministic + non-empty`,
    /^(Verified|Blocked): \d+\/\d+ checks passed\.$/.test(turn.verificationSummary));
  check(`${file}: recommendation projected`,
    turn.recommendation.recommendationId === payload.recommendation.recommendationId &&
    turn.recommendation.actionType === payload.recommendation.actionType);
  check(`${file}: permittedActions forwarded`,
    JSON.stringify(turn.permittedActions) === JSON.stringify(payload.permittedActions));
  check(`${file}: approvalState pending (bound approval request)`, turn.approvalState === "pending");
  check(`${file}: no simulated action yet (F1.8)`, turn.simulatedAction === null);
  check(`${file}: outcome executable + forwards state`,
    turn.outcome.executable === true && turn.outcome.state === payload.missionState);
  check(`${file}: signalNarrative present + markdown-free`,
    turn.signalNarrative.length > 0 && !/[*`#>\[\]\n\t]/.test(turn.signalNarrative));
  check(`${file}: account mirrors canonicalAccount`,
    turn.account.ventureOsId === payload.canonicalAccount.ventureOsId &&
    turn.account.canonicalName === payload.canonicalAccount.canonicalName);
  check(`${file}: missionId + turnIndex forwarded`,
    turn.missionId === payload.missionId && turn.turnIndex === payload.turnIndex);

  // Deterministic assembly (same payload + fresh identical memory).
  const again = assembleCompletedMissionTurn({ payload, memory: memoryFor(payload) });
  check(`${file}: assembly is deterministic (byte-identical)`,
    JSON.stringify(turn) === JSON.stringify(again));

  // One shared shape — no provider/channel-specific fields leak onto the turn.
  const keys = Object.keys(turn);
  check(`${file}: only known shared keys (no provider fields)`,
    keys.every((k) => KNOWN_COMPLETED_KEYS.has(k)), keys.filter((k) => !KNOWN_COMPLETED_KEYS.has(k)).join(","));
  check(`${file}: no provider/vendor key names`,
    !keys.some((k) => /gnani|nvidia|provider|vendor|channel/i.test(k)));
}

// ===========================================================================
console.log("\n[2] Governed turns: non-executable, never carry a PersonaResponse");
// ===========================================================================
for (const file of GOVERNED) {
  const response = loadResponse(file);
  const turn = assembleGovernedMissionTurn(response);

  check(`${file}: status matches response`, turn.status === response.status);
  check(`${file}: is governed (type guard)`, isGovernedMissionTurn(turn));
  check(`${file}: NO personaResponse key`, !("personaResponse" in (turn as unknown as Record<string, unknown>)));
  check(`${file}: NO voiceSummary key`, !("voiceSummary" in (turn as unknown as Record<string, unknown>)));
  check(`${file}: reason non-empty`, turn.reason.length > 0);
  check(`${file}: governedNarrative non-empty + markdown-free`,
    turn.governedNarrative.length > 0 && !/[*_`#>\[\]\n\t]/.test(turn.governedNarrative));
  check(`${file}: errorCode present (governed carries >= 1 error)`, typeof turn.errorCode === "string");
  check(`${file}: missionId resolved from ledger/evaluation`,
    turn.missionId.length > 0 &&
      (response.ledgerReference?.missionId ? turn.missionId === response.ledgerReference.missionId : true));
  check(`${file}: auditRef from ledger`,
    turn.auditRef === (response.ledgerReference?.latestLedgerRecordId ?? ""));
  check(`${file}: simulated true`, turn.simulated === true);

  const again = assembleGovernedMissionTurn(response);
  check(`${file}: deterministic (byte-identical)`, JSON.stringify(turn) === JSON.stringify(again));
}

// ===========================================================================
console.log("\n[3] Unified entry point + fail-closed guards");
// ===========================================================================
{
  const response = loadResponse("01_completed_renewal_risk.json");
  const payload = response.missionExecutionPayload as MissionExecutionPayload;
  const memory = memoryFor(payload);
  const viaUnified = assembleMissionTurn({ response, memory });
  const viaDirect = assembleCompletedMissionTurn({ payload, memory });
  check("unified completed == direct completed", JSON.stringify(viaUnified) === JSON.stringify(viaDirect));

  threw("completed via unified without memory -> missing_memory", "missing_memory", () =>
    assembleMissionTurn({ response }));

  const blocked = loadResponse("03_blocked_unsupported_signal.json");
  const viaUnifiedGoverned = assembleMissionTurn({ response: blocked });
  check("unified governed == direct governed",
    JSON.stringify(viaUnifiedGoverned) === JSON.stringify(assembleGovernedMissionTurn(blocked)));

  threw("assembleGovernedMissionTurn rejects a completed response", "not_governed", () =>
    assembleGovernedMissionTurn(response));
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log("\n" + "=".repeat(70));
console.log(`MissionTurn assembly evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All MissionTurn checks passed. One governed turn for every surface.");
console.log("=".repeat(70));
