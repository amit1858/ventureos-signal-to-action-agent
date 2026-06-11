"use client";

import * as React from "react";
import { RefreshCw, Play, ArrowRight, Crown, ShieldAlert, TrendingUp, Layers, Target, Clock } from "lucide-react";
import type { Account, Recommendation } from "@/lib/types";
import { cx, inrCompact, timeAgo, titleCase } from "@/lib/format";
import {
  greetingText,
  morningBrief,
  portfolioInsights,
  resolveDisplayName,
  type PortfolioInsight,
} from "@/lib/reasoning";
import { Counter } from "@/components/Counter";

// P1 · Executive Morning Brief.
// An executive-assistant style briefing — time-aware greeting, a dynamic
// (never hardcoded) display name, the overnight portfolio review in plain
// language, and the single highest-priority action with its timing and
// estimated effort. All values come from the deterministic reasoning layer.
export function ExecutiveMorningBrief({
  accounts,
  accountsById,
  recs,
  hasResult,
  loading,
  dataSourceLabel,
  isHubspotSource,
  lastSync,
  onRun,
  onOpenAccount,
}: {
  accounts: Account[];
  accountsById: Record<string, Account>;
  recs: Recommendation[];
  hasResult: boolean;
  loading: boolean;
  dataSourceLabel: string;
  isHubspotSource: boolean;
  lastSync: string | null;
  onRun: () => void;
  onOpenAccount: (accountId: string) => void;
}) {
  const brief = morningBrief(accounts, accountsById, recs, hasResult);
  const insights = portfolioInsights(accounts);

  // Greeting + name depend on the user's local time and a local-only profile,
  // so resolve them after mount to avoid any SSR hydration mismatch.
  const [greeting, setGreeting] = React.useState("Your portfolio briefing");
  const [name, setName] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    setGreeting(greetingText(new Date()));
    setName(resolveDisplayName());
  }, []);

  const top = brief.top;
  const TopIcon = top?.action.icon;

  return (
    <div className="card-elevated relative overflow-hidden p-5 animate-fade-in sm:p-6">
      <div className="grid-dots pointer-events-none absolute inset-0 opacity-40" />
      <span
        className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-accent via-accent/50 to-transparent"
        aria-hidden
      />

      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent shadow-glow" />
              </span>
              <span className="section-label text-faint">AI Portfolio Brief</span>
              <span
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  isHubspotSource
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-cyan/40 bg-cyan/10 text-cyan",
                )}
              >
                {dataSourceLabel}
              </span>
            </div>

            <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-[28px]">
              {greeting}
              {name ? ` ${name}` : ""} <span aria-hidden>👋</span>
            </h1>
            <p className="mt-1 text-sm font-medium text-muted">Your AI portfolio review is ready.</p>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
              {brief.analyzed ? (
                <>
                  <span className="font-semibold text-ink">{brief.analyzed}</span> accounts analyzed ·{" "}
                  <span className="font-semibold text-amber">{brief.attention}</span> need immediate attention ·{" "}
                  <span className="font-semibold text-risk">{inrCompact(brief.revenueAtRisk)}</span> may be at risk ·{" "}
                  <span className="font-semibold text-accent">{inrCompact(brief.growthOpportunity)}</span> of growth
                  opportunity identified.
                </>
              ) : (
                "Connect a data source and run the analysis to generate today's portfolio briefing."
              )}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-faint">Last sync</div>
              <div className="text-sm font-medium text-ink">{lastSync ? timeAgo(lastSync) : "—"}</div>
            </div>
            <button
              type="button"
              onClick={onRun}
              disabled={loading}
              className={cx("btn btn-primary px-4", loading && "opacity-70")}
            >
              {loading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Analyzing…
                </>
              ) : hasResult ? (
                <>
                  <RefreshCw size={14} /> Re-run
                </>
              ) : (
                <>
                  <Play size={14} /> Run analysis
                </>
              )}
            </button>
          </div>
        </div>

        {/* Headline tiles */}
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <BannerTile icon={Layers} tone="text-ink" label="Accounts analyzed">
            <Counter value={brief.analyzed} />
          </BannerTile>
          <BannerTile icon={Target} tone="text-amber" label="Require attention">
            <Counter value={brief.attention} />
          </BannerTile>
          <BannerTile icon={ShieldAlert} tone="text-risk" label="Revenue at risk">
            <Counter value={brief.revenueAtRisk} format={inrCompact} />
          </BannerTile>
          <BannerTile icon={TrendingUp} tone="text-accent" label="Growth opportunity">
            <Counter value={brief.growthOpportunity} format={inrCompact} />
          </BannerTile>
        </div>

        {/* Highest-priority callout */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3">
          {top && TopIcon ? (
            <>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
                  <Crown size={15} />
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-faint">Your highest priority today</div>
                  <div className="truncate text-sm font-semibold text-ink">
                    {top.accountName}
                    {top.industry ? <span className="font-normal text-faint"> · {titleCase(top.industry)}</span> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <span className={cx("inline-flex items-center gap-1 font-semibold", top.action.tone)}>
                      <TopIcon size={12} /> {top.action.label} {top.timing}
                    </span>
                    {top.estimatedMinutes > 0 ? (
                      <span className="inline-flex items-center gap-1 text-faint">
                        <Clock size={11} /> ~{top.estimatedMinutes} min
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenAccount(top.accountId)}
                className="btn btn-ghost shrink-0 px-3 py-1.5 text-xs"
              >
                Open workspace <ArrowRight size={13} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Crown size={15} className="text-faint" />
              Run the analysis to surface your highest-priority account and its recommended action.
            </div>
          )}
        </div>

        {/* Portfolio summary insights (P8) */}
        {insights.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-faint">Portfolio insights</span>
            {insights.map((it) => (
              <InsightChip key={it.key} insight={it} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function InsightChip({ insight }: { insight: PortfolioInsight }) {
  const tone =
    insight.tone === "risk"
      ? "border-risk/30 bg-risk/10 text-risk"
      : insight.tone === "opp"
        ? "border-accent/30 bg-accent/10 text-accent"
        : "border-edge bg-surface2/60 text-muted";
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium", tone)}>
      {insight.text}
    </span>
  );
}

function BannerTile({
  icon: Icon,
  label,
  tone,
  children,
}: {
  icon: typeof Layers;
  label: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hover-lift rounded-xl border border-edge bg-surface2/50 p-3.5">
      <div className="flex items-center gap-1.5 text-faint">
        <Icon size={13} className={tone} />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className={cx("mt-1.5 font-mono text-2xl font-semibold leading-none", tone)}>{children}</div>
    </div>
  );
}
