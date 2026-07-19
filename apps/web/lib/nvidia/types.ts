// Release 2.3 — NVIDIA-Grounded Mission Intelligence · contracts
// ==============================================================
// Strict request/response contracts for the NVIDIA narrative layer. This layer
// is PRESENTATION-ONLY and runs strictly AFTER a governed mission decision:
//
//   Python Adaptive Mission Harness (owns decision + actions)
//     -> TypeScript BFF  (composeMissionMemory -> deterministic PersonaResponse)
//        -> NVIDIA narrative provider (this module)  [post-decision, pre-render]
//           -> deterministic grounding guard
//              -> MissionTurn (TypeScript-owned)
//
// Invariants (LOCKED):
//   * NVIDIA output NEVER changes a mission decision, template selection,
//     recommendation, permitted actions, verification, approval, or execution.
//   * The provider is given ONLY already-governed, already-verified facts.
//   * Every material narrative claim must map to a supplied evidence ref; the
//     deterministic grounding guard rejects anything else.
//   * `executionMode` is always "simulated" this release.
//   * No credentials, endpoints, or tokens are ever part of these contracts.

/** Max characters for a spoken-form summary (mirrors the Conversation Runtime
 * voice bound so every surface stays consistent). */
export const NVIDIA_VOICE_SUMMARY_MAX_CHARS = 240;

/** Which provider produced (or was asked to produce) the narrative. */
export type NvidiaProviderName = "mock" | "nim" | "ventureos-deterministic";

/** The outcome of the deterministic grounding guard for a narrative. */
export type NarrativeValidationStatus =
  | "grounded" // every material claim maps to supplied evidence; no banned claims
  | "rejected" // a guard rule failed; the narrative must not be presented
  | "malformed" // the provider returned a structurally invalid narrative
  | "fallback"; // the deterministic VentureOS baseline is being presented instead

// ---------------------------------------------------------------------------
// Request — governed, verified facts handed to the provider
// ---------------------------------------------------------------------------

/** One verified evidence item the narrative is permitted to ground claims in.
 * These are projections of already-governed evidence — never new facts. */
export interface NvidiaEvidenceInput {
  /** Canonical evidence reference (subset key for the grounding guard). */
  ref: string;
  /** Governed evidence category (e.g. account_health, renewal_timeline). */
  category: string;
  /** Short business-facing summary of the evidence. */
  summary: string;
  /** Provenance source system for the evidence. */
  source: string;
}

/** The business-labelled recommendation the mission already selected. The
 * provider may EXPLAIN it but must never alter it. */
export interface NvidiaRecommendationInput {
  actionType: string;
  businessLabel: string;
  /** Deterministic identity-resolution / recommendation confidence [0..1]. */
  confidence: number;
}

/** The strict, presentation-only request handed to a narrative provider. It
 * carries ONLY governed facts and business labels — no PersonaResponse authority,
 * no ranking inputs, no credentials. */
export interface NvidiaNarrativeRequest {
  schemaVersion: "1.0";
  requestId: string;
  correlationId: string;
  missionId: string;
  /** Approval-gate mission version, when present (traceability only). */
  missionVersion: string | null;
  canonicalAccount: { ventureOsId: string; canonicalName: string };
  /** Deterministic one-line framing of the verified signal (from the payload). */
  verifiedSignalSummary: string;
  selectedMission: { templateId: string; businessLabel: string };
  recommendation: NvidiaRecommendationInput;
  /** Business labels for the permitted (simulated) actions. */
  permittedActions: { actionId: string; businessLabel: string }[];
  /** The already-verified evidence the narrative may ground claims in. */
  verifiedEvidence: NvidiaEvidenceInput[];
  /** The canonical evidence refs (subset key). Every response evidence ref MUST
   * be drawn from this set. */
  evidenceRefs: string[];
  /** Deterministic verification framing ("3 of 3 governance checks passed"). */
  verificationSummary: string;
  /** Presentation approval state at request time (e.g. "awaiting_approval"). */
  approvalState: string;
  /** Always "simulated" this release — the provider must preserve it. */
  executionMode: "simulated";
  /** The audience the language is composed for (e.g. "business"). */
  audience: string;
  /** Which narrative fields are requested (documentation of intent). */
  requestedOutputs: string[];
}

// ---------------------------------------------------------------------------
// Response — the grounded narrative (presentation text only)
// ---------------------------------------------------------------------------

/** The grounded narrative a provider returns. It is PRESENTATION TEXT ONLY: it
 * carries no governance authority and is never trusted until the deterministic
 * grounding guard validates it. */
export interface NvidiaGroundedNarrative {
  schemaVersion: "1.0";
  /** Plain-language framing of what changed for the account. */
  whatChanged: string;
  /** Why the account is at renewal risk, grounded in the supplied evidence. */
  riskExplanation: string;
  /** Why the already-selected mission is the recommended response. */
  recommendationRationale: string;
  /** What the human is being asked to approve, including simulation assurance. */
  approvalExplanation: string;
  /** Spoken-form line (<= NVIDIA_VOICE_SUMMARY_MAX_CHARS, markdown-free). */
  voiceSummary: string;
  /** Evidence refs the narrative grounds its claims in — MUST be a subset of the
   * request `evidenceRefs`. */
  evidenceRefs: string[];
  /** Explicit caveats (e.g. simulation-only assurance). */
  caveats: string[];
  provider: NvidiaProviderName;
  model: string;
  /** True only after the grounding guard confirms the narrative. */
  grounded: boolean;
  validationStatus: NarrativeValidationStatus;
  /** True when the deterministic VentureOS baseline is presented instead. */
  fallbackUsed: boolean;
  /** OPTIONAL safe telemetry from a live provider call (server-owned). Present
   * only for the hosted NIM path; never includes secrets. */
  latencyMs?: number;
  attempts?: number;
}

/** A provider turns a governed request into a candidate narrative. Providers are
 * pure with respect to the request: identical requests must yield identical
 * candidates (the mock provider is fully deterministic; a live NIM provider is
 * declared but not implemented in this slice). */
export interface NvidiaNarrativeProvider {
  readonly name: NvidiaProviderName;
  readonly model: string;
  generate(request: NvidiaNarrativeRequest): Promise<NvidiaGroundedNarrative>;
}

// ---------------------------------------------------------------------------
// Grounding guard result
// ---------------------------------------------------------------------------

/** The deterministic guard's verdict on a candidate narrative. */
export interface GroundingResult {
  valid: boolean;
  status: NarrativeValidationStatus;
  errors: string[];
  warnings: string[];
  /** Evidence refs accepted as a valid subset of the request. */
  acceptedEvidenceRefs: string[];
  /** Human-readable descriptions of claims the guard rejected. */
  rejectedClaims: string[];
}

/** The final grounded-narrative attachment the BFF hangs on a completed turn. */
export interface GroundedNarrativeAttachment {
  narrative: NvidiaGroundedNarrative;
  grounding: GroundingResult;
}
