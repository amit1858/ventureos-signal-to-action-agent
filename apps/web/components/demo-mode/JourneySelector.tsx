"use client";

import * as React from "react";

import type { DemoJourney } from "@/lib/demo-mode/presentationContract";
import { cx } from "@/lib/format";
import { DEMO_STRINGS } from "@/lib/demo-mode/strings";

// Keyboard-accessible journey selector. Uses a radiogroup so arrow keys and
// screen readers treat the two journeys as one choice.
export function JourneySelector({
  journeys,
  selectedKey,
  onSelect,
}: {
  journeys: DemoJourney[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={DEMO_STRINGS.selectorLabel} className="grid gap-2 sm:grid-cols-2">
      {journeys.map((j) => {
        const active = j.key === selectedKey;
        return (
          <button
            key={j.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(j.key)}
            className={cx(
              "rounded-xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
              active
                ? "border-brand/60 bg-brand/10"
                : "border-edge bg-surface2/50 hover:border-brand/40",
            )}
          >
            <div className={cx("text-sm font-semibold", active ? "text-ink" : "text-muted")}>
              {j.title}
            </div>
            <div className="mt-0.5 text-xs text-faint">{j.subtitle}</div>
          </button>
        );
      })}
    </div>
  );
}
