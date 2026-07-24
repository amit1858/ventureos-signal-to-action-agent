import * as React from "react";
import { History } from "lucide-react";

import type { RegressionEntry } from "@/lib/assurance/contract";
import { assuranceStrings } from "@/lib/assurance/strings";
import { AssuranceSection } from "./AssuranceSection";

// The validated suite baseline. We do not invent history: this is the current
// labeled baseline, with structure ready for future dated entries.
export function RegressionHistory({ entries }: { entries: RegressionEntry[] }) {
  const s = assuranceStrings.sections.regression;
  return (
    <AssuranceSection
      title={s.title}
      subtitle={s.subtitle}
      headingId="assurance-regression-heading"
    >
      <ul className="flex flex-col gap-3">
        {entries.map((entry, i) => (
          <li key={i} className="flex items-start gap-3 rounded-lg border border-edge bg-surface2/40 p-4">
            <History size={18} className="mt-0.5 shrink-0 text-brand-bright" aria-hidden="true" />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-ink">{entry.label}</span>
                <span className="inline-flex items-center rounded-full border border-edge bg-surface2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">
                  {entry.kind}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink">
                {entry.backendChecks} checks / {entry.backendFailures} failures across{" "}
                {entry.backendFiles} suites.
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{entry.note}</p>
            </div>
          </li>
        ))}
      </ul>
    </AssuranceSection>
  );
}
