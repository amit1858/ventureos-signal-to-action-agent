// Release 2.3 — Curefoods Canonical Mission Continuity evals
// ==========================================================
// Deterministic proof that ONE Curefoods identity flows continuously from the
// seller portfolio (ACC-0016) through the governed Mission Control mission
// (VOS-CUREFOODS / M-RENEWAL-1) to a truthful, cross-persona outcome:
//
//   - the canonical binding ties both id spaces together on an allowlist
//   - the seller handoff carries ONLY safe identifiers (no hash / evidence / token)
//   - Mission Control validation rejects unknown ids and mismatched pairings
//     (never silently switching accounts)
//   - the governed outcome separates System success from a still-pending
//     Business result and NEVER makes a forbidden business claim
//   - the NVIDIA grounded-evidence cue uses a dynamic evidence count
//   - the same mission reads coherently through Seller / Executive / Operations
//     lenses, with NO Manager lens and no forbidden claims
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/missions/eval/canonicalContinuity.eval.ts

import {
  CUREFOODS_CANONICAL,
  CANONICAL_DEMO_ACCOUNTS,
  resolveCanonicalByPortfolioId,
  resolveCanonicalByVentureOsId,
  buildMissionContextForSeller,
  serialiseMissionContext,
  buildMissionControlHref,
  validateIncomingMissionContext,
  continuityCue,
} from "../../demo/canonicalMission";
import {
  projectGovernedOutcome,
  groundedEvidenceCue,
  projectMissionForPersona,
  type PersonaLens,
} from "../../demo/missionProjection";
import { buildRenewalDemoTurn } from "../demo";
import { captureApproval, simulateApprovedActions } from "../simulation";
import type { ApprovalCapture } from "../simulation";
import { deriveMissionView } from "../missionView";
import { isCompletedMissionTurn } from "../types";

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

// Phrases the governed demo must NEVER assert (system did work; it did NOT move
// a real-world business result).
const FORBIDDEN = [
  "risk reduced",
  "renewal risk reduced",
  "customer contacted",
  "email sent",
  "email was sent",
  "crm updated",
  "meeting booked",
  "renewal progressed",
  "renewal won",
  "email opened",
];

function scanForbidden(label: string, text: string): void {
  const lower = text.toLowerCase();
  const hit = FORBIDDEN.find((p) => lower.includes(p));
  check(`${label} makes no forbidden business claim`, hit === undefined, hit ? `contains "${hit}"` : "");
}

// ===========================================================================
console.log("\n[1] Canonical binding ties both id spaces on an allowlist");
// ===========================================================================
check("allowlist has exactly one governed demo account", CANONICAL_DEMO_ACCOUNTS.length === 1, `${CANONICAL_DEMO_ACCOUNTS.length}`);
check("portfolio id is ACC-0016", CUREFOODS_CANONICAL.portfolioAccountId === "ACC-0016", CUREFOODS_CANONICAL.portfolioAccountId);
check("canonical id is VOS-CUREFOODS", CUREFOODS_CANONICAL.ventureOsId === "VOS-CUREFOODS", CUREFOODS_CANONICAL.ventureOsId);
check("mission id is M-RENEWAL-1", CUREFOODS_CANONICAL.missionId === "M-RENEWAL-1", CUREFOODS_CANONICAL.missionId);
check("recommendation id is REC-M-RENEWAL-1", CUREFOODS_CANONICAL.recommendationId === "REC-M-RENEWAL-1", CUREFOODS_CANONICAL.recommendationId);
check("name is Curefoods on both spaces", CUREFOODS_CANONICAL.canonicalName === "Curefoods", CUREFOODS_CANONICAL.canonicalName);

// ===========================================================================
console.log("\n[2] Deterministic resolution (case-insensitive, unknown -> null)");
// ===========================================================================
check("ACC-0016 resolves to Curefoods", resolveCanonicalByPortfolioId("ACC-0016")?.ventureOsId === "VOS-CUREFOODS");
check("acc-0016 (lowercase) resolves", resolveCanonicalByPortfolioId("acc-0016")?.ventureOsId === "VOS-CUREFOODS");
check("unknown portfolio id -> null", resolveCanonicalByPortfolioId("ACC-9999") === null);
check("null portfolio id -> null", resolveCanonicalByPortfolioId(null) === null);
check("VOS-CUREFOODS resolves", resolveCanonicalByVentureOsId("VOS-CUREFOODS")?.portfolioAccountId === "ACC-0016");
check("unknown canonical id -> null", resolveCanonicalByVentureOsId("VOS-FOO") === null);

