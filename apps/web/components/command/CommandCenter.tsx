"use client";

import * as React from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  FileText,
  Globe,
  ListChecks,
  Mail,
  MessageSquare,
  ShieldAlert,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import type {
  Account,
  MetaResponse,
  PortfolioAgentReport,
  Recommendation,
  RecommendationResponse,
  HubspotStatus,
  HubspotWriteback,
} from "@/lib/types";
import { businessAction } from "@/lib/actions";
import { morningBrief, reasonForRecommendation, type BriefExternalContext } from "@/lib/reasoning";
import { cx, inrCompact, pct, titleCase } from "@/lib/format";
import { growthOpportunity, countAttention, revenueAtRisk, spendChangePct } from "@/lib/portfolio";
import { useReveal } from "@/lib/useReveal";
import { PortfolioHealthCard } from "@/components/command/PortfolioHealthCard";
import { PortfolioMatrix } from "@/components/command/PortfolioMatrix";
import { PriorityAccountsTable } from "@/components/command/PriorityAccountsTable";
import { AiInsightsPanel } from "@/components/command/AiInsightsPanel";
import { LivePortfolioDriftPanel } from "@/components/command/LivePortfolioDriftPanel";
import { PortfolioPulseBar, DriftAcknowledgementLine } from "@/components/command/PortfolioPulseBar";
import {
  RecommendationDeltaCompact,
  RecommendationDeltaLog,
} from "@/components/command/RecommendationDeltaLog";
import {
  ingestRecommendations,
  loadDeltas,
  type RecommendationDelta,
} from "@/lib/recommendationDelta";
import dynamic from "next/dynamic";

// Phase 14C — Timeline surfaces. Heavy-ish, lazy-loaded so the home page's
// First Load JS stays inside the program budget.
const AccountTimeline = dynamic(
  () => import("@/components/command/AccountTimeline").then((m) => m.AccountTimeline),
  { ssr: false, loading: () => <div className="rounded-lg border border-edge bg-surface2/40 px-3 py-4 text-[11.5px] text-muted">Loading timeline…</div> },
);
const ReasoningTrail = dynamic(
  () => import("@/components/command/AccountTimeline").then((m) => m.ReasoningTrail),
  { ssr: false, loading: () => null },
);
const RecommendationSeverityBadge = dynamic(
  () => import("@/components/command/AccountTimeline").then((m) => m.RecommendationSeverityBadge),
  { ssr: false, loading: () => null },
);
const WhyRecommendationChanged = dynamic(
  () => import("@/components/command/AccountTimeline").then((m) => m.WhyRecommendationChanged),
  { ssr: false, loading: () => null },
);
const RecommendationEvolutionPanel = dynamic(
  () => import("@/components/command/AccountTimeline").then((m) => m.RecommendationEvolutionPanel),
  { ssr: false, loading: () => null },
);
const ExecutiveChangeBriefPanel = dynamic(
  () => import("@/components/command/ExecutiveChangeBrief").then((m) => m.ExecutiveChangeBriefPanel),
  { ssr: false, loading: () => null },
);
const PortfolioTimeline = dynamic(
  () => import("@/components/command/ExecutiveChangeBrief").then((m) => m.PortfolioTimeline),
  { ssr: false, loading: () => null },
);
import { LiveWorkflowRail } from "@/components/command/LiveWorkflowRail";
import { AIEnhancedBanner } from "@/components/AIReasoningStatus";
import type { AIOverlayMap } from "@/lib/aiOverlay";
import {
  LIFECYCLE_LABEL,
  LIFECYCLE_ORDER,
  OUTCOME_LABEL,
  appendLedgerEntry,
  lifecycleFor,
  listLedger,
  listLedgerForAccount,
  recordOutcome,
  subscribeLedger,
  summarize,
  type LedgerEntry,
  type LifecycleState,
  type OutcomeKind,
} from "@/lib/decisionLedger";

function useZoneOpen(id: string, defaultOpen: boolean): [boolean, () => void] {
  const key = `s2a_zone_${id}`;
  const [open, setOpen] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const stored = window.localStorage.getItem(key);
    return stored !== null ? stored === "true" : defaultOpen;
  });
  const toggle = React.useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(key, String(next));
      } catch {
        // best effort only
      }
      return next;
    });
  }, [key]);
  return [open, toggle];
}

type QueueRow = {
  recommendation: Recommendation;
  account?: Account;
  rank: number;
  action: string;
  risk: "High" | "Medium" | "Low";
  minutes: number;
  evidence: number;
  whyNow: string;
  expectedOutcome: string;
};

