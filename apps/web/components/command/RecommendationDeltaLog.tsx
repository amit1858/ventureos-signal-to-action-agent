// Phase 14B — RecommendationDeltaLog component.
//
// Two surfaces:
//   1. CompactSummary  — small strip showing "N rec changes since last run"
//      with semantic counts; safe to mount in PortfolioPulseBar / hero area.
//   2. FullLog         — table of recent recommendation changes with
//      previous → current, reason, agent attribution, account name, and a
//      click handler that opens the affected account. Mount inside a
//      CompactSection in Portfolio Intelligence.
//
// Strictly additive. Does not call the backend; reads from the snapshot/log
// that CommandCenter ingests after every /api/recommendations response.

"use client";

import { useMemo } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Clock,
  Compass,
  GitBranch,
  Layers,
  Sparkles,
  UserMinus,
  UserPlus,
} from "lucide-react";

import { cx } from "@/lib/format";
import {
  RecommendationDelta,
  type DeltaSummary,
  summarizeDeltas,
} from "@/lib/recommendationDelta";

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ---------------------------------------------------------------------------
// Compact summary strip (for PortfolioPulseBar area)
// ---------------------------------------------------------------------------

interface CompactProps {
  deltas: RecommendationDelta[];
  onJumpToFullLog?: () => void;
}

