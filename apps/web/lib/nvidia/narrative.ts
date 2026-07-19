// Release 2.3 — NVIDIA-Grounded Mission Intelligence · orchestration
// ==================================================================
// The single entry the BFF calls to attach a grounded narrative to a COMPLETED
// mission turn. It runs strictly AFTER the governed decision and the
// deterministic PersonaResponse are in hand, and it can NEVER change a governed
// fact. The required order is:
//
//   1. Build a governed, presentation-only request from the payload + the
//      deterministic PersonaResponse (business labels via missionLabels).
//   2. Ask the provider for a candidate narrative.
//   3. Validate the candidate with the deterministic grounding guard.
//   4. Present the validated narrative, OR fail closed to the deterministic
//      VentureOS baseline (built from the protected PersonaResponse).
//
// Any provider error, timeout, or guard rejection yields the deterministic
// fallback — the mission's governance and actions are unaffected either way.

import type { MissionExecutionPayload } from "../harness/types";
import type { PersonaResponse } from "../conversation/types";
import {
  actionLabel,
  permittedActionLabel,
  templateLabel,
} from "../missions/missionLabels";
import { validateGroundedNarrative } from "./grounding";
import { DEFAULT_AUDIENCE } from "./provider";
import type {
  GroundedNarrativeAttachment,
  NvidiaGroundedNarrative,
  NvidiaNarrativeProvider,
  NvidiaNarrativeRequest,
} from "./types";
import { NVIDIA_VOICE_SUMMARY_MAX_CHARS } from "./types";

export const FALLBACK_MODEL = "deterministic-fallback-v1";

const REQUESTED_OUTPUTS = [
  "whatChanged",
  "riskExplanation",
  "recommendationRationale",
  "approvalExplanation",
  "voiceSummary",
];

export interface NarrativeBuildInput {
  payload: MissionExecutionPayload;
  personaResponse: PersonaResponse;
  requestId: string;
  correlationId: string;
  approvalState?: string;
  audience?: string;
}

function verificationSummary(payload: MissionExecutionPayload): string {
  const checks = payload.verification?.checks ?? [];
  const passed = checks.filter((c) => c.passed).length;
  const total = checks.length;
  return `${passed} of ${total} governance checks passed`;
}

function signalSummary(payload: MissionExecutionPayload): string {
  const account = payload.canonicalAccount.canonicalName;
  const count = payload.evidenceRefs.length;
  return `${account} was flagged for renewal risk, supported by ${count} verified evidence records.`;
}

/** Build the governed, presentation-only request. Carries ONLY governed facts and
 * business labels — no PersonaResponse authority, no credentials. */
export function buildNarrativeRequest(input: NarrativeBuildInput): NvidiaNarrativeRequest {
  const { payload } = input;
  return {
    schemaVersion: "1.0",
    requestId: input.requestId,
    correlationId: input.correlationId,
    missionId: payload.missionId,
    missionVersion: payload.approvalRequest?.missionVersion ?? null,
    canonicalAccount: {
      ventureOsId: payload.canonicalAccount.ventureOsId,
      canonicalName: payload.canonicalAccount.canonicalName,
    },
    verifiedSignalSummary: signalSummary(payload),
    selectedMission: {
      templateId: payload.selectedTemplateId,
      businessLabel: templateLabel(payload.selectedTemplateId),
    },
    recommendation: {
      actionType: payload.recommendation.actionType,
      businessLabel: actionLabel(payload.recommendation.actionType),
      confidence: payload.recommendation.confidenceScore,
    },
    permittedActions: payload.permittedActions.map((a) => ({
      actionId: a,
      businessLabel: permittedActionLabel(a),
    })),
    verifiedEvidence: payload.evidenceRefs.map((e) => ({
      ref: e.recordId,
      category: e.category,
      summary: e.summary,
      source: e.source,
    })),
    evidenceRefs: payload.evidenceRefs.map((e) => e.recordId),
    verificationSummary: verificationSummary(payload),
    approvalState: input.approvalState ?? "awaiting_approval",
    executionMode: "simulated",
    audience: input.audience ?? DEFAULT_AUDIENCE,
    requestedOutputs: REQUESTED_OUTPUTS,
  };
}

