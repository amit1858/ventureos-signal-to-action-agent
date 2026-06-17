// Phase 6 · AI Reasoning Experience & Transparency Layer.
//
// This module is a thin **client-side overlay** that decorates the existing
// deterministic recommendations with optional LLM-generated narrative. It is
// deliberately built *outside* the recommendations pipeline so that ranking,
// scoring, confidence, governance and approval all remain governed by the
// deterministic engine on the server — never altered, ever, by an LLM.
//
// Contract:
//   • If the user has activated a BYOK provider, we call the existing
//     `/api/decision-providers/evaluate/:accountId` endpoint for the top N
//     recommended accounts in parallel and cache the result here.
//   • The overlay layer enriches: executive_summary, business_implication,
//     seller_implication, conversation_strategy, opening_line, crm_note,
//     reasoning prose, narrative caveats.
//   • The overlay layer NEVER touches: priority_rank, priority_score, risk
//     score, opportunity score, confidence, evidence list, governance
//     status, approval status, CRM write-back execution.
//   • Utilization is tracked per-session and surfaced in the Trust &
//     Governance panel. Keys are never recorded — only counts, latencies and
//     section labels.
import * as React from "react";

import { api } from "@/lib/api";
import {
  getActiveProvider,
  getAllCredentialsWire,
  type ActiveProvider,
} from "@/lib/byok";
import type {
  DecisionCredentialPayload,
  ProviderDecision,
  Recommendation,
} from "@/lib/types";

// -- shapes ---------------------------------------------------------------

/** A pretty label per provider id (used in chips / banners / panel rows). */
export const PROVIDER_LABEL: Record<string, string> = {
  deterministic: "Governed Decision Engine",
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
  nvidia: "NVIDIA Nemotron",
};

/** Sections the LLM is allowed to enhance. Surfaced verbatim in the UI. */
export const AI_ENHANCED_SECTIONS = [
  "Executive summaries",
  "Conversation strategies",
  "CRM note drafts",
  "Market intelligence synthesis",
  "Opportunity narratives",
  "Risk narratives",
] as const;

/** Things the LLM is NOT allowed to touch. Surfaced verbatim in the UI. */
export const AI_DECLINED_SECTIONS = [
  "Ranking",
  "Prioritization",
  "Governance",
  "Approval workflow",
  "CRM writeback execution",
] as const;

/** One account's AI overlay — a subset of the backend's ProviderDecision. */
export type AIOverlay = ProviderDecision;

/** All overlays keyed by account_id, plus meta about which call produced them. */
export interface AIOverlayMap {
  provider: ActiveProvider;
  model: string;
  generatedAt: string;
  /** account_id → overlay */
  byAccount: Record<string, AIOverlay>;
  /** any fetch errors keyed by account_id; used only for fallback counting */
  errorsByAccount: Record<string, string>;
}

/** Per-session utilization stats — surfaced in the Trust panel. */
export interface AIUtilization {
  provider: ActiveProvider | null;
  model: string | null;
  requests: number;
  fallbacks: number;
  latencies: number[];
  lastInvocationAt: string | null;
  sectionsGenerated: Set<string>;
}

const EMPTY_UTIL: AIUtilization = {
  provider: null,
  model: null,
  requests: 0,
  fallbacks: 0,
  latencies: [],
  lastInvocationAt: null,
  sectionsGenerated: new Set(),
};

// -- in-memory singletons + tiny event bus -------------------------------

let _utilization: AIUtilization = { ...EMPTY_UTIL, sectionsGenerated: new Set() };
const _listeners = new Set<() => void>();

function emit(): void {
  _listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore listener errors */
    }
  });
}

function subscribe(cb: () => void): () => void {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

function recordInvocation(opts: {
  provider: ActiveProvider;
  model: string;
  latencyMs: number;
  fallback: boolean;
  sections: readonly string[];
}): void {
  _utilization = {
    provider: opts.provider,
    model: opts.model || _utilization.model,
    requests: _utilization.requests + 1,
    fallbacks: _utilization.fallbacks + (opts.fallback ? 1 : 0),
    latencies: [..._utilization.latencies, opts.latencyMs].slice(-25),
    lastInvocationAt: new Date().toISOString(),
    sectionsGenerated: new Set([
      ..._utilization.sectionsGenerated,
      ...opts.sections,
    ]),
  };
  emit();
}

export function resetUtilization(): void {
  _utilization = { ...EMPTY_UTIL, sectionsGenerated: new Set() };
  emit();
}

// -- hooks ---------------------------------------------------------------

/** Subscribe to BYOK active-provider changes (sessionStorage isn't reactive). */
export function useActiveProvider(): ActiveProvider {
  const [active, setActive] = React.useState<ActiveProvider>("deterministic");
  React.useEffect(() => {
    setActive(getActiveProvider());
    function poll() {
      const v = getActiveProvider();
      setActive((cur) => (cur === v ? cur : v));
    }
    // Cross-tab updates fire 'storage'; same-tab updates don't, so poll lightly.
    window.addEventListener("storage", poll);
    const t = window.setInterval(poll, 1500);
    return () => {
      window.removeEventListener("storage", poll);
      window.clearInterval(t);
    };
  }, []);
  return active;
}

/** Reactive utilization snapshot for the Trust & Governance panel. */
export function useUtilization(): AIUtilization {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => subscribe(() => force()), []);
  return _utilization;
}

