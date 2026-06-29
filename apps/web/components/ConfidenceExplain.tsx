"use client";

import * as React from "react";
import { Check, Minus, AlertTriangle, ChevronDown } from "lucide-react";
import type { Account, Recommendation } from "@/lib/types";
import { cx, pct, scoreTone } from "@/lib/format";
import { confidenceBasis, type FactorPolarity } from "@/lib/confidence";

// Release 1.4A — "Why this confidence?"
//
// A calm, executive reveal that answers the question every leader asks of an
// AI number: *why should I trust it?* Collapsed it shows the score and a single
// quiet prompt; expanded it shows the handful of customer signals that shaped
// it. Presentation only — reads existing deterministic fields.

const POLARITY_STYLE: Record<FactorPolarity, { dot: string; icon: React.ReactNode }> = {
  positive: { dot: "text-accent", icon: <Check size={11} /> },
  neutral: { dot: "text-faint", icon: <Minus size={11} /> },
  caution: { dot: "text-amber", icon: <AlertTriangle size={11} /> },
};

export function ConfidenceExplain({
  rec,
  account,
  align = "left",
  className,
}: {
  rec: Recommendation;
  account?: Account;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const basis = React.useMemo(() => confidenceBasis(rec, account), [rec, account]);
  const tone = scoreTone(basis.score);

  return (
    <div className={cx("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface2/50 px-2 py-1 text-left transition-colors hover:border-faint"
      >
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">
          Confidence
        </span>
        <span className={cx("font-mono text-[12px] font-bold leading-none", tone.text)}>
          {pct(basis.score)}
        </span>
        <span className="text-[10px] font-medium text-faint group-hover:text-muted">
          · Why?
        </span>
        <ChevronDown
          size={11}
          className={cx("text-faint transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          className={cx(
            "absolute z-50 mt-2 w-[268px] pop-in rounded-2xl border border-edge bg-elevated p-3.5 shadow-elevated ring-1 ring-black/40",
            align === "right" ? "right-0" : "left-0",
          )}
          role="dialog"
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">
              Why {pct(basis.score)}
            </span>
            <span className={cx("text-[10px] font-semibold tracking-wide", tone.text)}>
              {basis.level} confidence
            </span>
          </div>

          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{basis.rationale}</p>

          <div className="mt-3 space-y-2 border-t border-edge/60 pt-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">
              Based on
            </div>
            {basis.factors.map((f, i) => {
              const s = POLARITY_STYLE[f.polarity];
              return (
                <div
                  key={`${f.label}-${i}`}
                  className="reveal-stagger flex items-center gap-2.5 text-[11.5px] text-ink"
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <span className={cx("shrink-0", s.dot)}>{s.icon}</span>
                  <span className="leading-snug">{f.label}</span>
                </div>
              );
            })}
          </div>

          <p className="mt-3 border-t border-edge/60 pt-2.5 text-[9.5px] leading-relaxed text-faint">
            Confidence reflects evidence weight only. It never changes ranking or
            governance.
          </p>
        </div>
      ) : null}
    </div>
  );
}
