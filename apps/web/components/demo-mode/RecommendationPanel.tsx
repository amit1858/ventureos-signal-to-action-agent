import * as React from "react";
import { ArrowRight } from "lucide-react";

import type { DemoPresentationView } from "@/lib/demo-mode/presentationContract";
import { DemoSection } from "./DemoSection";

// One recommendation before many options. The recommendation is advisory — the
// copy itself never claims an action was taken.
export function RecommendationPanel({ view }: { view: DemoPresentationView }) {
  return (
    <DemoSection index={2} title="Recommended next step" headingId="demo-recommendation-heading">
      <div className="flex items-start gap-3 rounded-lg border border-brand/30 bg-brand/5 px-4 py-3">
        <ArrowRight size={16} className="mt-0.5 shrink-0 text-brand-bright" aria-hidden="true" />
        <div>
          <p className="text-[15px] font-medium leading-relaxed text-ink">
            {view.recommendation}
          </p>
          <p className="mt-1 text-xs text-faint">Advisory only — no action is taken automatically.</p>
        </div>
      </div>
    </DemoSection>
  );
}
