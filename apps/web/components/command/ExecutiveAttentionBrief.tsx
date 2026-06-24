// Phase 15B — Executive Attention Brief.
//
// A flagship narrative card positioned immediately below the AI Chief of
// Staff and above the Daily Briefing. Single decisive view of:
//   • What requires attention (count, top account, exposure)
//   • Why it matters (highest-risk recommended actions)
//   • What should happen next (top 3 actions + estimated effort)
//
// Pure composition over existing recommendation/account data. No new
// intelligence, no scoring, no governance changes. Mode-aware default
// state: Executive expanded, Seller collapsed, Operations hidden.

"use client";

import * as React from "react";
import { ArrowUpRight, ChevronDown, ShieldAlert, Sparkles } from "lucide-react";

import type { Account, Recommendation } from "@/lib/types";
import { reasonForRecommendation } from "@/lib/reasoning";
import { revenueAtRisk, countAttention } from "@/lib/portfolio";
import { cx, inrCompact } from "@/lib/format";

interface Props {
  accounts: Account[];
  accountsById: Record<string, Account>;
  recs: Recommendation[];
  titleLabel?: string;
  defaultOpen?: boolean;
  onOpenAccount?: (accountId: string) => void;
}

interface ActionRow {
  rank: number;
  accountId: string;
  accountName: string;
  action: string;
  minutes: number;
  pendingApproval: boolean;
}

function buildActionRows(
  recs: Recommendation[],
  accountsById: Record<string, Account>,
): ActionRow[] {
  return recs.slice(0, 3).map((rec) => {
    const account = accountsById[rec.account_id];
    const reasoning = reasonForRecommendation(rec, account);
    return {
      rank: rec.priority_rank,
      accountId: rec.account_id,
      accountName: rec.account_name,
      action: reasoning.action.label,
      minutes: reasoning.estimatedMinutes,
      pendingApproval: rec.approval_status === "pending",
    };
  });
}

function formatEffort(minutes: number): string {
  if (minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.round((minutes / 60) * 10) / 10;
  return `${hrs} hrs`;
}

export function ExecutiveAttentionBrief({
  accounts,
  accountsById,
  recs,
  titleLabel = "Executive Attention Required",
  defaultOpen = true,
  onOpenAccount,
}: Props) {
  const [open, setOpen] = React.useState<boolean>(defaultOpen);
  React.useEffect(() => setOpen(defaultOpen), [defaultOpen]);

  const attentionCount = React.useMemo(() => countAttention(accounts), [accounts]);
  const revenueExposure = React.useMemo(() => revenueAtRisk(accounts), [accounts]);
  const actionRows = React.useMemo(() => buildActionRows(recs, accountsById), [recs, accountsById]);
  const effortMin = actionRows.reduce((sum, row) => sum + row.minutes, 0);
  const pendingApprovals = recs.filter((r) => r.approval_status === "pending").length;
  const topAccountName = recs[0]?.account_name ?? "—";

  if (recs.length === 0) return null;

  const summary = (
    <>
      <span className="font-semibold text-ink">{attentionCount}</span> accounts require attention
      <span className="mx-1.5 text-edge">·</span>
      <span className="font-semibold text-risk">{inrCompact(revenueExposure)}</span> at risk
      <span className="mx-1.5 text-edge">·</span>
      {formatEffort(effortMin)} effort
    </>
  );

  return (
    <section
      className={cx(
        "relative overflow-hidden rounded-xl border bg-gradient-to-br from-surface2/70 via-surface2/50 to-surface2/30 transition-colors",
        open ? "border-accent/40 shadow-[0_0_0_1px_rgba(216,154,61,0.18)]" : "border-edge hover:border-accent/30",
      )}
    >
      <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-accent via-accent/60 to-transparent" aria-hidden />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
      >
        <ChevronDown
          size={14}
          className={cx("shrink-0 text-muted transition-transform", open ? "rotate-0" : "-rotate-90")}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-accent" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
              {titleLabel}
            </span>
          </div>
          <div className="mt-1 text-[12.5px] text-muted">{summary}</div>
        </div>
        {!open ? (
          <span className="hidden shrink-0 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent sm:inline-block">
            Review
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="border-t border-edge/70 px-4 pb-3.5 pt-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Accounts requiring attention" value={String(attentionCount)} tone="ink" />
            <Stat label="Revenue exposure" value={inrCompact(revenueExposure)} tone="risk" icon={<ShieldAlert size={11} />} />
            <Stat label="Most impacted account" value={topAccountName} tone="ink" />
          </div>

          {actionRows.length > 0 ? (
            <div className="mt-3 rounded-lg border border-edge/70 bg-surface1/40 p-2.5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
                Recommended next actions
              </div>
              <ol className="space-y-1.5">
                {actionRows.map((row) => (
                  <li key={row.accountId} className="flex items-center gap-2.5 text-[12px]">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-edge bg-surface2/60 text-[10px] font-semibold text-muted">
                      {row.rank}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenAccount?.(row.accountId)}
                      className="min-w-0 flex-1 truncate text-left font-semibold text-ink hover:text-accent"
                      title={row.accountName}
                    >
                      {row.accountName}
                    </button>
                    <span className="hidden truncate text-muted sm:inline-block sm:max-w-[40%]" title={row.action}>
                      {row.action}
                    </span>
                    {row.pendingApproval ? (
                      <span className="rounded-full border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-warn">
                        Approval
                      </span>
                    ) : null}
                    <span className="text-[10.5px] text-faint">{formatEffort(row.minutes)}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-edge/60 pt-2 text-[10.5px] text-muted">
                <span>
                  Estimated effort:{" "}
                  <span className="font-semibold text-ink">{formatEffort(effortMin)}</span>
                  {pendingApprovals > 0 ? (
                    <>
                      <span className="mx-1.5 text-edge">·</span>
                      <span className="font-semibold text-warn">{pendingApprovals}</span> pending approval
                    </>
                  ) : null}
                </span>
                {actionRows[0] ? (
                  <button
                    type="button"
                    onClick={() => onOpenAccount?.(actionRows[0].accountId)}
                    className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent hover:bg-accent/20"
                  >
                    Review actions <ArrowUpRight size={11} />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "ink" | "risk";
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-edge/70 bg-surface1/40 px-3 py-2">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-faint">{label}</div>
      <div
        className={cx(
          "mt-1 flex items-center gap-1.5 text-[15px] font-semibold",
          tone === "risk" ? "text-risk" : "text-ink",
        )}
      >
        {icon}
        <span className="truncate" title={value}>
          {value}
        </span>
      </div>
    </div>
  );
}
