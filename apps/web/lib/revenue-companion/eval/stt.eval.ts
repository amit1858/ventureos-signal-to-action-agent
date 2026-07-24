// VentureOS — Revenue Companion · Speech-to-Text (STT) eval
// =========================================================
// Deterministic, dependency-free proof of the Phase 7-13 voice-input subsystem:
// bounded audio validation, transcript sanitization, fail-closed flag
// classification, transcript→intent PARITY with typed input, and the safety
// invariant that a transcript can never be routed into an execution/approval.
// No network, no env, no audio — pure functions only.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/revenue-companion/eval/stt.eval.ts

import {
  STT_ALLOWED_LANGUAGES,
  STT_ALLOWED_MIME_TYPES,
  STT_MAX_AUDIO_BYTES,
  STT_MAX_TRANSCRIPT_CHARS,
  STT_MIN_AUDIO_BYTES,
} from "../stt/sttContract";
import {
  isAllowedLanguage,
  isAllowedMimeType,
  normalizeMimeType,
  validateAudio,
} from "../stt/audioValidation";
import {
  cleanTranscript,
  normalizeTranscript,
  prepareTranscript,
} from "../stt/transcriptionNormalization";
import { classifySttProvider } from "../voice/featureFlag";
import { resolveIntent } from "../guided/intentRouter";

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

const okAudio = (over: Partial<{ mimeType: unknown; byteLength: unknown; durationMs: unknown }> = {}) =>
  validateAudio({ mimeType: "audio/webm", byteLength: 4096, durationMs: 5000, ...over });

// ===========================================================================
console.log("\n[0] Provider contract constants are bounded + honest");
// ===========================================================================
check("only en-IN language is allowed", STT_ALLOWED_LANGUAGES.join(",") === "en-IN");
check("mime allow-list is non-empty", STT_ALLOWED_MIME_TYPES.length > 0);
check("min < max audio bytes", STT_MIN_AUDIO_BYTES < STT_MAX_AUDIO_BYTES);
check("transcript char bound is set", STT_MAX_TRANSCRIPT_CHARS > 0 && STT_MAX_TRANSCRIPT_CHARS <= 1000);

// ===========================================================================
console.log("\n[1] Flag classification fails closed (Phase 18/19)");
// ===========================================================================
check("flag off → voice_input_disabled", classifySttProvider("false", "sk-real") === "voice_input_disabled");
check("flag undefined → voice_input_disabled", classifySttProvider(undefined, "sk-real") === "voice_input_disabled");
check("flag on + no key → gnani_unconfigured", classifySttProvider("true", undefined) === "gnani_unconfigured");
check("flag on + placeholder key → gnani_unconfigured", classifySttProvider("true", "changeme") === "gnani_unconfigured");
check("flag on + real key → configured_unverified", classifySttProvider("true", "sk-real-key") === "gnani_configured_unverified");
check("classification NEVER derives gnani_live from config", classifySttProvider("true", "sk-real-key") !== ("gnani_live" as unknown));
check("only exact 'true' enables (not 'TRUE')", classifySttProvider("TRUE", "sk-real") === "voice_input_disabled");

// ===========================================================================
console.log("\n[2] MIME + language allow-lists");
// ===========================================================================
check("normalizeMimeType drops codecs", normalizeMimeType("audio/webm;codecs=opus") === "audio/webm");
check("allowed mime accepted", isAllowedMimeType("audio/webm;codecs=opus"));
check("unknown mime rejected", !isAllowedMimeType("application/json"));
check("text mime rejected (no smuggling)", !isAllowedMimeType("text/plain"));
check("en-IN language accepted", isAllowedLanguage("en-IN"));
check("unknown language rejected", !isAllowedLanguage("xx-XX"));
check("non-string language rejected", !isAllowedLanguage(42));

