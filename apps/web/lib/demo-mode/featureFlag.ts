// VentureOS — Demo Mode · Feature-flag predicate (pure, server-only value)
// ========================================================================
// Demo Mode is gated by a SERVER-ONLY environment variable, `VENTUREOS_DEMO_MODE`
// (bare, non-`NEXT_PUBLIC_`, matching the repo convention for server-only vars
// such as HARNESS_SERVICE_TOKEN / NVIDIA_* — read only on the server, never
// bundled into browser JavaScript).
//
// This module is intentionally PURE: it neither reads the environment nor
// imports anything, so it is safe to unit-test. The actual server-side read of
// the environment happens only in `access.server.ts`, which is guarded against
// browser evaluation. Client components must never import either module.

export const DEMO_MODE_ENV_VAR = "VENTUREOS_DEMO_MODE" as const;

// Enabled only when the flag value is exactly "true". Missing, "false", "1",
// "TRUE", or any other value keeps Demo Mode disabled.
export function isDemoModeValueEnabled(value: string | undefined | null): boolean {
  return value === "true";
}
