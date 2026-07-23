// VentureOS — Demo Mode · Presentation contract + copy eval
// =========================================================
// Deterministic, dependency-free evaluation proving the web Demo Mode is a
// faithful, truthful, read-only consumer of the committed governed journeys.
// It asserts on DATA and PURE HELPERS only — the eval runtime strips TypeScript
// types but cannot render JSX, so no component is imported here.
//
// Covers spec test cases 3–25, 32, 33 (Journey A/B invariants, replay
// truthfulness, provider status, forbidden-claim scan, technical hiding,
// schema + contract parity, negative controls).
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/demo-mode/eval/presentationContract.eval.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  validateDemoJourneysDoc,
  validatePresentationView,
  selectView,
  collectVisibleCopy,
  scanForbidden,
  narrationProjection,
  PRESENTATION_SCHEMA_VERSION,
  VIEW_FIELD_NAMES,
  type DemoJourneysDoc,
  type DemoPresentationView,
} from "../presentationContract";
import {
  safetyLabelChipClass,
  statusToneWord,
  normalizeStatusTone,
} from "../../../components/demo-mode/tone";

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
const GENERATED = resolve(HERE, "../data/demo-journeys.generated.json");

const raw = readFileSync(GENERATED, "utf8");
const doc = JSON.parse(raw) as DemoJourneysDoc;

const journeyA = doc.journeys.find((j) => j.key === "a")!;
const journeyB = doc.journeys.find((j) => j.key === "b")!;

function textOf(view: DemoPresentationView): string {
  return collectVisibleCopy(view, { showTechnical: true }).join("\n").toLowerCase();
}

// ===========================================================================
console.log("\n[1] Document shape, schema + contract parity (cases 32, 33)");
// ===========================================================================
{
  const r = validateDemoJourneysDoc(doc);
  check("generated document validates against the contract", r.ok, r.errors.join("; "));
  check("schema version preserved (1.0)", doc.schemaVersion === PRESENTATION_SCHEMA_VERSION);
  check("exactly two journeys", doc.journeys.length === 2);
  check("default journey key is a", doc.defaultJourneyKey === "a");
  check("view field set has 16 fields", VIEW_FIELD_NAMES.length === 16);
  for (const j of doc.journeys) {
    check(`${j.key}: view schemaVersion preserved`, j.view.schemaVersion === "1.0");
    check(`${j.key}: no snake_case key in view`,
      !Object.keys(j.view).some((k) => k.includes("_")));
  }
}

// ===========================================================================
console.log("\n[2] Journey A — live single-source governed stop (cases 3,5–9)");
// ===========================================================================
{
  const v = journeyA.view;
  check("A validates", validatePresentationView(v).ok);
  check("A governed stop is positive (status tone success)", v.statusTone === "success");
  check("A governance label reads as a governed stop",
    v.governanceLabel.toLowerCase().includes("governed stop"));
  check("A approval not reached", v.approvalLabel.toLowerCase().includes("not reached"));
  check("A no execution", v.executionLabel.toLowerCase().includes("no execution"));
  check("A no receipt", !v.executionLabel.toLowerCase().includes("receipt recorded"));
  check("A safety includes No CRM write-back", v.safetyDisclosures.includes("No CRM write-back"));
  check("A safety includes Single-source identity",
    v.safetyDisclosures.includes("Single-source identity"));
  check("A safety includes Governed stop", v.safetyDisclosures.includes("Governed stop"));
  check("A has NO replay-duplicate safety label",
    !v.safetyDisclosures.includes("Replay -- no duplicate action"));
  check("A supports no replay toggle", journeyA.supportsReplayEvidenceToggle === false);
  check("A has no replay-validated view", journeyA.replayValidatedView === null);
  check("A status tone word is a governed outcome", statusToneWord(v.statusTone) === "Governed outcome");
}

// ===========================================================================
console.log("\n[3] Journey B default — controlled simulated execution (cases 4,10–15)");
// ===========================================================================
{
  const v = journeyB.view;
  check("B validates", validatePresentationView(v).ok);
  check("B controlled offline corroboration disclosed",
    v.evidenceItems.some((e) => e.toLowerCase().includes("controlled offline")));
  check("B safety includes Controlled offline corroboration",
    v.safetyDisclosures.includes("Controlled offline corroboration"));
  check("B explicit human approval", v.approvalLabel.toLowerCase().includes("human approved"));
  check("B safety includes Human approved", v.safetyDisclosures.includes("Human approved"));
  check("B simulated execution", v.executionLabel.toLowerCase().includes("simulated execution"));
  check("B safety includes Simulated execution", v.safetyDisclosures.includes("Simulated execution"));
  check("B no CRM write-back label", v.safetyDisclosures.includes("No CRM write-back"));
  check("B not live multi-source label",
    v.safetyDisclosures.includes("Not live multi-source execution"));
  check("B raw replay is 'not observed'", v.replayLabel.toLowerCase().includes("not observed"));
  check("B default has NO replay-duplicate label",
    !v.safetyDisclosures.includes("Replay -- no duplicate action"));
  check("B audit chain verified", v.auditLabel.toLowerCase().includes("audit chain verified"));
}

