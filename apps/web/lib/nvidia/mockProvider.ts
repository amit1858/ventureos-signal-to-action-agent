// Release 2.3 — NVIDIA-Grounded Mission Intelligence · mock provider
// ==================================================================
// A FULLY DETERMINISTIC narrative provider. Identical requests yield a
// byte-identical narrative — no clock, no randomness, no env, no network. It
// composes language ONLY from fields present on the governed request, so the
// grounding guard always accepts its output. It stands in for a live NVIDIA NIM
// model in this slice and is the reference for what a grounded narrative must be.

import type {
  NvidiaGroundedNarrative,
  NvidiaNarrativeProvider,
  NvidiaNarrativeRequest,
} from "./types";
import { NVIDIA_VOICE_SUMMARY_MAX_CHARS } from "./types";

export const MOCK_MODEL = "deterministic-grounded-narrative-v1";

function evidenceCategories(request: NvidiaNarrativeRequest): string {
  const cats = request.verifiedEvidence.map((e) => e.category.replace(/_/g, " "));
  if (cats.length === 0) return "the verified mission record";
  if (cats.length === 1) return cats[0];
  return `${cats.slice(0, -1).join(", ")} and ${cats[cats.length - 1]}`;
}

function actionLabels(request: NvidiaNarrativeRequest): string {
  const labels = request.permittedActions.map((a) => a.businessLabel);
  if (labels.length === 0) return request.recommendation.businessLabel;
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function clampVoice(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= NVIDIA_VOICE_SUMMARY_MAX_CHARS) return clean;
  return clean.slice(0, NVIDIA_VOICE_SUMMARY_MAX_CHARS - 1).trimEnd() + "…";
}

/** Build the deterministic grounded narrative from governed facts. */
export function composeMockNarrative(request: NvidiaNarrativeRequest): NvidiaGroundedNarrative {
  const account = request.canonicalAccount.canonicalName;
  const evidenceCount = request.verifiedEvidence.length;
  const categories = evidenceCategories(request);
  const actions = actionLabels(request);
  const mission = request.selectedMission.businessLabel;

  const evidenceNoun = evidenceCount === 1 ? "verified evidence record" : "verified evidence records";

  const whatChanged =
    `A renewal-risk signal was raised for ${account}. ` +
    `The supporting record covers ${categories}.`;

  const riskExplanation =
    `${account} is flagged at renewal risk based on ${evidenceCount} ${evidenceNoun} ` +
    `(${categories}). This reflects the recorded account signals only and is not a ` +
    `prediction that the renewal is certain to be lost.`;

  const recommendationRationale =
    `VentureOS recommends the ${mission}: ${actions}. ` +
    `The verified evidence supports focused renewal action for ${account} before the ` +
    `next customer milestone.`;

  const approvalExplanation =
    `You are asked to approve the ${mission} for ${account}. ` +
    `Every proposed action runs only in a controlled sandbox — nothing will be sent ` +
    `and no CRM record will be changed. Execution stays simulated even after your approval.`;

  const voiceSummary = clampVoice(
    `Renewal risk for ${account}. ${evidenceCount} ${evidenceNoun} support preparing ` +
      `renewal outreach and a stakeholder briefing. Awaiting your approval; all actions are simulated.`,
  );

  return {
    schemaVersion: "1.0",
    whatChanged,
    riskExplanation,
    recommendationRationale,
    approvalExplanation,
    voiceSummary,
    evidenceRefs: [...request.evidenceRefs],
    caveats: [
      "All proposed actions are simulated; no email is sent and no CRM record is changed.",
      "This explanation is grounded only in the verified evidence supplied by the mission.",
    ],
    provider: "mock",
    model: MOCK_MODEL,
    grounded: true,
    validationStatus: "grounded",
    fallbackUsed: false,
  };
}

/** The deterministic mock provider used in place of a live NVIDIA NIM model. */
export const mockNarrativeProvider: NvidiaNarrativeProvider = {
  name: "mock",
  model: MOCK_MODEL,
  generate(request: NvidiaNarrativeRequest): Promise<NvidiaGroundedNarrative> {
    return Promise.resolve(composeMockNarrative(request));
  },
};
