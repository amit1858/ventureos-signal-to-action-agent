import * as React from "react";
import { UserCheck, PlayCircle } from "lucide-react";

import type { DemoPresentationView } from "@/lib/demo-mode/presentationContract";
import { DemoSection } from "./DemoSection";

// Approval and execution state, side by side. Execution is the outcome — and it
// is always labelled exactly as what happened (simulated, or none).
export function ApprovalExecutionPanel({ view }: { view: DemoPresentationView }) {
  return (
    <DemoSection index={5} title="Approval & execution" headingId="demo-approval-heading">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-edge bg-surface2/60 p-4">
          <div className="flex items-center gap-2">
            <UserCheck size={15} className="text-brand-bright" aria-hidden="true" />
            <span className="section-label">Approval</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink">{view.approvalLabel}</p>
        </div>
        <div className="rounded-lg border border-edge bg-surface2/60 p-4">
          <div className="flex items-center gap-2">
            <PlayCircle size={15} className="text-brand-bright" aria-hidden="true" />
            <span className="section-label">Execution</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink">{view.executionLabel}</p>
        </div>
      </div>
    </DemoSection>
  );
}
