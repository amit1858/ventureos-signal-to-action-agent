"use client";

import { Database, Sliders, Cpu, SlidersHorizontal } from "lucide-react";
import type { MetaResponse } from "@/lib/types";
import { cx, titleCase } from "@/lib/format";
import { Card, PanelTitle, Switch } from "./ui";

export function LeftPanel({
  meta,
  demoMode,
  onToggleDemo,
}: {
  meta: MetaResponse | null;
  demoMode: boolean;
  onToggleDemo: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Command center label + demo mode */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-faint" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
            Workspace controls
          </span>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5" title="Auto-run the default query on load">
          <span
            className={cx(
              "text-[10px] font-semibold uppercase tracking-wider",
              demoMode ? "text-accent" : "text-faint",
            )}
          >
            Demo mode
          </span>
          <Switch checked={demoMode} onChange={onToggleDemo} label="Demo mode" />
        </label>
      </div>

      {/* Dataset summary */}
      <Card className="p-4">
        <PanelTitle right={<Database size={13} className="text-muted" />}>Dataset</PanelTitle>
        {meta ? (
          <>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                { k: "Accounts", v: meta.dataset.accounts },
                { k: "Signals", v: meta.dataset.signals },
                { k: "Notes", v: meta.dataset.notes },
              ].map((s) => (
                <div
                  key={s.k}
                  className="rounded-lg border border-edge bg-surface2/60 px-2 py-2 text-center"
                >
                  <div className="font-mono text-base font-semibold text-ink">{s.v}</div>
                  <div className="text-[9px] uppercase tracking-wider text-faint">{s.k}</div>
                </div>
              ))}
            </div>

            {/* Model provider */}
            <div className="mt-2 flex items-center justify-between rounded-lg border border-edge bg-surface2/40 px-2.5 py-2">
              <span className="flex items-center gap-1.5 text-[11px] text-muted">
                <Cpu size={12} className="text-cyan" />
                Model provider
              </span>
              <span className="font-mono text-[11px] text-cyan">
                {meta.model_provider}
                <span className="text-faint"> · {meta.model}</span>
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              {meta.dataset.industries.slice(0, 8).map((i) => (
                <span key={i} className="chip">
                  {i}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              100% synthetic data across {meta.dataset.regions.length} regions. No real customer
              records.
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs text-faint">Loading dataset…</p>
        )}
      </Card>

      {/* Scoring weights */}
      {meta ? (
        <Card className="p-4">
          <PanelTitle right={<Sliders size={13} className="text-muted" />}>
            Deterministic scoring
          </PanelTitle>
          <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
            Accounts are ranked by a transparent weighted score <em>before</em> any model call.
          </p>
          <ul className="mt-2 space-y-1">
            {Object.entries(meta.scoring_weights)
              .sort((a, b) => b[1] - a[1])
              .map(([k, w]) => (
                <li key={k} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-[11px] text-muted">{titleCase(k)}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2">
                    <div
                      className="h-full rounded-full bg-accent/70"
                      style={{ width: `${w * 100 * 5}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono text-[10px] text-faint">
                    {(w * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
