// VentureOS — Revenue Companion · Executive polish + voice script eval
// ====================================================================
// Proves the Phase 3.1 product polish and the deterministic voice script:
//   * the headline reads as a natural-language executive briefing (display name,
//     no internal slug, no identifier/hash), and differs by governed outcome;
//   * the panel uses progressive disclosure (reduced initial density);
//   * the CTAs are truthful and route-aligned;
//   * the spoken script is deterministic, bounded, identifier-free, fingerprint
//     -locked, and states the honest outcome for each journey.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/revenue-companion/eval/voiceModel.eval.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  buildValidatedCompanion,
  buildVoiceScript,
  buildExecutiveHeadline,
  computeScriptFingerprint,
  scanVoiceScript,
  deriveAccountDisplayName,
  VOICE_SCRIPT_MAX_CHARS,
} from "../companionContract";
import { COMPANION_STRINGS } from "../strings";
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
const WEB_ROOT = resolve(HERE, "../../..");
const doc = JSON.parse(readFileSync(DATA, "utf8")) as DemoJourneysDoc;
const display = deriveAccountDisplayName("curefoods-test");

// Identifier / diagnostic patterns that must never appear in spoken or headline
// executive copy.
const IDENTIFIER_RE = /MSN-|SCE-|sig1:|vcs1:|hubspot:|schema|fingerprint|ledger_reference/i;

// ===========================================================================
console.log("\n[1] Executive headline is natural language (both journeys)");
// ===========================================================================
{
  for (const journey of doc.journeys) {
    const vm = buildValidatedCompanion(journey.view, {
      journeyKey: journey.key,
      journeyTitle: journey.title,
    });
    const h = vm.narrativeHeadline;
    check(`journey ${journey.key}: headline uses the display name`, h.includes(display));
    check(`journey ${journey.key}: headline drops the internal slug`, !h.includes("curefoods-test"));
    check(`journey ${journey.key}: headline carries no identifier/hash`, !IDENTIFIER_RE.test(h));
    check(`journey ${journey.key}: headline ends as a sentence`, /[.!?]$/.test(h.trim()));
    check(`journey ${journey.key}: headline is a briefing-length line`, h.length >= 40 && h.length <= 160);
    check(`journey ${journey.key}: headline equals the composed executive headline`, h === buildExecutiveHeadline(journey.view, display));
  }

  const a = doc.journeys.find((j) => j.key === "a")!;
  const b = doc.journeys.find((j) => j.key === "b")!;
  const ha = buildExecutiveHeadline(a.view, display);
  const hb = buildExecutiveHeadline(b.view, display);
  check("governed-stop headline differs from executed headline", ha !== hb);
  check("governed-stop headline names the stop", /stopped|could not be corroborated/i.test(ha));
  check("executed headline names governed approval", /approval|ran once/i.test(hb));
  check("neither headline overclaims automation", !/autonomous|fully automated/i.test(ha + hb));
}

// ===========================================================================
console.log("\n[2] Progressive disclosure + truthful CTAs (reduced density)");
// ===========================================================================
{
  const panel = readFileSync(resolve(WEB_ROOT, "components/revenue-companion/RevenueCompanionPanel.tsx"), "utf8");
  check("panel uses native <details> disclosure", panel.includes("<details"));
  check("panel exposes 'Supporting evidence' on demand", COMPANION_STRINGS.disclosures.supportingEvidence.length > 0 && panel.includes("disclosures.supportingEvidence"));
  check("panel exposes 'How this briefing was generated' on demand", panel.includes("disclosures.howGenerated"));
  check("panel exposes 'Technical provenance' on demand", panel.includes("disclosures.technicalProvenance"));

  const vm = buildValidatedCompanion(doc.journeys[0].view, { journeyKey: "a", journeyTitle: "A" });
  check("primary CTA opens the governed surface", vm.primaryAction.href === "/demo/signal-to-action");
  check("secondary CTA opens the governed surface", vm.secondaryAction.href === "/demo/signal-to-action");
  check("primary CTA is truthful (review, not resolve/execute)", /review the governed mission/i.test(vm.primaryAction.label));
  check("no CTA claims to resolve identity or execute", !/resolve identity|execute|approve/i.test(vm.primaryAction.label + " " + vm.secondaryAction.label));
}

// ===========================================================================
console.log("\n[3] Voice script is deterministic, bounded, identifier-free");
// ===========================================================================
{
  for (const journey of doc.journeys) {
    const script1 = buildVoiceScript(journey.view, display);
    const script2 = buildVoiceScript(journey.view, display);
    check(`journey ${journey.key}: script is deterministic`, script1 === script2);
    check(`journey ${journey.key}: script within length bound`, script1.length <= VOICE_SCRIPT_MAX_CHARS);
    check(`journey ${journey.key}: script carries no identifier/hash`, !IDENTIFIER_RE.test(script1));
    check(`journey ${journey.key}: script scan is clean`, scanVoiceScript(script1) === null);
    check(`journey ${journey.key}: script names the account (display)`, script1.includes(display));
    check(`journey ${journey.key}: script never names the internal slug`, !script1.includes("curefoods-test"));
    check(`journey ${journey.key}: fingerprint is stable`, computeScriptFingerprint(script1) === computeScriptFingerprint(script2));
    check(`journey ${journey.key}: fingerprint changes if a word changes`, computeScriptFingerprint(script1) !== computeScriptFingerprint(script1 + " x"));
  }
}

// ===========================================================================
console.log("\n[4] Voice script states the honest per-journey outcome");
// ===========================================================================
{
  const a = doc.journeys.find((j) => j.key === "a")!;
  const b = doc.journeys.find((j) => j.key === "b")!;
  const sa = buildVoiceScript(a.view, display);
  const sb = buildVoiceScript(b.view, display);

  check("governed-stop script names the stop", /stopped/i.test(sa));
  check("governed-stop script states no approval/execution was attempted", /no approval or execution/i.test(sa));
  check("governed-stop script recommends a second source", /second governed source/i.test(sa));
  check("executed script names explicit human approval", /explicit human approval/i.test(sb));
  check("executed script names the simulated action", /simulated action/i.test(sb));
  check("executed script states no CRM write-back", /no crm write-back/i.test(sb));
  check("neither script overclaims automation", !/autonomous|fully automated/i.test(sa + sb));
}

// ===========================================================================
console.log("\n[5] Voice chrome copy is truthful (adapter-only)");
// ===========================================================================
{
  const v = COMPANION_STRINGS.voice;
  check("disclaimer states it is a presentation adapter", /presentation adapter/i.test(v.disclaimer));
  check("disclaimer states it changes no governed decision", /changes no governed/i.test(v.disclaimer));
  check("unconfigured provider line is truthful", /not configured/i.test(v.providerUnconfigured));
  check("configured-pending line does not claim live", !/\blive\b/i.test(v.providerConfiguredPending) && /pending/i.test(v.providerConfiguredPending));
}

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Revenue Companion voice model eval: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All Revenue Companion voice model checks passed.");
console.log("=".repeat(70));
