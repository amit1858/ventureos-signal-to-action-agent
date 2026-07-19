// Release 2.3 — NVIDIA-Grounded Mission Intelligence · grounding guard
// ====================================================================
// A DETERMINISTIC validator that decides whether a candidate narrative may be
// presented. It trusts nothing the provider returns: it enforces that every
// material claim maps to supplied evidence and that the narrative never claims a
// real action occurred or that approval already happened.
//
// The guard uses BOTH:
//   * normalized phrase / word-order-tolerant structural checks (not exact
//     string matching), and
//   * structural checks: evidence-ref subset, numeric grounding, action-set.
//
// It is pure and dependency-free: identical inputs -> identical verdict.

import type {
  GroundingResult,
  NvidiaGroundedNarrative,
  NvidiaNarrativeRequest,
} from "./types";

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Lowercase, strip punctuation to spaces, collapse whitespace. Lets the guard
 * match claims regardless of casing or punctuation. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function narrativeTextFields(n: NvidiaGroundedNarrative): string[] {
  return [
    n.whatChanged,
    n.riskExplanation,
    n.recommendationRationale,
    n.approvalExplanation,
    n.voiceSummary,
    ...n.caveats,
  ];
}

// ---------------------------------------------------------------------------
// Banned real-execution / false-authority claims (word-order tolerant)
// ---------------------------------------------------------------------------

/** Each rule fires when ALL of its terms co-occur anywhere in the normalized
 * text (order-independent), OR when the exact phrase appears. This catches
 * "the email was already sent" as well as "sent email" without brittle exact
 * matching. */
interface ClaimRule {
  id: string;
  description: string;
  /** Sets of words that together assert a forbidden claim. */
  coOccur?: string[];
  /** Literal normalized phrases that assert a forbidden claim. */
  phrases?: string[];
}

const BANNED_EXECUTION_RULES: ClaimRule[] = [
  { id: "email_sent", description: "claims an email was sent", coOccur: ["email", "sent"], phrases: ["sent an email", "email delivered"] },
  { id: "crm_written", description: "claims a CRM record was written/updated", coOccur: ["crm", "updated"], phrases: ["updated the crm", "crm record was changed", "record was changed", "wrote to the crm"] },
  { id: "action_executed", description: "claims an action was executed for real", coOccur: ["action", "executed"], phrases: ["executed the action", "action was executed", "action has been executed"] },
  { id: "customer_contacted", description: "claims the customer was contacted", coOccur: ["customer", "contacted"], phrases: ["contacted the customer", "reached out to the customer"] },
  { id: "production_write", description: "claims a live/production write completed", phrases: ["in production", "live write completed", "written to production", "completed successfully in production", "pushed to production"] },
  { id: "task_created", description: "claims a real task was created", coOccur: ["task", "created"], phrases: ["created a task", "task was created"] },
];

const BANNED_APPROVAL_RULES: ClaimRule[] = [
  { id: "already_approved", description: "claims approval already happened", phrases: ["has been approved", "already approved", "mission approved", "mission was approved", "approval granted", "i approved", "i have approved", "we approved", "was approved by"] },
  { id: "self_authority", description: "claims the AI granted or bypassed approval", phrases: ["i authorized", "i authorised", "no approval needed", "without approval", "bypass approval", "auto approved"] },
];

// ---------------------------------------------------------------------------
// Structural: unapproved-action vocabulary
// ---------------------------------------------------------------------------

/** Action-like concepts the model could hallucinate that are NOT part of the
 * governed permitted-action vocabulary. If any appears AND it is not represented
 * in the request's permitted vocabulary, the claim is rejected. */
const FOREIGN_ACTION_TERMS: string[] = [
  "discount",
  "refund",
  "phone call",
  "cold call",
  "sms",
  "text message",
  "contract amendment",
  "price increase",
  "cancel the account",
  "issue a credit",
  "schedule a meeting",
];

function containsPhrase(normalized: string, phrase: string): boolean {
  const p = normalizeText(phrase);
  if (p.length === 0) return false;
  return (" " + normalized + " ").includes(" " + p + " ") || normalized.includes(p);
}

function coOccurs(normalized: string, terms: string[]): boolean {
  const words = new Set(normalized.split(" "));
  return terms.every((t) => (t.includes(" ") ? normalized.includes(normalizeText(t)) : words.has(t)));
}

const NEGATION_TOKENS = ["no", "not", "never", "nothing", "without", "cannot", "wont", "neither"];

function isNegated(sentence: string): boolean {
  const words = sentence.split(" ");
  if (words.some((w) => NEGATION_TOKENS.includes(w))) return true;
  return /\bwill not\b|\bhas not\b|\bhave not\b|\bdid not\b/.test(sentence);
}

/** Co-occurrence scoped to a single, non-negated sentence. This distinguishes an
 * affirmative execution claim ("the email was sent") from a governed assurance
 * ("nothing will be sent") and from unrelated mentions in separate sentences. */
function coOccursAffirmative(normalized: string, terms: string[]): boolean {
  const sentences = normalized.split(/[.\n]+/).map((s) => s.trim()).filter(Boolean);
  return sentences.some((s) => !isNegated(s) && coOccurs(s, terms));
}

