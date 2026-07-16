// Release 2.2 — Mission BFF · TypeScript-owned MissionTurn assembly (F1.6)
// =======================================================================
// Deterministic assembly of the final, presentation-safe `MissionTurn` from a
// validated Python `HarnessServiceResponse` and — for a completed mission — the
// TypeScript-composed `MissionMemoryResult` (F1.5). This is the ONE object the
// screen, Voice, and Digital Human surfaces render; there is a single shared
// shape and NO provider-specific behaviour.
//
// Invariants (LOCKED):
//   * TypeScript owns the turn. Language (`personaResponse`, `voiceSummary`)
//     comes ONLY from the protected Conversation Runtime via F1.5 — Python has
//     NO PersonaResponse authority and none is carried back from Python.
//   * Governed facts (state, verification, recommendation, approval request,
//     permitted actions, evidence, audit) are FORWARDED verbatim — never
//     recomputed here.
//   * Assembly is deterministic: same response + same memory result -> a
//     byte-identical turn. No clock, no randomness, no model output.
//   * blocked / rejected / revision_required / failed produce governed,
//     NON-executable turns that never carry a `PersonaResponse`.

import type {
  ApprovalRequest,
  CanonicalAccountRef,
  HarnessServiceErrorCode,
  HarnessServiceResponse,
  MissionExecutionPayload,
  MissionState,
  RecommendationRef,
  VerificationResult,
} from "../harness/types";
import type { MissionMemoryResult } from "./memoryAdapter";
import type {
  CompletedMissionTurn,
  GovernedMissionTurn,
  GroundedNarrativeSummary,
  MissionApprovalState,
  MissionOutcome,
  MissionTurn,
  MissionTurnStatus,
  RecommendationSummary,
} from "./types";

export class MissionTurnAssemblyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MissionTurnAssemblyError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Deterministic presentation language (no model output)
// ---------------------------------------------------------------------------

const INTENT_LEAD: Record<string, string> = {
  resume: "Resume",
  status: "Status",
  risk_review: "Risk review",
  next_step: "Next step",
  recap: "Recap",
};

const GOVERNED_LEAD: Record<MissionTurnStatus, string> = {
  completed: "",
  blocked: "This mission was blocked by governance and cannot proceed.",
  rejected: "The proposed action was not approved.",
  revision_required: "Verification did not pass; the mission needs revision before approval.",
  failed: "The mission could not be completed.",
};

/** Presentation projection of the governed lifecycle onto a `MissionState` for
 * governed (non-completed) turns. Documented and deterministic. */
const GOVERNED_STATE: Record<Exclude<MissionTurnStatus, "completed">, MissionState> = {
  blocked: "blocked",
  rejected: "rejected",
  revision_required: "verifying",
  failed: "blocked",
};

function recommendationSummary(rec: RecommendationRef): RecommendationSummary {
  return {
    recommendationId: rec.recommendationId,
    actionType: rec.actionType,
    confidenceScore: rec.confidenceScore,
    governanceStatus: rec.governanceStatus,
  };
}

function signalNarrative(
  intent: string,
  account: CanonicalAccountRef,
  rec: RecommendationRef,
): string {
  const lead = INTENT_LEAD[intent] ?? "Mission";
  const pct = Math.round(rec.confidenceScore * 100);
  return `${lead} for ${account.canonicalName}: ${rec.actionType} recommended ` +
    `(priority ${rec.priorityRank}, confidence ${pct}%).`;
}

function verificationSummary(v: VerificationResult): string {
  const total = v.checks.length;
  const passed = v.checks.filter((c) => c.passed).length;
  const verdict = v.status === "verified" ? "Verified" : "Blocked";
  return `${verdict}: ${passed}/${total} checks passed.`;
}

function approvalStateOf(approvalRequest: ApprovalRequest | null): MissionApprovalState {
  // F1.6 has not yet captured a human decision (that is F1.8). A mission bound to
  // an approval request is `pending`; one with no gate is `not_required`.
  return approvalRequest ? "pending" : "not_required";
}

function outcomeOf(
  state: MissionState,
  approvalState: MissionApprovalState,
  rec: RecommendationRef,
): MissionOutcome {
  const headline = approvalState === "pending"
    ? `${rec.actionType} is ready for your approval.`
    : `${rec.actionType} is ready.`;
  return { state, executable: true, headline };
}

// ---------------------------------------------------------------------------
// Completed turn
// ---------------------------------------------------------------------------

export interface CompletedTurnInput {
  payload: MissionExecutionPayload;
  memory: MissionMemoryResult;
  /** Injected presentation turn index; defaults to the payload's turn index. */
  turnIndex?: number;
  /** OPTIONAL post-decision grounded narrative (Release 2.3). Presentation text
   * only; attaching it changes NO governed field. Omitted for backward-compatible
   * assembly without a narrative provider. */
  groundedNarrative?: GroundedNarrativeSummary;
}

/** Assemble the executable, presentation-safe completed turn. The persona
 * response and voice summary come only from the TypeScript-composed memory
 * result; every governed fact is forwarded from the payload. */
