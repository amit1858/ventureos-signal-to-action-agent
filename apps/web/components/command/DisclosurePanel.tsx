// Phase 15B — Reusable progressive-disclosure accordion shell.
//
// Wraps an intelligence panel with a header that shows a summary line in
// the collapsed state, and reveals the full panel when expanded. Optional
// localStorage persistence per-id so the user's open/closed choice survives
// reloads. Purely presentational — never modifies the wrapped panel.

"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cx } from "@/lib/format";

interface Props {
  id: string;
  eyebrow?: string;
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  persist?: boolean;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

const STORAGE_PREFIX = "s2a_disclosure_v1:";

function loadOpen(id: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + id);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* noop */
  }
  return fallback;
}

function saveOpen(id: string, open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + id, open ? "1" : "0");
  } catch {
    /* noop */
  }
}

export function DisclosurePanel({
  id,
  eyebrow,
  title,
  summary,
  defaultOpen = false,
  persist = true,
  headerRight,
  children,
}: Props) {
  const [open, setOpen] = React.useState<boolean>(defaultOpen);

  React.useEffect(() => {
    if (!persist) return;
    setOpen(loadOpen(id, defaultOpen));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, persist]);

  // Re-sync if mode-driven defaultOpen changes (e.g. seller -> executive).
  React.useEffect(() => {
    if (persist) return;
    setOpen(defaultOpen);
  }, [defaultOpen, persist]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (persist) saveOpen(id, next);
      return next;
    });
  };

  return (
    <section
      className={cx(
        "overflow-hidden rounded-xl border border-edge bg-surface2/40 transition-colors",
        open && "bg-surface2/60",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface2/60"
      >
        <ChevronDown
          size={14}
          className={cx("shrink-0 text-muted transition-transform", open ? "rotate-0" : "-rotate-90")}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">
              {eyebrow}
            </div>
          ) : null}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="text-[12.5px] font-semibold text-ink">{title}</span>
            {!open && summary ? (
              <span className="text-[11px] text-muted">{summary}</span>
            ) : null}
          </div>
        </div>
        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
      </button>
      {open ? <div className="border-t border-edge/70 p-3 sm:p-3.5">{children}</div> : null}
    </section>
  );
}
