// Release 2.2 — Mission BFF · Governed orchestration core
// =======================================================
// The pure, framework-agnostic core behind `POST /api/missions/execute`. It is
// deterministic given its injected dependencies (ids, clock, harness caller),
// so it is fully unit-testable without a network or Next.js.
//
// Responsibilities (and ONLY these — it never re-derives mission logic):
//   1. Validate the presentation request; fail closed without calling Python.
//   2. Create/propagate requestId, correlationId, idempotencyKey.
//   3. Build the Python `HarnessServiceRequest` and guard it carries no
//      PersonaResponse before it crosses the boundary.
//   4. Call the Python harness exactly once (the caller owns timeout + a single
//      identical retry).
//   5. Validate the `HarnessServiceResponse` and reconcile its ids; fail closed
//      on any contract violation (never trust an unexpected upstream shape).
//   6. Map governed outcomes to a presentation-safe `MissionBffResponse`:
//        * completed  -> carry the simulated MissionExecutionPayload (HTTP 200)
//        * blocked/rejected/revision -> governed narrative, no payload (HTTP 200)
//        * failed     -> typed error mapped to 4xx/5xx, no payload
//   7. Never expose the Python endpoint, the service token, stack traces, SQL,
//      paths, or a PersonaResponse.

import { validateHarnessServiceResponse, containsNoPersonaResponse } from "../harness/contractValidation";
import { buildHarnessServiceRequest } from "../harness/requestBuilder";
import type { HarnessCaller } from "../harness/client";
import type {
  HarnessServiceError,
  HarnessServiceResponse,
  HarnessServiceStatus,
  MissionExecutionPayload,
} from "../harness/types";
import { validateMissionRequest } from "./bffContract";
import type { MissionBffResponse } from "./bffContract";
import { composeMissionMemory } from "./memoryAdapter";
import type { MissionMemoryDeps } from "./memoryAdapter";
import { assembleCompletedMissionTurn, assembleGovernedMissionTurn } from "./missionTurn";
import type { MissionTurn } from "./types";

export interface MissionBffDeps {
  callHarness: HarnessCaller;
  newRequestId: () => string;
  newCorrelationId: () => string;
  newIdempotencyKey: () => string;
  /** Injected governance timestamps (keyed by stage; must include `default`). */
  injectedTimestamps: () => Record<string, string>;
  /** OPTIONAL memory/runtime deps for live MissionTurn assembly. When provided,
   * a completed mission's governed payload is composed through the F1.5 memory
   * adapter (TypeScript Memory Core + Conversation Runtime) and packaged onto a
   * live `MissionTurn`. When omitted (e.g. a pure contract test), a completed
   * response carries its payload but `missionTurn` stays `null`. */
  buildMemoryDeps?: (payload: MissionExecutionPayload) => MissionMemoryDeps;
}

export interface MissionBffResult {
  httpStatus: number;
  body: MissionBffResponse;
}

const GOVERNED_DEFAULT_REASON: Record<string, string> = {
  blocked: "This mission was blocked by governance and cannot proceed.",
  rejected: "The proposed action was not approved.",
  revision_required: "Verification did not pass; the mission needs revision before approval.",
  failed: "The mission could not be completed.",
};

const FAILED_ERROR_HTTP: Record<string, number> = {
  invalid_request: 422,
  idempotency_conflict: 409,
};

function bffError(
  code: HarnessServiceError["code"],
  stage: string,
  message: string,
  retryable: boolean,
): HarnessServiceError {
  return { code, stage, message, retryable, details: {} };
}

function envelope(
  status: HarnessServiceStatus,
  requestId: string,
  correlationId: string,
  overrides: Partial<MissionBffResponse>,
): MissionBffResponse {
  return {
    schemaVersion: "1.0",
    requestId,
    correlationId,
    status,
    executionEligible: false,
    missionExecutionPayload: null,
    missionTurn: null,
    governed: null,
    serviceErrors: [],
    warnings: [],
    ledgerReference: null,
    ...overrides,
  };
}

function governedReason(status: string, errors: HarnessServiceError[]): string {
  const first = errors[0];
  if (first && typeof first.message === "string" && first.message.trim().length > 0) {
    return first.message;
  }
  return GOVERNED_DEFAULT_REASON[status] ?? "The mission could not be completed.";
}

