// Release 2.2 — Adaptive Mission Harness · Runtime contract validators
// ====================================================================
// Plain-TypeScript, dependency-free runtime validators for the Python -> BFF
// wire contract. No Zod (it is not a declared dependency of apps/web): these are
// hand-written structural guards the future Mission BFF will use to fail closed
// on any response that does not match the locked contract.
//
// The validators enforce the LOCKED governance invariants at the boundary:
//   * only a `completed`, execution-eligible response may carry a
//     `MissionExecutionPayload`;
//   * blocked / rejected / revision / failed responses carry NONE;
//   * a `MissionExecutionPayload` is always `simulated` and carries NO
//     PersonaResponse and NO presentation text;
//   * the wire is camelCase-only (no snake_case contract keys leak across).
//
// A validator returns a `ValidationResult`: `{ ok, errors }`. Callers decide how
// to react (the BFF will reject and return a governed error).

import {
  HARNESS_SERVICE_ERROR_CODES,
  HARNESS_SERVICE_STATUSES,
} from "./types";
import type {
  HarnessServiceErrorCode,
  HarnessServiceResponse,
  HarnessServiceStatus,
  MissionExecutionPayload,
} from "./types";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function ok(): ValidationResult {
  return { ok: true, errors: [] };
}

function fail(errors: string[]): ValidationResult {
  return { ok: false, errors };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

const STATUS_SET: ReadonlySet<string> = new Set(HARNESS_SERVICE_STATUSES);
const ERROR_CODE_SET: ReadonlySet<string> = new Set(HARNESS_SERVICE_ERROR_CODES);

// Free-form MAP fields whose keys are opaque domain data, not contract fields.
// Mirrors the Python parity test so both sides agree on what is "on the wire".
const FREEFORM_FIELDS: ReadonlySet<string> = new Set([
  "signals",
  "signalContext",
  "injectedTimestamps",
  "details",
  "beforeState",
  "afterState",
]);

/** True when `status` is a known Harness service status. */
export function isHarnessServiceStatus(
  value: unknown,
): value is HarnessServiceStatus {
  return isString(value) && STATUS_SET.has(value);
}

/** True when `code` is a known, BFF-safe Harness error code. */
export function isHarnessServiceErrorCode(
  value: unknown,
): value is HarnessServiceErrorCode {
  return isString(value) && ERROR_CODE_SET.has(value);
}

/** Deep scan: no contract key anywhere may be `personaResponse` /
 * `persona_response`, and no presentation text (`voiceSummary`) may cross the
 * Python -> BFF boundary. Language lives only on `MissionTurn`. */
export function containsNoPersonaResponse(node: unknown): ValidationResult {
  const forbidden = new Set([
    "personaResponse",
    "persona_response",
    "voiceSummary",
    "voice_summary",
  ]);
  const errors: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (isObject(value)) {
      for (const key of Object.keys(value)) {
        if (forbidden.has(key)) {
          errors.push(`forbidden presentation key '${key}' at ${path}`);
        }
        walk(value[key], path ? `${path}.${key}` : key);
      }
    }
  };
  walk(node, "");
  return errors.length === 0 ? ok() : fail(errors);
}

/** Deep scan: every CONTRACT key must be camelCase (no underscore). Free-form
 * map subtrees (signal payloads, injected-timestamp stage names, action detail,
 * before/after state) are opaque domain data and are not descended into. */
export function isCamelCaseOnly(node: unknown): ValidationResult {
  const errors: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (isObject(value)) {
      for (const key of Object.keys(value)) {
        if (key.includes("_")) {
          errors.push(`snake_case contract key '${key}' at ${path}`);
        }
        if (FREEFORM_FIELDS.has(key)) continue;
        walk(value[key], path ? `${path}.${key}` : key);
      }
    }
  };
  walk(node, "");
  return errors.length === 0 ? ok() : fail(errors);
}

/** Structurally validate a `MissionExecutionPayload`. Enforces the simulated-
 * only invariant and the presence of every governed field the BFF depends on. */
