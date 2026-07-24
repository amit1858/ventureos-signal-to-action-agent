// VentureOS — Revenue Companion · Voice playback + flag predicates eval
// =====================================================================
// Pure, dependency-free proof of the voice playback state machine and the
// server-only flag/key predicates. No DOM, no audio, no network, no env writes
// beyond local reads of pure functions.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/revenue-companion/eval/voicePlayback.eval.ts

import {
  initialPlaybackState,
  reducePlayback,
  requiresFetch,
  type VoicePlaybackState,
} from "../voice/playbackState";
import {
  VOICE_BRIEFING_ENV_VAR,
  GNANI_API_KEY_ENV_VAR,
  classifyVoiceProvider,
  isGnaniConfiguredValue,
  isVoiceBriefingValueEnabled,
} from "../voice/featureFlag";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

// ===========================================================================
console.log("\n[1] Server-only flag + key env var names");
// ===========================================================================
{
  check("voice flag is the bare server-only VENTUREOS_VOICE_BRIEFING",
    VOICE_BRIEFING_ENV_VAR === "VENTUREOS_VOICE_BRIEFING" &&
    !VOICE_BRIEFING_ENV_VAR.startsWith("NEXT_PUBLIC_"));
  check("key is the bare server-only GNANI_API_KEY",
    GNANI_API_KEY_ENV_VAR === "GNANI_API_KEY" &&
    !GNANI_API_KEY_ENV_VAR.startsWith("NEXT_PUBLIC_"));
}

// ===========================================================================
console.log("\n[2] Flag predicate fails closed");
// ===========================================================================
{
  check("disabled when absent", isVoiceBriefingValueEnabled(undefined) === false);
  check("disabled when 'false'", isVoiceBriefingValueEnabled("false") === false);
  check("disabled when '1'", isVoiceBriefingValueEnabled("1") === false);
  check("disabled when 'TRUE' (case-sensitive)", isVoiceBriefingValueEnabled("TRUE") === false);
  check("enabled only when exactly 'true'", isVoiceBriefingValueEnabled("true") === true);
}

// ===========================================================================
console.log("\n[3] Key configured predicate (emptiness + placeholders only)");
// ===========================================================================
{
  check("unconfigured when undefined", isGnaniConfiguredValue(undefined) === false);
  check("unconfigured when empty", isGnaniConfiguredValue("") === false);
  check("unconfigured when whitespace", isGnaniConfiguredValue("   ") === false);
  check("unconfigured when placeholder 'changeme'", isGnaniConfiguredValue("changeme") === false);
  check("unconfigured when placeholder 'your-api-key'", isGnaniConfiguredValue("your-api-key") === false);
  check("configured with a real-looking value", isGnaniConfiguredValue("gk_live_abc123") === true);
}

// ===========================================================================
console.log("\n[4] Provider classification never claims 'live'");
// ===========================================================================
{
  check("flag off → voice_disabled", classifyVoiceProvider("false", "gk_x") === "voice_disabled");
  check("flag on + no key → gnani_unconfigured", classifyVoiceProvider("true", "") === "gnani_unconfigured");
  check("flag on + key → gnani_configured_unverified", classifyVoiceProvider("true", "gk_x") === "gnani_configured_unverified");
  // There is deliberately no path to a "gnani_live" classification here.
  const all = new Set([
    classifyVoiceProvider("true", "gk_x"),
    classifyVoiceProvider("true", ""),
    classifyVoiceProvider("false", "gk_x"),
  ]);
  check("classification never asserts 'gnani_live' pre-call", !all.has("gnani_live" as never));
}

// ===========================================================================
console.log("\n[5] Playback state machine");
// ===========================================================================
{
  check("initial idle when configured", initialPlaybackState(true) === "idle");
  check("initial unavailable when not configured", initialPlaybackState(false) === "unavailable");

  // Happy path: idle -> loading -> playing -> paused -> playing -> completed.
  let s: VoicePlaybackState = "idle";
  s = reducePlayback(s, { type: "play" });
  check("play → loading", s === "loading");
  check("loading requires a fetch", requiresFetch(s) === true);
  s = reducePlayback(s, { type: "audio_ready" });
  check("audio_ready → playing", s === "playing");
  s = reducePlayback(s, { type: "pause" });
  check("pause → paused", s === "paused");
  s = reducePlayback(s, { type: "resume" });
  check("resume → playing", s === "playing");
  s = reducePlayback(s, { type: "ended" });
  check("ended → completed", s === "completed");

  // Replay from completed re-fetches.
  s = reducePlayback(s, { type: "replay" });
  check("replay → loading", s === "loading");
  check("replay requires a fetch", requiresFetch(s) === true);

  // Never fabricate 'playing' without an audio_ready event.
  check("audio_ready is a no-op from idle", reducePlayback("idle", { type: "audio_ready" }) === "idle");
  check("ended is a no-op from idle", reducePlayback("idle", { type: "ended" }) === "idle");

  // Failure + unavailable are honest terminal-ish states.
  check("fail from loading → error", reducePlayback("loading", { type: "fail" }) === "error");
  check("mark_unavailable from anywhere → unavailable", reducePlayback("playing", { type: "mark_unavailable" }) === "unavailable");
  check("unavailable is sticky", reducePlayback("unavailable", { type: "play" }) === "unavailable");
  check("only loading requires a fetch", !requiresFetch("playing") && !requiresFetch("idle") && !requiresFetch("error"));
}

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Revenue Companion voice playback eval: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All Revenue Companion voice playback checks passed.");
console.log("=".repeat(70));
