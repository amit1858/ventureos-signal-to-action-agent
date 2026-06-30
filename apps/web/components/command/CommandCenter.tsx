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
  Rocket,
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
import { recordExternalSnapshot } from "@/lib/externalChangeMonitor";
import { buildExecutiveDailyBriefing } from "@/lib/executiveDailyBriefing";
import { useExperienceMode, isSectionVisible, isOpenByDefault, type ExperienceMode } from "@/lib/experienceMode";
import {
  normalizePreferredSection,
  type OpenAccountFromSurfaceInput,
  type WorkspaceSectionTarget,
} from "@/lib/accountNavigation";
import { ExperienceModeSwitch } from "@/components/command/ExperienceModeSwitch";
import { ManagerAICoach } from "@/components/command/ManagerAICoach";
import { DisclosurePanel } from "@/components/command/DisclosurePanel";
import { ExecutiveAttentionBrief } from "@/components/command/ExecutiveAttentionBrief";
import { ActionExecutionPanel } from "@/components/command/ActionExecutionPanel";
import { SellerMissionControl } from "@/components/command/SellerMissionControl";
import { consumeMissionRequest, requestMission, subscribeMissionRequests } from "@/lib/missionState";
import { loadDriftSnapshot } from "@/lib/driftEngine";
import { type AccountSelectionContext } from "@/lib/accountSelectionContext";
import dynamic from "next/dynamic";

