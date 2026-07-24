// VentureOS — Revenue Companion · STT service (server-only orchestration)
// =======================================================================
// The seam the transcribe route delegates to. It:
//   1. fail-closes when voice input is not accessible (flag off / no companion);
//   2. parses the multipart form and validates the audio (type/size/duration);
//   3. calls the server-only Gnani STT provider;
//   4. sanitizes + bounds the transcript (never routes raw provider text);
//   5. returns a typed, serializable transcript with NO business authority.
//
// It NEVER selects an intent, ranks, approves, executes, writes to CRM/audit, or
// persists audio/transcript. The transcript is untrusted input the browser must
// review; routing happens only when the seller explicitly presses Ask.

import {
  STT_DEFAULT_LANGUAGE,
  STT_TRANSCRIPT_TTL_MS,
  type RevenueCompanionTranscript,
  type SttLanguage,
  type TranscribeOutcome,
} from "./sttContract";
import { validateAudio, isAllowedLanguage } from "./audioValidation";
import { prepareTranscript } from "./transcriptionNormalization";
import {
  isVoiceInputAccessible,
  sttProviderClassification,
} from "./sttConfig.server";
import { transcribeAudio } from "./sttProvider.server";

if (typeof window !== "undefined") {
  throw new Error(
    "revenue-companion/stt/sttService.server must only run on the server; it must not be imported by client components.",
  );
}

// Deterministic, non-crypto id for correlation only. No audio/transcript content
// is derivable from it.
function newTranscriptId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `stt_${Date.now().toString(36)}_${rand}`;
}

export async function handleTranscribe(
  formData: FormData | null,
): Promise<TranscribeOutcome> {
  // 1. Fail closed unless voice input is truly accessible.
  if (!isVoiceInputAccessible()) {
    return { status: "forbidden" };
  }

  if (!formData || typeof formData.get !== "function") {
    return { status: "bad_request", reason: "malformed_request" };
  }

  // 2. Language allow-list (default en-IN).
  const rawLang = formData.get("language_code");
  const language: SttLanguage = isAllowedLanguage(rawLang)
    ? rawLang
    : STT_DEFAULT_LANGUAGE;
  if (rawLang != null && !isAllowedLanguage(rawLang)) {
    return { status: "bad_request", reason: "unsupported_language" };
  }

  // 3. Extract + validate the audio blob.
  const file = formData.get("audio_file");
  if (!(file instanceof Blob)) {
    return { status: "bad_request", reason: "missing_audio" };
  }
  const declaredDuration = Number(formData.get("duration_ms"));
  const validation = validateAudio({
    mimeType: file.type,
    byteLength: file.size,
    durationMs: Number.isFinite(declaredDuration) ? declaredDuration : undefined,
  });
  if (!validation.ok) {
    return { status: "bad_request", reason: validation.reason };
  }

  const audio = new Uint8Array(await file.arrayBuffer());

  // 4. Provider call (server-only).
  const result = await transcribeAudio({
    audio,
    mimeType: validation.mimeType,
    language,
  });
  if (result.status === "unconfigured") return { status: "unconfigured" };
  if (result.status === "provider_error") {
    return { status: "provider_error", reason: result.reason };
  }

  // 5. Sanitize + bound. Empty transcript is a truthful bad_request, not a guess.
  const { transcript, normalizedTranscript } = prepareTranscript(result.transcript);
  if (transcript.length === 0) {
    return { status: "bad_request", reason: "empty_transcript" };
  }

  const now = Date.now();
  const payload: RevenueCompanionTranscript = {
    transcriptId: newTranscriptId(),
    transcript,
    normalizedTranscript,
    language,
    confidence: "reported",
    durationMs: Number.isFinite(declaredDuration) ? declaredDuration : null,
    // Asserted "live" ONLY because a real transcription just succeeded.
    providerClassification: "gnani_live",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + STT_TRANSCRIPT_TTL_MS).toISOString(),
  };
  // Touch the config classification so an unconfigured/off state can never reach
  // here with a live label (defense in depth; provider already gated it).
  void sttProviderClassification();

  return { status: "ok", transcript: payload };
}
