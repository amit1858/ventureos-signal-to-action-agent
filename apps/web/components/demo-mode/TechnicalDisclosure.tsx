"use client";

import * as React from "react";
import { ChevronDown, Terminal } from "lucide-react";

import type { DemoPresentationView } from "@/lib/demo-mode/presentationContract";
import { cx } from "@/lib/format";
import { DEMO_STRINGS } from "@/lib/demo-mode/strings";

// Technical disclosure is hidden by default (reduce decisions, not clicks) and
// revealed only on demand. Details are never the lead of the experience.
export function TechnicalDisclosure({ view }: { view: DemoPresentationView }) {
  const [open, setOpen] = React.useState(false);
  return (
    <section className="card p-5" aria-labelledby="demo-technical-heading">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Terminal size={15} className="text-faint" aria-hidden="true" />
        <span id="demo-technical-heading" className="section-label">
          {DEMO_STRINGS.technicalToggleLabel}
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={cx("ml-auto text-faint transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="mt-3 space-y-1.5">
          <ul className="space-y-1 font-mono text-[11px] leading-relaxed text-muted">
            {view.technicalDetails.map((line, i) => (
              <li key={i} className="break-all">
                {line}
              </li>
            ))}
          </ul>
          <p className="pt-1 font-mono text-[11px] text-faint break-all">
            {view.sourceResultReference}
          </p>
        </div>
      ) : null}
    </section>
  );
}
