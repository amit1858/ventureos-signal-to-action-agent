// Thin typed client for the Signal-to-Action Agent API.
import type {
  AccountDetail,
  AccountListResponse,
  ActionResult,
  DecisionComparison,
  DecisionProviderStatus,
  ExternalSignalsResult,
  HealthResponse,
  HubspotStatus,
  HubspotSyncResult,
  HubspotWriteback,
  MetaResponse,
  ProviderDecision,
  Recommendation,
  RecommendationResponse,
  SystemConfigResponse,
} from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:8000";

async function jfetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(
      `Cannot reach API at ${API_BASE_URL}. Is the backend running? (${(err as Error).message})`,
    );
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export const api = {
  baseUrl: API_BASE_URL,
  health: () => jfetch<HealthResponse>("/api/health"),
  meta: () => jfetch<MetaResponse>("/api/meta"),
  systemConfig: () => jfetch<SystemConfigResponse>("/api/system/config"),
  accounts: (limit = 200) => jfetch<AccountListResponse>(`/api/accounts?limit=${limit}`),
  account: (accountId: string) => jfetch<AccountDetail>(`/api/accounts/${accountId}`),
  externalSignals: (accountId: string) =>
    jfetch<ExternalSignalsResult>(`/api/external-signals/${accountId}`),
  refreshExternalSignals: () =>
    jfetch<{
      enabled: boolean;
      provider: string;
      refreshed_accounts: number;
      total_signals: number;
    }>("/api/external-signals/refresh", { method: "POST" }),
  recommendations: (query: string, limit: number) =>
    jfetch<RecommendationResponse>("/api/recommendations", {
      method: "POST",
      body: JSON.stringify({ query, limit }),
    }),
  approve: (recommendationId: string) =>
    jfetch<ActionResult>(`/api/actions/${recommendationId}/approve`, { method: "POST" }),
  reject: (recommendationId: string, reason?: string) =>
    jfetch<ActionResult>(`/api/actions/${recommendationId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? null }),
    }),
  hubspotStatus: (probe = false) =>
    jfetch<HubspotStatus>(`/api/integrations/hubspot/status${probe ? "?probe=true" : ""}`),
  hubspotSeed: () =>
    jfetch<HubspotSyncResult>("/api/integrations/hubspot/seed", { method: "POST" }),
  hubspotSync: (limit = 0) =>
    jfetch<HubspotSyncResult>(`/api/integrations/hubspot/sync${limit ? `?limit=${limit}` : ""}`, {
      method: "POST",
    }),
  hubspotUseSynthetic: () =>
    jfetch<{ active_source: string; label: string }>("/api/integrations/hubspot/use-synthetic", {
      method: "POST",
    }),
  hubspotTask: (recommendationId: string) =>
    jfetch<HubspotWriteback>(`/api/actions/${recommendationId}/hubspot-task`, { method: "POST" }),
  hubspotNote: (recommendationId: string) =>
    jfetch<HubspotWriteback>(`/api/actions/${recommendationId}/hubspot-note`, { method: "POST" }),
  decisionProvidersStatus: () =>
    jfetch<DecisionProviderStatus>("/api/decision-providers/status"),
  decisionEvaluate: (accountId: string, provider?: string) =>
    jfetch<ProviderDecision>(
      `/api/decision-providers/evaluate/${accountId}${provider ? `?provider=${provider}` : ""}`,
      { method: "POST" },
    ),
  decisionCompare: (accountId: string) =>
    jfetch<DecisionComparison>(`/api/decision-providers/compare/${accountId}`, { method: "POST" }),
};

export type { Recommendation };
