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
