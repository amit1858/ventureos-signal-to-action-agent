"use client";

import * as React from "react";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Building2,
  CheckCircle2,
  Cpu,
  Eye,
  Gauge,
  GitCompare,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Plug,
  Power,
  Scale,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  Users,
  Workflow,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cx } from "@/lib/format";
import type {
  DecisionComparison,
  DecisionCredentialPayload,
  DecisionModelEntry,
  DecisionProviderCatalog,
  DecisionProviderStatus,
  DecisionProviderTestResult,
  HubspotStatus,
  MetaResponse,
  ProviderDecision,
  MultiAgentReport,
  Recommendation,
  SystemConfigResponse,
} from "@/lib/types";
import {
  agreementPct,
  connectorCatalog,
  decisionModeLabel,
  divergenceNotes,
  EVAL_GROUPS,
  evaluateSystem,
  humanizeDecisionAction,
  mergeProviderHealth,
  PRODUCTION_PILLARS,
  providerCatalog,
  providerHealthLabel,
  PROVIDER_META_LIST,
  reasoningLeaderboard,
  TRUST_PRINCIPLES,
  type ConnectorStatus,
  type EvalStatus,
  type PillarStatus,
  type ProviderHealth,
  type ProviderMeta,
  type ProviderStatus,
} from "@/lib/evaluation";
import {
  type ByokCredential,
  type ByokProviderId,
  clearCredential as byokClear,
  getActiveProvider,
  getAllCredentialsWire,
  getCredential,
  maskKey,
  setActiveProvider,
  setCredential as byokSet,
  type ActiveProvider,
} from "@/lib/byok";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";
import { AIReasoningPanel } from "@/components/AIReasoningStatus";
import type { AIOverlayMap } from "@/lib/aiOverlay";

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
  onTestProvider,
  aiOverlay,
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
  onCompareDecision: (
    accountId: string,
    credentials?: Record<string, DecisionCredentialPayload>,
  ) => Promise<DecisionComparison>;
  onTestProvider: (payload: {
    provider: string;
    api_key: string;
    model?: string;
    base_url?: string;
  }) => Promise<DecisionProviderTestResult>;
  aiOverlay?: AIOverlayMap | null;
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

      {/* Phase 6 · AI Reasoning Status — transparency anchor for the
          executive: provider/model, what AI is doing, what it is NOT
          doing, session utilization and the trust statement. */}
      <AIReasoningPanel overlay={aiOverlay ?? null} />

      {/* Phase 7 · Multi-agent reasoning metrics — sampled from the top
          recommendation. Shows specialist consensus, governance critic
          intervention rate and evidence sufficiency. Reasoning-only; never
          alters ranking, scoring or confidence. */}
      <MultiAgentMetrics recs={recs} />

      {/* TRUST & GOVERNANCE */}
      <Section
        eyebrow="Trust & Governance"
        title="How every decision is measured."
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

      {/* AI REASONING ENGINES */}
      <Section
        eyebrow="AI Reasoning Engines"
        title="One interface. Many engines."
        sub="Reasoning is governed and deterministic today; the narrative layer is provider-agnostic. The same agent contracts route from the governed engine to NVIDIA, OpenAI, Anthropic or Azure with no business-logic change."
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
        onTest={onTestProvider}
      />

      {/* SYSTEMS OF RECORD */}
      <Section
        eyebrow="Systems of Record"
        title="Pluggable CRM connectors."
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

      {/* PRODUCTION READINESS */}
      <Section
        eyebrow="Production Readiness"
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
  "HubSpot CRM (live)": Plug,
  "Market Intelligence (live)": Sparkles,
  "Governed Decision Engine (live)": BadgeCheck,
  "OpenAI BYOK (live)": Cpu,
  "Anthropic BYOK (live)": Cpu,
  "Human approval workflow (live)": ShieldCheck,
  "Decision ledger & audit (live)": ScrollText,
  "Secrets management (live)": KeyRound,
  "Evaluation harness (live)": Gauge,
  "NVIDIA Nemotron / NIM (ready)": Cpu,
  "Observability (ready)": Eye,
  "Salesforce (planned)": Plug,
  "Microsoft Dynamics 365 (planned)": Plug,
  "Authentication & SSO (planned)": Lock,
  "Role-based access (planned)": Users,
  "Multi-tenant isolation (planned)": Building2,
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

type TestPhase = "idle" | "testing" | "ok" | "fail";
interface TestState {
  phase: TestPhase;
  model?: string;
  modelDisplay?: string;
  providerLabel?: string;
  error?: string;
  errorCategory?: string;
  latency?: number;
}

