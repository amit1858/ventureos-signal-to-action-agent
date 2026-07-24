// VentureOS — Revenue Companion · Feature-flag predicate (pure, server-only value)
// ================================================================================
// The Revenue Companion is gated by a SERVER-ONLY environment variable,
// `VENTUREOS_REVENUE_COMPANION` (bare, non-`NEXT_PUBLIC_`, matching the repo
// convention for server-only vars such as VENTUREOS_DEMO_MODE / VENTUREOS_ASSURANCE
// / NVIDIA_* — read only on the server, never bundled into browser JavaScript).
//
// This module is intentionally PURE: it neither reads the environment nor imports
// anything, so it is safe to unit-test. The server-side read happens only in
// `access.server.ts`, which is guarded against browser evaluation. Client
// components must never import either module.

export const REVENUE_COMPANION_ENV_VAR = "VENTUREOS_REVENUE_COMPANION" as const;

// Enabled only when the flag value is exactly "true". Missing, "false", "1",
// "TRUE", or any other value keeps the Revenue Companion disabled (fail closed).
export function isRevenueCompanionValueEnabled(
  value: string | undefined | null,
): boolean {
  return value === "true";
}
