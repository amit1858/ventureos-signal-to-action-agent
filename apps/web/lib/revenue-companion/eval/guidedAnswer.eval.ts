// VentureOS — Revenue Companion · Shared answer composer eval
// ===========================================================
// Deterministic, dependency-free proof that the Phase 3.2 answer composer is a
// grounded, bounded, read-only restatement of the committed governed journeys:
// per-intent answers over BOTH journeys, 35–80 spoken words, 2–4 visible
// sections, NO raw IDs/slugs/JSON in rendered copy, governed status echoed
// verbatim, reference IDs only in metadata arrays, stable fingerprints, a
// truthful UNSUPPORTED fallback, and never a re-ranking / approval / execution.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/revenue-companion/eval/guidedAnswer.eval.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { buildValidatedCompanion } from "../companionContract";
import {
  validateDemoJourneysDoc,
  type DemoJourneysDoc,
} from "../../demo-mode/presentationContract";
import {
  ANSWER_SPOKEN_MAX_WORDS,
  ANSWER_SPOKEN_MIN_WORDS,
  computeAnswerFingerprint,
  countWords,
  scanAnswerText,
  validateAnswer,
  type RevenueCompanionAnswer,
} from "../answerContract";
import {
  composeAnswer,
  composeAnswerForDirectIntent,
  composeAnswerForIntent,
  composeUnsupportedAnswer,
} from "../answerComposer";
import { GUIDED_INTENTS, type GuidedIntent } from "../guided/intentRouter";

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

// Slugs / identifiers that must NEVER appear in any rendered answer string.
const FORBIDDEN_IN_COPY = [
  "curefoods-test",
  "renewal_date",
  "renewal_risk",
  "hubspot:",
  "msn-",
  "sce-",
  "sig1:",
  "mission_id",
  "identity_status",
];

function renderedStrings(a: RevenueCompanionAnswer): string[] {
  return [a.headline, a.spokenText, ...a.visibleSections.flatMap((s) => [s.heading, s.body])];
}

// ===========================================================================
console.log("\n[0] Source document is contract-valid");
// ===========================================================================
check("generated demo doc passes the presentation contract", validateDemoJourneysDoc(doc).ok);
check("doc exposes two journeys", doc.journeys.length === 2);

// ===========================================================================
console.log("\n[1] Every intent composes a valid, bounded, grounded answer (both journeys)");
// ===========================================================================
for (const journey of doc.journeys) {
  const vm = buildValidatedCompanion(journey.view, {
    journeyKey: journey.key,
    journeyTitle: journey.title,
  });
  for (const intent of GUIDED_INTENTS) {
    let a: RevenueCompanionAnswer | null = null;
    try {
      a = composeAnswerForIntent(vm, intent);
    } catch (e) {
      check(`journey ${journey.key} · ${intent}: composes without throwing`, false, String(e));
      continue;
    }
    check(`journey ${journey.key} · ${intent}: validates`, validateAnswer(a).ok, validateAnswer(a).errors.join("; "));
    check(`journey ${journey.key} · ${intent}: intent set`, a.intent === intent);

    const words = countWords(a.spokenText);
    check(
      `journey ${journey.key} · ${intent}: spoken ${words}w in [${ANSWER_SPOKEN_MIN_WORDS},${ANSWER_SPOKEN_MAX_WORDS}]`,
      words >= ANSWER_SPOKEN_MIN_WORDS && words <= ANSWER_SPOKEN_MAX_WORDS,
    );
    check(
      `journey ${journey.key} · ${intent}: 2-4 visible sections`,
      a.visibleSections.length >= 2 && a.visibleSections.length <= 4,
    );

    // No slug/id/JSON leaks into any rendered string.
    let leak: string | null = null;
    for (const text of renderedStrings(a)) {
      const low = text.toLowerCase();
      for (const bad of FORBIDDEN_IN_COPY) {
        if (low.includes(bad)) { leak = `${bad} in "${text}"`; break; }
      }
      if (!leak && scanAnswerText(text)) leak = `scan hit in "${text}"`;
      if (leak) break;
    }
    check(`journey ${journey.key} · ${intent}: no id/slug/JSON in rendered copy`, leak === null, leak ?? "");

    // Rendered copy uses the approved display name, not the raw record slug.
    check(
      `journey ${journey.key} · ${intent}: uses display name`,
      renderedStrings(a).some((t) => t.includes("Curefoods")),
    );

    // Governed status is echoed verbatim (not restated / softened).
    check(`journey ${journey.key} · ${intent}: governance verbatim`, a.governanceStatus === vm.governanceStatus);
    check(`journey ${journey.key} · ${intent}: approval verbatim`, a.approvalStatus === vm.approvalStatus);
    check(`journey ${journey.key} · ${intent}: recommendedAction verbatim`, a.recommendedAction === vm.recommendationReason);

    // Reference IDs live ONLY in metadata arrays.
    check(`journey ${journey.key} · ${intent}: accountIds carries the ref`, a.accountIds.includes("hubspot:246820626:335064019691"));
    check(`journey ${journey.key} · ${intent}: missionIds carries the mission`, a.missionIds.includes("MSN-81690a7c4a50e237"));
    check(`journey ${journey.key} · ${intent}: signalReferences carries the change event`, a.signalReferences.includes("SCE-e85ee65385e06647"));
    check(`journey ${journey.key} · ${intent}: evidence carried verbatim`, a.evidenceReferences.join("|") === journey.view.evidenceItems.join("|"));

    // Presentation-only workspace focus points at an EXISTING Action Center anchor.
    check(
      `journey ${journey.key} · ${intent}: workspace focus on a real anchor`,
      !!a.workspaceFocus && ["workbench", "portfolio-pulse"].includes(a.workspaceFocus.anchorId),
    );

    // Provenance is always the governed journey view.
    check(`journey ${journey.key} · ${intent}: generatedFrom governed view`, a.generatedFrom.source === "governed-journey-view" && a.generatedFrom.journeyKey === journey.key);
    check(`journey ${journey.key} · ${intent}: clock-free timestamp`, a.generatedAt === "2026-05-08T18:10:00Z");
    check(`journey ${journey.key} · ${intent}: fingerprint recomputes`, a.fingerprint === computeAnswerFingerprint(a));
  }
}

