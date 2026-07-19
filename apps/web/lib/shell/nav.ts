// Release 2.3 — Product shell navigation model (pure, testable)
// ==============================================================
// The single source of truth for the Production top navigation shared by BOTH
// the root SPA (`/`, in-app view switching) and the governed Mission Control
// route (`/mission-control`). Keeping this pure (no React / no icons) lets the
// deterministic eval loader verify order, targets and active-state semantics
// without rendering JSX.
//
// It ADDS the governed Mission Control route to the existing Release 1.4 journey.
// It does NOT own or alter any mission logic, policy, approval, or data provider.

/** The existing root SPA in-app views (Release 1.4 journey). */
export type ShellViewKey = "brief" | "mission" | "command" | "workspace" | "evaluation";

/** Every addressable shell destination, including the governed route. */
export type ShellNavKey = ShellViewKey | "mission-control";

export type ShellNavItem =
  | { kind: "view"; key: ShellViewKey; label: string }
  | { kind: "route"; key: "mission-control"; label: string; href: string };

/** Canonical governed Mission Control route. */
export const MISSION_CONTROL_ROUTE = "/mission-control";

/**
 * The ordered Production navigation. Mission Control sits between
 * "Today's Mission" and "Command Center" so the seller can move from the
 * daily mission into the governed renewal-risk experience.
 */
export const SHELL_NAV_ITEMS: readonly ShellNavItem[] = [
  { kind: "view", key: "brief", label: "Morning Brief" },
  { kind: "view", key: "mission", label: "Today's Mission" },
  { kind: "route", key: "mission-control", label: "Mission Control", href: MISSION_CONTROL_ROUTE },
  { kind: "view", key: "command", label: "Command Center" },
  { kind: "view", key: "workspace", label: "Workspace" },
  { kind: "view", key: "evaluation", label: "Trust & Governance" },
] as const;

export const VALID_SHELL_VIEWS: readonly ShellViewKey[] = [
  "brief",
  "mission",
  "command",
  "workspace",
  "evaluation",
];

/**
 * The href an in-app view item uses when rendered OUTSIDE the root SPA (e.g. from
 * the `/mission-control` route), so no navigation item is ever dead — it returns
 * to the app and opens the requested view via the `?view=` deep link.
 */
export function viewItemHref(key: ShellViewKey): string {
  return `/?view=${key}`;
}

/** Resolve the target href for any nav item given the current surface. */
export function shellNavItemHref(item: ShellNavItem, opts: { onRoot: boolean }): string {
  if (item.kind === "route") return item.href;
  // On the root SPA the view items are handled by in-app state (no navigation),
  // so callers that need an href (off-root) get the deep link.
  return opts.onRoot ? "#" : viewItemHref(item.key);
}

/**
 * Derive which nav item is active for the current surface.
 * - On `/mission-control` → the governed route item.
 * - On the root SPA (`/`) → the active in-app view (never "landing").
 * - Otherwise → nothing active.
 */
export function resolveActiveNavKey(ctx: {
  pathname: string;
  view?: ShellViewKey | "landing" | null;
}): ShellNavKey | null {
  if (ctx.pathname === MISSION_CONTROL_ROUTE) return "mission-control";
  if (ctx.pathname === "/" && ctx.view && ctx.view !== "landing") return ctx.view;
  return null;
}

/** Parse and validate a `?view=` deep-link parameter. */
export function parseViewParam(value: string | null | undefined): ShellViewKey | null {
  return value && (VALID_SHELL_VIEWS as readonly string[]).includes(value)
    ? (value as ShellViewKey)
    : null;
}
