// Release 2.3 — NVIDIA-Grounded Mission Intelligence · deterministic evals
// ========================================================================
// Proves the grounded-narrative slice: strict contracts, deterministic mock,
// the grounding guard's accept/reject rules, and the fail-closed pipeline that
// NEVER lets a model touch a governed fact. Pure, dependency-free, deterministic
// (same input -> same verdict). Run under the shared eval loader:
//
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/nvidia/eval/nvidiaNarrative.eval.ts

import { RENEWAL_DEMO_PAYLOAD } from "../../missions/demo";
import type { PersonaResponse } from "../../conversation/types";
import { composeMockNarrative, mockNarrativeProvider, MOCK_MODEL } from "../mockProvider";
import { validateGroundedNarrative, normalizeText } from "../grounding";
import {
  buildNarrativeRequest,
  buildDeterministicFallback,
  groundMissionNarrative,
  FALLBACK_MODEL,
} from "../narrative";
import { selectNarrativeProvider } from "../provider";
import type {
  NvidiaGroundedNarrative,
  NvidiaNarrativeProvider,
  NvidiaNarrativeRequest,
} from "../types";
import { NVIDIA_VOICE_SUMMARY_MAX_CHARS } from "../types";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const clone = (n: NvidiaGroundedNarrative): NvidiaGroundedNarrative =>
  JSON.parse(JSON.stringify(n));

// A minimal PersonaResponse (only voiceSummary is read by the fallback builder).
const persona = {
  personaId: "persona-renewal_risk",
  intent: "risk_review",
  voiceSummary: "Curefoods is at renewal risk; prepare renewal outreach. All actions are simulated.",
  segments: [],
  citations: [],
} as unknown as PersonaResponse;

const REQUEST_INPUT = {
  payload: RENEWAL_DEMO_PAYLOAD,
  personaResponse: persona,
  requestId: "REQ-EVAL-1",
  correlationId: "CORR-EVAL-1",
};

const request: NvidiaNarrativeRequest = buildNarrativeRequest(REQUEST_INPUT);

// ---------------------------------------------------------------------------
// 1. Request build — governed facts forwarded, no decision authority added
// ---------------------------------------------------------------------------
check("request.schemaVersion is 1.0", request.schemaVersion === "1.0");
check("request forwards missionId", request.missionId === RENEWAL_DEMO_PAYLOAD.missionId);
check(
  "request forwards canonical account",
  request.canonicalAccount.ventureOsId === "VOS-CUREFOODS" &&
    request.canonicalAccount.canonicalName === "Curefoods",
);
check(
  "request recommendation matches governed actionType (unchanged)",
  request.recommendation.actionType === RENEWAL_DEMO_PAYLOAD.recommendation.actionType,
);
check(
  "request permittedActions mirror governed set (unchanged)",
  JSON.stringify(request.permittedActions.map((a) => a.actionId)) ===
    JSON.stringify(RENEWAL_DEMO_PAYLOAD.permittedActions),
);
check(
  "request evidenceRefs mirror governed evidence recordIds",
  JSON.stringify(request.evidenceRefs) ===
    JSON.stringify(RENEWAL_DEMO_PAYLOAD.evidenceRefs.map((e) => e.recordId)),
);
check("request executionMode is simulated", request.executionMode === "simulated");
check(
  "request carries business labels (template)",
  request.selectedMission.businessLabel === "Renewal protection mission",
);
check(
  "verificationSummary reflects 3 of 3 checks",
  request.verificationSummary === "3 of 3 governance checks passed",
);

// ---------------------------------------------------------------------------
// 2. Mock provider — deterministic + grounded
// ---------------------------------------------------------------------------
const mock1 = composeMockNarrative(request);
const mock2 = composeMockNarrative(request);
check("mock is byte-identical for identical input", JSON.stringify(mock1) === JSON.stringify(mock2));
check("mock provider name is mock", mock1.provider === "mock");
check("mock model id is stable", mock1.model === MOCK_MODEL);
check("mock evidenceRefs are a subset of request", mock1.evidenceRefs.every((r) => request.evidenceRefs.includes(r)));
check("mock voiceSummary within bound", mock1.voiceSummary.length <= NVIDIA_VOICE_SUMMARY_MAX_CHARS);
check(
  "mock preserves simulation language",
  /simulat/.test(normalizeText(mock1.approvalExplanation + " " + mock1.caveats.join(" "))),
);

const mockGuard = validateGroundedNarrative(request, mock1);
check("guard accepts the mock narrative", mockGuard.valid && mockGuard.status === "grounded", mockGuard.errors.join(","));
check("guard accepts all mock evidence refs", mockGuard.acceptedEvidenceRefs.length === request.evidenceRefs.length);

// ---------------------------------------------------------------------------
// 3. Guard — rejects ungrounded / false-authority / foreign-action claims
// ---------------------------------------------------------------------------
const emailSent = clone(mock1);
emailSent.whatChanged = "The renewal email was sent to the customer this morning.";
const gEmail = validateGroundedNarrative(request, emailSent);
check("guard rejects 'email sent' execution claim", !gEmail.valid && gEmail.status === "rejected");
check("guard reports the rejected execution claim", gEmail.rejectedClaims.length > 0);

const crmWritten = clone(mock1);
crmWritten.riskExplanation = "We updated the CRM opportunity record to closed-lost.";
check("guard rejects CRM-write claim", !validateGroundedNarrative(request, crmWritten).valid);

const alreadyApproved = clone(mock1);
alreadyApproved.approvalExplanation = "The mission has been approved and the action was executed.";
check("guard rejects false 'already approved' claim", !validateGroundedNarrative(request, alreadyApproved).valid);

