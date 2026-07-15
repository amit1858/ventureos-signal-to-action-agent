// Release 2.2 — Mission BFF · Harness request builder
// ===================================================
// Deterministically maps a validated presentation `MissionExecuteRequest` into
// the Python-owned `HarnessServiceRequest` wire contract. It injects the ids,
// idempotency key, and timestamps supplied by the caller (never `Date.now()`
// here — the injecting boundary owns the clock), so the mapping is pure and
// unit-testable.
//
// It NEVER adds presentation content, provider credentials, the service token,
// or executable instructions to the request. `outputMode` is fixed to `full`
// so a completed mission returns its governed `MissionExecutionPayload`.

import type { HarnessServiceRequest } from "./types";
import type { MissionExecuteRequest } from "../missions/bffContract";

export interface BuildRequestContext {
  requestId: string;
  correlationId: string;
  idempotencyKey: string;
  /** Injected governance timestamps, keyed by stage; must include `default`. */
  injectedTimestamps: Record<string, string>;
}

/** A fixed, deterministic set of injected stage timestamps (no wall clock). It
 * mirrors the Python `default_injected_timestamps()` so a demo run reproduces
 * the golden governed result for a scenario. */
export function defaultInjectedTimestamps(): Record<string, string> {
  const base = "2026-07-14T10:00:00Z";
  return {
    default: base,
    intake: "2026-07-14T09:59:45Z",
    identity: "2026-07-14T09:59:50Z",
    selection: "2026-07-14T09:59:55Z",
    blocked: "2026-07-14T09:59:59Z",
    opened: "2026-07-14T10:00:00Z",
    gathering: "2026-07-14T10:00:05Z",
    proposed: "2026-07-14T10:00:10Z",
    verifying: "2026-07-14T10:00:15Z",
    verification: "2026-07-14T10:00:20Z",
    verified: "2026-07-14T10:00:25Z",
    approval_request: "2026-07-14T10:00:30Z",
    approval_decision: "2026-07-14T10:00:35Z",
    execution: "2026-07-14T10:00:40Z",
    outcome: "2026-07-14T10:00:45Z",
  };
}

/** Build the Python harness request from a validated presentation request. */
export function buildHarnessServiceRequest(
  input: MissionExecuteRequest,
  ctx: BuildRequestContext,
): HarnessServiceRequest {
  return {
    schemaVersion: "1.0",
    requestId: ctx.requestId,
    correlationId: ctx.correlationId,
    scenarioId: input.scenarioId,
    missionId: input.missionId,
    missionVersion: input.missionVersion ?? "v1",
    signals: input.signals ?? {},
    sourceRecords: input.sourceRecords ?? null,
    actor: input.actor,
    actorRole: input.actorRole,
    approval: input.approval ?? "none",
    approvalChannel: input.approvalChannel ?? "screen",
    verificationOutcome: input.verificationOutcome ?? "verified",
    requestRevisionAfterBlock: false,
    injectPayloadMismatch: false,
    replayExecution: false,
    injectedTimestamps: ctx.injectedTimestamps,
    idempotencyKey: ctx.idempotencyKey,
    outputMode: "full",
    protectedDecisionRef: null,
  };
}