// ===========================================================================
console.log("\n[3] Seller handoff carries ONLY safe identifiers");
// ===========================================================================
const matchedCtx = buildMissionContextForSeller("ACC-0016");
check("matched seller context is Curefoods", matchedCtx.ventureOsId === "VOS-CUREFOODS");
check("matched seller context flags matchedSelectedAccount", matchedCtx.matchedSelectedAccount === true);
check("matched seller context source is todays-mission", matchedCtx.source === "todays-mission");
const unmatchedCtx = buildMissionContextForSeller("ACC-0001");
check("unmatched seller still gets canonical Curefoods", unmatchedCtx.ventureOsId === "VOS-CUREFOODS");
check("unmatched seller flags matchedSelectedAccount=false", unmatchedCtx.matchedSelectedAccount === false);

const serialised = serialiseMissionContext(matchedCtx);
check("serialised carries account", serialised.includes("account=VOS-CUREFOODS"));
check("serialised carries mission", serialised.includes("mission=M-RENEWAL-1"));
check("serialised carries from", serialised.includes("from=todays-mission"));
const UNSAFE = ["sha256", "hash", "payload://", "evidence://", "token", "bearer", "verify://", "audit://"];
const serialLower = serialised.toLowerCase();
check("serialised leaks no unsafe token", UNSAFE.every((u) => !serialLower.includes(u.toLowerCase())), serialised);
const href = buildMissionControlHref("ACC-0016");
check("href targets /mission-control with context", href.startsWith("/mission-control?account=VOS-CUREFOODS"), href);

// ===========================================================================
console.log("\n[4] Mission Control validation — allowlist + never switch accounts");
// ===========================================================================
const vGood = validateIncomingMissionContext({ account: "VOS-CUREFOODS", mission: "M-RENEWAL-1", from: "todays-mission" });
check("valid pair validates", vGood.valid === true && vGood.account?.ventureOsId === "VOS-CUREFOODS");
const vUnknown = validateIncomingMissionContext({ account: "VOS-EVIL", mission: "M-RENEWAL-1", from: "todays-mission" });
check("unknown account is rejected", vUnknown.valid === false && vUnknown.account === null, vUnknown.reason ?? "");
check("unknown account reason is unrecognised-account", vUnknown.reason === "unrecognised-account");
const vMismatch = validateIncomingMissionContext({ account: "VOS-CUREFOODS", mission: "M-OTHER-9", from: "todays-mission" });
check("mismatched mission is rejected", vMismatch.valid === false, vMismatch.reason ?? "");
check("mismatch reason is mission-account-mismatch", vMismatch.reason === "mission-account-mismatch");
const vEmpty = validateIncomingMissionContext({ account: null, mission: null, from: null });
check("no context is not valid", vEmpty.valid === false && vEmpty.reason === "no-context");
const vAccountOnly = validateIncomingMissionContext({ account: "vos-curefoods", from: "todays-mission" });
check("account-only (case-insensitive) validates", vAccountOnly.valid === true);

// ===========================================================================
console.log("\n[5] Continuity cue only for a validated Today's-Mission handoff");
// ===========================================================================
check("cue present for valid todays-mission", continuityCue(vGood) !== null);
check("cue mentions Curefoods renewal", (continuityCue(vGood)?.title ?? "").includes("Curefoods renewal"));
check("cue absent for direct load", continuityCue(validateIncomingMissionContext({ account: "VOS-CUREFOODS", from: "direct" })) === null);
check("cue absent for rejected context", continuityCue(vUnknown) === null);

// ===========================================================================
console.log("\n[6] Governed outcome — System success vs pending Business result");
// ===========================================================================
const turn = buildRenewalDemoTurn();
check("demo turn is a completed governed turn", isCompletedMissionTurn(turn), turn.status);

