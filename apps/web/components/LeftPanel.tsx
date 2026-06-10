"use client";

import * as React from "react";
import {
  Play,
  Loader2,
  Sparkles,
  Database,
  Sliders,
  Terminal,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  Cpu,
} from "lucide-react";
import type { MetaResponse } from "@/lib/types";
import { cx, titleCase } from "@/lib/format";
import { Card, PanelTitle, Switch } from "./ui";

export function LeftPanel({
  meta,
  query,
  setQuery,
  limit,
  setLimit,
  onRun,
  loading,
  demoMode,
  onToggleDemo,
}: {
  meta: MetaResponse | null;
  query: string;
  setQuery: (q: string) => void;
  limit: number;
  setLimit: (n: number) => void;
  onRun: () => void;
  loading: boolean;
  demoMode: boolean;
  onToggleDemo: (v: boolean) => void;
}) {
  const suggestions = meta?.suggested_queries ?? [];
  const [showAllQueries, setShowAllQueries] = React.useState(false);
  const visibleQueries = showAllQueries ? suggestions : suggestions.slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      {/* Command center label + demo mode */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-accent" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
            Command Center
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

      {/* Query console */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-edge bg-surface2/40 px-4 py-2">
          <span className="panel-title">Operator query</span>
          <span className="flex items-center gap-1">
            <span className="kbd">⌘</span>
            <span className="kbd">↵</span>
          </span>
        </div>
        <div className="p-4">
          <div className="relative">
            <ChevronRight
              size={14}
              className="pointer-events-none absolute left-3 top-3 text-accent/70"
            />
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onRun();
              }}
              placeholder="Which SMB accounts need attention this week and why?"
              className="h-24 w-full resize-none rounded-lg border border-edge bg-surface2/60 py-3 pl-8 pr-3 text-sm leading-relaxed text-ink outline-none placeholder:text-faint focus:border-accent/50"
            />
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-edge bg-surface2/60 px-2.5 py-2">
              <span className="text-[10px] uppercase tracking-wider text-faint">Top</span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="bg-transparent text-sm font-medium text-ink outline-none"
              >
                {[5, 10, 15, 20].map((n) => (
                  <option key={n} value={n} className="bg-surface text-ink">
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-primary flex-1 py-2.5 text-[13px] font-semibold"
              onClick={onRun}
              disabled={loading}
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              {loading ? "Running workflow…" : "Run agent workflow"}
            </button>
          </div>
          <div className="mt-2.5 flex items-start gap-1.5 rounded-md border border-amber/20 bg-amber/[0.06] px-2.5 py-1.5">
            <ShieldCheck size={12} className="mt-0.5 shrink-0 text-amber" />
            <p className="text-[10px] leading-relaxed text-muted">
              No action is executed without human approval.
            </p>
          </div>
        </div>
      </Card>

      {/* Suggested queries */}
      <Card className="p-4">
        <PanelTitle right={<Sparkles size={13} className="text-cyan" />}>
          Suggested queries
        </PanelTitle>
        <div className="mt-2 flex flex-col gap-1.5">
          {visibleQueries.map((q) => (
            <button
              key={q}
              onClick={() => setQuery(q)}
              disabled={loading}
              className={cx(
                "group flex items-start gap-1.5 rounded-lg border border-edge bg-surface2/40 px-2.5 py-2 text-left text-[12px] leading-snug text-muted transition-colors hover:border-accent/40 hover:text-ink",
                query === q && "border-accent/50 bg-accent/5 text-ink",
              )}
            >
              <ChevronRight
                size={12}
                className={cx(
                  "mt-0.5 shrink-0",
                  query === q ? "text-accent" : "text-faint group-hover:text-accent",
                )}
              />
              {q}
            </button>
          ))}
          {suggestions.length === 0 ? (
            <span className="text-xs text-faint">Loading…</span>
          ) : null}
          {suggestions.length > 5 ? (
            <button
              onClick={() => setShowAllQueries((v) => !v)}
              className="mt-0.5 flex items-center justify-center gap-1 rounded-lg border border-dashed border-edge px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-accent/40 hover:text-ink"
            >
              <ChevronDown size={12} className={cx("transition-transform", showAllQueries && "rotate-180")} />
              {showAllQueries ? "Show fewer queries" : `Show ${suggestions.length - 5} more queries`}
            </button>
          ) : null}
        </div>
      </Card>

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
