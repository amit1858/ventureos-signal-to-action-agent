"use client";

import { TrendingUp, AlertTriangle, ChevronRight, Crown, FileSearch } from "lucide-react";
import type { Account, Recommendation } from "@/lib/types";
import { approvalTone, confidenceLabel, cx, pct, scoreTone } from "@/lib/format";
import { businessAction } from "@/lib/actions";
import { accountReasons } from "@/lib/portfolio";
import { EvidenceChips } from "./EvidenceChips";
import { Bar } from "./ui";
import { GovernanceBadge } from "./GovernanceBadge";

export function RecommendationCard({
  rec,
  account,
  selected,
  onClick,
}: {
  rec: Recommendation;
  account?: Account;
  selected: boolean;
  onClick: () => void;
}) {
  const score = scoreTone(rec.priority_score);
  const conf = scoreTone(rec.confidence_score);
  const appr = approvalTone(rec.approval_status);
  const isTop = rec.priority_rank === 1;
  const ba = businessAction(rec.action_type, {
    governanceStatus: rec.governance_status,
    growthPotential: account?.growth_potential_score,
    productUsage: account?.product_usage_score,
  });
  const Action = ba.icon;
  const reasons = account ? accountReasons(account).slice(0, 3) : [];

  return (
    <button
      onClick={onClick}
      className={cx(
        "group relative w-full animate-fade-in overflow-hidden rounded-xl border p-4 text-left transition-all",
        selected
          ? "border-accent/60 bg-elevated shadow-glow"
          : "border-edge bg-surface hover:border-faint hover:bg-surface2/40",
      )}
    >
      {/* Selected accent rail */}
      {selected ? <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden /> : null}

      {isTop ? (
        <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
          <Crown size={11} /> Top priority this week
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        {/* Rank */}
        <div
          className={cx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border font-mono text-sm font-bold",
            rec.priority_rank <= 3
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-edge bg-surface2 text-muted",
          )}
        >
          {rec.priority_rank}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-ink">{rec.account_name}</h3>
            <ChevronRight
              size={16}
              className={cx(
                "shrink-0 text-faint transition-transform",
                selected ? "translate-x-0 text-accent" : "group-hover:translate-x-0.5",
              )}
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {account ? (
              <>
                <span className="rounded border border-edge bg-surface2 px-1.5 py-0.5 text-[10px] text-muted">
                  {account.industry}
                </span>
                <span className="rounded border border-edge bg-surface2 px-1.5 py-0.5 text-[10px] text-muted">
                  {account.segment}
                </span>
                <span className="rounded border border-edge bg-surface2 px-1.5 py-0.5 text-[10px] text-muted">
                  {account.region}
                </span>
              </>
            ) : (
              <span className="font-mono text-[11px] text-faint">{rec.account_id}</span>
            )}
          </div>
        </div>
      </div>

      {/* Priority + action row */}
      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-faint">Priority</span>
            <span className={cx("font-mono text-xs font-semibold", score.text)}>
              {Math.round(rec.priority_score * 100)}
            </span>
          </div>
          <Bar value={rec.priority_score} barClass={score.bar} />
        </div>
        <span className={cx("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium", ba.ring, ba.bg, ba.tone)}>
          <Action size={12} />
          {ba.label}
        </span>
      </div>

      {/* Why this account */}
      {reasons.length > 0 ? (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-faint">Why this account</div>
          <ul className="mt-1 space-y-1">
            {reasons.map((r) => (
              <li key={r.key} className="flex items-start gap-1.5 text-[11px] leading-snug text-muted">
                <span
                  className={cx(
                    "mt-1 h-1 w-1 shrink-0 rounded-full",
                    r.tone === "risk" ? "bg-risk" : r.tone === "opp" ? "bg-accent" : "bg-faint",
                  )}
                />
                <span className="line-clamp-1">{r.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted">{rec.priority_reason}</p>
      )}

      {/* Risk / Opportunity tags */}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="flex items-start gap-1.5 rounded-lg border border-risk/20 bg-risk/5 px-2 py-1.5">
          <AlertTriangle size={12} className="mt-0.5 shrink-0 text-risk" />
          <span className="line-clamp-2 text-[11px] leading-snug text-muted">
            {rec.risk_summary}
          </span>
        </div>
        <div className="flex items-start gap-1.5 rounded-lg border border-accent/20 bg-accent/5 px-2 py-1.5">
          <TrendingUp size={12} className="mt-0.5 shrink-0 text-accent" />
          <span className="line-clamp-2 text-[11px] leading-snug text-muted">
            {rec.opportunity_summary}
          </span>
        </div>
      </div>

      {/* Evidence */}
      <div className="mt-3 flex items-center gap-2">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-faint">
          <FileSearch size={11} /> {rec.evidence.length} evidence
        </span>
        <div className="h-px flex-1 bg-edge" />
      </div>
      <div className="mt-2">
        <EvidenceChips evidence={rec.evidence} max={4} />
      </div>

      {/* Footer: confidence + governance + approval */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-edge pt-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-faint">Conf.</span>
          <span className={cx("font-mono text-xs font-semibold", conf.text)}>
            {pct(rec.confidence_score)}
          </span>
          <span className="text-[10px] text-faint">
            {confidenceLabel(rec.confidence_score).replace(" confidence", "")}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <GovernanceBadge status={rec.governance_status} />
          <span className={cx("rounded-full border px-2 py-0.5 text-[10px] font-medium", appr.cls)}>
            {appr.label}
          </span>
        </div>
      </div>
    </button>
  );
}
