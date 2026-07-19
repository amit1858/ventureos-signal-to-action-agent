// Tester Guide — `/tester-guide` route
// ======================================
// Isolated, self-contained guide route. It is NOT added to Production
// navigation and intercepts no Production traffic. A slim self-contained header
// keeps it visually coherent with the shell while showing the Tester Guide label.

import Link from "next/link";
import { BookOpen } from "lucide-react";

import { TesterGuide } from "@/components/tester-guide/TesterGuide";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tester Guide · VentureOS",
  description:
    "Self-guided testing experience for the VentureOS Signal-to-Action Agent. One signal, one mission, one governed outcome.",
};

export default function TesterGuidePage() {
  return (
    <div className="flex min-h-screen flex-col bg-base">
      <header className="sticky top-0 z-30 border-b border-edge bg-base/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1080px] flex-wrap items-center justify-between gap-3 px-5 py-3">
          <Link href="/" className="group flex items-center gap-3 text-left" aria-label="Signal-to-Action Agent — home">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-brand/40 bg-gradient-to-br from-brand/25 to-brand/5 transition-colors group-hover:border-brand/70">
              <BookOpen size={18} className="text-brand-bright" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] font-semibold leading-tight text-ink">VentureOS</h1>
                <span className="rounded border border-brand/40 bg-brand/10 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wider text-brand-bright">
                  Tester Guide
                </span>
              </div>
              <p className="text-[11px] leading-tight text-muted">
                Self-guided testing experience — one signal, one mission, one governed outcome
              </p>
            </div>
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <TesterGuide />
      </main>
    </div>
  );
}