// Phase 5.0A.1 — humanize backend error_category for the test result chip.
function diagnosticFor(category: string | undefined, fallback: string): string {
  switch (category) {
    case "invalid_key":
      return "Invalid API key — double-check the value you pasted.";
    case "model_not_found":
      return "Model not found — pick a different model from the dropdown.";
    case "endpoint_unavailable":
      return "Provider endpoint unavailable — try again in a moment.";
    case "rate_limited":
      return "Rate limited by the provider — wait and retry.";
    case "timeout":
      return "Request timed out — provider may be slow right now.";
    case "network":
      return "Network error reaching the provider.";
    case "invalid_output":
      return "Provider replied but the response could not be parsed.";
    case "unsupported":
      return fallback || "This provider does not support live testing.";
    default:
      return fallback || "Connection failed";
  }
}

const EMPTY_CRED: ByokCredential = { apiKey: "", model: "", baseUrl: "" };

function DecisionProviderSection({
  status,
  recs,
  loading,
  onRun,
  onCompare,
  onTest,
}: {
  status: DecisionProviderStatus | null;
  recs: Recommendation[];
  loading: boolean;
  onRun: () => void;
  onCompare: (
    accountId: string,
    credentials?: Record<string, DecisionCredentialPayload>,
  ) => Promise<DecisionComparison>;
  onTest: (payload: {
    provider: string;
    api_key: string;
    model?: string;
    base_url?: string;
  }) => Promise<DecisionProviderTestResult>;
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

  // -- session BYOK state (hydrated on mount; never during SSR) ----------
  const [hydrated, setHydrated] = React.useState(false);
  const [catalog, setCatalog] = React.useState<DecisionProviderCatalog | null>(null);
  const [creds, setCreds] = React.useState<Record<ByokProviderId, ByokCredential>>({
    openai: EMPTY_CRED,
    anthropic: EMPTY_CRED,
    nvidia: EMPTY_CRED,
  });
  const [active, setActive] = React.useState<ActiveProvider>("deterministic");
  const [tests, setTests] = React.useState<Record<ByokProviderId, TestState>>({
    openai: { phase: "idle" },
    anthropic: { phase: "idle" },
    nvidia: { phase: "idle" },
  });

  React.useEffect(() => {
    setCreds({
      openai: getCredential("openai") ?? EMPTY_CRED,
      anthropic: getCredential("anthropic") ?? EMPTY_CRED,
      nvidia: getCredential("nvidia") ?? EMPTY_CRED,
    });
    setActive(getActiveProvider());
    setHydrated(true);
    // Phase 5.0A.1 — fetch curated model catalog so users never type a model id.
    api
      .decisionCatalog()
      .then((c) => setCatalog(c))
      .catch(() => setCatalog(null));
  }, []);

  React.useEffect(() => {
    if (!catalog) return;
    setCreds((prev) => {
      let next = prev;
      for (const pid of ["openai", "anthropic", "nvidia"] as ByokProviderId[]) {
        const cur = (prev[pid].model || "").trim();
        const recommended = catalog.recommended[pid];
        if (!recommended) continue;
        const known = (catalog.providers[pid] ?? []).some((m) => m.id === cur);
        // If empty OR points at a model we no longer offer, snap to recommended.
        if (!cur || !known) {
          if (next === prev) next = { ...prev };
          next[pid] = { ...next[pid], model: recommended };
        }
      }
      return next;
    });
  }, [catalog]);

  const modelDisplayFor = React.useCallback(
    (pid: ByokProviderId, modelId: string): string => {
      const entry = (catalog?.providers[pid] ?? []).find((m) => m.id === modelId);
      return entry?.display || modelId;
    },
    [catalog],
  );

  // Phase 5.0A.2 — when a session key is pasted, rediscover that provider's
  // available models from its own /v1/models endpoint and merge into catalog
  // state. Falls back silently to the static catalog on any failure.
  const [discoverySource, setDiscoverySource] = React.useState<
    Record<ByokProviderId, "live" | "static" | "static_fallback">
  >({ openai: "static", anthropic: "static", nvidia: "static" });

  React.useEffect(() => {
    if (!hydrated) return;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    for (const pid of ["openai", "anthropic", "nvidia"] as ByokProviderId[]) {
      const key = creds[pid].apiKey.trim();
      if (!key) continue;
      // Debounce so we don't hammer providers while the user is typing.
      const t = setTimeout(() => {
        api
          .decisionModels(pid, key, creds[pid].baseUrl || undefined)
          .then((res) => {
            setCatalog((cur) => {
              if (!cur) return cur;
              const nextProviders = { ...cur.providers, [pid]: res.models };
              const nextRecommended = { ...cur.recommended, [pid]: res.recommended };
              return { ...cur, providers: nextProviders, recommended: nextRecommended };
            });
            setDiscoverySource((cur) => ({ ...cur, [pid]: res.source }));
            // If the user's currently-selected model isn't in the live list, snap to recommended.
            setCreds((prev) => {
              const cur = (prev[pid].model || "").trim();
              const known = res.models.some((m) => m.id === cur);
              if (cur && known) return prev;
              const next = { ...prev[pid], model: res.recommended };
              byokSet(pid, next);
              return { ...prev, [pid]: next };
            });
          })
          .catch(() => {
            setDiscoverySource((cur) => ({ ...cur, [pid]: "static_fallback" }));
          });
      }, 600);
      timers.push(t);
    }
    return () => timers.forEach(clearTimeout);
  }, [hydrated, creds.openai.apiKey, creds.anthropic.apiKey, creds.nvidia.apiKey]);

  const patchCred = React.useCallback(
    (provider: ByokProviderId, patch: Partial<ByokCredential>) => {
      setCreds((prev) => {
        const next = { ...prev[provider], ...patch };
        byokSet(provider, next);
        return { ...prev, [provider]: next };
      });
      // Editing the key invalidates any prior test verdict.
      if (patch.apiKey !== undefined) {
        setTests((prev) => ({ ...prev, [provider]: { phase: "idle" } }));
      }
    },
    [],
  );

  const handleTest = React.useCallback(
    async (provider: ByokProviderId) => {
      const cred = creds[provider];
      setTests((prev) => ({ ...prev, [provider]: { phase: "testing" } }));
      try {
        const res = await onTest({
          provider,
          api_key: cred.apiKey,
          model: cred.model,
          base_url: cred.baseUrl,
        });
        setTests((prev) => ({
          ...prev,
          [provider]: res.ok
            ? {
                phase: "ok",
                model: res.model,
                modelDisplay: res.model_display || res.model,
                providerLabel: res.provider_label,
                latency: res.latency_ms,
              }
            : {
                phase: "fail",
                error: res.error ?? res.status,
                errorCategory: res.error_category ?? undefined,
                latency: res.latency_ms,
              },
        }));
      } catch (e) {
        setTests((prev) => ({ ...prev, [provider]: { phase: "fail", error: (e as Error).message } }));
      }
    },
    [creds, onTest],
  );

  const handleActivate = React.useCallback((provider: ActiveProvider) => {
    setActive(provider);
    setActiveProvider(provider);
  }, []);

  const handleClear = React.useCallback(
    (provider: ByokProviderId) => {
      byokClear(provider);
      setCreds((prev) => ({ ...prev, [provider]: EMPTY_CRED }));
      setTests((prev) => ({ ...prev, [provider]: { phase: "idle" } }));
      setActive((cur) => (cur === provider ? "deterministic" : cur));
    },
    [],
  );

  // -- comparison --------------------------------------------------------
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
        setCmp(await onCompare(id, getAllCredentialsWire()));
      } catch (e) {
        setErr((e as Error).message);
        setCmp(null);
      } finally {
        setBusy(false);
      }
    },
    [onCompare],
  );

  const statusById = React.useMemo(() => {
    const m: Record<string, DecisionProviderStatus["providers"][number]> = {};
    for (const p of status?.providers ?? []) m[p.id] = p;
    return m;
  }, [status]);

  const sessionKeyCount = hydrated
    ? PROVIDER_META_LIST.filter((m) => creds[m.id].apiKey.trim().length > 0).length
    : 0;

  return (
    <Section
      eyebrow="AI Decision Engines · BYOK"
      title="Bring your own key. See how each engine decides."
      sub="Connect your own OpenAI, Anthropic or NVIDIA key right here — no infrastructure, no redeploy. Keys live only in this browser session and vanish when the tab closes. Every engine reasons over the same governed account context and returns one structured decision, so you can review them side by side as an executive review board. The Governed Decision Engine stays the benchmark and the safe fallback; LLM decisions are advisory and never change ranking, scoring or governance."
    >
      {/* SESSION-KEY TRUST BANNER */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-edge bg-surface2/40 px-3.5 py-2.5 text-[12px] text-muted">
        <Lock size={13} className="shrink-0 text-accent" />
        <span>
          <span className="font-medium text-ink">Session-only keys.</span> Stored in this browser tab,
          never sent to our servers except to run your request, never logged, never persisted. Closing
          the tab clears them.
        </span>
        {hydrated ? (
          <span className="ml-auto text-[11px] text-faint">
            {sessionKeyCount} session key{sessionKeyCount === 1 ? "" : "s"} set
          </span>
        ) : null}
      </div>

      {/* PROVIDER STATUS STRIP (env + session merged) */}
      <div className="flex flex-wrap items-center gap-2">
        <ProviderHealthChip
          label="Deterministic"
          health={active === "deterministic" ? "active" : "connected"}
          model="deterministic-engine-v1"
        />
        {PROVIDER_META_LIST.map((m) => {
          const health = mergeProviderHealth(statusById[m.id], {
            hasSessionKey: hydrated && creds[m.id].apiKey.trim().length > 0,
            isActive: active === m.id,
            lastTestOk:
              tests[m.id].phase === "ok" ? true : tests[m.id].phase === "fail" ? false : null,
          });
          return (
            <ProviderHealthChip
              key={m.id}
              label={m.label}
              health={health}
              model={modelDisplayFor(m.id, creds[m.id].model.trim() || m.defaultModel)}
            />
          );
        })}
        {status ? (
          <span className="ml-auto text-[11px] text-faint">
            Active <span className="font-mono text-muted">{active}</span>
          </span>
        ) : null}
      </div>

      {/* PROVIDER SETTINGS */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-ink">
          <KeyRound size={15} className="text-brand-bright" />
          Provider Settings
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {PROVIDER_META_LIST.map((m) => (
            <ProviderSettingsCard
              key={m.id}
              meta={m}
              cred={creds[m.id]}
              test={tests[m.id]}
              envConfigured={statusById[m.id]?.configured ?? false}
              active={active === m.id}
              hydrated={hydrated}
              models={catalog?.providers[m.id] ?? []}
              recommendedModel={catalog?.recommended[m.id] ?? m.defaultModel}
              discoverySource={discoverySource[m.id]}
              onKeyChange={(v) => patchCred(m.id, { apiKey: v })}
              onModelChange={(v) => patchCred(m.id, { model: v })}
              onTest={() => handleTest(m.id)}
              onActivate={() => handleActivate(m.id)}
              onClear={() => handleClear(m.id)}
            />
          ))}
        </div>

        {/* ACTIVE PROVIDER SELECTOR */}
        <div className="mt-5 border-t border-edge pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Active provider
            </span>
            {(["deterministic", ...PROVIDER_META_LIST.map((m) => m.id)] as ActiveProvider[]).map(
              (pid) => {
                const label =
                  pid === "deterministic"
                    ? "Deterministic"
                    : PROVIDER_META_LIST.find((m) => m.id === pid)?.label ?? pid;
                const isActive = active === pid;
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => handleActivate(pid)}
                    className={cx(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition",
                      isActive
                        ? "border-accent/40 bg-accent/10 text-ink"
                        : "border-edge bg-surface2/50 text-muted hover:text-ink",
                    )}
                  >
                    {isActive ? <CheckCircle2 size={12} className="text-accent" /> : null}
                    {label}
                  </button>
                );
              },
            )}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            This selection drives comparison and evaluation only. The seller Command Center always runs
            on the governed deterministic engine — activating a provider here never changes ranking,
            scoring, governance or CRM write-back.
          </p>
        </div>
      </Card>

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
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <span className="text-ink font-medium">{cmp.account_name}</span>
              <span className="text-faint/50">·</span>
              <span>
                {cmp.evaluation.providers_compared} live provider
                {cmp.evaluation.providers_compared === 1 ? "" : "s"} compared
              </span>
              {cmp.evaluation.fallback_used.length > 0 ? (
                <>
                  <span className="text-faint/50">·</span>
                  <span className="inline-flex items-center gap-1 text-amber">
                    <ShieldCheck size={12} />
                    {cmp.evaluation.fallback_used.join(", ")} fell back to deterministic
                  </span>
                </>
              ) : null}
              {cmp.external_context_used ? (
                <>
                  <span className="text-faint/50">·</span>
                  <span className="text-faint">external context on (advisory)</span>
                </>
              ) : null}
            </div>

            <ProviderConsensusBanner comparison={cmp} />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DecisionCard decision={cmp.baseline} baseline />
              {cmp.providers.map((d) => (
                <DecisionCard
                  key={d.provider}
                  decision={d}
                  agreement={
                    d.mode === "live" || d.mode === "fallback"
                      ? agreementPct(cmp.baseline, d)
                      : undefined
                  }
                />
              ))}
            </div>

            <ComparisonAnalytics comparison={cmp} />

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

// -- BYOK provider health chip -------------------------------------------

function ProviderHealthChip({
  label,
  health,
  model,
}: {
  label: string;
  health: ProviderHealth;
  model: string;
}) {
  const tone = decisionHealthTone[health] ?? "muted";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs",
        TONE[tone].ring,
        TONE[tone].bg,
      )}
      title={`${label} · ${model}`}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", TONE[tone].dot)} />
      <span className="font-medium text-ink">{label}</span>
      <span className={cx("text-[10px] uppercase tracking-wide", TONE[tone].text)}>
        {providerHealthLabel(health)}
      </span>
    </span>
  );
}

