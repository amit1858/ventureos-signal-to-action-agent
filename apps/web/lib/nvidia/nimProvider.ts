// Release 2.4 — NVIDIA-Grounded Mission Intelligence · hosted NIM provider
// ========================================================================
// A CONFIG-DRIVEN provider that calls a hosted NVIDIA Nemotron model through the
// NVIDIA NIM OpenAI-compatible chat/completions endpoint. It runs strictly
// AFTER a governed mission decision and the deterministic PersonaResponse are in
// hand (post-decision, pre-presentation), and it can NEVER change a governed
// fact — its output is text only, and the deterministic grounding guard vets it
// before anything is presented.
//
// Hard rules enforced here:
//   * SERVER-SIDE ONLY. The API key/base URL/model come from server config; they
//     are never logged, never returned in errors, never placed on the narrative.
//   * provider/model on the returned narrative are SERVER-OWNED constants — the
//     model's own claims about provider/model are ignored.
//   * The prompt tightly constrains the model to supplied evidence, forbids new
//     actions/approval/execution claims, and requires JSON-only output.
//   * Defensive parsing: reasoning/think blocks and code fences are stripped and
//     the first JSON object is extracted; anything unparseable becomes a fallback
//     upstream (this provider throws; groundMissionNarrative fails closed).
//   * Retry policy: at most `maxRetries` retries, only on network/timeout/429/
//     502/503/504. Never retry auth (401/403) or invalid-request (400) failures.
//
// This module imports ONLY ./types to avoid any dependency cycle with the
// orchestration layer (narrative.ts -> provider.ts -> nimProvider.ts).

import type {
  NvidiaGroundedNarrative,
  NvidiaNarrativeProvider,
  NvidiaNarrativeRequest,
} from "./types";
import { NVIDIA_VOICE_SUMMARY_MAX_CHARS } from "./types";

/** Resolved, validated live configuration (all fields required). */
export interface NimProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Per-attempt timeout (ms). A single attempt is aborted after this long. */
  timeoutMs: number;
  maxRetries: number;
  /** OPTIONAL hard ceiling (ms) on TOTAL wall time across all attempts. Defaults
   * to `timeoutMs`, which guarantees the mission experience can never block for
   * roughly two full timeouts. A retry only runs inside the remaining budget. */
  totalBudgetMs?: number;
}

/** Minimal fetch surface so tests can stub the network deterministically. */
export interface NimFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}
export type NimFetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<NimFetchResponse>;

export interface NimProviderDeps {
  /** Injected fetch; defaults to global fetch. */
  fetchImpl?: NimFetchLike;
  /** Injected clock for latency; defaults to Date.now. */
  now?: () => number;
}

/** Typed provider error. `retryable` gates the single retry. The message NEVER
 * contains the response body, headers, or the API key. */
