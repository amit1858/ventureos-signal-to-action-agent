// Phase 15A — Experience mode segmented control.
//
// Three-segment switch [Executive · Seller · Operations] rendered in the
// Command Center header. Persisted via useExperienceMode. Pure UI.

"use client";

import { Briefcase, Crown, Wrench } from "lucide-react";

import { cx } from "@/lib/format";
import {
  EXPERIENCE_MODES,
  MODE_DESCRIPTION,
  MODE_LABEL,
  type ExperienceMode,
} from "@/lib/experienceMode";

const MODE_ICON: Record<ExperienceMode, React.ReactNode> = {
  executive: <Crown size={11} />,
  seller: <Briefcase size={11} />,
  operations: <Wrench size={11} />,
};

interface Props {
  value: ExperienceMode;
  onChange: (mode: ExperienceMode) => void;
}

export function ExperienceModeSwitch({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="inline-flex items-center rounded-full border border-edge bg-surface2/60 p-0.5"
        role="tablist"
        aria-label="Experience mode"
      >
        {EXPERIENCE_MODES.map((mode) => {
          const active = mode === value;
          return (
            <button
              key={mode}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => onChange(mode)}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                active
                  ? "bg-accent/15 text-accent shadow-[0_0_0_1px_rgba(216,154,61,0.35)]"
                  : "text-muted hover:text-ink",
              )}
            >
              {MODE_ICON[mode]}
              {MODE_LABEL[mode]}
            </button>
          );
        })}
      </div>
      <span className="text-[10.5px] text-faint">
        <span className="text-muted">{MODE_LABEL[value]}</span>
        <span className="mx-1.5 text-edge">·</span>
        {MODE_DESCRIPTION[value]}
      </span>
    </div>
  );
}
