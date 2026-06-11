"use client";

import * as React from "react";
import {
  ShieldCheck,
  Briefcase,
  Wallet,
  ShieldAlert,
  TrendingUp,
  Target,
  UserCheck,
  CheckCircle2,
  Gauge,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import type { Account, Recommendation } from "@/lib/types";
import { cx, inrCompact, pct } from "@/lib/format";
import {
  bookValue,
  countAttention,
  countHighOpportunity,
  revenueAtRisk,
  growthOpportunity,
  execStats,
  riskDistribution,
  opportunityDistribution,
  type Distribution,
} from "@/lib/portfolio";
import { Counter } from "@/components/Counter";

// Section 2 · Portfolio Health.
// A single, calm executive-summary card — overall readiness, the money that
// matters, a slim performance strip and the risk/opportunity spread. Every
// value is read straight from the existing portfolio + reasoning helpers; this
// card only re-presents them. No scoring or ranking happens here.
export function PortfolioHealthCard({
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
  const total = accounts.length;
  const attention = countAttention(accounts);
  const healthy = Math.max(0, total - attention);
  const readiness = total ? Math.round((healthy / total) * 100) : 0;

  const book = bookValue(accounts);
  const atRisk = revenueAtRisk(accounts);
  const growth = growthOpportunity(accounts);
  const highOpp = countHighOpportunity(accounts);

  const stats = React.useMemo(() => execStats(recs, latencyMs), [recs, latencyMs]);
  const riskDist = React.useMemo(() => riskDistribution(accounts), [accounts]);
  const oppDist = React.useMemo(() => opportunityDistribution(accounts), [accounts]);
  const pending = recs.filter((r) => r.approval_status === "pending").length;
  const completed = recs.filter((r) => r.approval_status === "approved").length;
  const reviewQueue = recs.filter((r) => r.governance_status !== "ok").length;
  const dash = "—";

  const readinessLabel =
    readiness >= 75 ? "Healthy" : readiness >= 55 ? "Stable" : readiness >= 40 ? "Needs attention" : "At risk";
  const readinessTone = readiness >= 55 ? "text-accent" : readiness >= 40 ? "text-amber" : "text-risk";

  const money: MoneyStat[] = [
    { icon: Briefcase, label: "Book of Business", value: total ? <Counter value={total} /> : dash, desc: "Active relationships", tone: "text-ink" },
    { icon: Wallet, label: "Annual Value", value: total ? <Counter value={book} format={inrCompact} /> : dash, desc: "Total contract value", tone: "text-ink" },
    { icon: ShieldAlert, label: "Revenue at Risk", value: total ? <Counter value={atRisk} format={inrCompact} /> : dash, desc: "Exposure if unaddressed", tone: "text-risk" },
    { icon: TrendingUp, label: "Expansion Potential", value: total ? <Counter value={growth} format={inrCompact} /> : dash, desc: "Upside on high-fit accounts", tone: "text-accent" },
  ];

  const mini: MiniStat[] = [
    { icon: Target, label: "Immediate actions", value: total ? String(attention) : dash, tone: "text-amber" },
    { icon: TrendingUp, label: "High opportunity", value: total ? String(highOpp) : dash, tone: "text-accent" },
    { icon: UserCheck, label: "Pending approvals", value: hasResult ? String(pending) : dash, tone: "text-amber" },
    { icon: CheckCircle2, label: "Actions completed", value: hasResult ? String(completed) : dash, tone: "text-accent" },
    { icon: Gauge, label: "Avg confidence", value: hasResult ? pct(stats.avgConfidence) : dash, tone: "text-brand-bright" },
    { icon: Inbox, label: "Human review queue", value: hasResult ? String(reviewQueue) : dash, tone: "text-amber" },
  ];

  return (
    <div className="card-premium p-5 sm:p-6 lg:p-7">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,300px),1fr]">
        {/* Readiness */}
        <div className="flex flex-col justify-between gap-5 rounded-2xl border border-edge bg-surface2/40 p-5">
          <div>
            <div className="flex items-center gap-2 text-faint">
              <ShieldCheck size={14} className={readinessTone} />
              <span className="eyebrow">Portfolio readiness</span>
            </div>
            <div className="mt-3 flex items-end gap-1">
              <span className={cx("font-mono text-[52px] font-semibold leading-none tracking-tight", readinessTone)}>
                <Counter value={readiness} />
              </span>
              <span className={cx("mb-1 text-2xl font-semibold", readinessTone)}>%</span>
            </div>
            <div className={cx("mt-2 text-sm font-semibold", readinessTone)}>{readinessLabel}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {total ? (
                <>
                  <span className="font-semibold text-ink">{healthy}</span> of {total} accounts are healthy ·{" "}
                  <span className="font-semibold text-amber">{attention}</span> need attention now.
                </>
              ) : (
                "Run the analysis to assess portfolio readiness."
              )}
            </p>
          </div>

          <div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface2">
              <div className="bg-accent" style={{ width: `${total ? (healthy / total) * 100 : 0}%` }} />
              <div className="bg-amber" style={{ width: `${total ? (attention / total) * 100 : 0}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-faint">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-accent" /> Healthy
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber" /> Needs attention
              </span>
            </div>
          </div>
        </div>

        {/* Money + performance */}
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {money.map((m) => (
              <div key={m.label} className="hover-lift rounded-2xl border border-edge bg-surface/70 p-4">
                <div className="flex items-center gap-1.5 text-faint">
                  <m.icon size={13} className={m.tone} />
                  <span className="text-[10px] uppercase tracking-wider">{m.label}</span>
                </div>
                <div className={cx("mt-2.5 font-mono text-[26px] font-semibold leading-none", m.tone)}>{m.value}</div>
                <div className="mt-1.5 text-[10px] leading-tight text-faint">{m.desc}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3.5 rounded-2xl border border-edge bg-surface2/30 p-4 sm:grid-cols-3">
            {mini.map((s) => (
              <div key={s.label} className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                  <s.icon size={12} className="text-faint" />
                  {s.label}
                </span>
                <span className={cx("font-mono text-sm font-semibold", s.tone)}>{s.value}</span>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <DistributionBar
              title="Risk spread"
              dist={riskDist}
              colors={{ high: "bg-risk", med: "bg-amber", low: "bg-faint/50" }}
            />
            <DistributionBar
              title="Opportunity spread"
              dist={oppDist}
              colors={{ high: "bg-accent", med: "bg-cyan", low: "bg-faint/50" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface MoneyStat {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  desc: string;
  tone: string;
}

interface MiniStat {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: string;
}

function DistributionBar({
  title,
  dist,
  colors,
}: {
  title: string;
  dist: Distribution;
  colors: { high: string; med: string; low: string };
}) {
  const total = dist.high + dist.med + dist.low || 1;
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="rounded-2xl border border-edge bg-surface2/30 p-4">
      <div className="eyebrow mb-2.5 text-faint">{title}</div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface2">
        <div className={colors.high} style={{ width: seg(dist.high) }} />
        <div className={colors.med} style={{ width: seg(dist.med) }} />
        <div className={colors.low} style={{ width: seg(dist.low) }} />
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[10px] text-faint">
        <Legend dot={colors.high} label="High" n={dist.high} />
        <Legend dot={colors.med} label="Medium" n={dist.med} />
        <Legend dot={colors.low} label="Low" n={dist.low} />
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
