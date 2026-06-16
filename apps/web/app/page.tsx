"use client";

import * as React from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import type {
  Account,
  AccountDetail,
  ExternalSignalsResult,
  HealthResponse,
  HubspotStatus,
  HubspotWriteback as Writeback,
  MetaResponse,
  Recommendation,
  RecommendationResponse,
  SystemConfigResponse,
} from "@/lib/types";
import { cx } from "@/lib/format";
import { briefFocusAccountIds, type BriefExternalContext } from "@/lib/reasoning";
import { LOADING_PHASES } from "@/lib/evaluation";
import { Header, type AppView } from "@/components/Header";
import { LeftPanel } from "@/components/LeftPanel";
import { CrmIntegrationCard } from "@/components/CrmIntegrationCard";
import { HubspotWriteback } from "@/components/HubspotWriteback";
import { RecommendationCard } from "@/components/RecommendationCard";
import { AgentPipeline } from "@/components/AgentTrace";
import { AccountDetailPanel } from "@/components/AccountDetailPanel";
import { OutsideInSignals } from "@/components/OutsideInSignals";
import { EvidenceLedger } from "@/components/EvidenceChips";
import { ConfidenceRing } from "@/components/ConfidenceMeter";
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
import { LandingView } from "@/components/landing/LandingView";
import { EvaluationView } from "@/components/evaluation/EvaluationView";
import { WorkspaceQuery } from "@/components/WorkspaceQuery";
import { ThinkingSequence } from "@/components/ThinkingSequence";
import { Card, PanelTitle } from "@/components/ui";

const DEFAULT_QUERY = "Which SMB accounts need attention this week and why?";
const DEMO_MODE_KEY = "s2a_demo_mode";

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

export default function Page() {
  const [meta, setMeta] = React.useState<MetaResponse | null>(null);
  const [health, setHealth] = React.useState<HealthResponse | null>(null);
  const [accounts, setAccounts] = React.useState<Record<string, Account>>({});
  const [bootError, setBootError] = React.useState<string | null>(null);
  const [systemConfig, setSystemConfig] = React.useState<SystemConfigResponse | null>(null);

  const [query, setQuery] = React.useState(DEFAULT_QUERY);
  const [limit, setLimit] = React.useState(10);
  const [loading, setLoading] = React.useState(false);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RecommendationResponse | null>(null);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
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

  const selectedRec: Recommendation | undefined = React.useMemo(
    () => result?.recommendations.find((r) => r.recommendation_id === selectedId),
    [result, selectedId],
  );

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

  async function runWorkflow() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setRunError(null);
    setEditing(false);
    try {
      const res = await api.recommendations(query.trim(), limit);
      setResult(res);
      setSelectedId(res.recommendations[0]?.recommendation_id ?? null);
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
    const rec = result.recommendations.find((r) => r.account_id === acc);
    if (rec) {
      setSelectedId(rec.recommendation_id);
      setEditing(false);
    }
    pendingAccountRef.current = null;
  }, [result]);

  // Open an account in the detailed workspace from the cockpit (matrix dot / row).
  function openAccount(accountId: string) {
    setView("workspace");
    const rec = result?.recommendations.find((r) => r.account_id === accountId);
    if (rec) {
      setSelectedId(rec.recommendation_id);
      setEditing(false);
      pendingAccountRef.current = null;
    } else {
      pendingAccountRef.current = accountId;
      if (!loading) runWorkflow();
    }
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
      />

      {bootError ? (
        <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-risk/40 bg-risk/10 px-4 py-3 text-sm text-risk">
          <AlertTriangle size={16} />
          Cannot reach the backend API. Start it on port 8000, then reload. ({bootError})
        </div>
      ) : null}

      {view === "landing" ? (
        <div key="landing" className="scene">
          <LandingView
            meta={meta}
            recommendationCount={result?.recommendations.length ?? limit}
            isHubspotSource={isHubspotSource}
            dataSourceLabel={dataSourceLabel}
            onEnter={() => setView("command")}
            onOpenWorkspace={() => setView("workspace")}
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
            dataSourceLabel={dataSourceLabel}
            isHubspotSource={isHubspotSource}
            externalSignalsEnabled={externalSignalsEnabled}
            externalContext={briefExternalContext}
            onRun={runWorkflow}
            onOpenAccount={openAccount}
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
                    selected={rec.recommendation_id === selectedId}
                    onClick={() => {
                      setSelectedId(rec.recommendation_id);
                      setEditing(false);
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
                  />
                </Card>

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

                    <ConfidenceRing value={selectedRec.confidence_score} />

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
