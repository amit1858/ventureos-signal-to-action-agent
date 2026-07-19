// Release 2.3 — NVIDIA-Grounded Mission Intelligence · provider selection
// =======================================================================
// Server-side selection of the narrative provider. The default is the
// deterministic mock; a live NVIDIA NIM provider is DECLARED but intentionally
// NOT IMPLEMENTED in this slice (no live key, no network call this release).
//
// No browser credentials, endpoints, or tokens are read here, and there is no
// global mutable state: configuration is passed in explicitly.

import { mockNarrativeProvider } from "./mockProvider";
import { createNimProvider } from "./nimProvider";
import type { NvidiaNarrativeProvider, NvidiaProviderName } from "./types";

/** Server-side NVIDIA configuration. Resolved from server env by the route; never
 * exposed to the browser (no NEXT_PUBLIC_*). */
export interface NvidiaProviderConfig {
  /** Which provider to use. Defaults to "mock" when unset/unknown. */
  mode?: string;
  /** The audience the language targets. */
  audience?: string;
  /** Live hosted NIM config (server-only). Absent for the mock path. */
  apiBaseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Optional hard ceiling on total wall time across attempts (ms). */
  totalBudgetMs?: number;
}

export const DEFAULT_AUDIENCE = "business";
// Hosted NIM reasoning models (e.g. nemotron-nano-9b-v2) routinely take ~10-15s,
// with cold starts longer, so the default timeout gives real headroom. A live
// timeout still fails closed to the deterministic baseline.
export const DEFAULT_TIMEOUT_MS = 30000;
export const DEFAULT_MAX_RETRIES = 1;

function normalizeMode(mode: string | undefined): NvidiaProviderName {
  if (mode === "nim") return "nim";
  return "mock";
}

/** True only when every field required for a real hosted call is present. */
export function hasLiveNimConfig(config: NvidiaProviderConfig): boolean {
  return Boolean(
    config.apiBaseUrl &&
      config.apiBaseUrl.trim() &&
      config.apiKey &&
      config.apiKey.trim() &&
      config.model &&
      config.model.trim(),
  );
}

/** Resolve a concrete provider from config. When `nim` is selected AND the live
 * config is complete, a real hosted NIM provider is returned; when `nim` is
 * selected but the config is incomplete, a provider that fails closed to the
 * deterministic baseline is returned (missing live config => deterministic
 * fallback, never a silent mock). Otherwise the deterministic mock is used. */
export function selectNarrativeProvider(config: NvidiaProviderConfig = {}): NvidiaNarrativeProvider {
  const mode = normalizeMode(config.mode);
  if (mode === "nim") {
    if (hasLiveNimConfig(config)) {
      return createNimProvider({
        baseUrl: config.apiBaseUrl as string,
        apiKey: config.apiKey as string,
        model: config.model as string,
        timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
        totalBudgetMs: config.totalBudgetMs,
      });
    }
    // nim requested but not fully configured: fail closed to the deterministic
    // baseline at the orchestration layer (never pretend a live model ran).
    return {
      name: "nim",
      model: "nim-unconfigured",
      generate() {
        return Promise.reject(new Error("NVIDIA NIM provider is not fully configured."));
      },
    };
  }
  return mockNarrativeProvider;
}

function parseIntOr(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Read NVIDIA config from a server-side env bag (never the browser). The API key
 * is carried only to construct the server-to-server provider; it is never
 * returned to any surface. `NVIDIA_PROVIDER` selects the mode (with the legacy
 * `NVIDIA_NARRATIVE_MODE` as a fallback alias). */
export function nvidiaConfigFromEnv(env: Record<string, string | undefined>): NvidiaProviderConfig {
  return {
    mode: env.NVIDIA_PROVIDER ?? env.NVIDIA_NARRATIVE_MODE,
    audience: env.NVIDIA_NARRATIVE_AUDIENCE ?? DEFAULT_AUDIENCE,
    apiBaseUrl: env.NVIDIA_API_BASE_URL,
    apiKey: env.NVIDIA_API_KEY,
    model: env.NVIDIA_MODEL,
    timeoutMs: parseIntOr(env.NVIDIA_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxRetries: parseIntOr(env.NVIDIA_MAX_RETRIES, DEFAULT_MAX_RETRIES),
    totalBudgetMs:
      env.NVIDIA_TOTAL_BUDGET_MS !== undefined
        ? parseIntOr(env.NVIDIA_TOTAL_BUDGET_MS, DEFAULT_TIMEOUT_MS)
        : undefined,
  };
}
