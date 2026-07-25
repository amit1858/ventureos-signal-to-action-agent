// VentureOS — AI Assurance Center · Contract + loader (web mirror)
// ================================================================
// Dependency-free TypeScript mirror of the committed Python projection
// (`services/api/evals/ai_assurance_center_export.py`). The Trust & Governance
// screen consumes this build-time-generated JSON READ-ONLY: it never re-runs an
// engine, never calls a provider, never reaches the network, and never reads a
// file at browser runtime (the JSON is bundled at build time).
//
// Two honest, separate sources are represented and never conflated:
//   * `liveProof`  — a redacted snapshot of the REAL attended NVIDIA live proof.
//   * `reference`  — the deterministic offline reference (never shown as NVIDIA).
//
// Fail-closed invariants enforced here before render:
//   * `band.authoritative` MUST be false (the advisory column never decides).
//   * every live-proof row's `overallVerdict` MUST equal its `deterministicResult`.
//   * the advisory band value can never be a bare "PASS" unless a live proof exists.
//
// This module holds types + the validator + pure label helpers ONLY (no JSON import)
// so it stays runnable under the deterministic eval harness. The build-time JSON is
// imported by the sibling `loadAiAssuranceCenter.ts`.

export const AI_ASSURANCE_SCHEMA_VERSION = "1.0" as const;

export type DeterministicVerdict = "PASS" | "FAIL";
export type AdvisoryBandState = "PASS" | "CONCERN" | "UNAVAILABLE" | "PROVIDER_ERROR";
export type HumanReviewState = "NOT_REQUIRED" | "REVIEW_SUGGESTED" | "REVIEW_REQUIRED";
export type DimensionSource = "live_nvidia" | "reference_offline" | "not_evaluated";

export interface AssuranceBand {
  deterministicGovernance: DeterministicVerdict;
  nvidiaAdvisory: AdvisoryBandState;
  humanReview: HumanReviewState;
  provider: string;
  model: string;
  representativeScenarioId: string;
  authoritative: false;
}

export interface LiveProofRow {
  scenarioId: string;
  deterministicDimension: string;
  deterministicResult: DeterministicVerdict;
  advisoryDimension: string;
  score: number;
  maxScore: number;
  verdict: string;
  reason: string;
  authorityViolation: boolean;
  approvalViolation: boolean;
  executionClaimViolation: boolean;
  unsupportedClaimDetected: boolean;
  overallVerdict: DeterministicVerdict;
  reviewState: string;
  agreement: string;
  advisoryStatus: string;
}

export interface LiveProof {
  captured: string;
  capturedAt: string;
  commit: string;
  provider: string;
  providerLabel: string;
  model: string;
  rubricVersion: string;
  promptVersion: string;
  datasetVersion: string;
  scenarioCount: number;
  scored: number;
  providerFailures: number;
  contractFailures: number;
  disagreementCount: number;
  reviewSuggestedCount: number;
  reviewRequiredCount: number;
  results: LiveProofRow[];
}

export interface AdvisoryDimension {
  advisoryDimension: string;
  deterministicDimensions: string[];
  source: DimensionSource;
  probeScenarioId: string | null;
  score: number | null;
  maxScore: number;
  verdict: string | null;
  reason: string;
  deterministicResult: DeterministicVerdict | null;
  overallVerdict: DeterministicVerdict | null;
  reviewState: string | null;
  agreement: string | null;
}

export interface ReferenceMeta {
  provider: string;
  model: string;
  rubricVersion: string;
  promptVersion: string;
  note: string;
}

export interface AiAssuranceCenterDoc {
  schemaVersion: string;
  generatedBy: string;
  band: AssuranceBand;
  liveProof: LiveProof | null;
  reference: ReferenceMeta;
  dimensions: AdvisoryDimension[];
  deterministic: {
    verdict: DeterministicVerdict;
    passedDimensions: number;
    totalDimensions: number;
    rubricVersion: string;
  };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateAiAssuranceDoc(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) return { ok: false, errors: ["doc: expected object"] };

