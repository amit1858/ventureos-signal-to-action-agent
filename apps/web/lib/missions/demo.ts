// Release 2.2 — Mission Control · deterministic renewal-risk demo turn (F1.7)
// ===========================================================================
// A self-contained, deterministic renewal-risk `CompletedMissionTurn` for the
// Mission Control screen experience. It mirrors the Python golden renewal
// fixture (`01_completed_renewal_risk.json`) as an inline governed payload, and
// composes the presentation language through the SAME F1.5 memory adapter + F1.6
// assembler the live BFF uses — so the screen renders a real, governed turn with
// no running Python service and no network.
//
// Invariants:
//   * The payload is a governed FACT mirror (Python owns it upstream); nothing
//     here recomputes state, verification, approval policy, or allowed actions.
//   * Language comes only from the protected Conversation Runtime via F1.5.
//   * Assembly is deterministic: `buildRenewalDemoTurn()` is byte-stable.
//   * No node-only APIs — safe in the Next server runtime and the eval loader.
//
// Pure module: types + plain functions only (no JSX, no runtime globals).

import { MemoryStore } from "../memory";
import type { MemoryEvent, ReducerContext } from "../memory";
import { createSession } from "../conversation";
import { composeMissionMemory } from "./memoryAdapter";
import type { MissionMemoryDeps } from "./memoryAdapter";
import { assembleCompletedMissionTurn } from "./missionTurn";
import type { CompletedMissionTurn } from "./types";
import type { MissionExecutionPayload } from "../harness/types";

/** Deterministic "as-of" clock for the demo (mirrors the Python fixture base). */
export const DEMO_ASOF_MS = Date.parse("2026-07-14T10:00:00.000Z");
export const DEMO_SUBJECT = "VOS-CUREFOODS";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgoIso = (n: number): string => new Date(DEMO_ASOF_MS - n * DAY_MS).toISOString();

// ---------------------------------------------------------------------------
// Governed renewal payload (mirror of the Python golden fixture)
// ---------------------------------------------------------------------------

/** The decision-closed renewal instruction, a fact mirror of the Python golden
 * fixture `01_completed_renewal_risk.json`. Frozen so no surface can mutate a
 * governed fact. */
export const RENEWAL_DEMO_PAYLOAD: MissionExecutionPayload = Object.freeze({
  schemaVersion: "1.0",
  missionId: "M-RENEWAL-1",
  turnIndex: 0,
  missionState: "closed",
  canonicalAccount: { ventureOsId: "VOS-CUREFOODS", canonicalName: "Curefoods" },
  intent: "risk_review",
  personaId: "persona-renewal_risk",
  selectedTemplateId: "renewal-risk-parallel-v1",
  retrievalQuery: { subjectId: "VOS-CUREFOODS", categories: null, limit: 5 },
  recommendation: {
    recommendationId: "REC-M-RENEWAL-1",
    ledgerId: "decisionLedger://unlinked/M-RENEWAL-1",
    accountId: "VOS-CUREFOODS",
    actionType: "renewal_outreach",
    priorityRank: 1,
    confidenceScore: 1.0,
    governanceStatus: "approved",
    requiresHumanApproval: true,
  },
  permittedActions: ["simulate_renewal_outreach", "simulate_stakeholder_brief"],
  evidenceRefs: [
    {
      recordId: "evidence://M-RENEWAL-1/account_health",
      category: "account_health",
      source: "mission-audit",
      summary: "mandatory evidence: account_health",
    },
    {
      recordId: "evidence://M-RENEWAL-1/renewal_timeline",
      category: "renewal_timeline",
      source: "mission-audit",
      summary: "mandatory evidence: renewal_timeline",
    },
    {
      recordId: "evidence://M-RENEWAL-1/usage_trend",
      category: "usage_trend",
      source: "mission-audit",
      summary: "mandatory evidence: usage_trend",
    },
  ],
  verification: {
    status: "verified",
    checks: [
      { name: "identity_resolved", passed: true, detail: "canonical account resolved" },
      { name: "evidence_sufficient", passed: true, detail: "required evidence present" },
      { name: "policy_passed", passed: true, detail: "policy validation" },
    ],
  },
  verificationRef: "verify://M-RENEWAL-1",
  approvalRequest: {
    schemaVersion: "1.0",
    missionId: "M-RENEWAL-1",
    missionVersion: "v1",
    recommendationId: "REC-M-RENEWAL-1",
    actionType: "renewal_outreach",
    permittedActions: ["simulate_renewal_outreach", "simulate_stakeholder_brief"],
    actionPayloadRef: "payload://M-RENEWAL-1/REC-M-RENEWAL-1",
    actionPayloadHash:
      "sha256:eea56a7b2c0a101c892c7c86a335efa6e48b14aef869bd25a4e0689e2cb7bb7b",
    verificationRef: "verify://M-RENEWAL-1",
    requiresHumanApproval: true,
    simulated: true,
    prompt: "Approve simulated renewal_outreach for Curefoods?",
  },
  missionDefinition: {
    missionType: "renewal_risk",
    objective:
      "Protect an at-risk renewal via parallel health/opportunity analysis, governed action prep and stakeholder communication.",
    rationale: "Signal SIG-REN-1 selected template renewal-risk-parallel-v1 for Curefoods.",
    successCriteria: [
      {
        criterionId: "SC1",
        description: "renewal_risk mission objective prepared and approved for Curefoods.",
      },
    ],
    riskLevel: "high",
    selectedTemplateId: "renewal-risk-parallel-v1",
    expectedOutcome: "Approved simulated renewal_risk action for Curefoods.",
  },
  auditRef: "audit://M-RENEWAL-1/REC-M-RENEWAL-1",
  simulated: true,
} as MissionExecutionPayload);

