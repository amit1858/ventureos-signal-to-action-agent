// Guardrails Lab — server-only NVIDIA NemoGuard JailbreakDetect adapter
// =====================================================================
// The ONLY place that talks to the NVIDIA hosted classifier. Runs server-side
// only; the browser never reaches NVIDIA. The API key is read from server env and
// never returned to any surface. Verified live contract (probe):
//
//   POST <endpoint>
//   Authorization: Bearer <NVIDIA_API_KEY>
//   Content-Type: application/json
//   { "input": "<text>" }            <-- input schema ONLY (messages-array 500s)
//   -> 200 { "jailbreak": boolean, "score": number }   (no model/version field)
//
// Modes:
//   * mock            — deterministic, no network (default; used by unit tests)
//   * live            — real hosted classification
//   * forced_fallback — deterministic degraded path, testable without an outage
//
// No retries in this first implementation. Timeout via AbortController. All
// failures fail SAFE to a fallback result (deterministic policy still governs).

import { canRunLive, type GuardrailsConfig } from "./config";
import { fallbackNvidiaResult, interpretRawScore, mockNvidiaResult } from "./evaluate";
import type { NvidiaJailbreakResult } from "./types";

/** Narrow an unknown JSON body to the verified `{ jailbreak, score }` shape. */
function parseClassifierBody(body: unknown): { jailbreak: boolean; score: number } | null {
  if (typeof body !== "object" || body === null) return null;
  const rec = body as Record<string, unknown>;
  if (typeof rec.jailbreak !== "boolean") return null;
  if (typeof rec.score !== "number" || !Number.isFinite(rec.score)) return null;
  return { jailbreak: rec.jailbreak, score: rec.score };
}

/** Classify a request text. Never throws: any error resolves to a fallback
 * result so the deterministic policy always completes. */
export async function classifyJailbreak(
  requestText: string,
  config: GuardrailsConfig,
): Promise<NvidiaJailbreakResult> {
  if (config.mode === "mock") {
    return mockNvidiaResult(requestText, "mock");
  }
  if (config.mode === "forced_fallback") {
    return fallbackNvidiaResult("forced_fallback", "forced_fallback");
  }
  // mode === "live"
  if (!canRunLive(config)) {
    return fallbackNvidiaResult("live", "not_configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      // Verified schema: input-only. Never the messages-array form.
      body: JSON.stringify({ input: requestText }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;

    if (res.status >= 500) {
      return fallbackNvidiaResult("live", `http_${res.status}`);
    }
    if (!res.ok) {
      return fallbackNvidiaResult("live", `http_${res.status}`);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return fallbackNvidiaResult("live", "malformed_json");
    }

    const parsed = parseClassifierBody(json);
    if (parsed === null) {
      return fallbackNvidiaResult("live", "malformed_response");
    }

    return Object.freeze({
      available: true,
      booleanResult: parsed.jailbreak,
      rawScore: parsed.score,
      latencyMs,
      fallbackUsed: false,
      errorCode: null,
      interpretationSource: "ventureos_demo",
      interpretationLabel: interpretRawScore(parsed.score),
      mode: "live",
    });
  } catch (err) {
    const code =
      err instanceof Error && err.name === "AbortError" ? "timeout" : "network_error";
    return fallbackNvidiaResult("live", code);
  } finally {
    clearTimeout(timer);
  }
}
