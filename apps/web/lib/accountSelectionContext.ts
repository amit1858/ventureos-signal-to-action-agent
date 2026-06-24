// Phase 15C.5 — Single Source of Truth for Account Selection
//
// This module defines the exclusive contract for account selection.
// App/page.tsx owns all selection state and logic.
// CommandCenter consumes this context for rendering only.

import type { Recommendation } from "@/lib/types";

export interface AccountSelectionContext {
  // Requested account before recommendation resolution (redirect > selected > url > persisted)
  requestedAccountId: string | null;

  // What account is currently active (resolved from redirect > selected > url > persisted > default)
  activeAccountId: string | null;

  // The resolved recommendation object for the active account
  activeRecommendation: Recommendation | undefined;

  // Whether this account was opened via a redirect from another surface
  isRedirected: boolean;

  // Source surface if redirected (e.g., "Portfolio Pulse", "Executive Change Brief")
  redirectSource: string | null;

  // Timestamp of redirect for UI banner lifecycle
  redirectedAt: number | null;

  // Helper: is there a valid active account selected?
  hasActiveAccount: boolean;
}

/**
 * Build the account selection context from app state.
 * Single point of resolution.
 */
export function buildAccountSelectionContext(
  redirectContext: { accountId: string; source: string; at: number } | null,
  selectedAccountId: string | null,
  urlAccountId: string | null,
  persistedAccountId: string | null,
  activeRecommendation: Recommendation | undefined,
): AccountSelectionContext {
  const requestedAccountId =
    redirectContext?.accountId ??
    selectedAccountId ??
    urlAccountId ??
    persistedAccountId ??
    null;
  const activeAccountId = activeRecommendation?.account_id ?? requestedAccountId;
  return {
    requestedAccountId,
    activeAccountId,
    activeRecommendation,
    isRedirected: Boolean(redirectContext),
    redirectSource: redirectContext?.source ?? null,
    redirectedAt: redirectContext?.at ?? null,
    hasActiveAccount: Boolean(activeAccountId),
  };
}
