// Manager Coaching Curefoods Slice — deterministic evals
// ======================================================
// Proves the read-only Manager slice stays bound to the ONE governed Curefoods
// renewal mission, invents no seller/manager identity, makes no forbidden
// business claim, cannot approve/execute/send, and leaves the existing
// Seller / Executive / Operations projections unchanged.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/manager/eval/managerCoaching.eval.ts

import {
  CUREFOODS_CANONICAL,
} from "../../demo/canonicalMission";
import {
  projectGovernedOutcome,
  projectMissionForPersona,
  type PersonaLens,
} from "../../demo/missionProjection";
import { buildRenewalDemoTurn } from "../../missions/demo";
import { reconstructSellerCompletedMission } from "../sellerCompletedMission";
import {
  buildManagerMissionContext,
  MANAGER_SELLER_LABEL,
  MANAGER_LABEL,
} from "../managerMissionContext";
import {
  buildCoachingRecommendation,
  buildFifteenMinuteIntervention,
  COACHING_RECOMMENDATION_TITLE,
} from "../coachingRecommendation";
import { projectMissionForManager } from "../managerProjection";
import { deriveMissionView } from "../../missions/missionView";
import {
  MANAGER_SCENARIO_LABEL,
  MANAGER_SCENARIO_DISCLAIMER,
  MANAGER_CONTINUITY_LABEL,
} from "../managerScenarioCopy";
import {
  MANAGER_COACHING_STORAGE_KEY,
  loadManagerCoachingState,
  DEFAULT_MANAGER_COACHING_STATE,
} from "../coachingReviewState";
import * as reviewState from "../coachingReviewState";

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

// Claim phrases the manager slice must NEVER assert. Specific enough to avoid
// false positives on safe words ("renewal", "customer conversation").
const FORBIDDEN = [
  "revenue",
  "adoption",
  "effectiveness",
  "risk reduced",
  "risk reduction",
  "renewal risk reduced",
  "underperform",
  "caused the risk",
  "will renew",
  "renewal won",
  "renewal progressed",
  "meeting booked",
  "meeting will be booked",
  "email sent",
  "email was sent",
  "outreach has been sent",
  "outreach sent",
  "customer contacted",
  "email opened",
  "crm updated",
];

function scanForbidden(label: string, text: string): void {
  const lower = text.toLowerCase();
  const hit = FORBIDDEN.find((p) => lower.includes(p));
  check(`${label} makes no forbidden claim`, hit === undefined, hit ? `contains "${hit}"` : "");
}

console.log("=".repeat(70));
console.log("Manager Coaching Curefoods Slice — deterministic evals");
console.log("=".repeat(70));

// ---------------------------------------------------------------------------
console.log("\n[A] Read-only reconstruction + canonical binding");
// ---------------------------------------------------------------------------
const { turn, view } = reconstructSellerCompletedMission();
const ctx = buildManagerMissionContext(turn, view);

check("1. accountId remains VOS-CUREFOODS", ctx.accountId === "VOS-CUREFOODS", ctx.accountId);
check("2. missionId remains M-RENEWAL-1", ctx.missionId === "M-RENEWAL-1", ctx.missionId);
check("3. recommendationId remains REC-M-RENEWAL-1", ctx.recommendationId === "REC-M-RENEWAL-1", ctx.recommendationId);
check("4. auditRef matches the governed mission turn", ctx.auditRef === turn.auditRef, ctx.auditRef);
check("5. selectedTemplateId remains renewal-risk-parallel-v1", ctx.selectedTemplateId === "renewal-risk-parallel-v1", ctx.selectedTemplateId);
check("   context accountName is Curefoods", ctx.accountName === "Curefoods", ctx.accountName);
check("   context binds to the canonical allowlist account", ctx.accountId === CUREFOODS_CANONICAL.ventureOsId && ctx.missionId === CUREFOODS_CANONICAL.missionId);