// Phase 14C â€” Timeline surfaces. Heavy-ish, lazy-loaded so the home page's
// First Load JS stays inside the program budget.
const AccountTimeline = dynamic(
  () => import("@/components/command/AccountTimeline").then((m) => m.AccountTimeline),
  { ssr: false, loading: () => <div className="rounded-lg border border-edge bg-surface2/40 px-3 py-4 text-[11.5px] text-muted">Loading timelineâ€¦</div> },
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
const ExternalChangeMonitorPanel = dynamic(
  () => import("@/components/command/ExternalChangeMonitor").then((m) => m.ExternalChangeMonitorPanel),
  { ssr: false, loading: () => null },
);
const ExecutiveDailyBriefingPanel = dynamic(
  () => import("@/components/command/ExecutiveDailyBriefing").then((m) => m.ExecutiveDailyBriefingPanel),
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

function trackSellerMetric(
  event: "account_opened" | "recommendation_action_clicked" | "workspace_loaded" | "conversation_prep_opened" | "crm_note_opened",
  detail: Record<string, unknown>,
) {
  if (typeof window === "undefined") return;
  const payload = { event, timestamp: new Date().toISOString(), ...detail };
  try {
    const key = "s2a_seller_metrics_v1";
    const raw = window.localStorage.getItem(key);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    const next = [...list, payload].slice(-200);
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* noop */
  }
  if (console?.info) console.info("[seller-metric]", payload);
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
  accountSelectionContext,
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
  onLaunchMission,
}: {
  meta: MetaResponse | null;
  accounts: Account[];
  accountsById: Record<string, Account>;
  result: RecommendationResponse | null;
  loading: boolean;
  hubStatus: HubspotStatus | null;
  writebacks: Record<string, HubspotWriteback[]>;
  selectedId: string | null;
  accountSelectionContext: AccountSelectionContext;
  dataSourceLabel: string;
  isHubspotSource: boolean;
  externalSignalsEnabled?: boolean;
  externalContext?: Record<string, BriefExternalContext>;
  aiOverlay?: AIOverlayMap | null;
  portfolio?: PortfolioAgentReport | null;
  onOpenEvaluation?: () => void;
  onRun: () => void;
  onOpenAccount: (
    input: OpenAccountFromSurfaceInput,
  ) => void;
  /** Phase 13.6 â€” lightweight active-account selection (focus, not navigate). */
  onSelectActive?: (accountId: string) => void;
  /** Release 1.4B â€” promote Start Mission to the top-level Mission surface. */
  onLaunchMission?: (accountId: string, recommendationId?: string | null) => void;
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

  // ---- Phase 14E: external system change detection ----
  // Snapshot the external dataset on each result and detect field-level
  // changes since the prior sync. Pure overlay; persists snapshot + events.
  const [externalRefreshKey, setExternalRefreshKey] = React.useState(0);
  React.useEffect(() => {
    if (accounts.length === 0) return;
    const sourceLabel = isHubspotSource ? "HubSpot test CRM" : "Synthetic dataset";
    recordExternalSnapshot(accounts, { source: sourceLabel, lastSync: lastSync ?? null });
    setExternalRefreshKey((k) => k + 1);
  }, [result?.generated_at, accounts.length, isHubspotSource, lastSync]);

  // ---- Phase 15A: experience mode ----
  const [experienceMode, setExperienceMode] = useExperienceMode();

  // ---- Phase 14F: executive daily briefing ----
  // Pure composer reads from drift / deltas / external events / ledger and
  // produces a leadership-voice briefing. Recompute whenever any source
  // changes (result, deltas log, external snapshot, or ledger).
  const briefing = React.useMemo(() => {
    if (typeof window === "undefined") return null;
    if (!hasResult) return null;
    return buildExecutiveDailyBriefing({
      accounts,
      recommendations: recs,
      sessionStartIso: result?.generated_at ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasResult, accounts.length, recs.length, result?.generated_at, deltas.length, externalRefreshKey]);

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
  const visibleQueueRows = React.useMemo<QueueRow[]>(
    () => (experienceMode === "operations" ? queueRows : queueRows.slice(0, 5)),
    [queueRows, experienceMode],
  );

  // Phase 15C.5 â€” Single source of truth: consume app-level account selection context.
  // App/page.tsx owns selection logic; CommandCenter uses it for rendering only.
  const activeAccountId = accountSelectionContext.activeAccountId;
  const activeRec = accountSelectionContext.activeRecommendation ?? null;
  const activeAccount = activeRec ? accountsById[activeRec.account_id] : undefined;
  const activeReasoning = activeRec ? reasonForRecommendation(activeRec, activeAccount) : null;

  // Release 1.4B — the next recommended account after the active one (wraps to
  // the top of the queue). Powers the Mission Complete "Start next mission" CTA.
  const nextRecommendedAccount = React.useMemo<{ account_id: string; account_name: string } | null>(() => {
    if (queueRows.length === 0) return null;
    const idx = queueRows.findIndex((r) => r.recommendation.account_id === activeRec?.account_id);
    const nextRow = idx === -1 ? queueRows[0] : queueRows[(idx + 1) % queueRows.length];
    if (!nextRow || nextRow.recommendation.account_id === activeRec?.account_id) return null;
    return {
      account_id: nextRow.recommendation.account_id,
      account_name: nextRow.recommendation.account_name,
    };
  }, [queueRows, activeRec?.account_id]);
  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    console.info("[account-routing]", {
      stage: "command-center-received-context",
      requestedAccountId: accountSelectionContext.requestedAccountId,
      activeAccountId: accountSelectionContext.activeAccountId,
      renderedAccountId: activeRec?.account_id ?? null,
      selectedAccountId: selectedId ?? null,
      source: accountSelectionContext.redirectSource ?? "workspace",
      isRedirected: accountSelectionContext.isRedirected,
      event: "command center context received",
    });
    if (
      accountSelectionContext.activeAccountId &&
      activeRec?.account_id &&
      accountSelectionContext.activeAccountId !== activeRec.account_id
    ) {
      console.warn("[account-routing-mismatch]", {
        appActiveAccountId: accountSelectionContext.activeAccountId,
        commandCenterRenderedAccountId: activeRec.account_id,
      });
    }
  }, [
    accountSelectionContext.activeAccountId,
    accountSelectionContext.isRedirected,
    accountSelectionContext.redirectSource,
    accountSelectionContext.requestedAccountId,
    activeRec?.account_id,
    selectedId,
  ]);
  const [navigationContext, setNavigationContext] = React.useState<{
    accountId: string;
    source: string;
    targetSection?: WorkspaceSectionTarget;
    at: number;
  } | null>(null);
  const modeLabels = React.useMemo(
    () => ({
      dailyBriefing:
        experienceMode === "seller"
          ? "Seller Briefing"
          : experienceMode === "operations"
            ? "System Operations Brief"
            : "Executive Daily Briefing",
      attention:
        experienceMode === "seller"
          ? "Accounts Needing Action"
          : experienceMode === "operations"
            ? "Operational Attention Queue"
            : "Executive Attention Required",
      snapshot:
        experienceMode === "seller"
          ? "My Book of Business"
          : experienceMode === "operations"
            ? "System Snapshot"
            : "Executive Snapshot",
      priorities:
        experienceMode === "seller"
          ? "Today's Priorities"
          : experienceMode === "operations"
            ? "Recommendation Queue"
            : "Recommended Actions",
      pulse: experienceMode === "seller" ? "Account Changes" : "Portfolio Pulse",
      changeBrief: experienceMode === "seller" ? "What Changed" : "Executive Change Brief",
    }),
    [experienceMode],
  );
  const openAccountWithContext = React.useCallback(
    (
      accountId: string,
      source = "Command Center",
      targetSection?: WorkspaceSectionTarget,
    ) => {
      const normalizedTarget = normalizePreferredSection(targetSection);
      if (process.env.NODE_ENV !== "production") {
        console.info("[account-routing]", {
          stage: "account-click",
          traceStage: "account-click",
          clickedAccountId: accountId,
          urlAccountId: null,
          selectedAccountId: selectedId ?? null,
          activeAccountId: activeAccountId ?? null,
          renderedAccountId: activeRec?.account_id ?? null,
          source,
          event: "activeAccountId set",
          clickSource: source,
        });
      }
      // Phase 15C.5: activeAccountId is now managed by app/page.tsx
      // CommandCenter delegates to onOpenAccount which updates app state
      setNavigationContext({ accountId, source, targetSection: normalizedTarget, at: Date.now() });
      onOpenAccount({
        accountId,
        source,
        preferredSection: normalizedTarget,
        mode: experienceMode,
      });
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          document.getElementById("workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 40);
      }
      if (experienceMode === "seller") {
        trackSellerMetric("account_opened", { account_id: accountId, source, target_section: normalizedTarget ?? null });
      }
    },
    [onOpenAccount, onSelectActive, experienceMode],
  );

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
  const snapTopAccount = recs[0]?.account_name ?? "â€”";
  const snapRenewals = accounts.filter((a) => a.renewal_days != null && a.renewal_days <= 30).length;
  const snapEffortMin = queueRows.slice(0, 6).reduce((sum, row) => sum + row.minutes, 0);

  // Phase 15B â€” derive lightweight summary stats for accordion headers.
  // Pure read of existing engines; no new intelligence.
  const driftSummary = React.useMemo(() => {
    if (typeof window === "undefined") return { changed: 0, risk: 0, opportunity: 0 };
    const snap = loadDriftSnapshot();
    const accountIds = new Set(snap.events.map((e) => e.account_id));
    const risk = snap.events.filter((e) => e.impact === "risk").length;
    const opportunity = snap.events.filter((e) => e.impact === "opportunity").length;
    return { changed: accountIds.size, risk, opportunity };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.generated_at, accounts.length]);

  // Phase 15B â€” right-rail snapshot compression. Seller mode lands collapsed
  // (compact KPI strip) to focus on action; Executive/Operations stay
  // expanded. Persists per-mode toggle in localStorage.
  const [snapshotExpanded, setSnapshotExpanded] = React.useState<boolean>(true);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `s2a_snapshot_expanded_v1:${experienceMode}`;
    const raw = window.localStorage.getItem(key);
    if (raw === "1") setSnapshotExpanded(true);
    else if (raw === "0") setSnapshotExpanded(false);
    else setSnapshotExpanded(experienceMode !== "seller");
  }, [experienceMode]);
  const toggleSnapshot = React.useCallback(() => {
    setSnapshotExpanded((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(`s2a_snapshot_expanded_v1:${experienceMode}`, next ? "1" : "0");
        } catch {
          /* noop */
        }
      }
      return next;
    });
  }, [experienceMode]);

  return (
    <div className="animate-fade-in pb-8">
      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ExperienceModeSwitch value={experienceMode} onChange={setExperienceMode} />
            <span className="text-[10.5px] uppercase tracking-[0.14em] text-faint">{dataSourceLabel}</span>
          </div>

          {isSectionVisible(experienceMode, "chiefOfStaff") ? (
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
          ) : null}

          {isSectionVisible(experienceMode, "managerCoach") ? (
            <ManagerAICoach accounts={accounts} />
          ) : null}

          {isSectionVisible(experienceMode, "attentionBrief") && hasResult ? (
            <ExecutiveAttentionBrief
              accounts={accounts}
              accountsById={accountsById}
              recs={recs}
              defaultOpen={isOpenByDefault(experienceMode, "attentionBrief")}
              titleLabel={modeLabels.attention}
              onOpenAccount={(accountId) => openAccountWithContext(accountId, modeLabels.attention)}
            />
          ) : null}

          {isSectionVisible(experienceMode, "dailyBriefing") ? (
            <ExecutiveDailyBriefingPanel
              briefing={briefing}
              titleLabel={modeLabels.dailyBriefing}
              actionsLabel={
                experienceMode === "seller"
                  ? "Today's Priorities"
                  : experienceMode === "operations"
                    ? "Recommendation Queue"
                    : "Recommended actions"
              }
              onOpenAccount={(accountId) => openAccountWithContext(accountId, modeLabels.dailyBriefing)}
            />
          ) : null}

          {isSectionVisible(experienceMode, "portfolioPulse") ? (
            <DisclosurePanel
              id="portfolio-pulse"
              eyebrow="Portfolio intelligence"
              title={modeLabels.pulse}
              summary={
                driftSummary.changed > 0
                  ? `${driftSummary.changed} accounts changed Â· ${driftSummary.risk} risks Â· ${driftSummary.opportunity} opportunities`
                  : "Awaiting next pulse cycle"
              }
              defaultOpen={isOpenByDefault(experienceMode, "portfolioPulse")}
            >
              <PortfolioPulseBar
                accounts={accounts}
                recs={recs}
                onOpenAccount={(accountId) => openAccountWithContext(accountId, modeLabels.pulse)}
              />
            </DisclosurePanel>
          ) : null}

          {isSectionVisible(experienceMode, "executiveChangeBrief") ? (
            <DisclosurePanel
              id="executive-change-brief"
              eyebrow="Executive intelligence"
              title={modeLabels.changeBrief}
              summary={
                deltas.length > 0
                  ? `${deltas.length} recommendation${deltas.length === 1 ? "" : "s"} revised since last review`
                  : "No new recommendation changes"
              }
              defaultOpen={isOpenByDefault(experienceMode, "executiveChangeBrief")}
            >
              <ExecutiveChangeBriefPanel
                accounts={accounts}
                refreshKey={`${deltas.length}-${result?.generated_at ?? ""}`}
                onOpenAccount={(accountId) => openAccountWithContext(accountId, modeLabels.changeBrief)}
                onOpenTimeline={() => {
                  const el = document.getElementById("portfolio-timeline-anchor");
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
            </DisclosurePanel>
          ) : null}

          {isSectionVisible(experienceMode, "deltaCompact") && deltas.length > 0 ? (
            <DisclosurePanel
              id="recommendation-deltas"
              eyebrow="Operations intelligence"
              title="Recommendation Changes"
              summary={`${deltas.length} action${deltas.length === 1 ? "" : "s"} revised`}
              defaultOpen={isOpenByDefault(experienceMode, "deltaCompact")}
            >
              <RecommendationDeltaCompact deltas={deltas} />
            </DisclosurePanel>
          ) : null}

          {isSectionVisible(experienceMode, "workbench") ? (
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
                rows={visibleQueueRows}
                activeAccountId={activeRec?.account_id ?? null}
                experienceMode={experienceMode}
                titleLabel={modeLabels.priorities}
                onSelect={(accountId) => {
                  // Phase 15C.5: activeAccountId update delegated to app-level onSelectActive
                  onSelectActive?.(accountId);
                }}
                onStartMission={(accountId) => {
                  onSelectActive?.(accountId);
                  if (onLaunchMission) {
                    onLaunchMission(accountId);
                  } else {
                    requestMission(accountId);
                  }
                }}
                loading={loading}
                onRun={onRun}
              />
              <AccountWorkspacePanel
                recommendation={activeRec}
                account={activeAccount}
                reasoning={activeReasoning}
                experienceMode={experienceMode}
                requestedAccountId={accountSelectionContext.requestedAccountId}
                isRedirected={accountSelectionContext.isRedirected}
                redirectSource={accountSelectionContext.redirectSource}
                generatedAt={result?.generated_at}
                onOpenAccount={openAccountWithContext}
                nextRecommendedAccount={nextRecommendedAccount}
                onLaunchMission={onLaunchMission}
                openedFromSource={navigationContext?.source ?? null}
                openedFromAt={navigationContext?.at ?? null}
                navigationTargetSection={navigationContext?.targetSection ?? null}
                loading={loading}
                onRun={onRun}
                timelineRefreshKey={`${deltas.length}-${result?.generated_at ?? ""}`}
              />
            </div>

            {aiOverlay && hasResult ? <AIEnhancedBanner overlay={aiOverlay} /> : null}
          </CollapsibleZone>
          ) : null}

          {isSectionVisible(experienceMode, "portfolioIntelligence") ? (
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
                  onOpenAccount={(accountId) => openAccountWithContext(accountId, "Portfolio Timeline")}
                />
              </div>
            </CompactSection>

            <CompactSection eyebrow="External system change detection" heading="What changed since the last sync">
              <ExternalChangeMonitorPanel
                refreshKey={`${externalRefreshKey}-${result?.generated_at ?? ""}`}
                onOpenAccount={(accountId) => openAccountWithContext(accountId, "External Change Detection")}
              />
            </CompactSection>

            <CompactSection eyebrow="Recommendation change log" heading="Priority and action evolution">
              <RecommendationDeltaLog
                deltas={deltas}
                onOpenAccount={(accountId) => openAccountWithContext(accountId, "Recommendation Delta Tracking")}
              />
            </CompactSection>

            <CompactSection eyebrow="Ranked accounts" heading="Deterministic priority shortlist">
              <div className="card-premium p-2 sm:p-3">
                <PriorityAccountsTable
                  recs={recs}
                  accountsById={accountsById}
                  selectedId={selectedId}
                  onOpenAccount={(accountId) => openAccountWithContext(accountId, "Today's Priorities")}
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
                  onOpenAccount={(accountId) => openAccountWithContext(accountId, "Portfolio Map")}
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
          ) : null}

          {isSectionVisible(experienceMode, "trustGovernance") ? (
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
                    Open â†’
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
          ) : null}
        </div>

        <aside className="hidden w-[244px] shrink-0 xl:block">
          <div className="sticky top-5 space-y-2">
            <div className="rounded-xl border border-edge bg-surface2/50 p-3.5">
              <button
                type="button"
                onClick={toggleSnapshot}
                aria-expanded={snapshotExpanded}
                className="-m-1 mb-2 flex w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-md p-1 text-left hover:bg-surface2/60"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">
                  {modeLabels.snapshot}
                </span>
                <ChevronDown
                  size={12}
                  className={cx("text-muted transition-transform", snapshotExpanded ? "rotate-0" : "-rotate-90")}
                  aria-hidden
                />
              </button>
              {snapshotExpanded ? (
                <>
                  {activeRec ? (
                    <div className="mb-2.5 rounded-lg border border-brand/35 surface-warm px-2.5 py-2">
                      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-brand-bright/90">
                        Active account
                      </div>
                      <div className="mt-0.5 truncate text-[13px] font-semibold text-ink" title={activeRec.account_name}>
                        {activeRec.account_name}
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-muted">
                        Priority #{activeRec.priority_rank} Â·{" "}
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
                    <RailRow icon={<Clock size={12} className="text-muted" />} label="Estimated effort" value={snapEffortMin > 0 ? `~${Math.round((snapEffortMin / 60) * 10) / 10} hrs` : "â€”"} />
                    <RailRow icon={<Zap size={12} className="text-brand-bright" />} label="AI confidence" value={snapAvgConfidence > 0 ? `${snapAvgConfidence}%` : "â€”"} tone={snapAvgConfidence >= 80 ? "opp" : snapAvgConfidence >= 60 ? undefined : "risk"} />
                    <RailRow icon={<TrendingUp size={12} className="text-brand-bright" />} label="Top account" value={snapTopAccount} />
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  <CompactKpi label="At risk" value={inrCompact(snapRevRisk)} tone="risk" />
                  <CompactKpi label="Expansion" value={inrCompact(snapGrowth)} tone="opp" />
                  <CompactKpi label="Approvals" value={String(snapOpenApprovals)} tone={snapOpenApprovals > 0 ? "warn" : "neutral"} />
                  <CompactKpi label="Confidence" value={snapAvgConfidence > 0 ? `${snapAvgConfidence}%` : "â€”"} tone={snapAvgConfidence >= 80 ? "opp" : snapAvgConfidence >= 60 ? "neutral" : "risk"} />
                </div>
              )}
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
              {dataSourceLabel} <span className="opacity-70">Â·</span> {brief.analyzed}
            </span>
            <h2 className="text-[15px] font-semibold text-ink">AI Chief of Staff</h2>
            <span className="text-[10px] text-faint">Â· sync {lastSync ?? "â€”"}</span>
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
            {loading ? "Analyzingâ€¦" : "Re-run"}
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
                Spend {spendChange > 0 ? "up" : "down"} {Math.abs(spendChange)}% Â· support risk {riskLevel(topAccount).toLowerCase()} Â· renewal {topAccount.renewal_days}d
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
          Run the workflow to generate todayâ€™s operating narrative.
        </div>
      )}
    </div>
  );
}

function WorkQueuePanel({
  rows,
  activeAccountId,
  experienceMode,
  titleLabel,
  onSelect,
  onStartMission,
  loading,
  onRun,
}: {
  rows: QueueRow[];
  activeAccountId: string | null;
  experienceMode: ExperienceMode;
  titleLabel: string;
  onSelect: (accountId: string) => void;
  onStartMission?: (accountId: string) => void;
  loading?: boolean;
  onRun?: () => void;
}) {
  const selectedIndex = Math.max(0, rows.findIndex((r) => r.recommendation.account_id === activeAccountId));
  const [hovered, setHovered] = React.useState<string | null>(null);
  const rowRefs = React.useRef<Record<string, HTMLTableRowElement | null>>({});

  const mustDo = rows.filter((r) => r.rank <= 3);
  const shouldDo = rows.filter((r) => r.rank > 3 && r.rank <= 7);
  const optional = rows.filter((r) => r.rank > 7);
  const effortMin = rows.reduce((sum, row) => sum + row.minutes, 0);
  const pendingApprovals = rows.filter((row) => row.recommendation.approval_status === "pending").length;
  const [showBuckets, setShowBuckets] = React.useState<boolean>(experienceMode === "operations");
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `s2a_workspace_buckets_v1:${experienceMode}`;
    const raw = window.localStorage.getItem(key);
    if (raw === "1") setShowBuckets(true);
    else if (raw === "0") setShowBuckets(false);
    else setShowBuckets(experienceMode === "operations");
  }, [experienceMode]);
  const toggleBuckets = () => {
    setShowBuckets((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(`s2a_workspace_buckets_v1:${experienceMode}`, next ? "1" : "0");
        } catch {
          /* noop */
        }
      }
      return next;
    });
  };

  // Phase 13.6 â€” keep the selected row visible when arrow-key navigation moves
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
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">{titleLabel}</div>
        <div className="text-[10px] text-faint">
          {rows.length
            ? `${rows.length} account${rows.length === 1 ? "" : "s"} Â· ${Math.round((effortMin / 60) * 10) / 10 || 0}h effort Â· ${pendingApprovals} approvals`
            : ""}
        </div>
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

          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-edge bg-bg/25 px-2.5 py-2 text-[11px] text-faint">
            <span className="min-w-0 truncate">
              {hovered
                ? rows.find((r) => r.recommendation.account_id === hovered)?.whyNow ?? "Hover any row to preview why now."
                : "Use \u2191/\u2193 keys to move selection. Click a row to focus the account workspace."}
            </span>
            {onStartMission && activeAccountId ? (
              <button
                type="button"
                onClick={() => onStartMission(activeAccountId)}
                className={cx(
                  "btn shrink-0 px-2.5 py-1 text-[11px]",
                  experienceMode === "seller" ? "btn-primary" : "btn-outline-primary",
                )}
                title="Begin the guided seller mission for the selected account"
              >
                <Rocket size={12} /> Start Mission
              </button>
            ) : null}
          </div>

          <div className="mt-2 rounded-lg border border-edge bg-bg/25">
            <button
              type="button"
              onClick={toggleBuckets}
              className="flex w-full items-center justify-between px-2.5 py-2 text-left"
              aria-expanded={showBuckets}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                Priority buckets
              </span>
              <span className="text-[10px] text-muted">
                {mustDo.length} must do Â· {shouldDo.length} should do Â· {optional.length} optional
              </span>
            </button>
            {showBuckets ? (
              <div className="grid grid-cols-1 gap-2 border-t border-edge px-2.5 py-2 sm:grid-cols-3">
                <UrgencyBucket title="Must do" items={mustDo} tone="risk" />
                <UrgencyBucket title="Should do" items={shouldDo} tone="warn" />
                <UrgencyBucket title="Optional" items={optional} tone="neutral" />
              </div>
            ) : null}
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
  experienceMode,
  requestedAccountId,
  isRedirected,
  redirectSource,
  openedFromSource,
  openedFromAt,
  navigationTargetSection,
  generatedAt,
  onOpenAccount,
  nextRecommendedAccount,
  loading,
  onRun,
  timelineRefreshKey,
  onLaunchMission,
}: {
  recommendation: Recommendation | null;
  account?: Account;
  reasoning: ReturnType<typeof reasonForRecommendation> | null;
  experienceMode: ExperienceMode;
  requestedAccountId?: string | null;
  isRedirected?: boolean;
  redirectSource?: string | null;
  openedFromSource?: string | null;
  openedFromAt?: number | null;
  navigationTargetSection?: "overview" | "prep" | "email" | "crm" | "evidence" | "evolution" | "timeline" | "reasoning" | "intelligence" | null;
  generatedAt?: string;
  onOpenAccount: (
    accountId: string,
    source?: string,
    targetSection?: "overview" | "prep" | "email" | "crm" | "evidence" | "evolution" | "timeline" | "reasoning" | "intelligence",
  ) => void;
  nextRecommendedAccount?: { account_id: string; account_name: string } | null;
  loading?: boolean;
  onRun?: () => void;
  timelineRefreshKey?: string;
  onLaunchMission?: (accountId: string, recommendationId?: string | null) => void;
}) {
  if (!recommendation || !reasoning) {
    if (loading) {
      return <WorkspaceSkeleton />;
    }
    const redirectedUnavailable = Boolean(isRedirected && requestedAccountId);
    return (
      <div className="rounded-xl border border-edge bg-surface2/35 p-4">
        <EmptyPanelState
          title={redirectedUnavailable ? "Selected account is not in the current queue" : "No account selected"}
          description={
            redirectedUnavailable
              ? `Account selected from ${redirectSource ?? "Portfolio Pulse"} is not currently in the recommendation queue. Run analysis or open Portfolio Intelligence.`
              : "Select an account from the work queue to load the execution workspace, evidence, and recommended action."
          }
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
      experienceMode={experienceMode}
      openedFromSource={openedFromSource}
      openedFromAt={openedFromAt}
      navigationTargetSection={navigationTargetSection}
      generatedAt={generatedAt}
      onOpenAccount={onOpenAccount}
      nextRecommendedAccount={nextRecommendedAccount}
      timelineRefreshKey={timelineRefreshKey}
      onLaunchMission={onLaunchMission}
    />
  );
}

type WorkspaceSection =
  | "overview"
  | "prep"
  | "email"
  | "crm"
  | "evidence"
  | "evolution"
  | "execution"
  | "timeline"
  | "reasoning"
  | "intelligence";
type WorkspaceFocus = null | "summary" | "prep" | "crm" | "evidence" | "timeline";

const WORKSPACE_SECTIONS: WorkspaceSection[] = [
  "overview",
  "prep",
  "email",
  "crm",
  "evidence",
  "evolution",
  "execution",
  "timeline",
  "reasoning",
  "intelligence",
];

function defaultWorkspaceSections(mode: ExperienceMode): WorkspaceSection[] {
  if (mode === "operations") {
    return ["overview", "evidence", "execution", "timeline", "reasoning", "evolution", "intelligence"];
  }
  if (mode === "seller") {
    return ["prep", "execution", "evolution"];
  }
  return ["overview", "execution", "evolution"];
}

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
  experienceMode,
  openedFromSource,
  openedFromAt,
  navigationTargetSection,
  generatedAt,
  onOpenAccount,
  nextRecommendedAccount,
  timelineRefreshKey,
  onLaunchMission,
}: {
  recommendation: Recommendation;
  account?: Account;
  reasoning: NonNullable<ReturnType<typeof reasonForRecommendation>>;
  experienceMode: ExperienceMode;
  openedFromSource?: string | null;
  openedFromAt?: number | null;
  navigationTargetSection?: "overview" | "prep" | "email" | "crm" | "evidence" | "evolution" | "timeline" | "reasoning" | "intelligence" | null;
  generatedAt?: string;
  onOpenAccount: (
    accountId: string,
    source?: string,
    targetSection?: "overview" | "prep" | "email" | "crm" | "evidence" | "evolution" | "timeline" | "reasoning" | "intelligence",
  ) => void;
  nextRecommendedAccount?: { account_id: string; account_name: string } | null;
  timelineRefreshKey?: string;
  onLaunchMission?: (accountId: string, recommendationId?: string | null) => void;
}) {
  const [focus, setFocus] = React.useState<WorkspaceFocus>("summary");
  const [approvalOpen, setApprovalOpen] = React.useState(false);
  const [missionOpen, setMissionOpen] = React.useState(false);
  // Release 1.4B — prefer the top-level Mission surface; fall back to the legacy
  // in-cockpit overlay only when no surface-launch handler is wired.
  const launchMission = React.useCallback(() => {
    if (onLaunchMission) {
      onLaunchMission(recommendation.account_id, recommendation.recommendation_id);
    } else {
      setMissionOpen(true);
    }
  }, [onLaunchMission, recommendation.account_id, recommendation.recommendation_id]);
  const operationsMode = experienceMode === "operations";
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
  const [showContextBanner, setShowContextBanner] = React.useState<boolean>(Boolean(openedFromSource));
  const [openSections, setOpenSections] = React.useState<WorkspaceSection[]>(() => defaultWorkspaceSections(experienceMode));
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `s2a_workspace_sections_v1:${experienceMode}`;
    const fallback = defaultWorkspaceSections(experienceMode);
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        setOpenSections(fallback);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setOpenSections(fallback);
        return;
      }
      const valid = parsed.filter((section): section is WorkspaceSection =>
        typeof section === "string" && WORKSPACE_SECTIONS.includes(section as WorkspaceSection),
      );
      setOpenSections(valid.length ? valid : fallback);
    } catch {
      setOpenSections(fallback);
    }
  }, [experienceMode, recommendation.account_id]);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(`s2a_workspace_sections_v1:${experienceMode}`, JSON.stringify(openSections));
    } catch {
      /* noop */
    }
  }, [experienceMode, openSections]);
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.info("[account-routing]", {
        stage: "Action Hero render",
        traceStage: "action-hero-render",
        clickedAccountId: recommendation.account_id,
        urlAccountId: null,
        selectedAccountId: recommendation.account_id,
        activeAccountId: recommendation.account_id,
        renderedAccountId: recommendation.account_id,
        source: openedFromSource ?? "workspace-cockpit",
        event: "workspace cockpit rendered",
        accountId: recommendation.account_id,
        accountName: recommendation.account_name,
      });
      console.info("[account-routing]", {
        stage: "workspace-render",
        traceStage: "workspace-render",
        clickedAccountId: recommendation.account_id,
        urlAccountId: null,
        selectedAccountId: recommendation.account_id,
        activeAccountId: recommendation.account_id,
        renderedAccountId: recommendation.account_id,
        source: openedFromSource ?? "workspace-cockpit",
        event: "workspace final render",
        accountId: recommendation.account_id,
        accountName: recommendation.account_name,
      });
    }
    setShowContextBanner(Boolean(openedFromSource));
    if (!openedFromSource) return;
    const t = window.setTimeout(() => setShowContextBanner(false), 6000);
    return () => window.clearTimeout(t);
  }, [openedFromAt, openedFromSource, recommendation.account_id]);
  React.useEffect(() => {
    if (!navigationTargetSection) return;
    setOpenSections((prev) => {
      if (operationsMode) {
        return prev.includes(navigationTargetSection) ? prev : [...prev, navigationTargetSection];
      }
      return [navigationTargetSection];
    });
  }, [navigationTargetSection, operationsMode]);
  React.useEffect(() => {
    if (experienceMode !== "seller") return;
    trackSellerMetric("workspace_loaded", {
      account_id: recommendation.account_id,
      recommendation_id: recommendation.recommendation_id,
      opened_from: openedFromSource ?? null,
    });
  }, [experienceMode, recommendation.account_id, recommendation.recommendation_id, openedFromSource]);
  // Release 1.4B — open the guided mission when this account's workspace mounts
  // in response to a "Start Mission" request from the queue/another surface, and
  // react to live requests for the already-rendered account.
  React.useEffect(() => {
    if (consumeMissionRequest(recommendation.account_id)) setMissionOpen(true);
    return subscribeMissionRequests((accountId) => {
      if (accountId === recommendation.account_id) {
        consumeMissionRequest(accountId);
        setMissionOpen(true);
      }
    });
  }, [recommendation.account_id]);
  const sectionOpen = React.useCallback((section: WorkspaceSection) => openSections.includes(section), [openSections]);
  const toggleSection = React.useCallback(
    (section: WorkspaceSection) => {
      setOpenSections((prev) => {
        if (operationsMode) {
          return prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section];
        }
        return prev.includes(section) ? [] : [section];
      });
    },
    [operationsMode],
  );
  const openSection = React.useCallback(
    (section: WorkspaceSection) => {
      setOpenSections((prev) => {
        if (operationsMode) {
          return prev.includes(section) ? prev : [...prev, section];
        }
        return [section];
      });
    },
    [operationsMode],
  );
  const evidenceTop = React.useMemo(() => {
    const items = recommendation.evidence ?? [];
    if (!items.length) return null;
    const score = (p: string, strength: number) => {
      const pol = p.toLowerCase();
      const polarityWeight = pol.startsWith("neg") ? 3 : pol.startsWith("pos") ? 1 : 2;
      return polarityWeight * 100 + Math.round((strength || 0) * 100);
    };
    return [...items].sort((a, b) => score(b.polarity, b.strength) - score(a.polarity, a.strength))[0];
  }, [recommendation.evidence]);
  const evidenceUpdated = formatTimestamp(generatedAt) || "â€”";
  const actionWhy = reasoning.reasons.slice(0, 3).map((r) => r.text);

  // Brief, transient focus highlight so users see the click had an effect.
  React.useEffect(() => {
    if (!focus) return;
    const t = window.setTimeout(() => setFocus(null), 2400);
    return () => window.clearTimeout(t);
  }, [focus, openSections]);

  const goto = (next: WorkspaceSection, nextFocus: WorkspaceFocus) => {
    openSection(next);
    setFocus(nextFocus);
    if (experienceMode === "seller") {
      if (next === "prep") {
        trackSellerMetric("conversation_prep_opened", { account_id: recommendation.account_id, source: openedFromSource ?? null });
      } else if (next === "crm") {
        trackSellerMetric("crm_note_opened", { account_id: recommendation.account_id, source: openedFromSource ?? null });
      }
    }
    cockpitRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onOpenAccountClick = () => {
    goto("overview", "summary");
    // Also surface the full account detail panel so deeper review + approval
    // controls remain available without changing the architecture.
    onOpenAccount(recommendation.account_id, "Action Hero", "overview");
  };

  return (
    <div ref={cockpitRef} className="flex h-full flex-col rounded-xl border border-edge bg-surface2/35 p-3 ambient-glow">
      {/* Action Hero â€” first decision surface */}
      <div className="rounded-lg border border-edge-soft surface-warm p-3.5">
        {showContextBanner ? (
          <div className="mb-2 rounded-md border border-brand-bright/35 bg-brand/[0.08] px-2.5 py-1 text-[10.5px] text-brand-bright">
            Viewing account <span className="font-semibold">{recommendation.account_name}</span>
            <span className="mx-1 text-edge">Â·</span>
            Opened from <span className="font-semibold">{openedFromSource}</span>
          </div>
        ) : null}
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Action hero</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="text-[19px] font-semibold leading-tight tracking-tight text-ink">{recommendation.account_name}</div>
          <Badge label={`Priority #${recommendation.priority_rank}`} tone="brand" />
          <RecommendationSeverityBadge accountId={recommendation.account_id} refreshKey={timelineRefreshKey} />
          <Badge label={`Risk ${risk}`} tone={risk === "High" ? "risk" : risk === "Medium" ? "warn" : "ok"} />
        </div>
        <p className="mt-2 text-[12.5px] text-muted">
          Recommended action: <span className="font-semibold text-ink">{reasoning.action.label}</span>
        </p>
        <div className="mt-2 rounded-lg border border-edge bg-bg/30 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Why this account matters</div>
          <ul className="mt-1 space-y-0.5 text-[11px] text-muted">
            {actionWhy.map((line, idx) => (
              <li key={`why-${idx}`}>â€¢ {line}</li>
            ))}
          </ul>
        </div>
        <LifecycleRibbon state={lifecycle} />
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={launchMission}
            className={cx(
              "px-3 py-1.5 text-[12px]",
              experienceMode === "seller" ? "btn btn-primary" : "btn btn-outline-primary",
            )}
            title="Begin the guided seller mission for this account"
          >
            <Rocket size={13} /> Start Mission
          </button>
          <button type="button" onClick={onOpenAccountClick} className={cx(
            "px-3 py-1.5 text-[12px]",
            experienceMode === "seller" ? "btn btn-outline-primary" : "btn btn-primary",
          )}>
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

      {/* Recommendation evolution â€” immediately below Action Hero */}
      <div className="mt-2 rounded-lg border border-edge bg-surface2/45 p-2.5">
        <button
          type="button"
          onClick={() => toggleSection("evolution")}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={sectionOpen("evolution")}
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-faint">Recommendation evolution</div>
          <span className="text-[10px] text-muted">{sectionOpen("evolution") ? "Collapse" : "Expand"}</span>
        </button>
        {sectionOpen("evolution") ? (
          <div className="mt-2 space-y-2">
            <RecommendationEvolutionPanel
              accountId={recommendation.account_id}
              fallbackAction={reasoning.action.label}
              fallbackRank={recommendation.priority_rank}
              refreshKey={timelineRefreshKey}
            />
            <WhyRecommendationChanged accountId={recommendation.account_id} refreshKey={timelineRefreshKey} />
          </div>
        ) : null}
      </div>

      {/* Focus-first accordion workspace */}
      <div className="mt-2 space-y-2">
        {/* Phase 16A â€” Action Execution Simulator. Sits immediately after the
            Action Hero / Recommendation Evolution block so the workspace flow
            reads: Signal â†’ Recommendation â†’ Approval â†’ Execute â†’ Outcome.
            Persistence + ledger writes happen inside ActionExecutionPanel via
            `@/lib/executionEngine`. No backend or contract changes. */}
        <WorkspaceAccordion
          title="Action execution"
          summary="Execute the approved recommendation through a simulated outreach â†’ meeting â†’ outcome loop"
          open={sectionOpen("execution")}
          onToggle={() => toggleSection("execution")}
        >
          <ActionExecutionPanel
            recommendation={recommendation}
            reasoning={reasoning}
            lifecycle={lifecycle}
          />
        </WorkspaceAccordion>

        <WorkspaceAccordion
          title="Overview"
          summary={recommendation.priority_reason}
          open={sectionOpen("overview")}
          onToggle={() => toggleSection("overview")}
        >
          <OverviewTab recommendation={recommendation} account={account} reasoning={reasoning} focused={focus === "summary"} />
        </WorkspaceAccordion>

        <WorkspaceAccordion
          title="Conversation prep"
          summary="Talking points, discovery questions, and commitments"
          open={sectionOpen("prep")}
          onToggle={() => toggleSection("prep")}
        >
          <ConversationPrepTab recommendation={recommendation} account={account} reasoning={reasoning} focused={focus === "prep"} />
        </WorkspaceAccordion>

        <WorkspaceAccordion
          title="Email draft"
          summary="Prepared outreach message"
          open={sectionOpen("email")}
          onToggle={() => toggleSection("email")}
        >
          <EmailDraftTab recommendation={recommendation} account={account} reasoning={reasoning} />
        </WorkspaceAccordion>

        <WorkspaceAccordion
          title="CRM update"
          summary="Suggested note, owner, and follow-up date"
          open={sectionOpen("crm")}
          onToggle={() => toggleSection("crm")}
        >
          <CrmUpdateTab recommendation={recommendation} reasoning={reasoning} generatedAt={generatedAt} focused={focus === "crm"} />
        </WorkspaceAccordion>

        <WorkspaceAccordion
          title="Evidence"
          summary={`${recommendation.evidence.length} signals Â· highest ${evidenceTop?.label ?? "â€”"} Â· updated ${evidenceUpdated}`}
          open={sectionOpen("evidence")}
          onToggle={() => toggleSection("evidence")}
        >
          <EvidenceTab recommendation={recommendation} generatedAt={generatedAt} focused={focus === "evidence"} />
        </WorkspaceAccordion>

        <WorkspaceAccordion
          title="Account intelligence"
          summary={`${account?.segment ? titleCase(account.segment) : "â€”"} Â· ${account?.region ? titleCase(account.region) : "â€”"} Â· Renewal ${account?.renewal_days ?? "â€”"}d`}
          open={sectionOpen("intelligence")}
          onToggle={() => toggleSection("intelligence")}
        >
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <MiniStat label="Industry" value={account?.industry ? titleCase(account.industry) : "â€”"} />
            <MiniStat label="Segment" value={account?.segment ? titleCase(account.segment) : "â€”"} />
            <MiniStat label="Region" value={account?.region ? titleCase(account.region) : "â€”"} />
            <MiniStat label="Investment" value={inrCompact(account?.current_month_spend ?? 0)} />
            <MiniStat label="Adoption" value={`${account?.product_usage_score ?? "â€”"}`} />
            <MiniStat label="Engagement" value={`${account?.engagement_score ?? "â€”"}`} />
            <MiniStat label="Support risk" value={`${account?.support_risk_score ?? "â€”"}`} />
            <MiniStat label="Renewal window" value={`${account?.renewal_days ?? "â€”"}d`} />
          </div>
        </WorkspaceAccordion>

        <WorkspaceAccordion
          title="Timeline"
          summary="Chronological account events"
          open={sectionOpen("timeline")}
          onToggle={() => toggleSection("timeline")}
        >
          <AccountTimeline accountId={recommendation.account_id} refreshKey={timelineRefreshKey} />
        </WorkspaceAccordion>

        <WorkspaceAccordion
          title="Reasoning"
          summary="Historical reasoning trail"
          open={sectionOpen("reasoning")}
          onToggle={() => toggleSection("reasoning")}
        >
          <ReasoningTrail accountId={recommendation.account_id} refreshKey={timelineRefreshKey} />
        </WorkspaceAccordion>
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

      {missionOpen ? (
        <SellerMissionControl
          recommendation={recommendation}
          account={account}
          reasoning={reasoning}
          experienceMode={experienceMode}
          generatedAt={generatedAt}
          nextAccount={nextRecommendedAccount ?? null}
          onOpenAccount={(accountId, source) => onOpenAccount(accountId, source ?? "Mission Complete", "overview")}
          onClose={() => setMissionOpen(false)}
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
            <MiniStat label="Segment" value={account?.segment ? titleCase(account.segment) : "â€”"} />
            <MiniStat label="Industry" value={account?.industry ? titleCase(account.industry) : "â€”"} />
            <MiniStat label="Region" value={account?.region ? titleCase(account.region) : "â€”"} />
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
        <p className="mt-1.5 text-[10px] text-faint">Growth potential: {account?.growth_potential_score ?? "â€”"}</p>
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
          Ready for seller review â€” Objective, Discovery questions, and Commitment to secure are highlighted below.
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
              <li key={`why-${idx}`}>â€¢ {s}</li>
            ))}
          </ul>
        </WorkspaceCard>

        <WorkspaceCard title="Recommended talk track" icon={<MessageSquare size={12} />}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">Discuss</div>
          <ul className="mt-0.5 space-y-1 text-[11px] text-muted">
            {talkTrack.slice(0, 3).map((line, idx) => (
              <li key={`talk-${idx}`}>â€¢ {line}</li>
            ))}
          </ul>
          <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">Validate</div>
          <ul className="mt-0.5 space-y-1 text-[11px] text-muted">
            {validatePoints.map((line, idx) => (
              <li key={`val-${idx}`}>â€¢ {line}</li>
            ))}
          </ul>
          {avoidPoints.length > 0 ? (
            <>
              <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">Avoid</div>
              <ul className="mt-0.5 space-y-1 text-[11px] text-muted">
                {avoidPoints.map((line, idx) => (
                  <li key={`avoid-${idx}`}>â€¢ {line}</li>
                ))}
              </ul>
            </>
          ) : null}
        </WorkspaceCard>

        <FocusRing focused={focused}>
          <WorkspaceCard title="Discovery questions" icon={<ListChecks size={12} />}>
            <ul className="space-y-1 text-[11px] text-muted">
              {discovery.map((q, idx) => (
                <li key={`disc-${idx}`}>â€¢ {q}</li>
              ))}
            </ul>
          </WorkspaceCard>
        </FocusRing>

        <WorkspaceCard title="Likely objections & response guidance" icon={<ShieldAlert size={12} />}>
          <ul className="space-y-1.5 text-[11px] text-muted">
            {objections.map((o, idx) => (
              <li key={`obj-${idx}`} className="rounded border border-edge-soft bg-bg/30 px-1.5 py-1">
                <div className="text-[10px] font-semibold text-ink">â€œ{o.objection}â€</div>
                <div className="mt-0.5 text-[10px] text-muted">â†’ {o.response}</div>
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
              <li key={`succ-${idx}`}>â€¢ {s}</li>
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
        <span className="text-[10px] text-faint">Not auto-sent â€” human approval required before outreach.</span>
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
          CRM update prepared â€” review the note, next step, and follow-up date below.
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

function WorkspaceAccordion({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-edge bg-surface2/35">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface2/50"
      >
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{title}</div>
          {!open && summary ? <div className="mt-0.5 truncate text-[11px] text-muted">{summary}</div> : null}
        </div>
        <span className="text-[10px] text-muted">{open ? "Collapse" : "Expand"}</span>
      </button>
      {open ? <div className="border-t border-edge px-3 py-2.5">{children}</div> : null}
    </section>
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
                <li key={`gc-${i}`}>â€¢ {c}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-lg border border-edge bg-bg/30 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">Reviewer note (optional)</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add context for the audit trailâ€¦"
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
              connector pipeline (Prepared â†’ Approved â†’ Ready for CRM â†’ Written â†’ Verified).
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
          Decisions persist in the local Decision Ledger. No backend writeback yet â€” Phase 14 will
          forward approved actions to the CRM connector.
        </p>
      </div>
    </div>
  );
}

// -- Phase 13 lifecycle ribbon (Detected â†’ â€¦ â†’ Outcome captured) -------------
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
                {done ? "âœ“" : i + 1}
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
                â†’
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
      /* clipboard unavailable â€” no-op */
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
  const profile = parts.length ? parts.join(" Â· ") : "Account";
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
  return `${profile} â€” ${tail}. ${rec.priority_reason}`;
}

// -- Phase 11 artifact derivations (UI only; no scoring impact) --------------

function executiveSummaryLine(
  rec: Recommendation,
  reasoning: NonNullable<ReturnType<typeof reasonForRecommendation>>,
): string {
  return `Priority #${rec.priority_rank} â€” ${rec.account_name}. ${reasoning.action.label} to ${reasoning.action.value.toLowerCase()} (confidence ${pct(rec.confidence_score)}, ~${reasoning.estimatedMinutes}m).`;
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
        objection: "We've intentionally scaled back â€” this isn't a priority right now.",
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
    return `Quick check-in on ${rec.account_name} â€” protecting your outcomes`;
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
  return `${rec.evidence.length} signals across ${sources.size} system${sources.size === 1 ? "" : "s"} â€” ${neg} risk, ${pos} opportunity.`;
}

// -- Phase 11 guided demo mode -----------------------------------------------

interface DemoStep { id: string; title: string; body: string }

const DEMO_STEPS: DemoStep[] = [
  { id: "brief", title: "Step 1 Â· Review morning brief", body: "Skim the AI Chief of Staff narrative and the Executive Snapshot rail to see what changed overnight." },
  { id: "select", title: "Step 2 Â· Select the top account", body: "Click the #1 row in the Work Queue to load that account's execution workspace on the right." },
  { id: "evidence", title: "Step 3 Â· Review evidence", body: "Click Review Evidence in the workspace header to inspect signals, sources, and confidence behind the recommendation." },
  { id: "prep", title: "Step 4 Â· Prepare outreach", body: "Click Prepare Outreach. Walk through Objective, Why Now, Discovery questions, Objections, and Commitment to secure." },
  { id: "crm", title: "Step 5 Â· Review CRM note", body: "Click Draft CRM Note. Validate the suggested note, next step, owner, priority, and follow-up date." },
  { id: "approve", title: "Step 6 Â· Submit for approval", body: "Click Mark for Approval to open the human-in-the-loop drawer. Approve, reject, or request review â€” write-back stays human-gated." },
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
    <div id={id} className="overflow-hidden rounded-xl border border-edge bg-surface/20">
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

function CompactKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "risk" | "opp" | "warn" | "neutral";
}) {
  const valueTone =
    tone === "risk"
      ? "text-risk"
      : tone === "opp"
        ? "text-accent"
        : tone === "warn"
          ? "text-warn"
          : "text-ink";
  return (
    <div className="rounded-md border border-edge/70 bg-surface1/40 px-2 py-1.5">
      <div className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</div>
      <div className={cx("mt-0.5 truncate text-[12px] font-semibold", valueTone)} title={value}>
        {value}
      </div>
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
    .map((line) => line.replace(/^[-â€¢\d.)\s]+/, "").trim())
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
        <LedgerCount label="Approved ï¿½ not executed" value={summary.approvedNotExecuted} />
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
              <div className="truncate text-faint">{e.outcome ? OUTCOME_LABEL[e.outcome] : "ï¿½"}</div>
              <div className="text-right text-faint">{formatTimestamp(e.created_at) || "ï¿½"}</div>
            </div>
          ))
        )}
      </div>
      <p className="mt-2 text-[10px] text-faint">
        Ledger persists in browser storage (Phase 13 demo). The API surface is backend-swappable for
        Phase 14 ï¿½ same record shape, real database.
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
              <span className={cx("text-[12px]", s.complete ? "text-accent" : "text-faint")}>ï¿½</span>
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
