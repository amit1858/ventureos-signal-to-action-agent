"use client";

import * as React from "react";
import {
  Activity,
  Brain,
  ClipboardList,
  Globe2,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";
import { getActiveProvider, getAllCredentialsWire } from "@/lib/byok";
import type { MultiAgentReport } from "@/lib/types";
import { cx } from "@/lib/format";
import { Card, PanelTitle, Pill } from "@/components/ui";

type Tone = "risk" | "growth" | "research" | "engagement" | "governance";

const TONE: Record<Tone, { ring: string; chip: string; iconBg: string }> = {
  risk: { ring: "border-risk/30", chip: "bg-risk/10 text-risk", iconBg: "bg-risk/15 text-risk" },
  growth: { ring: "border-accent/30", chip: "bg-accent/10 text-accent", iconBg: "bg-accent/15 text-accent" },
  research: { ring: "border-brand/30", chip: "bg-brand/10 text-brand", iconBg: "bg-brand/15 text-brand" },
  engagement: { ring: "border-cyan-400/30", chip: "bg-cyan-400/10 text-cyan-300", iconBg: "bg-cyan-400/15 text-cyan-300" },
  governance: { ring: "border-amber-400/30", chip: "bg-amber-400/10 text-amber-300", iconBg: "bg-amber-400/15 text-amber-300" },
};

function LevelChip({ level, tone }: { level: string; tone: Tone }) {
  return (
    <span className={cx("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", TONE[tone].chip)}>
      {level || "—"}
    </span>
  );
}

function AgentCard({
  tone,
  icon: Icon,
  title,
  objective,
  level,
  levelLabel,
  bullets,
  narrative,
  recommendation,
  recommendationLabel,
  confidence,
  attribution,
}: {
  tone: Tone;
  icon: React.ElementType;
  title: string;
  objective: string;
  level?: string;
  levelLabel?: string;
  bullets: string[];
  narrative: string;
  recommendation?: string;
  recommendationLabel?: string;
  confidence: string;
  attribution: { provider: string; model: string; mode: string; latency_ms: number };
}) {
  return (
    <div className={cx("rounded-2xl border bg-panel/60 p-4", TONE[tone].ring)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cx("rounded-lg p-2", TONE[tone].iconBg)}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-text">{title}</div>
            <div className="text-[11px] text-subtle">{objective}</div>
          </div>
        </div>
        {level ? (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-subtle">{levelLabel ?? "Level"}</div>
            <LevelChip level={level} tone={tone} />
          </div>
        ) : null}
      </div>

      {bullets.length > 0 ? (
        <ul className="mb-3 space-y-1 text-[12px] text-text/90">
          {bullets.slice(0, 5).map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-subtle/60" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {narrative ? <p className="mb-3 text-[12px] leading-relaxed text-text/85">{narrative}</p> : null}

      {recommendation ? (
        <div className="mb-3 rounded-lg border border-edge-soft bg-bg/60 p-3">
          <div className="text-[10px] uppercase tracking-wide text-subtle">{recommendationLabel ?? "Recommendation"}</div>
          <div className="mt-1 text-[12px] text-text">{recommendation}</div>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-edge-soft pt-2 text-[10px] text-subtle">
        <span>
          Confidence <span className="font-medium text-text/80">{confidence}</span>
        </span>
        <span className="flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          {attribution.provider === "deterministic"
            ? "Governed engine"
            : `${attribution.provider} · ${attribution.model || ""}`}
          {attribution.latency_ms ? ` · ${attribution.latency_ms}ms` : ""}
        </span>
      </div>
    </div>
  );
}

export function MultiAgentPanel({ accountId }: { accountId: string | null }) {
  const [report, setReport] = React.useState<MultiAgentReport | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [stamp, setStamp] = React.useState(0);

  React.useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const active = getActiveProvider();
    const provider = active !== "deterministic" ? active : undefined;
    const creds = getAllCredentialsWire();
    api
      .multiAgent(accountId, provider, creds)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, stamp]);

  if (!accountId) return null;

  return (
    <Card className="p-5">
      <PanelTitle
        right={
          <div className="flex items-center gap-2">
            {report ? (
              <Pill
                className={cx(
                  "border-edge",
                  report.consensus_label === "high"
                    ? "bg-accent/10 text-accent"
                    : report.consensus_label === "medium"
                    ? "bg-amber-400/10 text-amber-300"
                    : "bg-risk/10 text-risk",
                )}
              >
                Consensus {Math.round((report.consensus_score || 0) * 100)}%
              </Pill>
            ) : null}
            <button
              type="button"
              onClick={() => setStamp((s) => s + 1)}
              className="rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-subtle hover:text-text"
            >
              Re-run
            </button>
          </div>
        }
      >
        Multi-agent reasoning
      </PanelTitle>

      <p className="mt-1 text-[12px] text-subtle">
        Five specialist agents reason independently. Ranking, scoring and governance remain deterministic.
      </p>

      {loading && !report ? (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl border border-edge-soft bg-panel/40" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-4 rounded-lg border border-risk/30 bg-risk/10 p-3 text-[12px] text-risk">{error}</div>
      ) : report ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <AgentCard
              tone="risk"
              icon={AlertTriangle}
              title="Risk Agent"
              objective={report.risk.objective}
              level={report.risk.risk_level}
              levelLabel="Risk"
              bullets={[...report.risk.risk_drivers, ...report.risk.risk_evidence]}
              narrative={report.risk.risk_narrative}
              recommendation={report.risk.recommended_mitigation}
              recommendationLabel="Mitigation"
              confidence={report.risk.confidence}
              attribution={report.risk.attribution}
            />
            <AgentCard
              tone="growth"
              icon={TrendingUp}
              title="Growth Agent"
              objective={report.growth.objective}
              level={report.growth.opportunity_level}
              levelLabel="Opportunity"
              bullets={[...report.growth.opportunity_drivers, ...report.growth.opportunity_evidence]}
              narrative={report.growth.growth_narrative}
              recommendation={report.growth.suggested_motion}
              recommendationLabel="Motion"
              confidence={report.growth.confidence}
              attribution={report.growth.attribution}
            />
            <AgentCard
              tone="research"
              icon={Globe2}
              title="Research Agent"
              objective={report.research.objective}
              level={report.research.relevance_score}
              levelLabel="Relevance"
              bullets={[
                ...report.research.market_themes,
                ...report.research.competitor_activity,
                ...report.research.company_developments,
              ]}
              narrative={report.research.narrative}
              recommendation={report.research.industry_context}
              recommendationLabel="Industry context"
              confidence={report.research.confidence}
              attribution={report.research.attribution}
            />
            <AgentCard
              tone="engagement"
              icon={MessageSquareText}
              title="Engagement Agent"
              objective={report.engagement.objective}
              bullets={report.engagement.talking_points?.length ? report.engagement.talking_points : report.engagement.conversation_strategy}
              narrative={report.engagement.executive_summary}
              recommendation={report.engagement.opening_line}
              recommendationLabel="Suggested opening"
              confidence={report.engagement.confidence}
              attribution={report.engagement.attribution}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
                <ClipboardList className="h-4 w-4 text-cyan-300" />
                Guided playbook
              </div>
              <p className="text-[12px] text-text/85">{report.engagement.action_selected_why}</p>
              {report.engagement.execution_steps?.length ? (
                <ol className="mt-2 space-y-1 text-[12px] text-text/90">
                  {report.engagement.execution_steps.slice(0, 5).map((step, i) => (
                    <li key={i}>
                      {i + 1}. {step}
                    </li>
                  ))}
                </ol>
              ) : null}
              <div className="mt-3 rounded-lg border border-edge-soft bg-bg/40 p-3 text-[11px] text-text/85">
                <div>
                  <span className="text-subtle">Expected outcome: </span>
                  {report.engagement.expected_business_outcome}
                </div>
                <div className="mt-1">
                  <span className="text-subtle">Seller effort: </span>
                  {report.engagement.estimated_seller_effort}
                </div>
                <div className="mt-1">
                  <span className="text-subtle">Timeline: </span>
                  {report.engagement.suggested_timeline}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-brand/30 bg-brand/5 p-4">
              <div className="mb-2 text-sm font-semibold text-text">AI conversation coach</div>
              <div className="rounded-lg border border-edge-soft bg-bg/40 p-3">
                <div className="text-[10px] uppercase tracking-wide text-subtle">Suggested opening line</div>
                <p className="mt-1 text-[12px] italic text-text/90">&ldquo;{report.engagement.opening_line}&rdquo;</p>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                <CoachBlock
                  title="Likely objections"
                  items={report.engagement.likely_objections}
                  empty="No objections surfaced."
                />
                <CoachBlock
                  title="Talking points"
                  items={report.engagement.talking_points}
                  empty="Use deterministic evidence and confirm one commitment."
                />
              </div>
              <div className="mt-2 rounded-lg border border-edge-soft bg-bg/40 p-3">
                <div className="text-[10px] uppercase tracking-wide text-subtle">CRM note draft</div>
                <p className="mt-1 text-[12px] text-text/85">{report.engagement.crm_note_draft}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4">
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-300" />
              <div className="text-sm font-semibold text-text">Governance Agent</div>
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                Critic
              </span>
            </div>
            <p className="mb-3 text-[12px] text-text/85">{report.governance_review.summary}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <GovBlock title="Contradictions" items={report.governance_review.contradictions} empty="None detected" />
              <GovBlock title="Unsupported claims" items={report.governance_review.unsupported_claims} empty="None" />
              <GovBlock title="Warnings" items={report.governance_review.risk_warnings} empty="None" />
            </div>
            {report.governance_review.blocked_actions.length > 0 ? (
              <div className="mt-3 text-[11px] text-subtle">
                <span className="font-semibold text-text/80">Blocked by design:</span>{" "}
                {report.governance_review.blocked_actions.join(" · ")}
              </div>
            ) : null}
          </div>

          {report.contradictions.length > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-[12px] text-amber-200">
              <div className="mb-1 flex items-center gap-2 font-semibold">
                <Activity className="h-3 w-3" /> Cross-agent contradictions
              </div>
              <ul className="space-y-1">
                {report.contradictions.map((c, i) => (
                  <li key={i}>• {c}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between text-[10px] text-subtle">
            <span className="flex items-center gap-1">
              <Brain className="h-3 w-3" /> Reasoning provider:{" "}
              <span className="font-medium text-text/80">{report.provider_used}</span>
            </span>
            <span>{new Date(report.generated_at).toLocaleString()}</span>
          </div>
        </>
      ) : null}
    </Card>
  );
}

function GovBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-lg border border-edge-soft bg-bg/40 p-3">
      <div className="text-[10px] uppercase tracking-wide text-subtle">{title}</div>
      {items.length === 0 ? (
        <div className="mt-1 text-[12px] text-text/60">{empty}</div>
      ) : (
        <ul className="mt-1 space-y-1 text-[12px] text-text/85">
          {items.slice(0, 4).map((item, i) => (
            <li key={i}>• {item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CoachBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-lg border border-edge-soft bg-bg/40 p-3">
      <div className="text-[10px] uppercase tracking-wide text-subtle">{title}</div>
      {items.length ? (
        <ul className="mt-1 space-y-1 text-[12px] text-text/85">
          {items.slice(0, 4).map((item, i) => (
            <li key={i}>• {item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[12px] text-text/60">{empty}</p>
      )}
    </div>
  );
}
