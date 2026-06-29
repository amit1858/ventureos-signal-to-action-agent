"use client";

import * as React from "react";
import {
  ArrowRight,
  ShieldAlert,
  TrendingUp,
  Lock,
  Clock,
  Sparkles,
  ChevronDown,
  Crown,
  RefreshCw,
} from "lucide-react";
import type {
  Account,
  MetaResponse,
  PortfolioAgentReport,
  Recommendation,
} from "@/lib/types";
import { cx, timeAgo } from "@/lib/format";
import {
  greetingKind,
  greetingText,
  morningBrief,
  resolveDisplayName,
  type BriefChange,
  type BriefExternalContext,
  type BriefTodayAction,
} from "@/lib/reasoning";
import { ThinkingSequence } from "@/components/ThinkingSequence";
import { ConfidenceExplain } from "@/components/ConfidenceExplain";
import { Sparkline } from "@/components/Sparkline";
import { LandingView } from "@/components/landing/LandingView";

// Release 1.4A — Premium Morning Brief landing.
//
// The emotional entry point to the product. Before any widgets, the executive
// is met by a calm, focused brief from their AI Chief of Staff: what changed
// since they were last here, where to spend their attention today, how much
// focus it will take, and a single confident way to begin. Skipping straight
// into the workspace is always one click away. Presentation only — it reads the
// deterministic reasoning layer and never alters ranking, scoring, or governance.

function focusTimeLabel(min: number): string {
  if (min <= 0) return "a few minutes";
  if (min >= 60) {
    const h = min / 60;
    return `about ${h.toFixed(h >= 10 || Number.isInteger(h) ? 0 : 1)} hour${h >= 2 ? "s" : ""}`;
  }
  return `${min} minutes`;
}

function changeDot(tone: BriefChange["tone"]): string {
  if (tone === "risk") return "bg-amber";
  if (tone === "opp") return "bg-accent";
  return "bg-faint";
}