// -- overlay fetch -------------------------------------------------------

/** Sections we report as "generated" when an overlay arrives successfully. */
const OVERLAY_SECTIONS = [
  "Executive summary",
  "Risk narrative",
  "Opportunity narrative",
  "Conversation strategy",
  "Opening line",
  "CRM note draft",
] as const;

/**
 * Fetch AI overlays for the top-N recommendations.
 *
 * Safe to call regardless of active provider — when no BYOK key is present we
 * return `null` so callers can simply skip the overlay path. Fetches run in
 * parallel and a per-account failure is recorded as a fallback (the
 * deterministic recommendation stays visible).
 */
export async function fetchOverlay(
  recs: Recommendation[],
  opts: { limit?: number; provider?: ActiveProvider } = {},
): Promise<AIOverlayMap | null> {
  const limit = Math.max(1, Math.min(opts.limit ?? 3, 10));
  const active = opts.provider ?? getActiveProvider();
  if (active === "deterministic") return null;

  const credentials = getAllCredentialsWire() as Record<
    string,
    DecisionCredentialPayload
  >;
  const cred = credentials[active];
  if (!cred || !cred.api_key?.trim()) return null;

  const targets = recs.slice(0, limit);
  if (targets.length === 0) return null;

  const startedAt = Date.now();
  const results = await Promise.all(
    targets.map((r) =>
      api
        .decisionEvaluate(r.account_id, active, credentials)
        .then((d) => ({ rec: r, decision: d, error: null as string | null }))
        .catch((e: Error) => ({
          rec: r,
          decision: null as ProviderDecision | null,
          error: e.message,
        })),
    ),
  );
  const elapsed = Date.now() - startedAt;

  const byAccount: Record<string, AIOverlay> = {};
  const errorsByAccount: Record<string, string> = {};
  let resolvedModel = "";
  let fallbacks = 0;

  for (const { rec, decision, error } of results) {
    if (decision && (decision.mode === "live" || decision.mode === "baseline")) {
      // 'baseline' means the backend chose to fall back to deterministic; we
      // still capture the response but count it as a fallback so the panel
      // can warn the user.
      byAccount[rec.account_id] = decision;
      if (!resolvedModel && decision.model) resolvedModel = decision.model;
      if (decision.mode === "baseline" || decision.is_baseline) fallbacks += 1;
    } else if (decision) {
      // mode === 'fallback' or 'error' — record and count.
      byAccount[rec.account_id] = decision;
      if (!resolvedModel && decision.model) resolvedModel = decision.model;
      fallbacks += 1;
    } else {
      errorsByAccount[rec.account_id] = error ?? "unknown error";
      fallbacks += 1;
    }
  }

  // Record one aggregate utilization entry per re-run, with the parallel
  // wall-clock latency. (Per-account latency lives on each overlay too.)
  recordInvocation({
    provider: active,
    model: resolvedModel,
    latencyMs: elapsed,
    fallback: fallbacks > 0 && Object.keys(byAccount).length === 0,
    sections: Object.keys(byAccount).length > 0 ? OVERLAY_SECTIONS : [],
  });

  return {
    provider: active,
    model: resolvedModel,
    generatedAt: new Date().toISOString(),
    byAccount,
    errorsByAccount,
  };
}

// -- selectors -----------------------------------------------------------

/** Pick the overlay for one account, if any. */
export function overlayFor(
  map: AIOverlayMap | null,
  accountId: string | null | undefined,
): AIOverlay | null {
  if (!map || !accountId) return null;
  return map.byAccount[accountId] ?? null;
}

/** Pick the overlay for the top recommendation (used by the Morning Brief). */
export function topOverlay(
  map: AIOverlayMap | null,
  recs: Recommendation[],
): AIOverlay | null {
  if (!map || recs.length === 0) return null;
  return map.byAccount[recs[0].account_id] ?? null;
}

/** Format a provider id as a UI label. */
export function providerLabel(p: ActiveProvider | string | null | undefined): string {
  if (!p) return PROVIDER_LABEL.deterministic;
  return PROVIDER_LABEL[p] ?? p;
}
