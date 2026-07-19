// Guardrails Lab (Feature Branch) — pure discriminated contracts
// ===============================================================
// Isolated, additive contracts for the Curefoods Guardrails Lab (`/guardrails`).
// They describe a READ-ONLY governed-safety demonstration:
//
//   * VentureOS deterministic policy is AUTHORITATIVE — the final decision is
//     reproducible from deterministic rails alone.
//   * NVIDIA NemoGuard JailbreakDetect is ADDITIONAL classification telemetry.
//     It never selects, ranks, approves, executes, or determines the final block.
//
// Nothing here mutates mission state, approval state, the audit reference, or the
// protected Decision Ledger. No secret, PII, hidden prompt, or authorization
// header is ever stored on these contracts.

/** The governed guardrail verdict. Reproducible from deterministic rails. */
export type GuardrailDecision =
  | "allowed"
  | "blocked"
  | "constrained"
  | "redacted"
  | "escalated";

/** The deterministic rail categories evaluated for every request. */
export type GuardrailCategory =
  | "instruction_conflict"
  | "approval_bypass"
  | "execution_request"
  | "unsupported_customer_claim"
  | "unsupported_risk_claim"
  | "sensitive_data"
  | "account_substitution"
  | "evidence_manipulation"
  | "mission_audit_mutation"
  | "jailbreak_pattern";

/** Severity of a single rail finding. `block` participates in a blocking verdict;
 * `redact` maps to a redacted verdict; `review` escalates to human review. */
export type FindingSeverity = "info" | "review" | "redact" | "block";

/** A curated Curefoods request the Lab evaluates. There is NO free-form public
 * prompt box: every request is a fixed, auditable scenario input. */
export interface GuardrailRequest {
  /** Stable scenario identifier. */
  readonly scenarioId: string;
  /** The curated request text under evaluation. */
  readonly requestText: string;
  /** The single governed demo account (always Curefoods). */
  readonly account: "Curefoods";
}

/** A single deterministic rail outcome. Carries no secret/PII — only the rail id,
 * a human label, and the benign matched markers. */
export interface GuardrailFinding {
  readonly railId: string;
  readonly railLabel: string;
  readonly category: GuardrailCategory;
  readonly triggered: boolean;
  readonly severity: FindingSeverity;
  readonly detail: string;
  /** Benign matched tokens/markers (never raw secrets or PII). */
  readonly markers: readonly string[];
}

/** Adapter execution mode. */
export type NvidiaGuardrailsMode = "mock" | "live" | "forced_fallback";

/** The server-classified NemoGuard JailbreakDetect result, presented honestly.
 * The raw score is NOT a calibrated probability or confidence. */
export interface NvidiaJailbreakResult {
  /** True only when a real live classification completed. */
  readonly available: boolean;
  /** The classifier boolean, or null when unavailable. */
  readonly booleanResult: boolean | null;
  /** The raw decision-function score, or null when unavailable. */
  readonly rawScore: number | null;
  /** Round-trip latency for a live call, or null. */
  readonly latencyMs: number | null;
  /** True when the deterministic policy ran without a live classification. */
  readonly fallbackUsed: boolean;
  /** A non-secret error/degradation code, or null. */
  readonly errorCode: string | null;
  /** Always `ventureos_demo` — the interpretation is VentureOS-defined. */
  readonly interpretationSource: "ventureos_demo";
  /** A qualified, non-authoritative interpretation label (never "probability"). */
  readonly interpretationLabel: string;
  /** Which adapter mode produced this result. */
  readonly mode: NvidiaGuardrailsMode;
}

/** The action boundary surfaced to the user — always inert in the Lab. */
export interface GuardrailActionBoundary {
  readonly actionExecuted: false;
  readonly emailSent: false;
  readonly crmTaskCreated: false;
  readonly riskUpdated: false;
  readonly missionMutated: false;
}

/** A complete, read-only guardrail evaluation for one scenario. */
export interface GuardrailEvaluation {
  readonly scenarioId: string;
  readonly scenarioTitle: string;
  readonly request: GuardrailRequest;
  readonly railsEvaluated: readonly GuardrailCategory[];
  readonly findings: readonly GuardrailFinding[];
  /** The verdict from deterministic rails alone (authoritative). */
  readonly deterministicDecision: GuardrailDecision;
  /** The final verdict. ALWAYS equals `deterministicDecision`: NVIDIA never
   * overrides deterministic policy. */
  readonly finalDecision: GuardrailDecision;
  /** Additional NVIDIA telemetry (never authoritative). */
  readonly nvidia: NvidiaJailbreakResult;
  /** The governed, honest response the user is shown. */
  readonly safeResponse: string;
  /** True when the result should be routed to a human (ambiguous/constrained). */
  readonly requiresHumanReview: boolean;
  /** The inert action boundary. */
  readonly actionBoundary: GuardrailActionBoundary;
}

/** A read-only projection for the audit panel. It REFERENCES the existing
 * Curefoods audit reference but never appends to or mutates any ledger. This is
 * NOT a ledger event — it is a read-only guardrail evaluation record. */
export interface GuardrailAuditProjection {
  readonly kind: "read-only guardrail audit projection";
  readonly scenarioId: string;
  readonly scenarioTitle: string;
  readonly railsEvaluated: readonly GuardrailCategory[];
  readonly findings: readonly GuardrailFinding[];
  readonly deterministicFinalDecision: GuardrailDecision;
  readonly nvidiaAvailable: boolean;
  readonly nvidiaBooleanResult: boolean | null;
  readonly nvidiaRawScore: number | null;
  readonly fallbackUsed: boolean;
  /** Read-only reference to the canonical Curefoods recommendationId (never mutated). */
  readonly referencedRecommendationId: string;
  /** Read-only reference to the canonical Curefoods audit ref (never mutated). */
  readonly referencedAuditRef: string;
  readonly missionUnchanged: true;
  readonly auditRefUnchanged: true;
  readonly ledgerMutated: false;
  readonly actionExecuted: false;
}

/** A curated scenario definition (input + expected governed shape). */
export interface GuardrailScenario {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly requestText: string;
  /** The expected deterministic verdict (also asserted by evals). */
  readonly expectedDecision: GuardrailDecision;
  /** The governed, honest response shown for this scenario. */
  readonly safeResponse: string;
  /** Whether this scenario is a primary (1-5) or optional (6) curated case. */
  readonly tier: "primary" | "optional";
}
