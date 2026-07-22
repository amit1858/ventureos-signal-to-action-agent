// Governed Signal-to-Action Demo — `/demo/signal-to-action` route
// ===============================================================
// Isolated, feature-flagged Demo Mode. It is DISABLED by default and is NOT
// added to Production navigation. Access is decided ONLY on the server, by the
// server-only `VENTUREOS_DEMO_MODE` flag (never bundled into browser JS); when
// it is absent or not exactly "true", the route returns not-found — it never
// silently enables. The deployment layer supplies hosting-level preview
// protection as the second access factor (see the readiness report).
//
// The page is a pure consumer: it loads a build-time-generated, contract-
// validated projection of the two committed governed journeys and renders it
// read-only. It re-runs no detection, mission selection, governance, approval,
// or execution, and makes no CRM write-back.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";

import { isDemoModeAccessible } from "@/lib/demo-mode/access.server";
import { loadDemoJourneys } from "@/lib/demo-mode/loadDemoJourney";
import { DemoModeShell } from "@/components/demo-mode/DemoModeShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Governed Signal-to-Action Demo",
  robots: { index: false, follow: false },
};

export default function SignalToActionDemoPage() {
  // Server-only gate. Demo Mode is disabled unless the server-only flag is
  // exactly "true"; any other state fails closed to the safe not-found.
  if (!isDemoModeAccessible()) {
    notFound();
  }

  const doc = loadDemoJourneys();

  return (
    <div className="flex min-h-screen flex-col bg-base">
      <header className="sticky top-0 z-30 border-b border-edge bg-base/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[820px] items-center justify-between gap-3 px-5 py-3">
          <Link href="/" className="group flex items-center gap-3 text-left" aria-label="Signal-to-Action Agent — home">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-brand/40 bg-gradient-to-br from-brand/25 to-brand/5 transition-colors group-hover:border-brand/70">
              <Sparkles size={18} className="text-brand-bright" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold leading-tight text-ink">Signal-to-Action</span>
                <span className="rounded border border-gov/40 bg-gov/10 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wider text-gov-bright">
                  Internal Demo
                </span>
              </div>
              <p className="text-[11px] leading-tight text-muted">
                Governed journeys, rendered read-only
              </p>
            </div>
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <DemoModeShell doc={doc} />
      </main>
    </div>
  );
}
