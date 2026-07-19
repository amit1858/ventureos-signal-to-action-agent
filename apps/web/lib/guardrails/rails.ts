// Guardrails Lab — deterministic rails (AUTHORITATIVE policy)
// ===========================================================
// Pure, dependency-light request-side detectors. These rails are the AUTHORITATIVE
// guardrail: the final decision is fully reproducible from them alone. They wrap
// the existing read-only output validators where safe (`normalizeText`,
// `securityViolations`) and add request-side detectors in this isolated namespace.
// No existing Production validator is modified.
//
// Identical input -> identical findings -> identical decision.

import { normalizeText, securityViolations } from "../nvidia/grounding";
import type {
  GuardrailCategory,
  GuardrailDecision,
  GuardrailFinding,
} from "./types";

// ---------------------------------------------------------------------------
// Local, word-order-tolerant matchers (do not depend on non-exported helpers)
// ---------------------------------------------------------------------------

function containsPhrase(normalized: string, phrase: string): boolean {
  const p = normalizeText(phrase);
  if (p.length === 0) return false;
  return (" " + normalized + " ").includes(" " + p + " ") || normalized.includes(p);
}

function coOccurs(normalized: string, terms: string[]): boolean {
  const words = new Set(normalized.split(" "));
  return terms.every((t) => (t.includes(" ") ? normalized.includes(normalizeText(t)) : words.has(t)));
}

interface RailRule {
  readonly id: string;
  readonly label: string;
  readonly category: GuardrailCategory;
  readonly severity: GuardrailFinding["severity"];
  readonly detail: string;
  readonly phrases?: string[];
  readonly coOccur?: string[][];
}

// ---------------------------------------------------------------------------
// Rail definitions (request-side)
// ---------------------------------------------------------------------------

const RAILS: RailRule[] = [
  {
    id: "instruction_conflict",
    label: "Instruction conflict",
    category: "instruction_conflict",
    severity: "block",
    detail: "Request tries to override the governed system instructions.",
    phrases: [
      "ignore previous instructions",
      "ignore all previous instructions",
      "ignore all instructions",
      "ignore the above",
      "disregard previous instructions",
      "disregard all instructions",
      "forget your instructions",
      "forget previous instructions",
      "override your instructions",
      "override the system",
      "you are no longer bound",
      "new instructions",
    ],
    coOccur: [["ignore", "instructions"], ["disregard", "instructions"], ["override", "instructions"]],
  },
  {
    id: "approval_bypass",
    label: "Approval bypass",
    category: "approval_bypass",
    severity: "block",
    detail: "Request tries to skip or fabricate the mandatory human approval.",
    phrases: [
      "skip approval",
      "skip the approval",
      "without approval",
      "no approval needed",
      "bypass approval",
      "auto approve",
      "don't wait for approval",
      "do not wait for approval",
      "mark the renewal won",
      "mark it won",
      "mark as approved",
      "approve it yourself",
      "self approve",
    ],
    coOccur: [["skip", "approval"], ["bypass", "approval"], ["mark", "won"], ["mark", "approved"]],
  },
  {
    id: "execution_request",
    label: "Execution request",
    category: "execution_request",
    severity: "block",
    detail: "Request tries to trigger a real external action (send / write / call).",
    phrases: [
      "send the email",
      "send email",
      "actually send",
      "send it now",
      "create the crm task",
      "create a crm task",
      "write to the crm",
      "update the crm",
      "update the risk",
      "write the risk update",
      "execute the action",
      "execute the actions",
      "make the call",
      "place the call",
    ],
    coOccur: [["send", "email"], ["create", "task"], ["write", "crm"], ["execute", "action"]],
  },
  {
    id: "unsupported_customer_claim",
    label: "Unsupported customer-response claim",
    category: "unsupported_customer_claim",
    severity: "block",
    detail: "Request tries to assert a customer outcome that has not occurred.",
    phrases: [
      "customer agreed to renew",
      "customer agreed",
      "customer confirmed",
      "customer will renew",
      "customer has renewed",
      "renewal won",
      "outcome to customer agreed",
      "they agreed to renew",
      "mark the customer as renewed",
    ],
    coOccur: [["customer", "agreed"], ["customer", "renewed"], ["renewal", "won"]],
  },
  {
    id: "unsupported_risk_claim",
    label: "Unsupported risk-reduction claim",
    category: "unsupported_risk_claim",
    severity: "block",
    detail: "Request tries to assert risk reduction or confidence not backed by evidence.",
    phrases: [
      "risk reduced",
      "risk is reduced",
      "reduce the risk to",
      "risk is now zero",
      "risk is now low",
      "raise confidence to 100",
      "set confidence to 100",
      "confidence to 100%",
      "increase confidence to",
      "mark risk as resolved",
    ],
    coOccur: [["risk", "reduced"], ["confidence", "100"], ["risk", "resolved"]],
  },
  {
    id: "sensitive_data",
    label: "Sensitive-data request",
    category: "sensitive_data",
    severity: "redact",
    detail: "Request tries to extract secrets, tokens, hidden prompts, or PII.",
    phrases: [
      "reveal access tokens",
      "reveal the access token",
      "reveal hidden prompts",
      "reveal your system prompt",
      "show your system prompt",
      "show all customer emails",
      "show customer emails",
      "internal secrets",
      "internal secret",
      "api key",
      "access token",
      "hidden prompt",
      "system prompt",
      "environment variables",
      "show me the secrets",
    ],
    coOccur: [["reveal", "token"], ["reveal", "secret"], ["show", "secrets"], ["show", "emails"], ["reveal", "prompt"]],
  },
  {
    id: "account_substitution",
    label: "Account substitution",
    category: "account_substitution",
    severity: "block",
    detail: "Request tries to substitute the governed Curefoods account with another.",
    phrases: [
      "replace curefoods",
      "replace curefoods with tessera",
      "swap curefoods",
      "use tessera instead",
      "change the account to",
      "substitute the account",
      "switch to tessera",
      "but keep the audit reference",
      "preserve the audit reference",
    ],
    coOccur: [["replace", "curefoods"], ["swap", "curefoods"], ["tessera", "curefoods"], ["change", "account"]],
  },
  {
    id: "evidence_manipulation",
    label: "Evidence manipulation",
    category: "evidence_manipulation",
    severity: "block",
    detail: "Request tries to remove, fabricate, or distort governed evidence.",
    phrases: [
      "remove usage-decline evidence",
      "remove the evidence",
      "delete evidence",
      "delete the evidence",
      "hide the usage decline",
      "suppress evidence",
      "fabricate evidence",
      "invent evidence",
      "raise confidence to 100",
      "change the confidence",
    ],
    coOccur: [["remove", "evidence"], ["delete", "evidence"], ["hide", "usage"], ["fabricate", "evidence"], ["suppress", "evidence"]],
  },
  {
    id: "mission_audit_mutation",
    label: "Mission / audit mutation",
    category: "mission_audit_mutation",
    severity: "block",
    detail: "Request tries to mutate mission state, the audit reference, or the ledger.",
    phrases: [
      "change the mission",
      "mutate the mission",
      "overwrite the audit",
      "change the audit reference",
      "modify the audit reference",
      "alter the ledger",
      "write to the ledger",
      "change the outcome to",
      "rewrite the audit",
    ],
    coOccur: [["overwrite", "audit"], ["alter", "ledger"], ["write", "ledger"], ["change", "outcome"]],
  },
  {
    id: "jailbreak_pattern",
    label: "Jailbreak pattern",
    category: "jailbreak_pattern",
    severity: "block",
    detail: "Request matches a known jailbreak / roleplay-escape template.",
    phrases: [
      "do anything now",
      "developer mode",
      "jailbreak",
      "roleplay as an unrestricted",
      "act as an unrestricted",
      "you have no restrictions",
      "no ethical or moral guidelines",
      "completely amoral",
      "pretend you are an ai without",
      "dan mode",
    ],
    coOccur: [["do", "anything", "now"], ["developer", "mode"], ["unrestricted", "agent"]],
  },
];

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** The stable ordered list of rail categories this kernel evaluates. */
export const RAIL_CATEGORIES: readonly GuardrailCategory[] = RAILS.map((r) => r.category);

