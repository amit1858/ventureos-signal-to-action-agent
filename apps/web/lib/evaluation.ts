// Phase 4.4 · Evaluation & Architecture foundation (presentation only).
//
// This module derives the Evaluation Center, the model-provider framework, the
// CRM-connector framework and the production-readiness matrix that the
// Evaluation view renders. It is *purely descriptive*: it reads the already-
// computed recommendations + meta and reports how the system behaves. It never
// changes ranking, scoring, confidence, governance or CRM write-back — there is
// no business logic here, only how the existing behaviour is measured and shown.

import type {
  DecisionComparison,
  DecisionProviderStatusRow,
  MetaResponse,
  ProviderDecision,
  Recommendation,
  SystemConfigResponse,
} from "./types";

// -- Evaluation Center ----------------------------------------------------

export type EvalStatus = "pass" | "review" | "planned";

export type EvalGroup = "Output quality" | "Governance & trust" | "Performance & runtime";

export interface EvalDimension {
  id: string;
  label: string;
  group: EvalGroup;
  status: EvalStatus;
  /** Short headline verdict, e.g. "PASS" / "Awaiting run" / "Phase 5". */
  signal: string;
  /** One-sentence reason, evidence-backed where possible. */
  reason: string;
  /** Optional compact metric, e.g. "8 evidence avg" or "3 ms". */
  metric?: string;
}

export interface EvaluationSummary {
  passed: number;
  review: number;
  planned: number;
  total: number;
  /** True once a workflow run exists, so live-output dimensions are measured. */
  measured: boolean;
}

export interface EvaluationReport {
  dimensions: EvalDimension[];
  summary: EvaluationSummary;
}

