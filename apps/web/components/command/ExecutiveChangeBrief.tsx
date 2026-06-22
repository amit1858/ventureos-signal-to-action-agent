// Phase 14D — Executive Change Brief + Portfolio Timeline.
//
// Two storytelling surfaces derived from the pure selectors in
// lib/executiveChangeBrief. Strictly additive — no backend, no mutation.

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpRight,
  Briefcase,
  Clock,
  Compass,
  GitBranch,
  LogIn,
  LogOut,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { cx, inrCompact } from "@/lib/format";
import type { Account } from "@/lib/types";
import {
  buildExecutiveChangeBrief,
  buildPortfolioTimeline,
  type ExecutiveChangeBrief,
  type ImpactLevel,
  type PortfolioTimelineEntry,
  type PortfolioTimelineKind,
  type RiskMovement,
} from "@/lib/executiveChangeBrief";

const DIM_LABEL: Record<RiskMovement["dimension"], string> = {
  support_risk: "Support risk",
  usage:        "Product usage",
  engagement:   "Engagement",
  opportunity:  "Opportunity",
  renewal:      "Renewal",
  spend:        "Spend",
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const IMPACT_STYLE: Record<ImpactLevel, { cls: string; label: string }> = {
  low:    { cls: "border-edge bg-bg/40 text-muted",                       label: "LOW" },
  medium: { cls: "border-yellow-400/30 bg-yellow-400/10 text-yellow-400", label: "MEDIUM" },
  high:   { cls: "border-risk/40 bg-risk/10 text-risk",                   label: "HIGH" },
};

const SEV_DOT: Record<"low" | "medium" | "high", string> = {
  low:    "bg-muted/50",
  medium: "bg-yellow-400",
  high:   "bg-risk",
};

// ---------------------------------------------------------------------------
// ExecutiveChangeBriefPanel — flagship "what changed since yesterday" card.
// ---------------------------------------------------------------------------

interface BriefProps {
  accounts: Account[];
  refreshKey?: string | number;
  onOpenAccount?: (accountId: string) => void;
  onOpenTimeline?: () => void;
}

export function ExecutiveChangeBriefPanel({ accounts, refreshKey, onOpenAccount, onOpenTimeline }: BriefProps) {
  const [brief, setBrief] = useState<ExecutiveChangeBrief | null>(null);
  useEffect(() => {
    setBrief(buildExecutiveChangeBrief(accounts));
  }, [accounts, refreshKey]);

  if (!brief) return null;

  const impactStyle = IMPACT_STYLE[brief.expectedImpactLevel];

  return (
    <div className="card-elevated relative overflow-hidden p-3 sm:p-4">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-gov via-gov/40 to-transparent" aria-hidden />

      {/* Header */}
      <div className="relative flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <Briefcase size={13} className="text-gov" />
          <h2 className="text-[15px] font-semibold text-ink">Executive Change Brief</h2>
        </div>
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-faint">{brief.windowLabel}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-faint">
          <Clock size={10} /> {relativeTime(brief.windowEndIso)}
        </span>
      </div>

      <p className="relative mt-1.5 text-[12.5px] leading-snug text-muted">{brief.headline}</p>

      {/* Expected impact strip */}
      {brief.expectedImpactInr > 0 ? (
        <div className="relative mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-gov/25 bg-gov/8 px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gov">Expected business impact</span>
          <span className="text-[14px] font-semibold text-ink">{inrCompact(brief.expectedImpactInr)}</span>
          <span className={cx("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold tracking-[0.12em]", impactStyle.cls)}>
            {impactStyle.label}
          </span>
          <span className="text-[11px] text-muted">
            annualised revenue exposed by risk increases in this window
          </span>
        </div>
      ) : null}

      {/* 4-column grid */}
      <div className="relative mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <BriefColumn
          icon={<TrendingDown size={11} />}
          label="Risk increases"
          tone="risk"
          count={brief.riskMovements.length}
        >
          {brief.riskMovements.length === 0 ? (
            <EmptyRow text="No material risk movement" />
          ) : (
            brief.riskMovements.slice(0, 4).map((m) => (
              <MovementRow
                key={`${m.account_id}-${m.timestamp}`}
                accountName={m.account_name}
                dimension={DIM_LABEL[m.dimension]}
                before={m.before}
                after={m.after}
                magnitude={m.magnitude}
                direction="up"
                reason={m.reason}
                timestamp={m.timestamp}
                tone="risk"
                onOpen={onOpenAccount ? () => onOpenAccount(m.account_id) : undefined}
              />
            ))
          )}
        </BriefColumn>

        <BriefColumn
          icon={<TrendingUp size={11} />}
          label="Opportunity moves"
          tone="ok"
          count={brief.opportunityMovements.length}
        >
          {brief.opportunityMovements.length === 0 ? (
            <EmptyRow text="No new expansion signals" />
          ) : (
            brief.opportunityMovements.slice(0, 4).map((m) => (
              <MovementRow
                key={`${m.account_id}-${m.timestamp}`}
                accountName={m.account_name}
                dimension={DIM_LABEL[m.dimension]}
                before={m.before}
                after={m.after}
                magnitude={m.magnitude}
                direction="up"
                reason={m.reason}
                timestamp={m.timestamp}
                tone="ok"
                onOpen={onOpenAccount ? () => onOpenAccount(m.account_id) : undefined}
              />
            ))
          )}
        </BriefColumn>

        <BriefColumn
          icon={<LogIn size={11} />}
          label="Entered queue"
          tone="brand"
          count={brief.accountsEnteringQueue.length}
        >
          {brief.accountsEnteringQueue.length === 0 ? (
            <EmptyRow text="No new accounts in queue" />
          ) : (
            brief.accountsEnteringQueue.slice(0, 4).map((e) => (
              <button
                key={e.account_id}
                type="button"
                onClick={onOpenAccount ? () => onOpenAccount(e.account_id) : undefined}
                className="block w-full rounded-md border border-edge/60 bg-bg/40 px-2 py-1.5 text-left hover:border-accent/40 hover:bg-accent/5 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-semibold text-ink">{e.account_name}</span>
                  {e.current_rank != null ? <span className="text-[10px] font-semibold text-accent tabular-nums">#{e.current_rank}</span> : null}
                </div>
                {e.current_action ? <div className="mt-0.5 truncate text-[10.5px] text-muted">{e.current_action}</div> : null}
                <div className="mt-0.5 text-[9.5px] text-faint">{relativeTime(e.timestamp)}</div>
              </button>
            ))
          )}
        </BriefColumn>

        <BriefColumn
          icon={<LogOut size={11} />}
          label="Left queue"
          tone="neutral"
          count={brief.accountsLeavingQueue.length}
        >
          {brief.accountsLeavingQueue.length === 0 ? (
            <EmptyRow text="No accounts dropped" />
          ) : (
            brief.accountsLeavingQueue.slice(0, 4).map((e) => (
              <button
                key={e.account_id}
                type="button"
                onClick={onOpenAccount ? () => onOpenAccount(e.account_id) : undefined}
                className="block w-full rounded-md border border-edge/60 bg-bg/40 px-2 py-1.5 text-left hover:border-edge transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-semibold text-ink">{e.account_name}</span>
                  {e.previous_rank != null ? <span className="text-[10px] text-faint tabular-nums">was #{e.previous_rank}</span> : null}
                </div>
                {e.previous_action ? <div className="mt-0.5 truncate text-[10.5px] text-muted">{e.previous_action}</div> : null}
                <div className="mt-0.5 text-[9.5px] text-faint">{relativeTime(e.timestamp)}</div>
              </button>
            ))
          )}
        </BriefColumn>
      </div>

      {/* Action changes — separate row, often the most actionable signal */}
      {brief.actionChanges.length > 0 ? (
        <div className="relative mt-3 rounded-md border border-gov/25 bg-gov/5 px-3 py-2">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gov">
            <GitBranch size={11} />
            Recommended action revisions
            <span className="rounded-full bg-gov/15 px-1.5 py-0.5 text-[9.5px] text-gov">{brief.actionChanges.length}</span>
          </div>
          <ul className="mt-1.5 space-y-1">
            {brief.actionChanges.slice(0, 4).map((c) => (
              <li key={`${c.account_id}-${c.timestamp}`} className="flex flex-wrap items-baseline gap-x-2 text-[11.5px] text-muted">
                <button
                  type="button"
                  onClick={onOpenAccount ? () => onOpenAccount(c.account_id) : undefined}
                  className="font-semibold text-ink hover:text-accent transition-colors"
                >
                  {c.account_name}
                </button>
                <span className="text-faint">{c.previous_action ?? "—"}</span>
                <ArrowUpRight size={10} className="text-gov" />
                <span className="text-ink">{c.current_action ?? "—"}</span>
                <span className="ml-auto text-[9.5px] text-faint">{relativeTime(c.timestamp)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Footer */}
      <div className="relative mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-faint">
        <span>{brief.driftEventCount} drift event{brief.driftEventCount === 1 ? "" : "s"}</span>
        <span>·</span>
        <span>{brief.deltaEventCount} recommendation delta{brief.deltaEventCount === 1 ? "" : "s"}</span>
        {onOpenTimeline ? (
          <button
            type="button"
            onClick={onOpenTimeline}
            className="ml-auto inline-flex items-center gap-1 text-gov hover:text-ink transition-colors"
          >
            <Sparkles size={10} /> Open Portfolio Timeline →
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------- column primitives ----------

function BriefColumn({
  icon,
  label,
  tone,
  count,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "risk" | "ok" | "brand" | "neutral";
  count: number;
  children: React.ReactNode;
}) {
  const toneCls =
    tone === "risk"    ? "text-risk" :
    tone === "ok"      ? "text-accent" :
    tone === "brand"   ? "text-brand-bright" :
                         "text-muted";
  return (
    <div className="rounded-lg border border-edge bg-surface2/40 p-2.5">
      <div className={cx("flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]", toneCls)}>
        {icon}
        {label}
        <span className="ml-auto rounded-full bg-bg/60 px-1.5 py-0.5 text-[9.5px] text-muted tabular-nums">{count}</span>
      </div>
      <div className="mt-2 space-y-1.5">{children}</div>
    </div>
  );
}

function MovementRow({
  accountName,
  dimension,
  before,
  after,
  magnitude,
  direction,
  reason,
  timestamp,
  tone,
  onOpen,
}: {
  accountName: string;
  dimension: string;
  before: number;
  after: number;
  magnitude: "minor" | "moderate" | "major";
  direction: "up" | "down";
  reason: string;
  timestamp: string;
  tone: "risk" | "ok";
  onOpen?: () => void;
}) {
  const arrow = direction === "up" ? <ArrowUp size={10} /> : <ArrowDown size={10} />;
  const magCls =
    magnitude === "major"    ? (tone === "risk" ? "text-risk"  : "text-accent") :
    magnitude === "moderate" ? "text-yellow-400" : "text-muted";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-md border border-edge/60 bg-bg/40 px-2 py-1.5 text-left hover:border-edge transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-semibold text-ink">{accountName}</span>
        <span className={cx("inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums", magCls)}>
          {arrow}{Math.round(Math.abs(after - before))}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted">
        <span>{dimension}</span>
        <span className="text-faint">·</span>
        <span className="capitalize text-faint">{magnitude}</span>
        <span className="ml-auto text-[9.5px] text-faint">{relativeTime(timestamp)}</span>
      </div>
      {reason ? <div className="mt-0.5 line-clamp-2 text-[10.5px] text-faint leading-snug">{reason}</div> : null}
    </button>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-edge/40 px-2 py-1.5 text-[11px] text-faint italic">{text}</div>;
}

// ---------------------------------------------------------------------------
// PortfolioTimeline — chronological cross-account feed.
// ---------------------------------------------------------------------------

interface TimelineProps {
  refreshKey?: string | number;
  onOpenAccount?: (accountId: string) => void;
  limit?: number;
}

const KIND_ICON: Record<PortfolioTimelineKind, React.ReactNode> = {
  drift:          <TrendingDown size={11} />,
  queue_entered:  <LogIn size={11} />,
  queue_left:     <LogOut size={11} />,
  action_changed: <GitBranch size={11} />,
  priority_jump:  <Compass size={11} />,
};

export function PortfolioTimeline({ refreshKey, onOpenAccount, limit = 30 }: TimelineProps) {
  const [entries, setEntries] = useState<PortfolioTimelineEntry[]>([]);
  useEffect(() => {
    setEntries(buildPortfolioTimeline(limit));
  }, [refreshKey, limit]);

  // group by day
  const grouped = useMemo(() => {
    const byDay: { day: string; items: PortfolioTimelineEntry[] }[] = [];
    for (const e of entries) {
      const day = new Date(e.timestamp).toDateString();
      const last = byDay[byDay.length - 1];
      if (last && last.day === day) last.items.push(e);
      else byDay.push({ day, items: [e] });
    }
    return byDay;
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-edge bg-surface2/30 px-3 py-4 text-[12px] text-muted">
        No portfolio-wide activity in the current window. As signals drift and recommendations evolve, events will appear here in order.
      </div>
    );
  }

  return (
    <div className="card-premium p-3">
      <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gov">
        <Clock size={11} />
        Portfolio timeline
        <span className="ml-auto rounded-full bg-bg/60 px-1.5 py-0.5 text-[9.5px] text-muted tabular-nums">{entries.length}</span>
      </div>

      <div className="mt-2 space-y-3">
        {grouped.map((group) => (
          <div key={group.day}>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
              {group.day === new Date().toDateString() ? "Today" : group.day}
            </div>
            <ol className="relative space-y-1.5 border-l border-edge pl-3">
              {group.items.map((e) => (
                <li key={e.id} className="relative">
                  <span className={cx("absolute -left-[14px] top-1.5 inline-block h-2 w-2 rounded-full", SEV_DOT[e.severity])} />
                  <button
                    type="button"
                    onClick={onOpenAccount ? () => onOpenAccount(e.account_id) : undefined}
                    className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-surface2/60 transition-colors"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">
                        {KIND_ICON[e.kind]}
                        {e.kindLabel}
                      </span>
                      <span className="text-[12px] font-semibold text-ink">{e.account_name}</span>
                      <span className="ml-auto text-[9.5px] text-faint tabular-nums">{relativeTime(e.timestamp)}</span>
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-muted leading-snug">{e.headline}</div>
                    {e.detail ? <div className="mt-0.5 text-[10.5px] text-faint leading-snug line-clamp-1">{e.detail}</div> : null}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

// silence unused warnings (kept for future inline use)
void ArrowDownRight;
