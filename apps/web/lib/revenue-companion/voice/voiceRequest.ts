// VentureOS — Revenue Companion · Voice briefing request contract (pure)
// ======================================================================
// A browser voice request carries NO free text. It references a briefing the
// server already produced deterministically, by:
//   - narrativeId            (the journey key, e.g. "journey-a")
//   - presentationVersion    (companion schema version)
//   - approvedTextFingerprint(fingerprint of the exact server-built script)
//   - voiceId / language / outputFormat (from fixed allow-lists)
//
// The server independently rebuilds the script for `narrativeId` from the
// immutable generated data, recomputes the fingerprint, and refuses to speak
// anything whose fingerprint does not match. This makes it impossible for a
// caller to inject or mutate spoken words — the request selects, never dictates.

import {
  GNANI_ALLOWED_LANGUAGES,
  GNANI_ALLOWED_OUTPUT_FORMATS,
  GNANI_ALLOWED_VOICES,
  GNANI_DEFAULT_LANGUAGE,
  GNANI_DEFAULT_VOICE,
} from "./gnaniConfig";
import type { RevenueCompanionViewModel } from "../companionContract";
import { SCRIPT_FINGERPRINT_PREFIX } from "../companionContract";

export interface VoiceBriefingRequest {
  narrativeId: string;
  presentationVersion: string;
  approvedTextFingerprint: string;
  voiceId: string;
  language: string;
  outputFormat: string;
}

// A minimal trusted reference the server derives by rebuilding + validating the
// companion for the requested journey. The request must match it exactly.
export interface TrustedVoiceReference {
  narrativeId: string;
  presentationVersion: string;
  approvedTextFingerprint: string;
}

// The ONLY keys a well-formed request may carry. Anything else (notably a
// smuggled `text`/`script`/`ssml` field) is rejected.
const ALLOWED_REQUEST_KEYS: ReadonlySet<string> = new Set([
  "narrativeId",
  "presentationVersion",
  "approvedTextFingerprint",
  "voiceId",
  "language",
  "outputFormat",
]);

export function buildVoiceBriefingRequest(
  vm: RevenueCompanionViewModel,
): VoiceBriefingRequest {
  return {
    narrativeId: vm.narrativeId,
    presentationVersion: vm.presentationVersion,
    approvedTextFingerprint: vm.approvedTextFingerprint,
    voiceId: GNANI_DEFAULT_VOICE,
    language: GNANI_DEFAULT_LANGUAGE,
    outputFormat: "wav",
  };
}

export type VoiceRequestValidation =
  | { ok: true; request: VoiceBriefingRequest }
  | { ok: false; reason: string };

// Parse + validate an untrusted request object (already JSON-parsed) against a
// trusted reference. Fails closed on any deviation.
export function validateVoiceBriefingRequest(
  raw: unknown,
  trusted: TrustedVoiceReference,
): VoiceRequestValidation {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "request_not_object" };
  }
  const obj = raw as Record<string, unknown>;

  // Reject any unexpected key — especially free text.
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_REQUEST_KEYS.has(key)) {
      return { ok: false, reason: `unexpected_field:${key}` };
    }
  }

  const narrativeId = obj.narrativeId;
  const presentationVersion = obj.presentationVersion;
  const approvedTextFingerprint = obj.approvedTextFingerprint;
  const voiceId = obj.voiceId ?? GNANI_DEFAULT_VOICE;
  const language = obj.language ?? GNANI_DEFAULT_LANGUAGE;
  const outputFormat = obj.outputFormat ?? "wav";

  if (typeof narrativeId !== "string" || narrativeId.length === 0) {
    return { ok: false, reason: "narrativeId_invalid" };
  }
  if (typeof presentationVersion !== "string") {
    return { ok: false, reason: "presentationVersion_invalid" };
  }
  if (
    typeof approvedTextFingerprint !== "string" ||
    !approvedTextFingerprint.startsWith(SCRIPT_FINGERPRINT_PREFIX)
  ) {
    return { ok: false, reason: "fingerprint_invalid" };
  }
  if (typeof voiceId !== "string" || !GNANI_ALLOWED_VOICES.includes(voiceId as never)) {
    return { ok: false, reason: "voice_not_allowed" };
  }
  if (
    typeof language !== "string" ||
    !GNANI_ALLOWED_LANGUAGES.includes(language as never)
  ) {
    return { ok: false, reason: "language_not_allowed" };
  }
  if (
    typeof outputFormat !== "string" ||
    !GNANI_ALLOWED_OUTPUT_FORMATS.includes(outputFormat as never)
  ) {
    return { ok: false, reason: "format_not_allowed" };
  }

  // Cross-check against the trusted, server-rebuilt reference.
  if (narrativeId !== trusted.narrativeId) {
    return { ok: false, reason: "narrativeId_mismatch" };
  }
  if (presentationVersion !== trusted.presentationVersion) {
    return { ok: false, reason: "presentationVersion_mismatch" };
  }
  if (approvedTextFingerprint !== trusted.approvedTextFingerprint) {
    return { ok: false, reason: "fingerprint_mismatch" };
  }

  return {
    ok: true,
    request: {
      narrativeId,
      presentationVersion,
      approvedTextFingerprint,
      voiceId,
      language,
      outputFormat,
    },
  };
}
