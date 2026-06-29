"use client";

import * as React from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import type {
  Account,
  AccountDetail,
  DecisionComparison,
  DecisionCredentialPayload,
  DecisionProviderStatus,
  DecisionProviderTestResult,
  ExternalSignalsResult,
  HealthResponse,
  HubspotStatus,
  HubspotWriteback as Writeback,
  MetaResponse,
  PortfolioAgentReport,
  Recommendation,
  RecommendationResponse,
  SystemConfigResponse,
} from "@/lib/types";
import { cx } from "@/lib/format";
import { briefFocusAccountIds, type BriefExternalContext } from "@/lib/reasoning";
import { LOADING_PHASES } from "@/lib/evaluation";
import { fetchOverlay, overlayFor, type AIOverlayMap } from "@/lib/aiOverlay";
import { AIEnhancedBanner } from "@/components/AIReasoningStatus";
import { Header, type AppView } from "@/components/Header";
import { LeftPanel } from "@/components/LeftPanel";
import { CrmIntegrationCard } from "@/components/CrmIntegrationCard";
import { HubspotWriteback } from "@/components/HubspotWriteback";
import { RecommendationCard } from "@/components/RecommendationCard";
import { AgentPipeline } from "@/components/AgentTrace";
import { AccountDetailPanel } from "@/components/AccountDetailPanel";
import { MultiAgentPanel } from "@/components/MultiAgentPanel";
import { OutsideInSignals } from "@/components/OutsideInSignals";
import { EvidenceLedger } from "@/components/EvidenceChips";
import { ConfidenceRing } from "@/components/ConfidenceMeter";
import { ConfidenceExplain } from "@/components/ConfidenceExplain";
import { GovernanceBadge, GovernanceAssurance } from "@/components/GovernanceBadge";
import { ApprovalControls } from "@/components/ApprovalControls";
import { DraftPanel } from "@/components/DraftPanel";
import { DecisionLedgerView } from "@/components/DecisionLedger";
import { RuntimeTrace } from "@/components/RuntimeTrace";
import { WorkflowPreview } from "@/components/WorkflowPreview";
import { RiskOpportunityMatrix } from "@/components/RiskOpportunityMatrix";
import { DecisionWorkspacePreview } from "@/components/DecisionWorkspacePreview";
import { NvidiaReadyCard } from "@/components/NvidiaReadyCard";
import { KpiStrip } from "@/components/KpiStrip";
import { CommandCenter } from "@/components/command/CommandCenter";
import { WhyThisAccount } from "@/components/WhyThisAccount";
import { buildAccountSelectionContext, type AccountSelectionContext } from "@/lib/accountSelectionContext";
import { ExecutiveMorningLanding } from "@/components/landing/ExecutiveMorningLanding";
import { EvaluationView } from "@/components/evaluation/EvaluationView";
import { WorkspaceQuery } from "@/components/WorkspaceQuery";
import { ThinkingSequence } from "@/components/ThinkingSequence";
import { Card, PanelTitle } from "@/components/ui";
import {
  normalizePreferredSection,
  type OpenAccountFromSurfaceInput,
  type WorkspaceSectionTarget,
} from "@/lib/accountNavigation";
import { loadExperienceMode, saveExperienceMode } from "@/lib/experienceMode";

const DEFAULT_QUERY = "Which SMB accounts need attention this week and why?";
const DEMO_MODE_KEY = "s2a_demo_mode";
const SELECTED_ACCOUNT_KEY = "s2a_selected_account_v1";

// Distil one account's outside-in signal result into a single cautious takeaway
// for the portfolio brief. Supporting context only — never a ranking driver.
function toBriefExternalContext(d: ExternalSignalsResult): BriefExternalContext | null {
  if (!d || !d.enabled) return null;
  const sourceCount = d.sources?.length ?? d.signals?.length ?? 0;
  const raw = (d.seller_takeaway || d.brief?.fused_insight || d.summary || "").trim();
  if (!raw || sourceCount === 0) return null;
  const top = d.sources?.[0];
  return {
    takeaway: raw.length > 200 ? `${raw.slice(0, 197).trimEnd()}…` : raw,
    sourceCount,
    topSourceTitle: top?.title,
    topSourceUrl: top?.url ?? null,
  };
}

function normalizeAccountId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim().toUpperCase();
  return normalized || null;
}

function recommendationAccountCandidates(rec: Recommendation): string[] {
  const extended = rec as Recommendation & { account?: { id?: string }; id?: string };
  return [
    normalizeAccountId(rec.account_id),
    normalizeAccountId(extended.account?.id),
    normalizeAccountId(extended.id),
  ].filter((v): v is string => Boolean(v));
}

function findRecommendationByAccountId(
  recommendations: Recommendation[],
  requestedId: string,
  accountsById?: Record<string, Account>,
): Recommendation | null {
  const normalizedRequested = normalizeAccountId(requestedId);
  if (!normalizedRequested) return null;
  const byId = recommendations.find((r) =>
    recommendationAccountCandidates(r).some((candidate) => candidate === normalizedRequested),
  );
  if (byId) return byId;

  if (!accountsById) return null;
  const accountName =
    accountsById[requestedId]?.account_name ??
    Object.values(accountsById).find((a) => normalizeAccountId(a.account_id) === normalizedRequested)?.account_name;
  if (!accountName) return null;
  const normalizedName = accountName.trim().toLowerCase();
  return recommendations.find((r) => r.account_name.trim().toLowerCase() === normalizedName) ?? null;
}