export class NimProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status?: number;
  constructor(code: string, retryable: boolean, status?: number) {
    super(code);
    this.name = "NimProviderError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

const RETRYABLE_HTTP = new Set([429, 502, 503, 504]);

/** The system instruction that constrains the model to a grounded, simulated,
 * non-authoritative explainer. Kept in one place so it is auditable. */
export const NIM_SYSTEM_INSTRUCTION = [
  "detailed thinking off",
  "You are VentureOS's grounded mission explainer. You convert an ALREADY-DECIDED,",
  "ALREADY-VERIFIED mission into a clear business explanation. You have NO authority.",
  "Follow every rule exactly:",
  "- Explain ONLY from the supplied verified evidence and labels. Invent no facts.",
  "- Do NOT invent metrics, numbers, dates, or percentages beyond those supplied.",
  "- Do NOT add, remove, or alter any action. Use only the supplied permitted actions.",
  "- Do NOT approve anything and do NOT claim approval already happened.",
  "- Do NOT execute anything and do NOT claim any real-world action occurred.",
  "- All actions are SIMULATED: nothing is sent and no CRM record is changed. Preserve this.",
  "- Use ONLY the supplied evidence references; never cite a reference not supplied.",
  "- Output STRICT JSON only, no markdown, no code fences, no commentary.",
  "- voiceSummary must be a single sentence of at most 240 characters, no markdown.",
  'Return exactly this JSON shape: {"whatChanged":string,"riskExplanation":string,',
  '"recommendationRationale":string,"approvalExplanation":string,"voiceSummary":string,',
  '"evidenceRefs":string[],"caveats":string[]}',
].join("\n");

/** Build the compact, presentation-only user payload from the governed request.
 * Contains ONLY governed facts and business labels (the request already excludes
 * credentials, raw objects, and paths). Ordering is deterministic. */
export function buildNimUserContent(request: NvidiaNarrativeRequest): string {
  const payload = {
    account: {
      id: request.canonicalAccount.ventureOsId,
      name: request.canonicalAccount.canonicalName,
    },
    verifiedSignal: request.verifiedSignalSummary,
    selectedMission: request.selectedMission.businessLabel,
    recommendation: request.recommendation.businessLabel,
    permittedActions: request.permittedActions.map((a) => a.businessLabel),
    verifiedEvidence: request.verifiedEvidence.map((e) => ({
      ref: e.ref,
      category: e.category,
      summary: e.summary,
      source: e.source,
    })),
    allowedEvidenceRefs: request.evidenceRefs,
    verification: request.verificationSummary,
    approvalState: request.approvalState,
    executionMode: request.executionMode,
    audience: request.audience,
    requestedOutputs: request.requestedOutputs,
  };
  return JSON.stringify(payload);
}

function clampVoice(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= NVIDIA_VOICE_SUMMARY_MAX_CHARS) return clean;
  return clean.slice(0, NVIDIA_VOICE_SUMMARY_MAX_CHARS - 1).trimEnd() + "…";
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

/** Defensively extract the first JSON object from a model completion. Strips
 * reasoning `<think>` blocks and ``` code fences first. Throws a typed
 * non-retryable error when no JSON object can be parsed. */
export function extractNarrativeJson(content: string): Record<string, unknown> {
  let s = content.replace(/<think>[\s\S]*?<\/think>/gi, " ");
  s = s.replace(/```+\s*json/gi, " ").replace(/```+/g, " ");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new NimProviderError("malformed_no_json", false);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(s.slice(start, end + 1));
  } catch {
    throw new NimProviderError("malformed_json_parse", false);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new NimProviderError("malformed_not_object", false);
  }
  return parsed as Record<string, unknown>;
}

/** Map a parsed completion into a candidate narrative. provider/model are
 * SERVER-OWNED; any provider/model the model returned is ignored. Missing text
 * fields are coerced to "" so the deterministic guard marks the candidate
 * malformed and the flow fails closed. */
export function toCandidateNarrative(
  parsed: Record<string, unknown>,
  config: NimProviderConfig,
  telemetry: { latencyMs: number; attempts: number },
): NvidiaGroundedNarrative {
  const caveats = asStringArray(parsed.caveats);
  return {
    schemaVersion: "1.0",
    whatChanged: asString(parsed.whatChanged),
    riskExplanation: asString(parsed.riskExplanation),
    recommendationRationale: asString(parsed.recommendationRationale),
    approvalExplanation: asString(parsed.approvalExplanation),
    voiceSummary: clampVoice(asString(parsed.voiceSummary)),
    evidenceRefs: asStringArray(parsed.evidenceRefs),
    caveats:
      caveats.length > 0
        ? caveats
        : ["All proposed actions are simulated; no email is sent and no CRM record is changed."],
    provider: "nim", // server-owned — never trust model output
    model: config.model, // server-owned — never trust model output
    grounded: false, // the deterministic guard decides
    validationStatus: "rejected", // overridden to "grounded" by the guard on success
    fallbackUsed: false,
    latencyMs: telemetry.latencyMs,
    attempts: telemetry.attempts,
  };
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "AbortError"
  );
}

