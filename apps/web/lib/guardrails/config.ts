// Guardrails Lab — server-only NVIDIA adapter configuration
// =========================================================
// Resolves the isolated Guardrails adapter config from a SERVER-side env bag.
// The official NemoGuard JailbreakDetect endpoint is a CONSTANT here (verified by
// the live probe); it is NOT a required Production environment variable. Only two
// approved non-secret vars are read:
//
//   * NVIDIA_GUARDRAILS_MODE       — "mock" | "live" | "forced_fallback"
//   * NVIDIA_GUARDRAILS_TIMEOUT_MS — client timeout budget (default 2500)
//
// An OPTIONAL development-only endpoint override (NVIDIA_GUARDRAILS_DEV_ENDPOINT)
// exists for local testing; it is never required and never persisted to Production.
// The server-only NVIDIA_API_KEY is reused for auth and is NEVER exposed.

import type { NvidiaGuardrailsMode } from "./types";

/** The verified official NemoGuard JailbreakDetect hosted endpoint. Constant,
 * not an environment variable. Confirmed by the live probe (HTTP 200 with the
 * `{ "input": "<text>" }` request schema). */
export const NEMOGUARD_JAILBREAK_ENDPOINT =
  "https://ai.api.nvidia.com/v1/security/nvidia/nemoguard-jailbreak-detect";

/** Default client timeout budget (ms). The live probe measured ~280–310ms. */
export const DEFAULT_GUARDRAILS_TIMEOUT_MS = 2500;

/** Resolved, server-only Guardrails adapter configuration. */
export interface GuardrailsConfig {
  readonly mode: NvidiaGuardrailsMode;
  readonly endpoint: string;
  readonly timeoutMs: number;
  /** Present only server-side; never serialised to any presentation surface. */
  readonly apiKey: string | undefined;
}

function normalizeMode(raw: string | undefined): NvidiaGuardrailsMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "live") return "live";
  if (v === "forced_fallback" || v === "forced-fallback") return "forced_fallback";
  return "mock";
}

function parseTimeout(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_GUARDRAILS_TIMEOUT_MS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GUARDRAILS_TIMEOUT_MS;
}

/** Read the isolated Guardrails config from a server-side env bag. Defaults to
 * mock (deterministic) so no live network occurs unless explicitly enabled. */
export function guardrailsConfigFromEnv(
  env: Record<string, string | undefined>,
): GuardrailsConfig {
  const devOverride = env.NVIDIA_GUARDRAILS_DEV_ENDPOINT?.trim();
  return {
    mode: normalizeMode(env.NVIDIA_GUARDRAILS_MODE),
    endpoint: devOverride && devOverride.length > 0 ? devOverride : NEMOGUARD_JAILBREAK_ENDPOINT,
    timeoutMs: parseTimeout(env.NVIDIA_GUARDRAILS_TIMEOUT_MS),
    apiKey: env.NVIDIA_API_KEY,
  };
}

/** True only when a live classification is possible (mode=live + key present). */
export function canRunLive(config: GuardrailsConfig): boolean {
  return config.mode === "live" && Boolean(config.apiKey && config.apiKey.trim());
}
