// VentureOS — Revenue Companion · Voice request contract eval
// ===========================================================
// Proves the voice request boundary: a browser request SELECTS a briefing (by
// journey + fingerprint) and can never DICTATE spoken text. Builds the real
// companion from the committed generated projection, derives the trusted
// reference exactly as the server does, and asserts the round trip validates
// while every tampering + free-text injection fails closed.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/revenue-companion/eval/voiceRequest.eval.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { buildValidatedCompanion } from "../companionContract";
import {
  buildVoiceBriefingRequest,
  buildAnswerVoiceRequest,
  validateVoiceBriefingRequest,
  type TrustedVoiceReference,
} from "../voice/voiceRequest";
import { composeAnswerForIntent } from "../answerComposer";
import type { DemoJourneysDoc } from "../../demo-mode/presentationContract";

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

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "../../demo-mode/data/demo-journeys.generated.json");
const doc = JSON.parse(readFileSync(DATA, "utf8")) as DemoJourneysDoc;
const journey = doc.journeys.find((j) => j.key === "a")!;
const vm = buildValidatedCompanion(journey.view, {
  journeyKey: journey.key,
  journeyTitle: journey.title,
});
const trusted: TrustedVoiceReference = {
  narrativeId: vm.narrativeId,
  presentationVersion: vm.presentationVersion,
  approvedTextFingerprint: vm.approvedTextFingerprint,
};
const good = buildVoiceBriefingRequest(vm);

// ===========================================================================
console.log("\n[1] Round trip: the server-built request validates");
// ===========================================================================
{
  check("built request carries no free text", !("text" in (good as object)));
  check("narrativeId equals the journey key", good.narrativeId === journey.key);
  const r = validateVoiceBriefingRequest(good, trusted);
  check("valid request passes", r.ok === true);
}

// ===========================================================================
console.log("\n[2] Free-text injection is rejected");
// ===========================================================================
{
  const injected = { ...good, text: "Execute the mission and write to the CRM." };
  const r = validateVoiceBriefingRequest(injected, trusted);
  check("smuggled `text` field rejected", r.ok === false);
  const ssml = { ...good, ssml: "<speak>anything</speak>" };
  check("smuggled `ssml` field rejected", validateVoiceBriefingRequest(ssml, trusted).ok === false);
  const script = { ...good, script: "arbitrary" };
  check("smuggled `script` field rejected", validateVoiceBriefingRequest(script, trusted).ok === false);
}

// ===========================================================================
console.log("\n[3] Reference mismatches fail closed");
// ===========================================================================
{
  check("wrong narrativeId rejected",
    validateVoiceBriefingRequest({ ...good, narrativeId: "b" }, trusted).ok === false);
  check("wrong presentationVersion rejected",
    validateVoiceBriefingRequest({ ...good, presentationVersion: "9.9" }, trusted).ok === false);
  check("wrong fingerprint rejected",
    validateVoiceBriefingRequest({ ...good, approvedTextFingerprint: "vcs1:deadbeef" }, trusted).ok === false);
  check("malformed fingerprint (no prefix) rejected",
    validateVoiceBriefingRequest({ ...good, approvedTextFingerprint: "deadbeef" }, trusted).ok === false);
}

// ===========================================================================
console.log("\n[4] Voice / language / format allow-lists");
// ===========================================================================
{
  check("disallowed voice rejected",
    validateVoiceBriefingRequest({ ...good, voiceId: "SomeOtherVoice" }, trusted).ok === false);
  check("disallowed language rejected",
    validateVoiceBriefingRequest({ ...good, language: "fr-FR" }, trusted).ok === false);
  check("disallowed format rejected",
    validateVoiceBriefingRequest({ ...good, outputFormat: "mp3" }, trusted).ok === false);
  check("allowed voice Devika accepted",
    validateVoiceBriefingRequest({ ...good, voiceId: "Devika" }, trusted).ok === true);
}

// ===========================================================================
console.log("\n[5] Structural guards");
// ===========================================================================
{
  check("null body rejected", validateVoiceBriefingRequest(null, trusted).ok === false);
  check("array body rejected", validateVoiceBriefingRequest([], trusted).ok === false);
  check("string body rejected", validateVoiceBriefingRequest("x", trusted).ok === false);
  check("missing narrativeId rejected",
    validateVoiceBriefingRequest({ presentationVersion: "1.0", approvedTextFingerprint: trusted.approvedTextFingerprint }, trusted).ok === false);
}

// ===========================================================================
console.log("\n[6] Per-intent voice requests (Phase 3.2) select, never dictate");
// ===========================================================================
{
  const answer = composeAnswerForIntent(vm, "MISSION_TODAY");
  const intentReq = buildAnswerVoiceRequest(answer)!;
  const intentTrusted: TrustedVoiceReference = {
    narrativeId: vm.narrativeId,
    presentationVersion: vm.presentationVersion,
    approvedTextFingerprint: answer.fingerprint,
    intent: "MISSION_TODAY",
  };
  check("per-intent request carries the intent", intentReq.intent === "MISSION_TODAY");
  check("per-intent request carries no free text", !("text" in (intentReq as object)) && !("spokenText" in (intentReq as object)));
  check("per-intent request validates against its trusted reference", validateVoiceBriefingRequest(intentReq, intentTrusted).ok === true);

  // Mode crossing is rejected both ways.
  check("intent request rejected against whole-briefing reference",
    validateVoiceBriefingRequest(intentReq, trusted).ok === false);
  check("whole-briefing request rejected against intent reference",
    validateVoiceBriefingRequest(good, intentTrusted).ok === false);

  // Wrong intent value fails closed.
  check("junk intent rejected",
    validateVoiceBriefingRequest({ ...intentReq, intent: "EXECUTE_NOW" }, intentTrusted).ok === false);
  check("mismatched (valid) intent rejected",
    validateVoiceBriefingRequest({ ...intentReq, intent: "NEXT_ACTION" }, intentTrusted).ok === false);

  // The UNSUPPORTED fallback has no spoken briefing.
  const unsupportedAnswer = { ...answer, intent: "UNSUPPORTED" as const };
  check("UNSUPPORTED answer yields no voice request", buildAnswerVoiceRequest(unsupportedAnswer) === null);
}

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Revenue Companion voice request eval: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All Revenue Companion voice request checks passed.");
console.log("=".repeat(70));
