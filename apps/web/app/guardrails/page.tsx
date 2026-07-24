// Guardrails Lab — `/guardrails` route
// =====================================================
// Isolated, protected route. It is NOT added to Production navigation and
// intercepts no Production traffic. A slim self-contained header keeps it
// visually coherent with the shell while showing the Guardrails Lab label.

import Link from "next/link";
import { ShieldCheck, Gauge } from "lucide-react";

import { GuardrailsLab } from "@/components/guardrails/GuardrailsLab";
import { isAssuranceAccessible } from "@/lib/assurance/access.server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Guardrails Lab · Curefoods",
};

export default function GuardrailsPage() {
  // Conditional nav entry only. When the server-only assurance flag is off (the
  // Production default), this renders nothing and the page is byte-identical to
  // the frozen Production surface.
  const assuranceEnabled = isAssuranceAccessible();
  return (
    <div className="flex min-h-screen flex-col bg-base">
      <header className="sticky top-0 z-30 border-b border-edge bg-base/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-3 px-5 py-3">
          <Link href="/" className="group flex items-center gap-3 text-left" aria-label="Signal-to-Action Agent — home">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-brand/40 bg-gradient-to-br from-brand/25 to-brand/5 transition-colors group-hover:border-brand/70">
              <ShieldCheck size={18} className="text-brand-bright" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] font-semibold leading-tight text-ink">Guardrails Lab</h1>
                <span className="rounded border border-gov/40 bg-gov/10 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wider text-gov-bright">
                  Guardrails Lab
                </span>
              </div>
              <p className="text-[11px] leading-tight text-muted">
                What the agent cannot do — and how VentureOS proves it
              </p>
            </div>
          </Link>
          {assuranceEnabled ? (
            <Link
              href="/assurance"
              className="btn btn-outline-primary inline-flex items-center gap-1.5 text-[13px]"
            >
              <Gauge size={15} aria-hidden="true" />
              AI Assurance
            </Link>
          ) : null}
        </div>
      </header>
      <main className="flex-1">
        <GuardrailsLab />
      </main>
    </div>
  );
}
