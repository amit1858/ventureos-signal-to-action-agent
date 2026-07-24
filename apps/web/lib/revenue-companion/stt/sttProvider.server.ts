// VentureOS — Revenue Companion · Gnani STT provider (server-only)
// ================================================================
// The ONLY place a network call to Gnani speech-to-text is made. Server-only by
// a hard runtime guard. It takes already-validated audio bytes and returns a raw
// transcript string, or a typed, generic failure. It NEVER:
//   - fabricates a transcript when unconfigured (returns "unconfigured")
//   - leaks the API key, endpoint internals, or upstream error bodies
//   - persists the audio or the transcript
//   - touches governance, approval, execution, CRM, or audit
//   - selects an intent (that is the deterministic router's job downstream)

import {
  GNANI_STT_API_KEY_HEADER,
  GNANI_STT_ENDPOINT,
  STT_DEFAULT_LANGUAGE,
  STT_FORMAT,
  STT_REQUEST_TIMEOUT_MS,
  type SttLanguage,
  type SttMimeType,
} from "./sttContract";
import { GNANI_API_KEY_ENV_VAR, isGnaniConfiguredValue } from "../voice/featureFlag";

if (typeof window !== "undefined") {
  throw new Error(
    "revenue-companion/stt/sttProvider.server must only run on the server; it must not be imported by client components.",
  );
}

export type SttTranscriptionResult =
  | { status: "ok"; transcript: string; requestId: string | null }
  | { status: "unconfigured" }
  | { status: "provider_error"; reason: string };

// A minimal filename the multipart part needs; extension hints the container.
function filenameForMime(mime: SttMimeType): string {
  const ext = mime.includes("webm")
    ? "webm"
    : mime.includes("ogg")
      ? "ogg"
      : mime.includes("wav")
        ? "wav"
        : mime.includes("mp4")
          ? "m4a"
          : mime.includes("mpeg")
            ? "mp3"
            : mime.includes("aac")
              ? "aac"
              : mime.includes("flac")
                ? "flac"
                : "audio";
  return `question.${ext}`;
}

// Transcribe already-validated audio. `language` is constrained upstream to the
// allow-list. Coarse `reason` codes only — never sensitive.
export async function transcribeAudio(input: {
  audio: Uint8Array;
  mimeType: SttMimeType;
  language?: SttLanguage;
}): Promise<SttTranscriptionResult> {
  const key = process.env[GNANI_API_KEY_ENV_VAR];
  if (!isGnaniConfiguredValue(key)) {
    // Truthful: no live transcription available. Never fabricate a transcript.
    return { status: "unconfigured" };
  }

  const language = input.language ?? STT_DEFAULT_LANGUAGE;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STT_REQUEST_TIMEOUT_MS);
  try {
    const form = new FormData();
    const blob = new Blob([input.audio as unknown as BlobPart], {
      type: input.mimeType,
    });
    form.append("audio_file", blob, filenameForMime(input.mimeType));
    form.append("language_code", language);
    form.append("format", STT_FORMAT);

    const response = await fetch(GNANI_STT_ENDPOINT, {
      method: "POST",
      headers: {
        // Do NOT set Content-Type — fetch sets the multipart boundary itself.
        [GNANI_STT_API_KEY_HEADER]: key as string,
      },
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      // Coarse code only — never upstream status text / body.
      return { status: "provider_error", reason: `upstream_status_${response.status}` };
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return { status: "provider_error", reason: "unexpected_content_type" };
    }

    const obj = (data ?? {}) as Record<string, unknown>;
    if (obj.success !== true || typeof obj.transcript !== "string") {
      return { status: "provider_error", reason: "provider_declined" };
    }

    const requestId =
      typeof obj.request_id === "string" ? obj.request_id : null;
    return { status: "ok", transcript: obj.transcript, requestId };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? "timeout"
        : "network_error";
    return { status: "provider_error", reason };
  } finally {
    clearTimeout(timer);
    // The audio buffer is dropped when this scope exits; nothing is persisted.
  }
}
