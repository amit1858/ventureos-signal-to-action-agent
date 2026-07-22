import * as React from "react";
import { ShieldCheck } from "lucide-react";

import type { DemoPresentationView } from "@/lib/demo-mode/presentationContract";
import { DemoSection } from "./DemoSection";
import { statusToneChipClass, statusToneWord } from "./tone";

// Why VentureOS stopped or proceeded. A governed stop is presented as a
// successful product outcome, not a failure.
export function GovernanceOutcome({ view }: { view: DemoPresentationView }) {
  return (
    <DemoSection index={3} title="Governance outcome" headingId="demo-governance-heading">
      <div className="flex items-start gap-3">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-gov-bright" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-[15px] font-medium leading-relaxed text-ink">
            {view.governanceLabel}
          </p>
          <span
            className={
              "mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium " +
              statusToneChipClass(view.statusTone)
            }
          >
            {statusToneWord(view.statusTone)}
          </span>
        </div>
      </div>
    </DemoSection>
  );
}
