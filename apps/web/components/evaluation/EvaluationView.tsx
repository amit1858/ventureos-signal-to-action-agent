"use client";

import * as React from "react";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Building2,
  Cpu,
  Eye,
  Gauge,
  GitCompare,
  KeyRound,
  Layers,
  Lock,
  Plug,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cx } from "@/lib/format";
import type {
  DecisionComparison,
  DecisionProviderStatus,
  HubspotStatus,
  MetaResponse,
  ProviderDecision,
  Recommendation,
  SystemConfigResponse,
} from "@/lib/types";
import {
  connectorCatalog,
  decisionModeLabel,
  EVAL_GROUPS,
  evaluateSystem,
  humanizeDecisionAction,
  PRODUCTION_PILLARS,
  providerCatalog,
  TRUST_PRINCIPLES,
  type ConnectorStatus,
  type EvalStatus,
  type PillarStatus,
  type ProviderStatus,
} from "@/lib/evaluation";
import { Card } from "@/components/ui";

// -- shared tone language (semantic, never decorative) --------------------

type Tone = "good" | "progress" | "warn" | "muted";

const TONE: Record<Tone, { dot: string; text: string; ring: string; bg: string }> = {
  good: { dot: "bg-accent", text: "text-accent", ring: "border-accent/35", bg: "bg-accent/10" },
  progress: { dot: "bg-brand", text: "text-brand-bright", ring: "border-brand/35", bg: "bg-brand/10" },
  warn: { dot: "bg-amber", text: "text-amber", ring: "border-amber/35", bg: "bg-amber/10" },
  muted: { dot: "bg-faint", text: "text-faint", ring: "border-edge", bg: "bg-surface2/60" },
};

const evalTone: Record<EvalStatus, Tone> = { pass: "good", review: "warn", planned: "muted" };
const providerTone: Record<ProviderStatus, Tone> = {
  active: "good",
  ready: "progress",
  planned: "muted",
};
const connectorTone: Record<ConnectorStatus, Tone> = {
  active: "good",
  available: "progress",
  planned: "muted",
};
const pillarTone: Record<PillarStatus, Tone> = { live: "good", designed: "progress", planned: "muted" };

// -- decision-provider tone maps (BYOK comparison) ------------------------

const decisionStatusTone: Record<string, Tone> = {
  active: "good",
  configured: "progress",
  not_configured: "muted",
  failed: "warn",
  fallback: "warn",
};
const decisionModeTone: Record<string, Tone> = {
  deterministic: "good",
  live: "good",
  fallback: "warn",
  not_configured: "muted",
};

/** Semantic tone for a level, aware that high risk is a caution but high
 *  opportunity/confidence is positive. */
function levelTone(field: "risk" | "opportunity" | "confidence", level: string): Tone {
  const l = (level || "").toLowerCase();
  if (field === "risk") return l === "high" ? "warn" : l === "medium" ? "progress" : "muted";
  return l === "high" ? "good" : l === "medium" ? "progress" : "muted";
}

function StatusChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
        t.ring,
        t.bg,
        t.text,
      )}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", t.dot)} />
      {children}
    </span>
  );
}

// Section scaffold: eyebrow / heading / supporting line — one typographic rhythm.
function Section({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="space-y-1.5">
        <div className="eyebrow">{eyebrow}</div>
        <h2 className="section-h">{title}</h2>
        {sub ? <p className="section-sub max-w-3xl">{sub}</p> : null}
      </div>
      {children}
    </section>
  );
}

// -- view -----------------------------------------------------------------