const decisionHealthTone: Record<ProviderHealth, Tone> = {
  active: "good",
  connected: "good",
  configured: "progress",
  not_configured: "muted",
  failed: "warn",
  fallback: "warn",
};

// -- BYOK provider settings card -----------------------------------------

function ProviderSettingsCard({
  meta,
  cred,
  test,
  envConfigured,
  active,
  hydrated,
  models,
  recommendedModel,
  discoverySource,
  onKeyChange,
  onModelChange,
  onTest,
  onActivate,
  onClear,
}: {
  meta: ProviderMeta;
  cred: ByokCredential;
  test: TestState;
  envConfigured: boolean;
  active: boolean;
  hydrated: boolean;
  models: DecisionModelEntry[];
  recommendedModel: string;
  discoverySource?: "live" | "static" | "static_fallback";
  onKeyChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onTest: () => void;
  onActivate: () => void;
  onClear: () => void;
}) {
  const hasSessionKey = hydrated && cred.apiKey.trim().length > 0;
  const source = hasSessionKey ? "Session key" : envConfigured ? "Env key" : "No key";
  const sourceTone: Tone = hasSessionKey ? "good" : envConfigured ? "progress" : "muted";
  const selectedId = cred.model.trim() || recommendedModel || meta.defaultModel;
  const selectedDisplay = models.find((m) => m.id === selectedId)?.display || selectedId;
  const hasCatalog = models.length > 0;

  return (
    <div
      className={cx(
        "flex flex-col rounded-xl border bg-surface2/40 p-4",
        active ? "border-accent/30" : "border-edge",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            {active ? <CheckCircle2 size={13} className="shrink-0 text-accent" /> : null}
            <span className="truncate">{meta.label}</span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-muted">{selectedDisplay}</div>
        </div>
        <span
          className={cx(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
            TONE[sourceTone].ring,
            TONE[sourceTone].bg,
            TONE[sourceTone].text,
          )}
        >
          {source}
        </span>
      </div>

      {/* API KEY (masked) */}
      <label className="mt-3 block text-[10px] font-medium uppercase tracking-wider text-faint">
        API key
      </label>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={cred.apiKey}
        onChange={(e) => onKeyChange(e.target.value)}
        placeholder={meta.placeholder}
        className="mt-1 w-full rounded-lg border border-edge bg-base/50 px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none transition placeholder:text-faint/60 focus:border-brand/40"
      />
      {hasSessionKey ? (
        <div className="mt-1 font-mono text-[10px] text-faint">{maskKey(cred.apiKey)}</div>
      ) : (
        <div className="mt-1 text-[10px] text-faint/70">Get a key at {meta.console}</div>
      )}

      {/* MODEL — curated dropdown (Phase 5.0A.1, replaces free-text entry) */}
      <label className="mt-2.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-faint">
        <span>Model</span>
        {discoverySource === "live" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-[1px] text-[9px] font-semibold normal-case tracking-normal text-accent">
            Live · {models.length}
          </span>
        ) : null}
        {discoverySource === "static_fallback" ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-amber/30 bg-amber/10 px-1.5 py-[1px] text-[9px] font-semibold normal-case tracking-normal text-amber"
            title="Live discovery failed — using curated catalog."
          >
            Catalog
          </span>
        ) : null}
      </label>
      <select
        value={selectedId}
        onChange={(e) => onModelChange(e.target.value)}
        disabled={!hasCatalog}
        className="mt-1 w-full rounded-lg border border-edge bg-base/50 px-2.5 py-1.5 text-[12px] text-ink outline-none transition focus:border-brand/40 disabled:opacity-50"
      >
        {hasCatalog ? (
          models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display}
              {m.recommended ? " · Recommended" : ""}
              {m.tier ? ` · ${m.tier}` : ""}
            </option>
          ))
        ) : (
          <option value={selectedId}>{selectedDisplay}</option>
        )}
      </select>

      {/* ACTIONS */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onTest}
          disabled={test.phase === "testing" || !hasSessionKey}
          className="btn btn-ghost py-1 text-[11px]"
          title={hasSessionKey ? "Test this key" : "Enter a key first"}
        >
          {test.phase === "testing" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Plug size={12} />
          )}
          {test.phase === "testing" ? "Testing…" : "Test"}
        </button>
        <button
          type="button"
          onClick={onActivate}
          disabled={active}
          className={cx("btn py-1 text-[11px]", active ? "btn-ghost" : "btn-primary")}
        >
          <Power size={12} />
          {active ? "Active" : "Activate"}
        </button>
        {hasSessionKey ? (
          <button
            type="button"
            onClick={onClear}
            className="btn btn-ghost ml-auto py-1 text-[11px] text-faint hover:text-amber"
            title="Clear this session key"
          >
            <Trash2 size={12} />
            Clear
          </button>
        ) : null}
      </div>

      {/* TEST RESULT — provider · resolved model · latency (Phase 5.0A.1) */}
      {test.phase === "ok" ? (
        <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-[11px] text-accent">
          <CheckCircle2 size={12} className="mt-[2px] shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              Connected{test.providerLabel ? ` · ${test.providerLabel}` : ""}
            </div>
            {test.modelDisplay ? (
              <div className="text-[10px] text-muted">{test.modelDisplay}</div>
            ) : null}
          </div>
          {typeof test.latency === "number" ? (
            <span className="font-mono text-[10px] text-faint">{test.latency} ms</span>
          ) : null}
        </div>
      ) : null}
      {test.phase === "fail" ? (
        <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-amber/30 bg-amber/10 px-2.5 py-1.5 text-[11px] text-amber">
          <XCircle size={12} className="mt-[2px] shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{diagnosticFor(test.errorCategory, test.error || "")}</div>
            {test.error && test.errorCategory ? (
              <div className="mt-0.5 truncate text-[10px] text-faint" title={test.error}>
                {test.error}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// -- Provider Consensus banner -------------------------------------------

/**
 * Executive review-board banner that summarises the comparison: overall
 * agreement %, areas of alignment, areas of disagreement and the recommended
 * final decision. Heuristic & advisory — never changes ranking or governance.
 */
function ProviderConsensusBanner({ comparison }: { comparison: DecisionComparison }) {
  const live = comparison.providers.filter(
    (p) => p.mode === "live" || p.mode === "fallback",
  );
  if (live.length === 0) return null;

  // Average agreement across live providers vs the governed baseline.
  const avgAgreement = Math.round(
    live.reduce((s, d) => s + agreementPct(comparison.baseline, d), 0) / live.length,
  );

  // Dimension-by-dimension consensus across baseline + every live provider.
  type Dim = "recommended_action" | "risk_level" | "opportunity_level" | "confidence";
  const DIMS: { key: Dim; label: string }[] = [
    { key: "recommended_action", label: "Recommended action" },
    { key: "risk_level", label: "Risk" },
    { key: "opportunity_level", label: "Opportunity" },
    { key: "confidence", label: "Confidence" },
  ];
  const aligned: { label: string; value: string }[] = [];
  const disputed: { label: string; baseline: string; others: string }[] = [];
  for (const d of DIMS) {
    const base = String(comparison.baseline[d.key]);
    const others = live.map((p) => String(p[d.key]));
    if (others.every((v) => v.toLowerCase() === base.toLowerCase())) {
      aligned.push({ label: d.label, value: base });
    } else {
      const uniqueOthers = Array.from(new Set(others)).join(" / ");
      disputed.push({ label: d.label, baseline: base, others: uniqueOthers });
    }
  }

  const tone: Tone = avgAgreement >= 75 ? "good" : avgAgreement >= 50 ? "progress" : "warn";
  const verdict =
    avgAgreement === 100
      ? "All engines align with the Governed Decision Engine. Proceed with the baseline recommendation."
      : avgAgreement >= 75
        ? "Strong alignment. The Governed Decision Engine remains the recommended final decision; advisory engines reinforce it."
        : avgAgreement >= 50
          ? "Partial alignment. Review the divergence below; the Governed Decision Engine remains the recommended final decision pending human review."
          : "Significant divergence. Defer to the Governed Decision Engine and escalate for human review.";

  return (
    <div className="rounded-2xl border border-edge bg-gradient-to-br from-surface2/70 to-surface2/30 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
            <Scale size={12} /> Provider Consensus
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className={cx("font-mono text-[34px] font-semibold leading-none", TONE[tone].text)}>
              {avgAgreement}%
            </span>
            <span className="text-[13px] text-muted">
              agreement across {live.length + 1} engine{live.length + 1 === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-muted">{verdict}</p>
        </div>

        <div className="grid w-full grid-cols-1 gap-3 sm:max-w-xl sm:grid-cols-2">
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
              <CheckCircle2 size={11} /> Alignment ({aligned.length})
            </div>
            {aligned.length > 0 ? (
              <ul className="space-y-1">
                {aligned.map((a) => (
                  <li key={a.label} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted">{a.label}</span>
                    <span className="truncate font-medium capitalize text-ink">{a.value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-faint">No fully aligned dimensions.</p>
            )}
          </div>

          <div className="rounded-xl border border-amber/20 bg-amber/5 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber">
              <GitCompare size={11} /> Divergence ({disputed.length})
            </div>
            {disputed.length > 0 ? (
              <ul className="space-y-1">
                {disputed.map((d) => (
                  <li key={d.label} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted">{d.label}</span>
                    <span className="truncate font-medium capitalize text-ink" title={`Baseline ${d.baseline} · Others ${d.others}`}>
                      {d.baseline} <span className="text-faint">vs</span> {d.others}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-faint">Fully aligned — no divergence.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-edge pt-3 text-[11px] text-faint">
        <BadgeCheck size={12} className="text-accent" />
        <span>
          <span className="font-medium text-ink">Recommended final decision:</span>{" "}
          <span className="capitalize">{String(comparison.baseline.recommended_action)}</span> · Governed Decision Engine
        </span>
        <span className="ml-auto">Advisory only — governance and human approval still apply.</span>
      </div>
    </div>
  );
}

// -- comparison analytics (agreement / divergence / leaderboard) ----------

function ComparisonAnalytics({ comparison }: { comparison: DecisionComparison }) {
  const liveProviders = comparison.providers.filter(
    (p) => p.mode === "live" || p.mode === "fallback",
  );
  const notes = React.useMemo(() => divergenceNotes(comparison), [comparison]);
  const board = React.useMemo(() => reasoningLeaderboard(comparison), [comparison]);

  if (liveProviders.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* PROVIDER AGREEMENT */}
      <div className="rounded-xl border border-edge bg-surface2/40 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
          <Scale size={12} /> Provider agreement
        </div>
        <div className="space-y-2.5">
          {liveProviders.map((d) => {
            const pct = agreementPct(comparison.baseline, d);
            const tone: Tone = pct >= 75 ? "good" : pct >= 50 ? "progress" : "warn";
            return (
              <div key={d.provider}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="capitalize text-muted">Deterministic vs {d.provider}</span>
                  <span className={cx("font-semibold", TONE[tone].text)}>{pct}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-base/60">
                  <div className={cx("h-full rounded-full", TONE[tone].dot)} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DECISION DIVERGENCE */}
      <div className="rounded-xl border border-edge bg-surface2/40 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
          <GitCompare size={12} /> Decision divergence
        </div>
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.provider} className="text-[11px] leading-relaxed text-muted">
              <span className="font-medium capitalize text-ink">{n.provider}:</span> {n.text}
            </li>
          ))}
        </ul>
      </div>

      {/* PROVIDER LEADERBOARD */}
      <div className="rounded-xl border border-edge bg-surface2/40 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
          <Trophy size={12} /> Reasoning leaderboard
        </div>
        <ol className="space-y-2">
          {board.map((row, i) => (
            <li key={row.provider} className="flex items-center gap-2.5">
              <span
                className={cx(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  i === 0 ? "bg-accent/15 text-accent" : "bg-base/60 text-faint",
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                  <span className="capitalize">{row.label}</span>
                  {row.isBaseline ? (
                    <span className="rounded border border-accent/30 bg-accent/10 px-1 text-[8px] font-semibold uppercase text-accent">
                      Baseline
                    </span>
                  ) : null}
                </div>
                <div className="text-[10px] text-faint">
                  {row.reasoningCount} reason{row.reasoningCount === 1 ? "" : "s"}
                  {row.hasStrategy ? " · strategy" : ""}
                  {row.hasCrmNote ? " · CRM note" : ""}
                </div>
              </div>
              <span className="font-mono text-[10px] text-faint">{row.score}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2.5 text-[10px] leading-relaxed text-faint/80">
          Heuristic richness score (explanation depth, strategy, CRM note). Transparency aid only — not a
          benchmark of accuracy, and it never changes ranking.
        </p>
      </div>
    </div>
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

function DecisionCard({
  decision,
  baseline,
  agreement,
}: {
  decision: ProviderDecision;
  baseline?: boolean;
  agreement?: number;
}) {
  const mode = decision.mode;
  const modeT = decisionModeTone[mode] ?? "muted";
  const notConfigured = mode === "not_configured";
  const strategy = (decision.conversation_strategy ?? []).filter((s) => s && s.trim());

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
          Add this provider&apos;s API key in Provider Settings above (BYOK) to generate a live decision
          and compare it against the deterministic baseline.
        </div>
      ) : (
        <>
          {typeof agreement === "number" ? (
            <div className="mt-2.5 inline-flex w-fit items-center gap-1 rounded-md border border-edge bg-base/40 px-2 py-0.5 text-[10px] text-faint">
              <Scale size={10} />
              {agreement}% match with baseline
            </div>
          ) : null}
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
          {decision.business_implication ? (
            <div className="mt-3 border-t border-edge pt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                Business implication
              </div>
              <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted">
                {decision.business_implication}
              </p>
            </div>
          ) : null}
          {strategy.length > 0 ? (
            <div className="mt-3 border-t border-edge pt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                Conversation strategy
              </div>
              <ol className="mt-1 space-y-1">
                {strategy.slice(0, 3).map((s, i) => (
                  <li key={i} className="flex gap-1.5 text-[11px] leading-relaxed text-muted">
                    <span className="font-mono text-[9px] text-faint">{i + 1}.</span>
                    <span className="line-clamp-2">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {decision.crm_note ? (
            <div className="mt-3 border-t border-edge pt-3">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
                <ScrollText size={10} /> CRM note draft
              </div>
              <p className="mt-1 line-clamp-3 rounded-md border border-edge bg-base/40 px-2 py-1.5 text-[10px] leading-relaxed text-muted">
                {decision.crm_note}
              </p>
            </div>
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


// -- Phase 7 -- Multi-agent reasoning metrics ------------------------------

function MultiAgentMetrics({ recs }: { recs: Recommendation[] }) {
  const [reports, setReports] = React.useState<MultiAgentReport[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const sampleIds = React.useMemo(
    () => recs.slice(0, 3).map((r) => r.account_id),
    [recs],
  );

  React.useEffect(() => {
    if (sampleIds.length === 0) {
      setReports([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.allSettled(sampleIds.map((id) => api.multiAgent(id)))
      .then((settled) => {
        if (cancelled) return;
        const ok = settled
          .filter((s): s is PromiseFulfilledResult<MultiAgentReport> => s.status === "fulfilled")
          .map((s) => s.value);
        setReports(ok);
        if (ok.length === 0) setError("Multi-agent endpoint unreachable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sampleIds.join(",")]);

  if (sampleIds.length === 0) {
    return (
      <Card className="p-5">
        <div className="panel-title mb-2">Multi-agent reasoning</div>
        <p className="text-[12px] text-muted">
          Run the analysis to measure specialist agent agreement and governance intervention.
        </p>
      </Card>
    );
  }

  const consensusAvg =
    reports.length > 0
      ? reports.reduce((sum, r) => sum + (r.consensus_score || 0), 0) / reports.length
      : 0;
  const totalContradictions = reports.reduce(
    (sum, r) => sum + r.contradictions.length + r.governance_review.contradictions.length,
    0,
  );
  const totalUnsupported = reports.reduce(
    (sum, r) => sum + r.governance_review.unsupported_claims.length,
    0,
  );
  const totalWarnings = reports.reduce(
    (sum, r) => sum + r.governance_review.risk_warnings.length,
    0,
  );
  const governanceRate =
    reports.length > 0
      ? Math.round(
          (reports.filter(
            (r) =>
              r.governance_review.contradictions.length +
                r.governance_review.unsupported_claims.length +
                r.governance_review.risk_warnings.length >
              0,
          ).length /
            reports.length) *
            100,
        )
      : 0;
  const evidenceStrong = reports.filter((r) => r.governance_review.evidence_sufficiency === "high").length;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="panel-title">Multi-agent reasoning (Phase 7)</div>
        <span className="text-[10px] uppercase tracking-wide text-faint">
          Sampled across top {reports.length || sampleIds.length} accounts
        </span>
      </div>
      {loading && reports.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-edge bg-surface2/40" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-risk/30 bg-risk/10 p-3 text-[12px] text-risk">{error}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCell label="Specialist consensus" value={`${Math.round(consensusAvg * 100)}%`} tone="ok" />
          <MetricCell
            label="Governance intervention"
            value={`${governanceRate}%`}
            tone={governanceRate > 50 ? "warn" : "ok"}
          />
          <MetricCell
            label="Unsupported claims"
            value={String(totalUnsupported)}
            tone={totalUnsupported > 0 ? "warn" : "ok"}
          />
          <MetricCell label="Cross-agent contradictions" value={String(totalContradictions)} tone={totalContradictions > 0 ? "warn" : "ok"} />
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Five specialist agents (Risk, Growth, Research, Engagement, Governance critic) reason independently
        over each account. Metrics above are advisory � they never alter ranking, scoring or confidence.
        Strong evidence sufficiency on {evidenceStrong} of {reports.length} sampled accounts; {totalWarnings} active
        governance warning(s).
      </p>
    </Card>
  );
}

function MetricCell({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" }) {
  return (
    <div
      className={cx(
        "rounded-lg border p-3",
        tone === "ok" ? "border-accent/25 bg-accent/[0.05]" : "border-amber-400/25 bg-amber-400/[0.05]",
      )}
    >
      <div className="text-[10px] uppercase tracking-wide text-faint">{label}</div>
      <div className={cx("mt-1 text-xl font-semibold", tone === "ok" ? "text-accent" : "text-amber-300")}>
        {value}
      </div>
    </div>
  );
}
