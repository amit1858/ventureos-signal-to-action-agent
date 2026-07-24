// VentureOS — Revenue Companion · Voice briefing orchestrator (server-only)
// =========================================================================
// Ties the request contract, the trusted script rebuild, and the Gnani provider
// together for the API route. The browser NEVER supplies spoken text: it names a
// journey + fingerprint, and the server rebuilds the exact deterministic script
// from the immutable generated data, re-validates it, verifies the fingerprint,
// and only then synthesizes. Any mismatch fails closed with a generic reason.

import {
  VOICE_SCRIPT_MAX_CHARS,
  buildValidatedCompanion,
  computeScriptFingerprint,
  scanVoiceScript,
  type RevenueCompanionViewModel,
} from "../companionContract";
import { loadDemoJourneys } from "../../demo-mode/loadDemoJourney";
import { resolveCompanionNarrative } from "../narrativeAdapter.server";
import {
  isVoiceBriefingAccessible,
  isGnaniConfigured,
} from "./access.server";
import {
  validateVoiceBriefingRequest,
  type TrustedVoiceReference,
} from "./voiceRequest";
import { synthesizeVoice } from "./gnaniProvider.server";
import { isGuidedIntent, type GuidedIntent } from "../guided/intentRouter";
import { composeAnswerForIntent } from "../answerComposer";
import { composeSnapshotAnswerForIntent } from "../snapshotComposer";
import {
  snapshotHasPresentation,
  validateSnapshot,
} from "../actionCenterSnapshot";
import { computeAnswerFingerprint } from "../answerContract";

if (typeof window !== "undefined") {
  throw new Error(
    "revenue-companion/voice/voiceBriefing.server must only run on the server; it must not be imported by client components.",
  );
}

export type VoiceBriefingOutcome =
  | {
      status: "ok";
      audio: Uint8Array;
      contentType: string;
    }
  | { status: "forbidden" } // voice not offered
  | { status: "bad_request"; reason: string }
  | { status: "unconfigured" } // offered but Gnani has no key
  | { status: "provider_error"; reason: string };

// Rebuild the trusted companion for a journey key from immutable data.
function rebuildCompanion(
  narrativeId: string,
): RevenueCompanionViewModel | null {
  const doc = loadDemoJourneys();
  const journey = doc.journeys.find((j) => j.key === narrativeId);
  if (!journey) return null;
  const resolved = resolveCompanionNarrative(journey.view);
  return buildValidatedCompanion(
    journey.view,
    { journeyKey: journey.key, journeyTitle: journey.title },
    resolved,
  );
}

export async function handleVoiceBriefing(
  rawBody: unknown,
): Promise<VoiceBriefingOutcome> {
  // 1. Feature gate — fail closed when the voice briefing is not offered.
  if (!isVoiceBriefingAccessible()) {
    return { status: "forbidden" };
  }

  // 2. Peek the body defensively.
  if (
    typeof rawBody !== "object" ||
    rawBody === null ||
    Array.isArray(rawBody)
  ) {
    return { status: "bad_request", reason: "body_not_object" };
  }
  const body = rawBody as Record<string, unknown>;

  // 2a. Parse the optional per-intent mode (Phase 3.2). Both modes recompose the
  //     spoken text server-side; the browser can never dictate the words.
  const intentRaw = body.intent;
  let intent: GuidedIntent | undefined;
  if (intentRaw !== undefined) {
    if (!isGuidedIntent(intentRaw)) {
      return { status: "bad_request", reason: "intent_not_allowed" };
    }
    intent = intentRaw;
  }

  let script: string;
  let approvedFingerprint: string;
  let trusted: TrustedVoiceReference;

  if (body.presentationSnapshot !== undefined) {
    // 2b. Snapshot-bound voice (Phase 3.2A): recompose the spoken text FROM the
    //     live Action Center snapshot, so Gnani reads exactly what is on screen.
    if (!intent) {
      return { status: "bad_request", reason: "snapshot_requires_intent" };
    }
    const validated = validateSnapshot(body.presentationSnapshot);
    if (!validated.ok) {
      return { status: "bad_request", reason: `snapshot_${validated.reason}` };
    }
    const snapshot = validated.snapshot;
    if (!snapshotHasPresentation(snapshot)) {
      return { status: "bad_request", reason: "snapshot_empty" };
    }
    let expected: string;
    try {
      const answer = composeSnapshotAnswerForIntent(snapshot, intent);
      script = answer.spokenText;
      approvedFingerprint = answer.fingerprint;
      expected = computeAnswerFingerprint(answer);
    } catch {
      return { status: "bad_request", reason: "answer_composition_failed" };
    }
    if (expected !== approvedFingerprint) {
      return { status: "bad_request", reason: "fingerprint_recompute_mismatch" };
    }
    trusted = {
      narrativeId: snapshot.snapshotId,
      presentationVersion: snapshot.presentationVersion,
      approvedTextFingerprint: approvedFingerprint,
      intent,
    };
  } else {
    // 2c. Canonical journey mode — the whole briefing, or a per-intent answer
    //     composed from the immutable generated data.
    if (typeof body.narrativeId !== "string") {
      return { status: "bad_request", reason: "narrativeId_invalid" };
    }
    const narrativeId = body.narrativeId;
    const vm = rebuildCompanion(narrativeId);
    if (!vm) {
      return { status: "bad_request", reason: "unknown_narrative" };
    }
    if (intent) {
      let expected: string;
      try {
        const answer = composeAnswerForIntent(vm, intent);
        script = answer.spokenText;
        approvedFingerprint = answer.fingerprint;
        expected = computeAnswerFingerprint(answer);
      } catch {
        return { status: "bad_request", reason: "answer_composition_failed" };
      }
      if (expected !== approvedFingerprint) {
        return { status: "bad_request", reason: "fingerprint_recompute_mismatch" };
      }
    } else {
      script = vm.voiceScript;
      approvedFingerprint = vm.approvedTextFingerprint;
      if (computeScriptFingerprint(script) !== approvedFingerprint) {
        return { status: "bad_request", reason: "fingerprint_recompute_mismatch" };
      }
    }
    trusted = {
      narrativeId: vm.narrativeId,
      presentationVersion: vm.presentationVersion,
      approvedTextFingerprint: approvedFingerprint,
      ...(intent ? { intent } : {}),
    };
  }

  // 3. Validate the request against the trusted, server-rebuilt reference.
  const validation = validateVoiceBriefingRequest(rawBody, trusted);
  if (!validation.ok) {
    return { status: "bad_request", reason: validation.reason };
  }

  // 4. Defense in depth: the script is the SERVER's, never the browser's. Verify
  //    length bound and forbidden-token scan one more time.
  if (script.length === 0 || script.length > VOICE_SCRIPT_MAX_CHARS) {
    return { status: "bad_request", reason: "script_length" };
  }
  if (scanVoiceScript(script) !== null) {
    return { status: "bad_request", reason: "script_forbidden_token" };
  }

  // 5. If Gnani is not configured, say so truthfully — never fabricate audio.
  if (!isGnaniConfigured()) {
    return { status: "unconfigured" };
  }

  // 6. Synthesize the trusted script.
  const result = await synthesizeVoice(script);
  if (result.status === "ok") {
    return { status: "ok", audio: result.audio, contentType: result.contentType };
  }
  if (result.status === "unconfigured") {
    return { status: "unconfigured" };
  }
  return { status: "provider_error", reason: result.reason };
}