export function validateMissionExecutionPayload(
  value: unknown,
): ValidationResult {
  if (!isObject(value)) return fail(["payload is not an object"]);
  const errors: string[] = [];
  const p = value as Partial<MissionExecutionPayload> & Record<string, unknown>;

  if (p.schemaVersion !== "1.0") errors.push("payload.schemaVersion must be '1.0'");
  if (!isString(p.missionId) || p.missionId.length === 0) {
    errors.push("payload.missionId must be a non-empty string");
  }
  if (typeof p.turnIndex !== "number" || p.turnIndex < 0) {
    errors.push("payload.turnIndex must be a non-negative number");
  }
  if (p.simulated !== true) errors.push("payload.simulated must be true (simulated-only)");
  if (!isString(p.selectedTemplateId) || p.selectedTemplateId.length === 0) {
    errors.push("payload.selectedTemplateId must be a non-empty string");
  }
  if (!Array.isArray(p.permittedActions) || p.permittedActions.length === 0) {
    errors.push("payload.permittedActions must be a non-empty array");
  }
  if (!isObject(p.canonicalAccount) || !isString((p.canonicalAccount as Record<string, unknown>).ventureOsId)) {
    errors.push("payload.canonicalAccount.ventureOsId must be present");
  }
  if (!isObject(p.retrievalQuery) || !isString((p.retrievalQuery as Record<string, unknown>).subjectId)) {
    errors.push("payload.retrievalQuery.subjectId must be present");
  }
  if (!isObject(p.verification)) errors.push("payload.verification must be present");
  if (!isString(p.verificationRef)) errors.push("payload.verificationRef must be present");
  if (!isString(p.auditRef)) errors.push("payload.auditRef must be present");
  if (!Array.isArray(p.evidenceRefs)) errors.push("payload.evidenceRefs must be an array");

  const noPersona = containsNoPersonaResponse(value);
  if (!noPersona.ok) errors.push(...noPersona.errors);

  return errors.length === 0 ? ok() : fail(errors);
}

/** Structurally validate a `HarnessServiceResponse` envelope, then enforce the
 * cross-cutting governance invariants that bind status <-> payload <-> errors. */
export function validateHarnessServiceResponse(
  value: unknown,
): ValidationResult {
  if (!isObject(value)) return fail(["response is not an object"]);
  const errors: string[] = [];
  const r = value as Partial<HarnessServiceResponse> & Record<string, unknown>;

  if (!isString(r.requestId)) errors.push("response.requestId must be a string");
  if (!isString(r.correlationId)) errors.push("response.correlationId must be a string");
  if (!isHarnessServiceStatus(r.status)) errors.push(`response.status invalid: ${String(r.status)}`);
  if (!isBoolean(r.executionEligible)) errors.push("response.executionEligible must be boolean");
  if (!Array.isArray(r.serviceErrors)) errors.push("response.serviceErrors must be an array");
  if (!Array.isArray(r.warnings)) errors.push("response.warnings must be an array");
  if (!isString(r.resultHash) || !r.resultHash.startsWith("sha256:")) {
    errors.push("response.resultHash must be a sha256 string");
  }

  // Every service error must be BFF-safe and typed.
  if (Array.isArray(r.serviceErrors)) {
    r.serviceErrors.forEach((err, i) => {
      if (!isObject(err)) {
        errors.push(`serviceErrors[${i}] is not an object`);
        return;
      }
      if (!isHarnessServiceErrorCode(err.code)) {
        errors.push(`serviceErrors[${i}].code invalid: ${String(err.code)}`);
      }
      if (!isString(err.stage)) errors.push(`serviceErrors[${i}].stage must be a string`);
      if (!isBoolean(err.retryable)) errors.push(`serviceErrors[${i}].retryable must be boolean`);
    });
  }

  const status = r.status as HarnessServiceStatus | undefined;
  const payload = r.missionExecutionPayload;
  const hasPayload = payload !== undefined && payload !== null;

  // LOCKED invariant: payload only for completed + execution-eligible.
  if (status === "completed") {
    if (r.executionEligible !== true) {
      errors.push("completed response must be executionEligible");
    }
    if (!hasPayload) {
      errors.push("completed response must carry a missionExecutionPayload");
    } else {
      const payloadResult = validateMissionExecutionPayload(payload);
      if (!payloadResult.ok) errors.push(...payloadResult.errors.map((e) => `payload: ${e}`));
    }
  } else {
    if (hasPayload) {
      errors.push(`non-completed response (${String(status)}) must NOT carry a payload`);
    }
    if (r.executionEligible === true) {
      errors.push(`non-completed response (${String(status)}) must not be executionEligible`);
    }
    if (status !== undefined && (!Array.isArray(r.serviceErrors) || r.serviceErrors.length === 0)) {
      errors.push(`non-completed response (${String(status)}) must carry at least one service error`);
    }
  }

  // The whole envelope must be camelCase-only and free of any PersonaResponse.
  const camel = isCamelCaseOnly(value);
  if (!camel.ok) errors.push(...camel.errors);
  const noPersona = containsNoPersonaResponse(value);
  if (!noPersona.ok) errors.push(...noPersona.errors);

  return errors.length === 0 ? ok() : fail(errors);
}