/** Execute one governed mission request end-to-end (pure given `deps`). */
export async function executeMissionRequest(
  rawInput: unknown,
  deps: MissionBffDeps,
): Promise<MissionBffResult> {
  // 1. Validate the presentation request; fail closed without calling Python.
  const validation = validateMissionRequest(rawInput);
  const correlationId =
    validation.ok && validation.value?.correlationId
      ? validation.value.correlationId
      : deps.newCorrelationId();
  const requestId = deps.newRequestId();

  if (!validation.ok || !validation.value) {
    return {
      httpStatus: 422,
      body: envelope("failed", requestId, correlationId, {
        governed: { reason: "The mission request was invalid.", errorCode: "invalid_request" },
        serviceErrors: [
          bffError("invalid_request", "bff_request_validation", "The mission request was invalid.", false),
        ],
      }),
    };
  }

  const idempotencyKey = validation.value.idempotencyKey ?? deps.newIdempotencyKey();

  // 2/3. Build the Python request and guard it carries no presentation content.
  const harnessRequest = buildHarnessServiceRequest(validation.value, {
    requestId,
    correlationId,
    idempotencyKey,
    injectedTimestamps: deps.injectedTimestamps(),
  });
  const outgoingClean = containsNoPersonaResponse(harnessRequest);
  if (!outgoingClean.ok) {
    return {
      httpStatus: 500,
      body: envelope("failed", requestId, correlationId, {
        governed: { reason: "The mission request could not be prepared.", errorCode: "internal_service_failure" },
        serviceErrors: [
          bffError("internal_service_failure", "bff_request_build", "The mission request could not be prepared.", false),
        ],
      }),
    };
  }

  // 4. Call the Python harness (caller owns timeout + single identical retry).
  const outcome = await deps.callHarness(harnessRequest);

  if (!outcome.ok) {
    const retryable = outcome.kind === "network" || outcome.kind === "timeout";
    return {
      httpStatus: 503,
      body: envelope("failed", requestId, correlationId, {
        governed: { reason: "The mission service is temporarily unavailable.", errorCode: "internal_service_failure" },
        serviceErrors: [
          bffError("internal_service_failure", "bff_transport", "The mission service is temporarily unavailable.", retryable),
        ],
      }),
    };
  }

  // 5. Validate the upstream response and reconcile ids; fail closed on drift.
  const shape = validateHarnessServiceResponse(outcome.body);
  if (!shape.ok) {
    return {
      httpStatus: 502,
      body: envelope("failed", requestId, correlationId, {
        governed: { reason: "The mission service returned an unexpected response.", errorCode: "internal_service_failure" },
        serviceErrors: [
          bffError("internal_service_failure", "bff_upstream_validation", "The mission service returned an unexpected response.", false),
        ],
      }),
    };
  }

  const response = outcome.body as HarnessServiceResponse;
  if (response.requestId !== requestId || response.correlationId !== correlationId) {
    return {
      httpStatus: 502,
      body: envelope("failed", requestId, correlationId, {
        governed: { reason: "The mission service returned a mismatched correlation.", errorCode: "internal_service_failure" },
        serviceErrors: [
          bffError("internal_service_failure", "bff_correlation", "The mission service returned a mismatched correlation.", false),
        ],
      }),
    };
  }

  const serviceErrors = response.serviceErrors ?? [];
  const warnings = response.warnings ?? [];
  const ledgerReference = response.ledgerReference ?? null;

  // 6. Map the governed outcome to a presentation-safe envelope.
  if (response.status === "completed") {
    const payload = response.missionExecutionPayload ?? null;
    const replayed = response.missionEvaluationResult?.replayed === true;

    // Assemble the LIVE MissionTurn on the TypeScript side when memory deps are
    // injected: compose the payload through the F1.5 memory adapter (Memory Core +
    // Conversation Runtime) and package it with the F1.6 assembler. This must fail
    // CLOSED — a turn we cannot compose safely is never emitted as `completed`.
    let missionTurn: MissionTurn | null = null;
    if (payload && deps.buildMemoryDeps) {
      try {
        const memory = composeMissionMemory(payload, deps.buildMemoryDeps(payload));
        missionTurn = assembleCompletedMissionTurn({ payload, memory });
      } catch {
        return {
          httpStatus: 500,
          body: envelope("failed", requestId, correlationId, {
            governed: { reason: "The mission response could not be assembled.", errorCode: "internal_service_failure" },
            serviceErrors: [
              bffError("internal_service_failure", "bff_turn_assembly", "The mission response could not be assembled.", false),
            ],
          }),
        };
      }
    }

    return {
      httpStatus: 200,
      body: envelope("completed", requestId, correlationId, {
        executionEligible: true,
        missionExecutionPayload: payload,
        missionTurn,
        replayed,
        serviceErrors,
        warnings,
        ledgerReference,
      }),
    };
  }

  if (response.status === "blocked" || response.status === "rejected" || response.status === "revision_required") {
    return {
      httpStatus: 200,
      body: envelope(response.status, requestId, correlationId, {
        governed: {
          reason: governedReason(response.status, serviceErrors),
          errorCode: serviceErrors[0]?.code,
        },
        missionTurn: assembleGovernedMissionTurn(response),
        serviceErrors,
        warnings,
        ledgerReference,
      }),
    };
  }

  // failed — map the leading typed error to an HTTP status.
  const leadCode = serviceErrors[0]?.code;
  const httpStatus = (leadCode && FAILED_ERROR_HTTP[leadCode]) ?? 502;
  return {
    httpStatus,
    body: envelope("failed", requestId, correlationId, {
      governed: { reason: governedReason("failed", serviceErrors), errorCode: leadCode },
      missionTurn: assembleGovernedMissionTurn(response),
      serviceErrors,
      warnings,
      ledgerReference,
    }),
  };
}
