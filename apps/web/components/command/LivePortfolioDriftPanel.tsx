// Phase 14A — Live Portfolio Drift panel.
//
// Purely additive. Visualizes the frontend drift simulator. Does NOT change
// ranked accounts, governance, approvals, or any backend contract.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Clock,
  Radio,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trash2,
} from "lucide-react";

import type { Account } from "@/lib/types";
import {
  clearDrift,
  DriftEvent,
  DriftSnapshot,
  forceDriftTick,
  loadDriftSnapshot,
  subscribeDrift,
  summarizeDrift,
} from "@/lib/driftEngine";
import { cx, inrCompact } from "@/lib/format";

interface Props {
  accounts: Account[];
}

function relativeTime(iso: string | null, now: number): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const DIM_LABEL: Record<DriftEvent["dimension"], string> = {
  support_risk: "Support risk",
  usage: "Product usage",
  engagement: "Engagement",
  opportunity: "Opportunity",
  renewal: "Renewal window",
  spend: "Spend",
};

function impactClass(impact: DriftEvent["impact"]): string {
  if (impact === "risk") return "text-risk";
  if (impact === "opportunity") return "text-accent";
  return "text-muted";
}

function impactPill(impact: DriftEvent["impact"]): string {
  if (impact === "risk")
    return "border-risk/40 bg-risk/12 text-risk";
  if (impact === "opportunity")
    return "border-accent/40 bg-accent/12 text-accent";
  return "border-edge bg-surface2 text-muted";
}

function formatDelta(e: DriftEvent): string {
  if (e.dimension === "spend") {
    return `${e.direction === "up" ? "+" : "−"}${inrCompact(e.delta)}`;
  }
  if (e.dimension === "renewal") {
    return `${e.direction === "down" ? "−" : "+"}${Math.round(e.delta)}d`;
  }
  return `${e.direction === "up" ? "+" : "−"}${e.delta.toFixed(1)} pts`;
}

