import * as React from "react";
import { FlaskConical } from "lucide-react";

import type { SyntheticEvidence } from "@/lib/assurance/contract";
import { assuranceStrings } from "@/lib/assurance/strings";
import { AssuranceSection } from "./AssuranceSection";

// The synthetic evidence corpus: fictional accounts realized against the real
// engine. No customer data. Each scenario shows expected vs actual verdict.
export function EvidencePanel({ data }: { data: SyntheticEvidence }) {
  const s = assuranceStrings.sections.evidence;
  const l = assuranceStrings.labels;
  return (
    <AssuranceSection
      title={s.title}
      subtitle={s.subtitle}
      headingId="assurance-evidence-heading"
      action={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gov/40 bg-gov/10 px-2.5 py-1 text-xs font-medium text-gov-bright">
          {l.synthetic}
        </span>
      }
    >
      <div className="mb-3 flex items-start gap-3">
        <FlaskConical size={20} className="mt-0.5 shrink-0 text-brand-bright" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-muted">
          {data.matched} of {data.totalScenarios} synthetic scenarios matched the deterministic
          engine across {data.categories.length} categories. Dataset {data.datasetVersion},
          provider {data.provider}
          {data.nemoConfigured ? "" : " (NeMo Data Designer pending credentials — deterministic generator in use)"}.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-edge text-muted">
              <th className="py-2 pr-3 font-medium">Scenario</th>
              <th className="py-2 pr-3 font-medium">Category</th>
              <th className="py-2 pr-3 font-medium">Expected</th>
              <th className="py-2 pr-3 font-medium">Actual</th>
              <th className="py-2 font-medium">Match</th>
            </tr>
          </thead>
          <tbody>
            {data.scenarios.map((row) => (
              <tr key={row.name} className="border-b border-edge/50">
                <td className="py-2 pr-3 text-ink">{row.name}</td>
                <td className="py-2 pr-3 text-muted">{row.category}</td>
                <td className="py-2 pr-3 text-muted">{row.expected}</td>
                <td className="py-2 pr-3 text-muted">{row.actual}</td>
                <td className="py-2">
                  <span
                    className={
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium " +
                      (row.matched
                        ? "border-gov/40 bg-gov/10 text-gov-bright"
                        : "border-risk/45 bg-risk/10 text-risk")
                    }
                  >
                    {row.matched ? "matched" : "mismatch"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AssuranceSection>
  );
}
