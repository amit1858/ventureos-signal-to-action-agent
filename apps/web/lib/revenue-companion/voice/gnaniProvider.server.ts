// VentureOS — Revenue Companion · Gnani provider (server-only)
// ============================================================
// The ONLY place a network call to Gnani is made. Server-only by a hard runtime
// guard. It takes a trusted, already-validated deterministic script and returns
// synthesized audio, or a typed, generic failure. It NEVER:
//   - fabricates audio when unconfigured (returns a typed "unconfigured" result)
//   - leaks the API key, endpoint internals, or upstream error bodies
//   - accepts or forwards any browser-supplied text (only the server script)
//   - touches governance, approval, execution, CRM, or audit

import {
  GNANI_API_KEY_HEADER,
  GNANI_MAX_AUDIO_BYTES,
  GNANI_MIN_AUDIO_BYTES,
  GNANI_REQUEST_TIMEOUT_MS,
  GNANI_SUCCESS_CONTENT_TYPE,
  GNANI_TTS_ENDPOINT,
  buildGnaniRequestBody,
} from "./gnaniConfig";
import { GNANI_API_KEY_ENV_VAR, isGnaniConfiguredValue } from "./featureFlag";

if (typeof window !== "undefined") {
  throw new Error(
    "revenue-companion/voice/gnaniProvider.server must only run on the server; it must not be imported by client components.",
  );
}

export type GnaniSynthesisResult =
  | {
      status: "ok";
      audio: Uint8Array;
      contentType: string;
      provider: "gnani_live";
    }
  | { status: "unconfigured" }
  | { status: "provider_error"; reason: string };

// Synthesize the trusted script. `reason` codes are coarse and non-sensitive.
export async function synthesizeVoice(
  script: string,
): Promise<GnaniSynthesisResult> {
  const key = process.env[GNANI_API_KEY_ENV_VAR];
  if (!isGnaniConfiguredValue(key)) {
    // Truthful: no live voice available. Never fabricate audio.
    return { status: "unconfigured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GNANI_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(GNANI_TTS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [GNANI_API_KEY_HEADER]: key as string,
      },
      body: JSON.stringify(buildGnaniRequestBody(script)),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      // Do not surface upstream status text / body — coarse code only.
      return { status: "provider_error", reason: `upstream_status_${response.status}` };
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes(GNANI_SUCCESS_CONTENT_TYPE)) {
      return { status: "provider_error", reason: "unexpected_content_type" };
    }

    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength < GNANI_MIN_AUDIO_BYTES) {
      return { status: "provider_error", reason: "audio_too_small" };
    }
    if (buffer.byteLength > GNANI_MAX_AUDIO_BYTES) {
      return { status: "provider_error", reason: "audio_too_large" };
    }

    return {
      status: "ok",
      audio: buffer,
      contentType: GNANI_SUCCESS_CONTENT_TYPE,
      provider: "gnani_live",
    };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? "timeout"
        : "network_error";
    return { status: "provider_error", reason };
  } finally {
    clearTimeout(timer);
  }
}
