import * as React from "react";
import { Check, X } from "lucide-react";

import type { RuntimeVerification } from "@/lib/assurance/contract";
import { assuranceStrings } from "@/lib/assurance/strings";
import { AssuranceSection } from "./AssuranceSection";

const FIELD_LABELS: Record<string, string> = {
  configured: "NVIDIA configured",
  provider: "Provider",
  model: "Model",
  health: "Live health",
  server_only: "Server-only",
  deterministic_first: "Deterministic-first",
  wording_overlay: "Wording overlay only",
  groundedness_validation: "Groundedness validation",
  timeout_fallback: "Timeout fallback",
  rejection_fallback: "Rejection fallback",
};

function renderValue(value: string | boolean): React.ReactNode {
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex items-center gap-1 text-gov-bright">
        <Check size={13} aria-hidden="true" /> yes
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-muted">
        <X size={13} aria-hidden="true" /> no
      </span>
    );
  }
  return <span className="text-ink">{value}</span>;
}

// Live, secret-free verification of the NVIDIA runtime posture. Values are probed,
// not hard-coded; safety invariants must all verify.
export function RuntimeVerificationPanel({ data }: { data: RuntimeVerification }) {
  const s = assuranceStrings.sections.runtime;
  return (
    <AssuranceSection
      title={s.title}
      subtitle={s.subtitle}
      headingId="assurance-runtime-heading"
      action={
        <span className="inline-flex items-center rounded-full border border-edge bg-surface2 px-2.5 py-1 text-xs font-medium text-muted">
          {data.version}
        </span>
      }
    >
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Object.entries(data.fields).map(([key, field]) => (
          <li key={key} className="rounded-lg border border-edge bg-surface2/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-ink">{FIELD_LABELS[key] ?? key}</span>
              <span className="text-[12px]">{renderValue(field.value)}</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{field.evidence}</p>
          </li>
        ))}
      </ul>
    </AssuranceSection>
  );
}
