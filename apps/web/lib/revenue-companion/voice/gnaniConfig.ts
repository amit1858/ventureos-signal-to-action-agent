// VentureOS — Revenue Companion · Gnani TTS contract constants (pure)
// ===================================================================
// These constants mirror the OFFICIAL Gnani text-to-speech REST contract as
// documented at docs.gnani.ai (verified, not guessed):
//
//   POST https://api.vachana.ai/api/v1/tts/inference
//   Headers: X-API-Key-ID: <server-only GNANI_API_KEY>, Content-Type: application/json
//   Body: { text, voice, model, language, speed, audio_config{...} }
//   Success: HTTP 200, Content-Type: audio/wav (binary WAV)
//
// Gnani is a PRESENTATION ADAPTER. It only converts the deterministic,
// pre-approved briefing script into speech. It never receives, ranks, governs,
// approves, or executes anything; it cannot alter a single governed field.

export const GNANI_TTS_ENDPOINT =
  "https://api.vachana.ai/api/v1/tts/inference" as const;

export const GNANI_API_KEY_HEADER = "X-API-Key-ID" as const;

// English (India) authoritative/professional voice on the v2.5 timbre model.
export const GNANI_DEFAULT_VOICE = "Devika" as const;
export const GNANI_DEFAULT_MODEL = "timbre-v2.5" as const;
export const GNANI_DEFAULT_LANGUAGE = "en-IN" as const;
export const GNANI_DEFAULT_SPEED = 1.0 as const;

// Allow-lists — the server accepts ONLY these values from a browser request.
export const GNANI_ALLOWED_VOICES = ["Devika"] as const;
export const GNANI_ALLOWED_LANGUAGES = ["en-IN"] as const;
export const GNANI_ALLOWED_OUTPUT_FORMATS = ["wav"] as const;

export type GnaniVoice = (typeof GNANI_ALLOWED_VOICES)[number];
export type GnaniLanguage = (typeof GNANI_ALLOWED_LANGUAGES)[number];
export type GnaniOutputFormat = (typeof GNANI_ALLOWED_OUTPUT_FORMATS)[number];

// WAV / PCM audio configuration sent to Gnani.
export const GNANI_AUDIO_CONFIG = {
  sample_rate: 48000,
  num_channels: 1,
  sample_width: 2,
  encoding: "linear_pcm",
  container: "wav",
} as const;

export const GNANI_SUCCESS_CONTENT_TYPE = "audio/wav" as const;

// Defensive bounds for the server-side call. The script is already length-
// bounded upstream (VOICE_SCRIPT_MAX_CHARS); these bound the network side.
export const GNANI_REQUEST_TIMEOUT_MS = 15_000 as const;
export const GNANI_MIN_AUDIO_BYTES = 512 as const; // reject empty / stub audio
export const GNANI_MAX_AUDIO_BYTES = 8_000_000 as const; // ~8 MB safety cap

// Build the exact JSON body for a synthesis call from a trusted server script.
export function buildGnaniRequestBody(script: string): {
  text: string;
  voice: string;
  model: string;
  language: string;
  speed: number;
  audio_config: typeof GNANI_AUDIO_CONFIG;
} {
  return {
    text: script,
    voice: GNANI_DEFAULT_VOICE,
    model: GNANI_DEFAULT_MODEL,
    language: GNANI_DEFAULT_LANGUAGE,
    speed: GNANI_DEFAULT_SPEED,
    audio_config: GNANI_AUDIO_CONFIG,
  };
}
