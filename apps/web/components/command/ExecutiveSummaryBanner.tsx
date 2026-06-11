"use client";

import * as React from "react";
import { RefreshCw, Play, ArrowRight, Crown, ShieldAlert, TrendingUp, Layers, Target } from "lucide-react";
import type { Account, Recommendation } from "@/lib/types";
import { businessAction } from "@/lib/actions";
import { cx, inrCompact, timeAgo, titleCase } from "@/lib/format";
import { countAttention, revenueAtRisk, growthOpportunity } from "@/lib/portfolio";
import { Counter } from "@/components/Counter";

export function ExecutiveSummaryBanner({
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
  const total = accounts.length;
  const attention = countAttention(accounts);
  const atRisk = revenueAtRisk(accounts);
  const growth = growthOpportunity(accounts);

  const topRec = hasResult ? recs[0] : null;
  const topAccount = topRec ? accountsById[topRec.account_id] : undefined;
  const topAction = topRec
    ? businessAction(topRec.action_type, {
        governanceStatus: topRec.governance_status,
        growthPotential: topAccount?.growth_potential_score,
        productUsage: topAccount?.product_usage_score,
      })
    : null;

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
              <span className="section-label text-faint">AI Portfolio Summary</span>
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
              {total ? (
                <>
                  <span className="text-accent">{attention}</span> of {total} accounts need attention this
                  week
                </>
              ) : (
                "Signal-to-Action Agent"
              )}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
              <span className="font-semibold text-risk">{inrCompact(atRisk)}</span> revenue at risk ·{" "}
              <span className="font-semibold text-accent">{inrCompact(growth)}</span> growth opportunity
              across the book — explained, evidence-backed, and awaiting your approval.
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
            <Counter value={total} />
          </BannerTile>
          <BannerTile icon={Target} tone="text-amber" label="Require attention">
            <Counter value={attention} />
          </BannerTile>
          <BannerTile icon={ShieldAlert} tone="text-risk" label="Revenue at risk">
            <Counter value={atRisk} format={inrCompact} />
          </BannerTile>
          <BannerTile icon={TrendingUp} tone="text-accent" label="Growth opportunity">
            <Counter value={growth} format={inrCompact} />
          </BannerTile>
        </div>

        {/* Highest-priority callout */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3">
          {topRec && topAction ? (
            <>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
                  <Crown size={15} />
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-faint">Highest priority</div>
                  <div className="truncate text-sm font-semibold text-ink">
                    {topRec.account_name}
                    {topAccount?.industry ? (
                      <span className="font-normal text-faint"> · {titleCase(topAccount.industry)}</span>
                    ) : null}
                    <span className="text-faint"> — </span>
                    <span className={topAction.tone}>{topAction.label}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenAccount(topRec.account_id)}
                className="btn btn-ghost shrink-0 px-3 py-1.5 text-xs"
              >
                Open workspace <ArrowRight size={13} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Crown size={15} className="text-faint" />
              Run the analysis to surface the highest-priority account and its recommended action.
            </div>
          )}
        </div>
      </div>
    </div>
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