export function RecommendationDeltaCompact({ deltas, onJumpToFullLog }: CompactProps) {
  const summary = useMemo(() => summarizeDeltas(deltas), [deltas]);

  if (summary.totalSinceSession === 0) return null;

  const cycleCount = summary.totalSinceLastRun;
  const cycleLabel =
    cycleCount === 0
      ? "No changes in latest run"
      : `${cycleCount} change${cycleCount === 1 ? "" : "s"} in latest run`;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-edge bg-bg/40 px-3.5 py-2 text-[11px]">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gov">
        <GitBranch size={11} />
        Recommendation changes
      </span>
      <span className="text-muted">{cycleLabel}</span>
      <span className="text-faint">·</span>
      <span className="inline-flex items-center gap-1 text-muted">
        <UserPlus size={10} className="text-accent" />
        <span className="font-semibold text-accent">{summary.newToQueue}</span> new to queue
      </span>
      <span className="text-faint">·</span>
      <span className="inline-flex items-center gap-1 text-muted">
        <UserMinus size={10} className="text-risk" />
        <span className="font-semibold text-risk">{summary.leftQueue}</span> left queue
      </span>
      <span className="text-faint">·</span>
      <span className="inline-flex items-center gap-1 text-muted">
        <Compass size={10} className="text-yellow-400" />
        <span className="font-semibold text-yellow-400">{summary.priorityJumps}</span> priority jumps
      </span>
      <span className="text-faint">·</span>
      <span className="inline-flex items-center gap-1 text-muted">
        <Sparkles size={10} className="text-brand-bright" />
        <span className="font-semibold text-brand-bright">{summary.actionChanges}</span> action revised
      </span>
      {onJumpToFullLog ? (
        <button
          type="button"
          onClick={onJumpToFullLog}
          className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-semibold text-accent hover:text-accent-hover"
        >
          View change log
          <ArrowRight size={10} />
        </button>
      ) : (
        <span className="ml-auto text-[10px] text-faint">
          {summary.lastChangeIso ? `latest ${relativeTime(summary.lastChangeIso)}` : null}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full log (Portfolio Intelligence section)
// ---------------------------------------------------------------------------

interface FullProps {
  deltas: RecommendationDelta[];
  onOpenAccount?: (accountId: string) => void;
}

export function RecommendationDeltaLog({ deltas, onOpenAccount }: FullProps) {
  const summary = useMemo(() => summarizeDeltas(deltas), [deltas]);
  const recent = useMemo(() => deltas.slice(0, 12), [deltas]);

  if (deltas.length === 0) {
    return (
      <div className="rounded-lg border border-edge bg-surface2/40 px-3 py-4 text-[11.5px] text-muted">
        No recommendation changes recorded yet. After your next run, this log will track every priority shift and action revision.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <SummaryRow summary={summary} />
      <div className="overflow-hidden rounded-lg border border-edge bg-surface2/40">
        <div className="grid grid-cols-[1.4fr_2.2fr_2.4fr_0.7fr] gap-2 border-b border-edge bg-bg/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
          <div>Account</div>
          <div>Change</div>
          <div>Reason</div>
          <div className="text-right">When</div>
        </div>
        <ul className="divide-y divide-edge">
          {recent.map((d) => (
            <DeltaRow key={d.id} delta={d} onOpenAccount={onOpenAccount} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function SummaryRow({ summary }: { summary: DeltaSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gov">
        <Layers size={11} />
        Portfolio change log
      </span>
      <span>
        <span className="font-semibold text-ink">{summary.totalSinceSession}</span> total this session
      </span>
      <span className="text-faint">·</span>
      <span>
        <span className="font-semibold text-ink">{summary.totalSinceLastRun}</span> in latest run
      </span>
      {summary.lastChangeIso ? (
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-faint">
          <Clock size={10} />
          latest {relativeTime(summary.lastChangeIso)}
        </span>
      ) : null}
    </div>
  );
}

function DeltaRow({
  delta,
  onOpenAccount,
}: {
  delta: RecommendationDelta;
  onOpenAccount?: (id: string) => void;
}) {
  const interactive = !!onOpenAccount;
  return (
    <li
      className={cx(
        "grid grid-cols-[1.4fr_2.2fr_2.4fr_0.7fr] items-start gap-2 px-3 py-2 text-[11.5px] transition",
        interactive && "cursor-pointer hover:bg-surface2/70",
      )}
      onClick={interactive ? () => onOpenAccount!(delta.account_id) : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpenAccount!(delta.account_id);
        }
      }}
    >
      <div className="min-w-0">
        <div className="truncate font-semibold text-ink" title={delta.account_name}>
          {delta.account_name}
        </div>
        <div className="mt-0.5 inline-flex items-center gap-1">
          <KindChip kind={delta.kind} />
        </div>
      </div>
      <div className="min-w-0 text-muted">
        <RankShift previous={delta.previous_rank} current={delta.current_rank} />
        <ActionShift previous={delta.previous_action} current={delta.current_action} />
      </div>
      <div className="min-w-0 text-muted">
        <div className="leading-snug" title={delta.reason}>{delta.reason}</div>
        {delta.inferred_drift_agent ? (
          <div className="mt-0.5 text-[10px] text-faint">
            Inferred from {delta.inferred_drift_agent}
            {delta.inferred_drift_signal ? ` · ${delta.inferred_drift_signal}` : ""}
          </div>
        ) : null}
      </div>
      <div className="text-right text-[10.5px] text-faint">{relativeTime(delta.timestamp)}</div>
    </li>
  );
}

function KindChip({ kind }: { kind: RecommendationDelta["kind"] }) {
  const map: Record<RecommendationDelta["kind"], { label: string; cls: string; icon: React.ReactNode }> = {
    first_seen:     { label: "Entered queue",  cls: "border-accent/40 bg-accent/10 text-accent",        icon: <UserPlus size={9} /> },
    left_queue:     { label: "Left queue",     cls: "border-risk/40 bg-risk/10 text-risk",              icon: <UserMinus size={9} /> },
    action_changed: { label: "Action revised", cls: "border-brand/40 bg-brand/10 text-brand-bright",    icon: <Sparkles size={9} /> },
    priority_jump:  { label: "Priority jump",  cls: "border-yellow-400/40 bg-yellow-400/10 text-yellow-400", icon: <Compass size={9} /> },
    refined:        { label: "Rank refined",   cls: "border-edge bg-bg/40 text-muted",                  icon: <ArrowRight size={9} /> },
  };
  const cfg = map[kind];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]", cfg.cls)}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function RankShift({ previous, current }: { previous: number | null; current: number | null }) {
  if (previous == null && current != null) return <div className="text-[11px]">→ <span className="font-semibold text-accent">#{current}</span></div>;
  if (previous != null && current == null) return <div className="text-[11px]"><span className="font-semibold text-risk">#{previous}</span> → off-queue</div>;
  if (previous != null && current != null && previous !== current) {
    const up = current < previous;
    return (
      <div className="text-[11px]">
        <span className="text-faint">#{previous}</span>
        <span className={cx("mx-1 inline-flex items-center", up ? "text-risk" : "text-accent")}>
          {up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
        </span>
        <span className={cx("font-semibold", up ? "text-risk" : "text-accent")}>#{current}</span>
      </div>
    );
  }
  if (previous != null && current != null) return <div className="text-[11px] text-faint">#{current}</div>;
  return null;
}

function ActionShift({ previous, current }: { previous: string | null; current: string | null }) {
  if (previous && current && previous !== current) {
    return (
      <div className="mt-0.5 text-[10.5px]">
        <span className="text-faint line-through">{previous}</span>
        <span className="mx-1 text-faint">→</span>
        <span className="font-semibold text-ink">{current}</span>
      </div>
    );
  }
  if (current && !previous) return <div className="mt-0.5 text-[10.5px] text-muted">{current}</div>;
  if (previous && !current) return <div className="mt-0.5 text-[10.5px] text-faint italic">{previous}</div>;
  return null;
}
