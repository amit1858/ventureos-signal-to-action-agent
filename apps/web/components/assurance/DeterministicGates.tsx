import * as React from "react";

import type { DeterministicGate } from "@/lib/assurance/contract";
import { assuranceStrings } from "@/lib/assurance/strings";
import { AssuranceSection, VerdictPill } from "./AssuranceSection";

// Each assurance dimension, decided by the real deterministic engine. The verdict
// shown here is the authoritative deterministic result.
export function DeterministicGates({ gates }: { gates: DeterministicGate[] }) {
  const s = assuranceStrings.sections.gates;
  return (
    <AssuranceSection
      title={s.title}
      subtitle={s.subtitle}
      headingId="assurance-gates-heading"
    >
      <ul className="flex flex-col gap-3">
        {gates.map((gate) => (
          <li key={gate.key} className="rounded-lg border border-edge bg-surface2/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold text-ink">{gate.label}</p>
                <p className="mt-0.5 text-xs text-muted">Expected: {gate.expected}</p>
                <p className="mt-0.5 text-xs text-muted">Actual: {gate.actual}</p>
              </div>
              <VerdictPill verdict={gate.verdict} />
            </div>
            {gate.evidence.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1 border-t border-edge/60 pt-3">
                {gate.evidence.map((item, i) => (
                  <li key={i} className="text-[12px] leading-relaxed text-muted">
                    <span className="mr-1.5 text-gov-bright" aria-hidden="true">
                      &bull;
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </AssuranceSection>
  );
}
