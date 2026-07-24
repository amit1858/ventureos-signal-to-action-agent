// VentureOS — AI Assurance · Contract (web mirror)
// ================================================
// Dependency-free TypeScript mirror of the committed Python assurance export
// (`services/api/evals/assurance_web_export.py`, built from the REAL deterministic
// evaluators eval_assurance / eval_runtime_verification / eval_synthetic_lab).
//
// The `/assurance` screen is a CONSUMER ONLY: it renders a build-time-generated,
// contract-validated projection and never re-runs governance, evaluation, or any
// engine. Parity is guaranteed on two sides:
//   * Python `assurance_web_export.py --check` proves the generated JSON matches
//     the authoritative evaluators;
//   * the validators here fail closed on drift, snake_case leaks in the top-level
//     shape, or any violation of the NVIDIA-advisory invariants before render.
//
// Safety invariants enforced here (fail closed):
//   * NVIDIA is advisory only: `nvidiaAdvisory.authoritative` MUST be false.
//   * NVIDIA can never override a deterministic gate: every gate's `verdict` MUST
//     equal its `deterministicResult`.

export const ASSURANCE_SCHEMA_VERSION = "1.0" as const;

export interface OverallReadiness {
  verdict: string;
  readiness: string;
  passedDimensions: number;
  totalDimensions: number;
  failedDimensions: string[];
  rubricVersion: string;
}

export interface DeterministicGate {
  key: string;
  label: string;
  expected: string;
  actual: string;
  verdict: string;
  deterministicResult: string;
  humanReview: string;
  qualityScore: number;
  evidence: string[];
}

export interface NvidiaInvariants {
  serverOnly: boolean;
  deterministicFirst: boolean;
  wordingOverlay: boolean;
  groundednessValidation: boolean;
  timeoutFallback: boolean;
  rejectionFallback: boolean;
}

export interface NvidiaAdvisory {
  configured: boolean;
  provider: string;
  model: string;
  health: string;
  assessment: string;
  authoritative: boolean;
  note: string;
  invariants: NvidiaInvariants;
}

export interface HumanReviewRow {
  key: string;
  label: string;
  humanReview: string;
  verdict: string;
}

export interface SyntheticScenario {
  name: string;
  category: string;
  expected: string;
  actual: string;
  matched: boolean;
}

export interface SyntheticEvidence {
  datasetVersion: string;
  provider: string;
  nemoConfigured: boolean;
  totalScenarios: number;
  matched: number;
  failed: number;
  verdict: string;
  categories: string[];
  categoryCounts: Record<string, number>;
  scenarios: SyntheticScenario[];
}

export interface RuntimeField {
  value: string | boolean;
  verified: boolean;
  evidence: string;
}

export interface RuntimeVerification {
  version: string;
  configured: boolean;
  health: string;
  fields: Record<string, RuntimeField>;
}

export interface RegressionEntry {
  label: string;
  kind: string;
  backendChecks: number;
  backendFailures: number;
  backendFiles: number;
  note: string;
}

export interface AssuranceDoc {
  schemaVersion: string;
  generatedBy: string;
  overallReadiness: OverallReadiness;
  deterministicGates: DeterministicGate[];
  nvidiaAdvisory: NvidiaAdvisory;
  humanReview: HumanReviewRow[];
  syntheticEvidence: SyntheticEvidence;
  runtimeVerification: RuntimeVerification;
  regressionHistory: RegressionEntry[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isString(value: unknown): value is string {
  return typeof value === "string";
}
function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}
function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

export function validateAssuranceDoc(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { ok: false, errors: ["doc: expected object"] };
  }

  if (value.schemaVersion !== ASSURANCE_SCHEMA_VERSION) {
    errors.push(`doc.schemaVersion: expected ${ASSURANCE_SCHEMA_VERSION}`);
  }

  // Overall readiness.
  const overall = value.overallReadiness;
  if (!isObject(overall)) {
    errors.push("doc.overallReadiness: expected object");
  } else {
    if (!isString(overall.verdict)) errors.push("overallReadiness.verdict: expected string");
    if (!isString(overall.readiness)) errors.push("overallReadiness.readiness: expected string");
    if (!isNumber(overall.passedDimensions)) errors.push("overallReadiness.passedDimensions: expected number");
    if (!isNumber(overall.totalDimensions)) errors.push("overallReadiness.totalDimensions: expected number");
    if (!isStringArray(overall.failedDimensions)) errors.push("overallReadiness.failedDimensions: expected string[]");
  }

