import * as React from "react";
import { Cpu, Check } from "lucide-react";

import type { NvidiaAdvisory as NvidiaAdvisoryData } from "@/lib/assurance/contract";
import { assuranceStrings } from "@/lib/assurance/strings";
import { AssuranceSection } from "./AssuranceSection";

const INVARIANT_LABELS: Record<string, string> = {
  serverOnly: "Server-only (never in the browser)",
  deterministicFirst: "Deterministic-first baseline",
  wordingOverlay: "Wording overlay only (advisory)",
  groundednessValidation: "Groundedness validated",
  timeoutFallback: "Timeout fails closed to deterministic",
  rejectionFallback: "Rejection fails closed to deterministic",
};

// NVIDIA's posture. Advisory only — it annotates, never decides or overrides.
export function NvidiaAdvisory({ data }: { data: NvidiaAdvisoryData }) {
  const s = assuranceStrings.sections.nvidia;
  const l = assuranceStrings.labels;
  const statusLabel = data.configured
    ? data.health
    : l.notConfigured;
  return (
    <AssuranceSection
      title={s.title}
      subtitle={s.subtitle}
      headingId="assurance-nvidia-heading"
      action={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/45 bg-amber/10 px-2.5 py-1 text-xs font-medium text-brand-bright">
          {l.advisory}
        </span>
      }
    >
      <div className="flex items-start gap-3">
        <Cpu size={20} className="mt-0.5 shrink-0 text-brand-bright" aria-hidden="true" />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-muted">
              Provider: <span className="text-ink">{data.provider}</span>
            </span>
            <span className="text-muted">
              Model: <span className="text-ink">{data.model}</span>
            </span>
            <span className="text-muted">
              Status: <span className="text-ink">{statusLabel}</span>
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">{data.note}</p>
          <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {Object.entries(data.invariants).map(([key, value]) => (
              <li key={key} className="flex items-center gap-2 text-[12px] text-muted">
                <Check
                  size={14}
                  className={value ? "shrink-0 text-gov-bright" : "shrink-0 text-risk"}
                  aria-hidden="true"
                />
                <span>{INVARIANT_LABELS[key] ?? key}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AssuranceSection>
  );
}
