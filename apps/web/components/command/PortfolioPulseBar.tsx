// Phase 14A revision — PortfolioPulseBar.
//
// Operating-experience surface that lives directly under the AI Chief of Staff
// hero. Surfaces "What Changed" + an Agent Activity Stream so drift events are
// felt in the seller's primary workflow, not buried inside an analytics tab.
//
// Strictly additive. Does NOT touch ranker / governance / approvals / agents.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Clock,
  Radio,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import type { Account, Recommendation } from "@/lib/types";
import {
  computeImpactSummary,
  DriftEvent,
  DriftSnapshot,
  forceDriftTick,
  loadDriftSnapshot,
  subscribeDrift,
  summarizeDrift,
} from "@/lib/driftEngine";
import { cx } from "@/lib/format";

interface Props {
  accounts: Account[];
  recs: Recommendation[];
  onOpenAccount?: (accountId: string) => void;
  onJumpToFullFeed?: () => void;
}

const DIM_LABEL: Record<DriftEvent["dimension"], string> = {
  support_risk: "Support risk",
  usage: "Product usage",
  engagement: "Engagement",
  opportunity: "Opportunity",
  renewal: "Renewal window",
  spend: "Spend",
};

function relative(iso: string | null, now: number): string {
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
  return `${Math.floor(h / 24)}d ago`;
}

function impactDot(e: DriftEvent): string {
  if (e.impact === "risk") return "bg-risk";
  if (e.impact === "opportunity") return "bg-accent";
  return "bg-muted";
}

function impactText(e: DriftEvent): string {
  if (e.impact === "risk") return "text-risk";
  if (e.impact === "opportunity") return "text-accent";
  return "text-muted";
}

function formatDelta(e: DriftEvent): string {
  if (e.dimension === "spend") {
    const abs = Math.round(e.delta);
    return `${e.direction === "up" ? "+" : "−"}${abs.toLocaleString("en-IN")}`;
  }
  if (e.dimension === "renewal") {
    return `${e.direction === "down" ? "−" : "+"}${Math.round(e.delta)}d`;
  }
  return `${e.direction === "up" ? "+" : "−"}${e.delta.toFixed(1)}`;
}

