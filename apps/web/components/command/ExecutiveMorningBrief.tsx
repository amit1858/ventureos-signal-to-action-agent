"use client";

import * as React from "react";
import {
  RefreshCw,
  Play,
  ArrowRight,
  Crown,
  ShieldAlert,
  TrendingUp,
  Globe,
  Lock,
} from "lucide-react";
import type { Account, Recommendation } from "@/lib/types";
import { cx, timeAgo, titleCase } from "@/lib/format";
import {
  greetingText,
  morningBrief,
  resolveDisplayName,
  type BriefExternalContext,
  type BriefFocusAccount,
} from "@/lib/reasoning";
import { ThinkingSequence } from "@/components/ThinkingSequence";
import { GeneratedWithBadge } from "@/components/AIReasoningStatus";
import type { AIOverlay } from "@/lib/aiOverlay";
import type { PortfolioAgentReport } from "@/lib/types";

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
  portfolio,
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
  portfolio?: PortfolioAgentReport | null;
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
    <div className="card-elevated relative overflow-hidden p-4 animate-fade-in sm:p-5">
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

            <h1 className="mt-1.5 text-xl font-semibold leading-tight tracking-tight text-ink sm:text-2xl">
              {greeting}
              {name ? ` ${name}` : ""} <span aria-hidden>👋</span>
            </h1>
            {initialLoading ? (
              <div className="mt-3 max-w-md">
                <ThinkingSequence caption="Reviewing your portfolio overnight" />
              </div>
            ) : brief.hasResult ? (
              <>
                <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
                  I reviewed your portfolio overnight —{" "}
                  <span className="font-semibold text-ink">{brief.headline}</span>
                </p>
                {aiTopOverlay?.executive_summary ? (
                  <div className="mt-2.5 max-w-2xl rounded-lg border border-accent/25 bg-accent/[0.05] p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-accent">
                        Executive synthesis
                      </span>
                      <GeneratedWithBadge
                        provider={aiTopOverlay.provider}
                        model={aiTopOverlay.model}
                      />
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink">
                      {aiTopOverlay.executive_summary}
                    </p>
                  </div>
                ) : null}
                {portfolio ? (
                  <div className="mt-2.5 max-w-2xl rounded-lg border border-brand/25 bg-brand/[0.05] p-3">
                    <div className="flex items-center gap-1.5">
                      <Crown size={11} className="text-brand-bright" />
                      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand-bright">
                        AI Chief of Staff · Portfolio Agent
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink">
                      {portfolio.executive_summary}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-faint">
                      Scope: {portfolio.analysis_scope_count} accounts · deterministic
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
                Connect a data source and run the analysis to generate today&apos;s portfolio briefing.
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-wider text-faint">Last sync</div>
              <div className="text-[12px] font-medium text-ink">{lastSync ? timeAgo(lastSync) : "—"}</div>
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
          <div className="mt-5 grid gap-3 border-t border-edge pt-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <section className="rounded-xl border border-brand/25 bg-brand/[0.07] px-4 py-3">
                <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-faint">Executive summary</div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink">{brief.headline}</p>
                {portfolio?.executive_summary ? (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{portfolio.executive_summary}</p>
                ) : null}
              </section>

              <section className="grid gap-2 sm:grid-cols-2">
                <FocusCard kind="risk" focus={brief.biggestRisk} onOpenAccount={onOpenAccount} />
                <FocusCard kind="opportunity" focus={brief.biggestOpportunity} onOpenAccount={onOpenAccount} />
              </section>

              {brief.oneThing ? (
                <section className="rounded-xl border border-edge bg-surface2/40 px-3 py-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand/40 bg-brand/15 text-brand-bright">
                      <Crown size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-faint">If you do one thing today</div>
                      <div className="mt-0.5 text-[13px] font-semibold text-ink">{brief.oneThing.lead}.</div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{brief.oneThing.text}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenAccount(brief.oneThing!.accountId)}
                      className="btn btn-ghost shrink-0 self-center px-2.5 py-1 text-[11px]"
                    >
                      Open <ArrowRight size={12} />
                    </button>
                  </div>
                </section>
              ) : null}

              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-faint">
                <Lock size={12} className="mt-0.5 shrink-0" />
                <span>{brief.trustStatement}</span>
              </p>
            </div>

            {/* Chief of Staff / Portfolio agent detail on the right */}
            {portfolio ? (
              <aside className="rounded-xl border border-brand/20 bg-brand/[0.05] p-3 self-start">
                <div className="flex items-center gap-1.5">
                  <Crown size={11} className="text-brand-bright" />
                  <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-brand-bright">
                    AI Chief of Staff
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink">{portfolio.executive_summary}</p>
                {portfolio.resource_allocation ? (
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{portfolio.resource_allocation}</p>
                ) : null}
                {portfolio.biggest_risk || portfolio.biggest_opportunity ? (
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {portfolio.biggest_risk ? (
                      <div className="rounded-lg border border-risk/20 bg-risk/[0.05] p-2">
                        <div className="flex items-center gap-1 text-[9px] font-semibold uppercase text-risk">
                          <ShieldAlert size={9} /> Risk
                        </div>
                        <div className="mt-0.5 text-[11px] font-medium text-ink">{portfolio.biggest_risk.account_name}</div>
                        <div className="mt-0.5 text-[9px] text-faint">{portfolio.biggest_risk.calculation_source}</div>
                      </div>
                    ) : null}
                    {portfolio.biggest_opportunity ? (
                      <div className="rounded-lg border border-accent/20 bg-accent/[0.05] p-2">
                        <div className="flex items-center gap-1 text-[9px] font-semibold uppercase text-accent">
                          <TrendingUp size={9} /> Opportunity
                        </div>
                        <div className="mt-0.5 text-[11px] font-medium text-ink">{portfolio.biggest_opportunity.account_name}</div>
                        <div className="mt-0.5 text-[9px] text-faint">{portfolio.biggest_opportunity.calculation_source}</div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {portfolio.daily_plan?.one_thing_today ? (
                  <div className="mt-2 rounded-lg border border-edge bg-bg/40 px-2.5 py-2">
                    <div className="text-[9px] uppercase tracking-wider text-faint">One thing today</div>
                    <div className="mt-0.5 text-[11px] font-semibold text-ink">
                      {portfolio.daily_plan.one_thing_today.account_name} · {portfolio.daily_plan.one_thing_today.recommended_action}
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted">{portfolio.daily_plan.one_thing_today.expected_outcome}</p>
                  </div>
                ) : null}
                <p className="mt-2 text-[9px] leading-relaxed text-faint">
                  Scope: {portfolio.analysis_scope_count} accounts · deterministic
                </p>
              </aside>
            ) : null}
          </div>
        ) : !initialLoading ? (
          <div className="mt-5 flex items-center gap-2 border-t border-edge pt-4 text-sm text-muted">
            <Crown size={14} className="text-faint" />
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
      <div className={cx("rounded-xl border bg-surface2/40 p-3", accent.ring)}>
        <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold", accent.chip)}>
          <Icon size={10} /> {accent.label}
        </span>
        <p className="mt-2 text-[11px] text-faint">
          {isRisk
            ? "No account is showing acute risk among today's priorities."
            : "No standout expansion play among today's priorities."}
        </p>
      </div>
    );
  }

  return (
    <div className={cx("flex flex-col rounded-xl border bg-surface2/40 p-3", accent.ring)}>
      <span className={cx("inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold", accent.chip)}>
        <Icon size={10} /> {accent.label}
      </span>

      <div className="mt-2 min-w-0">
        <div className="truncate text-[13px] font-semibold text-ink">
          {focus.accountName}
          {focus.industry ? <span className="font-normal text-faint"> · {titleCase(focus.industry)}</span> : null}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{focus.why}</p>
      </div>

      {focus.externalContext ? (
        <div className="mt-2 rounded-lg border border-edge bg-bg/40 p-2">
          <div className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-faint">
            <Globe size={9} /> External · supporting
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{focus.externalContext}</p>
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-edge/70 pt-2">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-wider text-faint">Action</div>
          <div className={cx("truncate text-[11px] font-semibold", focus.action.tone)}>{focus.recommendedAction}</div>
        </div>
        <button
          type="button"
          onClick={() => onOpenAccount(focus.accountId)}
          className="btn btn-ghost shrink-0 px-2.5 py-1 text-[11px]"
        >
          Open <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}
