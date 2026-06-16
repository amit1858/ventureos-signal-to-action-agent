// Phase 5.0A · True BYOK provider experience (session-scoped key store).
//
// Bring Your Own Key: a user can supply their own provider API key through the
// UI. Keys live ONLY in `sessionStorage`, so they disappear the moment the
// browser tab closes — perfect for demos, hackathons and evaluations. They are
// NEVER written to localStorage, NEVER persisted to a database and NEVER logged.
// A key is sent to the backend only inside the body of the request that needs it
// (compare / evaluate / test) and is used for that single request only.
//
// This module is the single source of truth for reading/writing session keys and
// for masking them for display. It is intentionally tiny and dependency-free.

export type ByokProviderId = "openai" | "anthropic" | "nvidia";

export const BYOK_PROVIDER_IDS: ByokProviderId[] = ["openai", "anthropic", "nvidia"];

/** A credential as held in the browser session (camelCase, UI-facing). */
export interface ByokCredential {
  apiKey: string;
  model: string;
  baseUrl: string;
}

/** The backend wire shape (snake_case) for one credential. */
export interface ByokCredentialWire {
  api_key: string;
  model: string;
  base_url: string;
}

const KEY_PREFIX = "s2a.byok.";
const ACTIVE_KEY = "s2a.byok.active";

/** Active-provider selection includes the always-available deterministic baseline. */
export type ActiveProvider = "deterministic" | ByokProviderId;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function storageKey(provider: ByokProviderId): string {
  return `${KEY_PREFIX}${provider}`;
}

// -- credential read/write -----------------------------------------------

/** Read one provider's session credential, or `null` if none is stored. */
export function getCredential(provider: ByokProviderId): ByokCredential | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(provider));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ByokCredential>;
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      model: typeof parsed.model === "string" ? parsed.model : "",
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
    };
  } catch {
    return null;
  }
}

/** Store one provider's session credential. Empty values are kept as "". */
export function setCredential(provider: ByokProviderId, cred: ByokCredential): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(
      storageKey(provider),
      JSON.stringify({
        apiKey: cred.apiKey ?? "",
        model: cred.model ?? "",
        baseUrl: cred.baseUrl ?? "",
      }),
    );
  } catch {
    /* sessionStorage may be unavailable (private mode) — fail silently. */
  }
}

/** Remove one provider's session credential. */
export function clearCredential(provider: ByokProviderId): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(storageKey(provider));
  } catch {
    /* ignore */
  }
  // If the cleared provider was active, fall back to the deterministic baseline.
  if (getActiveProvider() === provider) {
    setActiveProvider("deterministic");
  }
}

/** True when a provider has a non-empty session key. */
export function hasSessionKey(provider: ByokProviderId): boolean {
  const cred = getCredential(provider);
  return !!cred && cred.apiKey.trim().length > 0;
}

// -- active provider ------------------------------------------------------

/** The provider the user has chosen to reason with (defaults to deterministic). */
export function getActiveProvider(): ActiveProvider {
  if (!isBrowser()) return "deterministic";
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_KEY);
    if (raw === "openai" || raw === "anthropic" || raw === "nvidia" || raw === "deterministic") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "deterministic";
}

export function setActiveProvider(provider: ActiveProvider): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(ACTIVE_KEY, provider);
  } catch {
    /* ignore */
  }
}

// -- wire helpers ---------------------------------------------------------

/** One credential in the backend wire shape, or `null` when there is no key. */
export function toWire(provider: ByokProviderId): ByokCredentialWire | null {
  const cred = getCredential(provider);
  if (!cred || cred.apiKey.trim().length === 0) {
    // Still forward a model/base-url override even without a session key, so a
    // user can tweak the model while relying on an env key. Otherwise omit.
    if (cred && (cred.model.trim() || cred.baseUrl.trim())) {
      return { api_key: "", model: cred.model.trim(), base_url: cred.baseUrl.trim() };
    }
    return null;
  }
  return { api_key: cred.apiKey, model: cred.model.trim(), base_url: cred.baseUrl.trim() };
}

/**
 * All stored session credentials in the backend wire shape, keyed by provider.
 * Only providers that actually carry a key (or an override) are included, so an
 * empty result means "use infrastructure mode (env vars) only".
 */
export function getAllCredentialsWire(): Record<string, ByokCredentialWire> {
  const out: Record<string, ByokCredentialWire> = {};
  for (const provider of BYOK_PROVIDER_IDS) {
    const wire = toWire(provider);
    if (wire) out[provider] = wire;
  }
  return out;
}

// -- masking --------------------------------------------------------------

/**
 * Mask a key for display: reveal a short, non-secret prefix (e.g. `sk-ant-`)
 * then a fixed run of dots. Never reveals the secret body and never reveals the
 * tail. An empty key returns "".
 */
export function maskKey(key: string): string {
  const k = (key ?? "").trim();
  if (!k) return "";
  // Reveal a recognisable provider prefix up to and including the first dash
  // group (e.g. "sk-", "sk-ant-", "nvapi-"), capped so we never show much.
  const match = k.match(/^([A-Za-z]{2,6}-(?:[A-Za-z]{2,6}-)?)/);
  const prefix = match ? match[1].slice(0, 8) : k.slice(0, 3);
  return `${prefix}${"•".repeat(12)}`;
}
