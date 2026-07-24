// VentureOS — Revenue Companion · Gnani Speech-to-Text contract constants (pure)
// ==============================================================================
// These constants mirror the OFFICIAL Gnani Vachana speech-to-text REST contract
// as documented at docs.gnani.ai/vachana/STT/speech-to-text (verified, not
// guessed):
//
//   POST https://api.vachana.ai/stt/v3
//   Headers: X-API-Key-ID: <server-only GNANI_API_KEY>
//   Body: multipart/form-data { audio_file, language_code, format, itn_native_numerals }
//   Success: HTTP 200 JSON { success, request_id, timestamp, transcript }
//   Errors:  400 (bad request) | 429 (rate limit) | 500 (server) | 503 (unavailable)
//
// Gnani STT is an INPUT PRESENTATION ADAPTER. It only turns a seller's spoken
// question into text. The transcript is UNTRUSTED input that is then routed
// through the existing bounded deterministic intent router. STT never ranks,
// prioritizes, governs, approves, executes, or writes to CRM/audit/ledger, and
// it never selects the intent itself.

export const GNANI_STT_ENDPOINT =
  "https://api.vachana.ai/stt/v3" as const;

// Same credential header as the TTS side — one Gnani Prisma v2.5 key, server-only.
export const GNANI_STT_API_KEY_HEADER = "X-API-Key-ID" as const;

// English (India) — matches the TTS voice locale. Bounded allow-list.
export const STT_DEFAULT_LANGUAGE = "en-IN" as const;
export const STT_ALLOWED_LANGUAGES = ["en-IN"] as const;
export type SttLanguage = (typeof STT_ALLOWED_LANGUAGES)[number];

// "transcribe" enables Inverse Text Normalization (numbers/dates in conventional
// form). We use verbatim-friendly normalization ourselves, but ITN is harmless
// for short spoken questions and improves numeric phrasing.
export const STT_FORMAT = "transcribe" as const;

// Accepted browser upload MIME types. MediaRecorder in Chromium emits webm/opus;
// Gnani accepts a set of common formats. We keep a strict allow-list and reject
// everything else before any network call.
export const STT_ALLOWED_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/mpeg",
  "audio/aac",
  "audio/flac",
] as const;
export type SttMimeType = (typeof STT_ALLOWED_MIME_TYPES)[number];

// Provider ceiling is 60s (ideal <=30s). We cap recording at 20s client-side and
// enforce a hard server ceiling here as defense in depth.
export const STT_MAX_DURATION_MS = 30_000 as const;
export const STT_CLIENT_MAX_DURATION_MS = 20_000 as const;

// Audio payload bounds. Empty/near-empty audio is rejected; oversized is rejected
// before the provider call. ~8 MB matches the TTS-side safety ceiling.
export const STT_MIN_AUDIO_BYTES = 512 as const;
export const STT_MAX_AUDIO_BYTES = 8_000_000 as const;

// Network bound for the synchronous transcription call.
export const STT_REQUEST_TIMEOUT_MS = 20_000 as const;

// Bound the transcript we accept back from the provider. A spoken question is
// short; anything longer is truncated by the normalizer, never routed raw.
export const STT_MAX_TRANSCRIPT_CHARS = 400 as const;

// A short TTL so the client never treats a transcript as durable state. This is
// presentation metadata only — no audio or transcript is persisted server-side.
export const STT_TRANSCRIPT_TTL_MS = 300_000 as const;

// The normalized, serializable transcript handed back to the browser. It carries
// NO business authority: no recommendation, intent, ranking, governance, or
// approval field can ever appear here.
export interface RevenueCompanionTranscript {
  transcriptId: string;
  transcript: string;
  normalizedTranscript: string;
  language: SttLanguage;
  // Gnani's REST response does not include a numeric confidence; we surface a
  // coarse, honest classification instead of fabricating a score.
  confidence: "reported" | "unknown";
  durationMs: number | null;
  providerClassification: SttProviderClassification;
  createdAt: string;
  expiresAt: string;
}

// Truthful provider state for the UI. "gnani_live" is asserted ONLY after a real
// successful transcription — never derived from config alone.
export type SttProviderClassification =
  | "voice_input_disabled"
  | "gnani_unconfigured"
  | "gnani_configured_unverified"
  | "gnani_live";

// Coarse, non-sensitive rejection reasons. These never leak provider internals,
// endpoints, keys, or upstream error bodies.
export type SttRejectReason =
  | "missing_audio"
  | "empty_audio"
  | "audio_too_large"
  | "audio_too_long"
  | "unsupported_mime"
  | "unsupported_language"
  | "malformed_request"
  | "empty_transcript";

// The service-level outcome the route maps to an HTTP response.
export type TranscribeOutcome =
  | { status: "ok"; transcript: RevenueCompanionTranscript }
  | { status: "forbidden" }
  | { status: "unconfigured" }
  | { status: "bad_request"; reason: SttRejectReason }
  | { status: "provider_error"; reason: string };