export function CommandCenter({
  meta,
  accounts,
  accountsById,
  result,
  loading,
  hubStatus,
  writebacks,
  selectedId,
  dataSourceLabel,
  isHubspotSource,
  externalSignalsEnabled = false,
  externalContext,
  aiOverlay,
  portfolio,
  onOpenEvaluation,
  onRun,
  onOpenAccount,
  onSelectActive,
}: {
  meta: MetaResponse | null;
  accounts: Account[];
  accountsById: Record<string, Account>;
  result: RecommendationResponse | null;
  loading: boolean;
  hubStatus: HubspotStatus | null;
  writebacks: Record<string, HubspotWriteback[]>;
  selectedId: string | null;
  dataSourceLabel: string;
  isHubspotSource: boolean;
  externalSignalsEnabled?: boolean;
  externalContext?: Record<string, BriefExternalContext>;
  aiOverlay?: AIOverlayMap | null;
  portfolio?: PortfolioAgentReport | null;
  onOpenEvaluation?: () => void;
  onRun: () => void;
  onOpenAccount: (accountId: string) => void;
  /** Phase 13.6 — lightweight active-account selection (focus, not navigate). */
  onSelectActive?: (accountId: string) => void;
}) {
  void meta;
  const recs = result?.recommendations ?? [];
  const hasResult = recs.length > 0;
  const anyApproved = recs.some((r) => r.approval_status === "approved");
  const anyWriteback = Object.values(writebacks).some((w) => w.length > 0);
  const lastSync = isHubspotSource ? hubStatus?.last_synced_at ?? null : null;
  const latency = result?.latency_ms ?? result?.decision_ledger?.latency_ms ?? 0;

  // ---- Phase 14B: recommendation delta tracking ----
  // Hydrate from localStorage once on mount, then re-ingest whenever a new
  // RecommendationResponse arrives. Diff is pure; persists snapshot + log.
  const [deltas, setDeltas] = React.useState<RecommendationDelta[]>([]);
  React.useEffect(() => {
    setDeltas(loadDeltas());
  }, []);
  React.useEffect(() => {
    if (recs.length === 0) return;
    ingestRecommendations(recs);
    setDeltas(loadDeltas());
  }, [result?.generated_at, recs.length]);

  const brief = React.useMemo(
    () =>
      morningBrief(accounts, accountsById, recs, hasResult, {
        externalEnabled: externalSignalsEnabled,
        externalContext,
      }),
    [accounts, accountsById, recs, hasResult, externalSignalsEnabled, externalContext],
  );

  const queueRows = React.useMemo<QueueRow[]>(
    () =>
      recs.slice(0, 12).map((rec) => {
        const account = accountsById[rec.account_id];
        const reasoning = reasonForRecommendation(rec, account);
        return {
          recommendation: rec,
          account,
          rank: rec.priority_rank,
          action: reasoning.action.label,
          risk: riskLevel(account),
          minutes: reasoning.estimatedMinutes,
          evidence: rec.evidence.length,
          whyNow: reasoning.whyNow,
          expectedOutcome: reasoning.expectedOutcome,
        };
      }),
    [recs, accountsById],
  );

  const [activeAccountId, setActiveAccountId] = React.useState<string | null>(selectedId ?? recs[0]?.account_id ?? null);
  React.useEffect(() => {
    if (selectedId && selectedId !== activeAccountId) setActiveAccountId(selectedId);
  }, [selectedId, activeAccountId]);
  React.useEffect(() => {
    if (!activeAccountId && recs.length > 0) setActiveAccountId(recs[0].account_id);
    if (activeAccountId && !recs.some((r) => r.account_id === activeAccountId)) {
      setActiveAccountId(recs[0]?.account_id ?? null);
    }
  }, [recs, activeAccountId]);

  const activeRec = recs.find((r) => r.account_id === activeAccountId) ?? recs[0] ?? null;
  const activeAccount = activeRec ? accountsById[activeRec.account_id] : undefined;
  const activeReasoning = activeRec ? reasonForRecommendation(activeRec, activeAccount) : null;

  const recommendedIds = React.useMemo(() => new Set(recs.map((r) => r.account_id)), [recs]);
  const storyByAccount = React.useMemo(() => {
    const m: Record<string, { actionLabel: string; actionTone: string; outcome: string }> = {};
    recs.forEach((r) => {
      const a = accountsById[r.account_id];
      const ba = businessAction(r.action_type, {
        governanceStatus: r.governance_status,
        growthPotential: a?.growth_potential_score,
        productUsage: a?.product_usage_score,
      });
      m[r.account_id] = {
        actionLabel: ba.label,
        actionTone: ba.tone,
        outcome: reasonForRecommendation(r, a).expectedOutcome,
      };
    });
    return m;
  }, [recs, accountsById]);

  const snapRevRisk = React.useMemo(() => revenueAtRisk(accounts), [accounts]);
  const snapGrowth = React.useMemo(() => growthOpportunity(accounts), [accounts]);
  const snapAttention = React.useMemo(() => countAttention(accounts), [accounts]);
  const snapOpenApprovals = recs.filter((r) => r.approval_status === "pending").length;
  const snapAvgConfidence = recs.length
    ? Math.round((recs.reduce((sum, r) => sum + r.confidence_score, 0) / recs.length) * 100)
    : 0;
  const snapTopAccount = recs[0]?.account_name ?? "—";
  const snapRenewals = accounts.filter((a) => a.renewal_days != null && a.renewal_days <= 30).length;
  const snapEffortMin = queueRows.slice(0, 6).reduce((sum, row) => sum + row.minutes, 0);

  return (
    <div className="animate-fade-in pb-8">
      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1 space-y-4">
          <ChiefOfStaffNarrativeCard
            brief={brief}
            topRec={recs[0] ?? null}
            topAccount={recs[0] ? accountsById[recs[0].account_id] : undefined}
            loading={loading}
            dataSourceLabel={dataSourceLabel}
            isHubspotSource={isHubspotSource}
            lastSync={lastSync}
            onRun={onRun}
            driftAck={<DriftAcknowledgementLine accounts={accounts} />}
          />

          <PortfolioPulseBar accounts={accounts} recs={recs} onOpenAccount={onOpenAccount} />

          <ExecutiveChangeBriefPanel
            accounts={accounts}
            refreshKey={`${deltas.length}-${result?.generated_at ?? ""}`}
            onOpenAccount={onOpenAccount}
            onOpenTimeline={() => {
              const el = document.getElementById("portfolio-timeline-anchor");
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />

          {deltas.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-edge bg-surface2/30">
              <RecommendationDeltaCompact deltas={deltas} />
            </div>
          ) : null}

          <CollapsibleZone
            id="workbench"
            defaultOpen={true}
            eyebrow="Work Queue + Account Workspace"
            heading="Execution mode"
            summary="Select an account, review evidence, and execute the recommended action."
            aside={
              externalSignalsEnabled && hasResult ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/5 px-2 py-0.5 text-[10px] font-medium text-brand-bright">
                  <Globe size={10} /> External on
                </span>
              ) : null
            }
          >
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_3fr]">
              <WorkQueuePanel
                rows={queueRows}
                activeAccountId={activeRec?.account_id ?? null}
                onSelect={(accountId) => {
                  setActiveAccountId(accountId);
                  onSelectActive?.(accountId);
                }}
                loading={loading}
                onRun={onRun}
              />
              <AccountWorkspacePanel
                recommendation={activeRec}
                account={activeAccount}
                reasoning={activeReasoning}
                generatedAt={result?.generated_at}
                onOpenAccount={onOpenAccount}
                loading={loading}
                onRun={onRun}
                timelineRefreshKey={`${deltas.length}-${result?.generated_at ?? ""}`}
              />
            </div>

            {aiOverlay && hasResult ? <AIEnhancedBanner overlay={aiOverlay} /> : null}
          </CollapsibleZone>

          <CollapsibleZone
            id="portfolio"
            defaultOpen={false}
            eyebrow="Portfolio Intelligence"
            heading="Analytics and portfolio context"
            summary="Ranked accounts, risk vs opportunity, portfolio health, and trends."
          >
            <CompactSection eyebrow="Live signal drift" heading="Streaming telemetry simulator">
              <LivePortfolioDriftPanel accounts={accounts} />
            </CompactSection>

            <CompactSection eyebrow="Portfolio timeline" heading="Cross-account chronological feed">
              <div id="portfolio-timeline-anchor">
                <PortfolioTimeline
                  refreshKey={`${deltas.length}-${result?.generated_at ?? ""}`}
                  onOpenAccount={onOpenAccount}
                />
              </div>
            </CompactSection>

            <CompactSection eyebrow="Recommendation change log" heading="Priority and action evolution">
              <RecommendationDeltaLog deltas={deltas} onOpenAccount={onOpenAccount} />
            </CompactSection>

            <CompactSection eyebrow="Ranked accounts" heading="Deterministic priority shortlist">
              <div className="card-premium p-2 sm:p-3">
                <PriorityAccountsTable
                  recs={recs}
                  accountsById={accountsById}
                  selectedId={selectedId}
                  onOpenAccount={onOpenAccount}
                  onRun={onRun}
                  hasResult={hasResult}
                  loading={loading}
                />
              </div>
            </CompactSection>

            <CompactSection eyebrow="Risk vs opportunity" heading="Portfolio map">
              <div className="card-premium p-4">
                <PortfolioMatrix
                  accounts={accounts}
                  accountsById={accountsById}
                  selectedId={selectedId}
                  recommendedIds={recommendedIds}
                  storyByAccount={storyByAccount}
                  onOpenAccount={onOpenAccount}
                />
              </div>
            </CompactSection>

            <CompactSection eyebrow="Portfolio health" heading="Book of business">
              <PortfolioHealthCard accounts={accounts} recs={recs} latencyMs={latency} hasResult={hasResult} />
            </CompactSection>

            <CompactSection eyebrow="Trends" heading="What changed overnight">
              <div className="card-premium p-4">
                <AiInsightsPanel accounts={accounts} />
              </div>
            </CompactSection>
          </CollapsibleZone>

          <CollapsibleZone
            id="governance"
            defaultOpen={false}
            eyebrow="Trust & Governance"
            heading="How the system decided"
            summary="Approvals, governance checks, decision ledger, and evaluation."
          >
            <CompactSection eyebrow="Governance pipeline" heading="Controlled multi-agent workflow">
              <div className="card-premium p-4">
                <LiveWorkflowRail
                  state={{
                    loading,
                    hasResult,
                    anyApproved,
                    anyWriteback,
                    sourceLabel: isHubspotSource ? "HubSpot Test CRM" : "Synthetic Dataset",
                  }}
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <TrustStat icon={<CheckCircle2 size={12} />} label="Open approvals" value={String(snapOpenApprovals)} />
                <TrustStat
                  icon={<ShieldAlert size={12} />}
                  label="Human review required"
                  value={String(recs.filter((r) => r.governance_status !== "ok").length)}
                />
                <TrustStat icon={<FileText size={12} />} label="Decision ledger" value={String(recs.length)} />
                <TrustStat icon={<Zap size={12} />} label="Evaluation queue" value={String(recs.length)} />
              </div>
              {onOpenEvaluation ? (
                <div className="mt-2 rounded-lg border border-edge bg-surface2/40 px-3 py-2 text-[11px] text-muted">
                  Open detailed governance and evaluation metrics in Evaluation Center.{" "}
                  <button type="button" className="ml-1 text-brand-bright hover:underline" onClick={onOpenEvaluation}>
                    Open →
                  </button>
                </div>
              ) : null}
            </CompactSection>

            <CompactSection eyebrow="Manager view" heading="Manager summary">
              <ManagerSummaryPanel recs={recs} accounts={accounts} />
            </CompactSection>

            <CompactSection eyebrow="Decision ledger" heading="Persistent audit trail">
              <DecisionLedgerPanel recs={recs} />
            </CompactSection>

            <CompactSection eyebrow="CRM writeback readiness" heading="Connector lifecycle">
              <CrmWritebackReadinessPanel recs={recs} />
            </CompactSection>
          </CollapsibleZone>
        </div>

        <aside className="hidden w-[244px] shrink-0 xl:block">
          <div className="sticky top-5 space-y-2">
            <div className="rounded-xl border border-edge bg-surface2/50 p-3.5">
              <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">
                Executive Snapshot
              </div>
              {activeRec ? (
                <div className="mb-2.5 rounded-lg border border-brand/35 surface-warm px-2.5 py-2">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-brand-bright/90">
                    Active account
                  </div>
                  <div className="mt-0.5 truncate text-[13px] font-semibold text-ink" title={activeRec.account_name}>
                    {activeRec.account_name}
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-muted">
                    Priority #{activeRec.priority_rank} ·{" "}
                    {activeReasoning?.action.label ?? activeRec.recommended_action}
                  </div>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <RailRow icon={<ShieldAlert size={12} className="text-risk" />} label="Revenue at risk" value={inrCompact(snapRevRisk)} tone="risk" />
                <RailRow icon={<TrendingUp size={12} className="text-accent" />} label="Expansion opportunity" value={inrCompact(snapGrowth)} tone="opp" />
                <RailRow icon={<Zap size={12} className="text-brand-bright" />} label="Accounts requiring action" value={String(snapAttention)} />
                <RailRow icon={<Clock size={12} className="text-muted" />} label="Renewals due" value={String(snapRenewals)} tone={snapRenewals > 0 ? "warn" : undefined} />
                <RailRow icon={<CheckCircle2 size={12} className="text-muted" />} label="Pending approvals" value={String(snapOpenApprovals)} tone={snapOpenApprovals > 0 ? "warn" : undefined} />
                <RailRow icon={<Clock size={12} className="text-muted" />} label="Estimated effort" value={snapEffortMin > 0 ? `~${Math.round((snapEffortMin / 60) * 10) / 10} hrs` : "—"} />
                <RailRow icon={<Zap size={12} className="text-brand-bright" />} label="AI confidence" value={snapAvgConfidence > 0 ? `${snapAvgConfidence}%` : "—"} tone={snapAvgConfidence >= 80 ? "opp" : snapAvgConfidence >= 60 ? undefined : "risk"} />
                <RailRow icon={<TrendingUp size={12} className="text-brand-bright" />} label="Top account" value={snapTopAccount} />
              </div>
            </div>
          </div>
        </aside>
      </div>
      <DemoModeOverlay ready={hasResult} />
    </div>
  );
}

function ChiefOfStaffNarrativeCard({
  brief,
  topRec,
  topAccount,
  loading,
  dataSourceLabel,
  isHubspotSource,
  lastSync,
  onRun,
  driftAck,
}: {
  brief: ReturnType<typeof morningBrief>;
  topRec: Recommendation | null;
  topAccount?: Account;
  loading: boolean;
  dataSourceLabel: string;
  isHubspotSource: boolean;
  lastSync: string | null;
  onRun: () => void;
  driftAck?: React.ReactNode;
}) {
  const reasoning = topRec ? reasonForRecommendation(topRec, topAccount) : null;
  const spendChange = topAccount ? Math.round(spendChangePct(topAccount) * 100) : 0;
  return (
    <div className="card-elevated relative overflow-hidden p-3 sm:p-4">
      <div className="grid-dots pointer-events-none absolute inset-0 opacity-[0.12]" />
      <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-brand via-brand/50 to-transparent" aria-hidden />
      <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", isHubspotSource ? "border-accent/40 bg-accent/10 text-accent" : "border-brand/40 bg-brand/10 text-brand-bright")}>
              {dataSourceLabel} <span className="opacity-70">·</span> {brief.analyzed}
            </span>
            <h2 className="text-[15px] font-semibold text-ink">AI Chief of Staff</h2>
            <span className="text-[10px] text-faint">· sync {lastSync ?? "—"}</span>
          </div>
          <p className="mt-1 text-[12px] text-muted">
            Across {brief.analyzed} accounts: <span className="font-semibold text-risk">{inrCompact(brief.revenueAtRisk)}</span> at risk,{" "}
            <span className="font-semibold text-accent">{inrCompact(brief.growthOpportunity)}</span> expansion,{" "}
            <span className="font-semibold text-ink">{brief.attention}</span> need attention.
          </p>
          {driftAck}
        </div>
        <div className="flex items-center gap-1.5">
          <DemoModeTrigger />
          <button type="button" onClick={onRun} disabled={loading} className={cx("btn btn-primary px-3 py-1.5 text-xs", loading && "opacity-70")}>
            {loading ? "Analyzing…" : "Re-run"}
          </button>
        </div>
      </div>

      {topRec && reasoning ? (
        <div className="relative mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-edge bg-surface2/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider text-faint">Start with</span>
            <span className="text-[14px] font-semibold text-ink">{topRec.account_name}</span>
          </div>
          <span className="hidden h-3.5 w-px bg-edge sm:block" aria-hidden />
          <span className="text-[11px] text-muted">
            {topAccount ? (
              <>
                Spend {spendChange > 0 ? "up" : "down"} {Math.abs(spendChange)}% · support risk {riskLevel(topAccount).toLowerCase()} · renewal {topAccount.renewal_days}d
              </>
            ) : (
              topRec.priority_reason
            )}
          </span>
          <span className="hidden h-3.5 w-px bg-edge sm:block" aria-hidden />
          <span className="text-[11px] text-muted">{reasoning.expectedOutcome}</span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/5 px-2 py-0.5 text-[10px] font-semibold text-brand-bright">
            <Clock size={10} /> ~{reasoning.estimatedMinutes} min
          </span>
        </div>
      ) : (
        <div className="relative mt-2.5 rounded-lg border border-edge bg-surface2/40 px-3 py-2 text-[12px] text-muted">
          Run the workflow to generate today’s operating narrative.
        </div>
      )}
    </div>
  );
}

function WorkQueuePanel({
  rows,
  activeAccountId,
  onSelect,
  loading,
  onRun,
}: {
  rows: QueueRow[];
  activeAccountId: string | null;
  onSelect: (accountId: string) => void;
  loading?: boolean;
  onRun?: () => void;
}) {
  const selectedIndex = Math.max(0, rows.findIndex((r) => r.recommendation.account_id === activeAccountId));
  const [hovered, setHovered] = React.useState<string | null>(null);
  const rowRefs = React.useRef<Record<string, HTMLTableRowElement | null>>({});

  const mustDo = rows.filter((r) => r.rank <= 3);
  const shouldDo = rows.filter((r) => r.rank > 3 && r.rank <= 7);
  const optional = rows.filter((r) => r.rank > 7);

  // Phase 13.6 — keep the selected row visible when arrow-key navigation moves
  // beyond the viewport. Uses nearest scrolling so the queue itself only
  // scrolls when necessary.
  React.useEffect(() => {
    if (!activeAccountId) return;
    const node = rowRefs.current[activeAccountId];
    node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeAccountId]);

  void selectedIndex;

  return (
    <div
      className="rounded-xl border border-edge bg-surface2/35 p-3"
      tabIndex={0}
      onKeyDown={(e) => {
        if (rows.length === 0) return;
        const idx = Math.max(0, rows.findIndex((r) => r.recommendation.account_id === activeAccountId));
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const next = Math.min(rows.length - 1, idx + 1);
          onSelect(rows[next].recommendation.account_id);
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          const next = Math.max(0, idx - 1);
          onSelect(rows[next].recommendation.account_id);
        }
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Work queue</div>
        <div className="text-[10px] text-faint">{rows.length ? `${rows.length} accounts` : ""}</div>
      </div>
      {rows.length === 0 ? (
        loading ? (
          <QueueSkeleton />
        ) : (
          <EmptyPanelState
            title="Queue is empty"
            description="Run analysis to score accounts, rank by priority, and populate the work queue."
            actionLabel="Run analysis"
            onAction={onRun}
          />
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-edge-soft">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-edge bg-bg/30 text-[10px] uppercase tracking-wider text-faint">
                  <th className="px-2.5 py-2 text-left">Rank</th>
                  <th className="px-2.5 py-2 text-left">Account</th>
                  <th className="px-2.5 py-2 text-left">Recommended action</th>
                  <th className="px-2.5 py-2 text-left">Risk</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const active = row.recommendation.account_id === activeAccountId;
                  return (
                    <tr
                      key={row.recommendation.recommendation_id}
                      ref={(el) => {
                        rowRefs.current[row.recommendation.account_id] = el;
                      }}
                      onClick={() => onSelect(row.recommendation.account_id)}
                      onMouseEnter={() => setHovered(row.recommendation.account_id)}
                      onMouseLeave={() => setHovered(null)}
                      aria-selected={active}
                      className={cx(
                        "cursor-pointer border-b border-edge/40 transition-colors",
                        active ? "rail-selected" : "hover:bg-surface2/50",
                      )}
                    >
                      <td
                        className={cx(
                          "px-2.5 py-2 font-mono font-semibold",
                          active ? "text-brand-bright" : "text-brand-bright/75",
                        )}
                      >
                        #{row.rank}
                      </td>
                      <td
                        className={cx(
                          "px-2.5 py-2 text-[13px] font-semibold tracking-tight",
                          active ? "text-ink" : "text-ink/90",
                        )}
                      >
                        {row.recommendation.account_name}
                      </td>
                      <td className="px-2.5 py-2 text-muted">{row.action}</td>
                      <td
                        className={cx(
                          "px-2.5 py-2 font-medium",
                          row.risk === "High"
                            ? "text-risk"
                            : row.risk === "Medium"
                              ? "text-yellow-400"
                              : "text-accent",
                        )}
                      >
                        {row.risk}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-2 rounded-lg border border-edge bg-bg/25 px-2.5 py-2 text-[11px] text-faint">
            {hovered
              ? rows.find((r) => r.recommendation.account_id === hovered)?.whyNow ?? "Hover any row to preview why now."
              : "Use ↑/↓ keys to move selection. Click a row to focus the account workspace."}
          </div>

          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <UrgencyBucket title="Must do" items={mustDo} tone="risk" />
            <UrgencyBucket title="Should do" items={shouldDo} tone="warn" />
            <UrgencyBucket title="Optional" items={optional} tone="neutral" />
          </div>
        </>
      )}
    </div>
  );
}

function EmptyPanelState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-edge bg-bg/25 px-3 py-4">
      <div className="text-[12px] font-semibold text-ink">{title}</div>
      <p className="text-[11px] leading-relaxed text-muted">{description}</p>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} className="btn btn-primary px-2.5 py-1 text-[11px]">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div className="space-y-1.5" aria-busy="true" aria-label="Loading work queue">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 rounded border border-edge-soft bg-bg/25 px-2 py-1.5">
          <div className="h-3 w-6 animate-pulse rounded bg-surface2/60" />
          <div className="h-3 w-28 animate-pulse rounded bg-surface2/60" />
          <div className="h-3 flex-1 animate-pulse rounded bg-surface2/40" />
          <div className="h-3 w-10 animate-pulse rounded bg-surface2/60" />
        </div>
      ))}
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="flex h-full flex-col rounded-xl border border-edge bg-surface2/35 p-3" aria-busy="true" aria-label="Loading workspace">
      <div className="rounded-lg border border-edge-soft bg-bg/35 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-4 w-40 animate-pulse rounded bg-surface2/70" />
          <div className="h-4 w-20 animate-pulse rounded bg-surface2/50" />
          <div className="h-4 w-16 animate-pulse rounded bg-surface2/50" />
        </div>
        <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-surface2/40" />
        <div className="mt-3 flex gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-6 w-24 animate-pulse rounded bg-surface2/60" />
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-surface2/40" />
        ))}
      </div>
    </div>
  );
}