  // Deterministic gates + non-override invariant.
  if (!Array.isArray(value.deterministicGates)) {
    errors.push("doc.deterministicGates: expected array");
  } else {
    value.deterministicGates.forEach((g, i) => {
      if (!isObject(g)) {
        errors.push(`deterministicGates[${i}]: expected object`);
        return;
      }
      if (!isString(g.key)) errors.push(`deterministicGates[${i}].key: expected string`);
      if (!isString(g.label)) errors.push(`deterministicGates[${i}].label: expected string`);
      if (!isString(g.expected)) errors.push(`deterministicGates[${i}].expected: expected string`);
      if (!isString(g.actual)) errors.push(`deterministicGates[${i}].actual: expected string`);
      if (!isString(g.verdict)) errors.push(`deterministicGates[${i}].verdict: expected string`);
      if (!isString(g.deterministicResult)) errors.push(`deterministicGates[${i}].deterministicResult: expected string`);
      if (!isString(g.humanReview)) errors.push(`deterministicGates[${i}].humanReview: expected string`);
      if (!isNumber(g.qualityScore)) errors.push(`deterministicGates[${i}].qualityScore: expected number`);
      if (!isStringArray(g.evidence)) errors.push(`deterministicGates[${i}].evidence: expected string[]`);
      // NON-OVERRIDE INVARIANT: the authoritative verdict is the deterministic
      // result. Any drift means NVIDIA (or anything else) altered the verdict.
      if (isString(g.verdict) && isString(g.deterministicResult) && g.verdict !== g.deterministicResult) {
        errors.push(
          `deterministicGates[${i}]: verdict (${g.verdict}) must equal deterministicResult (${g.deterministicResult})`,
        );
      }
    });
  }

  // NVIDIA advisory posture.
  const nvidia = value.nvidiaAdvisory;
  if (!isObject(nvidia)) {
    errors.push("doc.nvidiaAdvisory: expected object");
  } else {
    if (!isBoolean(nvidia.configured)) errors.push("nvidiaAdvisory.configured: expected boolean");
    if (!isString(nvidia.provider)) errors.push("nvidiaAdvisory.provider: expected string");
    if (!isString(nvidia.model)) errors.push("nvidiaAdvisory.model: expected string");
    if (!isString(nvidia.health)) errors.push("nvidiaAdvisory.health: expected string");
    if (!isString(nvidia.assessment)) errors.push("nvidiaAdvisory.assessment: expected string");
    if (!isString(nvidia.note)) errors.push("nvidiaAdvisory.note: expected string");
    // ADVISORY-ONLY INVARIANT: NVIDIA is never authoritative.
    if (nvidia.authoritative !== false) {
      errors.push("nvidiaAdvisory.authoritative: MUST be false (NVIDIA is advisory only)");
    }
    const inv = nvidia.invariants;
    if (!isObject(inv)) {
      errors.push("nvidiaAdvisory.invariants: expected object");
    } else {
      for (const k of [
        "serverOnly",
        "deterministicFirst",
        "wordingOverlay",
        "groundednessValidation",
        "timeoutFallback",
        "rejectionFallback",
      ] as const) {
        if (inv[k] !== true) {
          errors.push(`nvidiaAdvisory.invariants.${k}: MUST be true`);
        }
      }
    }
  }

  // Human review.
  if (!Array.isArray(value.humanReview)) {
    errors.push("doc.humanReview: expected array");
  }

  // Synthetic evidence.
  const syn = value.syntheticEvidence;
  if (!isObject(syn)) {
    errors.push("doc.syntheticEvidence: expected object");
  } else {
    if (!isString(syn.datasetVersion)) errors.push("syntheticEvidence.datasetVersion: expected string");
    if (!isString(syn.provider)) errors.push("syntheticEvidence.provider: expected string");
    if (!isNumber(syn.totalScenarios)) errors.push("syntheticEvidence.totalScenarios: expected number");
    if (!isNumber(syn.matched)) errors.push("syntheticEvidence.matched: expected number");
    if (!Array.isArray(syn.scenarios)) errors.push("syntheticEvidence.scenarios: expected array");
  }

  // Runtime verification.
  const rv = value.runtimeVerification;
  if (!isObject(rv)) {
    errors.push("doc.runtimeVerification: expected object");
  } else {
    if (!isString(rv.version)) errors.push("runtimeVerification.version: expected string");
    if (!isBoolean(rv.configured)) errors.push("runtimeVerification.configured: expected boolean");
    if (!isString(rv.health)) errors.push("runtimeVerification.health: expected string");
    if (!isObject(rv.fields)) errors.push("runtimeVerification.fields: expected object");
  }

  // Regression history.
  if (!Array.isArray(value.regressionHistory)) {
    errors.push("doc.regressionHistory: expected array");
  }

  return { ok: errors.length === 0, errors };
}
