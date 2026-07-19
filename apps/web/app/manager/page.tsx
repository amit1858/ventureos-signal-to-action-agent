// Manager Coaching Curefoods Slice — /manager route
// ==================================================
// A dedicated, directly-refreshable route for the read-only Manager Coaching
// experience. It is intentionally NOT wired into the Production persona
// navigation shell. The header is self-contained: a brand mark that returns
// home, plus a Guided Demo marker — it adds nothing to the shared `ShellNav`,
// so Production navigation is unchanged.

import Link from "next/link";
import { Activity, GitBranch } from "lucide-react";
import { ManagerCoachingView } from "@/components/manager/ManagerCoachingView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manager Coaching · Curefoods renewal (Guided Demo)",
};

function ManagerHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-base/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[980px] flex-wrap items-center justify-between gap-3 px-5 py-3">
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
            <p className="text-[11px] leading-tight text-muted">Manager coaching · Curefoods renewal</p>
          </div>
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-300">
          <GitBranch size={11} /> Guided Demo
        </span>
      </div>
    </header>
  );
}

export default function ManagerPage() {
  return (
    <div className="flex min-h-screen flex-col bg-base">
      <ManagerHeader />
      <main className="flex-1">
        <ManagerCoachingView />
      </main>
    </div>
  );
}