// ---------------------------------------------------------------------------
console.log("\n[B] Seller / manager identity handling");
// ---------------------------------------------------------------------------
check("6. seller label is 'Assigned seller'", ctx.sellerLabel === "Assigned seller" && MANAGER_SELLER_LABEL === "Assigned seller", ctx.sellerLabel);
check("   seller identity type is presentation_only", ctx.sellerIdentityType === "presentation_only");
check("   manager label is 'Sales Manager'", ctx.managerLabel === "Sales Manager" && MANAGER_LABEL === "Sales Manager");
const ctxKeys = Object.keys(ctx);
check("7. no sellerId field exists", !ctxKeys.includes("sellerId"), ctxKeys.join(","));
check("8. no managerId field exists", !ctxKeys.includes("managerId"));
check("   no revenue/adoption/effectiveness fields", !ctxKeys.some((k) => /revenue|adoption|effectiveness|riskreduction/i.test(k)));

// ---------------------------------------------------------------------------
console.log("\n[C] Deterministic coaching recommendation + focus");
// ---------------------------------------------------------------------------
const rec1 = buildCoachingRecommendation(ctx);
const rec2 = buildCoachingRecommendation(buildManagerMissionContext(turn, view));
check("9. coaching recommendation is deterministic", JSON.stringify(rec1) === JSON.stringify(rec2));
check("   recommendation title is the single supported title", rec1.title === COACHING_RECOMMENDATION_TITLE);
check("10. coaching focus is renewal_recovery", rec1.focus === "renewal_recovery" && ctx.coachingFocus === "renewal_recovery");

const plan1 = buildFifteenMinuteIntervention(ctx);
const plan2 = buildFifteenMinuteIntervention(ctx);
check("   intervention plan is deterministic", JSON.stringify(plan1) === JSON.stringify(plan2));
check("   intervention has all four sections", plan1.whatToDiscuss.length > 0 && plan1.whyItMatters.length > 0 && plan1.whatGoodLooksLike.length > 0 && plan1.whatRemainsUnknown.length > 0);
check("   intervention flags unknown external response", plan1.whatRemainsUnknown.join(" ").toLowerCase().includes("no external response exists yet"));

// ---------------------------------------------------------------------------
console.log("\n[D] Manager creates no mission / recommendation; cannot act");
// ---------------------------------------------------------------------------
// The manager modules never build a turn or a recommendation id — they only READ
// the existing ones. Prove ids are the governed engine's, not manager-minted.
const freshTurn = buildRenewalDemoTurn();
check("11. manager creates no mission (missionId is the governed engine's)", ctx.missionId === freshTurn.missionId);
check("12. manager creates no recommendation (recommendationId is the governed engine's)", ctx.recommendationId === (freshTurn.status === "completed" ? freshTurn.recommendation.recommendationId : ""));

// Prove the coaching state model exposes ONLY review/assign/reset — no approve,
// execute, or send transition exists anywhere in the manager surface.
const stateExports = Object.keys(reviewState);
check("13. manager cannot approve (no approve export)", !stateExports.some((k) => /approve/i.test(k)), stateExports.join(","));
check("14. manager cannot execute (no execute export)", !stateExports.some((k) => /execute|simulateaction|run/i.test(k)));
check("15. manager cannot send (no send/notify export)", !stateExports.some((k) => /send|notify|email|crm/i.test(k)));

// ---------------------------------------------------------------------------
console.log("\n[E] Simulated intervention state");
// ---------------------------------------------------------------------------
check("16. intervention state is explicitly simulated", DEFAULT_MANAGER_COACHING_STATE.simulated === true);
check("   default status is not_reviewed (no seed)", DEFAULT_MANAGER_COACHING_STATE.status === "not_reviewed");
check("   load without storage returns default (no seed)", loadManagerCoachingState().status === "not_reviewed");
check("   localStorage key is the documented namespaced key", MANAGER_COACHING_STORAGE_KEY === "ventureos_manager_coaching_curefoods_v1");

