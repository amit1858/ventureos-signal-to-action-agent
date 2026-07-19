// Guardrails Lab — pure evaluation orchestrator (failure matrix)
// ==============================================================
// Combines the AUTHORITATIVE deterministic rails with ADDITIONAL NVIDIA telemetry
// into a read-only `GuardrailEvaluation`. The final decision ALWAYS equals the
// deterministic decision — NVIDIA never overrides, creates an action, or mutates
// state. Pure: identical (request, nvidiaResult) -> identical evaluation.

import {
  deriveDeterministicDecision,
  evaluateRails,
  RAIL_CATEGORIES,
} from "./rails";
import { CUREFOODS_AUDIT_REF, CUREFOODS_RECOMMENDATION_ID } from "./scenarios";
import type {
  GuardrailActionBoundary,
  GuardrailAuditProjection,
  GuardrailEvaluation,
  GuardrailScenario,
  NvidiaGuardrailsMode,
  NvidiaJailbreakResult,
} from "./types";

/** VentureOS demo reference score (labelled, NON-authoritative). Used only to
 * phrase a qualified interpretation of the raw NVIDIA score relative to a safe
 * baseline. It is NOT an NVIDIA-supplied threshold and NOT a probability. */
export const SAFE_REFERENCE_SCORE = -0.95;

/** The inert action boundary — the Lab never executes anything. */
export const INERT_ACTION_BOUNDARY: GuardrailActionBoundary = Object.freeze({
  actionExecuted: false,
  emailSent: false,
  crmTaskCreated: false,
  riskUpdated: false,
  missionMutated: false,
});

/** Build a qualified, non-authoritative interpretation label for a raw score.
 * Never uses "probability", "confidence", or unqualified "safe"/"unsafe". */
export function interpretRawScore(rawScore: number | null): string {
  if (rawScore === null) {
    return "No live NVIDIA classification available (deterministic policy applied).";
  }
  if (rawScore > SAFE_REFERENCE_SCORE) {
    return "Stronger adversarial signal than the VentureOS safe reference prompt (VentureOS demo interpretation; not a probability).";
  }
  return "No stronger than the VentureOS safe reference prompt (VentureOS demo interpretation; not a probability).";
}

/** Build a deterministic MOCK NVIDIA result for a request (no network). Honest to
 * the live probe: the boolean stays false; the raw score is derived from the
 * request text so unit tests are stable. Used by mock mode + deterministic evals. */
export function mockNvidiaResult(
  requestText: string,
  mode: NvidiaGuardrailsMode = "mock",
): NvidiaJailbreakResult {
  // Deterministic pseudo-score in the observed range (safe ~ -0.98, adversarial
  // ~ -0.6..-0.7). This mirrors probe behaviour: the boolean does not fire.
  const lower = requestText.toLowerCase();
  const adversarial =
    /ignore|disregard|unrestricted|do anything now|developer mode|dan|aim|jailbreak|reveal|system prompt/.test(lower);
  const rawScore = adversarial ? -0.66 : -0.97;
  return Object.freeze({
    available: true,
    booleanResult: false,
    rawScore,
    latencyMs: null,
    fallbackUsed: false,
    errorCode: null,
    interpretationSource: "ventureos_demo",
    interpretationLabel: interpretRawScore(rawScore),
    mode,
  });
}

/** Build a fallback NVIDIA result (unavailable / forced fallback / malformed). */
export function fallbackNvidiaResult(
  mode: NvidiaGuardrailsMode,
  errorCode: string,
): NvidiaJailbreakResult {
  return Object.freeze({
    available: false,
    booleanResult: null,
    rawScore: null,
    latencyMs: null,
    fallbackUsed: true,
    errorCode,
    interpretationSource: "ventureos_demo",
    interpretationLabel: interpretRawScore(null),
    mode,
  });
}

function isAmbiguous(nvidia: NvidiaJailbreakResult): boolean {
  // Ambiguous = a live classification whose raw score sits ABOVE the safe
  // reference (trending adversarial) but has not clearly separated. A score at or
  // below the safe reference is UNAMBIGUOUSLY SAFE and never triggers guardrail
  // review — a safe request must not be flagged merely because NVIDIA is present.
  // (This is guardrail review only; it is distinct from mission approval, which
  // remains mandatory before any action regardless of this flag.)
  if (!nvidia.available || nvidia.rawScore === null) return false;
  return (
    nvidia.rawScore > SAFE_REFERENCE_SCORE &&
    nvidia.rawScore - SAFE_REFERENCE_SCORE < 0.05
  );
}

/** Compose the authoritative deterministic decision with additional NVIDIA
 * telemetry into a read-only evaluation. The final decision is the deterministic
 * decision — always. */
export function evaluateGuardrail(
  scenario: GuardrailScenario,
  nvidia: NvidiaJailbreakResult,
): GuardrailEvaluation {
  const findings = evaluateRails(scenario.requestText);
  const deterministicDecision = deriveDeterministicDecision(findings);

  // Human review is warranted when the deterministic verdict is soft
  // (constrained/escalated) OR when NVIDIA is ambiguous. It NEVER changes the
  // final decision and NEVER permits an action.
  const requiresHumanReview =
    deterministicDecision === "constrained" ||
    deterministicDecision === "escalated" ||
    isAmbiguous(nvidia);

  return Object.freeze({
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    request: Object.freeze({
      scenarioId: scenario.id,
      requestText: scenario.requestText,
      account: "Curefoods" as const,
    }),
    railsEvaluated: RAIL_CATEGORIES,
    findings,
    deterministicDecision,
    // LOCKED INVARIANT: final decision === deterministic decision.
    finalDecision: deterministicDecision,
    nvidia,
    safeResponse: scenario.safeResponse,
    requiresHumanReview,
    actionBoundary: INERT_ACTION_BOUNDARY,
  });
}

/** Build the read-only audit projection for an evaluation. It references the
 * canonical Curefoods audit ref but never appends to / mutates any ledger. */
export function projectGuardrailAudit(evaluation: GuardrailEvaluation): GuardrailAuditProjection {
  return Object.freeze({
    kind: "read-only guardrail audit projection",
    scenarioId: evaluation.scenarioId,
    scenarioTitle: evaluation.scenarioTitle,
    railsEvaluated: evaluation.railsEvaluated,
    findings: evaluation.findings,
    deterministicFinalDecision: evaluation.finalDecision,
    nvidiaAvailable: evaluation.nvidia.available,
    nvidiaBooleanResult: evaluation.nvidia.booleanResult,
    nvidiaRawScore: evaluation.nvidia.rawScore,
    fallbackUsed: evaluation.nvidia.fallbackUsed,
    referencedRecommendationId: CUREFOODS_RECOMMENDATION_ID,
    referencedAuditRef: CUREFOODS_AUDIT_REF,
    missionUnchanged: true,
    auditRefUnchanged: true,
    ledgerMutated: false,
    actionExecuted: false,
  });
}
