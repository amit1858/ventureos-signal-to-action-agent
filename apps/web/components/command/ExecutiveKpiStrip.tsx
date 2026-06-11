"use client";

import * as React from "react";
import {
  Layers,
  AlertTriangle,
  TrendingUp,
  Sparkles,
  UserCheck,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  type LucideIcon,
} from "lucide-react";
import type { Account, Recommendation } from "@/lib/types";
import { cx } from "@/lib/format";
import { countHighOpportunity, countHighRisk } from "@/lib/portfolio";

type TrendDir = "up" | "down" | "flat";

interface Kpi {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  desc: string;
  tone: string;
  trendDir: TrendDir;
  trendText: string;
  trendTone: string;
}

function pctOf(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export function ExecutiveKpiStrip({
  accounts,
  recs,
  hasResult,
}: {
  accounts: Account[];
  recs: Recommendation[];
  hasResult: boolean;
}) {
  const total = accounts.length;
  const highRisk = countHighRisk(accounts);
  const highOpp = countHighOpportunity(accounts);
  const generated = recs.length;
  const pending = recs.filter((r) => r.approval_status === "pending").length;
  const completed = recs.filter((r) => r.approval_status === "approved").length;
  const dash = "—";

  const items: Kpi[] = [
    {
      icon: Layers,
      label: "Accounts Analyzed",
      value: total || dash,
      desc: "Across the active portfolio",
      tone: "text-ink",
      trendDir: "flat",
      trendText: "live portfolio",
      trendTone: "text-faint",
    },
    {
      icon: AlertTriangle,
      label: "High Risk Accounts",
      value: total ? highRisk : dash,
      desc: "Support risk ≥ 60",
      tone: "text-risk",
      trendDir: highRisk > 0 ? "up" : "flat",
      trendText: `${pctOf(highRisk, total)} of book`,
      trendTone: "text-risk",
    },
    {
      icon: TrendingUp,
      label: "High Opportunity",
      value: total ? highOpp : dash,
      desc: "Growth potential ≥ 65",
      tone: "text-accent",
      trendDir: highOpp > 0 ? "up" : "flat",
      trendText: `${pctOf(highOpp, total)} of book`,
      trendTone: "text-accent",
    },
    {
      icon: Sparkles,
      label: "AI Recommendations",
      value: hasResult ? generated : dash,
      desc: "Ranked next-best actions",
      tone: "text-cyan",
      trendDir: generated > 0 ? "up" : "flat",
      trendText: hasResult ? "this run" : "run to generate",
      trendTone: "text-cyan",
    },
    {
      icon: UserCheck,
      label: "Awaiting Approval",
      value: hasResult ? pending : dash,
      desc: "Pending human decision",
      tone: "text-amber",
      trendDir: pending > 0 ? "up" : "flat",
      trendText: pending > 0 ? "needs review" : "all clear",
      trendTone: "text-amber",
    },
    {
      icon: CheckCircle2,
      label: "Actions Completed",
      value: hasResult ? completed : dash,
      desc: "Approved & actioned",
      tone: "text-accent",
      trendDir: completed > 0 ? "up" : "flat",
      trendText: hasResult ? `${pctOf(completed, generated)} approved` : "—",
      trendTone: "text-accent",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {items.map((it) => (
        <div
          key={it.label}
          className="card relative overflow-hidden p-3.5 transition-colors hover:border-edge-soft"
        >
          <div className="flex items-center justify-between">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-edge bg-surface2/70 text-faint">
              <it.icon size={14} className={it.tone} />
            </span>
            <TrendBadge dir={it.trendDir} text={it.trendText} tone={it.trendTone} />
          </div>
          <div className={cx("mt-2.5 font-mono text-2xl font-semibold leading-none", it.tone)}>
            {it.value}
          </div>
          <div className="mt-1.5 text-[11px] font-medium text-ink">{it.label}</div>
          <div className="text-[10px] leading-tight text-faint">{it.desc}</div>
        </div>
      ))}
    </div>
  );
}

function TrendBadge({ dir, text, tone }: { dir: TrendDir; text: string; tone: string }) {
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-0.5 rounded-md border border-edge bg-surface2/50 px-1.5 py-0.5 text-[9px] font-medium",
        dir === "flat" ? "text-faint" : tone,
      )}
      title="Trend context"
    >
      <Icon size={10} />
      {text}
    </span>
  );
}
