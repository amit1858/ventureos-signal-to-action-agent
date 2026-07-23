import * as React from "react";

import type { HumanReviewRow } from "@/lib/assurance/contract";
import { assuranceStrings } from "@/lib/assurance/strings";
import { AssuranceSection } from "./AssuranceSection";

// Which dimensions still need human sign-off. Human approval remains the gate
// before any action is considered closed.
export function HumanReview({ rows }: { rows: HumanReviewRow[] }) {
  const s = assuranceStrings.sections.human;
  return (
    <AssuranceSection title={s.title} subtitle={s.subtitle} headingId="assurance-human-heading">
      <ul className="flex flex-col divide-y divide-edge/60">
        {rows.map((row) => {
          const required = row.humanReview === "required";
          return (
            <li key={row.key} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm text-ink">{row.label}</span>
              <span
                className={
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium " +
                  (required
                    ? "border-amber/45 bg-amber/10 text-brand-bright"
                    : "border-edge bg-surface2 text-muted")
                }
              >
                {required ? "Human review required" : "No review required"}
              </span>
            </li>
          );
        })}
      </ul>
    </AssuranceSection>
  );
}
