import * as React from "react";
import { ShieldCheck } from "lucide-react";

import type { OverallReadiness as OverallReadinessData } from "@/lib/assurance/contract";
import { assuranceStrings } from "@/lib/assurance/strings";
import { AssuranceSection, VerdictPill } from "./AssuranceSection";

// The single rolled-up readiness verdict. Deterministic and authoritative.
export function OverallReadiness({ data }: { data: OverallReadinessData }) {
  const s = assuranceStrings.sections.overall;
  return (
    <AssuranceSection
      title={s.title}
      subtitle={s.subtitle}
      headingId="assurance-overall-heading"
      action={<VerdictPill verdict={data.readiness} />}
    >
      <div className="flex items-start gap-3">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-gov-bright" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-[15px] font-medium leading-relaxed text-ink">
            {data.passedDimensions} of {data.totalDimensions} deterministic gates pass.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Rubric {data.rubricVersion}. This readiness verdict is set by the deterministic
            engine and is authoritative.
          </p>
          {data.failedDimensions.length > 0 ? (
            <p className="mt-2 text-sm text-risk">
              Failing: {data.failedDimensions.join(", ")}
            </p>
          ) : null}
        </div>
      </div>
    </AssuranceSection>
  );
}
