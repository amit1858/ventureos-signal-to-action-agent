import * as React from "react";

import type { DemoPresentationView } from "@/lib/demo-mode/presentationContract";
import { DemoSection } from "./DemoSection";
import { safetyLabelChipClass } from "./tone";

// Explicit safety labels. These come straight from the governed view model and
// are never inferred client-side.
export function SafetyDisclosures({ view }: { view: DemoPresentationView }) {
  return (
    <DemoSection title="Safety labels" headingId="demo-safety-heading">
      <ul className="flex flex-wrap gap-2" aria-label="Safety labels">
        {view.safetyDisclosures.map((label, i) => (
          <li key={i}>
            <span
              className={
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium " +
                safetyLabelChipClass(label)
              }
            >
              {label}
            </span>
          </li>
        ))}
      </ul>
    </DemoSection>
  );
}