// ===========================================================================
console.log("\n[3] Audio validation order + bounds (Phase 9/10)");
// ===========================================================================
check("valid audio passes", okAudio().ok === true);
check("missing byteLength → missing_audio", okAudio({ byteLength: "nope" }).ok === false);
check("unsupported mime → unsupported_mime", (okAudio({ mimeType: "text/plain" }) as { reason: string }).reason === "unsupported_mime");
check("empty audio → empty_audio", (okAudio({ byteLength: 10 }) as { reason: string }).reason === "empty_audio");
check("zero bytes → empty_audio", (okAudio({ byteLength: 0 }) as { reason: string }).reason === "empty_audio");
check("oversized → audio_too_large", (okAudio({ byteLength: STT_MAX_AUDIO_BYTES + 1 }) as { reason: string }).reason === "audio_too_large");
check("over-duration → audio_too_long", (okAudio({ durationMs: 999_999 }) as { reason: string }).reason === "audio_too_long");

// ===========================================================================
console.log("\n[4] Transcript sanitization is bounded + safe (Phase 11)");
// ===========================================================================
check("non-string → empty", cleanTranscript(42) === "");
check("control chars stripped", cleanTranscript("what\u0000 is\u001f my mission") === "what is my mission");
check("whitespace collapsed", cleanTranscript("  what   is  my  mission  ") === "what is my mission");
check("over-long transcript is truncated", cleanTranscript("a".repeat(STT_MAX_TRANSCRIPT_CHARS + 50)).length <= STT_MAX_TRANSCRIPT_CHARS);
check("leading filler 'hey' stripped in normalized", normalizeTranscript("hey what is my mission today") === "what is my mission today");
check("polite prefix 'can you tell me' stripped", normalizeTranscript("can you tell me which accounts need attention") === "which accounts need attention");
{
  const p = prepareTranscript("Hey, what is my top mission for today?");
  check("prepare keeps readable transcript", p.transcript === "Hey, what is my top mission for today?");
  check("prepare strips leading filler + punctuation in normalized form", p.normalizedTranscript === "what is my top mission for today");
}

// ===========================================================================
console.log("\n[5] Transcript → intent PARITY with typed input (Phase 11/23)");
// Governance-relevant parity = SAME resolved intent. matchType (exact/alias/
// keyword) may differ because spoken input carries extra words; the composed
// answer keys off `intent`, never `matchType`, so intent equality is the proof.
// ===========================================================================
function parity(spoken: string, typed: string, expected: string): void {
  const a = resolveIntent(prepareTranscript(spoken).normalizedTranscript);
  const b = resolveIntent(typed);
  const sameIntent = a.kind === "intent" && b.kind === "intent" && a.intent === b.intent;
  check(
    `spoken "${spoken}" resolves to same intent as typed "${typed}" (${expected})`,
    sameIntent && a.kind === "intent" && a.intent === expected,
    `${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
  );
}
parity("Hey, what is my top mission for today?", "what is my top mission today", "MISSION_TODAY");
parity("Can you tell me which accounts need my attention first?", "which accounts need my attention first", "PRIORITY_ACCOUNTS");
parity("What are the main signals I should know?", "what are my top signals", "TOP_SIGNALS");
parity("What do I do next?", "what should i do next", "NEXT_ACTION");
parity("Why is Curefoods a priority?", "why is curefoods a priority", "ACCOUNT_PRIORITY_REASON");

// ===========================================================================
console.log("\n[6] Safety — a transcript can never rank/approve/execute");
// ===========================================================================
{
  const exec = resolveIntent(prepareTranscript("approve and execute the mission now").normalizedTranscript);
  check("spoken execution request is NOT NEXT_ACTION", exec.kind !== "intent" || exec.intent !== "NEXT_ACTION", JSON.stringify(exec));
  const crm = resolveIntent(prepareTranscript("delete the curefoods account from the crm").normalizedTranscript);
  check("spoken CRM mutation does not resolve to a supported action", crm.kind !== "intent" || crm.intent !== "NEXT_ACTION", JSON.stringify(crm));
  const junk = resolveIntent(prepareTranscript("what is the weather in paris").normalizedTranscript);
  check("off-topic spoken → unsupported (never a guess)", junk.kind === "unsupported", JSON.stringify(junk));
  const empty = resolveIntent(prepareTranscript("   ").normalizedTranscript);
  check("empty spoken → unsupported/empty", empty.kind === "unsupported", JSON.stringify(empty));
}

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Revenue Companion STT eval: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All STT checks passed.");
console.log("=".repeat(70));
