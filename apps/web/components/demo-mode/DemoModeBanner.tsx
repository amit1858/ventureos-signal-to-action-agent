import * as React from "react";
import { Info } from "lucide-react";

import { DEMO_STRINGS } from "@/lib/demo-mode/strings";

// Persistent banner making clear this is an internal, read-only demo of already
// governed results — not a live console.
export function DemoModeBanner() {
  return (
    <div
      role="note"
      className="flex items-center gap-2 rounded-lg border border-amber/45 bg-amber/10 px-3 py-2 text-xs text-brand-bright"
    >
      <Info size={14} className="shrink-0" aria-hidden="true" />
      <span>{DEMO_STRINGS.bannerLabel}</span>
    </div>
  );
}