  const band = value.band;
  if (!isObject(band)) {
    errors.push("doc.band: expected object");
  } else {
    if (band.authoritative !== false) {
      errors.push("band.authoritative: MUST be false (advisory is never authoritative)");
    }
    if (band.deterministicGovernance !== "PASS" && band.deterministicGovernance !== "FAIL") {
      errors.push("band.deterministicGovernance: expected PASS|FAIL");
    }
    const advisoryStates = ["PASS", "CONCERN", "UNAVAILABLE", "PROVIDER_ERROR"];
    if (typeof band.nvidiaAdvisory !== "string" || !advisoryStates.includes(band.nvidiaAdvisory)) {
      errors.push("band.nvidiaAdvisory: expected PASS|CONCERN|UNAVAILABLE|PROVIDER_ERROR");
    }
    // A bare advisory PASS is only truthful when a real live proof is present.
    if (band.nvidiaAdvisory === "PASS" && value.liveProof === null) {
      errors.push("band.nvidiaAdvisory: cannot be PASS without a live NVIDIA proof");
    }
  }

  // Live proof (nullable). When present, enforce the deterministic-authority invariant.
  const lp = value.liveProof;
  if (lp !== null) {
    if (!isObject(lp) || !Array.isArray(lp.results)) {
      errors.push("doc.liveProof: expected object with results[] or null");
    } else {
      (lp.results as unknown[]).forEach((row, i) => {
        if (!isObject(row)) {
          errors.push(`liveProof.results[${i}]: expected object`);
          return;
        }
        if (row.overallVerdict !== row.deterministicResult) {
          errors.push(
            `liveProof.results[${i}]: overallVerdict (${String(row.overallVerdict)}) must equal ` +
              `deterministicResult (${String(row.deterministicResult)})`,
          );
        }
      });
    }
  }

  if (!Array.isArray(value.dimensions)) {
    errors.push("doc.dimensions: expected array");
  } else {
    value.dimensions.forEach((d, i) => {
      if (!isObject(d)) {
        errors.push(`dimensions[${i}]: expected object`);
        return;
      }
      const sources = ["live_nvidia", "reference_offline", "not_evaluated"];
      if (typeof d.source !== "string" || !sources.includes(d.source)) {
        errors.push(`dimensions[${i}].source: expected live_nvidia|reference_offline|not_evaluated`);
      }
      // Authority invariant per evaluated dimension row.
      if (d.overallVerdict != null && d.overallVerdict !== d.deterministicResult) {
        errors.push(`dimensions[${i}]: overallVerdict must equal deterministicResult`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

export function loadAiAssuranceFrom(value: unknown): AiAssuranceCenterDoc {
  const result = validateAiAssuranceDoc(value);
  if (!result.ok) {
    throw new Error(`AI Assurance Center data failed contract validation: ${result.errors.join("; ")}`);
  }
  return value as AiAssuranceCenterDoc;
}

// -- presentation helpers (pure) ---------------------------------------------

export const BAND_LABELS: {
  deterministic: Record<DeterministicVerdict, string>;
  advisory: Record<AdvisoryBandState, string>;
  review: Record<HumanReviewState, string>;
} = {
  deterministic: { PASS: "PASS", FAIL: "FAIL" },
  advisory: {
    PASS: "PASS",
    CONCERN: "Concern",
    UNAVAILABLE: "Unavailable",
    PROVIDER_ERROR: "Provider error",
  },
  review: {
    NOT_REQUIRED: "Not required",
    REVIEW_SUGGESTED: "Review suggested",
    REVIEW_REQUIRED: "Review required",
  },
};

export const DIMENSION_SOURCE_LABEL: Record<DimensionSource, string> = {
  live_nvidia: "Live NVIDIA",
  reference_offline: "Deterministic reference",
  not_evaluated: "Not evaluated",
};

export function humanizeDimension(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