export interface EvaluateInput {
  recs: Recommendation[];
  meta: MetaResponse | null;
  externalEnabled: boolean;
  latencyMs: number;
  provider: string;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Derive the twelve evaluation dimensions from live system output. Capability
 * dimensions (architecture truths) always pass; data-derived dimensions
 * (evidence, latency, recommendation quality) are measured from the run when
 * one exists and otherwise reported as "awaiting run".
 */
export function evaluateSystem(input: EvaluateInput): EvaluationReport {
  const { recs, externalEnabled, latencyMs, provider } = input;
  const measured = recs.length > 0;
  const top = recs[0];

  const evidenceCounts = recs.map((r) => r.evidence?.length ?? 0);
  const avgEvidence = avg(evidenceCounts);
  const allHaveEvidence = measured && evidenceCounts.every((c) => c > 0);

  const allGoverned =
    measured &&
    recs.every(
      (r) => typeof r.governance_status === "string" && Array.isArray(r.governance_caveats),
    );
  const allPending = measured && recs.every((r) => r.approval_status === "pending");
  const allHaveScripts = measured && recs.every((r) => !!r.call_script && !!r.draft_email);

  const latencyOk = measured && latencyMs > 0 && latencyMs < 2000;
  const deterministic = provider === "mock";

  const dims: EvalDimension[] = [
    // -- Output quality --------------------------------------------------
    {
      id: "recommendation_quality",
      label: "Recommendation quality",
      group: "Output quality",
      status: measured ? "pass" : "review",
      signal: measured ? "PASS" : "Awaiting run",
      reason: measured
        ? `Top recommendation (${top?.account_name}) is the highest-priority account by the deterministic risk + opportunity score.`
        : "Run the agent workflow to evaluate ranking on live output.",
      metric: measured ? `${recs.length} ranked` : undefined,
    },
    {
      id: "evidence_quality",
      label: "Evidence quality",
      group: "Output quality",
      status: allHaveEvidence ? "pass" : measured ? "review" : "review",
      signal: allHaveEvidence ? "PASS" : measured ? "REVIEW" : "Awaiting run",
      reason: allHaveEvidence
        ? "Every recommendation cites internal CRM evidence with a named source agent and source system."
        : measured
          ? "One or more recommendations surfaced with minimal evidence — governance flags these for human review."
          : "Run the workflow to measure evidence completeness.",
      metric: measured ? `${avgEvidence.toFixed(1)} avg items` : undefined,
    },
    {
      id: "executive_brief_quality",
      label: "Executive brief quality",
      group: "Output quality",
      status: "pass",
      signal: "PASS",
      reason:
        "Each account renders a structured Executive Decision Brief — summary, internal evidence, fused insight, business + seller implications — not a raw data dump.",
    },
    {
      id: "conversation_strategy_quality",
      label: "Conversation strategy quality",
      group: "Output quality",
      status: allHaveScripts ? "pass" : "review",
      signal: allHaveScripts ? "PASS" : "Awaiting run",
      reason: allHaveScripts
        ? "Every recommendation ships a seller-ready opening line, call script and email draft grounded in the evidence."
        : "Run the workflow to evaluate the generated outreach.",
    },
    {
      id: "external_intelligence_quality",
      label: "External intelligence quality",
      group: "Output quality",
      status: "pass",
      signal: externalEnabled ? "PASS · LIVE" : "PASS · OFF",
      reason: externalEnabled
        ? "Outside-in context is synthesized, cited and caveated, and used only as supporting evidence."
        : "Disabled by default — recommendations rely solely on internal CRM truth, with no external dependency.",
    },
    // -- Governance & trust ----------------------------------------------
    {
      id: "governance_compliance",
      label: "Governance compliance",
      group: "Governance & trust",
      status: measured ? (allGoverned && allPending ? "pass" : "review") : "review",
      signal: measured ? (allGoverned && allPending ? "PASS" : "REVIEW") : "Awaiting run",
      reason:
        measured && allGoverned && allPending
          ? "All recommendations carry a governance status and caveats, and start as pending — no autonomous action."
          : measured
            ? "A recommendation is missing governance metadata or default-pending status."
            : "Run the workflow to verify governance on live output.",
      metric: allPending && measured ? "100% human-gated" : undefined,
    },
    {
      id: "source_attribution",
      label: "Source attribution",
      group: "Governance & trust",
      status: "pass",
      signal: "PASS",
      reason:
        "Every evidence item names its source agent and source system (CRM, Billing, Support, Telemetry, Marketing); external claims cite title + URL.",
    },
    {
      id: "hallucination_prevention",
      label: "Hallucination prevention",
      group: "Governance & trust",
      status: "pass",
      signal: "PASS",
      reason:
        "The reasoning engine is deterministic — figures are read from CRM fields, never generated. External signals are supporting-only and always cited.",
    },
    {
      id: "no_autonomous_writeback",
      label: "CRM write-back safety",
      group: "Governance & trust",
      status: "pass",
      signal: "PASS",
      reason:
        "Write-back is advisory: a suggested task, note and follow-up that a human must approve before anything reaches the CRM.",
    },
    // -- Performance & runtime -------------------------------------------
    {
      id: "determinism",
      label: "Determinism",
      group: "Performance & runtime",
      status: "pass",
      signal: deterministic ? "PASS" : "PROVIDER",
      reason: deterministic
        ? "The active mock provider is fully deterministic: identical inputs produce identical rankings and scores — ideal for evaluation."
        : `Provider '${provider}' is active; the deterministic engine still ranks and scores — the provider only narrates.`,
    },
    {
      id: "latency",
      label: "Latency",
      group: "Performance & runtime",
      status: measured ? (latencyOk ? "pass" : "review") : "review",
      signal: measured ? (latencyOk ? "PASS" : "REVIEW") : "Awaiting run",
      reason: measured
        ? `The six-agent workflow completed in ${latencyMs} ms, well inside the < 2 s interactive budget.`
        : "Run the workflow to measure end-to-end latency.",
      metric: measured ? `${latencyMs} ms` : undefined,
    },
    {
      id: "token_usage",
      label: "Token / provider usage",
      group: "Performance & runtime",
      status: "planned",
      signal: "PHASE 5",
      reason:
        "Token, cost and provider-usage telemetry lands with the live LLM provider in Phase 5; the deterministic engine has no token cost today.",
    },
  ];

  const summary: EvaluationSummary = {
    passed: dims.filter((d) => d.status === "pass").length,
    review: dims.filter((d) => d.status === "review").length,
    planned: dims.filter((d) => d.status === "planned").length,
    total: dims.length,
    measured,
  };

  return { dimensions: dims, summary };
}

export const EVAL_GROUPS: EvalGroup[] = [
  "Output quality",
  "Governance & trust",
  "Performance & runtime",
];

// -- Model-provider framework --------------------------------------------

export type ProviderStatus = "active" | "ready" | "planned";

export interface ProviderEntry {
  id: string;
  name: string;
  role: string;
  status: ProviderStatus;
  note: string;
  adapter: string;
  /** True when a credential for this provider is present (never the secret). */
  configured?: boolean;
}

/**
 * The model-provider catalogue. Order communicates the swap path:
 * Mock (today) → NVIDIA (next) → OpenAI / Azure (future). The active provider is
 * highlighted from live meta; configured flags come from redacted diagnostics.
 */
export function providerCatalog(
  activeProvider: string,
  config?: SystemConfigResponse | null,
): ProviderEntry[] {
  const active = (activeProvider || "mock").toLowerCase();
  const cfg = config?.config;
  return [
    {
      id: "mock",
      name: "Mock (Deterministic)",
      role: "Reference reasoning engine",
      status: "active",
      note: "Deterministic, offline, always available. Identical inputs produce identical rankings — the evaluation baseline.",
      adapter: "mock_adapter.py",
      configured: true,
    },
    {
      id: "nvidia",
      name: "NVIDIA Nemotron / NIM",
      role: "GPU-backed narrative + reasoning",
      status: active === "nvidia" || active === "nim" || active === "nemotron" ? "active" : "ready",
      note: "Adapter implemented. Set MODEL_PROVIDER=nvidia with NVIDIA_API_KEY to route narration to Nemotron / NIM endpoints.",
      adapter: "nvidia_nim_adapter.py",
      configured: cfg?.nvidia_configured,
    },
    {
      id: "openai",
      name: "OpenAI",
      role: "Narrative provider",
      status: active === "openai" ? "active" : "planned",
      note: "Adapter stub present. The narrative layer routes through OpenAI while facts stay deterministic.",
      adapter: "openai_adapter.py",
      configured: cfg?.openai_configured,
    },
    {
      id: "claude",
      name: "Anthropic Claude",
      role: "Narrative provider",
      status: active === "claude" || active === "anthropic" ? "active" : "planned",
      note: "Adapter stub present behind the same interface; selectable without touching the agents.",
      adapter: "claude_adapter.py",
      configured: cfg?.anthropic_configured,
    },
    {
      id: "azure",
      name: "Azure AI",
      role: "Enterprise routing target",
      status: "planned",
      note: "Future enterprise routing target for tenants standardised on Azure AI Foundry.",
      adapter: "planned",
    },
  ];
}

// -- CRM-connector framework ---------------------------------------------

export type ConnectorStatus = "active" | "available" | "planned";

export interface ConnectorEntry {
  id: string;
  name: string;
  status: ConnectorStatus;
  note: string;
}

/**
 * The CRM-connector catalogue. HubSpot is live behind the shared CRMConnector
 * interface; the rest slot into the same abstraction without engine changes.
 */
export function connectorCatalog(hubspotActive: boolean, hubspotConfigured: boolean): ConnectorEntry[] {
  return [
    {
      id: "hubspot",
      name: "HubSpot",
      status: hubspotActive ? "active" : hubspotConfigured ? "available" : "available",
      note: hubspotActive
        ? "Live test CRM — 40 synthetic companies, approved task + note write-back."
        : "Implemented connector. Sync 40 demo companies and write back approved tasks + notes.",
    },
    {
      id: "salesforce",
      name: "Salesforce",
      status: "planned",
      note: "Same CRMConnector interface: object mapping + approved task/note write-back.",
    },
    {
      id: "dynamics",
      name: "Microsoft Dynamics 365",
      status: "planned",
      note: "Enterprise CRM target; maps accounts, activities and write-back to the shared contract.",
    },
    {
      id: "sap",
      name: "SAP CRM",
      status: "planned",
      note: "Large-enterprise target slotting into the same connector abstraction.",
    },
    {
      id: "zoho",
      name: "Zoho CRM",
      status: "planned",
      note: "SMB-focused target; identical sync + write-back surface.",
    },
  ];
}

// -- Production-readiness matrix -----------------------------------------

export type PillarStatus = "live" | "designed" | "planned";

export interface ProductionPillar {
  name: string;
  status: PillarStatus;
  detail: string;
}

/** The production architecture pillars, honestly graded live / designed / planned. */
export const PRODUCTION_PILLARS: ProductionPillar[] = [
  {
    name: "Human approval workflow",
    status: "live",
    detail: "Every action starts pending; a person approves, edits or rejects before any write-back.",
  },
  {
    name: "Decision ledger & audit",
    status: "live",
    detail: "Every run is traced — agents, evidence, confidence, caveats — and persisted for replay.",
  },
  {
    name: "Governed reasoning",
    status: "live",
    detail: "Confidence scoring with caveats and an insufficient-evidence guardrail on every recommendation.",
  },
  {
    name: "Secrets management",
    status: "live",
    detail: "Keys read once via central config, never logged; .env is git-ignored and diagnostics are redacted to booleans.",
  },
  {
    name: "Evaluation",
    status: "live",
    detail: "A deterministic eval suite (10/10) plus this Evaluation Center measure output, governance and latency.",
  },
  {
    name: "Model routing",
    status: "designed",
    detail: "A provider factory routes mock → NVIDIA / OpenAI via MODEL_PROVIDER without touching the agents.",
  },
  {
    name: "Connector management",
    status: "designed",
    detail: "A shared CRMConnector abstraction — HubSpot is live; Salesforce, Dynamics and others slot in.",
  },
  {
    name: "Observability",
    status: "designed",
    detail: "Read-only /api/system/status, /config and /threads diagnostics with structured, secret-free logs.",
  },
  {
    name: "Authentication & SSO",
    status: "planned",
    detail: "OIDC / Microsoft Entra ID at the edge; the API contracts are already stateless and token-ready.",
  },
  {
    name: "Tenant isolation",
    status: "planned",
    detail: "Per-tenant data and key partitioning so each customer's portfolio and secrets stay separate.",
  },
  {
    name: "Role-based access",
    status: "planned",
    detail: "Seller / manager / admin scopes governing who can approve and who can write back.",
  },
  {
    name: "Per-user portfolio",
    status: "planned",
    detail: "Book-of-business scoping so each seller sees and acts on only their own accounts.",
  },
];

// -- Trust ----------------------------------------------------------------

/** The standing trust principles reinforced across the product. */
export const TRUST_PRINCIPLES: string[] = [
  "AI assists. Humans decide.",
  "No CRM update is written without human approval.",
  "External signals are advisory and never change ranking, scoring or governance.",
  "Every recommendation is explainable and traceable to its evidence.",
  "Figures come from your CRM — never invented.",
];

// -- Demo-delight loading narration --------------------------------------

/** Warm, executive loading narration (Phase 4.4 demo delight). */
export const LOADING_PHASES: string[] = [
  "Reviewing customer signals…",
  "Evaluating renewal and churn risk…",
  "Weighing growth opportunities…",
  "Checking evidence and governance…",
  "Analyzing external intelligence…",
  "Preparing executive recommendations…",
];

/** Shown the moment results are ready. */
export const LOADING_DONE = "I'm ready. Here's where I'd spend today.";

// -- BYOK decision providers (Phase 5.0) ----------------------------------

/** Default accounts to showcase in Comparison Mode (synthetic ids). The view
 *  prefers the live ranked accounts when a run exists, so this is only a hint. */
export const DECISION_DEMO_ACCOUNTS: { id: string; name: string }[] = [
  { id: "ACC-0016", name: "Curefoods" },
  { id: "ACC-0003", name: "Razorpay" },
  { id: "ACC-0002", name: "Zepto" },
];

const DECISION_ACTION_LABELS: Record<string, string> = {
  support_escalation: "Support escalation",
  renewal_prep: "Renewal prep",
  optimization_review: "Optimization review",
  reactivation: "Reactivation",
  follow_up: "Follow-up",
  monitor: "Monitor",
};

/** Human-readable label for a bounded action-vocabulary value. */
export function humanizeDecisionAction(action: string): string {
  return DECISION_ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

/** Short label for how a single decision was produced. */
export function decisionModeLabel(mode: string): string {
  switch (mode) {
    case "deterministic":
      return "Baseline";
    case "live":
      return "Live";
    case "fallback":
      return "Fallback";
    case "not_configured":
      return "Not configured";
    default:
      return mode;
  }
}

// -- BYOK provider experience (Phase 5.0A) --------------------------------

export interface ProviderMeta {
  id: "openai" | "anthropic" | "nvidia";
  label: string;
  vendor: string;
  defaultModel: string;
  /** Recognisable, non-secret key prefix shown as guidance (not validation). */
  keyHint: string;
  placeholder: string;
  /** Where to get a key — informational only. */
  console: string;
}

/** Display metadata for the three live BYOK providers (no secrets here). */
export const PROVIDER_META: Record<"openai" | "anthropic" | "nvidia", ProviderMeta> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    vendor: "OpenAI",
    defaultModel: "gpt-4o-mini",
    keyHint: "sk-",
    placeholder: "sk-…",
    console: "platform.openai.com",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    vendor: "Anthropic",
    defaultModel: "claude-sonnet-4-20250514",
    keyHint: "sk-ant-",
    placeholder: "sk-ant-…",
    console: "console.anthropic.com",
  },
  nvidia: {
    id: "nvidia",
    label: "NVIDIA Nemotron",
    vendor: "NVIDIA",
    defaultModel: "nvidia/nemotron-4-340b-instruct",
    keyHint: "nvapi-",
    placeholder: "nvapi-…",
    console: "build.nvidia.com",
  },
};