export function ExecutiveMorningLanding({
  meta,
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
  portfolio,
  recommendationCount,
  onRun,
  onEnter,
  onOpenWorkspace,
  onOpenAccount,
}: {
  meta: MetaResponse | null;
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
  portfolio?: PortfolioAgentReport | null;
  recommendationCount: number;
  onRun: () => void;
  onEnter: () => void;
  onOpenWorkspace: () => void;
  onOpenAccount: (accountId: string) => void;
}) {
  const brief = React.useMemo(
    () => morningBrief(accounts, accountsById, recs, hasResult, { externalEnabled, externalContext }),
    [accounts, accountsById, recs, hasResult, externalEnabled, externalContext],
  );

  // Greeting + name depend on local time / a local-only profile, so resolve
  // after mount to avoid any SSR hydration mismatch.
  const [greeting, setGreeting] = React.useState("Welcome back");
  const [kind, setKind] = React.useState("welcome");
  const [name, setName] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    const now = new Date();
    setGreeting(greetingText(now));
    setKind(greetingKind(now));
    setName(resolveDisplayName());
  }, []);

  // Prepare the brief once on entry, if the portfolio hasn't been analysed yet.
  const preparedRef = React.useRef(false);
  React.useEffect(() => {
    if (preparedRef.current) return;
    if (hasResult || loading || accounts.length === 0) return;
    preparedRef.current = true;
    onRun();
  }, [hasResult, loading, accounts.length, onRun]);

  const [showTour, setShowTour] = React.useState(false);

  const recsById = React.useMemo(() => {
    const m: Record<string, Recommendation> = {};
    for (const r of recs) m[r.account_id] = r;
    return m;
  }, [recs]);

  const focus: BriefTodayAction[] = brief.todayActions.slice(0, 3);
  const preparing = loading && !hasResult;
  const greetingName = name ? `${greeting}, ${name}.` : `${greeting}.`;
  const timeWord = kind === "morning" ? "today" : kind === "evening" ? "this evening" : "today";

  return (
    <main className="relative mx-auto w-full max-w-[1080px] flex-1 px-5 pb-24 pt-12 sm:pt-16">
      <div className="grid-dots pointer-events-none absolute inset-x-0 top-0 h-[460px] opacity-[0.08]" aria-hidden />

      {/* ----------------------------------------------------------- GREETING */}
      <header className="relative">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span className="breathe absolute inline-flex h-full w-full rounded-full bg-brand/50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand shadow-glow" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
            AI Chief of Staff
          </span>
          <span className="text-faint">·</span>
          <span className="text-[11px] tracking-wide text-faint">
            Watching your portfolio overnight
          </span>
        </div>

        <h1 className="mt-4 text-balance text-3xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-[44px]">
          {greetingName}
        </h1>
        <p className="mt-3 max-w-2xl text-balance text-[15px] leading-relaxed text-muted sm:text-base">
          I&apos;ve reviewed your book of accounts. Here&apos;s what moved, where I&apos;d spend
          your attention {timeWord}, and how confident I am — so you can decide quickly.
        </p>
      </header>

      {/* --------------------------------------------------- SINCE LAST SESSION */}
      <section className="reveal-stagger mt-9" style={{ animationDelay: "60ms" }}>
        <div className="card-premium relative overflow-hidden p-5 sm:p-6">
          <span
            className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-brand via-brand/50 to-transparent"
            aria-hidden
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">
              Since your last session
            </div>
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-faint/70">
              Executive entry
            </span>
          </div>

          {preparing ? (
            <div className="mt-4 max-w-md">
              <ThinkingSequence caption="Reviewing your portfolio overnight" />
            </div>
          ) : brief.whatChanged.length > 0 ? (
            <ul className="mt-4 space-y-2.5">
              {brief.whatChanged.map((c, i) => (
                <li
                  key={c.key}
                  className="reveal-stagger flex items-start gap-3 text-[14px] leading-relaxed text-ink"
                  style={{ animationDelay: `${120 + i * 70}ms` }}
                >
                  <span className={cx("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", changeDot(c.tone))} />
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[14px] leading-relaxed text-muted">
              Nothing urgent moved overnight. Your portfolio is steady — a good day to invest in
              the relationships that compound.
            </p>
          )}

          {portfolio?.executive_summary ? (
            <p className="mt-4 border-t border-edge/70 pt-3 text-[12.5px] leading-relaxed text-muted">
              <span className="font-medium text-ink">My read:</span> {portfolio.executive_summary}
            </p>
          ) : null}
        </div>
      </section>

      {/* ------------------------------------------------- RECOMMENDED FOCUS */}
      {!preparing && focus.length > 0 ? (
        <section className="reveal-stagger mt-6" style={{ animationDelay: "140ms" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">
              Where I&apos;d focus {timeWord}
            </h2>
            <span className="text-[11px] text-faint">
              {focus.length} of {brief.todayActions.length || focus.length} priorities
            </span>
          </div>

          <ol className="mt-3 space-y-2.5">
            {focus.map((a, i) => {
              const rec = recsById[a.accountId];
              const account = accountsById[a.accountId];
              const isOpp = a.action.urgency === "opportunity";
              return (
                <li
                  key={a.accountId}
                  className="reveal-stagger group flex items-center gap-4 rounded-xl border border-edge bg-surface/70 p-3.5 transition-colors hover:border-brand/35 sm:p-4"
                  style={{ animationDelay: `${180 + i * 80}ms` }}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge bg-surface2 font-mono text-[15px] font-semibold text-brand-bright">
                    {i + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-[15px] font-semibold text-ink">
                        {a.accountName}
                      </span>
                      <span
                        className={cx(
                          "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                          a.action.ring,
                          a.action.bg,
                          a.action.tone,
                        )}
                      >
                        {isOpp ? <TrendingUp size={9} /> : <ShieldAlert size={9} />}
                        {a.action.urgencyLabel}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[12.5px] leading-relaxed text-muted">
                      {a.reason}
                    </p>
                  </div>

                  <div className="hidden shrink-0 items-center gap-3 sm:flex">
                    <Sparkline seed={a.accountId} trend={isOpp ? "up" : "down"} tone={isOpp ? "opp" : "risk"} className="opacity-80" />
                    {rec ? <ConfidenceExplain rec={rec} account={account} align="right" /> : null}
                    <span className="inline-flex items-center gap-1 text-[11px] text-faint">
                      <Clock size={11} /> {a.estimatedMinutes}m
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenAccount(a.accountId)}
                    className="btn btn-ghost shrink-0 px-2.5 py-1.5 text-[12px]"
                    aria-label={`Open ${a.accountName}`}
                  >
                    Open <ArrowRight size={13} />
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {/* ----------------------------------------------------- FOCUS + BEGIN */}
      <section className="reveal-stagger mt-8" style={{ animationDelay: "220ms" }}>
        <div className="card-elevated flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <Stat
              label="Need your attention"
              value={preparing ? "—" : String(brief.attention)}
              hint={brief.attention === 1 ? "account" : "accounts"}
            />
            <Stat
              label="Estimated focus"
              value={preparing ? "—" : focusTimeLabel(brief.estimatedEffortMinutes)}
              hint={preparing ? "preparing" : "to clear today's priorities"}
              wide
            />
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenWorkspace}
              className="btn btn-ghost px-4 py-2.5 text-[13px] font-medium"
            >
              Skip to workspace
            </button>
            <button
              type="button"
              onClick={onEnter}
              className="btn btn-primary sheen px-5 py-2.5 text-[13px] font-semibold"
            >
              {preparing ? (
                <>
                  <RefreshCw size={15} className="animate-spin" /> Preparing your brief…
                </>
              ) : (
                <>
                  <Crown size={15} /> Begin your day <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-[11.5px] leading-relaxed text-faint">
          <Lock size={12} className="shrink-0" />
          {brief.trustStatement}
        </p>
      </section>

      {/* ------------------------------------------------------ PLATFORM TOUR */}
      <section className="mt-12 border-t border-edge/70 pt-6">
        <button
          type="button"
          onClick={() => setShowTour((v) => !v)}
          aria-expanded={showTour}
          className="mx-auto flex items-center gap-2 text-[12px] font-medium text-faint transition-colors hover:text-muted"
        >
          <Sparkles size={13} />
          {showTour ? "Hide the platform tour" : "New here? Tour the platform"}
          <ChevronDown size={13} className={cx("transition-transform", showTour && "rotate-180")} />
        </button>

        {showTour ? (
          <div className="mt-6 animate-fade-in">
            <LandingView
              meta={meta}
              recommendationCount={recommendationCount}
              isHubspotSource={isHubspotSource}
              dataSourceLabel={dataSourceLabel}
              onEnter={onEnter}
              onOpenWorkspace={onOpenWorkspace}
              hideHero
            />
          </div>
        ) : null}
      </section>

      {lastSync ? (
        <p className="mt-8 text-center text-[10.5px] uppercase tracking-[0.14em] text-faint">
          Portfolio last synced {timeAgo(lastSync)}
        </p>
      ) : null}
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
  wide = false,
}: {
  label: string;
  value: string;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "min-w-0" : ""}>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-faint">{label}</div>
      <div className="mt-1 text-[19px] font-semibold leading-tight text-ink">{value}</div>
      {hint ? <div className="text-[11px] text-faint">{hint}</div> : null}
    </div>
  );
}
