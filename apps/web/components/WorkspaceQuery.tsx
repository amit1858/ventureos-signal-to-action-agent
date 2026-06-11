"use client";

import * as React from "react";
import { Sparkles, Loader2, Send, Database, ShieldCheck, CornerDownLeft } from "lucide-react";
import { cx } from "@/lib/format";

// PRIORITY 5 · Workspace query — a conversational "Ask your portfolio" surface
// that feels like Copilot rather than an engineering console. Large input,
// suggested prompts, calm governance note. Wiring is unchanged: it drives the
// same query / onRun handlers as before.
export function WorkspaceQuery({
  query,
  setQuery,
  onRun,
  loading,
  suggestions,
  limit,
  setLimit,
  isHubspotSource,
  resultCount,
  latencyMs,
}: {
  query: string;
  setQuery: (q: string) => void;
  onRun: () => void;
  loading: boolean;
  suggestions: string[];
  limit: number;
  setLimit: (n: number) => void;
  isHubspotSource: boolean;
  resultCount?: number;
  latencyMs?: number;
}) {
  const chips = suggestions.slice(0, 4);
  return (
    <div className="card-premium relative overflow-hidden p-5 sm:p-6">
      <div className="grid-dots pointer-events-none absolute inset-0 opacity-[0.08]" aria-hidden />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand/40 bg-brand/15 text-brand-bright">
              <Sparkles size={14} />
            </span>
            <span className="text-[13px] font-semibold text-ink">Ask your portfolio</span>
          </div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-surface2/70 px-2.5 py-1 text-[10px] font-medium text-muted"
            title="Active data source for this workflow"
          >
            <Database size={11} className="text-faint" />
            {isHubspotSource ? "HubSpot test CRM" : "Synthetic dataset"}
            {typeof resultCount === "number" ? (
              <>
                <span className="text-faint/40">·</span>
                <span className="font-mono">
                  {resultCount} accounts{typeof latencyMs === "number" ? ` · ${latencyMs}ms` : ""}
                </span>
              </>
            ) : null}
          </span>
        </div>

        <div className="mt-3.5">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onRun();
            }}
            placeholder="What accounts need attention this week and why?"
            className="h-20 w-full resize-none rounded-xl border border-edge bg-surface2/50 px-4 py-3 text-[15px] leading-relaxed text-ink outline-none transition-colors placeholder:text-faint focus:border-brand/50"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
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
            <span className="hidden items-center gap-1 text-[10px] text-faint sm:inline-flex">
              <CornerDownLeft size={11} /> ⌘ + Enter
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary px-5 py-2.5 text-[13px] font-semibold"
            onClick={onRun}
            disabled={loading}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </div>

        {chips.length > 0 ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-faint">Try</span>
            {chips.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuery(q)}
                disabled={loading}
                className={cx(
                  "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                  query === q
                    ? "border-brand/50 bg-brand/10 text-brand-bright"
                    : "border-edge bg-surface2/50 text-muted hover:border-brand/40 hover:text-ink",
                )}
              >
                {q}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-3.5 flex items-center gap-1.5 text-[11px] text-faint">
          <ShieldCheck size={12} className="text-amber" />
          No action is executed without explicit human approval.
        </div>
      </div>
    </div>
  );
}
