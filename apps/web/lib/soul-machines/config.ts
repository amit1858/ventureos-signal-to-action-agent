// Soul Machines Manager Coach — POC configuration (presentation layer only).
//
// This module is the single source of truth for whether the experimental
// Manager Coach POC is enabled and where its (presentation-only) assistant
// experience is hosted. It is intentionally isolated: it imports nothing from
// the ranking, recommendation, governance, approval, memory, mission or CRM
// layers, and it exposes no way to influence them.
//
// Fail-closed by default: unless NEXT_PUBLIC_ENABLE_SOUL_MACHINES_POC is the
// exact string "true", the POC is disabled — the entry does not render, the
// route returns notFound(), and no Soul Machines resources load.

export const POC_FLAG_ENV = "NEXT_PUBLIC_ENABLE_SOUL_MACHINES_POC" as const;
export const ASSISTANT_URL_ENV = "NEXT_PUBLIC_SOUL_MACHINES_ASSISTANT_URL" as const;

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
 * Whether the Manager Coach POC is enabled. Reads the build-time public flag
 * and fails closed on anything other than the exact string "true".
 */
export function isSoulMachinesPocEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_SOUL_MACHINES_POC === "true";
}

function isAllowedAssistantHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_ASSISTANT_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

/**
 * The configured Soul Machines assistant URL, validated. Returns null (fail
 * closed) when unset, malformed, non-https, or pointing at a host outside the
 * Soul Machines allow-list. A null result drives the "configuration missing"
 * state — never a blank or arbitrary embed.
 */
export function getAssistantUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SOUL_MACHINES_ASSISTANT_URL;
  if (!raw || raw.trim().length === 0) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (!isAllowedAssistantHost(parsed.hostname)) return null;

  return parsed.toString();
}

/**
 * Convenience: the POC can only actually render an embedded experience when it
 * is both enabled and correctly configured.
 */
export function isSoulMachinesPocConfigured(): boolean {
  return isSoulMachinesPocEnabled() && getAssistantUrl() !== null;
}