/** Create a hosted NVIDIA NIM narrative provider from resolved config. */
export function createNimProvider(
  config: NimProviderConfig,
  deps: NimProviderDeps = {},
): NvidiaNarrativeProvider {
  const fetchImpl: NimFetchLike =
    deps.fetchImpl ?? ((globalThis as { fetch?: unknown }).fetch as unknown as NimFetchLike);
  const now = deps.now ?? (() => Date.now());
  const maxRetries = Number.isFinite(config.maxRetries) ? Math.max(0, config.maxRetries) : 1;
  const timeoutMs = Number.isFinite(config.timeoutMs) ? config.timeoutMs : 10000;
  // Total wall-time ceiling across attempts. Defaults to one per-attempt timeout
  // so a slow/hung model can never hold the mission experience for ~2x the
  // timeout. A retry only runs if meaningful budget remains.
  const totalBudgetMs =
    Number.isFinite(config.totalBudgetMs as number) && (config.totalBudgetMs as number) > 0
      ? (config.totalBudgetMs as number)
      : timeoutMs;
  const url = config.baseUrl.replace(/\/+$/, "") + "/chat/completions";

  async function requestOnce(body: string, attemptTimeoutMs: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, attemptTimeoutMs));
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        const retryable = RETRYABLE_HTTP.has(res.status);
        throw new NimProviderError(`http_${res.status}`, retryable, res.status);
      }
      return await res.text();
    } catch (err) {
      if (err instanceof NimProviderError) throw err;
      if (isAbortError(err)) throw new NimProviderError("timeout", true);
      throw new NimProviderError("network_error", true);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    name: "nim",
    model: config.model,
    async generate(request: NvidiaNarrativeRequest): Promise<NvidiaGroundedNarrative> {
      if (typeof fetchImpl !== "function") {
        throw new NimProviderError("no_fetch_available", false);
      }
      const body = JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: NIM_SYSTEM_INSTRUCTION },
          { role: "user", content: buildNimUserContent(request) },
        ],
        temperature: 0,
        top_p: 1,
        max_tokens: 1024,
        stream: false,
      });

      const started = now();
      // Hard ceiling: no attempt may push total wall time past this deadline.
      const deadline = started + totalBudgetMs;
      // A retry needs at least this much budget to be worth starting.
      const MIN_ATTEMPT_MS = 250;
      let attempts = 0;
      let lastErr: NimProviderError = new NimProviderError("unknown", false);
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const remaining = deadline - now();
        // Out of budget before a retry — stop and fail closed.
        if (attempt > 0 && remaining <= MIN_ATTEMPT_MS) break;
        const attemptTimeoutMs = Math.min(timeoutMs, Math.max(1, remaining));
        attempts = attempt + 1;
        try {
          const raw = await requestOnce(body, attemptTimeoutMs);
          const content = extractAssistantContent(raw);
          const parsed = extractNarrativeJson(content);
          return toCandidateNarrative(parsed, config, {
            latencyMs: now() - started,
            attempts,
          });
        } catch (err) {
          lastErr = err instanceof NimProviderError ? err : new NimProviderError("unknown", false);
          // Never retry after a FULL timeout: a slow model will not answer faster
          // on a second full wait, and the governed mission experience must not
          // block for roughly two timeouts. Fast retryable HTTP (429/502/503/504)
          // and network errors still get one retry inside the remaining budget.
          const timedOut = lastErr.code === "timeout";
          const budgetLeft = deadline - now() > MIN_ATTEMPT_MS;
          if (!lastErr.retryable || timedOut || attempt >= maxRetries || !budgetLeft) break;
        }
      }
      throw lastErr;
    },
  };
}

/** Extract the assistant message content from an OpenAI-compatible completion.
 * Throws a typed non-retryable error when the shape is unusable. */
export function extractAssistantContent(raw: string): string {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new NimProviderError("malformed_envelope", false);
  }
  const choices = (doc as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new NimProviderError("malformed_no_choices", false);
  }
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new NimProviderError("malformed_empty_content", false);
  }
  return content;
}
