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
  shouldShowCanonicalMissionFallback,
  hasUsableSelectedMission,
  isRealGovernedDecisionEngine,
  CUREFOODS_MISSION_ENTRY,
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
console.log("\n[9] Today's Mission canonical fallback — Option B: mock/synthetic -> Curefoods authoritative");
// ===========================================================================
// Canonical hosted policy (Option B): the truthful Curefoods governed entry is
// AUTHORITATIVE on Today's Mission whenever the legacy decision engine is mock or
// synthetic — cold, unavailable, warm, mock, synthetic, empty, OR returning a
// mock legacy mission (e.g. "Tessera DocOnline"). Only a PROVEN real, non-mock,
// non-synthetic governed mission with compatible identifiers is allowed to defer.
// The decision is based on product readiness + engine realness, NEVER on API
// reachability. This matrix reproduces the exact Production regression and the new
// Option B requirement.

// -- isRealGovernedDecisionEngine contract --
const mockEngine = isRealGovernedDecisionEngine({ modelProvider: "mock", dataSourceMode: "synthetic", dataSourceLabel: "HubSpot test CRM" });
const realEngine = isRealGovernedDecisionEngine({ modelProvider: "nim", dataSourceMode: "live", dataSourceLabel: "Salesforce Production" });
check("engine: null descriptor is not real governed", isRealGovernedDecisionEngine(null) === false);
check("engine: undefined descriptor is not real governed", isRealGovernedDecisionEngine(undefined) === false);
check("engine: mock provider + synthetic dataset is not real", mockEngine === false);
check("engine: mock provider alone is not real", isRealGovernedDecisionEngine({ modelProvider: "mock" }) === false);
check("engine: empty provider is not real", isRealGovernedDecisionEngine({ modelProvider: "", dataSourceMode: "live" }) === false);
check("engine: real provider + synthetic dataset is not real", isRealGovernedDecisionEngine({ modelProvider: "nim", dataSourceMode: "synthetic" }) === false);
check("engine: real provider + test label is not real", isRealGovernedDecisionEngine({ modelProvider: "nim", dataSourceMode: "live", dataSourceLabel: "HubSpot test CRM" }) === false);
check("engine: real provider + no dataset mode is not real (must be proven live)", isRealGovernedDecisionEngine({ modelProvider: "nim" }) === false);
check("engine: real provider + live dataset IS real governed", realEngine === true);
check("engine: deterministic provider is treated as mock", isRealGovernedDecisionEngine({ modelProvider: "deterministic", dataSourceMode: "live" }) === false);

// -- hasUsableSelectedMission contract (Option B: realness gate first) --
const validRec = { account_id: "ACC-0016", recommendation_id: "REC-CUREFOODS-1", account_name: "Curefoods" };
const usable = (realGoverned: boolean, rec: typeof validRec | null, resolved?: boolean) =>
  hasUsableSelectedMission({ decisionEngineIsRealGoverned: realGoverned, selectedRecommendation: rec, selectedAccountResolved: resolved });
check("mock engine + valid selected mission is NOT usable (Option B)", usable(false, validRec) === false);
check("mock engine + valid mock legacy mission is NOT usable (Tessera case)", usable(false, validRec) === false);
check("real engine + no selected recommendation is not usable", usable(true, null) === false);
check("real engine + valid selected mission is usable", usable(true, validRec) === true);
check("real engine + missing mission id is not usable", usable(true, { account_id: "ACC-0016", recommendation_id: "", account_name: "Curefoods" }) === false);
check("real engine + missing account id is not usable", usable(true, { account_id: " ", recommendation_id: "REC-1", account_name: "Curefoods" }) === false);
check("real engine + missing name is not renderable", usable(true, { account_id: "ACC-0016", recommendation_id: "REC-1", account_name: "" }) === false);
check("real engine + explicitly unresolved account is not usable", usable(true, validRec, false) === false);
check("default (no engine flag) + valid mission is NOT usable", hasUsableSelectedMission({ selectedRecommendation: validRec }) === false);

// -- behaviour matrix (Option B) --
const fb = (isTodaysMissionView: boolean, usableMission: boolean) =>
  shouldShowCanonicalMissionFallback({ isTodaysMissionView, hasUsableSelectedMission: usableMission });
