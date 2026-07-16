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

  // 2. Evidence-ref subset — every cited ref must be a supplied ref.
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

  // 3. Banned real-execution claims.
  for (const rule of BANNED_EXECUTION_RULES) {
    if (ruleFires(normalized, rule)) {
      errors.push(`banned_execution_claim:${rule.id}`);
      rejectedClaims.push(rule.description);
    }
  }

  // 4. False approval / self-authority claims.
  for (const rule of BANNED_APPROVAL_RULES) {
    if (ruleFires(normalized, rule)) {
      errors.push(`banned_approval_claim:${rule.id}`);
      rejectedClaims.push(rule.description);
    }
  }

  // 5. Unapproved-action vocabulary — an action not in the governed set.
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

  // 6. Numeric grounding — no fabricated metrics.
  const allowed = allowedNumbers(request);
  const badNumbers = ungroundedNumbers(normalized, allowed);
  for (const num of badNumbers) {
    errors.push(`ungrounded_number:${num}`);
    rejectedClaims.push(`Narrative states an unsupported figure: ${num}`);
  }

  // 7. Simulation language must be preserved (assurance nothing was sent/written).
  const simulationPreserved =
    containsPhrase(normalized, "simulat") ||
    coOccurs(normalized, ["sandbox"]) ||
    containsPhrase(normalized, "nothing will be sent") ||
    containsPhrase(normalized, "no email");
  if (!simulationPreserved) {
    warnings.push("simulation_language_absent");
  }

  // 8. Voice summary bound (soft — presentation truncates but we flag).
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
