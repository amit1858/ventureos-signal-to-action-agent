// Product Walkthrough — `/walkthrough` route
// =====================================================
// Isolated, self-contained storytelling route. It is NOT added to Production
// navigation and intercepts no Production traffic. A slim self-contained header
// keeps it visually coherent with the shell while showing the Product
// Walkthrough label.

import Link from "next/link";
import { BookOpen, Compass, Download } from "lucide-react";

import { ProductWalkthrough } from "@/components/walkthrough/ProductWalkthrough";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Product Walkthrough · VentureOS",
};

export default function WalkthroughPage() {
  return (
    <div className="flex min-h-screen flex-col bg-base">
      <header className="sticky top-0 z-30 border-b border-edge bg-base/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1080px] flex-wrap items-center justify-between gap-3 px-5 py-3">
          <Link href="/" className="group flex items-center gap-3 text-left" aria-label="Signal-to-Action Agent — home">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-brand/40 bg-gradient-to-br from-brand/25 to-brand/5 transition-colors group-hover:border-brand/70">
              <Compass size={18} className="text-brand-bright" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] font-semibold leading-tight text-ink">VentureOS</h1>
                <span className="rounded border border-brand/40 bg-brand/10 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wider text-brand-bright">
                  Product Walkthrough
                </span>
              </div>
              <p className="text-[11px] leading-tight text-muted">
                From signal to governed action — the whole story, in order
              </p>
            </div>
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <ProductWalkthrough />

        {/* Tester Guide entry — discoverable but non-dominant */}
        <div className="mx-auto w-full max-w-[880px] px-5 pb-12">
          <div className="rounded-xl border border-edge bg-surface px-6 py-5 text-center">
            <p className="text-[13px] text-muted">
              Ready to validate the full product experience?
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              <Link href="/tester-guide" className="btn btn-outline-primary px-4 py-2 text-[13px] font-semibold">
                <BookOpen size={14} /> Open Tester Guide
              </Link>
              <a
                href="/guides/VentureOS-Signal-to-Action-Tester-Guide.pdf"
                download
                className="btn btn-ghost px-4 py-2 text-[13px] font-semibold"
              >
                <Download size={14} /> Download Tester Guide PDF
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
