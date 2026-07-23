import * as React from "react";
import { Sparkles } from "lucide-react";

import type { DemoPresentationView } from "@/lib/demo-mode/presentationContract";
import { statusToneChipClass, statusToneWord } from "./tone";

// AI speaks first: the headline and primary narrative lead the experience,
// before any metric, chart, or test count.
export function JourneyNarrative({ view }: { view: DemoPresentationView }) {
  return (
    <section className="card-elevated p-6" aria-labelledby="demo-narrative-heading">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand/40 bg-brand/10">
          <Sparkles size={15} className="text-brand-bright" aria-hidden="true" />
        </span>
        <span className="eyebrow">VentureOS says</span>
        <span
          className={
            "ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium " +
            statusToneChipClass(view.statusTone)
          }
        >
          {statusToneWord(view.statusTone)}
        </span>
      </div>
      <h2
        id="demo-narrative-heading"
        className="mt-3 text-xl font-semibold leading-snug text-ink"
      >
        {view.headline}
      </h2>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        {view.primaryNarrative}
      </p>
    </section>
  );
}
