// Release 2.2 — Adaptive Mission Harness · Cross-language contract types
// ======================================================================
// TypeScript mirror of the Python-owned Harness wire contracts (the exact
// camelCase JSON emitted by `services/api/harness` via Pydantic
// `model_dump(by_alias=True)`). These types describe what the Next.js Mission
// BFF RECEIVES from the Python Adaptive Mission Harness — they are consumed,
// never authored, here.
//
// Ownership & boundaries (LOCKED):
//   * Python OWNS mission logic: identity resolution, template selection,
//     planning, verification, approval policy, sandbox execution, audit.
//   * TypeScript CONSUMES the governed result. It must NEVER re-derive mission
//     state, verification, approval eligibility, or the permitted action.
//   * This contract carries NO PersonaResponse and NO presentation text:
//     language is composed on the TypeScript side and appears only on
//     `MissionTurn` (see ../missions/types).
//   * Release 2.2 is simulated-only: `simulated` is always `true`.
//
// Kept as pure `type`/`interface` declarations (no enums, no runtime code) so
// the deterministic eval loader can type-strip them under Node.

// ---------------------------------------------------------------------------
// Enumerated string unions (mirror the Python Enums by value)
// ---------------------------------------------------------------------------

/** The governed mission lifecycle states (Python `MissionState`). */
export type MissionState =
  | "opened"
  | "gathering"
  | "proposed"
  | "verifying"
  | "verified"
  | "blocked"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "simulated_executed"
  | "verified_outcome"
  | "closed";

/** How a human approval was captured (Python `ApprovalChannel`). */
export type ApprovalChannel = "screen" | "voice" | "avatar";

/** A human approval outcome (Python `ApprovalOutcome`). */
export type ApprovalOutcome = "approved" | "rejected";

/** The deterministic conversation intent the payload maps to. */
export type ConversationIntent =
  | "resume"
  | "status"
  | "risk_review"
  | "next_step"
  | "recap";

/** Service-level status of one mission evaluation (Python `SVC_*`). */
export type HarnessServiceStatus =
  | "completed"
  | "blocked"
  | "rejected"
  | "revision_required"
  | "failed";

/** Stable, BFF-safe service error codes (Python `ERR_*`). */
export type HarnessServiceErrorCode =
  | "invalid_request"
  | "ambiguous_identity"
  | "no_matching_template"
  | "policy_blocked"
  | "verification_failed"
  | "approval_rejected"
  | "approval_payload_mismatch"
  | "idempotency_conflict"
  | "audit_failure"
  | "internal_service_failure";

// ---------------------------------------------------------------------------
// Shared value objects
// ---------------------------------------------------------------------------

/** The single governed identity for a mission's account (Python
 * `CanonicalAccountRef`). `ventureOsId` is the MemoryStore subject key. */
export interface CanonicalAccountRef {
  ventureOsId: string;
  canonicalName: string;
}

/** The retrieval instruction Python hands to the TypeScript runtime. The BFF
 * executes it VERBATIM against the protected MemoryStore. */
export interface RetrievalQuerySpec {
  subjectId: string;
  categories: string[] | null;
  limit: number;
}

/** A reference to the governed recommendation. `ledgerId` links to the
 * PROTECTED Decision Ledger by reference only — never written to. */
export interface RecommendationRef {
  recommendationId: string;
  ledgerId: string;
  accountId: string;
  actionType: string;
  priorityRank: number;
  confidenceScore: number;
  governanceStatus: string;
  requiresHumanApproval: true;
}

/** A reference-only summary of one piece of evidence backing the mission. */
export interface EvidenceRef {
  recordId: string;
  category: string;
  source: string;
  summary: string;
}

/** One check inside the pre-approval verification gate. */
export interface VerificationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

/** The verdict of the pre-approval verification gate. */
export interface VerificationResult {
  status: "verified" | "blocked";
  checks: VerificationCheck[];
}

/** A request for a human to approve a verified mission action. Bound to one
 * mission version and one reviewed action payload (by ref and by hash). */
export interface ApprovalRequest {
  schemaVersion: "1.0";
  missionId: string;
  missionVersion: string;
  recommendationId: string;
  actionType: string;
  permittedActions: string[];
  actionPayloadRef: string;
  actionPayloadHash: string;
  verificationRef: string;
  requiresHumanApproval: true;
  simulated: true;
  prompt: string;
}

/** A human's decision, bound to one mission version and one reviewed action. */
export interface ApprovalDecision {
  schemaVersion: "1.0";
  decisionId: string;
  missionId: string;
  missionVersion: string;
  outcome: ApprovalOutcome;
  actor: string;
  actorRole: string;
  channel: ApprovalChannel;
  approvedActionRef: string;
  approvedPayloadHash: string;
  confirmToken: string | null;
  simulated: true;
  reason: string | null;
  decidedAt: string;
}

/** Proof that an approved action was executed in the local deterministic
 * sandbox. Release 2.2 is simulated-only. */
export interface ActionReceipt {
  schemaVersion: "1.0";
  receiptId: string;
  missionId: string;
  recommendationId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  toolId: string;
  approvedPayloadHash: string;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  simulated: true;
  summary: string;
  details: Record<string, unknown>;
  auditRef: string;
  createdAt: string;
}

/** One success-criterion line in the Mission Brief projection. */
export interface SuccessCriterionBrief {
  criterionId: string;
  description: string;
}

/** Additive, read-only projection of the MissionDefinition for the UI's
 * Mission Brief. TypeScript RENDERS it; it never reinterprets it. */
