"use client";

import * as React from "react";
import type {
  Account,
  MetaResponse,
  RecommendationResponse,
  HubspotStatus,
  HubspotWriteback,
} from "@/lib/types";
import { businessAction } from "@/lib/actions";
import { expectedOutcome } from "@/lib/reasoning";
import { cx } from "@/lib/format";
import { useReveal } from "@/lib/useReveal";
import { ExecutiveMorningBrief } from "@/components/command/ExecutiveMorningBrief";
import { PortfolioHealthCard } from "@/components/command/PortfolioHealthCard";
import { NextBestActions } from "@/components/command/NextBestActions";
import { PortfolioMatrix } from "@/components/command/PortfolioMatrix";
import { PriorityAccountsTable } from "@/components/command/PriorityAccountsTable";
import { AiInsightsPanel } from "@/components/command/AiInsightsPanel";
import { LiveWorkflowRail } from "@/components/command/LiveWorkflowRail";

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

  // account_id -> the bubble's story (action + expected outcome) for the
  // portfolio map detail rail. Derived from the frozen reasoning helpers.
  const storyByAccount = React.useMemo(() => {
    const m: Record<string, { actionLabel: string; actionTone: string; outcome: string }> = {};
    recs.forEach((r) => {
      const a = accountsById[r.account_id];
      const ba = businessAction(r.action_type, {
        governanceStatus: r.governance_status,
        growthPotential: a?.growth_potential_score,
        productUsage: a?.product_usage_score,
      });
      m[r.account_id] = { actionLabel: ba.label, actionTone: ba.tone, outcome: expectedOutcome(ba.key) };
    });
    return m;
  }, [recs, accountsById]);

  return (
    <div className="space-y-14 animate-fade-in pb-8 lg:space-y-20">
      {/* Section 1 · Executive Brief (hero) */}
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

      {/* Section 2 · Portfolio Health */}
      <Section
        eyebrow="Portfolio Health"
        heading="Your book of business"
        sub="Overall readiness, the revenue at stake and the expansion headroom across the portfolio."
      >
        <PortfolioHealthCard accounts={accounts} recs={recs} latencyMs={latency} hasResult={hasResult} />
      </Section>

      {/* Section 3 · Today's Priorities */}
      <Section
        id="todays-priorities"
        eyebrow="Today's Priorities"
        heading="What to do today"
        sub="The accounts that deserve your attention now — why they matter and the recommended next move."
      >
        <NextBestActions
          recs={recs}
          accountsById={accountsById}
          hasResult={hasResult}
          loading={loading}
          onOpenAccount={onOpenAccount}
          onRun={onRun}
        />
      </Section>

      {/* Section 4 · Portfolio Map */}
      <Section
        eyebrow="Portfolio Map"
        heading="Risk versus opportunity"
        sub={`Every account placed by risk and expansion potential — ${accounts.length} in view. Hover for detail, click to open.`}
      >
        <div className="card-premium p-5 sm:p-7">
          <PortfolioMatrix
            accounts={accounts}
            accountsById={accountsById}
            selectedId={selectedId}
            recommendedIds={recommendedIds}
            storyByAccount={storyByAccount}
            onOpenAccount={onOpenAccount}
          />
        </div>
      </Section>

      {/* Section 4b · Priority Accounts (ranked) */}
      <Section
        eyebrow="Priority Accounts"
        heading="The ranked shortlist"
        sub={hasResult ? "Top accounts by AI priority — sort by any signal." : "Run the analysis to populate the ranked shortlist."}
      >
        <div className="card-premium p-3 sm:p-4">
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
      </Section>

      {/* Section 5 · Executive Briefing */}
      <Section
        eyebrow="Executive Briefing"
        heading="What changed overnight"
        sub="Top risks, standout opportunities and emerging trends — read from live signals."
      >
        <div className="card-premium p-5 sm:p-7">
          <AiInsightsPanel accounts={accounts} />
        </div>
      </Section>

      {/* Section 6 · Governed pipeline */}
      <Section
        eyebrow="Governed Pipeline"
        heading="How this was decided"
        sub="A controlled, multi-agent workflow with human approval — never an autonomous black box."
      >
        <div className="card-premium p-5 sm:p-7">
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
      </Section>
    </div>
  );
}

// Executive section header: CATEGORY (eyebrow) / Large Heading / one-line description.
function Section({
  id,
  eyebrow,
  heading,
  sub,
  children,
}: {
  id?: string;
  eyebrow: string;
  heading: string;
  sub?: string;
  children: React.ReactNode;
}) {
  const { ref, shown } = useReveal<HTMLElement>();
  return (
    <section ref={ref} id={id} className={cx("scroll-mt-24 reveal", shown && "reveal-visible")}>
      <div className="mb-6 max-w-2xl">
        <div className="eyebrow text-faint">{eyebrow}</div>
        <h2 className="section-h mt-2.5">{heading}</h2>
        {sub ? <p className="section-sub mt-2">{sub}</p> : null}
      </div>
      {children}
    </section>
  );
}
