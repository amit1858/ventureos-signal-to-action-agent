import * as React from "react";
import { Cpu } from "lucide-react";

import type { DemoPresentationView } from "@/lib/demo-mode/presentationContract";
import { DemoSection } from "./DemoSection";
import { DEMO_STRINGS } from "@/lib/demo-mode/strings";

// Provider status appears as an explanation-provider line, never as the decision
// authority. NVIDIA is secondary to the product story.
export function ProviderStatus({ view }: { view: DemoPresentationView }) {
  return (
    <DemoSection index={7} title="Explanation provider" headingId="demo-provider-heading">
      <div className="flex items-start gap-3">
        <Cpu size={16} className="mt-0.5 shrink-0 text-faint" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-ink">{view.providerLabel}</p>
          <p className="mt-1 text-xs leading-relaxed text-faint">
            {DEMO_STRINGS.providerHeading}
          </p>
        </div>
      </div>
    </DemoSection>
  );
}
