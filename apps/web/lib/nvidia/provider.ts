// Release 2.3 — NVIDIA-Grounded Mission Intelligence · provider selection
// =======================================================================
// Server-side selection of the narrative provider. The default is the
// deterministic mock; a live NVIDIA NIM provider is DECLARED but intentionally
// NOT IMPLEMENTED in this slice (no live key, no network call this release).
//
// No browser credentials, endpoints, or tokens are read here, and there is no
// global mutable state: configuration is passed in explicitly.

import { mockNarrativeProvider } from "./mockProvider";
import type { NvidiaNarrativeProvider, NvidiaProviderName } from "./types";

/** Server-side NVIDIA configuration. Resolved from server env by the route; never
 * exposed to the browser (no NEXT_PUBLIC_*). */
export interface NvidiaProviderConfig {
  /** Which provider to use. Defaults to "mock" when unset/unknown. */
  mode?: string;
  /** The audience the language targets. */
  audience?: string;
}

export const DEFAULT_AUDIENCE = "business";

function normalizeMode(mode: string | undefined): NvidiaProviderName {
  if (mode === "nim") return "nim";
  return "mock";
}

/** Resolve a concrete provider from config. The live "nim" path is declared but
 * not implemented in this slice and fails closed to the deterministic baseline
 * at the orchestration layer. */
export function selectNarrativeProvider(config: NvidiaProviderConfig = {}): NvidiaNarrativeProvider {
  const mode = normalizeMode(config.mode);
  if (mode === "nim") {
    // Declared, not implemented this slice. Returning a provider that throws keeps
    // the orchestration honest: it fails closed to the deterministic fallback and
    // never silently pretends a live model ran.
    return {
      name: "nim",
      model: "nvidia-nim-not-implemented",
      generate() {
        return Promise.reject(
          new Error("NVIDIA NIM provider is not implemented in this slice (mock only)."),
        );
      },
    };
  }
  return mockNarrativeProvider;
}

/** Read NVIDIA config from a server-side env bag (never the browser). Only the
 * non-secret mode/audience influence presentation; any API key stays unused this
 * slice and is never returned to a surface. */
export function nvidiaConfigFromEnv(env: Record<string, string | undefined>): NvidiaProviderConfig {
  return {
    mode: env.NVIDIA_NARRATIVE_MODE,
    audience: env.NVIDIA_NARRATIVE_AUDIENCE ?? DEFAULT_AUDIENCE,
  };
}