export default function Page() {
  const [meta, setMeta] = React.useState<MetaResponse | null>(null);
  const [health, setHealth] = React.useState<HealthResponse | null>(null);
  const [accounts, setAccounts] = React.useState<Record<string, Account>>({});
  const [bootError, setBootError] = React.useState<string | null>(null);
  const [systemConfig, setSystemConfig] = React.useState<SystemConfigResponse | null>(null);
  const [decisionStatus, setDecisionStatus] = React.useState<DecisionProviderStatus | null>(null);

  const [query, setQuery] = React.useState(DEFAULT_QUERY);
  const [limit, setLimit] = React.useState(10);
  const [loading, setLoading] = React.useState(false);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RecommendationResponse | null>(null);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(null);
  const [redirectContext, setRedirectContext] = React.useState<{
    accountId: string;
    source: string;
    at: number;
  } | null>(null);
  const [urlAccountId, setUrlAccountId] = React.useState<string | null>(null);
  const [persistedAccountId, setPersistedAccountId] = React.useState<string | null>(null);
  const [showWorkspaceRedirectBanner, setShowWorkspaceRedirectBanner] = React.useState(false);
  const [details, setDetails] = React.useState<Record<string, AccountDetail>>({});
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [externalSignals, setExternalSignals] = React.useState<Record<string, ExternalSignalsResult>>({});
  const [esLoading, setEsLoading] = React.useState(false);
  const [approvalBusy, setApprovalBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);

  const [demoMode, setDemoMode] = React.useState(false);
  const autoRanRef = React.useRef(false);

  // App journey (P10): Landing → Command Center → detailed Workspace.
  const [view, setView] = React.useState<AppView>("landing");
  // When opening an account from the cockpit before a run completes, remember
  // which account to select once recommendations arrive.
  const pendingAccountRef = React.useRef<string | null>(null);

  // -- HubSpot test CRM integration state ---------------------------------
  const [hubStatus, setHubStatus] = React.useState<HubspotStatus | null>(null);
  const [hubBusy, setHubBusy] = React.useState<"test" | "seed" | "sync" | "revert" | null>(null);
  const [hubError, setHubError] = React.useState<string | null>(null);
  const [writebacks, setWritebacks] = React.useState<Record<string, Writeback[]>>({});
  const [wbBusy, setWbBusy] = React.useState<"task" | "note" | null>(null);
  const [wbError, setWbError] = React.useState<string | null>(null);

  // Phase 6 · client-side AI overlay state. Populated only when the user
  // has an active BYOK provider; never affects ranking/scoring/governance.
  const [aiOverlay, setAiOverlay] = React.useState<AIOverlayMap | null>(null);
  const [aiOverlayLoading, setAiOverlayLoading] = React.useState(false);
  // Phase 7 · Portfolio Agent (Chief-of-Staff) summary. Read-only: never
  // re-ranks, never persists. Fetched after each workflow run.
  const [portfolio, setPortfolio] = React.useState<PortfolioAgentReport | null>(null);

  const refreshHubStatus = React.useCallback(async (probe = false) => {
    try {
      const s = await api.hubspotStatus(probe);
      setHubStatus(s);
      return s;
    } catch {
      return null;
    }
  }, []);

  // Restore demo-mode preference (default OFF for stable local dev).
  React.useEffect(() => {
    try {
      setDemoMode(window.localStorage.getItem(DEMO_MODE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("accountId") ?? params.get("account") ?? params.get("account_id");
    setUrlAccountId(fromUrl);
    try {
      setPersistedAccountId(window.localStorage.getItem(SELECTED_ACCOUNT_KEY));
    } catch {
      setPersistedAccountId(null);
    }
    if (process.env.NODE_ENV !== "production") {
      console.info("[account-routing]", {
        stage: "URL sync",
        clickedAccountId: null,
        event: "url account parsed",
        urlAccountId: normalizeAccountId(fromUrl),
        selectedAccountId: null,
        activeAccountId: null,
        renderedAccountId: null,
        source: "url:init",
        parsedAccountId: normalizeAccountId(fromUrl),
      });
    }
  }, []);

  function toggleDemo(v: boolean) {
    setDemoMode(v);
    try {
      window.localStorage.setItem(DEMO_MODE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  // Bootstrap meta + health, then enrich cards with account industry/segment/region.
  React.useEffect(() => {
    (async () => {
      try {
        const [m, h] = await Promise.all([api.meta(), api.health()]);
        setMeta(m);
        setHealth(h);
      } catch (e) {
        setBootError((e as Error).message);
      }
    })();
    api
      .accounts(200)
      .then((res) =>
        setAccounts(Object.fromEntries(res.accounts.map((a) => [a.account_id, a]))),
      )
      .catch(() => undefined);
    refreshHubStatus(false);
  }, [refreshHubStatus]);

  // Refresh dataset-derived panels (used after a HubSpot sync/revert switches source).
  const refreshDataset = React.useCallback(async () => {
    try {
      const [m, res] = await Promise.all([api.meta(), api.accounts(200)]);
      setMeta(m);
      setAccounts(Object.fromEntries(res.accounts.map((a) => [a.account_id, a])));
    } catch {
      /* non-fatal */
    }
  }, []);

  const requestedAccountId = React.useMemo(
    () =>
      normalizeAccountId(
        redirectContext?.accountId ??
        selectedAccountId ??
        urlAccountId ??
        persistedAccountId ??
        null,
      ),
    [redirectContext?.accountId, selectedAccountId, urlAccountId, persistedAccountId],
  );

  const activeRecommendation = React.useMemo(() => {
    if (!result) return undefined;
    if (!requestedAccountId) {
      if (process.env.NODE_ENV !== "production") {
        console.info("[account-routing]", {
          stage: "Workspace account resolution",
          clickedAccountId: null,
          event: "top-priority fallback executed",
          urlAccountId: normalizeAccountId(urlAccountId),
          selectedAccountId: normalizeAccountId(selectedAccountId),
          activeAccountId: null,
          renderedAccountId: normalizeAccountId(result.recommendations[0]?.account_id ?? null),
          source: "activeRecommendation:no-requested-id",
          reason: "no requested account id",
          fallbackAccountId: result.recommendations[0]?.account_id ?? null,
          fallbackAccountName: result.recommendations[0]?.account_name ?? null,
        });
      }
      return result.recommendations[0];
    }
    const matched = findRecommendationByAccountId(result.recommendations, requestedAccountId, accounts);
    if (matched) return matched;
    // Redirected account should never be auto-overridden by top priority.
    if (normalizeAccountId(redirectContext?.accountId) === requestedAccountId) return undefined;
    if (process.env.NODE_ENV !== "production") {
      console.info("[account-routing]", {
        stage: "Workspace account resolution",
        clickedAccountId: requestedAccountId,
        event: "top-priority fallback executed",
        urlAccountId: normalizeAccountId(urlAccountId),
        selectedAccountId: normalizeAccountId(selectedAccountId),
        activeAccountId: normalizeAccountId(result.recommendations[0]?.account_id ?? null),
        renderedAccountId: normalizeAccountId(result.recommendations[0]?.account_id ?? null),
        source: "activeRecommendation:requested-id-missing",
        reason: "requested id not found in recommendations",
        requestedAccountId,
        fallbackAccountId: result.recommendations[0]?.account_id ?? null,
        fallbackAccountName: result.recommendations[0]?.account_name ?? null,
      });
    }
    return result.recommendations[0];
  }, [result, requestedAccountId, redirectContext?.accountId, accounts]);

  const selectedRec: Recommendation | undefined = activeRecommendation;

  // Phase 15C.5 — Single source of truth: app-level account selection context
  // This context is passed to CommandCenter to eliminate duplicate selection logic.
  const accountSelectionContext = React.useMemo<AccountSelectionContext>(
    () =>
      buildAccountSelectionContext(
        redirectContext,
        selectedAccountId,
        urlAccountId,
        persistedAccountId,
        activeRecommendation,
      ),
    [redirectContext, selectedAccountId, urlAccountId, persistedAccountId, activeRecommendation],
  );
  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    console.info("[account-routing]", {
      stage: "page-resolvedAccountContext",
      traceStage: "page-resolvedAccountContext",
      requestedAccountId: accountSelectionContext.requestedAccountId,
      activeAccountId: accountSelectionContext.activeAccountId,
      renderedAccountId: activeRecommendation?.account_id ?? null,
      selectedAccountId: normalizeAccountId(selectedAccountId),
      urlAccountId: normalizeAccountId(urlAccountId),
      redirectedAccountId: normalizeAccountId(redirectContext?.accountId),
      source: accountSelectionContext.redirectSource ?? "workspace",
      isRedirected: accountSelectionContext.isRedirected,
      event: "resolved account context",
    });
  }, [
    accountSelectionContext.activeAccountId,
    accountSelectionContext.isRedirected,
    accountSelectionContext.redirectSource,
    accountSelectionContext.requestedAccountId,
    activeRecommendation?.account_id,
    redirectContext?.accountId,
    selectedAccountId,
    urlAccountId,
  ]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = requestedAccountId ?? selectedRec?.account_id ?? null;
    if (!persisted) return;
    try {
      window.localStorage.setItem(SELECTED_ACCOUNT_KEY, persisted);
      setPersistedAccountId(persisted);
    } catch {
      /* noop */
    }
  }, [requestedAccountId, selectedRec?.account_id]);

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!result) return;
    console.info("[account-routing]", {
      stage: "Final active account render",
      clickedAccountId: normalizeAccountId(redirectContext?.accountId),
      redirectedAccountId: normalizeAccountId(redirectContext?.accountId),
      urlAccountId: normalizeAccountId(urlAccountId),
      selectedAccountId: normalizeAccountId(selectedAccountId),
      activeAccountId: selectedRec ? normalizeAccountId(selectedRec.account_id) : null,
      renderedAccountId: selectedRec ? normalizeAccountId(selectedRec.account_id) : null,
      source: redirectContext?.source ?? "workspace",
      persistedSelectedAccountId: normalizeAccountId(persistedAccountId),
      resolvedRecommendationAccountId: selectedRec ? normalizeAccountId(selectedRec.account_id) : null,
      resolvedRecommendationName: selectedRec?.account_name ?? null,
    });
  }, [result, redirectContext?.accountId, selectedAccountId, urlAccountId, persistedAccountId, selectedRec]);

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!selectedRec) return;
    console.info("[account-routing]", {
      stage: "Right Rail render",
      traceStage: "right-rail-render",
      clickedAccountId: normalizeAccountId(redirectContext?.accountId),
      event: "rightRailAccount resolved",
      urlAccountId: normalizeAccountId(urlAccountId),
      selectedAccountId: normalizeAccountId(selectedAccountId),
      activeAccountId: normalizeAccountId(selectedRec.account_id),
      renderedAccountId: normalizeAccountId(selectedRec.account_id),
      source: redirectContext?.source ?? "workspace:right-rail",
      accountId: normalizeAccountId(selectedRec.account_id),
      accountName: selectedRec.account_name,
    });
    console.info("[account-routing]", {
      stage: "Action Hero render",
      traceStage: "action-hero-render",
      clickedAccountId: normalizeAccountId(redirectContext?.accountId),
      event: "ActionHero account resolved",
      urlAccountId: normalizeAccountId(urlAccountId),
      selectedAccountId: normalizeAccountId(selectedAccountId),
      activeAccountId: normalizeAccountId(selectedRec.account_id),
      renderedAccountId: normalizeAccountId(selectedRec.account_id),
      source: redirectContext?.source ?? "workspace:action-hero",
      accountId: normalizeAccountId(selectedRec.account_id),
      accountName: selectedRec.account_name,
    });
  }, [selectedRec, redirectContext?.accountId, redirectContext?.source, selectedAccountId, urlAccountId]);

  // Whether the optional outside-in (external) signal layer is enabled on the
  // backend. Defaults to false (the layer is additive and off by default).
  const externalSignalsEnabled = meta?.external_signals?.enabled ?? false;

  // Fetch account detail when selection changes.
  React.useEffect(() => {
    if (!selectedRec) return;
    const accId = selectedRec.account_id;
    if (details[accId]) return;
    let cancelled = false;
    setDetailLoading(true);
    api
      .account(accId)
      .then((d) => {
        if (!cancelled) setDetails((prev) => ({ ...prev, [accId]: d }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRec, details]);

  // Fetch outside-in (external) signals for the selected account when the layer
  // is enabled. Fully decoupled from the recommendation contract; any failure is
  // silent so the workspace is unaffected when external signals are off.
  React.useEffect(() => {
    if (!selectedRec || !externalSignalsEnabled) return;
    const accId = selectedRec.account_id;
    if (externalSignals[accId]) return;
    let cancelled = false;
    setEsLoading(true);
    api
      .externalSignals(accId)
      .then((d) => {
        if (!cancelled) setExternalSignals((prev) => ({ ...prev, [accId]: d }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setEsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRec, externalSignals, externalSignalsEnabled]);

  // Phase 4.3 — prefetch outside-in context for just the brief's spotlight
  // accounts (biggest risk + biggest opportunity) so the Executive Morning Brief
  // can show supporting context without calling external search for the whole
  // book. Cache-backed and capped to ~2 accounts; silent on failure; a no-op
  // when the layer is disabled or before any analysis has run.
  React.useEffect(() => {
    if (!externalSignalsEnabled) return;
    const recs = result?.recommendations ?? [];
    if (recs.length === 0) return;
    const focusIds = briefFocusAccountIds(accounts, recs, true);
    const pending = focusIds.filter((id) => !externalSignals[id]);
    if (pending.length === 0) return;
    let cancelled = false;
    pending.forEach((id) => {
      api
        .externalSignals(id)
        .then((d) => {
          if (!cancelled) setExternalSignals((prev) => (prev[id] ? prev : { ...prev, [id]: d }));
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [externalSignalsEnabled, result, accounts, externalSignals]);

  // Lazily load secret-free system diagnostics the first time the Evaluation &
  // Architecture view is opened. Read-only; silent on failure (the view falls
  // back to meta-derived data).
  React.useEffect(() => {
    if (view !== "evaluation" || systemConfig) return;
    let cancelled = false;
    api
      .systemConfig()
      .then((c) => {
        if (!cancelled) setSystemConfig(c);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [view, systemConfig]);

  // Lazily load secret-free decision-provider status (BYOK) when the Evaluation
  // view is opened. Read-only; silent on failure.
  React.useEffect(() => {
    if (view !== "evaluation" || decisionStatus) return;
    let cancelled = false;
    api
      .decisionProvidersStatus()
      .then((s) => {
        if (!cancelled) setDecisionStatus(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [view, decisionStatus]);

  const compareDecision = React.useCallback(
    (
      accountId: string,
      credentials?: Record<string, DecisionCredentialPayload>,
    ): Promise<DecisionComparison> => api.decisionCompare(accountId, credentials),
    [],
  );

  const testProvider = React.useCallback(
    (payload: {
      provider: string;
      api_key: string;
      model?: string;
      base_url?: string;
    }): Promise<DecisionProviderTestResult> => api.decisionTest(payload),
    [],
  );

  const applyAccountSelection = React.useCallback(
    (
      accountId: string | null,
      recommendationId?: string | null,
      opts?: { clearRedirect?: boolean; source?: string },
    ) => {
      const normalized = normalizeAccountId(accountId);
      if (!normalized) return;
      if (process.env.NODE_ENV !== "production") {
        console.info("[account-routing]", {
          stage: "page-applyAccountSelection",
          traceStage: "page-applyAccountSelection",
          clickedAccountId: normalized,
          event: "selectedAccountId set",
          urlAccountId: normalizeAccountId(urlAccountId),
          selectedAccountId: normalized,
          activeAccountId: normalizeAccountId(selectedRec?.account_id),
          renderedAccountId: normalizeAccountId(selectedRec?.account_id),
          source: opts?.source ?? "applyAccountSelection",
          recommendationId: recommendationId ?? null,
        });
      }
      setSelectedAccountId(normalized);
      if (recommendationId !== undefined) {
        setSelectedId(recommendationId);
      }
      if (opts?.clearRedirect !== false) {
        setRedirectContext(null);
      }
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(SELECTED_ACCOUNT_KEY, normalized);
        } catch {
          /* noop */
        }
        const url = new URL(window.location.href);
        url.searchParams.set("accountId", normalized);
        window.history.replaceState(null, "", url.toString());
        setUrlAccountId(normalized);
        if (process.env.NODE_ENV !== "production") {
          console.info("[account-routing]", {
            stage: "URL sync",
            clickedAccountId: normalized,
            urlAccountId: normalized,
            selectedAccountId: normalized,
            activeAccountId: normalizeAccountId(selectedRec?.account_id),
            renderedAccountId: normalizeAccountId(selectedRec?.account_id),
            source: opts?.source ?? "applyAccountSelection",
            event: "url account synced",
          });
        }
      }
    },
    [selectedRec?.account_id, urlAccountId],
  );

  async function runWorkflow(limitOverride?: number) {
    if (!query.trim() || loading) return;
    const effectiveLimit =
      typeof limitOverride === "number" && Number.isFinite(limitOverride)
        ? limitOverride
        : limit;
    setLoading(true);
    setRunError(null);
    setEditing(false);
    setAiOverlay(null);
    setPortfolio(null);
    try {
      const res = await api.recommendations(query.trim(), effectiveLimit);
      setResult(res);
      const pendingAccountId = pendingAccountRef.current;
      const preferredId = normalizeAccountId(
        pendingAccountId ??
        redirectContext?.accountId ??
        selectedAccountId ??
        urlAccountId ??
        persistedAccountId ??
        null,
      );
      const preferredRec = preferredId
        ? findRecommendationByAccountId(res.recommendations, preferredId, accounts)
        : undefined;
      const initialRec = preferredRec ?? res.recommendations[0];
      setSelectedId(initialRec?.recommendation_id ?? null);
      if (preferredId) {
        setSelectedAccountId(preferredId);
      } else {
        setSelectedAccountId(initialRec?.account_id ?? null);
      }
      // Phase 6 · fire-and-forget AI overlay for the top recommendations.
      // The overlay only fetches when an active BYOK provider has a session
      // key; otherwise it resolves to null and we stay on the deterministic
      // narrative. Failures are swallowed so they never block the cockpit.
      setAiOverlayLoading(true);
      fetchOverlay(res.recommendations, { limit: 3 })
        .then((m) => setAiOverlay(m))
        .catch(() => setAiOverlay(null))
        .finally(() => setAiOverlayLoading(false));
      // Phase 7 · fire-and-forget Portfolio (Chief-of-Staff) agent. Read-only
      // summary across the ranked output; never re-ranks. Failures swallowed.
      api
        .multiAgentPortfolio(query.trim(), effectiveLimit)
        .then((p) => setPortfolio(p))
        .catch(() => setPortfolio(null));
    } catch (e) {
      setRunError((e as Error).message);
      setResult(null);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }

  // Auto-run the default query once after data is ready, either in demo mode or
  // when the Command Center / Evaluation view needs live recommendations to
  // present (cockpit on load, Evaluation Center measured on real output).
  // Read-only generation against the local API.
  React.useEffect(() => {
    if (autoRanRef.current) return;
    if (!demoMode && view !== "command" && view !== "evaluation") return;
    if (!meta || result || loading) return;
    autoRanRef.current = true;
    runWorkflow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, view, meta, result, loading]);

  // Resolve a pending "open account" intent once recommendations are available.
  React.useEffect(() => {
    if (!result) return;
    const acc = pendingAccountRef.current;
    if (!acc) return;
    const rec = findRecommendationByAccountId(result.recommendations, acc, accounts);
    if (rec) {
      applyAccountSelection(rec.account_id, rec.recommendation_id, { clearRedirect: false });
      setEditing(false);
    }
    pendingAccountRef.current = null;
  }, [result, applyAccountSelection, accounts]);

  // Open an account in the detailed workspace from the cockpit (matrix dot / row).
  const openAccountFromSurface = React.useCallback(
    ({ accountId, source, preferredSection, mode }: OpenAccountFromSurfaceInput) => {
      const normalizedAccountId = normalizeAccountId(accountId);
      if (!normalizedAccountId) return;
      if (process.env.NODE_ENV !== "production") {
        console.info("[account-routing]", {
          stage: "page-openAccountFromSurface",
          traceStage: "page-openAccountFromSurface",
          clickedAccountId: normalizedAccountId,
          urlAccountId: normalizeAccountId(urlAccountId),
          selectedAccountId: normalizeAccountId(selectedAccountId),
          activeAccountId: normalizeAccountId(selectedRec?.account_id),
          renderedAccountId: normalizeAccountId(selectedRec?.account_id),
          source,
          event: "redirect received",
          redirectedAccountId: normalizedAccountId,
          preferredSection: preferredSection ?? null,
          mode: mode ?? null,
        });
      }
      const targetSection = normalizePreferredSection(preferredSection);
      if (mode) {
        const previous = loadExperienceMode();
        if (mode !== previous) saveExperienceMode(mode, previous);
      }
      setRedirectContext({ accountId: normalizedAccountId, source, at: Date.now() });
      if (process.env.NODE_ENV !== "production") {
        console.info("[account-routing]", {
          stage: "Redirect context creation",
          clickedAccountId: normalizedAccountId,
          urlAccountId: normalizeAccountId(urlAccountId),
          selectedAccountId: normalizeAccountId(selectedAccountId),
          activeAccountId: normalizeAccountId(selectedRec?.account_id),
          renderedAccountId: normalizeAccountId(selectedRec?.account_id),
          source,
          event: "redirect context created",
          redirectedAccountId: normalizedAccountId,
        });
      }
      setShowWorkspaceRedirectBanner(true);
      setView("command");
      const rec = result ? findRecommendationByAccountId(result.recommendations, normalizedAccountId, accounts) : null;
      if (rec) {
        applyAccountSelection(rec.account_id, rec.recommendation_id, { clearRedirect: false, source });
        setEditing(false);
        pendingAccountRef.current = null;
      } else {
        applyAccountSelection(normalizedAccountId, null, { clearRedirect: false, source });
        pendingAccountRef.current = normalizedAccountId;
        if (!loading) {
          const fullCoverageLimit = Math.max(
            limit,
            50,
            Object.keys(accounts).length,
            meta?.dataset.accounts ?? 0,
          );
          const rerunLimit = Math.min(50, fullCoverageLimit);
          if (process.env.NODE_ENV !== "production") {
            console.info("[account-routing]", {
              event: "redirect account missing in current recommendation set",
              redirectedAccountId: normalizedAccountId,
              rerunLimit,
            });
          }
          runWorkflow(rerunLimit);
        }
      }
      try {
        window.localStorage.setItem(
          "s2a_account_nav_v1",
          JSON.stringify({
            accountId,
            normalizedAccountId,
            source,
            targetSection: targetSection ?? null,
            mode: mode ?? null,
            timestamp: new Date().toISOString(),
          }),
        );
      } catch {
        /* noop */
      }
      trackWorkflowEvent("account_opened", {
        account_id: accountId,
        normalized_account_id: normalizedAccountId,
        source,
        target_section: targetSection ?? null,
        mode: mode ?? null,
      });
    },
    [
      accounts,
      applyAccountSelection,
      limit,
      loading,
      meta?.dataset.accounts,
      result,
      runWorkflow,
      selectedAccountId,
      selectedRec?.account_id,
      urlAccountId,
    ],
  );

  function openAccount(
    accountId: string,
    source = "Command Center",
    targetSection?: WorkspaceSectionTarget,
  ) {
    openAccountFromSurface({
      accountId,
      source,
      preferredSection: targetSection,
    });
  }

  React.useEffect(() => {
    if (view !== "workspace" || !redirectContext) return;
    setShowWorkspaceRedirectBanner(true);
    const t = window.setTimeout(() => setShowWorkspaceRedirectBanner(false), 6000);
    return () => window.clearTimeout(t);
  }, [view, redirectContext]);

  const runAccountRoutingHarness = React.useCallback(() => {
    const recommendations = result?.recommendations ?? [];
    const cases = [
      { accountName: "Simple", source: "Portfolio Pulse" },
      { accountName: "Halcyon Goods", source: "Most Significant Risk" },
      { accountName: "Summit Mart", source: "Most Significant Opportunity" },
      { accountName: "Curefoods", source: "Recommended Actions" },
      { accountName: "Unacademy", source: "Seller Briefing" },
    ];
    const results = cases.map((tc) => {
      const requestedAccount = Object.values(accounts).find((a) => a.account_name === tc.accountName);
      const requestedAccountId = requestedAccount?.account_id ?? null;
      const match = requestedAccountId
        ? recommendations.find((r) => r.account_id === requestedAccountId)
        : null;
      const selected = requestedAccountId;
      const workspace = match?.account_id ?? null;
      const rightRail = workspace;
      const fallbackUsed = Boolean(requestedAccountId && !match);
      return {
        test_case: `openAccountFromSurface(${tc.accountName}, ${tc.source})`,
        selectedAccountId_matches: selected === requestedAccountId,
        workspaceAccount_matches: workspace === requestedAccountId,
        rightRailAccount_matches: rightRail === requestedAccountId,
        no_fallback_to_top_priority: requestedAccountId ? !fallbackUsed : false,
      };
    });
    if (typeof console !== "undefined" && console.table) {
      console.table(results);
    }
    return results;
  }, [accounts, result]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    (window as Window & { s2aRunAccountRoutingHarness?: () => unknown[] }).s2aRunAccountRoutingHarness =
      runAccountRoutingHarness;
    return () => {
      delete (window as Window & { s2aRunAccountRoutingHarness?: () => unknown[] }).s2aRunAccountRoutingHarness;
    };
  }, [runAccountRoutingHarness]);

  

  function trackWorkflowEvent(
    event: "account_opened" | "recommendation_action_clicked" | "workspace_loaded" | "conversation_prep_opened" | "crm_note_opened",
    detail: Record<string, unknown>,
  ) {
    if (typeof window === "undefined") return;
    const payload = { event, timestamp: new Date().toISOString(), ...detail };
    try {
      const key = "s2a_seller_metrics_v1";
      const raw = window.localStorage.getItem(key);
      const list = raw ? (JSON.parse(raw) as unknown[]) : [];
      window.localStorage.setItem(key, JSON.stringify([...list, payload].slice(-200)));
    } catch {
      /* noop */
    }
    if (console?.info) console.info("[seller-metric]", payload);
  }

  function patchRec(updated: Recommendation) {
    setResult((prev) =>
      prev
        ? {
            ...prev,
            recommendations: prev.recommendations.map((r) =>
              r.recommendation_id === updated.recommendation_id ? updated : r,
            ),
          }
        : prev,
    );
  }

  async function approve() {
    if (!selectedRec) return;
    setApprovalBusy(true);
    try {
      const res = await api.approve(selectedRec.recommendation_id);
      patchRec(res.recommendation);
    } catch (e) {
      setRunError((e as Error).message);
    } finally {
      setApprovalBusy(false);
    }
  }

  async function reject(reason?: string) {
    if (!selectedRec) return;
    setApprovalBusy(true);
    try {
      const res = await api.reject(selectedRec.recommendation_id, reason);
      patchRec(res.recommendation);
    } catch (e) {
      setRunError((e as Error).message);
    } finally {
      setApprovalBusy(false);
    }
  }

  // -- HubSpot handlers ---------------------------------------------------

  async function hubTest() {
    setHubBusy("test");
    setHubError(null);
    try {
      const s = await api.hubspotStatus(true);
      setHubStatus(s);
      if (!s.connected && s.configured) setHubError(s.message);
    } catch (e) {
      setHubError((e as Error).message);
    } finally {
      setHubBusy(null);
    }
  }

  async function hubSeed() {
    setHubBusy("seed");
    setHubError(null);
    try {
      await api.hubspotSeed();
      await refreshHubStatus(true);
    } catch (e) {
      setHubError((e as Error).message);
    } finally {
      setHubBusy(null);
    }
  }

  async function hubSync() {
    setHubBusy("sync");
    setHubError(null);
    try {
      await api.hubspotSync();
      await Promise.all([refreshHubStatus(false), refreshDataset()]);
      // Switching the active dataset invalidates the previous run + selection.
      setResult(null);
      setSelectedId(null);
      setDetails({});
      autoRanRef.current = false;
    } catch (e) {
      setHubError((e as Error).message);
    } finally {
      setHubBusy(null);
    }
  }

  async function hubRevert() {
    setHubBusy("revert");
    setHubError(null);
    try {
      await api.hubspotUseSynthetic();
      await Promise.all([refreshHubStatus(false), refreshDataset()]);
      setResult(null);
      setSelectedId(null);
      setDetails({});
      autoRanRef.current = false;
    } catch (e) {
      setHubError((e as Error).message);
    } finally {
      setHubBusy(null);
    }
  }

  async function createWriteback(kind: "task" | "note") {
    if (!selectedRec) return;
    setWbBusy(kind);
    setWbError(null);
    try {
      const res =
        kind === "task"
          ? await api.hubspotTask(selectedRec.recommendation_id)
          : await api.hubspotNote(selectedRec.recommendation_id);
      setWritebacks((prev) => ({
        ...prev,
        [selectedRec.recommendation_id]: [...(prev[selectedRec.recommendation_id] ?? []), res],
      }));
    } catch (e) {
      setWbError((e as Error).message);
    } finally {
      setWbBusy(null);
    }
  }

  const dataReady = health?.data_ready ?? !!meta;
  const modelProvider = result?.model_provider ?? meta?.model_provider ?? "mock";
  const agents = meta?.agents ?? [];
  const accountsList = React.useMemo(() => Object.values(accounts), [accounts]);

  // Outside-in supporting context keyed by account, distilled for the portfolio
  // brief from whatever external signals have already been loaded/prefetched.
  const briefExternalContext = React.useMemo(() => {
    const out: Record<string, BriefExternalContext> = {};
    for (const [id, d] of Object.entries(externalSignals)) {
      const ctx = toBriefExternalContext(d);
      if (ctx) out[id] = ctx;
    }
    return out;
  }, [externalSignals]);
  const dataSourceLabel =
    result?.data_source ??
    hubStatus?.data_source_label ??
    meta?.dataset.source_label ??
    "Synthetic local dataset";
  const isHubspotSource = dataSourceLabel.includes("HubSpot");

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        dataReady={dataReady}
        view={view}
        onViewChange={setView}
        onHome={() => setView("landing")}
        dataSourceLabel={dataSourceLabel}
        isHubspotSource={isHubspotSource}
        accountCount={meta?.dataset.accounts ?? accountsList.length}
        overlayProvider={aiOverlay?.provider ?? null}
        overlayModel={aiOverlay?.model ?? null}
      />

      {bootError ? (
        <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-risk/40 bg-risk/10 px-4 py-3 text-sm text-risk">
          <AlertTriangle size={16} />
          Cannot reach the backend API. Start it on port 8000, then reload. ({bootError})
        </div>
      ) : null}

      {view === "landing" ? (
        <div key="landing" className="scene">
          <ExecutiveMorningLanding
            meta={meta}
            accounts={accountsList}
            accountsById={accounts}
            recs={result?.recommendations ?? []}
            hasResult={!!result}
            loading={loading}
            dataSourceLabel={dataSourceLabel}
            isHubspotSource={isHubspotSource}
            lastSync={result?.generated_at ?? hubStatus?.last_synced_at ?? null}
            externalEnabled={externalSignalsEnabled}
            externalContext={briefExternalContext}
            portfolio={portfolio}
            recommendationCount={result?.recommendations.length ?? limit}
            onRun={runWorkflow}
            onEnter={() => setView("command")}
            onOpenWorkspace={() => setView("workspace")}
            onOpenAccount={(accountId) => openAccountFromSurface({ accountId, source: "Morning Brief" })}
          />
        </div>
      ) : null}

      {view === "command" ? (
        <main key="command" className="scene mx-auto w-full max-w-[1840px] flex-1 px-4 py-4">
          {runError ? (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-risk/40 bg-risk/10 px-4 py-3 text-sm text-risk">
              <AlertTriangle size={16} />
              {runError}
            </div>
          ) : null}
          <CommandCenter
            meta={meta}
            accounts={accountsList}
            accountsById={accounts}
            result={result}
            loading={loading}
            hubStatus={hubStatus}
            writebacks={writebacks}
            selectedId={selectedRec?.account_id ?? null}
            accountSelectionContext={accountSelectionContext}
            dataSourceLabel={dataSourceLabel}
            isHubspotSource={isHubspotSource}
            externalSignalsEnabled={externalSignalsEnabled}
            externalContext={briefExternalContext}
            aiOverlay={aiOverlay}
            portfolio={portfolio}
            onOpenEvaluation={() => setView("evaluation")}
            onRun={runWorkflow}
            onOpenAccount={openAccountFromSurface}
            onSelectActive={(accountId) => {
              // Phase 13.6 — lightweight active-account selection from the queue
              // / accordion. Updates the App-level selectedId without switching
              // view (Open Account = deep view; selecting = focus only).
              const rec = result?.recommendations.find((r) => r.account_id === accountId);
              applyAccountSelection(accountId, rec?.recommendation_id ?? null, { clearRedirect: true, source: "Workspace Queue" });
            }}
          />
        </main>
      ) : null}

      {view === "workspace" ? (
      <main key="workspace" className="scene mx-auto w-full max-w-[1840px] flex-1 px-4 py-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[336px_minmax(0,1fr)_456px]">
          {/* LEFT */}
          <aside className="xl:sticky xl:top-[68px] xl:max-h-[calc(100vh-92px)] xl:self-start xl:overflow-y-auto xl:pr-1">
            <LeftPanel meta={meta} demoMode={demoMode} onToggleDemo={toggleDemo} />
            <div className="mt-4">
              <CrmIntegrationCard
                status={hubStatus}
                busy={hubBusy}
                error={hubError}
                onTest={hubTest}
                onSeed={hubSeed}
                onSync={hubSync}
                onRevert={hubRevert}
              />
            </div>
          </aside>

          {/* CENTER */}
          <section className="min-w-0">
            {showWorkspaceRedirectBanner && redirectContext ? (
              <div className="mb-3 rounded-md border border-brand-bright/35 bg-brand/[0.08] px-3 py-2 text-[11px] text-brand-bright">
                Viewing account{" "}
                <span className="font-semibold">
                  {accounts[redirectContext.accountId]?.account_name ??
                    Object.values(accounts).find((a) => normalizeAccountId(a.account_id) === normalizeAccountId(redirectContext.accountId))?.account_name ??
                    selectedRec?.account_name ??
                    redirectContext.accountId}
                </span>
                <span className="mx-1 text-edge">—</span>
                opened from <span className="font-semibold">{redirectContext.source}</span>
              </div>
            ) : null}
            <div className="mb-4">
              <WorkspaceQuery
                query={query}
                setQuery={setQuery}
                onRun={runWorkflow}
                loading={loading}
                suggestions={meta?.suggested_queries ?? []}
                limit={limit}
                setLimit={setLimit}
                isHubspotSource={isHubspotSource}
                resultCount={result?.recommendations.length}
                latencyMs={result?.latency_ms}
              />
              {agents.length > 0 && (!!result || loading) ? (
                <div className="mt-3 rounded-xl border border-edge bg-surface/60 p-3">
                  <AgentPipeline agents={agents} active={!!result} />
                </div>
              ) : null}
            </div>

            {runError ? (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-risk/40 bg-risk/10 px-4 py-3 text-sm text-risk">
                <AlertTriangle size={16} />
                {runError}
              </div>
            ) : null}

            {!result && !loading ? (
              <div className="space-y-4">
                <WorkflowPreview meta={meta} onRun={runWorkflow} loading={loading} />
                {Object.keys(accounts).length > 0 ? (
                  <Card className="p-4">
                    <PanelTitle right={<TrendingUp size={13} className="text-cyan" />}>
                      Account landscape · Risk vs Opportunity
                    </PanelTitle>
                    <p className="mt-1 text-[11px] text-muted">
                      {Object.keys(accounts).length} synthetic accounts plotted by support risk and
                      growth potential — before any model call.
                    </p>
                    <div className="mt-2">
                      <RiskOpportunityMatrix accounts={Object.values(accounts)} />
                    </div>
                  </Card>
                ) : null}
              </div>
            ) : null}

            {loading ? <CenterLoading /> : null}

            {result && !loading ? (
              <div className="space-y-3">
                <AIEnhancedBanner overlay={aiOverlay} />
                <div className="flex items-center gap-2 text-[13px] font-medium text-accent">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulseline" />
                  {LOADING_DONE}
                </div>
                <KpiStrip
                  recs={result.recommendations}
                  latencyMs={result.latency_ms}
                  accountsAnalyzed={meta?.dataset.accounts ?? result.recommendations.length}
                />
                {result.recommendations.map((rec) => (
                  <RecommendationCard
                    key={rec.recommendation_id}
                    rec={rec}
                    account={accounts[rec.account_id]}
                    selected={normalizeAccountId(rec.account_id) === (requestedAccountId ?? normalizeAccountId(selectedRec?.account_id))}
                    onClick={() => {
                      applyAccountSelection(rec.account_id, rec.recommendation_id, { clearRedirect: true, source: "Workspace Recommendations" });
                      setShowWorkspaceRedirectBanner(false);
                      setEditing(false);
                    }}
                    onAction={(target) => {
                      trackWorkflowEvent("recommendation_action_clicked", {
                        account_id: rec.account_id,
                        recommendation_id: rec.recommendation_id,
                        target_section: target,
                        source: "Today's Priorities",
                      });
                      openAccount(rec.account_id, "Today's Priorities", target);
                    }}
                  />
                ))}
              </div>
            ) : null}
          </section>

          {/* RIGHT */}
          <aside className="xl:sticky xl:top-[68px] xl:max-h-[calc(100vh-92px)] xl:self-start xl:overflow-y-auto xl:pl-1">
            {selectedRec ? (
              <div className="space-y-4">
                <Card className="p-4">
                  <AccountDetailPanel
                    rec={selectedRec}
                    detail={details[selectedRec.account_id] ?? null}
                    loading={detailLoading}
                    overlay={overlayFor(aiOverlay, selectedRec.account_id)}
                  />
                </Card>

                <MultiAgentPanel accountId={selectedRec.account_id} />

                {/* Recommended action + governance + evidence + approval + drafts */}
                <Card className="p-4">
                  <div className="space-y-4">
                    {/* Risk + Opportunity summary */}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-risk/20 bg-risk/5 p-2.5">
                        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-risk">
                          <AlertTriangle size={11} /> Risk summary
                        </div>
                        <p className="text-[11px] leading-relaxed text-muted">
                          {selectedRec.risk_summary}
                        </p>
                      </div>
                      <div className="rounded-lg border border-accent/20 bg-accent/5 p-2.5">
                        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                          <TrendingUp size={11} /> Opportunity summary
                        </div>
                        <p className="text-[11px] leading-relaxed text-muted">
                          {selectedRec.opportunity_summary}
                        </p>
                      </div>
                    </div>

                    {/* Why this account + recommended next-best action */}
                    <div>
                      <PanelTitle>Why this matters</PanelTitle>
                      <div className="mt-2">
                        <WhyThisAccount rec={selectedRec} account={accounts[selectedRec.account_id]} />
                      </div>
                    </div>

                    <div>
                      <ConfidenceRing value={selectedRec.confidence_score} />
                      <div className="mt-2">
                        <ConfidenceExplain
                          rec={selectedRec}
                          account={accounts[selectedRec.account_id]}
                        />
                      </div>
                    </div>

                    {/* Governance checks */}
                    <div>
                      <PanelTitle right={<GovernanceBadge status={selectedRec.governance_status} />}>
                        Governance checks
                      </PanelTitle>
                      <div className="mt-2">
                        <GovernanceAssurance status={selectedRec.governance_status} />
                      </div>
                      {selectedRec.governance_caveats.length > 0 ? (
                        <div className="mt-2 rounded-lg border border-amber/30 bg-amber/5 p-2.5">
                          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-amber">
                            <AlertTriangle size={12} /> Governance caveats
                          </div>
                          <ul className="list-inside list-disc space-y-0.5 text-[11px] leading-relaxed text-muted">
                            {selectedRec.governance_caveats.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <PanelTitle>Evidence ledger ({selectedRec.evidence.length})</PanelTitle>
                      <div className="mt-2">
                        <EvidenceLedger evidence={selectedRec.evidence} />
                      </div>
                    </div>

                    {/* Outside-In signals: external supporting context, secondary
                        to the internal evidence above. Hidden when disabled/empty. */}
                    <OutsideInSignals
                      data={externalSignals[selectedRec.account_id] ?? null}
                      loading={esLoading && !externalSignals[selectedRec.account_id]}
                    />

                    <div className="border-t border-edge pt-3">
                      <ApprovalControls
                        status={selectedRec.approval_status}
                        busy={approvalBusy}
                        editing={editing}
                        onApprove={approve}
                        onReject={reject}
                        onToggleEdit={() => setEditing((v) => !v)}
                      />
                    </div>

                    <div className="border-t border-edge pt-3">
                      <PanelTitle>Draft communication</PanelTitle>
                      <div className="mt-2">
                        <DraftPanel rec={selectedRec} editing={editing} />
                      </div>
                    </div>

                    <HubspotWriteback
                      status={hubStatus}
                      writebacks={
                        selectedRec.approval_status === "approved"
                          ? writebacks[selectedRec.recommendation_id] ?? []
                          : []
                      }
                      busy={wbBusy}
                      error={wbError}
                      onTask={() => createWriteback("task")}
                      onNote={() => createWriteback("note")}
                      visible={selectedRec.approval_status === "approved"}
                    />
                  </div>
                </Card>

                {/* Run-level decision ledger */}
                {result ? (
                  <Card className="p-4">
                    <DecisionLedgerView ledger={result.decision_ledger} />
                  </Card>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <DecisionWorkspacePreview />
                <NvidiaReadyCard provider={modelProvider} />
              </div>
            )}
          </aside>
        </div>
      </main>
      ) : null}

      {view === "evaluation" ? (
        <main key="evaluation" className="scene mx-auto w-full max-w-[1840px] flex-1 px-4 py-6">
          {runError ? (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-risk/40 bg-risk/10 px-4 py-3 text-sm text-risk">
              <AlertTriangle size={16} />
              {runError}
            </div>
          ) : null}
          <EvaluationView
            recs={result?.recommendations ?? []}
            meta={meta}
            hubStatus={hubStatus}
            externalEnabled={externalSignalsEnabled}
            latencyMs={result?.latency_ms ?? 0}
            provider={modelProvider}
            config={systemConfig}
            loading={loading}
            onRun={runWorkflow}
            decisionStatus={decisionStatus}
            onCompareDecision={compareDecision}
            onTestProvider={testProvider}
            aiOverlay={aiOverlay}
          />
        </main>
      ) : null}

      {view !== "landing" ? (
        <RuntimeTrace
          ledger={result?.decision_ledger ?? null}
          apiBaseUrl={api.baseUrl}
          dataSource={dataSourceLabel}
          lastSyncedAt={hubStatus?.last_synced_at ?? null}
        />
      ) : null}
    </div>
  );
}

const LOADING_DONE = "I'm ready. Here's where I'd spend today.";

function CenterLoading() {
  const [phase, setPhase] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % LOADING_PHASES.length), 1100);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="space-y-3 animate-fade-in">
      <div className="card-elevated p-5">
        <ThinkingSequence caption={LOADING_PHASES[phase]} />
      </div>
      <div className="skeleton h-32 rounded-xl border border-edge" />
      <div className="skeleton h-32 rounded-xl border border-edge" />
    </div>
  );
}