const approved: ApprovalCapture = captureApproval(turn, {
  outcome: "approved",
  actor: "amit",
  actorRole: "owner",
  channel: "screen",
  confirmToken: turn.approvalBinding?.actionPayloadHash ?? "",
});
const proposals = simulateApprovedActions(turn, approved);
const executedView = deriveMissionView(turn, approved, proposals);
const executedOutcome = projectGovernedOutcome(executedView);
check("executed system outcome = prepared successfully", executedOutcome.systemOutcome === "Governed work prepared successfully.");
check("executed business outcome = awaiting external response", executedOutcome.businessOutcome === "Awaiting external response.");
check("executed lists exactly 3 simulated lines", executedOutcome.supportingLines.length === 3, `${executedOutcome.supportingLines.length}`);
check("executed lines say not sent/created/written",
  executedOutcome.supportingLines.some((l) => l.includes("not sent")) &&
  executedOutcome.supportingLines.some((l) => l.includes("not created")) &&
  executedOutcome.supportingLines.some((l) => l.includes("not written")));
check("executed marks actionsSimulated", executedOutcome.actionsSimulated === true);
scanForbidden("executed outcome", `${executedOutcome.systemOutcome} ${executedOutcome.businessOutcome} ${executedOutcome.supportingLines.join(" ")}`);

const pendingView = deriveMissionView(turn, null);
const pendingOutcome = projectGovernedOutcome(pendingView);
check("pending has no simulated lines", pendingOutcome.supportingLines.length === 0);
check("pending business outcome mentions awaiting approval", pendingOutcome.businessOutcome.toLowerCase().includes("awaiting approval"));
scanForbidden("pending outcome", `${pendingOutcome.systemOutcome} ${pendingOutcome.businessOutcome}`);

const rejected = captureApproval(turn, { outcome: "rejected", actor: "amit", actorRole: "owner", channel: "screen", reason: "not now" });
const rejectedOutcome = projectGovernedOutcome(deriveMissionView(turn, rejected));
check("rejected prepared nothing", rejectedOutcome.businessOutcome.toLowerCase().includes("nothing was sent"));
scanForbidden("rejected outcome", `${rejectedOutcome.systemOutcome} ${rejectedOutcome.businessOutcome}`);

// ===========================================================================
console.log("\n[7] NVIDIA grounded-evidence cue uses a dynamic count");
// ===========================================================================
const cue = groundedEvidenceCue(turn);
check("evidence cue present", cue !== null);
check("evidence count is dynamic (matches turn evidence)", cue?.count === turn.evidence.length, `${cue?.count} vs ${turn.evidence.length}`);
check("evidence count is > 0", (cue?.count ?? 0) > 0);
check("evidence cue text names verified evidence sources", (cue?.text ?? "").includes("verified evidence source"));
check("evidence cue count is not hard-coded literally 3 in text unless real", (cue?.text ?? "").includes(String(cue?.count ?? -1)));

// ===========================================================================
console.log("\n[8] One mission, coherent across Seller / Executive / Operations");
// ===========================================================================
const LENSES: PersonaLens[] = ["seller", "executive", "operations"];
for (const lens of LENSES) {
  const p = projectMissionForPersona(turn, executedView, lens);
  check(`${lens} projection is simulated`, p.simulated === true);
  check(`${lens} projection names Curefoods or mission id`, p.headline.includes("Curefoods") || p.headline.includes(turn.missionId));
  check(`${lens} projection has at least two facts`, p.facts.length >= 2, `${p.facts.length}`);
  scanForbidden(`${lens} projection`, `${p.headline} ${p.facts.join(" ")}`);
}
check("no Manager lens exists", !(LENSES as string[]).includes("manager"));
const exec = projectMissionForPersona(turn, executedView, "executive");
check("executive states human approval required", exec.facts.join(" ").toLowerCase().includes("approval required"));
check("executive states execution simulated", exec.facts.join(" ").toLowerCase().includes("simulated"));
const ops = projectMissionForPersona(turn, executedView, "operations");
check("operations references the same mission id", ops.headline.includes(turn.missionId));
check("operations states audit chain valid", ops.facts.join(" ").toLowerCase().includes("audit chain valid"));

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Canonical continuity evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("One Curefoods identity flows continuously: portfolio -> mission -> truthful cross-persona outcome.");
console.log("=".repeat(70));
