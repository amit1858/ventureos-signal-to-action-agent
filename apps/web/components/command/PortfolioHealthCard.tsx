"use client";

import * as React from "react";
import {
  Target,
  TrendingUp,
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

// Section · Portfolio Health.
// A calm executive-summary block: a hero card pairing the signature readiness
// ring with the money that matters, a row of smaller supporting cards for
// activity, and the risk/opportunity spread. Every value is read straight from
// the existing portfolio + reasoning helpers; this card only re-presents them.
// No scoring or ranking happens here.
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
  const recCount = recs.length || 1;
  const dash = "—";

  const readinessLabel =
    readiness >= 75 ? "Healthy" : readiness >= 55 ? "Stable" : readiness >= 40 ? "Needs attention" : "At risk";
  const readinessTone = readiness >= 55 ? "text-accent" : readiness >= 40 ? "text-amber" : "text-risk";
  const readinessStroke = readiness >= 55 ? "#76B900" : readiness >= 40 ? "#F5B84B" : "#EF6B73";

  // Money that matters — shown as an inline labelled stat row inside the hero.
  const money: MoneyStat[] = [
    { label: "Book of Business", value: total ? <Counter value={total} /> : dash, tone: "text-ink" },
    { label: "Annual Value", value: total ? <Counter value={book} format={inrCompact} /> : dash, tone: "text-ink" },
    { label: "Revenue at Risk", value: total ? <Counter value={atRisk} format={inrCompact} /> : dash, tone: "text-risk" },
    { label: "Expansion Potential", value: total ? <Counter value={growth} format={inrCompact} /> : dash, tone: "text-accent" },
  ];

  // Activity — smaller supporting cards beneath the hero card.
  const supporting: MiniStat[] = [
    { icon: Target, label: "Immediate actions", value: total ? String(attention) : dash, frac: total ? attention / total : 0, tone: "text-amber", bar: "bg-amber" },
    { icon: TrendingUp, label: "High opportunity", value: total ? String(highOpp) : dash, frac: total ? highOpp / total : 0, tone: "text-accent", bar: "bg-accent" },
    { icon: UserCheck, label: "Pending approvals", value: hasResult ? String(pending) : dash, frac: hasResult ? pending / recCount : 0, tone: "text-amber", bar: "bg-amber" },
    { icon: CheckCircle2, label: "Actions completed", value: hasResult ? String(completed) : dash, frac: hasResult ? completed / recCount : 0, tone: "text-accent", bar: "bg-accent" },
    { icon: Gauge, label: "Avg confidence", value: hasResult ? pct(stats.avgConfidence) : dash, frac: hasResult ? stats.avgConfidence : 0, tone: "text-brand-bright", bar: "bg-brand" },
    { icon: Inbox, label: "Human review queue", value: hasResult ? String(reviewQueue) : dash, frac: hasResult ? reviewQueue / recCount : 0, tone: "text-amber", bar: "bg-amber" },
  ];

  return (
    <div className="space-y-4">
      {/* Hero card: readiness ring + the money that matters */}
      <div className="card-premium p-6 sm:p-8 lg:p-10">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr,auto] lg:gap-12">
          <div className="min-w-0">
            <p className="max-w-md text-[15px] leading-relaxed text-muted">
              {total ? (
                <>
                  <span className="font-semibold text-ink">{healthy}</span> of {total} accounts are healthy.{" "}
                  <span className="font-semibold text-amber">{attention}</span> need your attention now.
                </>
              ) : (
                "Run the analysis to assess portfolio readiness across your book of business."
              )}
            </p>

            <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
              {money.map((m) => (
                <div key={m.label}>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-faint">{m.label}</div>
                  <div className={cx("mt-2 font-mono text-[26px] font-semibold leading-none sm:text-[28px]", m.tone)}>
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Signature readiness ring */}
          <div className="flex flex-col items-center gap-3 justify-self-center lg:justify-self-end">
            <ReadinessRing value={readiness} tone={readinessTone} stroke={readinessStroke} hasData={total > 0} />
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-[0.2em] text-faint">Readiness</div>
              <div className={cx("mt-1 text-sm font-semibold", total ? readinessTone : "text-faint")}>
                {total ? readinessLabel : "No data"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Smaller supporting cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {supporting.map((s) => (
          <div key={s.label} className="hover-lift rounded-2xl border border-edge bg-surface/60 p-4">
            <div className="flex items-center gap-1.5 text-faint">
              <s.icon size={13} className={s.tone} />
              <span className="text-[10px] uppercase leading-tight tracking-wider">{s.label}</span>
            </div>
            <div className={cx("mt-3 font-mono text-2xl font-semibold leading-none", s.tone)}>{s.value}</div>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface2">
              <div
                className={cx("h-full rounded-full transition-all duration-700 ease-out", s.bar)}
                style={{ width: `${Math.round(Math.max(0, Math.min(1, s.frac)) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Risk / opportunity spread */}
      <div className="grid gap-3 sm:grid-cols-2">
        <DistributionBar title="Risk spread" dist={riskDist} colors={{ high: "bg-risk", med: "bg-amber", low: "bg-faint/50" }} />
        <DistributionBar title="Opportunity spread" dist={oppDist} colors={{ high: "bg-accent", med: "bg-accent/45", low: "bg-faint/50" }} />
      </div>
    </div>
  );
}

// Circular readiness ring — the signature portfolio-health visual. The arc
// animates up from zero on mount (and respects prefers-reduced-motion via the
// global transition override).
function ReadinessRing({
  value,
  tone,
  stroke,
  hasData,
}: {
  value: number;
  tone: string;
  stroke: string;
  hasData: boolean;
}) {
  const radius = 56;
  const circ = 2 * Math.PI * radius;
  const target = Math.max(0, Math.min(100, value));
  const [draw, setDraw] = React.useState(0);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setDraw(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  const dash = hasData ? (draw / 100) * circ : 0;

  return (
    <div className="relative flex h-[150px] w-[150px] items-center justify-center sm:h-[172px] sm:w-[172px]">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#1B2127" strokeWidth="9" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={hasData ? stroke : "#2A2F35"}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray 0.9s ease-out", filter: `drop-shadow(0 0 7px ${stroke}44)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={cx("font-mono text-[46px] font-semibold leading-none tracking-tight", hasData ? tone : "text-faint")}>
          {hasData ? <Counter value={value} /> : "—"}
        </div>
        {hasData ? <div className="mt-1.5 text-xs text-faint">/ 100</div> : null}
      </div>
    </div>
  );
}

interface MoneyStat {
  label: string;
  value: React.ReactNode;
  tone: string;
}

interface MiniStat {
  icon: LucideIcon;
  label: string;
  value: string;
  frac: number;
  tone: string;
  bar: string;
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