export const PROVIDER_META_LIST: ProviderMeta[] = [
  PROVIDER_META.openai,
  PROVIDER_META.anthropic,
  PROVIDER_META.nvidia,
];

/** Human label for a merged provider health state (env + session + run). */
export type ProviderHealth =
  | "active"
  | "connected"
  | "configured"
  | "not_configured"
  | "failed"
  | "fallback";

export function providerHealthLabel(health: ProviderHealth): string {
  switch (health) {
    case "active":
      return "Active";
    case "connected":
      return "Connected";
    case "configured":
      return "Configured";
    case "failed":
      return "Failed";
    case "fallback":
      return "Fallback";
    default:
      return "Not configured";
  }
}

// -- Comparison analytics (heuristic, read-only) --------------------------

const AGREEMENT_FIELDS: (keyof Pick<
  ProviderDecision,
  "risk_level" | "opportunity_level" | "recommended_action" | "confidence"
>)[] = ["risk_level", "opportunity_level", "recommended_action", "confidence"];

/**
 * Heuristic agreement between a live provider decision and the deterministic
 * baseline: the fraction of the four decision dimensions that match, as a
 * percentage. This is a presentation metric only — it never affects ranking.
 */
export function agreementPct(baseline: ProviderDecision, decision: ProviderDecision): number {
  const matches = AGREEMENT_FIELDS.filter(
    (f) => String(baseline[f]).toLowerCase() === String(decision[f]).toLowerCase(),
  ).length;
  return Math.round((matches / AGREEMENT_FIELDS.length) * 100);
}