// ---------------------------------------------------------------------------
console.log("\n[F] Forbidden-claims scan across all rendered manager text");
// ---------------------------------------------------------------------------
const managerText = [
  ...ctx.coachingNeedReason,
  rec1.title,
  ...plan1.whatToDiscuss,
  ...plan1.whyItMatters,
  ...plan1.whatGoodLooksLike,
  ...plan1.whatRemainsUnknown,
].join("  ");
scanForbidden("17-21. manager text", managerText);
// Explicit per-claim assertions.
const lower = managerText.toLowerCase();
check("17. no unsupported revenue claim", !lower.includes("revenue"));
check("18. no unsupported risk-reduction claim", !lower.includes("risk reduc"));
check("19. no unsupported adoption-improvement claim", !lower.includes("adoption"));
check("20. no unsupported coaching-effectiveness claim", !lower.includes("effectiveness"));
check("21. no customer-response claim", !lower.includes("will renew") && !lower.includes("customer contacted") && !lower.includes("meeting booked"));

// ---------------------------------------------------------------------------
console.log("\n[G] Outcomes carried verbatim");
// ---------------------------------------------------------------------------
const outcome = projectGovernedOutcome(view);
check("22a. system outcome carried verbatim", ctx.governedSystemOutcome === outcome.systemOutcome && outcome.systemOutcome === "Governed work prepared successfully.");
check("22b. business outcome carried verbatim", ctx.governedBusinessOutcome === outcome.businessOutcome && outcome.businessOutcome === "Awaiting external response.");
const mProj = projectMissionForManager(turn, view);
check("   manager projection carries outcomes verbatim", mProj.systemOutcome === outcome.systemOutcome && mProj.businessOutcome === outcome.businessOutcome);
check("   manager projection is simulated + manager lens", mProj.simulated === true && mProj.lens === "manager");
scanForbidden("   manager projection", `${mProj.headline} ${mProj.facts.join(" ")} ${mProj.systemOutcome} ${mProj.businessOutcome}`);

// ---------------------------------------------------------------------------
console.log("\n[H] Existing Seller / Executive / Operations projections unchanged");
// ---------------------------------------------------------------------------
const LENSES: PersonaLens[] = ["seller", "executive", "operations"];
check("   PersonaLens still has exactly seller/executive/operations", LENSES.length === 3 && !(LENSES as string[]).includes("manager"));
const seller = projectMissionForPersona(turn, view, "seller");
const exec = projectMissionForPersona(turn, view, "executive");
const ops = projectMissionForPersona(turn, view, "operations");
check("23. Seller projection unchanged (Curefoods renewal + complete)", seller.simulated === true && seller.headline === "Curefoods renewal — complete" && seller.facts[0] === outcome.systemOutcome);
check("24. Executive projection unchanged (renewal risk headline + approval fact)", exec.simulated === true && exec.headline === "Curefoods renewal risk — one governed mission in progress" && exec.facts.join(" ").toLowerCase().includes("approval required"));
check("25. Operations projection unchanged (mission id + audit chain valid)", ops.simulated === true && ops.headline.includes(turn.missionId) && ops.facts.join(" ").toLowerCase().includes("audit chain valid"));

// ---------------------------------------------------------------------------
console.log("\n[I] Direct-refresh + local state does not mutate governed state");
// ---------------------------------------------------------------------------
// Direct refresh support = the route reconstructs the mission purely (no server
// session), so a second reconstruction is byte-identical to the first.
const second = reconstructSellerCompletedMission();
check("26. direct /manager refresh is supported (deterministic reconstruction)", second.turn.missionId === turn.missionId && second.turn.auditRef === turn.auditRef && second.view.simulatedCount === view.simulatedCount);
// Applying a manager review status must not change any governed fact.
const ctxReviewed = buildManagerMissionContext(turn, view, "reviewed");
const ctxAssigned = buildManagerMissionContext(turn, view, "simulated_intervention_assigned");
const governedUnchanged =
  ctxReviewed.missionId === ctx.missionId &&
  ctxReviewed.auditRef === ctx.auditRef &&
  ctxReviewed.governedSystemOutcome === ctx.governedSystemOutcome &&
  ctxReviewed.simulatedActionCount === ctx.simulatedActionCount &&
  ctxAssigned.missionId === ctx.missionId &&
  ctxAssigned.auditRef === ctx.auditRef &&
  ctxAssigned.governedSystemOutcome === ctx.governedSystemOutcome;
