// Release 2.2 — Mission Turn · TypeScript-owned presentation contract
// ===================================================================
// `MissionTurn` is the final, presentation-safe object the Next.js Mission BFF
// returns to the screen / voice / Digital Human surfaces. It is OWNED HERE, in
// TypeScript — the Python `MissionTurn` mirror in `harness/contracts.py` exists
// only so both sides can pin the JSON in contract round-trip tests. This is the
// authoritative definition.
//
// Composition boundary (LOCKED):
//   * The BFF consumes a governed `MissionExecutionPayload` (harness/types),
//     performs TypeScript-side memory retrieval, invokes the protected
//     Conversation Runtime, and packages the resulting `PersonaResponse` onto a
//     completed `MissionTurn`.
//   * `PersonaResponse` is imported from the protected Conversation Runtime — it
//     is NEVER redefined here and NEVER crosses back into Python.
//   * Blocked / rejected / revision / failed outcomes MUST NOT produce a
//     `PersonaResponse` or an executable turn: they carry a governed,
//     presentation-safe narrative and the audit reference only.
//   * Release 2.2 is simulated-only: `simulated` is always `true`.
//
// Pure `type`/`interface` declarations (no enums, no runtime code) so the
// deterministic eval loader can type-strip them under Node.

import type { PersonaResponse } from "../conversation/types";
import type {
  ApprovalChannel,
  ApprovalOutcome,
  CanonicalAccountRef,
  EvidenceRef,
  HarnessServiceErrorCode,
  MissionDefinitionBrief,
  MissionState,
  VerificationResult,
} from "../harness/types";

/** Presentation-facing status of a packaged mission turn. Mirrors the Harness
 * service status: exactly one is `executed`, the rest are governed non-turns. */
export type MissionTurnStatus =
  | "completed"
  | "blocked"
  | "rejected"
  | "revision_required"
  | "failed";

/** A presentation-safe projection of the governed recommendation. Carries no
 * Decision Ledger internals — only what the surfaces render. */
export interface RecommendationSummary {
  recommendationId: string;
  actionType: string;
  confidenceScore: number;
  governanceStatus: string;
}

/** A presentation-safe approval summary. Present on a completed turn once a
 * human decision has been captured; carries no payload internals. */
export interface ApprovalSummary {
  decisionId: string;
  outcome: ApprovalOutcome;
  actor: string;
  channel: ApprovalChannel;
}

/** A presentation-safe binding of the approval gate to the exact mission version
 * and reviewed action payload. Lets every surface show WHAT is being approved and
 * prove the decision is bound to one payload (by ref + hash). Carries no secrets. */
export interface ApprovalBinding {
  missionVersion: string;
  actionPayloadRef: string;
  actionPayloadHash: string;
  verificationRef: string;
  prompt: string;
  permittedActions: string[];
}

/** A minimal, presentation-safe account header for the surfaces. */
export interface AccountSummary {
  ventureOsId: string;
  canonicalName: string;
}

/** The presentation approval state of a completed turn. Release 2.2 captures a
 * human decision in a later increment (F1.8); until then a mission awaiting a
 * bound approval is `pending`, and one with no approval gate is `not_required`. */
export type MissionApprovalState =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected";

/** A presentation-safe projection of a simulated action receipt. `null` until an
 * approved action has been simulated (F1.8). NEVER a live/external side effect. */
export interface SimulatedActionResult {
  receiptId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  summary: string;
  simulated: true;
}

/** The deterministic, presentation-safe outcome of a mission turn. */
export interface MissionOutcome {
  /** The governed mission state this outcome reflects (forwarded, not derived). */
  state: MissionState;
  /** Whether an execution-eligible action is available on this turn. */
  executable: boolean;
  /** A short, deterministic headline the surfaces render (no model output). */
  headline: string;
}

/** Fields shared by every packaged turn, executed or governed. */
export interface MissionTurnBase {
  schemaVersion: "1.0";
  missionId: string;
  turnIndex: number;
  status: MissionTurnStatus;
  missionState: MissionState;
  canonicalAccount: CanonicalAccountRef | null;
  /** Mission Audit reference for this turn (projection only). */
  auditRef: string;
  simulated: true;
}

/** A governance-valid, execution-eligible turn. This is the ONLY turn variant
 * that carries composed language (`PersonaResponse`) and a voice summary.
 *
 * One shared shape serves the screen, Voice, and Digital Human surfaces — there
 * are NO provider-specific fields. The surfaces read `personaResponse` for rich
 * rendering and `voiceSummary` for the spoken line; neither the language nor the
 * governed facts are re-derived per channel. */
export interface CompletedMissionTurn extends MissionTurnBase {
  status: "completed";
  canonicalAccount: CanonicalAccountRef;
  /** Presentation account header (mirrors `canonicalAccount`). */
  account: AccountSummary;
  /** The governed conversation intent for this turn. */
  intent: string;
  /** The deterministically selected mission template id. */
  selectedTemplateId: string;
  /** A deterministic, governed one-line framing of why the mission ran. */
  signalNarrative: string;
  /** Composed by the protected Conversation Runtime on the TypeScript side. */
  personaResponse: PersonaResponse;
  /** Single spoken-form line for the Voice / Digital Human surfaces. */
  voiceSummary: string;
  /** Reference-only evidence backing the mission (citations live on
   * `personaResponse.citations`, projected from record provenance). */
  evidence: EvidenceRef[];
  verification: VerificationResult;
  /** A deterministic, human-readable summary of the verification verdict. */
  verificationSummary: string;
  recommendation: RecommendationSummary;
  /** Actions the mission is permitted to take (forwarded governance fact). */
  permittedActions: string[];
  /** Presentation approval state (F1.8 captures the human decision). */
  approvalState: MissionApprovalState;
  /** Binding of the approval gate to the mission version + reviewed payload;
   * `null` when the mission has no approval gate. */
  approvalBinding: ApprovalBinding | null;
  approval?: ApprovalSummary;
  /** Simulated action result once an approved action has run; `null` until then. */
  simulatedAction: SimulatedActionResult | null;
  /** The deterministic presentation outcome for this turn. */
  outcome: MissionOutcome;
  missionDefinition: MissionDefinitionBrief | null;
}

/** A governed, NON-executable turn (blocked / rejected / revision_required /
 * failed). It NEVER carries a `PersonaResponse`: the surfaces render a governed
 * narrative and status instead. One shared shape for every surface. */
export interface GovernedMissionTurn extends MissionTurnBase {
  status: "blocked" | "rejected" | "revision_required" | "failed";
  /** Short, presentation-safe reason for the governed outcome. */
  reason: string;
  /** Governed narrative the surfaces may render verbatim (no model output). */
  governedNarrative: string;
  /** The typed service error code that governed this outcome, when present. */
  errorCode?: HarnessServiceErrorCode;
}

/** The final packaged turn returned to presentation — a discriminated union on
 * `status`. `completed` is executable; everything else is governed. */
export type MissionTurn = CompletedMissionTurn | GovernedMissionTurn;

/** Narrowing helper: a completed turn always carries composed language. */
export function isCompletedMissionTurn(
  turn: MissionTurn,
): turn is CompletedMissionTurn {
  return turn.status === "completed";
}

/** Narrowing helper: a governed turn never carries a `PersonaResponse`. */
export function isGovernedMissionTurn(
  turn: MissionTurn,
): turn is GovernedMissionTurn {
  return turn.status !== "completed";
}
