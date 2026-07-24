// VentureOS — Revenue Companion · Narrative adapter (server-only)
// ===============================================================
// Deterministic-FIRST narrative resolution with an optional, server-only
// provider seam. Today NVIDIA is UNCONFIGURED, so this always resolves to the
// deterministic narrative and truthfully labels it as such. It never fabricates
// a live NVIDIA result and never issues a browser-side model request — any real
// provider would run only here, on the server.
//
// This module is server-only by a hard runtime guard. Client components receive
// the already-resolved, already-validated companion view model as a prop; they
// never import this module and never read the environment.

import type { DemoPresentationView } from "../demo-mode/presentationContract";
import {
  buildDeterministicNarrative,
  resolveNarrative,
  type ProviderDraft,
  type ProviderOutcome,
  type ResolvedNarrative,
} from "./companionContract";

if (typeof window !== "undefined") {
  throw new Error(
    "revenue-companion/narrativeAdapter.server must only run on the server; it must not be imported by client components.",
  );
}

// The server-only provider boundary. A future NVIDIA narrative provider would
// implement this and run exclusively on the server. It is intentionally simple:
// given the deterministic draft + the governed source view, it may return a
// rephrased draft, or null to decline.
export interface CompanionNarrativeProvider {
  name: string;
  configured(): boolean;
  enhance(deterministic: ProviderDraft, view: DemoPresentationView): ProviderDraft | null;
}

// No provider is registered by default: NVIDIA is unconfigured, and the web tier
// deliberately carries no model transport. Registration is a server-only,
// deferred decision (see the roadmap: "NVIDIA Synthetic Dataset Generator" /
// live provider credentials).
let registeredProvider: CompanionNarrativeProvider | null = null;

// Test/di seam — never invoked in the shipped, unconfigured path.
export function __setCompanionProviderForTest(
  provider: CompanionNarrativeProvider | null,
): void {
  registeredProvider = provider;
}

function runProvider(
  deterministic: ProviderDraft,
  view: DemoPresentationView,
): ProviderOutcome {
  const provider = registeredProvider;
  if (!provider || !provider.configured()) {
    return { kind: "unconfigured" };
  }
  try {
    const draft = provider.enhance(deterministic, view);
    if (!draft) {
      return { kind: "error", reason: "provider declined" };
    }
    return { kind: "ok", draft };
  } catch (err) {
    return {
      kind: "error",
      reason: err instanceof Error ? err.message : "provider threw",
    };
  }
}

// Resolve the companion narrative for a governed source view. Deterministic
// unless a configured provider returns a groundedness-valid rephrasing.
export function resolveCompanionNarrative(
  view: DemoPresentationView,
): ResolvedNarrative {
  const deterministic = buildDeterministicNarrative(view);
  const outcome = runProvider(deterministic, view);
  return resolveNarrative(view, deterministic, outcome);
}
