"use client";

import * as React from "react";
import {
  RefreshCw,
  Play,
  Layers,
  Sparkles,
  Activity,
  Network,
  BarChart3,
  Target,
} from "lucide-react";
import type {
  Account,
  MetaResponse,
  RecommendationResponse,
  HubspotStatus,
  HubspotWriteback,
} from "@/lib/types";
import { cx, timeAgo } from "@/lib/format";
import { Card, PanelTitle } from "@/components/ui";
import { ExecutiveKpiStrip } from "@/components/command/ExecutiveKpiStrip";
import { PortfolioMatrix } from "@/components/command/PortfolioMatrix";
import { PriorityAccountsTable } from "@/components/command/PriorityAccountsTable";
import { AiInsightsPanel } from "@/components/command/AiInsightsPanel";
import { LiveWorkflowRail } from "@/components/command/LiveWorkflowRail";
import { ExecutiveMetrics } from "@/components/command/ExecutiveMetrics";

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
  onRun,
  onOpenAccount,
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
  onRun: () => void;
  onOpenAccount: (accountId: string) => void;
}) {
  const recs = result?.recommendations ?? [];
  const hasResult = recs.length > 0;
  const recommendedIds = React.useMemo(() => new Set(recs.map((r) => r.account_id)), [recs]);
  const anyApproved = recs.some((r) => r.approval_status === "approved");
  const anyWriteback = Object.values(writebacks).some((w) => w.length > 0);

  const lastSync = isHubspotSource ? hubStatus?.last_synced_at ?? null : null;
  const latency = result?.latency_ms ?? result?.decision_ledger?.latency_ms ?? 0;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header band */}
      <div className="card-elevated relative overflow-hidden p-5">
        <div className="grid-dots pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="section-label text-faint">Signal-to-Action Agent</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
              Executive Command Center
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Live portfolio cockpit — signals, AI prioritization, evidence, and governed write-back in one view.
            </p>
          </div>

          <div className="flex flex-wrap items-stretch gap-2.5">
            <HeaderStat
              label="Live Data Source"
              value={dataSourceLabel}
              dotClass={isHubspotSource ? "bg-accent shadow-glow" : "bg-cyan"}
              valueClass={isHubspotSource ? "text-accent" : "text-cyan"}
            />
            <HeaderStat label="Last Sync" value={lastSync ? timeAgo(lastSync) : "—"} />
            <HeaderStat label="Accounts" value={accounts.length ? String(accounts.length) : "—"} />
            <HeaderStat label="Recommendations" value={hasResult ? String(recs.length) : "—"} />
            <button
              type="button"
              onClick={onRun}
              disabled={loading}
              className={cx("btn btn-primary self-stretch px-4", loading && "opacity-70")}
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
      </div>

      {/* Executive KPI strip */}
      <section>
        <SectionHeading icon={Layers} title="Executive Overview" hint="Portfolio at a glance" />
        <ExecutiveKpiStrip accounts={accounts} recs={recs} hasResult={hasResult} />
      </section>

      {/* Portfolio health matrix */}
      <Card className="p-4">
        <PanelTitle right={<span className="text-[10px] text-faint">Risk vs Opportunity · {accounts.length} accounts</span>}>
          <span className="inline-flex items-center gap-2">
            <Target size={13} className="text-accent" /> Portfolio Health
          </span>
        </PanelTitle>
        <div className="mt-3">
          <PortfolioMatrix
            accounts={accounts}
            selectedId={selectedId}
            recommendedIds={recommendedIds}
            onOpenAccount={onOpenAccount}
          />
        </div>
      </Card>

      {/* Priority accounts */}
      <Card className="p-4">
        <PanelTitle right={<span className="text-[10px] text-faint">{hasResult ? "Top 10 · sortable" : "Run to populate"}</span>}>
          <span className="inline-flex items-center gap-2">
            <BarChart3 size={13} className="text-accent" /> Priority Accounts
          </span>
        </PanelTitle>
        <div className="mt-3">
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
      </Card>

      {/* AI insights */}
      <Card className="p-4">
        <PanelTitle right={<span className="text-[10px] text-faint">Derived from live signals</span>}>
          <span className="inline-flex items-center gap-2">
            <Sparkles size={13} className="text-accent" /> AI Insights
          </span>
        </PanelTitle>
        <div className="mt-3">
          <AiInsightsPanel accounts={accounts} />
        </div>
      </Card>

      {/* Live workflow */}
      <Card className="p-4">
        <PanelTitle right={<span className="text-[10px] text-faint">Governed multi-agent pipeline</span>}>
          <span className="inline-flex items-center gap-2">
            <Network size={13} className="text-accent" /> Live Workflow
          </span>
        </PanelTitle>
        <div className="mt-3">
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
      </Card>

      {/* Executive metrics */}
      <Card className="p-4">
        <PanelTitle right={<span className="text-[10px] text-faint">{isHubspotSource ? "Source: HubSpot Test CRM" : "Source: Synthetic local dataset"}</span>}>
          <span className="inline-flex items-center gap-2">
            <Activity size={13} className="text-accent" /> Executive Metrics
          </span>
        </PanelTitle>
        <div className="mt-3">
          <ExecutiveMetrics accounts={accounts} recs={recs} latencyMs={latency} hasResult={hasResult} />
        </div>
      </Card>
    </div>
  );
}

function HeaderStat({
  label,
  value,
  dotClass,
  valueClass,
}: {
  label: string;
  value: string;
  dotClass?: string;
  valueClass?: string;
}) {
  return (
    <div className="min-w-[112px] rounded-lg border border-edge bg-surface2/60 px-3 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-faint">{label}</div>
      <div className={cx("mt-0.5 flex items-center gap-1.5 text-sm font-semibold", valueClass || "text-ink")}>
        {dotClass ? <span className={cx("inline-block h-2 w-2 shrink-0 rounded-full", dotClass)} /> : null}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Layers;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <Icon size={13} className="text-accent" />
      <span className="panel-title">{title}</span>
      {hint ? <span className="text-[10px] text-faint">· {hint}</span> : null}
    </div>
  );
}
