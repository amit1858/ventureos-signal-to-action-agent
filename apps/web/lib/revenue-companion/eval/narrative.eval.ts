// VentureOS — Revenue Companion · Narrative adapter + resolution eval
// ===================================================================
// Proves the deterministic-FIRST narrative seam:
//   * unconfigured NVIDIA → deterministic narrative, truthfully labelled;
//   * a configured provider that returns a grounded rephrase → provider-enhanced,
//     while every governed field stays verbatim from the source (no drift);
//   * a provider that adds a forbidden claim or an unearned authority token →
//     rejected → deterministic fallback;
//   * a provider that throws or declines → error → deterministic fallback.
// It exercises the REAL server adapter under an injected fake provider and never
// performs any network or model I/O.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/revenue-companion/eval/narrative.eval.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  resolveNarrative,
  validateProviderDraft,
  buildDeterministicNarrative,
  buildCompanionViewModel,
  validateCompanion,
  buildExecutiveHeadline,
  reverseDisplayName,
  deriveAccountDisplayName,
} from "../companionContract";
import {
  resolveCompanionNarrative,
  __setCompanionProviderForTest,
  type CompanionNarrativeProvider,
} from "../narrativeAdapter.server";
import type {
  DemoPresentationView,
  DemoJourneysDoc,
} from "../../demo-mode/presentationContract";

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
const doc = JSON.parse(readFileSync(DATA, "utf8")) as unknown as DemoJourneysDoc;
const viewA: DemoPresentationView = doc.journeys.find((j) => j.key === "a")!.view;
// The governed source account slug for both committed journeys.
const rawA = "curefoods-test";
const displayA = deriveAccountDisplayName(rawA);

function fakeProvider(
  configured: boolean,
  enhance: CompanionNarrativeProvider["enhance"],
): CompanionNarrativeProvider {
  return { name: "fake", configured: () => configured, enhance };
}

// ===========================================================================
console.log("\n[1] Unconfigured NVIDIA → deterministic (default shipped state)");
// ===========================================================================
{
  __setCompanionProviderForTest(null);
  const r = resolveCompanionNarrative(viewA);
  check("mode is deterministic", r.mode === "deterministic");
  check(
    "headline is the composed executive headline (display name, natural language)",
    r.headline === buildExecutiveHeadline(viewA, displayA),
  );
  check("headline uses the approved display name", r.headline.includes(displayA));
  check("headline drops the internal account slug", !r.headline.includes(rawA));
  check(
    "body is the governed narrative with only the display name substituted",
    reverseDisplayName(r.body, rawA, displayA) === viewA.primaryNarrative,
  );
  check("provider labelled from source (NVIDIA unconfigured)", r.provider === viewA.providerLabel);
  check("fallback status states NVIDIA is not configured", /not configured/i.test(r.fallbackStatus));
}

// ===========================================================================
console.log("\n[2] Configured provider with a grounded rephrase → enhanced");
// ===========================================================================
{
  const rephrase =
    "curefoods-test needs a second trusted source before this renewal-risk mission can proceed.";
  __setCompanionProviderForTest(
    fakeProvider(true, () => ({ headline: rephrase, body: rephrase })),
  );
  const r = resolveCompanionNarrative(viewA);
  check("mode is provider-enhanced", r.mode === "provider-enhanced");
  check("headline is the provider rephrase", r.headline === rephrase);
  check("provider labelled advisory", /advisory/i.test(r.provider));
  check("fallback status notes verdict unchanged", /unchanged/i.test(r.fallbackStatus));

  // Critically: governed fields never come from the provider.
  const vm = buildCompanionViewModel(viewA, { journeyKey: "a", journeyTitle: "A" }, r);
  check("companion still validates in enhanced mode", validateCompanion(vm, viewA).ok);
  check("governance stayed verbatim despite enhancement", vm.governanceStatus === viewA.governanceLabel);
  check("approval stayed verbatim despite enhancement", vm.approvalStatus === viewA.approvalLabel);
  check("evidence stayed verbatim despite enhancement", vm.evidenceItems.join("|") === viewA.evidenceItems.join("|"));
}

// ===========================================================================
console.log("\n[3] Provider that overstates → rejected → deterministic fallback");
// ===========================================================================
{
  // Forbidden claim.
  __setCompanionProviderForTest(
    fakeProvider(true, () => ({
      headline: "Done",
      body: "This was a real CRM write-back completed autonomously.",
    })),
  );
  const forbidden = resolveCompanionNarrative(viewA);
  check("forbidden-claim draft falls back to deterministic", forbidden.mode === "deterministic");
  check(
    "fallback body is the governed narrative (display name substituted)",
    reverseDisplayName(forbidden.body, rawA, displayA) === viewA.primaryNarrative,
  );
  check("fallback status notes groundedness failure", /groundedness/i.test(forbidden.fallbackStatus));

  // Unearned authority token not present in the Journey A governed stop.
  __setCompanionProviderForTest(
    fakeProvider(true, () => ({
      headline: "Handled",
      body: "VentureOS executed the mission and sent the update.",
    })),
  );
  const authority = resolveCompanionNarrative(viewA);
  check("unearned authority token falls back to deterministic", authority.mode === "deterministic");
}

// ===========================================================================
console.log("\n[4] Provider that throws or declines → error → deterministic");
// ===========================================================================
{
  __setCompanionProviderForTest(
    fakeProvider(true, () => {
      throw new Error("timeout");
    }),
  );
  const thrown = resolveCompanionNarrative(viewA);
  check("provider throw falls back to deterministic", thrown.mode === "deterministic");
  check(
    "provider throw is not fabricated as NVIDIA output",
    thrown.headline === buildExecutiveHeadline(viewA, displayA),
  );

  __setCompanionProviderForTest(fakeProvider(true, () => null));
  const declined = resolveCompanionNarrative(viewA);
  check("provider decline falls back to deterministic", declined.mode === "deterministic");

  // A provider that reports itself unconfigured is treated as unconfigured.
  __setCompanionProviderForTest(fakeProvider(false, () => ({ headline: "x", body: "y" })));
  const notConfigured = resolveCompanionNarrative(viewA);
  check("provider.configured()===false → unconfigured deterministic", notConfigured.mode === "deterministic");

  __setCompanionProviderForTest(null); // restore shipped state
}

// ===========================================================================
console.log("\n[5] validateProviderDraft unit guards");
// ===========================================================================
{
  const det = buildDeterministicNarrative(viewA);
  check("empty headline rejected", !validateProviderDraft({ headline: "", body: "ok" }, viewA).ok);
  check("empty body rejected", !validateProviderDraft({ headline: "ok", body: "" }, viewA).ok);
  check("over-long body rejected", !validateProviderDraft({ headline: "ok", body: "x".repeat(1300) }, viewA).ok);
  check("forbidden phrase rejected", !validateProviderDraft({ headline: "ok", body: "nvidia decided this" }, viewA).ok);
  check("plain rephrase accepted", validateProviderDraft({ headline: "Second source needed", body: "A second trusted source is required." }, viewA).ok);
  // resolveNarrative treats an unconfigured outcome as deterministic verbatim.
  const r = resolveNarrative(viewA, det, { kind: "unconfigured" });
  check("resolveNarrative unconfigured is verbatim deterministic", r.headline === det.headline && r.mode === "deterministic");
}

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Revenue Companion narrative eval: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All Revenue Companion narrative checks passed.");
console.log("=".repeat(70));