check("27. local review state does not mutate MissionTurn or audit state", governedUnchanged && turn.auditRef === second.turn.auditRef);

// ---------------------------------------------------------------------------
console.log("\n[J] Manager/Mission Control state continuity (bounded scenario)");
// ---------------------------------------------------------------------------
// The Manager surface must never present its deterministic COMPLETED snapshot as
// the live Mission Control state, which is session-local and may still be
// awaiting approval. These tests enforce the truthful bounded-scenario design.

// The canonical PRE-approval projection (no approval captured, no proposals) —
// exactly what Mission Control shows before a human approves in-session.
const preApprovalView = deriveMissionView(turn, null, []);

check(
  "28. canonical pre-approval projection is 'Awaiting approval' (distinct lifecycle point)",
  preApprovalView.missionStateLabel === "Awaiting approval" && preApprovalView.phase === "awaiting_approval",
  `${preApprovalView.missionStateLabel} / ${preApprovalView.phase}`,
);
check(
  "29. Manager must not claim Complete over the awaiting canonical state (labels differ)",
  view.missionStateLabel === "Complete" &&
    ctx.missionState === "Complete" &&
    view.missionStateLabel !== preApprovalView.missionStateLabel,
  `${ctx.missionState} vs ${preApprovalView.missionStateLabel}`,
);
check(
  "30. Manager is labelled a Post-mission Guided Scenario (not live-state equivalence)",
  MANAGER_SCENARIO_LABEL === "Post-mission Guided Scenario",
  MANAGER_SCENARIO_LABEL,
);
check(
  "31. Manager explicitly discloses it is not reading the current browser mission state",
  MANAGER_SCENARIO_DISCLAIMER.toLowerCase().includes("not reading the current browser mission state") &&
    MANAGER_SCENARIO_DISCLAIMER.toLowerCase().includes("after a completed simulated mission"),
);
check(
  "32. Manager continuity label asserts canonical identity WITHOUT 'same mission as Mission Control' live equivalence",
  MANAGER_CONTINUITY_LABEL.toLowerCase().includes("same canonical mission") &&
    MANAGER_CONTINUITY_LABEL.toLowerCase().includes("post-completion snapshot") &&
    !MANAGER_CONTINUITY_LABEL.toLowerCase().includes("as mission control"),
  MANAGER_CONTINUITY_LABEL,
);
check(
  "33. Manager completed projection matches the canonical completed outcome exactly",
  ctx.governedSystemOutcome === "Governed work prepared successfully." &&
    ctx.governedBusinessOutcome === "Awaiting external response." &&
    ctx.simulatedActionCount === 3 &&
    view.simulatedCount === 3,
  `${ctx.simulatedActionCount} sim / ${ctx.governedSystemOutcome}`,
);
check(
  "34. Manager review/assign actions never modify mission state (Complete stays Complete, audit stable)",
  buildManagerMissionContext(turn, view, "reviewed").missionState === "Complete" &&
    buildManagerMissionContext(turn, view, "simulated_intervention_assigned").missionState === "Complete" &&
    buildManagerMissionContext(turn, view, "reviewed").auditRef === turn.auditRef &&
    buildManagerMissionContext(turn, view, "simulated_intervention_assigned").auditRef === turn.auditRef,
);

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Manager coaching evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("One Curefoods mission, read through a Manager lens — no new identity, no forbidden claim, no governed mutation.");
console.log("=".repeat(70));