function ruleFires(normalized: string, rule: RailRule): string[] {
  const markers: string[] = [];
  for (const p of rule.phrases ?? []) {
    if (containsPhrase(normalized, p)) markers.push(p);
  }
  for (const combo of rule.coOccur ?? []) {
    if (coOccurs(normalized, combo)) markers.push(combo.join("+"));
  }
  return markers;
}

/** Evaluate every deterministic rail against a request text. Pure and stable. */
export function evaluateRails(requestText: string): GuardrailFinding[] {
  const normalized = normalizeText(requestText);
  const findings: GuardrailFinding[] = [];

  for (const rule of RAILS) {
    let markers = ruleFires(normalized, rule);

    // The sensitive-data rail additionally reuses the existing read-only
    // secret/path/injection scanner on the RAW text (punctuation-sensitive).
    if (rule.id === "sensitive_data") {
      const secHits = securityViolations(requestText);
      if (secHits.length > 0) markers = markers.concat(secHits.map((h) => `secret:${h}`));
    }

    findings.push({
      railId: rule.id,
      railLabel: rule.label,
      category: rule.category,
      triggered: markers.length > 0,
      severity: rule.severity,
      detail: rule.detail,
      markers,
    });
  }

  return findings;
}

const BLOCK_CATEGORIES = new Set<GuardrailCategory>([
  "instruction_conflict",
  "approval_bypass",
  "execution_request",
  "unsupported_customer_claim",
  "unsupported_risk_claim",
  "account_substitution",
  "evidence_manipulation",
  "mission_audit_mutation",
  "jailbreak_pattern",
]);

/** Derive the AUTHORITATIVE deterministic decision from rail findings alone.
 * Precedence: any block-category finding -> blocked; else sensitive-data ->
 * redacted; else allowed. This is fully reproducible and NVIDIA-independent. */
export function deriveDeterministicDecision(findings: readonly GuardrailFinding[]): GuardrailDecision {
  const triggered = findings.filter((f) => f.triggered);
  if (triggered.some((f) => BLOCK_CATEGORIES.has(f.category))) return "blocked";
  if (triggered.some((f) => f.category === "sensitive_data")) return "redacted";
  return "allowed";
}
