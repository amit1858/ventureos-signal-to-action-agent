// Release 1.4B — Morning Brief (persona-first entry surface).
//
// This is the FIRST experience each persona receives, decoupled from section
// visibility. It answers the one question that persona starts the day with:
//   • Executive  → "What changed?"            → Executive Brief
//   • Seller     → "What should I do first?"  → Today's Missions (AI Chief of Staff)
//   • Operations → "What needs attention?"    → Operational health
//
// It is a pure presentation layer over the existing deterministic `morningBrief`
// aggregation + reasoning bundle. It NEVER re-ranks, re-scores, or changes
// governance — it only frames already-computed output as a guided briefing and
// hands the seller into Mission Mode.

"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Gauge,
  LayoutDashboard,
  Rocket,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { Account, Recommendation } from "@/lib/types";
import {
  greetingText,
  morningBrief,
  reasonForRecommendation,
  resolveDisplayName,
  type BriefExternalContext,
  type BriefTodayAction,
} from "@/lib/reasoning";
import { missionMetrics, type MissionMetrics } from "@/lib/missionState";
import {
  MODE_DESCRIPTION,
  type ExperienceMode,
} from "@/lib/experienceMode";
import { ExperienceModeSwitch } from "@/components/command/ExperienceModeSwitch";
import { cx } from "@/lib/format";

export interface MorningBriefViewProps {
  accounts: Account[];
  accountsById: Record<string, Account>;
  recs: Recommendation[];
  hasResult: boolean;
  loading?: boolean;
  experienceMode: ExperienceMode;
  onChangeMode: (mode: ExperienceMode) => void;
  externalEnabled?: boolean;
  externalContext?: Record<string, BriefExternalContext>;
  onBeginMission: (accountId: string, recommendationId: string | null) => void;
  onOpenCommand: () => void;
  onOpenAccount: (accountId: string, source: string) => void;
  onRun?: () => void;
}

const MINUTES = (m: number) => `${Math.max(1, Math.round(m))} min`;

export function MorningBriefView({
  accounts,
  accountsById,
  recs,
  hasResult,
  loading,
  experienceMode,
  onChangeMode,
  externalEnabled,
  externalContext,
  onBeginMission,
  onOpenCommand,
  onOpenAccount,
  onRun,
}: MorningBriefViewProps) {
  const brief = React.useMemo(
    () =>
      morningBrief(accounts, accountsById, recs, hasResult, {
        externalEnabled: externalEnabled ?? false,
        externalContext: externalContext ?? {},
      }),
    [accounts, accountsById, recs, hasResult, externalEnabled, externalContext],
  );

  // Re-read session mission metrics on mount so "missions completed this session"
  // reflects work the seller already did before returning to the brief.
  const [metrics, setMetrics] = React.useState<MissionMetrics | null>(null);
  React.useEffect(() => setMetrics(missionMetrics()), [hasResult]);

  const greeting = greetingText(new Date());
  const name = resolveDisplayName();
  const greetLine = name ? `${greeting}, ${name}.` : `${greeting}.`;

  const recById = React.useMemo(() => {
    const map: Record<string, Recommendation> = {};
    recs.forEach((r) => (map[r.account_id] = r));
    return map;
  }, [recs]);

  if (!hasResult && !loading) {
    return (
      <BriefShell greetLine={greetLine} experienceMode={experienceMode} onChangeMode={onChangeMode}>
        <EmptyBrief onRun={onRun} />
      </BriefShell>
    );
  }

  if (loading && !hasResult) {
    return (
      <BriefShell greetLine={greetLine} experienceMode={experienceMode} onChangeMode={onChangeMode}>
        <div className="animate-pulse rounded-2xl border border-edge bg-surface2/40 p-8 text-center text-sm text-faint">
          Preparing your briefing…
        </div>
      </BriefShell>
    );
  }

  return (
    <BriefShell greetLine={greetLine} experienceMode={experienceMode} onChangeMode={onChangeMode}>
      {experienceMode === "seller" ? (
        <SellerBrief
          brief={brief}
          recById={recById}
          metrics={metrics}
          onBeginMission={onBeginMission}
          onOpenCommand={onOpenCommand}
          onOpenAccount={onOpenAccount}
        />
      ) : experienceMode === "operations" ? (
        <OperationsBrief brief={brief} onOpenCommand={onOpenCommand} />
      ) : (
        <ExecutiveBrief brief={brief} onOpenCommand={onOpenCommand} onOpenAccount={onOpenAccount} />
      )}
    </BriefShell>
  );
}

