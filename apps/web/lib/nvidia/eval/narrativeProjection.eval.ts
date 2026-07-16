// Release 2.5 — Mission Control · business-language narrative projection evals
// ============================================================================
// Deterministic, network-free proof that the presentation-only projection makes
// primary copy read as business language WITHOUT inventing facts, dropping
// evidence, or breaking the spoken-summary length bound.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/nvidia/eval/narrativeProjection.eval.ts

import {
  toBusinessProse,
  normalizeVoiceSummary,
  boundLength,
  projectVoiceSummary,
} from "../narrativeProjection";
import { NVIDIA_VOICE_SUMMARY_MAX_CHARS } from "../types";

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

/** Lower-cased alnum word set — used to prove the projection never adds a word. */
function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 0),
  );
}
function isSubsetOf(a: Set<string>, b: Set<string>): boolean {
  for (const w of a) if (!b.has(w)) return false;
  return true;
}

// The exact internal phrasing Amit flagged in the hosted review.
const RAW_SEGMENT = "Advisory — On record, risk to watch on Curefoods: usage has slipped for two quarters.";
const RAW_VOICE = "Risk review of 2 memories. Top: Advisory — On record, risk to watch on Curefoods: usage has slipped.";

// ===========================================================================
console.log("\n[1] Internal persona scaffolding no longer dominates primary copy");
// ===========================================================================
const prose = toBusinessProse(RAW_SEGMENT);
check("does not start with 'Advisory'", !/^advisory/i.test(prose), prose);
check("no 'Advisory —' lead remains", !/advisory\s*[—–-]/i.test(prose), prose);
check("no 'On record,' framing remains", !/on record,/i.test(prose), prose);
check("business prose is non-empty", prose.length > 0, prose);

// ===========================================================================
console.log("\n[2] Evidence / facts are preserved (nothing dropped, nothing invented)");
// ===========================================================================
check("account name preserved", /curefoods/i.test(prose), prose);
check("factual summary preserved", /usage has slipped for two quarters/i.test(prose), prose);
check(
  "no unsupported claim: output words are a subset of input words",
  isSubsetOf(words(prose), words(RAW_SEGMENT)),
  prose,
);
// An explicit evidence-ref token in the text must survive untouched.
const withRef = toBusinessProse("Advisory — On record, risk to watch on Curefoods (led-9): renewal slipping.");
check("evidence-ref token 'led-9' preserved", /led-9/i.test(withRef), withRef);

// ===========================================================================
console.log("\n[3] Medium/low confidence hedges are intentionally KEPT");
// ===========================================================================
const medium = toBusinessProse("Advisory — Based on what I have, risk to watch on Curefoods: signups down.");
check("medium hedge 'Based on what I have,' preserved", /based on what i have,/i.test(medium), medium);
const low = toBusinessProse(
  "Advisory — I'm not fully certain, but a tentative signal suggests risk to watch on Curefoods.",
);
check("low hedge 'tentative signal suggests' preserved", /tentative signal suggests/i.test(low), low);

// ===========================================================================
console.log("\n[4] Voice summary: natural + within the character limit");
// ===========================================================================
const voice = normalizeVoiceSummary(RAW_VOICE, NVIDIA_VOICE_SUMMARY_MAX_CHARS);
check("voice drops 'Risk review of N memories' preamble", !/risk review of/i.test(voice), voice);
check("voice drops 'Top:' preamble", !/\btop:/i.test(voice), voice);
check("voice drops 'Advisory —' lead", !/advisory\s*[—–-]/i.test(voice), voice);
check("voice keeps the account", /curefoods/i.test(voice), voice);
check("voice within max chars", voice.length > 0 && voice.length <= NVIDIA_VOICE_SUMMARY_MAX_CHARS, String(voice.length));
check("voice adds no new words", isSubsetOf(words(voice), words(RAW_VOICE)), voice);

// Length bound is enforced with an ellipsis.
const longLine = "word ".repeat(120).trim();
const bounded = boundLength(longLine, NVIDIA_VOICE_SUMMARY_MAX_CHARS);
check("boundLength never exceeds max", bounded.length <= NVIDIA_VOICE_SUMMARY_MAX_CHARS, String(bounded.length));
check("boundLength ellipsizes when truncated", bounded.endsWith("…"));

// ===========================================================================
console.log("\n[5] projectVoiceSummary prefers a live grounded narrative, else persona");
// ===========================================================================
const live = projectVoiceSummary(
  {
    personaVoiceSummary: RAW_VOICE,
    narrativeVoiceSummary: "Renewal risk was flagged for Curefoods; review the stakeholder follow-up before renewal.",
    narrativeIsLiveGrounded: true,
  },
  NVIDIA_VOICE_SUMMARY_MAX_CHARS,
);
check("live grounded voice is used when available", /stakeholder follow-up/i.test(live), live);
check("live grounded voice is natural (no persona preamble)", !/risk review of/i.test(live), live);

const fellBack = projectVoiceSummary(
  {
    personaVoiceSummary: RAW_VOICE,
    narrativeVoiceSummary: "Renewal risk was flagged for Curefoods.",
    narrativeIsLiveGrounded: false, // fallback / mock — do NOT prefer the narrative voice
  },
  NVIDIA_VOICE_SUMMARY_MAX_CHARS,
);
check("non-live path normalizes the persona voice", /curefoods/i.test(fellBack) && !/risk review of/i.test(fellBack), fellBack);
check("non-live path stays within max chars", fellBack.length <= NVIDIA_VOICE_SUMMARY_MAX_CHARS);

// ===========================================================================
console.log("\n[6] Edge cases are deterministic and safe");
// ===========================================================================
check("empty input -> empty prose", toBusinessProse("") === "");
check("whitespace input -> empty prose", toBusinessProse("   \n\t ") === "");
check("already-clean prose is idempotent", toBusinessProse(toBusinessProse(RAW_SEGMENT)) === toBusinessProse(RAW_SEGMENT));
check("neutral tone (no lead) is left intact aside from casing",
  toBusinessProse("Curefoods usage is trending down.") === "Curefoods usage is trending down.");

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Narrative projection evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All narrative projection checks passed. Business-readable, fact-preserving.");
console.log("=".repeat(70));