const selfAuthority = clone(mock1);
selfAuthority.approvalExplanation = "I authorized the renewal outreach; no approval needed.";
check("guard rejects self-authority claim", !validateGroundedNarrative(request, selfAuthority).valid);

const foreignAction = clone(mock1);
foreignAction.recommendationRationale = "VentureOS also issued a discount and scheduled a meeting.";
const gForeign = validateGroundedNarrative(request, foreignAction);
check("guard rejects unapproved action (discount)", !gForeign.valid);
check(
  "guard names the unapproved action",
  gForeign.errors.some((e) => e.startsWith("unapproved_action")),
);

const badRef = clone(mock1);
badRef.evidenceRefs = ["evidence://M-RENEWAL-1/does_not_exist"];
const gRef = validateGroundedNarrative(request, badRef);
check("guard rejects ungrounded evidence ref", !gRef.valid);
check("guard accepts no ungrounded ref", gRef.acceptedEvidenceRefs.length === 0);

const badNumber = clone(mock1);
badNumber.riskExplanation = "Revenue dropped 40% and churn rose 12 points last quarter.";
const gNum = validateGroundedNarrative(request, badNumber);
check("guard rejects fabricated metrics", !gNum.valid);
check(
  "guard flags the ungrounded number",
  gNum.errors.some((e) => e.startsWith("ungrounded_number")),
);

const malformed = clone(mock1);
malformed.whatChanged = "";
const gMal = validateGroundedNarrative(request, malformed);
check("guard flags malformed (empty field)", !gMal.valid && gMal.status === "malformed");

// Word-order tolerance: not exact-string matching.
const reordered = clone(mock1);
reordered.whatChanged = "To the customer, an email was already sent.";
check("guard catches reordered execution claim", !validateGroundedNarrative(request, reordered).valid);

// ---------------------------------------------------------------------------
// 4. Fallback — deterministic VentureOS baseline
// ---------------------------------------------------------------------------
const fb1 = buildDeterministicFallback(request, persona);
const fb2 = buildDeterministicFallback(request, persona);
check("fallback is deterministic", JSON.stringify(fb1) === JSON.stringify(fb2));
check("fallback flagged fallbackUsed", fb1.fallbackUsed === true);
check("fallback provider is ventureos-deterministic", fb1.provider === "ventureos-deterministic");
check("fallback model id is stable", fb1.model === FALLBACK_MODEL);
check("fallback passes the guard structurally", validateGroundedNarrative(request, fb1).status !== "malformed");
check("fallback voiceSummary within bound", fb1.voiceSummary.length <= NVIDIA_VOICE_SUMMARY_MAX_CHARS);

// ---------------------------------------------------------------------------
// 5. Pipeline — present validated, else fail closed to the baseline
// ---------------------------------------------------------------------------
async function run(): Promise<void> {
  const ok = await groundMissionNarrative(REQUEST_INPUT, mockNarrativeProvider);
  check("pipeline mock path is grounded", ok.narrative.grounded && !ok.narrative.fallbackUsed);
  check("pipeline mock path validationStatus grounded", ok.narrative.validationStatus === "grounded");
  check("pipeline mock path is deterministic", JSON.stringify(
    (await groundMissionNarrative(REQUEST_INPUT, mockNarrativeProvider)).narrative,
  ) === JSON.stringify(ok.narrative));

  const throwing: NvidiaNarrativeProvider = {
    name: "nim",
    model: "throws",
    generate: () => Promise.reject(new Error("provider down")),
  };
  const down = await groundMissionNarrative(REQUEST_INPUT, throwing);
  check("pipeline falls back when provider throws", down.narrative.fallbackUsed === true);
  check("pipeline fallback provider is deterministic baseline", down.narrative.provider === "ventureos-deterministic");

  const badProvider: NvidiaNarrativeProvider = {
    name: "nim",
    model: "bad",
    generate: (req) => {
      const bad = composeMockNarrative(req);
      bad.whatChanged = "The email was sent and the CRM was updated in production.";
      return Promise.resolve(bad);
    },
  };
  const rejected = await groundMissionNarrative(REQUEST_INPUT, badProvider);
  check("pipeline falls back when guard rejects", rejected.narrative.fallbackUsed === true);
  check("pipeline reports guard invalid on reject", rejected.grounding.valid === false);

  // Provider selection.
  check("selects mock by default", selectNarrativeProvider({}).name === "mock");
  check("selects mock explicitly", selectNarrativeProvider({ mode: "mock" }).name === "mock");
  check("nim declared but not implemented -> falls back", (await groundMissionNarrative(
    REQUEST_INPUT,
    selectNarrativeProvider({ mode: "nim" }),
  )).narrative.fallbackUsed === true);

  // Governance is never mutated by the narrative layer.
  check(
    "governed payload recommendation unchanged after pipeline",
    RENEWAL_DEMO_PAYLOAD.recommendation.actionType === "renewal_outreach",
  );
  check(
    "narrative carries no governance decision fields",
    !("actionType" in (ok.narrative as unknown as Record<string, unknown>)) &&
      !("missionState" in (ok.narrative as unknown as Record<string, unknown>)),
  );

  console.log("\n" + "=".repeat(70));
  console.log(`NVIDIA grounded-narrative evaluation: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    console.log("FAILURES:");
    for (const f of failures) console.log("  - " + f);
    console.log("=".repeat(70));
    process.exit(1);
  }
  console.log("All NVIDIA narrative checks passed. Presentation-only, governance untouched.");
  console.log("=".repeat(70));
}

void run();
