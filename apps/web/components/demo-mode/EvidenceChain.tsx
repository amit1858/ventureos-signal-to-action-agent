import * as React from "react";
import { Link2 } from "lucide-react";

import type { DemoPresentationView } from "@/lib/demo-mode/presentationContract";
import { DemoSection } from "./DemoSection";

// Evidence builds trust: the ordered evidence chain that supports the outcome.
export function EvidenceChain({ view }: { view: DemoPresentationView }) {
  return (
    <DemoSection index={4} title="Evidence chain" headingId="demo-evidence-heading">
      <ul className="space-y-2">
        {view.evidenceItems.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-muted">
            <Link2 size={14} className="mt-0.5 shrink-0 text-faint" aria-hidden="true" />
            <span className="leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </DemoSection>
  );
}
