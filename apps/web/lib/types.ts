// Type contracts mirrored from the FastAPI/Pydantic backend.
// Keep in sync with services/api/schemas/*.py

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type Polarity = "positive" | "negative" | "neutral";

export interface Evidence {
  source_agent: string;
  label: string;
  detail: string;
  source_system: string;
  polarity: Polarity | string;
  strength: number;
}

export interface ScoreBreakdown {
  support_risk: number;
  spend_decline: number;
  growth_potential: number;
  renewal_urgency: number;
  campaign_response: number;
  engagement_gap: number;
  last_contact_gap: number;
  priority_score: number;
}

export interface Recommendation {
  recommendation_id: string;
  account_id: string;
  account_name: string;
  priority_rank: number;
  priority_score: number;
  priority_reason: string;
  risk_summary: string;
  opportunity_summary: string;
  recommended_action: string;
  action_type: string;
  confidence_score: number;
  evidence: Evidence[];
  governance_caveats: string[];
  governance_status: string;
  draft_email: string;
  call_script: string;
  voice_summary: string;
  approval_status: ApprovalStatus;
  score_breakdown: ScoreBreakdown;
  agents_invoked: string[];
}

export interface LedgerAgentStep {
  agent_name: string;
  status: string;
  summary: string;
  evidence_count: number;
  duration_ms: number;
}

export interface DecisionLedger {
  ledger_id: string;
  timestamp: string;
  user_query: string;
  agents_invoked: string[];
  evidence_used: number;
  reasoning_summary: string;
  confidence_score: number;
  caveats: string[];
  final_recommendation: string;
  approval_status: string;
  steps: LedgerAgentStep[];
  model_provider: string;
  latency_ms: number;
  data_source?: string;
}

export interface RecommendationResponse {
  query: string;
  recommendations: Recommendation[];
  decision_ledger: DecisionLedger;
  latency_ms: number;
  model_provider: string;
  generated_at: string;
  data_source?: string;
}

export interface DatasetSummary {
  accounts: number;
  signals: number;
  notes: number;
  industries: string[];
  regions: string[];
  source?: string;
  source_label?: string;
  data_source_mode?: string;
  last_synced_at?: string | null;
  portal_id?: string | null;
}

export interface MetaResponse {
  dataset: DatasetSummary;
  model_provider: string;
  model: string;
  agents: string[];
  suggested_queries: string[];
  scoring_weights: Record<string, number>;
  external_signals?: ExternalSignalsMeta;
}

// -- External (outside-in) signal layer -----------------------------------
// Supporting public context only. NEVER the source of truth: ranking, scoring,
// governance and CRM write-back stay fully deterministic and internal.

export interface ExternalSignalsMeta {
  enabled: boolean;
  provider: string;
}

export interface ExternalSignal {
  signal_type: string;
  title: string;
  summary: string;
  source: string;
  url?: string | null;
  published_at?: string | null;
  confidence: string;
  relevance: string;
  impact: "positive" | "negative" | "neutral" | string;
  seller_takeaway?: string | null;
}

export interface ExternalSource {
  title: string;
  url?: string | null;
  source?: string | null;
  published_at?: string | null;
}

export interface InternalEvidenceItem {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral" | string;
}

export interface CRMTaskRecommendation {
  title: string;
  description: string;
  priority: string;
  owner: string;
  suggested_due_date: string;
}

export interface CRMWritebackRecommendation {
  task: CRMTaskRecommendation;
  note: string;
  follow_up_reminder: string;
}

export interface ExecutiveBrief {
  account_id: string;
  account_name: string;
  internal_summary: string;
  external_summary: string;
  fused_insight: string;
  business_implication: string;
  seller_implication: string;
  recommended_conversation_strategy: string;
  suggested_opening_line: string;
  confidence: string;
  caveats: string[];
  sources: ExternalSource[];
  // Phase 4.2 — Executive Decision Brief (additive, optional for older clients).
  executive_summary?: string;
  why_it_matters?: string;
  internal_evidence?: InternalEvidenceItem[];
  external_intelligence?: string[];
  conversation_strategy_steps?: string[];
  confidence_rationale?: string;
  what_not_to_do?: string[];
  crm_writeback?: CRMWritebackRecommendation | null;
}

export interface ExternalSignalsResult {
  account_id: string;
  account_name: string;
  enabled: boolean;
  provider: string;
  provider_mode?: string;
  signals: ExternalSignal[];
  summary: string;
  seller_takeaway: string;
  sources?: ExternalSource[];
  brief?: ExecutiveBrief | null;
  caveat: string;
  generated_at?: string | null;
  cached: boolean;
  note?: string | null;
}

export interface Signal {
  signal_id: string;
  account_id: string;
  signal_type: string;
  signal_date: string;
  signal_strength: number;
  signal_description: string;
  source_system: string;
  positive_or_negative: Polarity | string;
}

export interface Note {
  account_id: string;
  note_type: string;
  note_text: string;
  created_date: string;
}

export interface AccountDetail {
  account_id: string;
  account_name: string;
  industry: string;
  segment: string;
  region: string;
  current_month_spend: number;
  previous_month_spend: number;
  product_usage_score: number;
  engagement_score: number;
  support_risk_score: number;
  campaign_response_score: number;
  last_contact_days: number;
  renewal_days: number;
  growth_potential_score: number;
  signals: Signal[];
  notes: Note[];
}

