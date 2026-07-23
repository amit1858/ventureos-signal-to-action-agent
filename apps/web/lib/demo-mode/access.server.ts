// VentureOS — Demo Mode · Server-only access gate
// ================================================
// This module is the SINGLE server-side gate for the isolated Demo Mode route.
// It is server-only by two means: (1) it reads `process.env` for a bare,
// non-`NEXT_PUBLIC_` variable (Next.js only inlines `NEXT_PUBLIC_*` into the
// browser bundle, so this value can never reach client JavaScript); and (2) a
// hard runtime guard throws if the module is ever evaluated in a browser.
// Client components must never import this module.
//
// ACCESS CONTROL
// --------------
// Repository discovery found NO in-application authentication, session,
// middleware, or user allowlist. ("Authentication & SSO" is explicitly marked
// *planned* in the product UI; the domain "allowlists" are account-id data
// guards, not user access control.) Following the approved fallback, this task
// does NOT invent an authentication framework. Application-level access rests on
// the server-only flag failing closed, and the DEPLOYMENT must add hosting-level
// preview protection (see the readiness report). The route must therefore never
// be described as application-authenticated.

import { DEMO_MODE_ENV_VAR, isDemoModeValueEnabled } from "./featureFlag";

if (typeof window !== "undefined") {
  // Fail loudly if this ever gets pulled into a client bundle.
  throw new Error(
    "demo-mode/access.server must only run on the server; it must not be imported by client components.",
  );
}

// True only when the server-only flag is exactly "true".
export function isDemoModeFlagEnabled(): boolean {
  return isDemoModeValueEnabled(process.env[DEMO_MODE_ENV_VAR]);
}

// The single access decision for the route. Today this is the server-only flag;
// the deployment layer supplies the second factor (hosting-level preview
// protection). It fails closed for any value other than exactly "true".
export function isDemoModeAccessible(): boolean {
  return isDemoModeFlagEnabled();
}
