// Phase 14C — AccountTimeline, RecommendationSeverityBadge, ReasoningTrail.
//
// Three storytelling surfaces, all derived from the pure accountTimeline
// selector. Never calls the backend, never mutates source data.

"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock,
  Compass,
  GitBranch,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  UserMinus,
  UserPlus,
  XCircle,
} from "lucide-react";

import { cx } from "@/lib/format";
import {
  buildAccountTimeline,
  currentSeverityFor,
  latestEvolutionFor,
  reasoningTrail,
  type RecommendationEvolution,
  type Severity,
  type TimelineEntry,
  type TimelineKind,
} from "@/lib/accountTimeline";

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// SeverityChip — used by every surface
// ---------------------------------------------------------------------------

const SEV_STYLE: Record<Severity, { cls: string; label: string }> = {
  low:      { cls: "border-edge bg-bg/40 text-muted",                          label: "LOW" },
  medium:   { cls: "border-yellow-400/30 bg-yellow-400/10 text-yellow-400",    label: "MEDIUM" },
  high:     { cls: "border-accent/40 bg-accent/10 text-accent",                label: "HIGH" },
  critical: { cls: "border-risk/40 bg-risk/10 text-risk",                      label: "CRITICAL" },
};

function SeverityChip({ severity }: { severity: Severity }) {
  const s = SEV_STYLE[severity];
  return (
    <span className={cx("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold tracking-[0.12em]", s.cls)}>
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Kind icon
// ---------------------------------------------------------------------------

function kindIcon(kind: TimelineKind) {
  const c = "h-3.5 w-3.5";
  switch (kind) {
    case "drift":              return <Activity className={cx(c, "text-brand-bright")} />;
    case "rec_first_seen":     return <UserPlus className={cx(c, "text-accent")} />;
    case "rec_left_queue":     return <UserMinus className={cx(c, "text-risk")} />;
    case "rec_action_changed": return <Sparkles className={cx(c, "text-brand-bright")} />;
    case "rec_priority_jump":  return <Compass className={cx(c, "text-yellow-400")} />;
    case "rec_refined":        return <ChevronRight className={cx(c, "text-muted")} />;
    case "approval":           return <CheckCircle2 className={cx(c, "text-gov")} />;
    case "outcome":            return <Target className={cx(c, "text-accent")} />;
  }
}

// ---------------------------------------------------------------------------
// AccountTimeline — vertical narrative for a single account
// ---------------------------------------------------------------------------

interface TimelineProps {
  accountId: string;
  /** when this changes, the timeline re-reads from localStorage */
  refreshKey?: string | number;
}

export function AccountTimeline({ accountId, refreshKey }: TimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);

  useEffect(() => {
    setEntries(buildAccountTimeline(accountId));
  }, [accountId, refreshKey]);

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-edge bg-surface2/40 px-3 py-4 text-[11.5px] text-muted">
        No timeline events recorded yet for this account. As signals drift, recommendations evolve, and approvals are made, they will appear here in order.
      </div>
    );
  }

  return (
    <div className="card-premium p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gov">
          <Clock size={11} />
          Account timeline
        </div>
        <span className="text-[10px] text-faint">{entries.length} event{entries.length === 1 ? "" : "s"}</span>
      </div>

      <ol className="relative mt-3 space-y-3 border-l border-edge pl-4">
        {entries.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[1.05rem] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-edge bg-bg">
              {kindIcon(e.kind)}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">{e.kindLabel}</span>
              <SeverityChip severity={e.severity} />
              <span className="ml-auto text-[10px] text-faint">{relativeTime(e.timestamp)}</span>
            </div>
            <div className="mt-0.5 text-[12.5px] font-semibold text-ink leading-snug">{e.headline}</div>
            {e.detail ? <div className="mt-0.5 text-[11.5px] text-muted leading-snug">{e.detail}</div> : null}
            {e.attribution ? <div className="mt-0.5 text-[10.5px] text-faint">{e.attribution}</div> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecommendationSeverityBadge — header badge near "Priority #N"
// ---------------------------------------------------------------------------

interface SevBadgeProps {
  accountId: string;
  refreshKey?: string | number;
}

export function RecommendationSeverityBadge({ accountId, refreshKey }: SevBadgeProps) {
  const [sev, setSev] = useState<{ severity: Severity; basis: string }>({ severity: "low", basis: "Steady state" });
  useEffect(() => {
    setSev(currentSeverityFor(accountId));
  }, [accountId, refreshKey]);

  const s = SEV_STYLE[sev.severity];
  const icon =
    sev.severity === "critical" ? <CircleAlert size={11} /> :
    sev.severity === "high"     ? <TrendingUp size={11} /> :
    sev.severity === "medium"   ? <TrendingDown size={11} /> :
                                  <CheckCircle2 size={11} />;
  return (
    <span
      className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold", s.cls)}
      title={sev.basis}
    >
      {icon}
      Severity {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// RecommendationEvolutionPanel — flagship "what changed and why" surface,
// rendered in the main workspace above the Recommended action line. Always
// visible once an account has appeared in the recommendation queue.
// ---------------------------------------------------------------------------

interface EvolutionProps {
  accountId: string;
  /** falls back into the panel as the "current" when no evolution recorded yet */
  fallbackAction?: string;
  fallbackRank?: number;
  refreshKey?: string | number;
}

export function RecommendationEvolutionPanel({ accountId, fallbackAction, fallbackRank, refreshKey }: EvolutionProps) {
  const [evo, setEvo] = useState<RecommendationEvolution | null>(null);
  useEffect(() => {
    setEvo(latestEvolutionFor(accountId));
  }, [accountId, refreshKey]);

  // Baseline view — no history yet this session
  if (!evo) {
    return (
      <div className="mt-2 rounded-lg border border-gov/25 bg-gov/5 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <GitBranch size={12} className="text-gov" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gov">Recommendation evolution</span>
          <SeverityChip severity="low" />
          <span className="ml-auto text-[10px] text-faint">Baseline · this session</span>
        </div>
        <div className="mt-1.5 text-[12px] text-muted leading-snug">
          No prior recommendation recorded for this account in the current session. Showing the initial recommendation from the latest analysis run.
        </div>
        {fallbackAction ? (
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-edge bg-bg/40 px-2 py-1.5">
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint">Previous</div>
              <div className="mt-0.5 text-[11.5px] text-faint italic">no history</div>
            </div>
            <div className="rounded-md border border-accent/30 bg-accent/8 px-2 py-1.5">
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-accent">Current{fallbackRank ? ` · #${fallbackRank}` : ""}</div>
              <div className="mt-0.5 text-[11.5px] font-semibold text-ink leading-snug">{fallbackAction}</div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const sevStyle = SEV_STYLE[evo.severity];
  const showRanks = evo.previous_rank != null || evo.current_rank != null;
  const prev = evo.previous_action ?? (evo.kind === "first_seen" ? "—" : "(unchanged)");
  const curr = evo.current_action ?? (evo.kind === "left_queue" ? "(removed from queue)" : (fallbackAction ?? "—"));

  return (
    <div className={cx("mt-2 rounded-lg border px-3 py-2.5", sevStyle.cls.replace("text-", "ring-1 ring-").split(" ")[0], "border-gov/30 bg-gov/8")}>
      <div className="flex flex-wrap items-center gap-2">
        <GitBranch size={12} className="text-gov" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gov">Recommendation evolution</span>
        <span className="text-[10.5px] font-semibold text-ink">{evo.kindLabel}</span>
        <SeverityChip severity={evo.severity} />
        <span className="ml-auto text-[10px] text-faint tabular-nums">{relativeTime(evo.timestamp)}</span>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-edge bg-bg/40 px-2 py-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint">Previous</span>
            {evo.previous_rank != null ? <span className="text-[9.5px] text-faint tabular-nums">#{evo.previous_rank}</span> : null}
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted leading-snug">{prev}</div>
        </div>
        <div className="rounded-md border border-accent/30 bg-accent/8 px-2 py-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-accent">Current</span>
            {evo.current_rank != null ? <span className="text-[9.5px] text-accent tabular-nums">#{evo.current_rank}</span> : null}
          </div>
          <div className="mt-0.5 text-[11.5px] font-semibold text-ink leading-snug">{curr}</div>
        </div>
      </div>

      <div className="mt-2 flex items-start gap-1.5 text-[11.5px] text-muted leading-snug">
        <Sparkles size={11} className="mt-0.5 text-gov shrink-0" />
        <div className="min-w-0">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-gov">Reason</span>{" "}
          {evo.reason}
        </div>
      </div>

      {evo.attribution || showRanks ? (
        <div className="mt-1.5 text-[10px] text-faint">
          {evo.attribution ? <span>{evo.attribution}</span> : null}
          {evo.attribution && showRanks ? <span> · </span> : null}
          {showRanks && evo.previous_rank != null && evo.current_rank != null
            ? <span>Rank {evo.previous_rank} → {evo.current_rank}</span>
            : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WhyRecommendationChanged — small callout for the workspace header
// ---------------------------------------------------------------------------

interface WhyProps {
  accountId: string;
  refreshKey?: string | number;
}

export function WhyRecommendationChanged({ accountId, refreshKey }: WhyProps) {
  const [latest, setLatest] = useState<TimelineEntry | null>(null);
  useEffect(() => {
    const tl = buildAccountTimeline(accountId);
    const latestDelta = tl.find((e) => e.kind.startsWith("rec_")) ?? null;
    setLatest(latestDelta);
  }, [accountId, refreshKey]);

  if (!latest) return null;

  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-gov/30 bg-gov/10 px-2.5 py-1.5 text-[11.5px] text-muted">
      <GitBranch size={12} className="mt-0.5 text-gov" />
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gov">Why this changed</div>
        <div className="mt-0.5 leading-snug">
          <span className="font-semibold text-ink">{latest.kindLabel}</span>
          {" · "}
          <span>{latest.detail ?? latest.headline}</span>
        </div>
        {latest.attribution ? (
          <div className="mt-0.5 text-[10.5px] text-faint">{latest.attribution} · {relativeTime(latest.timestamp)}</div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReasoningTrail — oldest → newest reasons for this account
// ---------------------------------------------------------------------------

interface TrailProps {
  accountId: string;
  refreshKey?: string | number;
}

export function ReasoningTrail({ accountId, refreshKey }: TrailProps) {
  const [trail, setTrail] = useState<{ timestamp: string; reason: string; kind: string }[]>([]);
  useEffect(() => {
    setTrail(reasoningTrail(accountId));
  }, [accountId, refreshKey]);

  if (trail.length === 0) return null;

  return (
    <div className="card-premium p-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gov">
        <GitBranch size={11} />
        Historical reasoning trail
      </div>
      <ul className="mt-2 space-y-1.5">
        {trail.map((t, i) => (
          <li key={`${t.timestamp}-${i}`} className="flex items-baseline gap-2 text-[11.5px] text-muted">
            <span className="text-[10px] text-faint tabular-nums">{relativeTime(t.timestamp)}</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">{t.kind.replace(/_/g, " ")}</span>
            <span className="leading-snug">{t.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// helper: silence unused-import warnings if the symbol set ever changes
void XCircle;
