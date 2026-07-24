// Release 2.3 — Mission Control route header (shared shell consistency)
// =====================================================================
// A slim, self-contained header for the governed `/mission-control` route so it
// is coherent with the root Production shell: the same brand mark (returns to the
// app) and the same navigation, with Mission Control shown active. It carries NO
// live data props (unlike the root Header), so it stays decoupled from the root
// backend and never blocks the governed route.

import Link from "next/link";
import { Activity } from "lucide-react";
import { ShellNav } from "@/components/shell/ShellNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MISSION_CONTROL_ROUTE, resolveActiveNavKey } from "@/lib/shell/nav";

export function MissionControlHeader() {
  const activeKey = resolveActiveNavKey({ pathname: MISSION_CONTROL_ROUTE });

  return (
    <header className="header-blue sticky top-0 z-30">
      <div className="mx-auto flex w-full max-w-[1840px] flex-wrap items-center justify-between gap-3 px-5 py-3">
        <Link href="/" className="group flex items-center gap-3 text-left" aria-label="Signal-to-Action Agent — home">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-white/15 transition-colors group-hover:border-white/50">
            <Activity size={18} className="text-white" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-white animate-pulseline" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-semibold leading-tight text-white">Signal-to-Action Agent</h1>
              <span className="hidden rounded border border-white/25 bg-white/15 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wider text-white/90 sm:inline">
                by VentureOS
              </span>
            </div>
            <p className="text-[11px] leading-tight text-white/75">Governed renewal-risk mission</p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <ShellNav activeKey={activeKey} />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