// Bare account row from GET /api/accounts (no signals/notes); used to enrich
// recommendation cards with industry / segment / region client-side.
export type Account = Omit<AccountDetail, "signals" | "notes">;

export interface AccountListResponse {
  total: number;
  limit: number;
  offset: number;
  accounts: Account[];
}

export interface ActionResult {
  recommendation_id: string;
  approval_status: ApprovalStatus;
  message: string;
  recommendation: Recommendation;
}

export interface HealthResponse {
  status: string;
  version: string;
  model_provider: string;
  model: string;
  model_health: unknown;
  data_ready: boolean;
  data_error: string | null;
  agents: string[];
}

// -- HubSpot test CRM integration -----------------------------------------

export interface HubspotStatus {
  provider: string;
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  writeback_enabled: boolean;
  portal_id: string | null;
  message: string;
  active_source: string;
  data_source_mode: string;
  data_source_label: string;
  last_synced_at: string | null;
  records: Record<string, number>;
}

export interface HubspotSyncResult {
  companies_loaded: number;
  contacts_loaded: number;
  deals_loaded: number;
  activities_loaded: number;
  last_synced_at: string | null;
  source: string;
  portal_id: string | null;
  message: string;
}

export interface HubspotWriteback {
  status: string;
  object_type: string;
  external_id: string | null;
  created_at: string | null;
  connector: string;
  portal_id: string | null;
  hubspot_url: string | null;
  recommendation_id: string;
  account_id: string;
  account_name: string;
  approval_status: string;
  approved_at: string | null;
  payload_preview: Record<string, string>;
  safety_note: string;
}

// -- System diagnostics (read-only; powers the Evaluation & Architecture view) --
// GET /api/system/config returns secret-free booleans only — never any token.

export interface SystemConfigSnapshot {
  api_version: string;
  model_provider: string;
  provider_implemented: boolean;
  nvidia_configured: boolean;
  openai_configured: boolean;
  anthropic_configured: boolean;
  hubspot_enabled: boolean;
  hubspot_configured: boolean;
  hubspot_writeback_enabled: boolean;
  external_signals_enabled: boolean;
  external_signals_provider: string;
  serper_configured: boolean;
  searchapi_configured: boolean;
  external_signals_live_ready: boolean;
  [key: string]: unknown;
}

export interface SystemConfigResponse {
  config: SystemConfigSnapshot;
  warnings: string[];
}

// -- BYOK decision providers (Phase 5.0) ----------------------------------

export type DecisionProviderMode = "deterministic" | "live" | "fallback" | "not_configured";
export type DecisionLevel = "low" | "medium" | "high";

export interface DecisionProviderStatusRow {
  id: string;
  label: string;
  model: string;
  live_capable: boolean;
  configured: boolean;
  is_baseline: boolean;
  is_default: boolean;
  status: "active" | "configured" | "not_configured" | "failed" | "fallback";
}

export interface DecisionProviderStatus {
  default_provider: string;
  deterministic_is_baseline: boolean;
  providers: DecisionProviderStatusRow[];
  configured_live_count: number;
  governance_caveat: string;
  generated_at: string;
}

export interface ProviderDecision {
  provider: string;
  model: string;
  mode: DecisionProviderMode | string;
  risk_level: DecisionLevel | string;
  opportunity_level: DecisionLevel | string;
  recommended_action: string;
  confidence: DecisionLevel | string;
  executive_summary: string;
  business_implication: string;
  seller_implication: string;
  conversation_strategy: string[];
  opening_line: string;
  crm_note: string;
  reasoning: string[];
  caveats: string[];
  latency_ms: number;
  is_baseline: boolean;
  provider_error?: string | null;
}

export interface DecisionDifferenceRow {
  field: string;
  baseline: string;
  providers: Record<string, string>;
}

export interface DecisionEvaluation {
  providers_compared: number;
  provider_availability: Record<string, boolean>;
  action_agreement: boolean | null;
  risk_agreement: boolean | null;
  opportunity_agreement: boolean | null;
  confidence_agreement: boolean | null;
  structured_output_valid: boolean;
  fallback_used: string[];
  fallback_success: boolean | null;
  not_configured: string[];
  max_latency_ms: number;
  cost_estimate: number | null;
  governance_compliant: boolean;
}

export interface DecisionComparison {
  account_id: string;
  account_name: string;
  external_context_used: boolean;
  baseline: ProviderDecision;
  providers: ProviderDecision[];
  differences: DecisionDifferenceRow[];
  evaluation: DecisionEvaluation;
  evaluation_notes: string[];
  governance_caveat: string;
  generated_at: string;
}

// -- BYOK provider test connection (Phase 5.0A) ---------------------------

export type DecisionTestStatus = "connected" | "no_key" | "failed" | "unsupported";

/** Secret-free result of a "Test Connection" check — never carries the key. */
export interface DecisionProviderTestResult {
  ok: boolean;
  provider: string;
  model: string;
  status: DecisionTestStatus | string;
  error?: string | null;
  latency_ms: number;
}

/** One per-session BYOK credential as sent to the backend (snake_case wire). */
export interface DecisionCredentialPayload {
  api_key: string;
  model: string;
  base_url: string;
}

/** Optional session payload for evaluate / compare requests. */
export interface DecisionSessionPayload {
  provider?: string;
  credentials?: Record<string, DecisionCredentialPayload>;
}
