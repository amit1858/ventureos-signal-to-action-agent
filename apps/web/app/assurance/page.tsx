// AI Assurance — `/assurance` route
// =================================
// Isolated, feature-flagged assurance screen. It is DISABLED by default and is
// NOT added to Production navigation. Access is decided ONLY on the server, by the
// server-only `VENTUREOS_ASSURANCE` flag (never bundled into browser JS); when it
// is absent or not exactly "true", the route returns not-found — it never silently
// enables. The deployment layer supplies hosting-level preview protection as the
// second access factor.
//
// The page is a pure consumer: it loads a build-time-generated, contract-validated
// projection of the real deterministic evaluators and renders it read-only. It
// re-runs no evaluation, governance, approval, or execution, and makes no CRM
// write-back. NVIDIA is presented as advisory only.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { isAssuranceAccessible } from "@/lib/assurance/access.server";
import { loadAssurance } from "@/lib/assurance/loadAssurance";
import { assuranceStrings } from "@/lib/assurance/strings";
import { AssuranceShell } from "@/components/assurance/AssuranceShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AI Assurance",
  robots: { index: false, follow: false },
};

export default function AssurancePage() {
  // Server-only gate. The screen is disabled unless the server-only flag is
  // exactly "true"; any other state fails closed to the safe not-found.
  if (!isAssuranceAccessible()) {
    notFound();
  }

  const doc = loadAssurance();

  return (
    <div className="flex min-h-screen flex-col bg-base">
      <header className="sticky top-0 z-30 border-b border-edge bg-base/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[900px] items-center justify-between gap-3 px-5 py-3">
          <Link
            href="/"
            className="group flex items-center gap-3 text-left"
            aria-label="Signal-to-Action Agent — home"
          >
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-brand/40 bg-gradient-to-br from-brand/25 to-brand/5 transition-colors group-hover:border-brand/70">
              <ShieldCheck size={18} className="text-brand-bright" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold leading-tight text-ink">
                  Signal-to-Action
                </span>
                <span className="rounded border border-gov/40 bg-gov/10 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wider text-gov-bright">
                  {assuranceStrings.bannerLabel}
                </span>
              </div>
              <p className="text-[11px] leading-tight text-muted">
                Deterministic gates, NVIDIA advisory, rendered read-only
              </p>
            </div>
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <AssuranceShell doc={doc} />
      </main>
    </div>
  );
}