export interface MissionDefinitionBrief {
  missionType: string;
  objective: string;
  rationale: string;
  successCriteria: SuccessCriterionBrief[];
  riskLevel: string;
  selectedTemplateId: string;
  expectedOutcome?: string | null;
}

// ---------------------------------------------------------------------------
// MissionExecutionPayload — the decision-closed Python -> BFF instruction
// ---------------------------------------------------------------------------

/** Python -> Next.js Mission BFF. A decision-closed instruction: the TS side
 * executes retrieval and composes language, but NEVER overrides mission state,
 * verification, approval policy, or the allowed action. Carries NO
 * PersonaResponse. Only produced for governance-valid, execution-eligible
 * missions. */
export interface MissionExecutionPayload {
  schemaVersion: "1.0";
  missionId: string;
  turnIndex: number;
  missionState: MissionState;
  canonicalAccount: CanonicalAccountRef;
  intent: string;
  personaId: string;
  selectedTemplateId: string;
  retrievalQuery: RetrievalQuerySpec;
  recommendation: RecommendationRef;
  permittedActions: string[];
  evidenceRefs: EvidenceRef[];
  verification: VerificationResult;
  verificationRef: string;
  approvalRequest?: ApprovalRequest | null;
  missionDefinition?: MissionDefinitionBrief | null;
  auditRef: string;
  simulated: true;
}

// ---------------------------------------------------------------------------
// Service request / response envelope
// ---------------------------------------------------------------------------

/** A single source-system account record fed to identity resolution. Structural
 * only — the BFF forwards these without interpreting provider internals. */
export interface SourceAccountRecord {
  [key: string]: unknown;
}

/** The typed request into the in-process Harness service. Carries only
 * structured mission inputs and injected governance decisions — never
 * presentation content, provider credentials, or executable instructions. */
export interface HarnessServiceRequest {
  schemaVersion: string;
  requestId: string;
  correlationId: string;
  scenarioId: string;
  missionId: string;
  missionVersion: string;
  signals: Record<string, unknown>;
  sourceRecords?: SourceAccountRecord[] | null;
  actor: string;
  actorRole: string;
  approval: "approved" | "rejected" | "none";
  approvalChannel: ApprovalChannel;
  verificationOutcome: "verified" | "blocked";
  requestRevisionAfterBlock: boolean;
  injectPayloadMismatch: boolean;
  replayExecution: boolean;
  injectedTimestamps?: Record<string, string> | null;
  idempotencyKey?: string | null;
  outputMode: string;
  protectedDecisionRef?: string | null;
}

/** A structured, BFF-safe error. Contains NO stack trace, NO path, NO SQL. */
export interface HarnessServiceError {
  code: HarnessServiceErrorCode;
  stage: string;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
}

/** Reference-only pointer to the persisted mission audit trail. Carries no
 * database path and no connection detail. */
export interface LedgerReference {
  missionId: string;
  recordCount: number;
  latestLedgerRecordId?: string | null;
  chainValid: boolean;
}

/** The rich Python-owned evaluation result. It is OPAQUE to TypeScript: the BFF
 * treats it as governance evidence and never re-derives from it. Only the few
 * fields the presentation layer projects are named; everything else is passed
 * through untouched. */
export interface MissionEvaluationResultView {
  schemaVersion: string;
  missionId: string;
  finalStatus: string;
  executionEligible: boolean;
  lifecycleStatus: string;
  canonicalAccount: CanonicalAccountRef | null;
  selectedTemplateId: string | null;
  failureCode: string | null;
  auditChainValid: boolean;
  simulatedActionReceipt?: ActionReceipt | null;
  approvalRequest?: ApprovalRequest | null;
  approvalDecision?: ApprovalDecision | null;
  verificationSummary?: VerificationResult | null;
  resultHash: string;
  [key: string]: unknown;
}

/** The deterministic, fully-serialisable Harness service result. */
export interface HarnessServiceResponse {
  schemaVersion: string;
  requestId: string;
  correlationId: string;
  status: HarnessServiceStatus;
  executionEligible: boolean;
  missionEvaluationResult?: MissionEvaluationResultView | null;
  missionExecutionPayload?: MissionExecutionPayload | null;
  serviceErrors: HarnessServiceError[];
  warnings: string[];
  ledgerReference?: LedgerReference | null;
  resultHash: string;
}

/** The on-disk contract fixture envelope produced by
 * `generate_contract_fixtures.py` (request + response for one scenario). */
export interface ContractFixtureEnvelope {
  name: string;
  description: string;
  request: HarnessServiceRequest;
  response: HarnessServiceResponse;
}

/** One entry in the fixtures `manifest.json` index. */
export interface ContractFixtureManifestEntry {
  name: string;
  file: string;
  status: HarnessServiceStatus;
  missionId: string;
  executionEligible: boolean;
  hasExecutionPayload: boolean;
  resultHash: string;
}

/** The fixtures `manifest.json` index. */
export interface ContractFixtureManifest {
  schemaVersion: string;
  note: string;
  fixtures: ContractFixtureManifestEntry[];
}

/** The complete set of service statuses (for exhaustive iteration in evals). */
export const HARNESS_SERVICE_STATUSES: readonly HarnessServiceStatus[] = [
  "completed",
  "blocked",
  "rejected",
  "revision_required",
  "failed",
];

/** The complete set of service error codes (for exhaustive iteration). */
export const HARNESS_SERVICE_ERROR_CODES: readonly HarnessServiceErrorCode[] = [
  "invalid_request",
  "ambiguous_identity",
  "no_matching_template",
  "policy_blocked",
  "verification_failed",
  "approval_rejected",
  "approval_payload_mismatch",
  "idempotency_conflict",
  "audit_failure",
  "internal_service_failure",
];
