// VentureOS — Revenue Companion · STT server-only access + config gate
// ====================================================================
// The single server-side gate for the optional voice INPUT (speech-to-text)
// feature. Server-only by (1) reading bare, non-NEXT_PUBLIC_ env vars and (2) a
// hard runtime guard that throws in a browser context.
//
// STT is an INPUT PRESENTATION ADAPTER. This gate answers three questions
// truthfully and nothing more:
//   - Is voice input offered?    (companion accessible AND voice-input flag on)
//   - Is Gnani configured?       (server-only key present, non-placeholder)
//   - What is the honest label?  (never claims "live" without a real call)

import {
  GNANI_API_KEY_ENV_VAR,
  VOICE_INPUT_ENV_VAR,
  classifySttProvider,
  isGnaniConfiguredValue,
  isVoiceInputValueEnabled,
  type SttProviderClassificationValue,
} from "../voice/featureFlag";
import { isRevenueCompanionAccessible } from "../access.server";

if (typeof window !== "undefined") {
  throw new Error(
    "revenue-companion/stt/sttConfig.server must only run on the server; it must not be imported by client components.",
  );
}

export function isVoiceInputFlagEnabled(): boolean {
  return isVoiceInputValueEnabled(process.env[VOICE_INPUT_ENV_VAR]);
}

// Reports only a boolean; never returns, logs, or derives any part of the key.
export function isSttGnaniConfigured(): boolean {
  return isGnaniConfiguredValue(process.env[GNANI_API_KEY_ENV_VAR]);
}

// Voice input is offered only when the companion is accessible AND the voice-
// input flag is on. Gnani configuration is a SEPARATE axis — the feature can be
// offered while truthfully reporting that no live transcription is available.
export function isVoiceInputAccessible(): boolean {
  return isRevenueCompanionAccessible() && isVoiceInputFlagEnabled();
}

export function sttProviderClassification(): SttProviderClassificationValue {
  return classifySttProvider(
    process.env[VOICE_INPUT_ENV_VAR],
    process.env[GNANI_API_KEY_ENV_VAR],
  );
}

// The plain, serializable voice-input truth handed to the client as a prop:
// booleans + classification string only — no secret, endpoint, or key fragment.
export interface VoiceInputPresentationStatus {
  offered: boolean;
  configured: boolean;
  classification: SttProviderClassificationValue;
}

export function resolveVoiceInputPresentationStatus(): VoiceInputPresentationStatus {
  const offered = isVoiceInputAccessible();
  const configured = offered && isSttGnaniConfigured();
  return {
    offered,
    configured,
    classification: offered
      ? sttProviderClassification()
      : "voice_input_disabled",
  };
}
