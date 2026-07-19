// Release 2.2 — Mission BFF · Presentation request/response contract
// ==================================================================
// The contract for the Next.js Mission BFF route `POST /api/missions/execute`.
// This is the ONLY surface the browser (screen / voice / Digital Human) talks
// to; the browser NEVER calls the Python harness directly.
//
// Boundaries (LOCKED):
//   * The presentation request carries only structured mission inputs and the
//     human approval decision — NEVER a PersonaResponse, provider credentials,
//     the Python endpoint, or the service token.
//   * The BFF response is presentation-safe: it carries the governed result
//     envelope (status + governance references) and, for a `completed` mission,
//     the simulated `MissionExecutionPayload`. It carries NO PersonaResponse in
//     this increment — composed language is assembled onto a `MissionTurn` in a
//     later increment (F1.6).
//
// Dependency-free, plain-TypeScript (no Zod) to match the codebase and to remain
// runnable under the deterministic eval loader. Kept as `type`/`interface` plus
// a hand-written structural validator.

import type {
  ApprovalChannel,
  HarnessServiceError,
  HarnessServiceStatus,
  LedgerReference,
  MissionExecutionPayload,
} from "../harness/types";
import type { MissionTurn } from "./types";

/** The presentation request the browser posts to `/api/missions/execute`. */
export interface MissionExecuteRequest {
  /** Stable mission identifier for this run. */
  missionId: string;
  /** The governed scenario/signal selector the harness plans against. */
  scenarioId: string;
  /** Mission version; defaults to `v1` when omitted. */
  missionVersion?: string;
  /** Free-form signal context handed to identity resolution + selection. */
  signals?: Record<string, unknown>;
  /** Source-system account records for identity resolution (structural only). */
  sourceRecords?: Array<Record<string, unknown>>;
  /** The human actor and role (approval attribution). */
  actor: string;
  actorRole: string;
  /** The human's approval decision for a verified mission. Defaults to `none`. */
  approval?: "approved" | "rejected" | "none";
  /** Where the approval was captured. Defaults to `screen`. */
  approvalChannel?: ApprovalChannel;
  /** Governance verification outcome to inject. Defaults to `verified`. */
  verificationOutcome?: "verified" | "blocked";
  /** Optional caller-supplied correlation id (propagated when well-formed). */
  correlationId?: string;
  /** Optional caller-supplied idempotency key (propagated when well-formed). */
  idempotencyKey?: string;
}

/** The governed, presentation-safe reason for a non-executable outcome. */
export interface GovernedOutcome {
  reason: string;
  errorCode?: HarnessServiceError["code"];
}

/** The BFF response envelope returned to presentation. */
export interface MissionBffResponse {
  schemaVersion: "1.0";
  requestId: string;
  correlationId: string;
  status: HarnessServiceStatus;
  executionEligible: boolean;
  /** Present ONLY for a completed, execution-eligible mission. */
  missionExecutionPayload: MissionExecutionPayload | null;
  /** The final, presentation-safe MissionTurn the screen / voice / Digital Human
   * surfaces render. Assembled on the TypeScript side (F1.5 memory + F1.6
   * assembler) for a completed mission when the route provides memory deps, and a
   * governed non-executable turn for blocked / rejected / revision / failed. It is
   * `null` only when no turn could be assembled (e.g. a completed payload with no
   * memory deps injected, as in a pure contract test). */
  missionTurn: MissionTurn | null;
  /** `true` when the completed outcome was served from a DURABLE idempotent replay
   * (the same mission + idempotency key returned an already-stored receipt). */
  replayed?: boolean;
  /** Present for governed non-executable outcomes (blocked/rejected/revision/failed). */
  governed: GovernedOutcome | null;
  serviceErrors: HarnessServiceError[];
  warnings: string[];
  ledgerReference: LedgerReference | null;
}

