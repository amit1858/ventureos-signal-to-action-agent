// VentureOS — Revenue Companion · STT audio validation (pure)
// ===========================================================
// Deterministic, allocation-light validation of an uploaded audio clip BEFORE
// any network call. Pure and unit-testable: it inspects only the declared MIME
// type, the byte length, and an optional declared duration. It fabricates
// nothing and reaches out to nothing. Every rejection is a coarse, non-sensitive
// reason code.

import {
  STT_ALLOWED_LANGUAGES,
  STT_ALLOWED_MIME_TYPES,
  STT_MAX_AUDIO_BYTES,
  STT_MAX_DURATION_MS,
  STT_MIN_AUDIO_BYTES,
  type SttLanguage,
  type SttMimeType,
  type SttRejectReason,
} from "./sttContract";

export type AudioValidation =
  | { ok: true; mimeType: SttMimeType; byteLength: number }
  | { ok: false; reason: SttRejectReason };

// Normalize a declared MIME type to its essence (drop `; codecs=opus` etc.),
// lower-cased and trimmed. Returns "" for anything not a non-empty string.
export function normalizeMimeType(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const essence = raw.split(";")[0];
  return essence.trim().toLowerCase();
}

export function isAllowedMimeType(raw: unknown): raw is SttMimeType {
  const essence = normalizeMimeType(raw);
  return (STT_ALLOWED_MIME_TYPES as readonly string[]).includes(essence);
}

export function isAllowedLanguage(raw: unknown): raw is SttLanguage {
  return (
    typeof raw === "string" &&
    (STT_ALLOWED_LANGUAGES as readonly string[]).includes(raw)
  );
}

// Validate the audio blob's declared type + size (+ optional duration). Order is
// deliberate: presence → type → emptiness → size → duration, so the FIRST honest
// failure is reported.
export function validateAudio(input: {
  mimeType: unknown;
  byteLength: unknown;
  durationMs?: unknown;
}): AudioValidation {
  const { mimeType, byteLength, durationMs } = input;

  if (typeof byteLength !== "number" || !Number.isFinite(byteLength)) {
    return { ok: false, reason: "missing_audio" };
  }
  if (!isAllowedMimeType(mimeType)) {
    return { ok: false, reason: "unsupported_mime" };
  }
  if (byteLength <= 0 || byteLength < STT_MIN_AUDIO_BYTES) {
    return { ok: false, reason: "empty_audio" };
  }
  if (byteLength > STT_MAX_AUDIO_BYTES) {
    return { ok: false, reason: "audio_too_large" };
  }
  if (
    typeof durationMs === "number" &&
    Number.isFinite(durationMs) &&
    durationMs > STT_MAX_DURATION_MS
  ) {
    return { ok: false, reason: "audio_too_long" };
  }

  return {
    ok: true,
    mimeType: normalizeMimeType(mimeType) as SttMimeType,
    byteLength,
  };
}
