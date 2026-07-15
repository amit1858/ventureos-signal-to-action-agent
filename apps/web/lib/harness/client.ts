// Release 2.2 — Mission BFF · Server-only Python harness client
// =============================================================
// The ONLY place the Next.js server calls the Python Adaptive Mission Harness.
// It is server-only (imported exclusively by the BFF route / core) and must
// never be bundled to the browser: it reads the private endpoint and service
// token from server env and presents the token as `X-Harness-Service-Token`.
//
// Transport policy (LOCKED):
//   * Compose the public route: `${PYTHON_HARNESS_URL}/api/harness/missions`.
//   * Timeout: 10s via AbortController.
//   * Retry: at most ONCE, only for a network/timeout failure or an HTTP 503,
//     re-sending the IDENTICAL request (same requestId, correlationId,
//     idempotencyKey). Never retry 4xx or governed 200s.
//   * Return a typed outcome; never throw a raw error across the boundary and
//     never leak the endpoint or token in any message.

import type { HarnessServiceRequest } from "./types";

const HARNESS_PATH = "/api/harness/missions";
const DEFAULT_TIMEOUT_MS = 10_000;
const CORRELATION_HEADER = "X-Correlation-ID";
const SERVICE_TOKEN_HEADER = "X-Harness-Service-Token";

/** A successful transport round-trip (any HTTP status with a JSON body). */
export interface HarnessCallSuccess {
  ok: true;
  httpStatus: number;
  body: unknown;
}

/** A transport-level failure the BFF maps to a governed unavailable outcome. */
export interface HarnessCallFailure {
  ok: false;
  kind: "network" | "timeout" | "non_json" | "misconfigured";
  message: string;
}

export type HarnessCallOutcome = HarnessCallSuccess | HarnessCallFailure;

/** An injectable harness caller (real implementation or a test double). */
export type HarnessCaller = (
  request: HarnessServiceRequest,
) => Promise<HarnessCallOutcome>;

export interface HarnessClientConfig {
  baseUrl: string;
  serviceToken?: string;
  timeoutMs?: number;
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

function isRetryable(outcome: HarnessCallOutcome): boolean {
  if (outcome.ok) return outcome.httpStatus === 503;
  return outcome.kind === "network" || outcome.kind === "timeout";
}

async function attempt(
  request: HarnessServiceRequest,
  config: Required<Pick<HarnessClientConfig, "baseUrl" | "timeoutMs">> & HarnessClientConfig,
): Promise<HarnessCallOutcome> {
  const url = config.baseUrl.replace(/\/+$/, "") + HARNESS_PATH;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    [CORRELATION_HEADER]: request.correlationId,
  };
  if (config.serviceToken) headers[SERVICE_TOKEN_HEADER] = config.serviceToken;

  const doFetch = config.fetchImpl ?? fetch;
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: controller.signal,
      cache: "no-store",
    });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, kind: "non_json", message: "harness returned a non-JSON body" };
    }
    return { ok: true, httpStatus: res.status, body };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      kind: aborted ? "timeout" : "network",
      message: aborted ? "harness request timed out" : "harness request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Build a harness caller bound to an explicit configuration (unit-testable). */
export function createHarnessCaller(config: HarnessClientConfig): HarnessCaller {
  const resolved = { timeoutMs: DEFAULT_TIMEOUT_MS, ...config };
  return async (request: HarnessServiceRequest): Promise<HarnessCallOutcome> => {
    if (!resolved.baseUrl) {
      return { ok: false, kind: "misconfigured", message: "harness endpoint is not configured" };
    }
    const first = await attempt(request, resolved);
    if (!isRetryable(first)) return first;
    // Single identical retry (same requestId / correlationId / idempotencyKey).
    return attempt(request, resolved);
  };
}

/** The default caller, reading private server env lazily. Server-only. */
export function defaultHarnessCaller(): HarnessCaller {
  return createHarnessCaller({
    baseUrl: process.env.PYTHON_HARNESS_URL ?? "",
    serviceToken: process.env.HARNESS_SERVICE_TOKEN,
  });
}
