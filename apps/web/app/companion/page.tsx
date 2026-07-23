// Revenue Companion — `/companion` route
// ======================================
// Isolated, feature-flagged Revenue Companion. It is DISABLED by default and is
// NOT added to Production navigation. Access is decided ONLY on the server, by
// the server-only `VENTUREOS_REVENUE_COMPANION` flag (never bundled into browser
// JS); when it is absent or not exactly "true", the route returns not-found — it
// never silently enables. The deployment layer supplies hosting-level preview
// protection as the second access factor.
//
// The page is a pure consumer: it loads the build-time-generated, contract-
// validated governed demo projection, builds a groundedness-validated companion
// view model on the server (deterministic; NVIDIA unconfigured), and renders it
// read-only. It re-runs no detection, mission selection, governance, approval, or
// execution, and makes no CRM write-back.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";

import { isRevenueCompanionAccessible } from "@/lib/revenue-companion/access.server";
import { buildDefaultCompanion } from "@/lib/revenue-companion/buildCompanions.server";
import { loadDemoJourneys } from "@/lib/demo-mode/loadDemoJourney";
import { COMPANION_STRINGS } from "@/lib/revenue-companion/strings";
import { RevenueCompanionPanel } from "@/components/revenue-companion/RevenueCompanionPanel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Revenue Companion",
  robots: { index: false, follow: false },
};

export default function RevenueCompanionPage() {
  // Server-only gate. The Companion is disabled unless the server-only flag is
  // exactly "true"; any other state fails closed to the safe not-found.
  if (!isRevenueCompanionAccessible()) {
    notFound();
  }

  const doc = loadDemoJourneys();
  const vm = buildDefaultCompanion(doc);

  return (
    <div className="flex min-h-screen flex-col bg-base">
      <header className="sticky top-0 z-30 border-b border-edge bg-base/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[820px] items-center justify-between gap-3 px-5 py-3">
          <Link
            href="/"
            className="group flex items-center gap-3 text-left"
            aria-label="Signal-to-Action Agent — home"
          >
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-brand/40 bg-gradient-to-br from-brand/25 to-brand/5 transition-colors group-hover:border-brand/70">
              <Sparkles size={18} className="text-brand-bright" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold leading-tight text-ink">
                  Signal-to-Action
                </span>
                <span className="rounded border border-gov/40 bg-gov/10 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wider text-gov-bright">
                  {COMPANION_STRINGS.bannerLabel}
                </span>
              </div>
              <p className="text-[11px] leading-tight text-muted">
                Narrative view of governed results, rendered read-only
              </p>
            </div>
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[820px] px-5 py-8">
          <div className="space-y-2">
            <p className="eyebrow">{COMPANION_STRINGS.eyebrow}</p>
            <h1 className="text-2xl font-semibold text-ink">
              {COMPANION_STRINGS.title}
            </h1>
            <p className="section-sub max-w-[62ch]">{COMPANION_STRINGS.intro}</p>
          </div>

          <div className="mt-6">
            <RevenueCompanionPanel vm={vm} />
          </div>

          <div className="mt-6">
            <Link
              href="/demo/signal-to-action"
              className="btn btn-outline-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              {COMPANION_STRINGS.openDemoLabel}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
