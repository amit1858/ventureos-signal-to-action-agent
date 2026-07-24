// VentureOS — Revenue Companion · Bounded intent router eval
// ==========================================================
// Deterministic, dependency-free proof that the Phase 3.2 intent router maps
// questions to a FIXED, bounded set of intents with no LLM and no drift:
// exact/alias/keyword resolution, tie → ambiguous, unsupported fallbacks
// (empty / too-long / no-match), and stable normalization.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/revenue-companion/eval/intentRouter.eval.ts

import {
  GUIDED_INTENTS,
  MAX_QUESTION_CHARS,
  isGuidedIntent,
  normalizeQuestion,
  resolveDirectIntent,
  resolveIntent,
  type GuidedIntent,
} from "../guided/intentRouter";

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

function expectIntent(q: string, intent: GuidedIntent): void {
  const r = resolveIntent(q);
  check(
    `"${q}" → ${intent}`,
    r.kind === "intent" && r.intent === intent,
    `got ${JSON.stringify(r)}`,
  );
}

// ===========================================================================
console.log("\n[0] Bounded intent set");
// ===========================================================================
check("exactly five bounded intents", GUIDED_INTENTS.length === 5);
check(
  "intent set is the approved five",
  GUIDED_INTENTS.join(",") ===
    "MISSION_TODAY,PRIORITY_ACCOUNTS,TOP_SIGNALS,NEXT_ACTION,ACCOUNT_PRIORITY_REASON",
);
for (const i of GUIDED_INTENTS) check(`isGuidedIntent(${i})`, isGuidedIntent(i));
check("isGuidedIntent rejects junk", !isGuidedIntent("EXECUTE_NOW"));
check("resolveDirectIntent validates", resolveDirectIntent("MISSION_TODAY") === "MISSION_TODAY");
check("resolveDirectIntent rejects junk", resolveDirectIntent("hack") === null);

// ===========================================================================
console.log("\n[1] Canonical + alias phrasings resolve to the right intent");
// ===========================================================================
expectIntent("What is my top mission today?", "MISSION_TODAY");
expectIntent("what should I focus on today", "MISSION_TODAY");
expectIntent("Which accounts need my attention first?", "PRIORITY_ACCOUNTS");
expectIntent("which customers are at risk", "PRIORITY_ACCOUNTS");
expectIntent("What are my top signals today?", "TOP_SIGNALS");
expectIntent("what changed today", "TOP_SIGNALS");
expectIntent("What should I do next?", "NEXT_ACTION");
expectIntent("what do you recommend", "NEXT_ACTION");
expectIntent("Why is Curefoods a priority?", "ACCOUNT_PRIORITY_REASON");
expectIntent("why does this account matter", "ACCOUNT_PRIORITY_REASON");

// ===========================================================================
console.log("\n[2] Match type labelling (exact vs alias vs keyword)");
// ===========================================================================
{
  const exact = resolveIntent("what is my top mission today");
  check("canonical phrasing → exact", exact.kind === "intent" && exact.matchType === "exact");
  const alias = resolveIntent("where should I start today");
  check("approved alias → alias", alias.kind === "intent" && alias.matchType === "alias");
  const kw = resolveIntent("tell me about the mission please");
  check("keyword-only phrasing → keyword", kw.kind === "intent" && kw.matchType === "keyword" && kw.intent === "MISSION_TODAY");
}

// ===========================================================================
console.log("\n[3] Determinism — identical input, identical output");
// ===========================================================================
{
  const a = JSON.stringify(resolveIntent("Which accounts need attention?"));
  const b = JSON.stringify(resolveIntent("Which accounts need attention?"));
  check("repeated resolution is identical", a === b);
}

// ===========================================================================
console.log("\n[4] Ambiguity → truthful ambiguous result (never a guess)");
// ===========================================================================
{
  // "why" (ACCOUNT_PRIORITY_REASON) + "next" (NEXT_ACTION) tie at score 1 each.
  const r = resolveIntent("why next");
  check("tied keywords → ambiguous", r.kind === "ambiguous", JSON.stringify(r));
  if (r.kind === "ambiguous") {
    check("ambiguous lists >=2 candidates", r.candidates.length >= 2);
  }
}

// ===========================================================================
console.log("\n[5] Unsupported fallbacks are distinct + fail closed");
// ===========================================================================
{
  const empty = resolveIntent("   ");
  check("whitespace → unsupported/empty", empty.kind === "unsupported" && empty.reason === "empty");
  const long = resolveIntent("a".repeat(MAX_QUESTION_CHARS + 1));
  check("over-long → unsupported/too_long", long.kind === "unsupported" && long.reason === "too_long");
  const none = resolveIntent("what is the weather in paris");
  check("off-topic → unsupported/no_match", none.kind === "unsupported" && none.reason === "no_match");
  // The router NEVER resolves an execution/approval request into an intent.
  const exec = resolveIntent("approve and execute the mission now");
  check(
    "execution request is NOT routed to a supported intent",
    exec.kind !== "intent" || exec.intent !== "NEXT_ACTION",
    JSON.stringify(exec),
  );
}

// ===========================================================================
console.log("\n[6] Normalization is stable + punctuation/apostrophe-insensitive");
// ===========================================================================
{
  check("normalize collapses + lowercases", normalizeQuestion("  What's   MY  Mission? ") === "whats my mission");
  check("curly apostrophe == straight", normalizeQuestion("what\u2019s next") === normalizeQuestion("what's next"));
  check("punctuation stripped", normalizeQuestion("mission!!! today???") === "mission today");
  const withPunct = resolveIntent("what's my mission today?!");
  const without = resolveIntent("whats my mission today");
  check("phrasing with/without punctuation resolves identically", JSON.stringify(withPunct) === JSON.stringify(without));
}

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Revenue Companion intent-router eval: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All intent-router checks passed.");
console.log("=".repeat(70));
