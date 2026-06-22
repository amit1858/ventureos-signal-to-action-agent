// Phase 14E — External System Change Detection.
//
// Surface that monitors the external data source (HubSpot or synthetic),
// detects field-level changes since the last sync, and surfaces them in
// executive language with reacting agents and recommendation impact.

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Cable,
  CheckCircle2,
  Clock,
  GitBranch,
  Plug,
  RefreshCw,
  Users,
  Wifi,
  Zap,
} from "lucide-react";

import { cx } from "@/lib/format";
import {
  loadExternalEvents,
  loadExternalMeta,
  type ExternalChangeEvent,
  type ExternalMagnitude,
  type ExternalSyncMetadata,
} from "@/lib/externalChangeMonitor";
import type { DeltaKind } from "@/lib/recommendationDelta";

const DELTA_LABEL: Record<DeltaKind, string> = {
  first_seen: "New recommendation",
  left_queue: "Left priority queue",
  action_changed: "Recommendation revised",
  priority_jump: "Priority moved",
  refined: "Priority adjusted",
};

interface Props {
  refreshKey?: string | number;
  onOpenAccount?: (accountId: string) => void;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const MAG_STYLE: Record<ExternalMagnitude, string> = {
  minor:    "border-edge bg-bg/40 text-muted",
  moderate: "border-yellow-400/30 bg-yellow-400/10 text-yellow-400",
  major:    "border-risk/40 bg-risk/10 text-risk",
};

export function ExternalChangeMonitorPanel({ refreshKey, onOpenAccount }: Props) {
  const [events, setEvents] = useState<ExternalChangeEvent[]>([]);
  const [meta, setMeta] = useState<ExternalSyncMetadata | null>(null);

  useEffect(() => {
    setEvents(loadExternalEvents());
    setMeta(loadExternalMeta());
  }, [refreshKey]);

  // unique counts
  const summary = useMemo(() => {
    if (events.length === 0) {
      return { impactedAccounts: 0, agents: [] as string[], rec_impacted: 0 };
    }
    const accountIds = new Set<string>();
    const agentSet = new Set<string>();
    let recImpacted = 0;
    for (const e of events) {
      accountIds.add(e.account_id);
      for (const a of e.reacting_agents) agentSet.add(a);
      if (e.linked_delta_id) recImpacted += 1;
    }
    return { impactedAccounts: accountIds.size, agents: Array.from(agentSet), rec_impacted: recImpacted };
  }, [events]);

  // baseline state: connected to external source but no diffs detected yet
  if (!meta) {
    return (
      <div className="card-premium p-3">
        <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gov">
          <Cable size={11} />
          What changed in connected systems
        </div>
        <div className="mt-2 rounded-md border border-dashed border-edge/40 px-3 py-3 text-[12px] text-muted">
          Waiting for first analysis run. Once data syncs, this panel will surface what changed in the external system since the last sync, which accounts were impacted, which agents reacted, and the recommendation impact.
        </div>
      </div>
    );
  }

  const liveBadgeCls = meta.events_last_window > 0
    ? "border-accent/40 bg-accent/10 text-accent"
    : "border-edge bg-bg/40 text-muted";

  return (
    <div className="card-premium p-3">
      {/* Sync header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gov">
          <Cable size={11} />
          What changed in connected systems
        </div>
        <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", liveBadgeCls)}>
          <Wifi size={9} /> {meta.source}
        </span>
        <span className="text-[10.5px] text-faint">
          <Clock size={9} className="mr-0.5 inline" />
          Last sync {relativeTime(meta.last_sync)}
        </span>
        <span className="text-[10.5px] text-faint">
          <Users size={9} className="mr-0.5 inline" />
          {meta.account_count} records
        </span>
      </div>

      {/* 4-stat strip */}
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile
          icon={<RefreshCw size={11} />}
          label="Records changed"
          value={summary.impactedAccounts}
          tone={summary.impactedAccounts > 0 ? "warn" : "neutral"}
          hint="unique accounts"
        />
        <StatTile
          icon={<Plug size={11} />}
          label="Records added / removed"
          value={`+${meta.records_added} / -${meta.records_removed}`}
          tone={(meta.records_added > 0 || meta.records_removed > 0) ? "brand" : "neutral"}
          hint="since last sync"
        />
        <StatTile
          icon={<Zap size={11} />}
          label="AI agents engaged"
          value={summary.agents.length}
          tone={summary.agents.length > 0 ? "ok" : "neutral"}
          hint={summary.agents.slice(0, 2).join(" · ") || "none"}
        />
        <StatTile
          icon={<GitBranch size={11} />}
          label="Recommendations impacted"
          value={summary.rec_impacted}
          tone={summary.rec_impacted > 0 ? "risk" : "neutral"}
          hint="linked to recommendation changes"
        />
      </div>

      {/* Reacting agents row */}
      {summary.agents.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint">Reacting</span>
          {summary.agents.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 rounded-full border border-gov/30 bg-gov/8 px-1.5 py-0.5 text-[10px] font-medium text-gov">
              <Zap size={9} /> {a}
            </span>
          ))}
        </div>
      ) : null}

      {/* What changed feed */}
      <div className="mt-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">What changed</div>
        {events.length === 0 ? (
          <div className="mt-1.5 rounded-md border border-dashed border-edge/40 px-3 py-2.5 text-[11.5px] text-muted italic">
            No external data changes detected since the last sync. Portfolio is steady.
          </div>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {events.slice(0, 8).map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={onOpenAccount ? () => onOpenAccount(e.account_id) : undefined}
                  className="block w-full rounded-md border border-edge/60 bg-bg/40 px-2.5 py-1.5 text-left transition-colors hover:border-accent/40 hover:bg-accent/5"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={cx("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold tracking-[0.12em]", MAG_STYLE[e.magnitude])}>
                      {e.magnitude.toUpperCase()}
                    </span>
                    <span className="text-[12px] font-semibold text-ink">{e.account_name}</span>
                    <span className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold tabular-nums text-faint">
                      {e.after > e.before ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                      {e.pct_change != null
                        ? `${Math.abs(Math.round(e.pct_change * 100))}%`
                        : Math.round(Math.abs(e.after - e.before))}
                    </span>
                    <span className="ml-auto text-[9.5px] text-faint tabular-nums">{relativeTime(e.timestamp)}</span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-muted leading-snug">{e.executive_summary}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-faint">
                    <span className="inline-flex items-center gap-1 text-gov">
                      <Zap size={9} /> {e.reacting_agents.join(" · ")}
                    </span>
                    {e.linked_delta_kind ? (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-accent">
                          <GitBranch size={9} />
                          Recommendation impact: {DELTA_LABEL[e.linked_delta_kind] ?? e.linked_delta_kind.replace(/_/g, " ")}
                          {e.linked_delta_action ? ` → ${e.linked_delta_action}` : ""}
                        </span>
                      </>
                    ) : (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-muted">
                          <CheckCircle2 size={9} /> No ranking change required
                        </span>
                      </>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 text-[10px] text-faint">
        <span>{meta.events_total} total change event{meta.events_total === 1 ? "" : "s"} this session</span>
        <span>·</span>
        <span>{meta.events_last_window} since last sync</span>
      </div>
    </div>
  );
}

function StatTile({
  icon, label, value, tone, hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: "risk" | "warn" | "ok" | "brand" | "neutral";
  hint: string;
}) {
  const toneCls =
    tone === "risk"  ? "text-risk" :
    tone === "warn"  ? "text-yellow-400" :
    tone === "ok"    ? "text-accent" :
    tone === "brand" ? "text-brand-bright" :
                       "text-muted";
  return (
    <div className="rounded-lg border border-edge bg-surface2/40 px-2.5 py-2">
      <div className={cx("flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em]", toneCls)}>
        {icon}
        {label}
      </div>
      <div className={cx("mt-1 text-[16px] font-semibold tabular-nums leading-tight", toneCls)}>{value}</div>
      <div className="mt-0.5 text-[10px] text-faint">{hint}</div>
    </div>
  );
}