export function assembleCompletedMissionTurn(input: CompletedTurnInput): CompletedMissionTurn {
  const { payload, memory } = input;
  const approvalRequest = payload.approvalRequest ?? null;
  const approvalState = approvalStateOf(approvalRequest);

  return {
    schemaVersion: "1.0",
    missionId: payload.missionId,
    turnIndex: input.turnIndex ?? payload.turnIndex,
    status: "completed",
    missionState: payload.missionState,
    canonicalAccount: payload.canonicalAccount,
    simulated: true,
    auditRef: payload.auditRef,
    account: {
      ventureOsId: payload.canonicalAccount.ventureOsId,
      canonicalName: payload.canonicalAccount.canonicalName,
    },
    intent: payload.intent,
    selectedTemplateId: payload.selectedTemplateId,
    signalNarrative: signalNarrative(payload.intent, payload.canonicalAccount, payload.recommendation),
    personaResponse: memory.personaResponse,
    voiceSummary: memory.personaResponse.voiceSummary,
    evidence: payload.evidenceRefs,
    verification: payload.verification,
    verificationSummary: verificationSummary(payload.verification),
    recommendation: recommendationSummary(payload.recommendation),
    permittedActions: payload.permittedActions,
    approvalState,
    approvalBinding: approvalRequest
      ? {
          missionVersion: approvalRequest.missionVersion,
          actionPayloadRef: approvalRequest.actionPayloadRef,
          actionPayloadHash: approvalRequest.actionPayloadHash,
          verificationRef: approvalRequest.verificationRef,
          prompt: approvalRequest.prompt,
          permittedActions: approvalRequest.permittedActions,
        }
      : null,
    // Simulated action result is produced after a human approval (F1.8).
    simulatedAction: null,
    outcome: outcomeOf(payload.missionState, approvalState, payload.recommendation),
    missionDefinition: payload.missionDefinition ?? null,
    ...(input.groundedNarrative ? { groundedNarrative: input.groundedNarrative } : {}),
  };
}

// ---------------------------------------------------------------------------
// Governed (non-executable) turn
// ---------------------------------------------------------------------------

function governedReason(response: HarnessServiceResponse): string {
  const first = response.serviceErrors?.[0];
  if (first && typeof first.message === "string" && first.message.trim().length > 0) {
    return first.message.trim();
  }
  return GOVERNED_LEAD[response.status] ?? "The mission could not be completed.";
}

/** Assemble a governed, non-executable turn from a blocked / rejected /
 * revision_required / failed response. Never carries a `PersonaResponse`. */
export function assembleGovernedMissionTurn(
  response: HarnessServiceResponse,
  opts: { turnIndex?: number } = {},
): GovernedMissionTurn {
  if (response.status === "completed") {
    throw new MissionTurnAssemblyError(
      "not_governed",
      "assembleGovernedMissionTurn requires a non-completed response.",
    );
  }
  const status = response.status;
  const mer = response.missionEvaluationResult ?? null;
  const ledger = response.ledgerReference ?? null;
  const reason = governedReason(response);
  const lead = GOVERNED_LEAD[status];
  const governedNarrative = reason && reason !== lead ? `${lead} ${reason}` : lead;
  const errorCode: HarnessServiceErrorCode | undefined = response.serviceErrors?.[0]?.code;

  const turn: GovernedMissionTurn = {
    schemaVersion: "1.0",
    missionId: mer?.missionId ?? ledger?.missionId ?? "unknown",
    turnIndex: opts.turnIndex ?? 0,
    status,
    missionState: GOVERNED_STATE[status],
    canonicalAccount: mer?.canonicalAccount ?? null,
    auditRef: ledger?.latestLedgerRecordId ?? "",
    simulated: true,
    reason,
    governedNarrative,
  };
  if (errorCode !== undefined) turn.errorCode = errorCode;
  return turn;
}

// ---------------------------------------------------------------------------
// Unified entry point
// ---------------------------------------------------------------------------

export interface AssembleMissionTurnInput {
  /** The validated Python service response. */
  response: HarnessServiceResponse;
  /** Required for a completed response: the TypeScript-composed memory result. */
  memory?: MissionMemoryResult;
  /** Injected presentation turn index (default: payload turn index or 0). */
  turnIndex?: number;
}

/** Assemble the final `MissionTurn` for any governed outcome. A completed
 * response yields an executable turn (and REQUIRES the composed memory result);
 * every other outcome yields a governed, non-executable turn. */
export function assembleMissionTurn(input: AssembleMissionTurnInput): MissionTurn {
  const { response, memory } = input;
  if (response.status === "completed") {
    const payload = response.missionExecutionPayload ?? null;
    if (!payload) {
      throw new MissionTurnAssemblyError(
        "missing_payload",
        "A completed response must carry a mission execution payload.",
      );
    }
    if (!memory) {
      throw new MissionTurnAssemblyError(
        "missing_memory",
        "A completed turn requires the composed memory result.",
      );
    }
    return assembleCompletedMissionTurn({ payload, memory, turnIndex: input.turnIndex });
  }
  return assembleGovernedMissionTurn(response, { turnIndex: input.turnIndex });
}
