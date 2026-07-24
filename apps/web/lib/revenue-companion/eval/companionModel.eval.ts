// VentureOS — Revenue Companion · View-model + groundedness eval
// ==============================================================
// Deterministic, dependency-free evaluation proving the Revenue Companion is a
// faithful, truthful, read-only RESTATEMENT of the committed governed journeys.
// It builds the companion from the REAL generated projection (both journeys) and
// asserts: governed fields are verbatim, narrative fields are grounded, labels
// are allowlisted, no forbidden claim appears, actions stay on the governed
// surface, and the groundedness validator rejects tampered models.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/revenue-companion/eval/companionModel.eval.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  buildCompanionViewModel,
  buildValidatedCompanion,
  validateCompanion,
  buildExecutiveHeadline,
  buildVoiceScript,
  reverseDisplayName,
  deriveAccountDisplayName,
  computeScriptFingerprint,
  scanVoiceScript,
  VOICE_SCRIPT_MAX_CHARS,
  COMPANION_SCHEMA_VERSION,
  COMPANION_STABLE_TIMESTAMP,
  type RevenueCompanionViewModel,
} from "../companionContract";
import {
  validateDemoJourneysDoc,
  type DemoJourneysDoc,
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
const doc = JSON.parse(readFileSync(DATA, "utf8")) as DemoJourneysDoc;

// ===========================================================================
console.log("\n[0] Source document is contract-valid");
// ===========================================================================
{
  const r = validateDemoJourneysDoc(doc);
  check("generated demo doc passes the presentation contract", r.ok, r.errors.join("; "));
  check("doc exposes two journeys", doc.journeys.length === 2);
}

function meta(key: string, title: string) {
  return { journeyKey: key, journeyTitle: title };
}

// ===========================================================================
console.log("\n[1] Both journeys build + validate deterministically");
// ===========================================================================
for (const journey of doc.journeys) {
  const vm = buildValidatedCompanion(journey.view, meta(journey.key, journey.title));
  const v = validateCompanion(vm, journey.view);
  check(`journey ${journey.key}: companion validates`, v.ok, v.errors.join("; "));
  check(`journey ${journey.key}: schema version pinned`, vm.schemaVersion === COMPANION_SCHEMA_VERSION);
  check(`journey ${journey.key}: stable (non-clock) timestamp`, vm.generatedAt === COMPANION_STABLE_TIMESTAMP);
  check(`journey ${journey.key}: deterministic narrative mode`, vm.narrativeMode === "deterministic");
  check(`journey ${journey.key}: provider labelled NVIDIA unconfigured`, vm.narrativeProvider === "NVIDIA unconfigured");

  // Governed fields verbatim from the source view.
  check(`journey ${journey.key}: governance verbatim`, vm.governanceStatus === journey.view.governanceLabel);
  check(`journey ${journey.key}: approval verbatim`, vm.approvalStatus === journey.view.approvalLabel);
  check(`journey ${journey.key}: execution verbatim`, vm.executionStatus === journey.view.executionLabel);
  check(`journey ${journey.key}: recommendation reason verbatim`, vm.recommendationReason === journey.view.recommendation);
  check(`journey ${journey.key}: evidence verbatim`, vm.evidenceItems.join("|") === journey.view.evidenceItems.join("|"));
  check(`journey ${journey.key}: safety verbatim`, vm.safety.join("|") === journey.view.safetyDisclosures.join("|"));

  // Executive headline is composed (natural language, display name), and the
  // body is the governed narrative with ONLY the approved display name applied.
  const display = deriveAccountDisplayName("curefoods-test");
  check(
    `journey ${journey.key}: headline is composed executive headline`,
    vm.narrativeHeadline === buildExecutiveHeadline(journey.view, display),
  );
  check(
    `journey ${journey.key}: body is source narrative with display name substituted`,
    reverseDisplayName(vm.narrativeBody, "curefoods-test", display) ===
      journey.view.primaryNarrative,
  );

  // Parsed identity + mission.
  check(`journey ${journey.key}: account name parsed`, vm.accountName === "curefoods-test");
  check(`journey ${journey.key}: account display name is the approved label`, vm.accountDisplayName === "Curefoods");
  check(`journey ${journey.key}: identity status present`, vm.identityStatus.length > 0);
  check(`journey ${journey.key}: narrative id equals journey key`, vm.narrativeId === journey.key);
  check(`journey ${journey.key}: presentation version pinned`, vm.presentationVersion === COMPANION_SCHEMA_VERSION);
  check(`journey ${journey.key}: account ref parsed`, vm.accountRef === "hubspot:246820626:335064019691");
  check(`journey ${journey.key}: mission id parsed`, vm.recommendedMissionId === "MSN-81690a7c4a50e237");
  check(`journey ${journey.key}: mission title allowlisted`, vm.recommendedMissionTitle === "Renewal-risk recovery mission");
  check(`journey ${journey.key}: signal label allowlisted`, vm.signalLabel === "Renewal date change");
  check(`journey ${journey.key}: urgency high`, vm.urgency === "high");

  // Business impact is grounded (source narrative, modulo the display name).
  check(
    `journey ${journey.key}: business impact grounded in narrative`,
    journey.view.primaryNarrative.includes(
      reverseDisplayName(vm.businessImpact, "curefoods-test", display),
    ) && vm.businessImpact.length > 0,
  );

  // Voice script is deterministic, bounded, identifier-free, fingerprint-locked.
  check(
    `journey ${journey.key}: voice script recomputes deterministically`,
    vm.voiceScript === buildVoiceScript(journey.view, display),
  );
  check(`journey ${journey.key}: voice script within length bound`, vm.voiceScript.length <= VOICE_SCRIPT_MAX_CHARS);
  check(`journey ${journey.key}: voice script carries no forbidden/identifier token`, scanVoiceScript(vm.voiceScript) === null);
  check(
    `journey ${journey.key}: approved fingerprint matches the script`,
    vm.approvedTextFingerprint === computeScriptFingerprint(vm.voiceScript),
  );

  // Actions stay on the governed surface — no execute/approve endpoint.
  check(`journey ${journey.key}: primary action on governed surface`, vm.primaryAction.href === "/demo/signal-to-action");
  check(`journey ${journey.key}: secondary action on governed surface`, vm.secondaryAction.href === "/demo/signal-to-action");
}

// ===========================================================================
console.log("\n[2] Journey-specific truth is preserved (no overstatement)");
// ===========================================================================
{
  const a = doc.journeys.find((j) => j.key === "a")!;
  const b = doc.journeys.find((j) => j.key === "b")!;
  const va = buildValidatedCompanion(a.view, meta("a", a.title));
  const vb = buildValidatedCompanion(b.view, meta("b", b.title));

  check("Journey A governance is a governed stop", /governed stop/i.test(va.governanceStatus));
  check("Journey A approval not reached", /not reached/i.test(va.approvalStatus));
  check("Journey A execution: no execution", /no execution/i.test(va.executionStatus));
  check("Journey B approval: human approved", /human approved/i.test(vb.approvalStatus));
  check("Journey B execution: simulated", /simulated execution/i.test(vb.executionStatus));
  check("Journey B keeps 'No CRM write-back' safety label", vb.safety.includes("No CRM write-back"));
}

// ===========================================================================
console.log("\n[3] Groundedness validator rejects tampered companions");
// ===========================================================================
{
  const j = doc.journeys[0];
  const base = buildCompanionViewModel(j.view, meta(j.key, j.title));

  function tamper(mut: (vm: RevenueCompanionViewModel) => void): boolean {
    const clone = JSON.parse(JSON.stringify(base)) as RevenueCompanionViewModel;
    mut(clone);
    return validateCompanion(clone, j.view).ok;
  }

  check("rejects an invented business impact", !tamper((vm) => { vm.businessImpact = "Revenue will grow 40% next quarter."; }));
  check("rejects a changed governance status", !tamper((vm) => { vm.governanceStatus = "Approved and executed automatically"; }));
  check("rejects a changed approval status", !tamper((vm) => { vm.approvalStatus = "AI approved"; }));
  check("rejects a forbidden claim in the narrative body", !tamper((vm) => { vm.narrativeBody = "This was a real CRM write-back."; }));
  check("rejects an off-surface action href", !tamper((vm) => { vm.primaryAction = { ...vm.primaryAction, href: "https://evil.example/execute" }; }));
  check("rejects a fabricated mission id", !tamper((vm) => { vm.recommendedMissionId = "MSN-deadbeefdeadbeef"; }));
  check("rejects tampered evidence", !tamper((vm) => { vm.evidenceItems = [...vm.evidenceItems, "Action executed in HubSpot"]; }));
  check("rejects a spoofed display name", !tamper((vm) => { vm.accountDisplayName = "MegaCorp"; }));
  check("rejects a changed identity status", !tamper((vm) => { vm.identityStatus = "Corroborated"; }));
  check("rejects a tampered voice script", !tamper((vm) => { vm.voiceScript = vm.voiceScript + " Execute the action now."; }));
  check("rejects a stale fingerprint after script edit", !tamper((vm) => { vm.voiceScript = vm.voiceScript.replace("Curefoods", "Acme"); }));
  check("rejects a mismatched fingerprint", !tamper((vm) => { vm.approvedTextFingerprint = "vcs1:00000000"; }));
  check("rejects a narrative id that is not the journey key", !tamper((vm) => { vm.narrativeId = "z"; }));
  check("accepts the untampered baseline", validateCompanion(base, j.view).ok);
}

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Revenue Companion view-model eval: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All Revenue Companion view-model checks passed.");
console.log("=".repeat(70));