export function LivePortfolioDriftPanel({ accounts }: Props) {
  const [snap, setSnap] = useState<DriftSnapshot>(() =>
    typeof window === "undefined"
      ? { events: [], overlay: {}, sessionStart: new Date().toISOString(), lastTick: null }
      : loadDriftSnapshot(),
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;

  // Start drift engine when we have accounts (shared singleton)
  useEffect(() => {
    if (accounts.length === 0) return;
    const unsub = subscribeDrift(
      () => accountsRef.current,
      (s) => setSnap(s),
      { intervalMs: 45_000, jitterMs: 15_000, firstTickDelayMs: 6_000 },
    );
    return unsub;
  }, [accounts.length === 0]);

  // Tick the "x seconds ago" label every second
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const handleManualTrigger = useCallback(() => {
    forceDriftTick(() => accountsRef.current);
  }, []);

  const handleClear = useCallback(() => {
    clearDrift();
    setSnap({
      events: [],
      overlay: {},
      sessionStart: new Date().toISOString(),
      lastTick: null,
    });
  }, []);

  const summary = useMemo(() => summarizeDrift(snap.events), [snap.events]);
  const recent = snap.events.slice(0, 8);
  const isLive = accounts.length > 0;

  return (
    <div className="card-premium overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex h-2 w-2 items-center justify-center">
            <span
              className={cx(
                "absolute inline-flex h-full w-full rounded-full opacity-75",
                isLive ? "animate-ping bg-accent" : "bg-muted",
              )}
            />
            <span
              className={cx(
                "relative inline-flex h-2 w-2 rounded-full",
                isLive ? "bg-accent" : "bg-muted",
              )}
            />
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
            Live portfolio drift
          </div>
          <span className="text-[11px] text-muted">
            · {isLive ? "Streaming" : "Waiting for portfolio"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted tabular-nums">
            <Clock size={11} className="mr-1 inline-block -mt-0.5" />
            Last update {relativeTime(summary.lastTickIso, now)}
          </span>
          <button
            type="button"
            onClick={handleManualTrigger}
            disabled={!isLive}
            className="rounded-md border border-edge bg-surface2 px-2 py-1 text-[11px] text-soft transition hover:border-brand/40 hover:text-ink disabled:opacity-40"
            title="Force a drift tick"
          >
            <RefreshCw size={11} className="mr-1 inline-block -mt-0.5" />
            Force tick
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={snap.events.length === 0}
            className="rounded-md border border-edge bg-surface2 px-2 py-1 text-[11px] text-muted transition hover:border-risk/40 hover:text-risk disabled:opacity-40"
            title="Clear drift history (this browser)"
          >
            <Trash2 size={11} className="mr-1 inline-block -mt-0.5" />
            Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 px-3.5 py-3 sm:grid-cols-3">
        <DriftTile
          icon={<Activity size={13} className="text-brand-bright" />}
          label="Accounts changed"
          value={String(summary.accountsChangedSinceStart)}
          subtext={`${summary.totalEvents} drift events captured`}
        />
        <DriftTile
          icon={<ShieldAlert size={13} className="text-risk" />}
          label="Largest risk increase"
          value={
            summary.largestRiskIncrease
              ? summary.largestRiskIncrease.account_name
              : "—"
          }
          subtext={
            summary.largestRiskIncrease
              ? `${DIM_LABEL[summary.largestRiskIncrease.dimension]} ${formatDelta(summary.largestRiskIncrease)}`
              : "No risk drift yet"
          }
          tone="risk"
        />
        <DriftTile
          icon={<TrendingUp size={13} className="text-accent" />}
          label="Largest opportunity increase"
          value={
            summary.largestOpportunityIncrease
              ? summary.largestOpportunityIncrease.account_name
              : "—"
          }
          subtext={
            summary.largestOpportunityIncrease
              ? `${DIM_LABEL[summary.largestOpportunityIncrease.dimension]} ${formatDelta(summary.largestOpportunityIncrease)}`
              : "No opportunity drift yet"
          }
          tone="opp"
        />
      </div>

      <div className="border-t border-edge bg-bg/40 px-3.5 py-3">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
          <Radio size={11} />
          Recent drift events
        </div>
        {recent.length === 0 ? (
          <div className="rounded-md border border-dashed border-edge px-3 py-4 text-center text-[12px] text-muted">
            <Sparkles size={14} className="mx-auto mb-1.5 text-faint" />
            Waiting for the first drift tick…
            <div className="mt-1 text-[11px] text-faint">
              First update typically lands within ~6 seconds.
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-edge/60 overflow-hidden rounded-md border border-edge">
            {recent.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-2.5 bg-surface2/30 px-3 py-2 text-[12px]"
              >
                <span
                  className={cx(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                    impactPill(e.impact),
                  )}
                >
                  {e.direction === "up" ? (
                    <ArrowUp size={12} />
                  ) : (
                    <ArrowDown size={12} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-ink">
                      {e.account_name}
                    </span>
                    <span className={cx("shrink-0 text-[11.5px] font-semibold tabular-nums", impactClass(e.impact))}>
                      {formatDelta(e)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span className="rounded border border-edge bg-bg/40 px-1 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-soft">
                      {e.agent}
                    </span>
                    {e.direction === "up" ? (
                      <TrendingUp size={10} className={impactClass(e.impact)} />
                    ) : (
                      <TrendingDown size={10} className={impactClass(e.impact)} />
                    )}
                    <span className="text-soft">{DIM_LABEL[e.dimension]}</span>
                    <span className="text-faint">·</span>
                    <span className="truncate">{e.reason}</span>
                    <span className="text-faint">·</span>
                    <span className="shrink-0 tabular-nums text-faint">
                      {relativeTime(e.timestamp, now)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 text-[10.5px] text-faint">
          Drift is a frontend simulation of incoming telemetry. It evolves
          account conditions for visualization and does not alter the
          deterministic ranking, governance checks, or decision ledger.
        </div>
      </div>
    </div>
  );
}

interface TileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  tone?: "risk" | "opp";
}

function DriftTile({ icon, label, value, subtext, tone }: TileProps) {
  const valueClass =
    tone === "risk"
      ? "text-risk"
      : tone === "opp"
        ? "text-accent"
        : "text-ink";
  return (
    <div className="rounded-lg border border-edge bg-surface2/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-faint">
        {icon}
        {label}
      </div>
      <div className={cx("mt-1 truncate text-[14px] font-semibold", valueClass)} title={value}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-muted">{subtext}</div>
    </div>
  );
}