function UrgencyBucket({
  title,
  items,
  tone,
}: {
  title: string;
  items: QueueRow[];
  tone: "risk" | "warn" | "neutral";
}) {
  const toneClass = tone === "risk" ? "border-risk/30 bg-risk/[0.04]" : tone === "warn" ? "border-yellow-400/25 bg-yellow-500/[0.04]" : "border-edge bg-surface2/35";
  return (
    <div className={cx("rounded-lg border p-2", toneClass)}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">{title}</div>
      {items.length ? (
        <ul className="mt-1 space-y-1 text-[10px] text-muted">
          {items.slice(0, 4).map((item) => (
            <li key={`${title}-${item.recommendation.account_id}`} className="truncate">
              #{item.rank} {item.recommendation.account_name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[10px] text-faint">None</p>
      )}
    </div>
  );
}

function AccountWorkspacePanel({
  recommendation,
  account,
  reasoning,
  generatedAt,
  onOpenAccount,
  loading,
  onRun,
  timelineRefreshKey,
}: {
  recommendation: Recommendation | null;
  account?: Account;
  reasoning: ReturnType<typeof reasonForRecommendation> | null;
  generatedAt?: string;
  onOpenAccount: (accountId: string) => void;
  loading?: boolean;
  onRun?: () => void;
  timelineRefreshKey?: string;
}) {
  if (!recommendation || !reasoning) {
    if (loading) {
      return <WorkspaceSkeleton />;
    }
    return (
      <div className="rounded-xl border border-edge bg-surface2/35 p-4">
        <EmptyPanelState
          title="No account selected"
          description="Select an account from the work queue to load the execution workspace, evidence, and recommended action."
          actionLabel="Run analysis"
          onAction={onRun}
        />
      </div>
    );
  }
  return (
    <WorkspaceCockpit
      key={recommendation.account_id}
      recommendation={recommendation}
      account={account}
      reasoning={reasoning}
      generatedAt={generatedAt}
      onOpenAccount={onOpenAccount}
      timelineRefreshKey={timelineRefreshKey}
    />
  );
}

type WorkspaceTab = "overview" | "prep" | "email" | "crm" | "evidence" | "timeline";
type WorkspaceFocus = null | "summary" | "prep" | "crm" | "evidence" | "timeline";

const WORKSPACE_TABS: { id: WorkspaceTab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <Target size={12} /> },
  { id: "prep", label: "Conversation Prep", icon: <MessageSquare size={12} /> },
  { id: "email", label: "Email Draft", icon: <Mail size={12} /> },
  { id: "crm", label: "CRM Update", icon: <ClipboardList size={12} /> },
  { id: "evidence", label: "Evidence", icon: <ListChecks size={12} /> },
  { id: "timeline", label: "Timeline", icon: <Clock size={12} /> },
];

interface MockApprovalEntry {
  decision: "approved" | "rejected" | "review";
  reviewer: string;
  timestamp: string;
  note?: string;
}

function useLedgerTick(): number {
  // Re-render whenever the ledger changes anywhere in the app.
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => subscribeLedger(() => setTick((t) => t + 1)), []);
  return tick;
}

function WorkspaceCockpit({
  recommendation,
  account,
  reasoning,
  generatedAt,
  onOpenAccount,
  timelineRefreshKey,
}: {
  recommendation: Recommendation;
  account?: Account;
  reasoning: NonNullable<ReturnType<typeof reasonForRecommendation>>;
  generatedAt?: string;
  onOpenAccount: (accountId: string) => void;
  timelineRefreshKey?: string;
}) {
  const [tab, setTab] = React.useState<WorkspaceTab>("overview");
  const [focus, setFocus] = React.useState<WorkspaceFocus>("summary");
  const [approvalOpen, setApprovalOpen] = React.useState(false);
  const ledgerTick = useLedgerTick();
  const accountHistory = React.useMemo(
    () => listLedgerForAccount(recommendation.account_id),
    [recommendation.account_id, ledgerTick],
  );
  const lifecycle = React.useMemo<LifecycleState>(
    () => lifecycleFor(recommendation.recommendation_id, "prepared"),
    [recommendation.recommendation_id, ledgerTick],
  );
  const cockpitRef = React.useRef<HTMLDivElement | null>(null);
  const risk = riskLevel(account);

  // Brief, transient focus highlight so users see the click had an effect.
  React.useEffect(() => {
    if (!focus) return;
    const t = window.setTimeout(() => setFocus(null), 2400);
    return () => window.clearTimeout(t);
  }, [focus, tab]);

  const goto = (next: WorkspaceTab, nextFocus: WorkspaceFocus) => {
    setTab(next);
    setFocus(nextFocus);
    cockpitRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onOpenAccountClick = () => {
    goto("overview", "summary");
    // Also surface the full account detail panel so deeper review + approval
    // controls remain available without changing the architecture.
    onOpenAccount(recommendation.account_id);
  };

  return (
    <div ref={cockpitRef} className="flex h-full flex-col rounded-xl border border-edge bg-surface2/35 p-3 ambient-glow">
      {/* Persistent cockpit header */}
      <div className="rounded-lg border border-edge-soft surface-warm p-3.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="text-[19px] font-semibold leading-tight tracking-tight text-ink">{recommendation.account_name}</div>
          <Badge label={`Priority #${recommendation.priority_rank}`} tone="brand" />
          <RecommendationSeverityBadge accountId={recommendation.account_id} refreshKey={timelineRefreshKey} />
          <Badge label={`Risk ${risk}`} tone={risk === "High" ? "risk" : risk === "Medium" ? "warn" : "ok"} />
          <Badge label={`Opportunity ${account?.growth_potential_score ?? 0}`} tone="ok" />
          <Badge label={`Renewal ${account?.renewal_days ?? "—"}d`} tone="neutral" />
          <Badge label={`~${reasoning.estimatedMinutes}m`} tone="neutral" />
          <Badge label={`${recommendation.evidence.length} evidence`} tone="neutral" />
        </div>
        <p className="mt-2 text-[12.5px] text-muted">
          Recommended action: <span className="font-semibold text-ink">{reasoning.action.label}</span>
        </p>
        <RecommendationEvolutionPanel
          accountId={recommendation.account_id}
          fallbackAction={reasoning.action.label}
          fallbackRank={recommendation.priority_rank}
          refreshKey={timelineRefreshKey}
        />
        <WhyRecommendationChanged accountId={recommendation.account_id} refreshKey={timelineRefreshKey} />
        <LifecycleRibbon state={lifecycle} />
        {/* Primary execution CTAs — wired to in-workspace navigation +
            transient focus. Approval opens a mock human-in-the-loop drawer. */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button type="button" onClick={onOpenAccountClick} className="btn btn-primary px-3 py-1.5 text-[12px]">
            <ArrowUpRight size={13} /> Open Account
          </button>
          <button type="button" onClick={() => goto("prep", "prep")} className="btn btn-outline-primary px-3 py-1.5 text-[12px]">
            <MessageSquare size={13} /> Prepare Outreach
          </button>
          <button type="button" onClick={() => goto("crm", "crm")} className="btn btn-outline-primary px-3 py-1.5 text-[12px]">
            <FileText size={13} /> Draft CRM Note
          </button>
          <button type="button" onClick={() => goto("evidence", "evidence")} className="btn btn-ghost px-3 py-1.5 text-[12px]">
            <ListChecks size={13} /> Review Evidence
          </button>
          <button type="button" onClick={() => setApprovalOpen(true)} className="btn btn-governance px-3 py-1.5 text-[12px]">
            <CheckCircle2 size={13} /> Mark for Approval
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div role="tablist" aria-label="Account execution workspace" className="mt-2.5 flex flex-wrap gap-1 border-b border-edge">
        {WORKSPACE_TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-t-md px-3 py-2 text-[12.5px] font-medium transition-colors -mb-px border-b-2",
                active
                  ? "border-brand-bright text-ink bg-bg/35"
                  : "border-transparent text-faint hover:text-muted hover:bg-surface2/40",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div role="tabpanel" className="mt-2 min-h-[320px]">
        {tab === "overview" ? <OverviewTab recommendation={recommendation} account={account} reasoning={reasoning} focused={focus === "summary"} /> : null}
        {tab === "prep" ? <ConversationPrepTab recommendation={recommendation} account={account} reasoning={reasoning} focused={focus === "prep"} /> : null}
        {tab === "email" ? <EmailDraftTab recommendation={recommendation} account={account} reasoning={reasoning} /> : null}
        {tab === "crm" ? <CrmUpdateTab recommendation={recommendation} reasoning={reasoning} generatedAt={generatedAt} focused={focus === "crm"} /> : null}
        {tab === "evidence" ? <EvidenceTab recommendation={recommendation} generatedAt={generatedAt} focused={focus === "evidence"} /> : null}
        {tab === "timeline" ? (
          <div className="space-y-3">
            <AccountTimeline accountId={recommendation.account_id} refreshKey={timelineRefreshKey} />
            <ReasoningTrail accountId={recommendation.account_id} refreshKey={timelineRefreshKey} />
          </div>
        ) : null}
      </div>

      {approvalOpen ? (
        <ApprovalDrawer
          recommendation={recommendation}
          account={account}
          reasoning={reasoning}
          history={accountHistory}
          lifecycle={lifecycle}
          onAct={(decision, note) => {
            appendLedgerEntry({
              recommendation_id: recommendation.recommendation_id,
              account_id: recommendation.account_id,
              account_name: recommendation.account_name,
              recommended_action: reasoning.action.label,
              decision_type: decision,
              reviewer_name: "You (demo reviewer)",
              reviewer_note: note,
              confidence: recommendation.confidence_score,
              risk_level: risk,
              opportunity_level: account?.growth_potential_score ?? 0,
              evidence_count: recommendation.evidence.length,
              business_impact: businessImpactLine(recommendation, reasoning, account),
              governance_caveat: recommendation.governance_caveats[0],
              source:
                (recommendation.agents_invoked?.length ?? 0) > 1
                  ? "multi_agent"
                  : "deterministic",
            });
          }}
          onCaptureOutcome={(outcome, outcomeNote) => {
            recordOutcome(recommendation.account_id, outcome, outcomeNote);
          }}
          onClose={() => setApprovalOpen(false)}
        />
      ) : null}
    </div>
  );
}

function OverviewTab({
  recommendation,
  account,
  reasoning,
  focused,
}: {
  recommendation: Recommendation;
  account?: Account;
  reasoning: NonNullable<ReturnType<typeof reasonForRecommendation>>;
  focused?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      <FocusRing focused={focused}>
        <WorkspaceCard title="Account summary" icon={<Target size={12} />}>
          <p className="text-[11px] text-muted">{recommendation.priority_reason}</p>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[10px]">
            <MiniStat label="Segment" value={account?.segment ? titleCase(account.segment) : "—"} />
            <MiniStat label="Industry" value={account?.industry ? titleCase(account.industry) : "—"} />
            <MiniStat label="Region" value={account?.region ? titleCase(account.region) : "—"} />
            <MiniStat label="Confidence" value={pct(recommendation.confidence_score)} />
          </div>
        </WorkspaceCard>
      </FocusRing>

      <WorkspaceCard title="Risk" icon={<ShieldAlert size={12} />}>
        <p className="text-[11px] text-muted">{recommendation.risk_summary}</p>
        <p className="mt-1.5 text-[10px] italic text-faint">If ignored: {reasoning.ifIgnored}</p>
      </WorkspaceCard>

      <WorkspaceCard title="Opportunity" icon={<TrendingUp size={12} />}>
        <p className="text-[11px] text-muted">{recommendation.opportunity_summary}</p>
        <p className="mt-1.5 text-[10px] text-faint">Growth potential: {account?.growth_potential_score ?? "—"}</p>
      </WorkspaceCard>

      <WorkspaceCard title="Renewal" icon={<Clock size={12} />}>
        <p className="text-[11px] text-muted">
          {account?.renewal_days != null
            ? `Renewal window in ${account.renewal_days} days.`
            : "Renewal date not available."}
        </p>
        <p className="mt-1.5 text-[10px] text-faint">{reasoning.timing}</p>
      </WorkspaceCard>

      <div className="lg:col-span-2">
        <WorkspaceCard title="Expected outcome" icon={<Zap size={12} />}>
          <p className="text-[11px] text-muted">{reasoning.expectedOutcome}</p>
          <p className="mt-1.5 text-[10px] text-faint">Estimated effort: ~{reasoning.estimatedMinutes} minutes</p>
        </WorkspaceCard>
      </div>
    </div>
  );
}

function ConversationPrepTab({
  recommendation,
  account,
  reasoning,
  focused,
}: {
  recommendation: Recommendation;
  account?: Account;
  reasoning: NonNullable<ReturnType<typeof reasonForRecommendation>>;
  focused?: boolean;
}) {
  const talkTrack = parseBulletLines(recommendation.call_script);
  const validatePoints = reasoning.reasons.slice(0, 2).map((r) => r.text);
  const avoidPoints = recommendation.governance_caveats.slice(0, 2);
  const whyNow = buildWhyNowSignals(account, recommendation);
  const discovery = discoveryQuestions(account, recommendation);
  const commitment = commitmentToSecure(reasoning, account);
  const customerSituation = customerSituationLine(recommendation, account);
  const execSummary = executiveSummaryLine(recommendation, reasoning);
  const objections = likelyObjections(recommendation, account);
  const success = successCriteria(reasoning, account);

  return (
    <div className="space-y-2">
      {focused ? (
        <div className="rounded-md border border-brand-bright/40 bg-brand/[0.10] px-2 py-1 text-[11px] text-brand-bright">
          Ready for seller review — Objective, Discovery questions, and Commitment to secure are highlighted below.
        </div>
      ) : null}
      <WorkspaceCard title="Executive summary" icon={<Target size={12} />}>
        <p className="text-[11px] text-muted">{execSummary}</p>
      </WorkspaceCard>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <FocusRing focused={focused}>
          <WorkspaceCard title="Conversation objective" icon={<Target size={12} />}>
            <p className="text-[11px] text-muted">{reasoning.action.value}</p>
            <p className="mt-1.5 text-[10px] text-faint">{reasoning.timing}</p>
          </WorkspaceCard>
        </FocusRing>

        <WorkspaceCard title="Customer situation" icon={<Globe size={12} />}>
          <p className="text-[11px] text-muted">{customerSituation}</p>
        </WorkspaceCard>

        <WorkspaceCard title="Why now" icon={<Zap size={12} />}>
          <ul className="space-y-1 text-[11px] text-muted">
            {whyNow.map((s, idx) => (
              <li key={`why-${idx}`}>• {s}</li>
            ))}
          </ul>
        </WorkspaceCard>

        <WorkspaceCard title="Recommended talk track" icon={<MessageSquare size={12} />}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">Discuss</div>
          <ul className="mt-0.5 space-y-1 text-[11px] text-muted">
            {talkTrack.slice(0, 3).map((line, idx) => (
              <li key={`talk-${idx}`}>• {line}</li>
            ))}
          </ul>
          <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">Validate</div>
          <ul className="mt-0.5 space-y-1 text-[11px] text-muted">
            {validatePoints.map((line, idx) => (
              <li key={`val-${idx}`}>• {line}</li>
            ))}
          </ul>
          {avoidPoints.length > 0 ? (
            <>
              <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">Avoid</div>
              <ul className="mt-0.5 space-y-1 text-[11px] text-muted">
                {avoidPoints.map((line, idx) => (
                  <li key={`avoid-${idx}`}>• {line}</li>
                ))}
              </ul>
            </>
          ) : null}
        </WorkspaceCard>

        <FocusRing focused={focused}>
          <WorkspaceCard title="Discovery questions" icon={<ListChecks size={12} />}>
            <ul className="space-y-1 text-[11px] text-muted">
              {discovery.map((q, idx) => (
                <li key={`disc-${idx}`}>• {q}</li>
              ))}
            </ul>
          </WorkspaceCard>
        </FocusRing>

        <WorkspaceCard title="Likely objections & response guidance" icon={<ShieldAlert size={12} />}>
          <ul className="space-y-1.5 text-[11px] text-muted">
            {objections.map((o, idx) => (
              <li key={`obj-${idx}`} className="rounded border border-edge-soft bg-bg/30 px-1.5 py-1">
                <div className="text-[10px] font-semibold text-ink">“{o.objection}”</div>
                <div className="mt-0.5 text-[10px] text-muted">→ {o.response}</div>
              </li>
            ))}
          </ul>
        </WorkspaceCard>

        <FocusRing focused={focused}>
          <WorkspaceCard title="Commitment to secure" icon={<CheckCircle2 size={12} />}>
            <p className="text-[11px] text-muted">{commitment}</p>
          </WorkspaceCard>
        </FocusRing>

        <WorkspaceCard title="Success criteria" icon={<CheckCircle2 size={12} />}>
          <ul className="space-y-1 text-[11px] text-muted">
            {success.map((s, idx) => (
              <li key={`succ-${idx}`}>• {s}</li>
            ))}
          </ul>
        </WorkspaceCard>

        <div className="lg:col-span-2">
          <WorkspaceCard title="Recommended outcome" icon={<Zap size={12} />}>
            <p className="text-[11px] text-muted">{reasoning.expectedOutcome}</p>
          </WorkspaceCard>
        </div>
      </div>
    </div>
  );
}

function EmailDraftTab({
  recommendation,
  account,
  reasoning,
}: {
  recommendation: Recommendation;
  account?: Account;
  reasoning: NonNullable<ReturnType<typeof reasonForRecommendation>>;
}) {
  const original = recommendation.draft_email || "";
  const defaultSubject = subjectLineFor(recommendation, reasoning, account);
  const cta = callToActionFor(reasoning);
  const [editing, setEditing] = React.useState(false);
  const [subject, setSubject] = React.useState(defaultSubject);
  const [text, setText] = React.useState(original);
  // Reset local edits when recommendation changes (parent uses key= for full
  // remount but be defensive in case that ever stops being true).
  React.useEffect(() => {
    setText(original);
    setSubject(defaultSubject);
    setEditing(false);
  }, [original, defaultSubject]);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const fullText = `Subject: ${subject}\n\n${text}\n\n${cta}`;
  return (
    <WorkspaceCard
      title="Generated outreach"
      icon={<Mail size={12} />}
      action={
        <div className="flex items-center gap-1.5">
          <CopyButton text={fullText} />
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1 rounded border border-edge-soft px-1.5 py-0.5 text-[10px] text-faint transition-colors hover:bg-surface2/40 hover:text-ink"
          >
            {editing ? "Done" : "Edit draft"}
          </button>
        </div>
      }
    >
      <div className="mb-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">Subject</div>
        {editing ? (
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-0.5 w-full rounded border border-edge-soft bg-bg/40 px-2 py-1 text-[11px] text-ink outline-none focus:border-brand-bright"
          />
        ) : (
          <p className="mt-0.5 text-[11px] font-medium text-ink">{subject}</p>
        )}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">Body</div>
      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-0.5 min-h-[160px] w-full resize-vertical rounded border border-edge-soft bg-bg/40 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-ink outline-none focus:border-brand-bright"
        />
      ) : (
        <pre className="mt-0.5 whitespace-pre-wrap text-[11px] leading-relaxed text-muted">{text || "No draft provided."}</pre>
      )}
      <div className="mt-1.5 rounded border border-brand/30 bg-brand/[0.06] px-2 py-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-bright">Call to action</div>
        <p className="mt-0.5 text-[11px] text-ink">{cta}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-edge-soft pt-1.5">
        <span className="text-[10px] uppercase tracking-wider text-faint">Approval</span>
        <ApprovalBadge status={recommendation.approval_status} />
        <span className="text-[10px] text-faint">Word count: {words}</span>
        <span className="text-[10px] text-faint">Not auto-sent — human approval required before outreach.</span>
      </div>
    </WorkspaceCard>
  );
}

function CrmUpdateTab({
  recommendation,
  reasoning,
  generatedAt,
  focused,
}: {
  recommendation: Recommendation;
  reasoning: NonNullable<ReturnType<typeof reasonForRecommendation>>;
  generatedAt?: string;
  focused?: boolean;
}) {
  const initial =
    recommendation.voice_summary ||
    `Reviewed ${recommendation.account_name} (priority #${recommendation.priority_rank}). ${recommendation.risk_summary}. Next action: ${reasoning.action.label}.`;
  const [editing, setEditing] = React.useState(false);
  const [note, setNote] = React.useState(initial);
  React.useEffect(() => {
    setNote(initial);
    setEditing(false);
  }, [initial]);
  const followUp = followUpDateLabel(reasoning.action.urgency, generatedAt);
  const owner = ownerHintFor(reasoning);
  const priority = priorityLabelFor(recommendation);
  return (
    <div className="space-y-2">
      {focused ? (
        <div className="rounded-md border border-brand-bright/40 bg-brand/[0.10] px-2 py-1 text-[11px] text-brand-bright">
          CRM update prepared — review the note, next step, and follow-up date below.
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <FocusRing focused={focused}>
            <WorkspaceCard
              title="Suggested note"
              icon={<ClipboardList size={12} />}
              action={
                <div className="flex items-center gap-1.5">
                  <CopyButton text={note} />
                  <button
                    type="button"
                    onClick={() => setEditing((v) => !v)}
                    className="inline-flex items-center gap-1 rounded border border-edge-soft px-1.5 py-0.5 text-[10px] text-faint transition-colors hover:bg-surface2/40 hover:text-ink"
                  >
                    {editing ? "Done" : "Edit note"}
                  </button>
                </div>
              }
            >
              {editing ? (
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="min-h-[110px] w-full resize-vertical rounded border border-edge-soft bg-bg/40 px-2 py-1.5 text-[11px] leading-relaxed text-ink outline-none focus:border-brand-bright"
                />
              ) : (
                <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted">{note}</pre>
              )}
              <div className="mt-1.5 text-[10px] text-faint">Approval required before write-back.</div>
            </WorkspaceCard>
          </FocusRing>
        </div>
        <FocusRing focused={focused}>
          <WorkspaceCard title="Suggested next step" icon={<Zap size={12} />}>
            <p className="text-[11px] text-muted">{reasoning.action.label}</p>
            <p className="mt-1.5 text-[10px] text-faint">{reasoning.action.value}</p>
          </WorkspaceCard>
        </FocusRing>
        <FocusRing focused={focused}>
          <WorkspaceCard title="Suggested follow-up date" icon={<Clock size={12} />}>
            <p className="text-[13px] font-semibold text-ink">{followUp}</p>
            <p className="mt-1 text-[10px] text-faint">{reasoning.timing}</p>
          </WorkspaceCard>
        </FocusRing>
        <WorkspaceCard title="Owner" icon={<Target size={12} />}>
          <p className="text-[11px] text-muted">{owner}</p>
        </WorkspaceCard>
        <WorkspaceCard title="Priority" icon={<ShieldAlert size={12} />}>
          <div className="flex items-center gap-2">
            <Badge label={priority.label} tone={priority.tone} />
            <span className="text-[10px] text-faint">Priority rank #{recommendation.priority_rank}</span>
          </div>
        </WorkspaceCard>
      </div>
    </div>
  );
}

function EvidenceTab({
  recommendation,
  generatedAt,
  focused,
}: {
  recommendation: Recommendation;
  generatedAt?: string;
  focused?: boolean;
}) {
  const captured = formatTimestamp(generatedAt);
  return (
    <FocusRing focused={focused}>
      <WorkspaceCard title={`Evidence stack (${recommendation.evidence.length})`} icon={<ListChecks size={12} />}>
        <div className="mb-1.5 grid grid-cols-5 gap-2 px-1 text-[9px] font-semibold uppercase tracking-wider text-faint">
          <div className="col-span-2">Signal</div>
          <div>Source</div>
          <div>Confidence</div>
          <div className="text-right">Impact</div>
        </div>
        <div className="space-y-1.5">
          {recommendation.evidence.length ? (
            recommendation.evidence.map((ev, idx) => {
              const polarity = String(ev.polarity).toLowerCase();
              const impactTone = polarity.startsWith("pos")
                ? "bg-accent/15 text-accent"
                : polarity.startsWith("neg")
                  ? "bg-risk/15 text-risk"
                  : "bg-surface2/60 text-faint";
              return (
                <div key={`ev-${idx}`} className="rounded border border-edge-soft bg-bg/30 px-2 py-1.5">
                  <div className="grid grid-cols-5 items-start gap-2 text-[10px]">
                    <div className="col-span-2 min-w-0">
                      <div className="truncate text-[11px] font-semibold text-ink">{ev.label}</div>
                      <div className="text-[10px] text-muted">{ev.detail}</div>
                    </div>
                    <div className="inline-flex items-center gap-1 text-faint">
                      <Globe size={9} /> {ev.source_system}
                    </div>
                    <div className="font-mono text-muted">{pct(ev.strength)}</div>
                    <div className="text-right">
                      <span className={cx("rounded px-1 text-[9px] font-semibold uppercase", impactTone)}>{String(ev.polarity)}</span>
                    </div>
                  </div>
                  {captured ? (
                    <div className="mt-1 text-[9px] text-faint">Captured: {captured}</div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="text-[11px] text-faint">No evidence snippets available.</p>
          )}
        </div>
        <div className="mt-1.5 text-[10px] text-faint">Overall confidence: {pct(recommendation.confidence_score)}</div>
      </WorkspaceCard>
    </FocusRing>
  );
}

function FocusRing({ focused, children }: { focused?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cx(
        "rounded-lg transition-all",
        focused ? "ring-2 ring-brand-bright/60 ring-offset-2 ring-offset-surface2/35" : "",
      )}
    >
      {children}
    </div>
  );
}

// -- Phase 13 approval drawer (ledger-backed; persists across refresh) -------
function ApprovalDrawer({
  recommendation,
  account,
  reasoning,
  history,
  lifecycle,
  onAct,
  onCaptureOutcome,
  onClose,
}: {
  recommendation: Recommendation;
  account?: Account;
  reasoning: NonNullable<ReturnType<typeof reasonForRecommendation>>;
  history: LedgerEntry[];
  lifecycle: LifecycleState;
  onAct: (decision: LedgerEntry["decision_type"], note?: string) => void;
  onCaptureOutcome: (outcome: OutcomeKind, note?: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = React.useState("");
  const risk = riskLevel(account);
  const isApproved = lifecycle === "approved" || lifecycle === "executed" || lifecycle === "outcome_captured";
  const latestApproved = history.find((h) => h.decision_type === "approved");
  const hasOutcome = Boolean(latestApproved?.outcome);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mark for approval"
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-[440px] flex-col gap-2 overflow-y-auto border-l border-edge bg-surface p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-faint">Human approval</div>
            <h3 className="text-[14px] font-semibold text-ink">{recommendation.account_name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-edge-soft px-2 py-0.5 text-[11px] text-faint hover:bg-surface2/40 hover:text-ink"
          >
            Close
          </button>
        </div>

        <LifecycleRibbon state={lifecycle} compact />

        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <MiniStat label="Recommendation" value={reasoning.action.label} />
          <MiniStat label="Confidence" value={pct(recommendation.confidence_score)} />
          <MiniStat label="Risk" value={risk} />
          <MiniStat label="Evidence" value={`${recommendation.evidence.length} items`} />
        </div>

        <section className="rounded-lg border border-edge bg-bg/30 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">Recommendation summary</div>
          <p className="mt-1 text-[11px] text-muted">{executiveSummaryLine(recommendation, reasoning)}</p>
        </section>

        <section className="rounded-lg border border-edge bg-bg/30 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">Evidence summary</div>
          <p className="mt-1 text-[11px] text-muted">{evidenceSummaryLine(recommendation)}</p>
        </section>

        <section className="rounded-lg border border-edge bg-bg/30 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">Business impact</div>
          <p className="mt-1 text-[11px] text-muted">{businessImpactLine(recommendation, reasoning, account)}</p>
        </section>

        <section className="rounded-lg border border-edge bg-bg/30 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">Risk if ignored</div>
          <p className="mt-1 text-[11px] text-muted">{reasoning.ifIgnored}</p>
        </section>

        <section className="rounded-lg border border-edge bg-bg/30 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">Expected outcome</div>
          <p className="mt-1 text-[11px] text-muted">{reasoning.expectedOutcome}</p>
        </section>

        {recommendation.governance_caveats.length ? (
          <section className="rounded-lg border border-yellow-400/30 bg-yellow-400/5 p-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-yellow-400">Governance caveat</div>
            <ul className="mt-1 space-y-0.5 text-[11px] text-muted">
              {recommendation.governance_caveats.map((c, i) => (
                <li key={`gc-${i}`}>• {c}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-lg border border-edge bg-bg/30 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">Reviewer note (optional)</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add context for the audit trail…"
            className="mt-1 min-h-[64px] w-full resize-vertical rounded border border-edge-soft bg-bg/40 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-brand-bright"
          />
        </section>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              onAct("approved", note.trim() || undefined);
              setNote("");
            }}
            className="btn btn-primary px-2.5 py-1 text-[11px]"
          >
            <CheckCircle2 size={12} /> Approve
          </button>
          <button
            type="button"
            onClick={() => {
              onAct("rejected", note.trim() || undefined);
              setNote("");
            }}
            className="btn btn-ghost px-2.5 py-1 text-[11px]"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => {
            onAct("review", note.trim() || undefined);
              setNote("");
            }}
            className="btn btn-ghost px-2.5 py-1 text-[11px]"
          >
            Request review
          </button>
        </div>

        {isApproved ? (
          <section className="rounded-lg border border-accent/30 bg-accent/5 p-2.5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                Ready for CRM writeback
              </div>
              <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-accent">
                Advisory
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              CRM writeback not enabled in this demo mode. The approved action would be staged for the
              connector pipeline (Prepared → Approved → Ready for CRM → Written → Verified).
            </p>
          </section>
        ) : null}

        {isApproved ? (
          <section className="rounded-lg border border-edge bg-bg/30 p-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
              Capture outcome
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {hasOutcome
                ? `Recorded: ${OUTCOME_LABEL[latestApproved!.outcome!]}`
                : "Tag the real-world result so the ledger reflects execution."}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(Object.keys(OUTCOME_LABEL) as OutcomeKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onCaptureOutcome(k, note.trim() || undefined)}
                  className={cx(
                    "rounded border px-1.5 py-0.5 text-[10px] transition-colors",
                    latestApproved?.outcome === k
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-edge-soft text-muted hover:border-edge hover:bg-surface2/40 hover:text-ink",
                  )}
                >
                  {OUTCOME_LABEL[k]}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-1 rounded-lg border border-edge bg-bg/30 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">Approval history</div>
          {history.length === 0 ? (
            <p className="mt-1 text-[11px] text-faint">No decisions recorded yet for this account.</p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {history.map((entry) => (
                <li key={entry.ledger_id} className="rounded border border-edge-soft bg-bg/40 px-2 py-1.5 text-[10px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={cx(
                        "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                        entry.decision_type === "approved"
                          ? "bg-accent/15 text-accent"
                          : entry.decision_type === "rejected"
                            ? "bg-risk/15 text-risk"
                            : "bg-yellow-400/15 text-yellow-400",
                      )}
                    >
                      {entry.decision_type.replace("_", " ")}
                    </span>
                    <span className="text-muted">{entry.reviewer_name}</span>
                    <span className="ml-auto text-faint">{formatTimestamp(entry.created_at) || entry.created_at}</span>
                  </div>
                  {entry.reviewer_note ? <p className="mt-1 text-muted">{entry.reviewer_note}</p> : null}
                  {entry.outcome ? (
                    <p className="mt-1 text-accent">Outcome: {OUTCOME_LABEL[entry.outcome]}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-auto text-[10px] text-faint">
          Decisions persist in the local Decision Ledger. No backend writeback yet — Phase 14 will
          forward approved actions to the CRM connector.
        </p>
      </div>
    </div>
  );
}

// -- Phase 13 lifecycle ribbon (Detected → … → Outcome captured) -------------
function LifecycleRibbon({ state, compact }: { state: LifecycleState; compact?: boolean }) {
  const idx = LIFECYCLE_ORDER.indexOf(state);
  return (
    <div
      className={cx(
        "mt-2 flex w-full items-stretch rounded-lg border border-edge-soft bg-base/40 p-1",
        compact ? "gap-0.5" : "gap-0.5",
      )}
      aria-label={`Lifecycle: ${LIFECYCLE_LABEL[state]}`}
      role="group"
    >
      {LIFECYCLE_ORDER.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <React.Fragment key={s}>
            <div
              className={cx(
                "flex flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide transition-colors",
                active
                  ? "bg-brand/15 text-brand-bright shadow-[inset_0_0_0_1px_rgba(216,154,61,0.45)]"
                  : done
                    ? "text-accent"
                    : "text-faint",
              )}
            >
              <span
                aria-hidden
                className={cx(
                  "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[8px] font-bold",
                  active
                    ? "border-brand-bright bg-brand text-[#1a1206]"
                    : done
                      ? "border-accent/60 bg-accent/25 text-accent"
                      : "border-edge-soft text-faint",
                )}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className="truncate">{LIFECYCLE_LABEL[s]}</span>
            </div>
            {i < LIFECYCLE_ORDER.length - 1 ? (
              <span
                aria-hidden
                className={cx(
                  "self-center text-[10px] leading-none",
                  done ? "text-accent/70" : i === idx ? "text-brand-bright/60" : "text-faint/50",
                )}
              >
                →
              </span>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}




function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-edge-soft bg-bg/30 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wider text-faint">{label}</div>
      <div className="text-[11px] font-medium text-ink">{value}</div>
    </div>
  );
}

function ApprovalBadge({ status }: { status: string }) {
  const s = String(status || "pending").toLowerCase();
  const tone =
    s.includes("approve") ? "bg-accent/15 text-accent" : s.includes("reject") ? "bg-risk/15 text-risk" : "bg-yellow-400/15 text-yellow-400";
  return <span className={cx("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", tone)}>{titleCase(s.replace(/_/g, " "))}</span>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      disabled={!text}
      className="inline-flex items-center gap-1 rounded border border-edge-soft px-1.5 py-0.5 text-[10px] text-faint transition-colors hover:text-ink hover:bg-surface2/40 disabled:opacity-40"
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// -- Phase 9 presentational helpers (no scoring/ranking impact) --------------

function discoveryQuestions(account: Account | undefined, rec: Recommendation): string[] {
  const out: string[] = [];
  if (account) {
    if (spendDelta(account) <= -10) out.push("What's driving the recent change in usage and spend this quarter?");
    if (account.support_risk_score >= 50) out.push("Which open support issues are creating the most friction for your team?");
    if (account.engagement_score <= 50) out.push("What outcomes would make this product indispensable day to day?");
    if (account.renewal_days != null && account.renewal_days <= 90) out.push("Who are the decision-makers and success criteria for the upcoming renewal?");
    if (account.growth_potential_score >= 60) out.push("Which adjacent teams or workflows could benefit from expanding usage?");
  }
  if (out.length === 0) {
    out.push("What does success look like for your team over the next quarter?");
    out.push("Where are the biggest gaps between current usage and your goals?");
  }
  return out.slice(0, 5);
}

function commitmentToSecure(
  reasoning: NonNullable<ReturnType<typeof reasonForRecommendation>>,
  account?: Account,
): string {
  const urgency = reasoning.action.urgency;
  if (urgency === "critical")
    return "Secure a 30-minute working session with the account sponsor within 48 hours to address the risk directly.";
  if (urgency === "opportunity")
    return "Agree to a scoping call to evaluate the expansion opportunity and identify the next milestone.";
  if (account?.renewal_days != null && account.renewal_days <= 90)
    return "Confirm the renewal decision process, timeline, and the success criteria before the window closes.";
  return "Confirm a clear next step, an owner, and a date before ending the conversation.";
}

function followUpDateLabel(urgency: string, generatedAt?: string): string {
  const offsets: Record<string, number> = { critical: 2, this_week: 5, opportunity: 10, review: 14, hold: 21 };
  const days = offsets[urgency] ?? 7;
  const base = generatedAt ? new Date(generatedAt) : new Date();
  if (Number.isNaN(base.getTime())) return `In ${days} days`;
  const d = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTimestamp(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function spendDelta(account: Account): number {
  const prev = account.previous_month_spend;
  if (!prev) return 0;
  return ((account.current_month_spend - prev) / prev) * 100;
}

function customerSituationLine(rec: Recommendation, account?: Account): string {
  const parts: string[] = [];
  if (account?.industry) parts.push(titleCase(account.industry));
  if (account?.segment) parts.push(titleCase(account.segment));
  if (account?.region) parts.push(titleCase(account.region));
  const profile = parts.length ? parts.join(" · ") : "Account";
  const delta = account ? spendDelta(account) : 0;
  const spendBit = account
    ? delta <= -5
      ? `spend down ${Math.round(Math.abs(delta))}% MoM`
      : delta >= 5
        ? `spend up ${Math.round(delta)}% MoM`
        : "spend stable MoM"
    : "spend unknown";
  const supportBit = account?.support_risk_score != null
    ? account.support_risk_score >= 70
      ? "elevated support friction"
      : account.support_risk_score >= 50
        ? "rising support friction"
        : "support stable"
    : null;
  const renewalBit = account?.renewal_days != null
    ? `renewal in ${account.renewal_days}d`
    : null;
  const tail = [spendBit, supportBit, renewalBit].filter(Boolean).join(", ");
  return `${profile} — ${tail}. ${rec.priority_reason}`;
}

// -- Phase 11 artifact derivations (UI only; no scoring impact) --------------

function executiveSummaryLine(
  rec: Recommendation,
  reasoning: NonNullable<ReturnType<typeof reasonForRecommendation>>,
): string {
  return `Priority #${rec.priority_rank} — ${rec.account_name}. ${reasoning.action.label} to ${reasoning.action.value.toLowerCase()} (confidence ${pct(rec.confidence_score)}, ~${reasoning.estimatedMinutes}m).`;
}

interface Objection { objection: string; response: string }

function likelyObjections(
  rec: Recommendation,
  account?: Account,
): Objection[] {
  const out: Objection[] = [];
  if (account) {
    if (account.support_risk_score >= 50) {
      out.push({
        objection: "Your team hasn't resolved our open support tickets yet.",
        response: "Acknowledge specific tickets, share an updated remediation timeline, and commit a single point of escalation.",
      });
    }
    if (spendDelta(account) <= -10) {
      out.push({
        objection: "We've intentionally scaled back — this isn't a priority right now.",
        response: "Reframe the conversation around the outcome they care about, then show two adoption levers that protect their investment.",
      });
    }
    if (account.engagement_score <= 50) {
      out.push({
        objection: "Our team isn't using the product enough to justify the spend.",
        response: "Offer a focused enablement session for the two workflows with the highest unrealized value.",
      });
    }
    if (account.renewal_days != null && account.renewal_days <= 90) {
      out.push({
        objection: "We're still evaluating alternatives ahead of renewal.",
        response: "Surface a side-by-side outcome comparison and a risk-mitigation plan tied to their success criteria.",
      });
    }
  }
  if (out.length === 0) {
    out.push({
      objection: "We don't have bandwidth for a new initiative right now.",
      response: "Shrink the ask: propose a 30-minute working session focused on one measurable outcome.",
    });
  }
  return out.slice(0, 4);
}

function successCriteria(
  reasoning: NonNullable<ReturnType<typeof reasonForRecommendation>>,
  account?: Account,
): string[] {
  const out: string[] = [];
  const urgency = reasoning.action.urgency;
  if (urgency === "critical") {
    out.push("Risk owner identified and a remediation plan agreed in writing.");
    out.push("Next checkpoint scheduled within 7 days.");
  } else if (urgency === "opportunity") {
    out.push("Expansion sponsor identified and success metric agreed.");
    out.push("Pilot scope and decision criteria documented.");
  } else {
    out.push("Clear next step, owner, and date confirmed.");
    out.push("Customer commitment captured in CRM with evidence.");
  }
  if (account?.renewal_days != null && account.renewal_days <= 90) {
    out.push("Renewal decision path and success criteria validated.");
  }
  return out.slice(0, 4);
}

function subjectLineFor(
  rec: Recommendation,
  reasoning: NonNullable<ReturnType<typeof reasonForRecommendation>>,
  account?: Account,
): string {
  const urgency = reasoning.action.urgency;
  if (urgency === "critical")
    return `Quick check-in on ${rec.account_name} — protecting your outcomes`;
  if (urgency === "opportunity")
    return `Idea for ${rec.account_name}: unlocking the next outcome`;
  if (account?.renewal_days != null && account.renewal_days <= 90)
    return `Aligning on your renewal goals at ${rec.account_name}`;
  return `Following up with ${rec.account_name}`;
}

function callToActionFor(
  reasoning: NonNullable<ReturnType<typeof reasonForRecommendation>>,
): string {
  const urgency = reasoning.action.urgency;
  if (urgency === "critical")
    return "Can we hold a 30-minute working session in the next 48 hours?";
  if (urgency === "opportunity")
    return "Would a 30-minute scoping call this week work to explore this?";
  return "Could we set a 20-minute check-in to align on the next step?";
}

function ownerHintFor(reasoning: NonNullable<ReturnType<typeof reasonForRecommendation>>): string {
  return reasoning.action.urgency === "critical" ? "Account Executive (escalation: Manager)" : "Account Executive";
}

function priorityLabelFor(rec: Recommendation): { label: string; tone: "risk" | "warn" | "ok" | "neutral" } {
  if (rec.priority_rank <= 3) return { label: "High", tone: "risk" };
  if (rec.priority_rank <= 7) return { label: "Medium", tone: "warn" };
  return { label: "Standard", tone: "neutral" };
}

function businessImpactLine(
  rec: Recommendation,
  reasoning: NonNullable<ReturnType<typeof reasonForRecommendation>>,
  account?: Account,
): string {
  const monthly = account?.current_month_spend ?? 0;
  const annualized = monthly * 12;
  const valueHint = annualized > 0 ? `${inrCompact(annualized)} ARR exposure` : "Recurring revenue exposure";
  return `${valueHint}. ${reasoning.expectedOutcome} (Confidence ${pct(rec.confidence_score)}.)`;
}

function evidenceSummaryLine(rec: Recommendation): string {
  if (rec.evidence.length === 0) return "No evidence snippets captured.";
  const sources = new Set(rec.evidence.map((e) => e.source_system).filter(Boolean));
  const neg = rec.evidence.filter((e) => String(e.polarity).toLowerCase().startsWith("neg")).length;
  const pos = rec.evidence.filter((e) => String(e.polarity).toLowerCase().startsWith("pos")).length;
  return `${rec.evidence.length} signals across ${sources.size} system${sources.size === 1 ? "" : "s"} — ${neg} risk, ${pos} opportunity.`;
}

// -- Phase 11 guided demo mode -----------------------------------------------

interface DemoStep { id: string; title: string; body: string }

const DEMO_STEPS: DemoStep[] = [
  { id: "brief", title: "Step 1 · Review morning brief", body: "Skim the AI Chief of Staff narrative and the Executive Snapshot rail to see what changed overnight." },
  { id: "select", title: "Step 2 · Select the top account", body: "Click the #1 row in the Work Queue to load that account's execution workspace on the right." },
  { id: "evidence", title: "Step 3 · Review evidence", body: "Click Review Evidence in the workspace header to inspect signals, sources, and confidence behind the recommendation." },
  { id: "prep", title: "Step 4 · Prepare outreach", body: "Click Prepare Outreach. Walk through Objective, Why Now, Discovery questions, Objections, and Commitment to secure." },
  { id: "crm", title: "Step 5 · Review CRM note", body: "Click Draft CRM Note. Validate the suggested note, next step, owner, priority, and follow-up date." },
  { id: "approve", title: "Step 6 · Submit for approval", body: "Click Mark for Approval to open the human-in-the-loop drawer. Approve, reject, or request review — write-back stays human-gated." },
];

const DEMO_KEY = "s2a_demo_dismissed_v1";

function DemoModeOverlay({ ready }: { ready: boolean }) {
  const [active, setActive] = React.useState(false);
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    const onStart = () => {
      setStep(0);
      setActive(true);
    };
    window.addEventListener("s2a:demo:start", onStart);
    return () => window.removeEventListener("s2a:demo:start", onStart);
  }, []);

  const dismiss = (forever?: boolean) => {
    setActive(false);
    if (forever) {
      try {
        window.localStorage.setItem(DEMO_KEY, "1");
        window.dispatchEvent(new CustomEvent("s2a:demo:dismissed"));
      } catch {
        /* ignore */
      }
    }
  };

  if (!ready || !active) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => dismiss(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Guided demo"
            className="m-3 w-full max-w-[480px] rounded-xl border border-edge bg-surface p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-faint">Guided demo</div>
                <h3 className="text-[14px] font-semibold text-ink">{DEMO_STEPS[step].title}</h3>
              </div>
              <button type="button" onClick={() => dismiss(false)} className="rounded border border-edge-soft px-2 py-0.5 text-[11px] text-faint hover:bg-surface2/40 hover:text-ink">
                Close
              </button>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">{DEMO_STEPS[step].body}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1">
              {DEMO_STEPS.map((s, idx) => (
                <span
                  key={s.id}
                  className={cx(
                    "h-1.5 w-6 rounded-full",
                    idx === step ? "bg-brand-bright" : idx < step ? "bg-brand/60" : "bg-surface2/70",
                  )}
                />
              ))}
              <span className="ml-auto text-[10px] text-faint">{step + 1} of {DEMO_STEPS.length}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="btn btn-ghost px-2.5 py-1 text-[11px] disabled:opacity-40"
              >
                Back
              </button>
              {step < DEMO_STEPS.length - 1 ? (
                <button type="button" onClick={() => setStep((s) => s + 1)} className="btn btn-primary px-2.5 py-1 text-[11px]">
                  Next
                </button>
              ) : (
                <button type="button" onClick={() => dismiss(true)} className="btn btn-primary px-2.5 py-1 text-[11px]">
                  Finish demo
                </button>
              )}
              <button type="button" onClick={() => dismiss(true)} className="ml-auto text-[10px] text-faint hover:text-muted">
                Don&apos;t show again
              </button>
            </div>
          </div>
        </div>
  );
}

function DemoModeTrigger({ className }: { className?: string }) {
  const [dismissed, setDismissed] = React.useState(false);
  React.useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DEMO_KEY) === "1");
    } catch {
      /* ignore */
    }
    const onChange = () => {
      try {
        setDismissed(window.localStorage.getItem(DEMO_KEY) === "1");
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("s2a:demo:start", onChange);
    window.addEventListener("s2a:demo:dismissed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("s2a:demo:start", onChange);
      window.removeEventListener("s2a:demo:dismissed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("s2a:demo:start"))}
      aria-label={dismissed ? "Replay guided demo" : "Start guided demo"}
      className={cx(
        "inline-flex items-center gap-1 rounded-full border border-edge bg-surface2/40 px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:border-brand/50 hover:bg-bg/60 hover:text-brand-bright",
        className,
      )}
    >
      <Zap size={12} />
      {dismissed ? "Replay demo" : "Start demo"}
    </button>
  );
}

function CollapsibleZone({
  id,
  defaultOpen,
  eyebrow,
  heading,
  summary,
  aside,
  children,
}: {
  id: string;
  defaultOpen: boolean;
  eyebrow: string;
  heading: string;
  summary: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, toggle] = useZoneOpen(id, defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-surface/20">
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface2/30">
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-faint">{eyebrow}</div>
          <div className="mt-0.5 text-[13px] font-semibold text-ink">{heading}</div>
          {!open ? <div className="mt-0.5 text-[11px] text-faint">{summary}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {aside}
          {open ? <ChevronDown size={15} className="text-faint" /> : <ChevronRight size={15} className="text-faint" />}
        </div>
      </button>
      {open ? <div className="space-y-4 border-t border-edge px-4 pb-4 pt-4">{children}</div> : null}
    </div>
  );
}

function CompactSection({
  eyebrow,
  heading,
  children,
}: {
  eyebrow: string;
  heading: string;
  children: React.ReactNode;
}) {
  const { ref, shown } = useReveal<HTMLElement>();
  return (
    <section ref={ref} className={cx("reveal", shown && "reveal-visible")}>
      <div className="mb-2">
        <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-faint">{eyebrow}</div>
        <h3 className="text-[13px] font-semibold text-ink">{heading}</h3>
      </div>
      {children}
    </section>
  );
}

function WorkspaceCard({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-edge bg-bg/30 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
          {icon}
          {title}
        </div>
        {action}
      </div>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function RailRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "risk" | "opp" | "warn";
}) {
  const valClass =
    tone === "risk"
      ? "text-risk"
      : tone === "opp"
        ? "text-accent"
        : tone === "warn"
          ? "text-yellow-400"
          : "text-brand-bright";
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-edge/60 bg-bg/30 px-2.5 py-1.5">
      <span className="flex items-center gap-1.5 text-[11.5px] text-faint">
        {icon}
        <span className="leading-tight">{label}</span>
      </span>
      <span className={cx("text-[13px] font-semibold tabular-nums", valClass)}>{value}</span>
    </div>
  );
}

function TrustStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-edge bg-surface2/40 p-2.5">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-faint">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-ink">{value}</div>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: "brand" | "risk" | "warn" | "ok" | "neutral" }) {
  const cls =
    tone === "brand"
      ? "border-brand/40 bg-brand/10 text-brand-bright"
      : tone === "risk"
        ? "border-risk/35 bg-risk/10 text-risk"
        : tone === "warn"
          ? "border-yellow-400/30 bg-yellow-500/[0.08] text-yellow-300"
          : tone === "ok"
            ? "border-accent/35 bg-accent/10 text-accent"
            : "border-edge bg-surface2 text-faint";
  return <span className={cx("inline-flex rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider", cls)}>{label}</span>;
}

function buildWhyNowSignals(account: Account | undefined, rec: Recommendation): string[] {
  if (!account) return [rec.priority_reason];
  const spend = Math.round(spendChangePct(account) * 100);
  const out: string[] = [];
  out.push(`Spend ${spend >= 0 ? "up" : "down"} ${Math.abs(spend)}% month-over-month.`);
  out.push(`Support risk score ${Math.round(account.support_risk_score)} / 100.`);
  out.push(`Product usage score ${Math.round(account.product_usage_score)} / 100.`);
  out.push(`No seller contact in ${account.last_contact_days} days.`);
  return out;
}

function riskLevel(account?: Account): "High" | "Medium" | "Low" {
  if (!account) return "Medium";
  const spend = spendChangePct(account);
  const urgentRenewal = account.renewal_days >= 0 && account.renewal_days <= 30;
  if (account.support_risk_score >= 70 || spend <= -0.2 || urgentRenewal) return "High";
  if (account.support_risk_score >= 50 || spend <= -0.1 || account.engagement_score <= 45) return "Medium";
  return "Low";
}

function parseBulletLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}


// -- Phase 13 governance panels ----------------------------------------------
function ManagerSummaryPanel({ recs, accounts }: { recs: Recommendation[]; accounts: Account[] }) {
  const tick = useLedgerTick();
  const all = React.useMemo(() => listLedger(), [tick]);
  const byAcct = React.useMemo(() => new Map(accounts.map((a) => [a.account_id, a])), [accounts]);

  const reviewed = new Set(all.map((e) => e.recommendation_id)).size;
  const approved = all.filter((e) => e.decision_type === "approved").length;
  const rejected = all.filter((e) => e.decision_type === "rejected").length;
  const reviewQ = all.filter((e) => e.decision_type === "review").length;
  const pending = recs.filter((r) => !all.some((e) => e.recommendation_id === r.recommendation_id)).length;

  const revenueReviewed = all
    .filter((e) => e.decision_type === "approved" || e.decision_type === "rejected")
    .reduce((sum, e) => {
      const a = byAcct.get(e.account_id);
      return sum + (a ? (a.current_month_spend || 0) * 12 : 0);
    }, 0);
  const revenueProtected = all
    .filter((e) => e.decision_type === "approved" && e.outcome === "renewal_risk_reduced")
    .reduce((sum, e) => {
      const a = byAcct.get(e.account_id);
      return sum + (a ? (a.current_month_spend || 0) * 12 : 0);
    }, 0);
  const opportunitiesAdvanced = all.filter(
    (e) => e.outcome === "opportunity_created" || e.outcome === "meeting_booked",
  ).length;

  return (
    <div className="card-premium p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ManagerStat label="Recommendations reviewed" value={String(reviewed)} />
        <ManagerStat label="Approved" value={String(approved)} tone="ok" />
        <ManagerStat label="Rejected" value={String(rejected)} tone="risk" />
        <ManagerStat label="Review requested" value={String(reviewQ)} tone="warn" />
        <ManagerStat label="Pending approvals" value={String(pending)} tone={pending > 0 ? "warn" : undefined} />
        <ManagerStat label="Revenue at risk reviewed" value={inrCompact(revenueReviewed)} />
        <ManagerStat label="Revenue protected" value={inrCompact(revenueProtected)} tone="ok" />
        <ManagerStat label="Opportunities advanced" value={String(opportunitiesAdvanced)} tone="ok" />
      </div>
      <p className="mt-2 text-[10px] text-faint">
        Manager view aggregates the local Decision Ledger. Numbers update as decisions and outcomes
        are captured.
      </p>
    </div>
  );
}

function ManagerStat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "risk" }) {
  const cls =
    tone === "ok" ? "text-accent" : tone === "warn" ? "text-yellow-400" : tone === "risk" ? "text-risk" : "text-ink";
  return (
    <div className="rounded border border-edge-soft bg-bg/35 p-2">
      <div className="text-[9px] uppercase tracking-wider text-faint">{label}</div>
      <div className={cx("mt-0.5 text-[14px] font-semibold tabular-nums", cls)}>{value}</div>
    </div>
  );
}

function DecisionLedgerPanel({ recs }: { recs: Recommendation[] }) {
  const tick = useLedgerTick();
  const entries = React.useMemo(() => listLedger().slice(0, 10), [tick]);
  const summary = React.useMemo(
    () => summarize(recs.map((r) => r.recommendation_id)),
    [recs, tick],
  );

  return (
    <div className="card-premium p-4 shadow-glow-gov">
      <div className="mb-3 flex items-center gap-2 border-b border-gov/15 pb-2">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gov-bright" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gov-bright">
          Audit-grade decision trail
        </span>
        <span className="ml-auto rounded border border-gov/30 bg-gov/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gov-bright">
          Governance
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LedgerCount label="Total decisions" value={summary.total} />
        <LedgerCount label="Approved" value={summary.approved} tone="ok" />
        <LedgerCount label="Rejected" value={summary.rejected} tone="risk" />
        <LedgerCount label="Review requested" value={summary.review} tone="warn" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LedgerCount label="Awaiting approval" value={summary.awaitingApproval} />
        <LedgerCount label="Approved � not executed" value={summary.approvedNotExecuted} />
        <LedgerCount label="Outcome captured" value={summary.outcomeCaptured} tone="ok" />
        <LedgerCount label="Outcome pending" value={summary.outcomePending} tone="warn" />
      </div>

      <div className="mt-3 rounded-lg border border-edge bg-bg/35">
        <div className="grid grid-cols-[1fr,90px,1fr,90px,110px] gap-2 border-b border-edge-soft px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
          <div>Account</div>
          <div>Decision</div>
          <div>Reviewer</div>
          <div>Outcome</div>
          <div className="text-right">When</div>
        </div>
        {entries.length === 0 ? (
          <div className="px-2.5 py-3 text-center text-[11px] text-faint">
            No decisions yet. Approve, reject, or request review from the Approval drawer to start
            the audit trail.
          </div>
        ) : (
          entries.map((e) => (
            <div
              key={e.ledger_id}
              className="grid grid-cols-[1fr,90px,1fr,90px,110px] items-center gap-2 border-b border-edge-soft/50 px-2.5 py-1.5 text-[11px] last:border-b-0"
            >
              <div className="truncate text-ink">{e.account_name}</div>
              <div>
                <span
                  className={cx(
                    "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                    e.decision_type === "approved"
                      ? "bg-accent/15 text-accent"
                      : e.decision_type === "rejected"
                        ? "bg-risk/15 text-risk"
                        : "bg-yellow-400/15 text-yellow-400",
                  )}
                >
                  {e.decision_type.replace("_", " ")}
                </span>
              </div>
              <div className="truncate text-muted">{e.reviewer_name}</div>
              <div className="truncate text-faint">{e.outcome ? OUTCOME_LABEL[e.outcome] : "�"}</div>
              <div className="text-right text-faint">{formatTimestamp(e.created_at) || "�"}</div>
            </div>
          ))
        )}
      </div>
      <p className="mt-2 text-[10px] text-faint">
        Ledger persists in browser storage (Phase 13 demo). The API surface is backend-swappable for
        Phase 14 � same record shape, real database.
      </p>
    </div>
  );
}

function LedgerCount({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "risk" }) {
  const cls =
    tone === "ok" ? "text-accent" : tone === "warn" ? "text-yellow-400" : tone === "risk" ? "text-risk" : "text-ink";
  return (
    <div className="rounded border border-edge-soft bg-bg/35 p-2">
      <div className="text-[9px] uppercase tracking-wider text-faint">{label}</div>
      <div className={cx("mt-0.5 text-[14px] font-semibold tabular-nums", cls)}>{value}</div>
    </div>
  );
}

function CrmWritebackReadinessPanel({ recs }: { recs: Recommendation[] }) {
  const tick = useLedgerTick();
  const all = React.useMemo(() => listLedger(), [tick]);

  const prepared = recs.length;
  const approved = recs.filter((r) =>
    all.some((e) => e.recommendation_id === r.recommendation_id && e.decision_type === "approved"),
  ).length;
  const readyForCrm = approved; // approved but not yet written
  const written = 0;
  const verified = 0;

  const steps: { label: string; value: number; complete: boolean }[] = [
    { label: "Prepared", value: prepared, complete: prepared > 0 },
    { label: "Approved", value: approved, complete: approved > 0 },
    { label: "Ready for CRM", value: readyForCrm, complete: readyForCrm > 0 },
    { label: "Written to CRM", value: written, complete: false },
    { label: "Verified", value: verified, complete: false },
  ];

  return (
    <div className="card-premium p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map((s, i) => (
          <React.Fragment key={s.label}>
            <div
              className={cx(
                "rounded-lg border px-2.5 py-1.5 text-[11px]",
                s.complete
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-edge-soft bg-bg/40 text-faint",
              )}
            >
              <div className="text-[9px] font-semibold uppercase tracking-wider">{s.label}</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums">{s.value}</div>
            </div>
            {i < steps.length - 1 ? (
              <span className={cx("text-[12px]", s.complete ? "text-accent" : "text-faint")}>�</span>
            ) : null}
          </React.Fragment>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {readyForCrm > 0 ? `${readyForCrm} approved action${readyForCrm === 1 ? "" : "s"} ready for CRM writeback. ` : ""}
        <span className="text-faint">CRM writeback not enabled in this demo mode.</span> Phase 14
        will route approved actions through the HubSpot connector (task + note) with verification.
      </p>
    </div>
  );
}