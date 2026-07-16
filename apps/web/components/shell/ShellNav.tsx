"use client";

// Release 2.3 — Shared product shell navigation (presentation)
// ============================================================
// Renders the ordered Production nav from the single source of truth in
// `lib/shell/nav`. It is surface-agnostic:
//   - On the root SPA it switches in-app views via `onSelectView` (buttons).
//   - On the `/mission-control` route (no `onSelectView`) the in-app views
//     become `?view=` deep links back into the app, while the governed route
//     item is rendered as the active destination.
// It owns NO business state — only presentation + navigation intent.

import * as React from "react";
import Link from "next/link";
import { Sunrise, Rocket, Radar, LayoutDashboard, Columns3, Gauge } from "lucide-react";
import { cx } from "@/lib/format";
import {
  SHELL_NAV_ITEMS,
  viewItemHref,
  type ShellNavKey,
  type ShellViewKey,
} from "@/lib/shell/nav";

const ICONS: Record<ShellNavKey, React.ReactNode> = {
  brief: <Sunrise size={13} />,
  mission: <Rocket size={13} />,
  "mission-control": <Radar size={13} />,
  command: <LayoutDashboard size={13} />,
  workspace: <Columns3 size={13} />,
  evaluation: <Gauge size={13} />,
};

function tabClass(active: boolean): string {
  return cx(
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
    active ? "bg-brand/15 text-brand-bright shadow-glow-soft" : "text-faint hover:text-muted",
  );
}

export function ShellNav({
  activeKey,
  onSelectView,
}: {
  activeKey: ShellNavKey | null;
  /** Provided on the root SPA to switch in-app views. Omitted on sub-routes. */
  onSelectView?: (key: ShellViewKey) => void;
}) {
  return (
    <nav
      aria-label="Product navigation"
      className="flex items-center rounded-lg border border-edge bg-surface2/60 p-0.5"
    >
      {SHELL_NAV_ITEMS.map((item) => {
        const active = item.key === activeKey;

        if (item.kind === "route") {
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={tabClass(active)}
            >
              {ICONS[item.key]}
              {item.label}
            </Link>
          );
        }

        // In-app view: button on root (in-app switch), deep link off-root.
        if (onSelectView) {
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelectView(item.key)}
              aria-pressed={active}
              className={tabClass(active)}
            >
              {ICONS[item.key]}
              {item.label}
            </button>
          );
        }

        return (
          <Link
            key={item.key}
            href={viewItemHref(item.key)}
            aria-current={active ? "page" : undefined}
            className={tabClass(active)}
          >
            {ICONS[item.key]}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