// ===========================================================================
console.log("\n[2] Composition is fully deterministic (identical bytes)");
// ===========================================================================
{
  const vm = buildValidatedCompanion(doc.journeys[0].view, { journeyKey: "a", journeyTitle: doc.journeys[0].title });
  for (const intent of GUIDED_INTENTS) {
    const a = JSON.stringify(composeAnswerForIntent(vm, intent));
    const b = JSON.stringify(composeAnswerForIntent(vm, intent));
    check(`${intent}: repeated composition is byte-identical`, a === b);
  }
}

// ===========================================================================
console.log("\n[3] Question → intent → answer wiring");
// ===========================================================================
{
  const vm = buildValidatedCompanion(doc.journeys[0].view, { journeyKey: "a", journeyTitle: doc.journeys[0].title });
  const cases: Array<[string, GuidedIntent]> = [
    ["What is my top mission today?", "MISSION_TODAY"],
    ["Which accounts need my attention first?", "PRIORITY_ACCOUNTS"],
    ["What changed today?", "TOP_SIGNALS"],
    ["What should I do next?", "NEXT_ACTION"],
    ["Why is Curefoods a priority?", "ACCOUNT_PRIORITY_REASON"],
  ];
  for (const [q, intent] of cases) {
    const a = composeAnswer(vm, q);
    check(`"${q}" composes ${intent}`, a.intent === intent && validateAnswer(a).ok);
  }
  const direct = composeAnswerForDirectIntent(vm, "MISSION_TODAY");
  check("direct-intent chip composes", !!direct && direct.intent === "MISSION_TODAY");
  check("direct-intent rejects junk", composeAnswerForDirectIntent(vm, "EXECUTE") === null);
}

// ===========================================================================
console.log("\n[4] Unsupported / ambiguous → truthful bounded fallback");
// ===========================================================================
{
  const vm = buildValidatedCompanion(doc.journeys[0].view, { journeyKey: "a", journeyTitle: doc.journeys[0].title });
  const a = composeAnswer(vm, "what is the weather in paris");
  check("off-topic → UNSUPPORTED", a.intent === "UNSUPPORTED");
  check("UNSUPPORTED validates", validateAnswer(a).ok, validateAnswer(a).errors.join("; "));
  check("UNSUPPORTED has no workspace focus", a.workspaceFocus === null);
  check("UNSUPPORTED carries no account/mission refs", a.accountIds.length === 0 && a.missionIds.length === 0 && a.signalReferences.length === 0);
  check("UNSUPPORTED lists what it can answer", /top mission/i.test(a.spokenText) && /next step/i.test(a.spokenText));
  let leak: string | null = null;
  for (const t of renderedStrings(a)) if (scanAnswerText(t)) { leak = t; break; }
  check("UNSUPPORTED copy is clean", leak === null, leak ?? "");

  const direct = composeUnsupportedAnswer(vm, "approve and execute now");
  check("explicit unsupported never promises execution", !/\bi (will|am) (executing|approving)\b/i.test(direct.spokenText));
}

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Revenue Companion answer-composer eval: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All answer-composer checks passed.");
console.log("=".repeat(70));
