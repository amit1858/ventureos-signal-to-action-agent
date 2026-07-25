// Soul Machines Manager Coach — POC configuration (presentation layer only).
//
// This module is the single source of truth for whether the experimental
// Manager Coach POC is enabled and where its (presentation-only) assistant
// experience is hosted. It is intentionally isolated: it imports nothing from
// the ranking, recommendation, governance, approval, memory, mission or CRM
// layers, and it exposes no way to influence them.
//
// This feature ships ALWAYS-ON with a built-in default assistant URL, so it
// requires no environment variables or Vercel configuration to appear. An
// optional NEXT_PUBLIC_SOUL_MACHINES_ASSISTANT_URL override is still honored if
// present, but is not needed.

export const POC_FLAG_ENV = "NEXT_PUBLIC_ENABLE_SOUL_MACHINES_POC" as const;
export const ASSISTANT_URL_ENV = "NEXT_PUBLIC_SOUL_MACHINES_ASSISTANT_URL" as const;

// Built-in default assistant URL. Presentation-layer only. This is a public
// Soul Machines assistant share link (the `t=` token is the shareable session
// identifier, not a long-lived API credential); as a NEXT_PUBLIC_ value it was
// always destined for the client bundle, so shipping it here is no broader an
// exposure than the env var was. Hardcoding removes any deploy-time config.
const DEFAULT_ASSISTANT_URL =
  "https://workforce.soulmachines.com/assistant?t=3a1d49c8-81e4-406b-967f-cd2138a8bab7" as const;

// Dedicated, isolated route for the POC. Not added to the platform shell nav.
export const POC_ROUTE = "/manager-coach/avatar-poc" as const;

// Persona shown inside the experience. The avatar is a presentation adapter
// only — it never becomes the coaching intelligence.
export const PERSONA_NAME = "AI Sales Director" as const;

export const READY_MESSAGE =
  "Your AI Sales Director is ready to help you prepare for the next coaching conversation." as const;

// Hosts we will allow to be embedded / opened. Anything else is rejected so a
// mis-set env var can never point the POC at an arbitrary origin.
const ALLOWED_ASSISTANT_HOSTS = ["soulmachines.com"] as const;

/**
 * Whether the Manager Coach experience is enabled. This feature is always-on:
 * it no longer depends on any environment variable or Vercel configuration.
 */
export function isSoulMachinesPocEnabled(): boolean {
  return true;
}

function isAllowedAssistantHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_ASSISTANT_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

/**
 * The Soul Machines assistant URL, validated. Falls back to the built-in
 * default when no override env var is set, so the experience always has a valid
 * URL without any configuration. An override is honored only if it is https and
 * points at a Soul Machines host; otherwise the built-in default is used.
 */
export function getAssistantUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SOUL_MACHINES_ASSISTANT_URL;
  const candidate = raw && raw.trim().length > 0 ? raw.trim() : DEFAULT_ASSISTANT_URL;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return DEFAULT_ASSISTANT_URL;
  }

  if (parsed.protocol !== "https:") return DEFAULT_ASSISTANT_URL;
  if (!isAllowedAssistantHost(parsed.hostname)) return DEFAULT_ASSISTANT_URL;

  return parsed.toString();
}

/**
 * Convenience: the POC can only actually render an embedded experience when it
 * is both enabled and correctly configured.
 */
export function isSoulMachinesPocConfigured(): boolean {
  return isSoulMachinesPocEnabled() && getAssistantUrl() !== null;
}
