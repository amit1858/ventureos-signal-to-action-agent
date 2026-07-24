// VentureOS — Revenue Companion · Voice feature-flag + key predicates (pure)
// ==========================================================================
// The optional voice briefing is gated by a SERVER-ONLY flag,
// `VENTUREOS_VOICE_BRIEFING` (bare, non-`NEXT_PUBLIC_`), and the Gnani provider
// is configured by a SERVER-ONLY secret, `GNANI_API_KEY`. Neither may ever be
// `NEXT_PUBLIC_` and neither is bundled into browser JavaScript.
//
// This module is intentionally PURE: it neither reads the environment nor
// imports anything, so it is unit-testable. The env reads happen only in
// `access.server.ts` / the server route, both guarded against browser use.

export const VOICE_BRIEFING_ENV_VAR = "VENTUREOS_VOICE_BRIEFING" as const;
export const GNANI_API_KEY_ENV_VAR = "GNANI_API_KEY" as const;

// Enabled only when the flag value is exactly "true" (fail closed otherwise).
export function isVoiceBriefingValueEnabled(
  value: string | undefined | null,
): boolean {
  return value === "true";
}

// Configured only when a non-empty, non-placeholder key value is present. This
// never inspects the key contents beyond emptiness — no prefix, suffix, length,
// or fragment is derived or returned anywhere.
export function isGnaniConfiguredValue(value: string | undefined | null): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  // Guard against obvious placeholders accidentally set in an env file.
  const placeholders = new Set([
    "changeme",
    "your-api-key",
    "<api_key>",
    "todo",
    "placeholder",
  ]);
  return !placeholders.has(trimmed.toLowerCase());
}

// The truthful provider classification, given flag + key state. Note that
// "gnani_live" is NEVER derived here — it can only be asserted after a real
// server-side synthesis call succeeds (see gnaniProvider.server.ts).
export type VoiceProviderClassification =
  | "voice_disabled"
  | "gnani_unconfigured"
  | "gnani_configured_unverified";

export function classifyVoiceProvider(
  flagValue: string | undefined | null,
  keyValue: string | undefined | null,
): VoiceProviderClassification {
  if (!isVoiceBriefingValueEnabled(flagValue)) return "voice_disabled";
  if (!isGnaniConfiguredValue(keyValue)) return "gnani_unconfigured";
  return "gnani_configured_unverified";
}