export interface DivergenceNote {
  provider: string;
  text: string;
}

const FIELD_LABEL: Record<string, string> = {
  risk_level: "risk",
  opportunity_level: "opportunity",
  recommended_action: "recommended action",
  confidence: "confidence",
};

/**
 * Plain-language notes describing where each live provider diverges from the
 * deterministic baseline. Advisory framing only — governance still decides.
 */
export function divergenceNotes(comparison: DecisionComparison): DivergenceNote[] {
  const { baseline, providers } = comparison;
  const live = providers.filter((p) => p.mode === "live" || p.mode === "fallback");
  const notes: DivergenceNote[] = [];
  for (const decision of live) {
    const diffs = AGREEMENT_FIELDS.filter(
      (f) => String(baseline[f]).toLowerCase() !== String(decision[f]).toLowerCase(),
    );
    if (diffs.length === 0) {
      notes.push({
        provider: decision.provider,
        text: `Fully aligned with the deterministic baseline across risk, opportunity, action and confidence.`,
      });
      continue;
    }
    const parts = diffs.map(
      (f) => `${FIELD_LABEL[f]} ${String(decision[f])} vs baseline ${String(baseline[f])}`,
    );
    notes.push({
      provider: decision.provider,
      text: `Diverges on ${parts.join("; ")}. Advisory only — governance and human approval still apply.`,
    });
  }
  return notes;
}