// ---------------------------------------------------------------------------
// Seeded memory (through the public MemoryStore api)
// ---------------------------------------------------------------------------

/** Curefoods memory the runtime cites when composing the renewal narrative.
 * Seeded through the public MemoryStore ingest api — no protected internals. */
export function seedRenewalDemoMemory(): MemoryStore {
  const events: MemoryEvent[] = [
    {
      eventId: "e-renewal",
      source: { module: "decision_ledger", entity: "led-9", quality: "authoritative" },
      category: "decision",
      subjectId: DEMO_SUBJECT,
      subjectLabel: "Curefoods",
      timestamp: daysAgoIso(1),
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
      subjectId: DEMO_SUBJECT,
      subjectLabel: "Curefoods",
      timestamp: daysAgoIso(2),
      summary: "executive sponsor meeting held with buyer",
      evidence: [
        { ref: "cal:3", label: "Calendar event" },
        { ref: "notes:3", label: "Meeting notes" },
      ],
      signals: { customerImpact: 0.4 },
    },
  ];
  const store = new MemoryStore();
  const ctx: ReducerContext = { asOfMs: DEMO_ASOF_MS };
  store.ingest(events, ctx);
  return store;
}

// ---------------------------------------------------------------------------
// Deterministic renewal demo turn
// ---------------------------------------------------------------------------

/** Build the deterministic renewal-risk `CompletedMissionTurn` the Mission
 * Control screen renders. Same inputs -> byte-identical turn. */
export function buildRenewalDemoTurn(): CompletedMissionTurn {
  const deps: MissionMemoryDeps = {
    store: seedRenewalDemoMemory(),
    session: createSession(`mission:${DEMO_SUBJECT}`),
    asOfMs: DEMO_ASOF_MS,
    persona: { role: "Renewal Coach", tone: "advisory" },
  };
  const memory = composeMissionMemory(RENEWAL_DEMO_PAYLOAD, deps);
  return assembleCompletedMissionTurn({ payload: RENEWAL_DEMO_PAYLOAD, memory });
}

// ---------------------------------------------------------------------------
// Guided mission narrative — section order (NOT a dashboard grid)
// ---------------------------------------------------------------------------

/** One step of the guided renewal narrative. The screen renders these in order:
 * AI speaks first, narrative before metrics, one recommendation before detail. */
export interface MissionSection {
  id: string;
  index: number;
  title: string;
  subtitle: string;
}

/** The deterministic, ordered renewal-risk narrative (F1.7 spec, 10 beats). */
export const MISSION_SECTIONS: readonly MissionSection[] = Object.freeze([
  { id: "what-happened", index: 1, title: "What happened", subtitle: "The signal that opened this mission" },
  { id: "why-at-risk", index: 2, title: "Why this account is at risk", subtitle: "The narrative, before the metrics" },
  { id: "unified-context", index: 3, title: "Unified customer context", subtitle: "One resolved account across sources" },
  { id: "evidence", index: 4, title: "Confidence, evidence & provenance", subtitle: "Why you can trust this" },
  { id: "recommended-mission", index: 5, title: "Recommended renewal mission", subtitle: "One mission, chosen deterministically" },
  { id: "proposed-actions", index: 6, title: "Proposed actions", subtitle: "Exactly what would run" },
  { id: "verification", index: 7, title: "Verification", subtitle: "Checked before you are asked" },
  { id: "approval", index: 8, title: "Approval", subtitle: "Human approval before any action" },
  { id: "simulated-execution", index: 9, title: "Simulated execution", subtitle: "Nothing leaves the sandbox" },
  { id: "outcome-audit", index: 10, title: "Outcome & audit trail", subtitle: "The receipt for this mission" },
]);