function clampVoice(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= NVIDIA_VOICE_SUMMARY_MAX_CHARS) return clean;
  return clean.slice(0, NVIDIA_VOICE_SUMMARY_MAX_CHARS - 1).trimEnd() + "…";
}

/** The authoritative deterministic baseline, composed from the protected
 * PersonaResponse + governed facts. This is what a surface presents whenever the
 * provider fails or the grounding guard rejects the candidate. It is always safe:
 * it invents nothing and cites only supplied evidence. */
export function buildDeterministicFallback(
  request: NvidiaNarrativeRequest,
  personaResponse: PersonaResponse,
): NvidiaGroundedNarrative {
  const account = request.canonicalAccount.canonicalName;
  const evidenceCount = request.verifiedEvidence.length;
  const mission = request.selectedMission.businessLabel;
  const actions = request.permittedActions.map((a) => a.businessLabel).join(", ") || request.recommendation.businessLabel;
  const evidenceNoun = evidenceCount === 1 ? "verified evidence record" : "verified evidence records";

  return {
    schemaVersion: "1.0",
    whatChanged: `A renewal-risk signal was raised for ${account}.`,
    riskExplanation:
      `${account} is flagged at renewal risk based on ${evidenceCount} ${evidenceNoun}. ` +
      `This reflects the recorded account signals only.`,
    recommendationRationale: `VentureOS recommends the ${mission}: ${actions}.`,
    approvalExplanation:
      `You are asked to approve the ${mission} for ${account}. Every action is simulated — ` +
      `nothing will be sent and no CRM record will be changed.`,
    voiceSummary: clampVoice(personaResponse.voiceSummary),
    evidenceRefs: [...request.evidenceRefs],
    caveats: [
      "All proposed actions are simulated; no email is sent and no CRM record is changed.",
      "This is the deterministic VentureOS explanation.",
    ],
    provider: "ventureos-deterministic",
    model: FALLBACK_MODEL,
    grounded: false,
    validationStatus: "fallback",
    fallbackUsed: true,
  };
}

/** Run the full grounded-narrative pipeline: build request -> provider -> guard
 * -> present-or-fallback. NEVER throws — a failure yields the deterministic
 * baseline attachment so the completed turn is always presentable. */
export async function groundMissionNarrative(
  input: NarrativeBuildInput,
  provider: NvidiaNarrativeProvider,
): Promise<GroundedNarrativeAttachment> {
  const request = buildNarrativeRequest(input);

  let candidate: NvidiaGroundedNarrative | null = null;
  try {
    candidate = await provider.generate(request);
  } catch {
    candidate = null;
  }

  if (candidate) {
    const grounding = validateGroundedNarrative(request, candidate);
    if (grounding.valid) {
      return {
        narrative: {
          ...candidate,
          grounded: true,
          validationStatus: "grounded",
          fallbackUsed: false,
          evidenceRefs: grounding.acceptedEvidenceRefs,
        },
        grounding,
      };
    }
    // Guard rejected the candidate — fail closed to the deterministic baseline.
    const fallback = buildDeterministicFallback(request, input.personaResponse);
    return { narrative: fallback, grounding };
  }

  // Provider failed/unavailable — deterministic baseline.
  const fallback = buildDeterministicFallback(request, input.personaResponse);
  return {
    narrative: fallback,
    grounding: {
      valid: false,
      status: "fallback",
      errors: ["provider_unavailable"],
      warnings: [],
      acceptedEvidenceRefs: [...request.evidenceRefs],
      rejectedClaims: [],
    },
  };
}