export function EvaluationView({
  recs,
  meta,
  hubStatus,
  externalEnabled,
  latencyMs,
  provider,
  config,
  loading,
  onRun,
  decisionStatus,
  onCompareDecision,
}: {
  recs: Recommendation[];
  meta: MetaResponse | null;
  hubStatus: HubspotStatus | null;
  externalEnabled: boolean;
  latencyMs: number;
  provider: string;
  config: SystemConfigResponse | null;
  loading: boolean;
  onRun: () => void;
  decisionStatus: DecisionProviderStatus | null;
  onCompareDecision: (accountId: string) => Promise<DecisionComparison>;
}) {
  const report = React.useMemo(
    () => evaluateSystem({ recs, meta, externalEnabled, latencyMs, provider }),
    [recs, meta, externalEnabled, latencyMs, provider],
  );
  const providers = React.useMemo(() => providerCatalog(provider, config), [provider, config]);
  const hubActive = (hubStatus?.active_source ?? "") === "hubspot";
  const hubConfigured = hubStatus?.configured ?? config?.config.hubspot_configured ?? false;
  const connectors = React.useMemo(
    () => connectorCatalog(hubActive, hubConfigured),
    [hubActive, hubConfigured],
  );

  const { summary } = report;

  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-16 px-1 py-2">
      {/* TRUST HERO */}
      <section className="card-premium relative overflow-hidden p-7 sm:p-9">
        <div className="grid-dots pointer-events-none absolute inset-0 opacity-[0.12]" />
        <div className="relative space-y-5">
          <div className="eyebrow text-brand-bright/80">Evaluation &amp; Architecture</div>
          <h1 className="max-w-3xl text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-[34px]">
            AI assists. Humans decide.
          </h1>
          <p className="section-sub max-w-2xl">
            Behind the executive experience is a governed, measurable system. Here is how every
            recommendation is evaluated, how the model and CRM layers are designed to evolve, and what
            it takes to run this in production — without changing how decisions are made.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {TRUST_PRINCIPLES.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-surface2/70 px-3 py-1.5 text-xs text-muted"
              >
                <ShieldCheck size={12} className="text-accent" />
                {p}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* EVALUATION CENTER */}
      <Section
        eyebrow="Evaluation Center"
        title="How the AI is measured."
        sub="Twelve dimensions across output quality, governance and runtime. Capability checks reflect how the system is built; data-derived checks are measured from the latest workflow run."
      >
        <div className="flex flex-wrap items-center gap-3">
          <SummaryStat tone="good" value={summary.passed} label="passing" />
          {summary.review > 0 ? (
            <SummaryStat tone="warn" value={summary.review} label="awaiting run" />
          ) : null}
          <SummaryStat tone="muted" value={summary.planned} label="planned · Phase 5" />
          <span className="text-xs text-faint">of {summary.total} dimensions</span>
          {!summary.measured ? (
            <button
              type="button"
              onClick={onRun}
              disabled={loading}
              className="btn btn-primary ml-auto py-1.5 text-xs"
            >
              <Sparkles size={13} />
              {loading ? "Analyzing…" : "Run analysis to measure live output"}
            </button>
          ) : (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-faint">
              <BadgeCheck size={13} className="text-accent" />
              Measured on the latest run
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {EVAL_GROUPS.map((group) => {
            const dims = report.dimensions.filter((d) => d.group === group);
            return (
              <Card key={group} className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <span className="panel-title">{group}</span>
                </div>
                <div className="space-y-3">
                  {dims.map((d) => {
                    const tone = evalTone[d.status];
                    return (
                      <div key={d.id} className="rounded-xl border border-edge bg-surface2/40 p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-medium text-ink">{d.label}</div>
                          <StatusChip tone={tone}>{d.signal}</StatusChip>
                        </div>
                        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{d.reason}</p>
                        {d.metric ? (
                          <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-edge bg-base/40 px-2 py-0.5 font-mono text-[10px] text-faint">
                            {d.metric}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      {/* MODEL PROVIDER FRAMEWORK */}
      <Section
        eyebrow="Model Provider"
        title="One interface. Many engines."
        sub="Reasoning is deterministic today and the narrative layer is provider-agnostic. The same agent contracts route from the mock engine to NVIDIA, OpenAI or Azure with no business-logic change."
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Cpu size={14} className="text-brand-bright" />
          Current provider
          <span className="font-mono text-ink">{provider}</span>
          <span className="text-faint/50">·</span>
          <span className="text-faint">deterministic reference engine</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((p) => {
            const tone = providerTone[p.status];
            return (
              <Card
                key={p.id}
                className={cx("p-5 hover-lift", p.status === "active" ? "border-accent/30" : "")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-semibold text-ink">{p.name}</div>
                    <div className="mt-0.5 text-[11px] text-faint">{p.role}</div>
                  </div>
                  <StatusChip tone={tone}>{p.status}</StatusChip>
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-muted">{p.note}</p>
                <div className="mt-3 flex items-center justify-between border-t border-edge pt-3">
                  <span className="font-mono text-[10px] text-faint">{p.adapter}</span>
                  {p.configured !== undefined ? (
                    <span
                      className={cx(
                        "inline-flex items-center gap-1 text-[10px] font-medium",
                        p.configured ? "text-accent" : "text-faint",
                      )}
                      title={
                        p.configured
                          ? "A credential is present (value never exposed)"
                          : "No credential configured"
                      }
                    >
                      <span
                        className={cx(
                          "h-1.5 w-1.5 rounded-full",
                          p.configured ? "bg-accent" : "bg-faint/60",
                        )}
                      />
                      {p.configured ? "Key configured" : "No key"}
                    </span>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-edge bg-surface2/40 p-3.5 text-[12px] text-muted">
          <Lock size={14} className="mt-0.5 shrink-0 text-faint" />
          No external model is called today. When a provider is enabled, facts and scores stay
          deterministic — the provider only narrates the explanation.
        </div>
      </Section>

      {/* DECISION PROVIDER · BYOK */}
      <DecisionProviderSection
        status={decisionStatus}
        recs={recs}
        loading={loading}
        onRun={onRun}
        onCompare={onCompareDecision}
      />

      {/* CRM CONNECTOR FRAMEWORK */}
      <Section
        eyebrow="CRM Connectors"
        title="Pluggable systems of record."
        sub="Every CRM speaks the same connector contract: read accounts and signals, then write back approved tasks and notes. HubSpot is live; the rest slot into the same abstraction."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {connectors.map((c) => {
            const tone = connectorTone[c.status];
            return (
              <Card key={c.id} className="flex items-start gap-3 p-4 hover-lift">
                <div
                  className={cx(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                    TONE[tone].ring,
                    TONE[tone].bg,
                  )}
                >
                  <Plug size={15} className={TONE[tone].text} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{c.name}</span>
                    <StatusChip tone={tone}>{c.status}</StatusChip>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{c.note}</p>
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      {/* PRODUCTION ARCHITECTURE */}
      <Section
        eyebrow="Production Architecture"
        title="Built to graduate from demo to deployment."
        sub="What is live today, what is designed and ready to wire, and what comes next for a multi-tenant enterprise rollout."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PRODUCTION_PILLARS.map((pillar) => {
            const tone = pillarTone[pillar.status];
            const Icon = PILLAR_ICON[pillar.name] ?? Layers;
            return (
              <Card key={pillar.name} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Icon size={16} className={TONE[tone].text} />
                    <span className="text-sm font-medium text-ink">{pillar.name}</span>
                  </div>
                  <StatusChip tone={tone}>{pillar.status}</StatusChip>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted">{pillar.detail}</p>
              </Card>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-faint">
          <Legend tone="good" label="Live today" />
          <Legend tone="progress" label="Designed · ready to wire" />
          <Legend tone="muted" label="Planned · enterprise rollout" />
          <span className="ml-auto inline-flex items-center gap-1.5">
            Phase 5 <ArrowRight size={12} /> live LLM reasoning &amp; usage telemetry
          </span>
        </div>
      </Section>
    </div>
  );
}

const PILLAR_ICON: Record<string, LucideIcon> = {
  "Human approval workflow": ShieldCheck,
  "Decision ledger & audit": ScrollText,
  "Governed reasoning": BadgeCheck,
  "Secrets management": KeyRound,
  Evaluation: Gauge,
  "Model routing": Cpu,
  "Connector management": Boxes,
  Observability: Eye,
  "Authentication & SSO": Lock,
  "Tenant isolation": Building2,
  "Role-based access": Users,
  "Per-user portfolio": Workflow,
};

function SummaryStat({ tone, value, label }: { tone: Tone; value: number; label: string }) {
  const t = TONE[tone];
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={cx("font-mono text-lg font-semibold", t.text)}>{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </span>
  );
}

function Legend({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("h-2 w-2 rounded-full", TONE[tone].dot)} />
      {label}
    </span>
  );
}

// -- Decision Provider · BYOK comparison ----------------------------------

function DecisionProviderSection({
  status,
  recs,
  loading,
  onRun,
  onCompare,
}: {
  status: DecisionProviderStatus | null;
  recs: Recommendation[];
  loading: boolean;
  onRun: () => void;
  onCompare: (accountId: string) => Promise<DecisionComparison>;
}) {
  const pickAccounts = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const r of recs) {
      if (seen.has(r.account_id)) continue;
      seen.add(r.account_id);
      out.push({ id: r.account_id, name: r.account_name });
      if (out.length >= 6) break;
    }
    return out;
  }, [recs]);

  const [accountId, setAccountId] = React.useState<string>("");
  const [cmp, setCmp] = React.useState<DecisionComparison | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!accountId && pickAccounts.length) setAccountId(pickAccounts[0].id);
  }, [pickAccounts, accountId]);

  const run = React.useCallback(
    async (id: string) => {
      if (!id) return;
      setBusy(true);
      setErr(null);
      try {
        setCmp(await onCompare(id));
      } catch (e) {
        setErr((e as Error).message);
        setCmp(null);
      } finally {
        setBusy(false);
      }
    },
    [onCompare],
  );

  return (
    <Section
      eyebrow="Decision Provider · BYOK"
      title="Compare how each provider would decide."
      sub="Bring your own key. Deterministic, OpenAI, Anthropic and NVIDIA all reason over the same governed account context and return one structured decision — so you can compare them side by side. The deterministic engine stays the benchmark and the safe fallback; LLM decisions are advisory and never change ranking, scoring or governance."
    >
      {/* PROVIDER STATUS STRIP */}
      <div className="flex flex-wrap items-center gap-2">
        {(status?.providers ?? []).map((p) => (
          <span
            key={p.id}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs",
              TONE[decisionStatusTone[p.status] ?? "muted"].ring,
              TONE[decisionStatusTone[p.status] ?? "muted"].bg,
            )}
            title={`${p.label} · ${p.model}`}
          >
            <span
              className={cx("h-1.5 w-1.5 rounded-full", TONE[decisionStatusTone[p.status] ?? "muted"].dot)}
            />
            <span className="font-medium text-ink">{p.label}</span>
            <span className={cx("text-[10px] uppercase tracking-wide", TONE[decisionStatusTone[p.status] ?? "muted"].text)}>
              {p.status.replace(/_/g, " ")}
            </span>
          </span>
        ))}
        {status ? (
          <span className="ml-auto text-[11px] text-faint">
            Default <span className="font-mono text-muted">{status.default_provider}</span> ·{" "}
            {status.configured_live_count} live key{status.configured_live_count === 1 ? "" : "s"} configured
          </span>
        ) : null}
      </div>

      {/* COMPARISON MODE */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <GitCompare size={15} className="text-brand-bright" />
            Comparison Mode
          </div>
          {pickAccounts.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {pickAccounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setAccountId(a.id);
                    void run(a.id);
                  }}
                  className={cx(
                    "rounded-full border px-3 py-1 text-xs transition",
                    accountId === a.id
                      ? "border-brand/40 bg-brand/10 text-ink"
                      : "border-edge bg-surface2/50 text-muted hover:text-ink",
                  )}
                >
                  {a.name}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void run(accountId)}
            disabled={busy || !accountId}
            className="btn btn-primary ml-auto py-1.5 text-xs"
          >
            <GitCompare size={13} />
            {busy ? "Comparing…" : "Compare providers"}
          </button>
        </div>

        {pickAccounts.length === 0 ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-edge bg-surface2/40 p-4 text-[12px] text-muted">
            <span>Run the workflow once to choose an account to compare across providers.</span>
            <button
              type="button"
              onClick={onRun}
              disabled={loading}
              className="btn btn-primary py-1.5 text-xs"
            >
              <Sparkles size={13} />
              {loading ? "Analyzing…" : "Run analysis"}
            </button>
          </div>
        ) : null}

        {err ? (
          <p className="mt-4 rounded-xl border border-amber/30 bg-amber/10 p-3 text-[12px] text-amber">{err}</p>
        ) : null}

        {cmp ? (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-2 text-[12px] text-muted">
              <span className="text-ink font-medium">{cmp.account_name}</span>
              <span className="text-faint/50">·</span>
              <span>
                {cmp.evaluation.providers_compared} live provider
                {cmp.evaluation.providers_compared === 1 ? "" : "s"} compared
              </span>
              {cmp.external_context_used ? (
                <>
                  <span className="text-faint/50">·</span>
                  <span className="text-faint">external context on (advisory)</span>
                </>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DecisionCard decision={cmp.baseline} baseline />
              {cmp.providers.map((d) => (
                <DecisionCard key={d.provider} decision={d} />
              ))}
            </div>

            {/* EVALUATION NOTES */}
            {cmp.evaluation_notes.length > 0 ? (
              <div className="rounded-xl border border-edge bg-surface2/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
                  <Gauge size={12} /> Evaluation
                </div>
                <ul className="space-y-1.5">
                  {cmp.evaluation_notes.map((n, i) => (
                    <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-muted">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-faint/60" />
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex items-start gap-2 rounded-xl border border-edge bg-surface2/40 p-3.5 text-[12px] text-muted">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" />
              {cmp.governance_caveat}
            </div>
          </div>
        ) : null}
      </Card>
    </Section>
  );
}

function DecisionLevelRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-faint">{label}</span>
      <span
        className={cx(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize",
          TONE[tone].ring,
          TONE[tone].bg,
          TONE[tone].text,
        )}
      >
        {value}
      </span>
    </div>
  );
}

function DecisionCard({ decision, baseline }: { decision: ProviderDecision; baseline?: boolean }) {
  const mode = decision.mode;
  const modeT = decisionModeTone[mode] ?? "muted";
  const notConfigured = mode === "not_configured";

  return (
    <div
      className={cx(
        "flex flex-col rounded-xl border bg-surface2/40 p-4",
        baseline ? "border-accent/30" : "border-edge",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            {baseline ? <BadgeCheck size={14} className="shrink-0 text-accent" /> : null}
            <span className="truncate capitalize">{decision.provider}</span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-faint">{decision.model}</div>
        </div>
        <StatusChip tone={modeT}>{decisionModeLabel(mode)}</StatusChip>
      </div>

      {notConfigured ? (
        <div className="mt-4 flex flex-1 flex-col items-start gap-2 rounded-lg border border-edge bg-base/30 p-3 text-[11px] text-faint">
          <KeyRound size={14} className="text-faint" />
          Add this provider&apos;s API key (BYOK) to generate a live decision and compare it against the
          deterministic baseline.
        </div>
      ) : (
        <>
          <div className="mt-3 space-y-1.5">
            <DecisionLevelRow label="Risk" value={decision.risk_level} tone={levelTone("risk", decision.risk_level)} />
            <DecisionLevelRow
              label="Opportunity"
              value={decision.opportunity_level}
              tone={levelTone("opportunity", decision.opportunity_level)}
            />
            <DecisionLevelRow
              label="Confidence"
              value={decision.confidence}
              tone={levelTone("confidence", decision.confidence)}
            />
          </div>
          <div className="mt-3 border-t border-edge pt-3">
            <div className="text-[11px] text-faint">Recommended action</div>
            <div className="mt-0.5 text-[13px] font-medium text-ink">
              {humanizeDecisionAction(decision.recommended_action)}
            </div>
          </div>
          {decision.executive_summary ? (
            <p className="mt-3 line-clamp-4 text-[11px] leading-relaxed text-muted">
              {decision.executive_summary}
            </p>
          ) : null}
          {decision.provider_error ? (
            <p className="mt-2 text-[10px] text-amber">Fell back to baseline ({decision.provider_error}).</p>
          ) : null}
          <div className="mt-auto pt-3 font-mono text-[10px] text-faint">{decision.latency_ms} ms</div>
        </>
      )}
    </div>
  );
}
