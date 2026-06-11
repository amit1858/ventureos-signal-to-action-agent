"use client";

import * as React from "react";
import {
  Layers,
  Sparkles,
  Activity,
  Network,
  BarChart3,
  Target,
  Zap,
} from "lucide-react";
import type {
  Account,
  MetaResponse,
  RecommendationResponse,
  HubspotStatus,
  HubspotWriteback,
} from "@/lib/types";
import { businessAction } from "@/lib/actions";
import { Card, PanelTitle } from "@/components/ui";
import { ExecutiveMorningBrief } from "@/components/command/ExecutiveMorningBrief";
import { ExecutiveKpiStrip } from "@/components/command/ExecutiveKpiStrip";
import { NextBestActions } from "@/components/command/NextBestActions";
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

  // account_id -> business-action label, for the portfolio matrix tooltip.
  const actionByAccount = React.useMemo(() => {
    const m: Record<string, string> = {};
    recs.forEach((r) => {
      const a = accountsById[r.account_id];
      m[r.account_id] = businessAction(r.action_type, {
        governanceStatus: r.governance_status,
        growthPotential: a?.growth_potential_score,
        productUsage: a?.product_usage_score,
      }).label;
    });
    return m;
  }, [recs, accountsById]);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* P1 · Executive morning brief */}
      <ExecutiveMorningBrief
        accounts={accounts}
        accountsById={accountsById}
        recs={recs}
        hasResult={hasResult}
        loading={loading}
        dataSourceLabel={dataSourceLabel}
        isHubspotSource={isHubspotSource}
        lastSync={lastSync}
        onRun={onRun}
        onOpenAccount={onOpenAccount}
      />

      {/* Executive portfolio overview */}
      <section>
        <SectionHeading icon={Layers} title="Executive Portfolio Overview" hint="Book of business at a glance" />
        <ExecutiveKpiStrip accounts={accounts} recs={recs} hasResult={hasResult} />
      </section>

      {/* P2 · Next best actions (premium narrative cards) */}
      <section>
        <SectionHeading icon={Zap} title="Next Best Actions" hint="Why each account — and what to do" />
        <NextBestActions
          recs={recs}
          accountsById={accountsById}
          hasResult={hasResult}
          loading={loading}
          onOpenAccount={onOpenAccount}
          onRun={onRun}
        />
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
            actionByAccount={actionByAccount}
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