export function PortfolioPulseBar({ accounts, recs, onOpenAccount, onJumpToFullFeed }: Props) {
  const [snap, setSnap] = useState<DriftSnapshot>(() =>
    typeof window === "undefined"
      ? { events: [], overlay: {}, sessionStart: new Date().toISOString(), lastTick: null }
      : loadDriftSnapshot(),
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;

  useEffect(() => {
    if (accounts.length === 0) return;
    const unsub = subscribeDrift(
      () => accountsRef.current,
      (s) => setSnap(s),
      { intervalMs: 45_000, jitterMs: 15_000, firstTickDelayMs: 6_000 },
    );
    return unsub;
  }, [accounts.length === 0]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const summary = useMemo(() => summarizeDrift(snap.events), [snap.events]);
  const impact = useMemo(() => computeImpactSummary(snap.events, recs), [snap.events, recs]);
  const stream = snap.events.slice(0, 6);
  const isLive = accounts.length > 0;
  const handleTick = useCallback(() => {
    forceDriftTick(() => accountsRef.current);
  }, []);

  return (
    <div className="card-elevated relative overflow-hidden">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-3.5 py-2">
        <div className="flex items-center gap-2">
          <div className="relative flex h-2 w-2 items-center justify-center">
            <span
              className={cx(
                "absolute inline-flex h-full w-full rounded-full opacity-70",
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
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
            Portfolio pulse · what changed
          </span>
          <span className="text-[11px] text-muted">
            · {summary.lastTickIso ? `last signal ${relative(summary.lastTickIso, now)}` : "awaiting first signal"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleTick}
            disabled={!isLive}
            className="rounded-md border border-edge bg-surface2 px-2 py-1 text-[11px] text-soft transition hover:border-brand/40 hover:text-ink disabled:opacity-40"
            title="Trigger an immediate drift tick"
          >
            <RefreshCw size={11} className="mr-1 inline-block -mt-0.5" />
            Force tick
          </button>
          {onJumpToFullFeed ? (
            <button
              type="button"
              onClick={onJumpToFullFeed}
              className="rounded-md border border-brand/30 bg-brand/[0.08] px-2 py-1 text-[11px] font-semibold text-brand-bright transition hover:border-brand/60 hover:bg-brand/[0.12]"
            >
              Full activity →
            </button>
          ) : null}
        </div>
      </div>

      {/* 4 operational tiles */}
      <div className="grid grid-cols-2 gap-2 px-3.5 py-2.5 sm:grid-cols-4">
        <PulseTile
          icon={<Users size={13} className="text-brand-bright" />}
          label="Accounts changed"
          value={String(summary.accountsChangedSinceStart)}
          subtext={`${summary.totalEvents} signals total`}
        />
        <PulseTile
          icon={<ShieldAlert size={13} className="text-risk" />}
          label="Risks ↑"
          value={String(summary.risksUp)}
          subtext={
            summary.largestRiskIncrease
              ? `Top: ${summary.largestRiskIncrease.account_name}`
              : "No risk drift yet"
          }
          tone="risk"
        />
        <PulseTile
          icon={<TrendingUp size={13} className="text-accent" />}
          label="Opportunities ↑"
          value={String(summary.opportunitiesUp)}
          subtext={
            summary.largestOpportunityIncrease
              ? `Top: ${summary.largestOpportunityIncrease.account_name}`
              : "No opportunity drift yet"
          }
          tone="opp"
        />
        <PulseTile
          icon={<AlertTriangle size={13} className="text-yellow-400" />}
          label="New attention items"
          value={String(summary.newAttentionAccounts)}
          subtext={
            summary.newAttentionList.length
              ? summary.newAttentionList.slice(0, 2).join(" · ")
              : "Portfolio steady"
          }
          tone="attention"
        />
      </div>

      {/* Impact summary — connects drift to seller action */}
      <ImpactSummarySection impact={impact} onOpenAccount={onOpenAccount} />

      {/* Activity stream */}
      <div className="border-t border-edge bg-bg/40">
        <div className="flex items-center justify-between px-3.5 pt-2">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
            <Radio size={11} />
            Agent activity stream
          </div>
          <span className="text-[10px] text-faint">
            Signal detected → Agent → Account
          </span>
        </div>
        {stream.length === 0 ? (
          <div className="px-3.5 pb-3 pt-2 text-[11.5px] text-muted">
            Waiting for the first drift tick (~6s after the workspace loads)…
          </div>
        ) : (
          <ul className="divide-y divide-edge/60">
            {stream.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-2.5 px-3.5 py-2 text-[12px]"
              >
                <span
                  className={cx(
                    "flex h-1.5 w-1.5 shrink-0 rounded-full",
                    impactDot(e),
                  )}
                  aria-hidden
                />
                <span className="shrink-0 rounded-md border border-edge bg-surface2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-soft">
                  {e.agent}
                </span>
                <div className="min-w-0 flex-1 truncate">
                  <span className={cx("font-semibold", impactText(e))}>
                    {e.direction === "up" ? (
                      <ArrowUp size={11} className="-mt-0.5 inline-block" />
                    ) : (
                      <ArrowDown size={11} className="-mt-0.5 inline-block" />
                    )}{" "}
                    {e.signalLabel}
                  </span>
                  <span className="text-faint"> · </span>
                  <span className="text-soft">{e.account_name}</span>
                  <span className="text-faint"> · </span>
                  <span className="text-muted">{DIM_LABEL[e.dimension]} {formatDelta(e)}</span>
                </div>
                <span className="shrink-0 text-[10.5px] tabular-nums text-faint">
                  <Clock size={9} className="-mt-0.5 mr-0.5 inline-block" />
                  {relative(e.timestamp, now)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="px-3.5 pb-2 pt-1 text-[10px] text-faint">
          <Activity size={9} className="-mt-0.5 mr-1 inline-block" />
          Live telemetry simulation · feeds operational awareness without
          altering the deterministic ranker, governance checks, or decision
          ledger.
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
  tone?: "risk" | "opp" | "attention";
}

function PulseTile({ icon, label, value, subtext, tone }: TileProps) {
  const valueClass =
    tone === "risk"
      ? "text-risk"
      : tone === "opp"
        ? "text-accent"
        : tone === "attention"
          ? "text-yellow-400"
          : "text-ink";
  const borderClass =
    tone === "risk"
      ? "border-risk/30"
      : tone === "opp"
        ? "border-accent/30"
        : tone === "attention"
          ? "border-yellow-400/30"
          : "border-edge";
  return (
    <div className={cx("rounded-lg border bg-surface2/40 px-3 py-2", borderClass)}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
        {icon}
        {label}
      </div>
      <div className={cx("mt-1 text-[18px] font-semibold tabular-nums leading-none", valueClass)}>
        {value}
      </div>
      <div className="mt-1 truncate text-[10.5px] text-muted" title={subtext}>
        {subtext}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Impact Summary — connects drift to seller action.
// For each pulse cycle: most significant risk ↑, most significant opportunity ↑,
// accounts requiring immediate attention, highest-priority affected account.
// Highest-priority card has an "Open" CTA that calls onOpenAccount so a seller
// can jump straight from signal to workflow.
// -----------------------------------------------------------------------------

interface ImpactProps {
  impact: ReturnType<typeof computeImpactSummary>;
  onOpenAccount?: (accountId: string) => void;
}

function ImpactSummarySection({ impact, onOpenAccount }: ImpactProps) {
  const {
    mostSignificantRisk,
    mostSignificantOpportunity,
    immediateAttention,
    highestPriorityAffected,
    cycleEvents,
    cycleRiskEvents,
    cycleOpportunityEvents,
  } = impact;

  const hasAny =
    mostSignificantRisk ||
    mostSignificantOpportunity ||
    immediateAttention.length > 0 ||
    highestPriorityAffected;

  if (!hasAny) return null;

  const cycleLabel =
    cycleEvents.length === 0
      ? "Awaiting next pulse cycle"
      : `This cycle · ${cycleEvents.length} signal${cycleEvents.length === 1 ? "" : "s"} · ${cycleRiskEvents} risk · ${cycleOpportunityEvents} opportunity`;

  return (
    <div className="border-t border-edge bg-bg/30">
      <div className="flex items-center justify-between px-3.5 pt-2">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
          <Sparkles size={11} className="text-brand" />
          Impact summary
        </div>
        <div className="text-[10px] text-faint">{cycleLabel}</div>
      </div>
      <div className="grid grid-cols-1 gap-2 px-3.5 py-2.5 lg:grid-cols-2 xl:grid-cols-4">
        <ImpactCard
          tone="risk"
          icon={<ShieldAlert size={11} />}
          eyebrow="Most significant risk ↑"
          headline={mostSignificantRisk?.account_name ?? "—"}
          line={
            mostSignificantRisk
              ? `${labelFor(mostSignificantRisk)} · ${mostSignificantRisk.reason}`
              : "No risk movement yet"
          }
          meta={mostSignificantRisk ? `${magLabel(mostSignificantRisk.magnitude)} · ${mostSignificantRisk.agent}` : null}
          onClick={mostSignificantRisk && onOpenAccount ? () => onOpenAccount(mostSignificantRisk.account_id) : undefined}
        />
        <ImpactCard
          tone="opp"
          icon={<TrendingUp size={11} />}
          eyebrow="Most significant opportunity ↑"
          headline={mostSignificantOpportunity?.account_name ?? "—"}
          line={
            mostSignificantOpportunity
              ? `${labelFor(mostSignificantOpportunity)} · ${mostSignificantOpportunity.reason}`
              : "No expansion signal yet"
          }
          meta={
            mostSignificantOpportunity
              ? `${magLabel(mostSignificantOpportunity.magnitude)} · ${mostSignificantOpportunity.agent}`
              : null
          }
          onClick={
            mostSignificantOpportunity && onOpenAccount
              ? () => onOpenAccount(mostSignificantOpportunity.account_id)
              : undefined
          }
        />
        <ImpactCard
          tone="attention"
          icon={<AlertTriangle size={11} />}
          eyebrow="Immediate attention"
          headline={`${immediateAttention.length} account${immediateAttention.length === 1 ? "" : "s"}`}
          line={
            immediateAttention.length === 0
              ? "Nothing requires intervention right now"
              : immediateAttention.slice(0, 3).map((a) => a.account_name).join(", ") +
                (immediateAttention.length > 3 ? ` +${immediateAttention.length - 3} more` : "")
          }
          meta={immediateAttention.length > 0 ? "Moderate or severe risk movement this cycle" : null}
          onClick={
            immediateAttention[0] && onOpenAccount
              ? () => onOpenAccount(immediateAttention[0].account_id)
              : undefined
          }
        />
        <ImpactCard
          tone="brand"
          icon={<Target size={11} />}
          eyebrow="Highest-priority affected"
          headline={
            highestPriorityAffected
              ? `#${highestPriorityAffected.rec.priority_rank} · ${highestPriorityAffected.rec.account_name}`
              : "—"
          }
          line={
            highestPriorityAffected
              ? `Next best action: ${highestPriorityAffected.rec.recommended_action}`
              : "No drifted account is currently ranked"
          }
          meta={
            highestPriorityAffected
              ? `Signal: ${labelFor(highestPriorityAffected.latestEvent)} · ${highestPriorityAffected.latestEvent.agent}`
              : null
          }
          cta={highestPriorityAffected ? "Open account" : null}
          onClick={
            highestPriorityAffected && onOpenAccount
              ? () => onOpenAccount(highestPriorityAffected.rec.account_id)
              : undefined
          }
        />
      </div>
    </div>
  );
}

interface ImpactCardProps {
  tone: "risk" | "opp" | "attention" | "brand";
  icon: React.ReactNode;
  eyebrow: string;
  headline: string;
  line: string;
  meta?: string | null;
  cta?: string | null;
  onClick?: () => void;
}

function ImpactCard({ tone, icon, eyebrow, headline, line, meta, cta, onClick }: ImpactCardProps) {
  const toneRing =
    tone === "risk"
      ? "border-risk/30"
      : tone === "opp"
        ? "border-accent/30"
        : tone === "attention"
          ? "border-yellow-400/30"
          : "border-brand/30";
  const toneText =
    tone === "risk"
      ? "text-risk"
      : tone === "opp"
        ? "text-accent"
        : tone === "attention"
          ? "text-yellow-400"
          : "text-brand-bright";
  const interactive = !!onClick;
  return (
    <div
      className={cx(
        "group relative flex flex-col rounded-lg border bg-surface2/40 px-3 py-2 transition",
        toneRing,
        interactive && "cursor-pointer hover:bg-surface2/70 hover:shadow-glow-soft",
      )}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className={cx("flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]", toneText)}>
        {icon}
        {eyebrow}
      </div>
      <div className="mt-1 truncate text-[13px] font-semibold text-ink" title={headline}>
        {headline}
      </div>
      <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted" title={line}>
        {line}
      </div>
      {meta ? <div className="mt-1.5 truncate text-[10px] text-faint" title={meta}>{meta}</div> : null}
      {cta ? (
        <div className={cx("mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-semibold", toneText)}>
          {cta}
          <ArrowRight size={10} className="transition group-hover:translate-x-0.5" />
        </div>
      ) : null}
    </div>
  );
}

function labelFor(e: DriftEvent): string {
  return e.signalLabel ?? e.dimension;
}

function magLabel(m: DriftEvent["magnitude"]): string {
  if (m === "major") return "Major";
  if (m === "moderate") return "Moderate";
  return "Minor";
}

// -----------------------------------------------------------------------------
// Inline acknowledgement line for the AI Chief of Staff hero. Mounts INSIDE
// the existing card and reads from the same singleton subscription.
// -----------------------------------------------------------------------------

interface AckProps {
  accounts: Account[];
}

export function DriftAcknowledgementLine({ accounts }: AckProps) {
  const [snap, setSnap] = useState<DriftSnapshot>(() =>
    typeof window === "undefined"
      ? { events: [], overlay: {}, sessionStart: new Date().toISOString(), lastTick: null }
      : loadDriftSnapshot(),
  );
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;

  useEffect(() => {
    if (accounts.length === 0) return;
    const unsub = subscribeDrift(
      () => accountsRef.current,
      (s) => setSnap(s),
    );
    return unsub;
  }, [accounts.length === 0]);

  const summary = useMemo(() => summarizeDrift(snap.events), [snap.events]);

  if (summary.totalEvents === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
      <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
        <span className="relative flex h-1.5 w-1.5 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
        Since you opened this session
      </span>
      <span>
        <span className="font-semibold text-risk">{summary.risksUp}</span> risk signals ↑
      </span>
      <span className="text-faint">·</span>
      <span>
        <span className="font-semibold text-accent">{summary.opportunitiesUp}</span> opportunity signals ↑
      </span>
      <span className="text-faint">·</span>
      <span>
        <span className="font-semibold text-yellow-400">{summary.newAttentionAccounts}</span> new attention items
      </span>
      <span className="text-faint">·</span>
      <span>
        <span className="font-semibold text-ink">{summary.accountsChangedSinceStart}</span> accounts changed
      </span>
    </div>
  );
}