function ruleFires(normalized: string, rule: ClaimRule): boolean {
  if (rule.phrases && rule.phrases.some((p) => containsPhrase(normalized, p))) return true;
  if (rule.coOccur && coOccursAffirmative(normalized, rule.coOccur)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Live-output security: reject untrusted content leakage / injection
// ---------------------------------------------------------------------------

/** Each rule fires on the RAW (non-normalized) narrative text, because secrets,
 * paths, and injection markers rely on punctuation that normalization strips.
 * A hit marks the narrative rejected and the flow fails closed to the
 * deterministic baseline. These matter for the hosted-NIM path where the output
 * is untrusted model text; the deterministic mock never trips them. */
interface SecurityRule {
  id: string;
  pattern: RegExp;
}

const SECURITY_RULES: SecurityRule[] = [
  // API keys / tokens.
  { id: "nvapi_key", pattern: /nvapi-[A-Za-z0-9_*\-]{4,}/i },
  { id: "openai_key", pattern: /\bsk-(?:ant-)?[A-Za-z0-9_-]{6,}/ },
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._\-]{8,}/i },
  { id: "aws_key", pattern: /\bAKIA[0-9A-Z]{12,}/ },
  { id: "masked_secret", pattern: /\*{4,}/ },
  // Environment-variable assignments (e.g. NVIDIA_API_KEY=...).
  { id: "env_assignment", pattern: /\b[A-Z][A-Z0-9]{2,}_[A-Z0-9_]*\s*=\s*\S/ },
  // Internal service / config identifiers.
  { id: "internal_service_var", pattern: /\b(?:HARNESS_SERVICE_TOKEN|PYTHON_HARNESS_URL|NVIDIA_API_KEY|DATABASE_URL)\b/i },
  { id: "localhost_ref", pattern: /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i },
  // File paths (Windows drive / UNC / common unix roots).
  { id: "windows_path", pattern: /[A-Za-z]:\\[^\s]*/ },
  { id: "unc_path", pattern: /\\\\[A-Za-z0-9._$-]+\\[^\s]+/ },
  { id: "unix_path", pattern: /(?:^|\s)\/(?:etc|var|home|usr|root|tmp|opt|proc|bin|sys)\/[^\s]+/ },
  // Stack traces.
  { id: "js_stack", pattern: /\bat\s+[^\s]+\s+\([^\s]+:\d+:\d+\)/ },
  { id: "py_traceback", pattern: /Traceback \(most recent call last\)/i },
  { id: "error_with_frame", pattern: /\b\w*(?:Error|Exception):[^\n]*\n\s+at\s/ },
  // URLs (a grounded narrative never needs to emit a URL).
  { id: "url", pattern: /\bhttps?:\/\/[^\s]+/i },
  // Database connection strings.
  { id: "db_conn", pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\//i },
  { id: "mssql_conn", pattern: /Server=[^;]+;\s*Database=/i },
  // Raw protected-object keys leaking as JSON/text.
  { id: "secret_key_json", pattern: /["']?(?:api[_-]?key|authorization|service[_-]?token|password|secret|access[_-]?token)["']?\s*[:=]\s*["']?\S/i },
  // HTML / script injection.
  { id: "script_tag", pattern: /<\s*script\b/i },
  { id: "html_embed", pattern: /<\s*\/?\s*(?:iframe|img|svg|object|embed|link|style)\b/i },
  { id: "js_uri", pattern: /javascript:\s*\S/i },
  { id: "event_handler", pattern: /\bon(?:error|load|click|mouseover)\s*=/i },
  // Control-character abuse (allow tab/newline/carriage-return only).
  // eslint-disable-next-line no-control-regex
  { id: "control_chars", pattern: /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/ },
];

/** Scan the raw narrative text for secret/path/injection leakage. Returns the
 * ids of any rules that fired. */
export function securityViolations(rawText: string): string[] {
  const hits: string[] = [];
  for (const rule of SECURITY_RULES) {
    if (rule.pattern.test(rawText)) hits.push(rule.id);
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Structural: numeric grounding
// ---------------------------------------------------------------------------

/** The only numbers a grounded narrative may state: derived deterministically
 * from the governed request (evidence count, verification tallies, confidence). */
export function allowedNumbers(request: NvidiaNarrativeRequest): Set<string> {
  const allowed = new Set<string>();
  const add = (n: number) => {
    if (!Number.isFinite(n)) return;
    allowed.add(String(n));
    allowed.add(String(Math.round(n)));
  };
  const count = request.verifiedEvidence.length;
  add(count);
  add(request.evidenceRefs.length);
  add(Math.round(request.recommendation.confidence * 100));
  add(request.recommendation.confidence);
  // Verification tallies extracted from the deterministic summary (e.g. "3 of 3").
  for (const m of request.verificationSummary.matchAll(/\d+(?:\.\d+)?/g)) add(Number(m[0]));
  return allowed;
}

function ungroundedNumbers(text: string, allowed: Set<string>): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/\d+(?:\.\d+)?%?/g)) {
    const raw = m[0].replace(/%$/, "");
    if (!allowed.has(raw)) found.push(m[0]);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Structurally validate the candidate shape. Returns an error list; a non-empty
 * list means the narrative is malformed and must be rejected. */
function structuralErrors(n: NvidiaGroundedNarrative): string[] {
  const errors: string[] = [];
  const requiredText: (keyof NvidiaGroundedNarrative)[] = [
    "whatChanged",
    "riskExplanation",
    "recommendationRationale",
    "approvalExplanation",
    "voiceSummary",
  ];
  for (const key of requiredText) {
    if (!isNonEmptyString(n[key])) errors.push(`missing_or_empty:${String(key)}`);
  }
  if (!Array.isArray(n.evidenceRefs)) errors.push("evidenceRefs_not_array");
  if (!Array.isArray(n.caveats)) errors.push("caveats_not_array");
  if (n.schemaVersion !== "1.0") errors.push("bad_schema_version");
  return errors;
}

/** The deterministic grounding guard. Given the governed request and a candidate
 * narrative, decide whether it may be presented. */
export function validateGroundedNarrative(
  request: NvidiaNarrativeRequest,
  candidate: NvidiaGroundedNarrative,
): GroundingResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rejectedClaims: string[] = [];

  // 1. Structural validity.
  const structural = structuralErrors(candidate);
  if (structural.length > 0) {
    return {
      valid: false,
      status: "malformed",
      errors: structural,
      warnings,
      acceptedEvidenceRefs: [],
      rejectedClaims,
    };
  }

  const allTextRaw = narrativeTextFields(candidate).join(" \n ");
  const normalized = normalizeText(allTextRaw);

  // 2. Live-output security — reject secret/path/URL/injection/control-char
  // leakage in untrusted model text. Fails closed to the deterministic baseline.
  const security = securityViolations(allTextRaw);
  for (const id of security) {
    errors.push(`security_violation:${id}`);
    rejectedClaims.push(`Narrative contained disallowed content (${id}).`);
  }

  // 3. Evidence-ref subset — every cited ref must be a supplied ref.
  const allowedRefs = new Set(request.evidenceRefs);
  const acceptedEvidenceRefs: string[] = [];
  for (const ref of candidate.evidenceRefs) {
    if (allowedRefs.has(ref)) acceptedEvidenceRefs.push(ref);
    else {
      errors.push(`ungrounded_evidence_ref:${ref}`);
      rejectedClaims.push(`Cited evidence ref not supplied by the mission: ${ref}`);
    }
  }
  if (acceptedEvidenceRefs.length === 0) {
    errors.push("no_grounded_evidence_refs");
    rejectedClaims.push("Narrative cites no supplied evidence.");
  }

  // 4. Banned real-execution claims.
  for (const rule of BANNED_EXECUTION_RULES) {
    if (ruleFires(normalized, rule)) {
      errors.push(`banned_execution_claim:${rule.id}`);
      rejectedClaims.push(rule.description);
    }
  }

  // 5. False approval / self-authority claims.
  for (const rule of BANNED_APPROVAL_RULES) {
    if (ruleFires(normalized, rule)) {
      errors.push(`banned_approval_claim:${rule.id}`);
      rejectedClaims.push(rule.description);
    }
  }

  // 6. Unapproved-action vocabulary — an action not in the governed set.
  const permittedVocab = normalizeText(
    request.permittedActions.map((a) => `${a.actionId} ${a.businessLabel}`).join(" ") +
      " " +
      `${request.recommendation.actionType} ${request.recommendation.businessLabel}`,
  );
  for (const term of FOREIGN_ACTION_TERMS) {
    const t = normalizeText(term);
    if (normalized.includes(t) && !permittedVocab.includes(t)) {
      errors.push(`unapproved_action:${t.replace(/\s+/g, "_")}`);
      rejectedClaims.push(`Narrative proposes an action outside the governed set: "${term}".`);
    }
  }

  // 7. Numeric grounding — no fabricated metrics.
  const allowed = allowedNumbers(request);
  const badNumbers = ungroundedNumbers(normalized, allowed);
  for (const num of badNumbers) {
    errors.push(`ungrounded_number:${num}`);
    rejectedClaims.push(`Narrative states an unsupported figure: ${num}`);
  }

  // 8. Simulation language must be preserved (assurance nothing was sent/written).
  const simulationPreserved =
    containsPhrase(normalized, "simulat") ||
    coOccurs(normalized, ["sandbox"]) ||
    containsPhrase(normalized, "nothing will be sent") ||
    containsPhrase(normalized, "no email");
  if (!simulationPreserved) {
    warnings.push("simulation_language_absent");
  }

  // 9. Voice summary bound (soft — presentation truncates but we flag).
  if (candidate.voiceSummary.length > 240) warnings.push("voice_summary_over_bound");

  const valid = errors.length === 0;
  return {
    valid,
    status: valid ? "grounded" : "rejected",
    errors,
    warnings,
    acceptedEvidenceRefs,
    rejectedClaims,
  };
}