export interface RequestValidationResult {
  ok: boolean;
  errors: string[];
  value?: MissionExecuteRequest;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const APPROVAL_VALUES = new Set(["approved", "rejected", "none"]);
const CHANNEL_VALUES = new Set(["screen", "voice", "avatar"]);
const VERIFICATION_VALUES = new Set(["verified", "blocked"]);

// Presentation input must never smuggle composed language or credentials into
// the mission boundary. These keys are rejected outright (fail closed).
const FORBIDDEN_REQUEST_KEYS = new Set([
  "personaResponse",
  "persona_response",
  "voiceSummary",
  "voice_summary",
  "serviceToken",
  "harnessServiceToken",
  "pythonHarnessUrl",
  "authorization",
]);

/** Validate a raw presentation request into a typed `MissionExecuteRequest`.
 * Fails closed: an invalid request never reaches the Python harness. */
export function validateMissionRequest(input: unknown): RequestValidationResult {
  if (!isPlainObject(input)) {
    return { ok: false, errors: ["request must be a JSON object"] };
  }
  const errors: string[] = [];

  for (const key of Object.keys(input)) {
    if (FORBIDDEN_REQUEST_KEYS.has(key)) {
      errors.push(`forbidden request field '${key}'`);
    }
  }

  if (!isNonEmptyString(input.missionId)) errors.push("missionId must be a non-empty string");
  if (!isNonEmptyString(input.scenarioId)) errors.push("scenarioId must be a non-empty string");
  if (!isNonEmptyString(input.actor)) errors.push("actor must be a non-empty string");
  if (!isNonEmptyString(input.actorRole)) errors.push("actorRole must be a non-empty string");

  if (input.missionVersion !== undefined && !isNonEmptyString(input.missionVersion)) {
    errors.push("missionVersion, when present, must be a non-empty string");
  }
  if (input.signals !== undefined && !isPlainObject(input.signals)) {
    errors.push("signals, when present, must be an object");
  }
  if (input.sourceRecords !== undefined) {
    if (!Array.isArray(input.sourceRecords) || !input.sourceRecords.every(isPlainObject)) {
      errors.push("sourceRecords, when present, must be an array of objects");
    }
  }
  if (input.approval !== undefined && !APPROVAL_VALUES.has(input.approval as string)) {
    errors.push("approval must be one of approved|rejected|none");
  }
  if (input.approvalChannel !== undefined && !CHANNEL_VALUES.has(input.approvalChannel as string)) {
    errors.push("approvalChannel must be one of screen|voice|avatar");
  }
  if (input.verificationOutcome !== undefined && !VERIFICATION_VALUES.has(input.verificationOutcome as string)) {
    errors.push("verificationOutcome must be one of verified|blocked");
  }
  if (input.correlationId !== undefined && !isNonEmptyString(input.correlationId)) {
    errors.push("correlationId, when present, must be a non-empty string");
  }
  if (input.idempotencyKey !== undefined && !isNonEmptyString(input.idempotencyKey)) {
    errors.push("idempotencyKey, when present, must be a non-empty string");
  }

  if (errors.length > 0) return { ok: false, errors };

  const value: MissionExecuteRequest = {
    missionId: (input.missionId as string).trim(),
    scenarioId: (input.scenarioId as string).trim(),
    actor: (input.actor as string).trim(),
    actorRole: (input.actorRole as string).trim(),
    missionVersion: input.missionVersion ? (input.missionVersion as string).trim() : undefined,
    signals: isPlainObject(input.signals) ? (input.signals as Record<string, unknown>) : undefined,
    sourceRecords: Array.isArray(input.sourceRecords)
      ? (input.sourceRecords as Array<Record<string, unknown>>)
      : undefined,
    approval: (input.approval as MissionExecuteRequest["approval"]) ?? undefined,
    approvalChannel: (input.approvalChannel as ApprovalChannel) ?? undefined,
    verificationOutcome:
      (input.verificationOutcome as MissionExecuteRequest["verificationOutcome"]) ?? undefined,
    correlationId: input.correlationId ? (input.correlationId as string).trim() : undefined,
    idempotencyKey: input.idempotencyKey ? (input.idempotencyKey as string).trim() : undefined,
  };

  return { ok: true, errors: [], value };
}