// ===========================================================================
console.log("\n[4] Replay truthfulness + toggle (cases 16, 17, 18)");
// ===========================================================================
{
  check("B supports replay toggle", journeyB.supportsReplayEvidenceToggle === true);
  const rv = journeyB.replayValidatedView!;
  check("B has a replay-validated view", rv !== null);
  check("replay-validated says 'validated separately'",
    rv.replayLabel.toLowerCase().includes("validated separately"));
  check("replay-validated adds the replay-duplicate label",
    rv.safetyDisclosures.includes("Replay -- no duplicate action"));
  check("replay-validated is still simulated (not upgraded to real)",
    rv.executionLabel.toLowerCase().includes("simulated execution"));
  check("replay-validated still has No CRM write-back",
    rv.safetyDisclosures.includes("No CRM write-back"));

  // Toggle OFF by default: selectView(false) returns the default view (no label);
  // toggle ON returns the separately-validated view.
  const off = selectView(journeyB, false);
  const on = selectView(journeyB, true);
  check("toggle OFF selects the default view (replay not observed)",
    off.replayLabel.toLowerCase().includes("not observed"));
  check("toggle OFF omits the replay-duplicate label",
    !off.safetyDisclosures.includes("Replay -- no duplicate action"));
  check("toggle ON selects the separately-validated view",
    on.replayLabel.toLowerCase().includes("validated separately"));
  // Journey A ignores the toggle entirely (no evidence to show).
  check("Journey A toggle ON still returns its single view",
    selectView(journeyA, true) === journeyA.view);
}

// ===========================================================================
console.log("\n[5] Provider status + NVIDIA never authority (cases 19, 20, 21)");
// ===========================================================================
{
  for (const v of [journeyA.view, journeyB.view]) {
    check("provider unconfigured shown", v.providerLabel.toLowerCase().includes("unconfigured"));
  }
  // "Deterministic fallback" is a supported, recognised caution label.
  check("deterministic fallback is a recognised caution label",
    safetyLabelChipClass("Deterministic fallback").includes("amber"));
  // NVIDIA never asserted as authority anywhere.
  for (const v of [journeyA.view, journeyB.view, journeyB.replayValidatedView!]) {
    const t = textOf(v);
    check("no 'nvidia decided' claim", !t.includes("nvidia decided"));
    check("no 'ai approved' claim", !t.includes("ai approved"));
  }
}

// ===========================================================================
console.log("\n[6] Technical details hidden by default + no raw JSON (cases 22–24)");
// ===========================================================================
{
  for (const j of doc.journeys) {
    const views = [j.view, j.replayValidatedView].filter(Boolean) as DemoPresentationView[];
    for (const v of views) {
      const hidden = collectVisibleCopy(v, { showTechnical: false });
      const shown = collectVisibleCopy(v, { showTechnical: true });
      check(`${j.key}: technical details hidden by default`,
        !v.technicalDetails.some((d) => hidden.includes(d)));
      check(`${j.key}: source reference hidden by default`,
        !hidden.includes(v.sourceResultReference));
      check(`${j.key}: technical details shown when revealed`,
        v.technicalDetails.every((d) => shown.includes(d)));
      check(`${j.key}: no visible copy is a raw JSON blob`,
        !hidden.some((s) => s.trim().startsWith("{") || s.trim().startsWith("[")));
    }
  }
}

// ===========================================================================
console.log("\n[7] Forbidden-claim scan across every view (case 25)");
// ===========================================================================
{
  for (const j of doc.journeys) {
    const views = [j.view, j.replayValidatedView].filter(Boolean) as DemoPresentationView[];
    for (const v of views) {
      const hit = scanForbidden(v);
      check(`${j.key}: no forbidden claim (${hit ?? "none"})`, hit === null);
    }
  }
}

// ===========================================================================
console.log("\n[8] Narration projection is complete and non-empty");
// ===========================================================================
{
  const n = narrationProjection(journeyA.view);
  const values = Object.values(n);
  check("narration has 9 fields", values.length === 9);
  check("all narration fields non-empty", values.every((s) => typeof s === "string" && s.length > 0));
}

// ===========================================================================
console.log("\n[9] Negative controls — validator fails closed on drift");
// ===========================================================================
{
  const good = journeyB.view;
  // snake_case leak.
  const snake = { ...good, source_result_reference: good.sourceResultReference } as unknown;
  check("snake_case contract key rejected", validatePresentationView(snake).ok === false);
  // missing required field.
  const { headline, ...noHeadline } = good as unknown as Record<string, unknown>;
  void headline;
  check("missing headline rejected", validatePresentationView(noHeadline).ok === false);
  // forbidden claim injected.
  const forbidden = { ...good, headline: "The CRM action completed automatically." };
  check("forbidden claim rejected", validatePresentationView(forbidden).ok === false);
  // wrong schema version.
  const badVer = { ...good, schemaVersion: "9.9" };
  check("wrong schema version rejected", validatePresentationView(badVer).ok === false);
  // replay-validated present while toggle false at journey level.
  const badJourney = {
    ...journeyA,
    replayValidatedView: journeyB.view,
  };
  check("replay-validated present without toggle rejected",
    validateDemoJourneysDoc({ ...doc, journeys: [badJourney, journeyB] }).ok === false);
  // unexpected extra field.
  const extra = { ...good, secretField: "x" } as unknown;
  check("unexpected extra field rejected", validatePresentationView(extra).ok === false);
}

// ===========================================================================
console.log("\n[10] No secret / local-path leak in the generated document");
// ===========================================================================
{
  const secretRe = /nvapi-|Bearer |api[_-]?key|authorization|password|[A-Za-z]:\\|\/home\/|\/tmp\//i;
  check("no secret markers in generated JSON", !secretRe.test(raw));
  check("no windows user path in generated JSON", !raw.includes("\\Users\\"));
  check("no sqlite/db file path in generated JSON",
    !raw.includes(".sqlite") && !raw.includes(".db\""));
  // status tone always normalises to a known bucket.
  for (const j of doc.journeys) {
    check(`${j.key}: status tone normalises`,
      ["success", "caution", "critical", "neutral"].includes(normalizeStatusTone(j.view.statusTone)));
  }
}

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Demo Mode presentation contract eval: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All Demo Mode presentation contract checks passed.");
console.log("=".repeat(70));
