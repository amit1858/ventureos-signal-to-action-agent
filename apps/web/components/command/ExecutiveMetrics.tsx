"use client";

import * as React from "react";
import { Gauge, Clock, ShieldCheck, CheckCircle2, ShieldAlert, TrendingUp, Inbox } from "lucide-react";
import type { Account, Recommendation } from "@/lib/types";
import { cx, pct, inrCompact } from "@/lib/format";
import {
  execStats,
  riskDistribution,
  opportunityDistribution,
  revenueAtRisk,
  growthOpportunity,
  type Distribution,
} from "@/lib/portfolio";
import { Counter } from "@/components/Counter";

export function ExecutiveMetrics({
  accounts,
  recs,
  latencyMs,
  hasResult,
}: {
  accounts: Account[];
  recs: Recommendation[];
  latencyMs: number;
  hasResult: boolean;
}) {
  const stats = React.useMemo(() => execStats(recs, latencyMs), [recs, latencyMs]);
  const riskDist = React.useMemo(() => riskDistribution(accounts), [accounts]);
  const oppDist = React.useMemo(() => opportunityDistribution(accounts), [accounts]);
  const atRisk = revenueAtRisk(accounts);
  const growth = growthOpportunity(accounts);
  const reviewQueue = recs.filter((r) => r.governance_status !== "ok").length;
  const dash = "—";

  const tiles = [
    {
      icon: Gauge,
      label: "Average Confidence",
      value: hasResult ? pct(stats.avgConfidence) : dash,
      tone: "text-accent",
    },
    {
      icon: Clock,
      label: "Avg Time to Recommendation",
      value: hasResult ? `${Math.round(stats.avgTimeMs)} ms` : dash,
      tone: "text-cyan",
    },
    {
      icon: ShieldCheck,
      label: "High-Confidence Accounts",
      value: hasResult ? `${stats.highConfidence}/${stats.count}` : dash,
      tone: "text-ink",
    },
    {
      icon: CheckCircle2,
      label: "Approval Rate",
      value: hasResult ? (stats.approved + stats.rejected ? pct(stats.approvalRate) : "—") : dash,
      tone: "text-accent",
    },
    {
      icon: ShieldAlert,
      label: "Revenue at Risk",
      value: accounts.length ? <Counter value={atRisk} format={inrCompact} /> : dash,
      tone: "text-risk",
    },
    {
      icon: TrendingUp,
      label: "Growth Potential",
      value: accounts.length ? <Counter value={growth} format={inrCompact} /> : dash,
      tone: "text-accent",
    },
    {
      icon: Inbox,
      label: "Human Review Queue",
      value: hasResult ? <Counter value={reviewQueue} /> : dash,
      tone: "text-amber",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="hover-lift rounded-lg border border-edge bg-surface2/40 p-3">
            <div className="flex items-center gap-1.5 text-faint">
              <t.icon size={12} />
              <span className="text-[10px] uppercase tracking-wider">{t.label}</span>
            </div>
            <div className={cx("mt-1.5 font-mono text-xl font-semibold", t.tone)}>{t.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DistributionBar
          title="Risk Distribution"
          dist={riskDist}
          highLabel="High"
          midLabel="Medium"
          lowLabel="Low"
          colors={{ high: "bg-risk", med: "bg-amber", low: "bg-faint/50" }}
        />
        <DistributionBar
          title="Opportunity Distribution"
          dist={oppDist}
          highLabel="High"
          midLabel="Medium"
          lowLabel="Low"
          colors={{ high: "bg-accent", med: "bg-cyan", low: "bg-faint/50" }}
        />
      </div>
    </div>
  );
}

function DistributionBar({
  title,
  dist,
  highLabel,
  midLabel,
  lowLabel,
  colors,
}: {
  title: string;
  dist: Distribution;
  highLabel: string;
  midLabel: string;
  lowLabel: string;
  colors: { high: string; med: string; low: string };
}) {
  const total = dist.high + dist.med + dist.low || 1;
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="rounded-lg border border-edge bg-surface2/40 p-3">
      <div className="section-label mb-2 text-faint">{title}</div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface2">
        <div className={colors.high} style={{ width: seg(dist.high) }} />
        <div className={colors.med} style={{ width: seg(dist.med) }} />
        <div className={colors.low} style={{ width: seg(dist.low) }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-faint">
        <Legend dot={colors.high} label={highLabel} n={dist.high} />
        <Legend dot={colors.med} label={midLabel} n={dist.med} />
        <Legend dot={colors.low} label={lowLabel} n={dist.low} />
      </div>
    </div>
  );
}

function Legend({ dot, label, n }: { dot: string; label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cx("inline-block h-2 w-2 rounded-full", dot)} />
      {label}
      <span className="font-mono text-muted">{n}</span>
    </span>
  );
}
