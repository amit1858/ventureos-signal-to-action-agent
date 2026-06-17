"use client";

import * as React from "react";
import {
  RefreshCw,
  Play,
  ArrowRight,
  Crown,
  Clock,
  ShieldAlert,
  TrendingUp,
  Globe,
  Lock,
  ClipboardList,
} from "lucide-react";
import type { Account, Recommendation } from "@/lib/types";
import { cx, inrCompact, timeAgo, titleCase } from "@/lib/format";
import {
  greetingText,
  morningBrief,
  resolveDisplayName,
  type BriefChange,
  type BriefExternalContext,
  type BriefFocusAccount,
  type BriefTodayAction,
} from "@/lib/reasoning";
import { Counter } from "@/components/Counter";
import { ThinkingSequence } from "@/components/ThinkingSequence";
import { GeneratedWithBadge } from "@/components/AIReasoningStatus";
import type { AIOverlay } from "@/lib/aiOverlay";

// Phase 4.3 · Executive Morning Brief — the portfolio-level "AI Chief of Staff"
// opening memo. It answers "what should I do today across my whole book?" using
// the deterministic reasoning layer: what changed overnight, the single biggest
// risk and opportunity, a ranked action plan with timing + effort, the one thing
// to do if nothing else, the advisory CRM updates that would follow approval, and
// a standing trust statement. Outside-in context (when enabled) is folded in as
// supporting colour only — it never changes ranking, scoring or governance.
export function ExecutiveMorningBrief({
  accounts,
  accountsById,
  recs,
  hasResult,
  loading,
  dataSourceLabel,
  isHubspotSource,
  lastSync,
  externalEnabled = false,
  externalContext,
  aiTopOverlay,
  onRun,
  onOpenAccount,
}: {
  accounts: Account[];
  accountsById: Record<string, Account>;
  recs: Recommendation[];
  hasResult: boolean;
  loading: boolean;
  dataSourceLabel: string;
  isHubspotSource: boolean;
  lastSync: string | null;
  externalEnabled?: boolean;
  externalContext?: Record<string, BriefExternalContext>;
  aiTopOverlay?: AIOverlay | null;
  onRun: () => void;
  onOpenAccount: (accountId: string) => void;
}) {
  const brief = morningBrief(accounts, accountsById, recs, hasResult, {
    externalEnabled,
    externalContext,
  });

  // Greeting + name depend on the user's local time and a local-only profile,
  // so resolve them after mount to avoid any SSR hydration mismatch.
  const [greeting, setGreeting] = React.useState("Your portfolio briefing");
  const [name, setName] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    setGreeting(greetingText(new Date()));
    setName(resolveDisplayName());
  }, []);

  const initialLoading = loading && !hasResult;

  return (
    <div className="card-elevated relative overflow-hidden p-6 animate-fade-in sm:p-8 lg:p-10">
      <div className="grid-dots pointer-events-none absolute inset-0 opacity-[0.12]" />
      <span
        className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-brand via-brand/50 to-transparent"
        aria-hidden
      />

      <div className="relative">
        {/* Header — greeting, overnight-review line, run controls */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand shadow-glow" />
              </span>
              <span className="section-label text-faint">Executive Morning Brief</span>
              <span
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  isHubspotSource
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-brand/40 bg-brand/10 text-brand-bright",
                )}
              >
                {dataSourceLabel}
              </span>
              {externalEnabled ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-edge bg-surface2/60 px-2 py-0.5 text-[10px] font-medium text-faint"
                  title="Outside-in external context is folded in as supporting colour only."
                >
                  <Globe size={10} /> External context on
                </span>
              ) : null}
            </div>

            <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-[28px]">
              {greeting}
              {name ? ` ${name}` : ""} <span aria-hidden>👋</span>
            </h1>
            {initialLoading ? (
              <div className="mt-4 max-w-md">
                <ThinkingSequence caption="Reviewing your portfolio overnight" />
              </div>
            ) : brief.hasResult ? (
              <>
                <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">
                  I reviewed your portfolio overnight —{" "}
                  <span className="font-semibold text-ink">{brief.headline}</span>
                </p>
                {aiTopOverlay?.executive_summary ? (
                  <div className="mt-3 max-w-2xl rounded-xl border border-accent/25 bg-accent/[0.05] p-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                        Executive synthesis
                      </span>
                      <GeneratedWithBadge
                        provider={aiTopOverlay.provider}
                        model={aiTopOverlay.model}
                      />
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink">
                      {aiTopOverlay.executive_summary}
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">
                Connect a data source and run the analysis to generate today&apos;s portfolio briefing.
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-faint">Last sync</div>
              <div className="text-sm font-medium text-ink">{lastSync ? timeAgo(lastSync) : "—"}</div>
            </div>
            <button
              type="button"
              onClick={onRun}
              disabled={loading}
              className={cx("btn btn-primary px-4", loading && "opacity-70")}
            >
              {loading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Analyzing…
                </>
              ) : hasResult ? (
                <>
                  <RefreshCw size={14} /> Re-run
                </>
              ) : (
                <>
                  <Play size={14} /> Run analysis
                </>
              )}
            </button>
          </div>
        </div>

        {!initialLoading && brief.hasResult ? (
          <div className="mt-7 space-y-7 border-t border-edge pt-7">
            {/* 1 · What changed overnight */}
            <section>
              <BriefHeading>What changed overnight</BriefHeading>
              <div className="mt-4 flex flex-wrap gap-x-10 gap-y-5">
                <BriefStat label="Accounts analyzed" tone="text-ink">
                  <Counter value={brief.analyzed} />
                </BriefStat>
                <BriefStat label="Require attention" tone="text-amber">
                  <Counter value={brief.attention} />
                </BriefStat>
                <BriefStat label="Revenue at risk" tone="text-risk">
                  <Counter value={brief.revenueAtRisk} format={inrCompact} />
                </BriefStat>
                <BriefStat label="Growth opportunity" tone="text-accent">
                  <Counter value={brief.growthOpportunity} format={inrCompact} />
                </BriefStat>
              </div>
              {brief.whatChanged.length > 0 ? (
                <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                  {brief.whatChanged.map((c) => (
                    <ChangeRow key={c.key} change={c} />
                  ))}
                </ul>
              ) : null}
            </section>

            {/* 2 · Biggest risk + biggest opportunity */}
            <section className="grid gap-4 lg:grid-cols-2">
              <FocusCard kind="risk" focus={brief.biggestRisk} onOpenAccount={onOpenAccount} />
              <FocusCard kind="opportunity" focus={brief.biggestOpportunity} onOpenAccount={onOpenAccount} />
            </section>

            {/* 3 · What should I do today */}
            {brief.todayActions.length > 0 ? (
              <section>
                <div className="flex items-center justify-between gap-3">
                  <BriefHeading>What I&apos;d do today</BriefHeading>
                  <button
                    type="button"
                    onClick={() =>
                      document
                        .getElementById("todays-priorities")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    className="text-[11px] font-medium text-brand-bright hover:underline"
                  >
                    See all priorities <ArrowRight size={11} className="inline" />
                  </button>
                </div>
                <ol className="mt-4 space-y-2.5">
                  {brief.todayActions.map((a) => (
                    <TodayActionRow key={a.accountId} action={a} onOpenAccount={onOpenAccount} />
                  ))}
                </ol>
              </section>
            ) : null}

            {/* 4 · If you do only one thing */}
            {brief.oneThing ? (
              <section className="rounded-2xl border border-brand/25 bg-brand/[0.07] p-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand/40 bg-brand/15 text-brand-bright">
                    <Crown size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-wider text-faint">If you do only one thing today</div>
                    <div className="mt-1 text-[15px] font-semibold text-ink">{brief.oneThing.lead}.</div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{brief.oneThing.text}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenAccount(brief.oneThing!.accountId)}
                    className="btn btn-ghost shrink-0 self-center px-3 py-1.5 text-xs"
                  >
                    Open <ArrowRight size={13} />
                  </button>
                </div>
              </section>
            ) : null}

            {/* 5 · Effort · suggested CRM updates · trust */}
            <section className="flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-edge pt-6">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-surface2/60 text-faint">
                  <Clock size={14} />
                </span>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-faint">Estimated effort today</div>
                  <div className="text-sm font-semibold text-ink">{effortLabel(brief.estimatedEffortMinutes)}</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-surface2/60 text-faint">
                  <ClipboardList size={14} />
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-faint">Suggested CRM updates</div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-ink">
                    <CrmCount n={brief.suggestedCrmUpdates.tasks} singular="task" plural="tasks" />
                    <CrmCount n={brief.suggestedCrmUpdates.notes} singular="note" plural="notes" />
                    <CrmCount n={brief.suggestedCrmUpdates.followups} singular="follow-up" plural="follow-ups" />
                    <span className="text-[11px] font-normal text-faint">· generated, awaiting approval</span>
                  </div>
                </div>
              </div>
            </section>

            {/* 6 · Trust + governance */}
            <p className="flex items-start gap-2 text-[12px] leading-relaxed text-faint">
              <Lock size={13} className="mt-0.5 shrink-0" />
              <span>{brief.trustStatement}</span>
            </p>
          </div>
        ) : !initialLoading ? (
          <div className="mt-6 flex items-center gap-2 border-t border-edge pt-6 text-sm text-muted">
            <Crown size={15} className="text-faint" />
            Run the analysis to surface your portfolio briefing — biggest risk, biggest opportunity and today&apos;s plan.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function effortLabel(min: number): string {
  if (min <= 0) return "—";
  if (min >= 60) return `~${(min / 60).toFixed(1)} hours`;
  return `~${min} min`;
}

function BriefHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">{children}</h3>;
}

function ChangeRow({ change }: { change: BriefChange }) {
  const dot =
    change.tone === "risk" ? "bg-risk" : change.tone === "opp" ? "bg-accent" : "bg-cyan";
  return (
    <li className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted">
      <span className={cx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dot)} aria-hidden />
      <span>{change.text}</span>
    </li>
  );
}

function FocusCard({
  kind,
  focus,
  onOpenAccount,
}: {
  kind: "risk" | "opportunity";
  focus: BriefFocusAccount | null;
  onOpenAccount: (accountId: string) => void;
}) {
  const isRisk = kind === "risk";
  const accent = isRisk
    ? { ring: "border-risk/30", chip: "border-risk/40 bg-risk/10 text-risk", icon: ShieldAlert, label: "Biggest risk" }
    : {
        ring: "border-accent/30",
        chip: "border-accent/40 bg-accent/10 text-accent",
        icon: TrendingUp,
        label: "Biggest opportunity",
      };
  const Icon = accent.icon;

  if (!focus) {
    return (
      <div className={cx("rounded-2xl border bg-surface2/40 p-5", accent.ring)}>
        <div className="flex items-center gap-2">
          <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", accent.chip)}>
            <Icon size={11} /> {accent.label}
          </span>
        </div>
        <p className="mt-3 text-[13px] text-faint">
          {isRisk
            ? "No account is showing acute risk among today's priorities."
            : "No standout expansion play among today's priorities."}
        </p>
      </div>
    );
  }

  return (
    <div className={cx("flex flex-col rounded-2xl border bg-surface2/40 p-5", accent.ring)}>
      <div className="flex items-center justify-between gap-2">
        <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", accent.chip)}>
          <Icon size={11} /> {accent.label}
        </span>
      </div>

      <div className="mt-3 min-w-0">
        <div className="truncate text-[15px] font-semibold text-ink">
          {focus.accountName}
          {focus.industry ? <span className="font-normal text-faint"> · {titleCase(focus.industry)}</span> : null}
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{focus.why}</p>
      </div>

      {focus.externalContext ? (
        <div className="mt-3 rounded-xl border border-edge bg-bg/40 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-faint">
            <Globe size={10} /> External context · supporting
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">{focus.externalContext}</p>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-edge/70 pt-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-faint">Recommended action</div>
          <div className={cx("truncate text-[13px] font-semibold", focus.action.tone)}>{focus.recommendedAction}</div>
        </div>
        <button
          type="button"
          onClick={() => onOpenAccount(focus.accountId)}
          className="btn btn-ghost shrink-0 px-3 py-1.5 text-xs"
        >
          Open <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

function TodayActionRow({
  action,
  onOpenAccount,
}: {
  action: BriefTodayAction;
  onOpenAccount: (accountId: string) => void;
}) {
  const Icon = action.action.icon;
  return (
    <li className="group flex items-start gap-3 rounded-xl border border-edge bg-surface2/40 px-4 py-3 transition-colors hover:border-brand/30">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-edge bg-bg/50 font-mono text-[11px] font-semibold text-faint">
        {action.rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-ink">{action.accountName}</span>
          {action.industry ? <span className="text-[11px] text-faint">· {titleCase(action.industry)}</span> : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]">
          <span className={cx("inline-flex items-center gap-1 font-semibold", action.action.tone)}>
            <Icon size={12} /> {action.action.label}
          </span>
          <span className="text-faint">· {action.timing}</span>
          <span className="inline-flex items-center gap-1 text-faint">
            <Clock size={10} /> ~{action.estimatedMinutes} min
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          {action.reason}. <span className="text-faint">{action.expectedOutcome}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => onOpenAccount(action.accountId)}
        className="btn btn-ghost shrink-0 self-center px-2.5 py-1.5 text-xs opacity-0 transition-opacity group-hover:opacity-100"
        aria-label={`Open ${action.accountName}`}
      >
        <ArrowRight size={13} />
      </button>
    </li>
  );
}

function CrmCount({ n, singular, plural }: { n: number; singular: string; plural: string }) {
  return (
    <span>
      <span className="font-mono">{n}</span> {n === 1 ? singular : plural}
    </span>
  );
}

function BriefStat({
  label,
  tone,
  children,
}: {
  label: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-faint">{label}</div>
      <div className={cx("mt-2 font-mono text-[22px] font-semibold leading-none sm:text-[24px]", tone)}>{children}</div>
    </div>
  );
}
