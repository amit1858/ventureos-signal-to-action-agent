// VentureOS — Revenue Companion · Voice server-only access gate
// =============================================================
// The single server-side gate for the optional voice briefing. Server-only by
// (1) reading bare, non-`NEXT_PUBLIC_` env vars (never inlined into the browser
// bundle) and (2) a hard runtime guard that throws in a browser context.
//
// The voice briefing is a PRESENTATION ADAPTER only. This gate answers three
// questions truthfully and nothing more:
//   - Is the voice feature offered?      (companion accessible AND voice flag on)
//   - Is Gnani configured?               (server-only key present, non-placeholder)
//   - What is the honest provider label? (never claims "live" without a real call)

import {
  GNANI_API_KEY_ENV_VAR,
  VOICE_BRIEFING_ENV_VAR,
  classifyVoiceProvider,
  isGnaniConfiguredValue,
  isVoiceBriefingValueEnabled,
  type VoiceProviderClassification,
} from "./featureFlag";
import { isRevenueCompanionAccessible } from "../access.server";

if (typeof window !== "undefined") {
  throw new Error(
    "revenue-companion/voice/access.server must only run on the server; it must not be imported by client components.",
  );
}

export function isVoiceBriefingFlagEnabled(): boolean {
  return isVoiceBriefingValueEnabled(process.env[VOICE_BRIEFING_ENV_VAR]);
}

// Whether Gnani has a usable server-only key. This ONLY reports a boolean; it
// never returns, logs, or derives any part of the key value.
export function isGnaniConfigured(): boolean {
  return isGnaniConfiguredValue(process.env[GNANI_API_KEY_ENV_VAR]);
}

// The voice briefing is offered only when the companion itself is accessible
// AND the voice flag is on. Gnani configuration is a SEPARATE axis — the feature
// can be offered while truthfully reporting that no live voice is available.
export function isVoiceBriefingAccessible(): boolean {
  return isRevenueCompanionAccessible() && isVoiceBriefingFlagEnabled();
}

// Truthful classification for the UI. Never "gnani_live" here — that is only
// asserted after a successful server-side synthesis call.
export function voiceProviderClassification(): VoiceProviderClassification {
  return classifyVoiceProvider(
    process.env[VOICE_BRIEFING_ENV_VAR],
    process.env[GNANI_API_KEY_ENV_VAR],
  );
}

// The plain, serializable voice presentation truth handed to the client as a
// prop. It contains booleans and a classification string only — no secret, no
// endpoint, no key fragment.
export interface VoicePresentationStatus {
  offered: boolean;
  configured: boolean;
  classification: VoiceProviderClassification;
}

export function resolveVoicePresentationStatus(): VoicePresentationStatus {
  const offered = isVoiceBriefingAccessible();
  const configured = offered && isGnaniConfigured();
  return {
    offered,
    configured,
    classification: offered
      ? voiceProviderClassification()
      : "voice_disabled",
  };
}