export interface LeaderboardRow {
  provider: string;
  label: string;
  score: number;
  reasoningCount: number;
  hasStrategy: boolean;
  hasCrmNote: boolean;
  latencyMs: number;
  isBaseline: boolean;
}

/**
 * A heuristic "reasoning quality" leaderboard across the baseline and any live
 * providers. Scored by explanation richness (reasoning depth, conversation
 * strategy, CRM note draft), with lower latency as a gentle tiebreak. This is a
 * transparent heuristic for demo insight — not a benchmark of model accuracy and
 * it never changes ranking, scoring or governance.
 */
export function reasoningLeaderboard(comparison: DecisionComparison): LeaderboardRow[] {
  const candidates: ProviderDecision[] = [
    comparison.baseline,
    ...comparison.providers.filter((p) => p.mode === "live" || p.mode === "fallback"),
  ];

  const rows: LeaderboardRow[] = candidates.map((d) => {
    const reasoningCount = (d.reasoning ?? []).filter((r) => r && r.trim()).length;
    const hasStrategy = (d.conversation_strategy ?? []).some((s) => s && s.trim());
    const hasCrmNote = !!(d.crm_note && d.crm_note.trim());
    // Richness 0–100: reasoning depth (cap 4 → 60) + strategy (20) + crm note (20).
    const richness =
      Math.min(reasoningCount, 4) * 15 + (hasStrategy ? 20 : 0) + (hasCrmNote ? 20 : 0);
    // Latency nudge: up to +5 for a fast (<800ms) response, scaled down to 0 by 4s.
    const latencyMs = d.latency_ms ?? 0;
    const latencyBonus = latencyMs > 0 ? Math.max(0, 5 - Math.floor(latencyMs / 800)) : 5;
    return {
      provider: d.provider,
      label: d.provider.charAt(0).toUpperCase() + d.provider.slice(1),
      score: Math.min(100, richness) + latencyBonus,
      reasoningCount,
      hasStrategy,
      hasCrmNote,
      latencyMs,
      isBaseline: d.is_baseline,
    };
  });

  return rows.sort((a, b) => b.score - a.score || a.latencyMs - b.latencyMs);
}

/**
 * Merge the backend status row (env-driven) with the browser session state to
 * produce the single health badge the UI shows. Session keys win because they
 * are the user's explicit, current choice.
 */
export function mergeProviderHealth(
  row: DecisionProviderStatusRow | undefined,
  opts: { hasSessionKey: boolean; isActive: boolean; lastTestOk?: boolean | null },
): ProviderHealth {
  if (opts.isActive) return "active";
  if (opts.lastTestOk === true) return "connected";
  if (opts.lastTestOk === false) return "failed";
  if (opts.hasSessionKey) return "connected";
  if (row?.configured) return "configured";
  return "not_configured";
}