// ---------------------------------------------------------------------------
// Shell — greeting + persona switch. Keeps the three persona entries visually
// consistent while each body differs.

function BriefShell({
  greetLine,
  experienceMode,
  onChangeMode,
  children,
}: {
  greetLine: string;
  experienceMode: ExperienceMode;
  onChangeMode: (m: ExperienceMode) => void;
  children: React.ReactNode;
}) {
  return (
    <main className="scene mx-auto w-full max-w-[1040px] flex-1 px-4 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-bright">
            <Sparkles size={12} /> AI Chief of Staff
          </div>
          <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight text-ink">
            {greetLine}
          </h1>
          <p className="mt-0.5 text-[12px] text-muted">{MODE_DESCRIPTION[experienceMode]}</p>
        </div>
        <ExperienceModeSwitch value={experienceMode} onChange={onChangeMode} />
      </div>
      {children}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Seller — the AI Chief of Staff work briefing. One mission, one CTA, a calm
// queue below. Deliberately NOT a dashboard.

function SellerBrief({
  brief,
  recById,
  metrics,
  onBeginMission,
  onOpenCommand,
  onOpenAccount,
}: {
  brief: ReturnType<typeof morningBrief>;
  recById: Record<string, Recommendation>;
  metrics: MissionMetrics | null;
  onBeginMission: (accountId: string, recommendationId: string | null) => void;
  onOpenCommand: () => void;
  onOpenAccount: (accountId: string, source: string) => void;
}) {
  const top = brief.top;
  const conversations = brief.todayActions.length;
  const actionPlan = buildActionPlan(brief.todayActions);
  const topRec = top ? recById[top.accountId] ?? null : null;
  const topReason =
    top && top.accountId
      ? reasonForRecommendation(
          topRec ?? ({ action_type: top.action.key } as unknown as Recommendation),
          undefined,
        )
      : null;

  return (
    <div className="space-y-4">
      {/* Spoken-style summary line — focused on the current mission, not totals */}
      {conversations > 0 ? (
        <div className="space-y-2.5">
          <p className="text-[15px] leading-relaxed text-ink">
            Today we have{" "}
            <span className="font-semibold text-brand-bright">
              {conversations} customer conversation{conversations === 1 ? "" : "s"}
            </span>
            .
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {top ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/[0.08] px-2.5 py-1 text-[11.5px] font-medium text-ink">
                <Clock size={12} className="text-brand-bright" /> This mission: {MINUTES(top.estimatedMinutes)}
              </span>
            ) : null}
            {conversations > 1 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-surface2/50 px-2.5 py-1 text-[11.5px] text-muted">
                {conversations - 1} more mission{conversations - 1 === 1 ? "" : "s"} remain
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-[15px] leading-relaxed text-ink">
          Your book is calm today — no conversations require action right now.
        </p>
      )}

      {/* Action-oriented narrative — what today's work actually is, not analytics */}
      {actionPlan.length > 0 ? (
        <ul className="space-y-1 text-[13px] text-ink">
          {actionPlan.map((p) => (
            <li key={p.key} className="flex items-center gap-2">
              <span
                className={cx(
                  "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                  p.tone === "risk" ? "bg-risk" : p.tone === "opp" ? "bg-accent" : "bg-brand-bright",
                )}
              />
              <span className="font-medium">{p.text}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Today's first mission — the hero */}
      {top ? (
        <div className="rounded-2xl border border-brand/35 bg-gradient-to-br from-brand/[0.10] to-transparent p-5 shadow-glow-soft">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-bright">
            <Rocket size={12} /> Today's highest priority
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[22px] font-semibold leading-tight tracking-tight text-ink">
              {top.accountName}
            </span>
            {top.industry ? (
              <span className="rounded border border-edge bg-surface2 px-1.5 py-[1px] text-[10px] text-faint">
                {top.industry}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[13px] text-muted">
            Recommended action:{" "}
            <span className="font-semibold text-ink">{top.action.label}</span> · {top.timing}
          </p>
          {topReason ? (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{topReason.whyNow}</p>
          ) : null}
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onBeginMission(top.accountId, topRec?.recommendation_id ?? null)}
              className="btn btn-primary px-4 py-2 text-[13px]"
            >
              <Rocket size={14} /> Begin Today's Mission <ArrowRight size={14} />
            </button>
            <button
              type="button"
              onClick={() => onOpenAccount(top.accountId, "Morning Brief")}
              className="btn btn-ghost px-3 py-2 text-[12px]"
            >
              <ArrowUpRight size={13} /> Open account
            </button>
            <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-faint">
              <Clock size={11} /> ~{MINUTES(top.estimatedMinutes)}
            </span>
          </div>
        </div>
      ) : null}

      {/* Today's timeline — Now / Next / Later, not a numbered queue */}
      <MissionTimeline actions={brief.todayActions} recById={recById} onBeginMission={onBeginMission} />

      {/* Session footer + power-user escape hatch */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-3">
        <div className="flex items-center gap-4 text-[11px] text-faint">
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 size={12} className="text-accent" /> {metrics?.completed ?? 0} completed this session
          </span>
          {metrics && metrics.approvalsPending > 0 ? (
            <span className="inline-flex items-center gap-1 text-amber">
              <Clock size={12} /> {metrics.approvalsPending} approval{metrics.approvalsPending === 1 ? "" : "s"} pending
            </span>
          ) : null}
        </div>
        <button type="button" onClick={onOpenCommand} className="btn btn-ghost px-3 py-1.5 text-[11px]">
          <LayoutDashboard size={13} /> Command Center (power view)
        </button>
      </div>

      <p className="text-[10.5px] leading-relaxed text-faint">{brief.trustStatement}</p>
    </div>
  );
}

// Group today's actions into an outcome-oriented narrative ("Recover 1 customer,
// Prepare 2 renewals, Follow up on 2 opportunities") instead of raw KPIs.
// Purely a re-framing of the already-ranked action list — no re-ranking.
type ActionPlanLine = { key: string; text: string; tone: "risk" | "opp" | "neutral" };

function buildActionPlan(actions: BriefTodayAction[]): ActionPlanLine[] {
  let recover = 0;
  let renewal = 0;
  let opportunity = 0;
  let review = 0;
  for (const a of actions) {
    const k = a.action.key;
    if (k === "recover" || k === "winback") recover += 1;
    else if (k === "renewal") renewal += 1;
    else if (k === "crosssell" || k === "adoption" || k === "checkin") opportunity += 1;
    else review += 1; // review, manual_review, hold, generic
  }
  const lines: ActionPlanLine[] = [];
  if (recover > 0)
    lines.push({ key: "recover", tone: "risk", text: `Recover ${recover} customer${recover === 1 ? "" : "s"}` });
  if (renewal > 0)
    lines.push({ key: "renewal", tone: "neutral", text: `Prepare ${renewal} renewal${renewal === 1 ? "" : "s"}` });
  if (opportunity > 0)
    lines.push({
      key: "opportunity",
      tone: "opp",
      text: `Follow up on ${opportunity} opportunit${opportunity === 1 ? "y" : "ies"}`,
    });
  if (review > 0)
    lines.push({ key: "review", tone: "neutral", text: `Review ${review} account${review === 1 ? "" : "s"}` });
  return lines;
}

// Now / Next / Later timeline. NOW marks the active mission (rendered as the hero
// above), NEXT is the following mission, LATER is everything after.
function MissionTimeline({
  actions,
  recById,
  onBeginMission,
}: {
  actions: BriefTodayAction[];
  recById: Record<string, Recommendation>;
  onBeginMission: (accountId: string, recommendationId: string | null) => void;
}) {
  if (actions.length <= 1) return null;
  const now = actions[0];
  const next = actions[1] ?? null;
  const later = actions.slice(2);

  return (
    <div className="rounded-xl border border-edge bg-surface2/35 p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Today's timeline</span>
        <span className="text-[10px] text-faint">{actions.length} missions</span>
      </div>
      <div className="space-y-3">
        <TimelineBand label="Now" tone="now">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink">{now.accountName}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted">
                {now.action.label} · in focus · ~{MINUTES(now.estimatedMinutes)}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand-bright">
              Current
            </span>
          </div>
        </TimelineBand>

        {next ? (
          <TimelineBand label="Next" tone="next">
            <TimelineRow action={next} recById={recById} onBeginMission={onBeginMission} prominent />
          </TimelineBand>
        ) : null}

        {later.length > 0 ? (
          <TimelineBand label="Later" tone="later">
            <ul className="space-y-2">
              {later.map((a) => (
                <li key={a.accountId}>
                  <TimelineRow action={a} recById={recById} onBeginMission={onBeginMission} />
                </li>
              ))}
            </ul>
          </TimelineBand>
        ) : null}
      </div>
    </div>
  );
}

function TimelineBand({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "now" | "next" | "later";
  children: React.ReactNode;
}) {
  const dot =
    tone === "now" ? "bg-brand-bright ring-2 ring-brand/30" : tone === "next" ? "bg-accent" : "bg-faint";
  return (
    <div className="relative flex gap-3">
      <div className="flex w-12 shrink-0 flex-col items-start pt-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</span>
      </div>
      <div className="relative flex-1 border-l border-edge/70 pl-3.5">
        <span className={cx("absolute -left-[5px] top-1 inline-block h-2.5 w-2.5 rounded-full", dot)} />
        {children}
      </div>
    </div>
  );
}

function TimelineRow({
  action,
  recById,
  onBeginMission,
  prominent,
}: {
  action: BriefTodayAction;
  recById: Record<string, Recommendation>;
  onBeginMission: (accountId: string, recommendationId: string | null) => void;
  prominent?: boolean;
}) {
  const rec = recById[action.accountId] ?? null;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className={cx("truncate font-medium text-ink", prominent ? "text-[13px]" : "text-[12.5px]")}>
          {action.accountName}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted">
          {action.action.label} · ~{MINUTES(action.estimatedMinutes)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onBeginMission(action.accountId, rec?.recommendation_id ?? null)}
        className={cx(
          "shrink-0 px-2.5 py-1 text-[11px]",
          prominent ? "btn btn-outline-primary" : "btn btn-ghost",
        )}
      >
        Start <ArrowRight size={12} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Executive — "What changed?" Frames the same data as a leadership briefing and
// hands into the Command Center (their natural home).

function ExecutiveBrief({
  brief,
  onOpenCommand,
  onOpenAccount,
}: {
  brief: ReturnType<typeof morningBrief>;
  onOpenCommand: () => void;
  onOpenAccount: (accountId: string, source: string) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-[16px] font-semibold text-ink">Here's what changed overnight.</h2>
      {brief.whatChanged.length > 0 ? (
        <ul className="space-y-1.5 text-[13px] text-muted">
          {brief.whatChanged.map((c) => (
            <li key={c.key} className="flex items-start gap-2">
              <span
                className={cx(
                  "mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                  c.tone === "risk" ? "bg-risk" : c.tone === "opp" ? "bg-accent" : "bg-faint",
                )}
              />
              {c.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">No material changes across the portfolio overnight.</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {brief.biggestRisk ? (
          <FocusCard
            tone="risk"
            label="Biggest risk"
            account={brief.biggestRisk.accountName}
            why={brief.biggestRisk.why}
            action={brief.biggestRisk.recommendedAction}
            onOpen={() => onOpenAccount(brief.biggestRisk!.accountId, "Executive Brief")}
          />
        ) : null}
        {brief.biggestOpportunity ? (
          <FocusCard
            tone="opportunity"
            label="Biggest opportunity"
            account={brief.biggestOpportunity.accountName}
            why={brief.biggestOpportunity.why}
            action={brief.biggestOpportunity.recommendedAction}
            onOpen={() => onOpenAccount(brief.biggestOpportunity!.accountId, "Executive Brief")}
          />
        ) : null}
      </div>

      <div className="flex justify-end border-t border-edge pt-3">
        <button type="button" onClick={onOpenCommand} className="btn btn-primary px-4 py-2 text-[13px]">
          <LayoutDashboard size={14} /> Open Executive Command Center <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function FocusCard({
  tone,
  label,
  account,
  why,
  action,
  onOpen,
}: {
  tone: "risk" | "opportunity";
  label: string;
  account: string;
  why: string;
  action: string;
  onOpen: () => void;
}) {
  const isRisk = tone === "risk";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        "rounded-xl border p-3.5 text-left transition-colors",
        isRisk ? "border-risk/25 bg-risk/[0.06] hover:border-risk/45" : "border-accent/25 bg-accent/[0.06] hover:border-accent/45",
      )}
    >
      <div
        className={cx(
          "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
          isRisk ? "text-risk" : "text-accent",
        )}
      >
        {isRisk ? <AlertTriangle size={11} /> : <TrendingUp size={11} />} {label}
      </div>
      <div className="mt-1 text-[15px] font-semibold text-ink">{account}</div>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">{why}</p>
      <p className="mt-1.5 text-[12px] font-medium text-ink">{action}</p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Operations — "What needs attention?" Operational health snapshot + entry into
// the full technical surface.

function OperationsBrief({
  brief,
  onOpenCommand,
}: {
  brief: ReturnType<typeof morningBrief>;
  onOpenCommand: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-[16px] font-semibold text-ink">Here's operational health.</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Accounts analyzed" value={brief.analyzed} />
        <Stat label="Need attention" value={brief.attention} tone={brief.attention > 0 ? "warn" : undefined} />
        <Stat label="Today's actions" value={brief.todayActions.length} />
        <Stat label="Est. effort" value={MINUTES(brief.estimatedEffortMinutes)} />
      </div>
      {brief.whatChanged.length > 0 ? (
        <ul className="space-y-1.5 text-[12.5px] text-muted">
          {brief.whatChanged.map((c) => (
            <li key={c.key} className="flex items-start gap-2">
              <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-faint" />
              {c.text}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex justify-end border-t border-edge pt-3">
        <button type="button" onClick={onOpenCommand} className="btn btn-primary px-4 py-2 text-[13px]">
          <Gauge size={14} /> Open Operations Command Center <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-edge bg-surface2/40 p-3">
      <div className={cx("text-[20px] font-semibold tracking-tight", tone === "warn" ? "text-amber" : "text-ink")}>
        {value}
      </div>
      <div className="mt-0.5 text-[10.5px] uppercase tracking-wider text-faint">{label}</div>
    </div>
  );
}

function EmptyBrief({ onRun }: { onRun?: () => void }) {
  return (
    <div className="rounded-2xl border border-edge bg-surface2/40 p-8 text-center">
      <Sparkles size={20} className="mx-auto text-brand-bright" />
      <p className="mt-2 text-[14px] font-medium text-ink">Your briefing is ready to generate.</p>
      <p className="mt-1 text-[12px] text-muted">
        Run the analysis to see what changed and where to start today.
      </p>
      {onRun ? (
        <button type="button" onClick={onRun} className="btn btn-primary mt-4 px-4 py-2 text-[13px]">
          Generate briefing <ArrowRight size={14} />
        </button>
      ) : null}
    </div>
  );
}