const mockNoMission = usable(false, null);
const mockLegacyMission = usable(false, validRec); // reachable mock backend returns Tessera
const realValidMission = usable(true, validRec);
const realNoMission = usable(true, null);

check("[m1] API unreachable + no mission -> Curefoods fallback", fb(true, mockNoMission) === true);
check("[m2] API reachable + mock/synthetic + no mission -> Curefoods fallback", fb(true, mockNoMission) === true);
check("[m3] API reachable + mock legacy mission (Tessera) -> Curefoods fallback (Option B)", fb(true, mockLegacyMission) === true);
check("[m4] API reachable + PROVEN real governed + valid mission -> defer to backend", fb(true, realValidMission) === false);
check("[m5] API reachable + real governed engine + no mission yet -> Curefoods fallback", fb(true, realNoMission) === true);
check("[m6] mock provider + valid selected mission -> Curefoods authoritative", fb(true, mockLegacyMission) === true);
check("[m7] synthetic dataset + valid selected mission -> Curefoods authoritative", fb(true, mockLegacyMission) === true);
check("[m8] unrelated root view -> no fallback (backend status stays visible)", fb(false, mockNoMission) === false);
check("[m8b] canonical unavailable -> no fallback even with no mission", shouldShowCanonicalMissionFallback({ isTodaysMissionView: true, hasUsableSelectedMission: false, canonicalMissionAvailable: false }) === false);

const entry = CUREFOODS_MISSION_ENTRY;
check("entry account reuses canonical Curefoods name", entry.accountName === CUREFOODS_CANONICAL.canonicalName && entry.accountName === "Curefoods", entry.accountName);
check("entry shows the renewal protection mission", entry.missionTitle === "Renewal protection mission", entry.missionTitle);
check("entry is truthfully labelled a deterministic governed demo", entry.truthLabel === "Deterministic governed demo mission", entry.truthLabel);
check("entry status reads governed mission ready for review", entry.status.toLowerCase().includes("governed mission ready for review"), entry.status);
check("entry CTA wording matches Today's Mission CTA", entry.ctaLabel === "Open governed mission", entry.ctaLabel);
check("entry states why now with evidence categories", /account-health|renewal-timeline|usage-trend/.test(entry.whyNow), entry.whyNow);
check("entry does not claim live CRM data", !/live crm|from your crm|synced from/i.test(`${entry.whyNow} ${entry.status} ${entry.truthLabel}`));
scanForbidden("canonical entry", `${entry.priorityLabel} ${entry.accountName} ${entry.missionTitle} ${entry.whyNow} ${entry.status} ${entry.truthLabel} ${entry.ctaLabel}`);

// [m9] CTA safe identifiers unchanged; [m10] direct /mission-control unchanged
const entryHref = buildMissionControlHref(null);
check("[m9] entry CTA carries safe canonical identifiers", entryHref === "/mission-control?account=VOS-CUREFOODS&mission=M-RENEWAL-1&from=todays-mission", entryHref);
const entryParams = new URLSearchParams(entryHref.split("?")[1] ?? "");
check("[m10] CTA params are exactly account+mission+from", [...entryParams.keys()].sort().join(",") === "account,from,mission", [...entryParams.keys()].join(","));
// [m11] continuity cue unchanged
const cueValidation = validateIncomingMissionContext({ account: "VOS-CUREFOODS", mission: "M-RENEWAL-1", from: "todays-mission" });
const entryCue = continuityCue(cueValidation);
check("[m11] continuity cue reads continuing from Today's Mission", !!entryCue && entryCue.title.includes("Continuing from Today's Mission — Curefoods renewal"), entryCue?.title ?? "null");
check("[m11] continuity cue states nothing was re-selected", !!entryCue && entryCue.detail.toLowerCase().includes("nothing was re-selected"));
// [m12] no unsupported business claims — covered by scanForbidden above
// [m13] no secret or payload data in the CTA URL
check("[m13] CTA URL carries no secret/payload/token/hash/evidence", !/token|hash|evidence|payload|secret|apikey|key=/i.test(entryHref), entryHref);

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
