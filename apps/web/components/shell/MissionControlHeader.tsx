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
import { MISSION_CONTROL_ROUTE, resolveActiveNavKey } from "@/lib/shell/nav";

export function MissionControlHeader() {
  const activeKey = resolveActiveNavKey({ pathname: MISSION_CONTROL_ROUTE });

  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-base/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1840px] flex-wrap items-center justify-between gap-3 px-5 py-3">
        <Link href="/" className="group flex items-center gap-3 text-left" aria-label="Signal-to-Action Agent — home">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-brand/40 bg-gradient-to-br from-brand/25 to-brand/5 transition-colors group-hover:border-brand/70">
            <Activity size={18} className="text-brand-bright" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand animate-pulseline" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-semibold leading-tight text-ink">Signal-to-Action Agent</h1>
              <span className="hidden rounded border border-edge bg-surface2 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wider text-faint sm:inline">
                by VentureOS
              </span>
            </div>
            <p className="text-[11px] leading-tight text-muted">Governed renewal-risk mission</p>
          </div>
        </Link>

        <ShellNav activeKey={activeKey} />
      </div>
    </header>
  );
}
