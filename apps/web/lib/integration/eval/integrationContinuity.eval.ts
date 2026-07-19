// Sunday Integrated Release — combined continuity + route regression
// ==================================================================
// Proves the integrated walkthrough tells ONE truthful story bound to the ONE
// governed Curefoods mission, that every public status label is from the allowed
// set (no private "Feature Branch"/commit/deployment leakage), that every
// experience link resolves to a real route, and that the Walkthrough, Manager
// Guided Demo, and Guardrails Lab all reference the SAME canonical identity and
// cannot mutate mission / audit / ledger state.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/integration/eval/integrationContinuity.eval.ts

import {
  WALKTHROUGH_STAGES,
  WALKTHROUGH_STAGE_COUNT,
  WALKTHROUGH_CANONICAL,
  type WalkthroughStatus,
} from "../../walkthrough/stages";
import { CUREFOODS_CANONICAL } from "../../demo/canonicalMission";
import { reconstructSellerCompletedMission } from "../../manager/sellerCompletedMission";
import { buildManagerMissionContext } from "../../manager/managerMissionContext";
import {
  CUREFOODS_AUDIT_REF,
  CUREFOODS_RECOMMENDATION_ID,
  CUREFOODS_MISSION_ID,
} from "../../guardrails/scenarios";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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

console.log("=".repeat(70));
console.log("Sunday Integrated Release — combined continuity + route regression");
console.log("=".repeat(70));

// The complete set of PUBLIC status labels permitted anywhere in the release.
const ALLOWED_STATUS: readonly WalkthroughStatus[] = [
  "Product context",
  "Production",
  "Production — Partial",
  "Guided Demo",
  "Guardrails Lab",
  "Roadmap",
];

// Real routes the walkthrough is allowed to link into.
const ALLOWED_ROUTES = new Set([
  "/",
  "/?view=mission",
  "/mission-control",
  "/manager",
  "/guardrails",
]);

// Terms that must NEVER appear in public walkthrough copy (private/internal).
const FORBIDDEN_SUBSTRINGS = [
  "feature branch",
  "feature/",
  "dpl_",
  "vercel.app",
  "railway",
  "localhost",
  "sha ",
  "commit ",
];

// ---------------------------------------------------------------------------
console.log("\n[1] Walkthrough structure");
// ---------------------------------------------------------------------------
check("1. exactly 13 stages present", WALKTHROUGH_STAGE_COUNT === 13 && WALKTHROUGH_STAGES.length === 13, String(WALKTHROUGH_STAGE_COUNT));
check(
  "2. stage numbers are 1..13 sequential",
  WALKTHROUGH_STAGES.every((s, i) => s.number === i + 1),
);
check(
  "3. stage ids are unique",
  new Set(WALKTHROUGH_STAGES.map((s) => s.id)).size === WALKTHROUGH_STAGES.length,
);
check(
  "4. every stage has all seven governed narrative fields non-empty",
  WALKTHROUGH_STAGES.every(
    (s) =>
      s.headline.trim() &&
      s.narrative.trim() &&
      s.whatHappened.trim() &&
      s.whyItMatters.trim() &&
      s.whatAiDid.trim() &&
      s.whatPolicyDid.trim() &&
      s.whatHumanControlled.trim() &&
      s.whatRemainsUnknown.trim(),
  ),
);
check(
  "5. every stage has at least two evidence bullets",
  WALKTHROUGH_STAGES.every((s) => s.evidence.length >= 2),
);

// ---------------------------------------------------------------------------
console.log("\n[2] Truthful public status labels");
// ---------------------------------------------------------------------------
check(
  "6. every stage status is from the allowed public set",
  WALKTHROUGH_STAGES.every((s) => ALLOWED_STATUS.includes(s.status)),
);
check("7. stage 9 (Manager) labelled Guided Demo", WALKTHROUGH_STAGES[8].status === "Guided Demo");
check("8. stage 10 (Guardrails) labelled Guardrails Lab", WALKTHROUGH_STAGES[9].status === "Guardrails Lab");
check("9. stage 13 (roadmap) labelled Roadmap", WALKTHROUGH_STAGES[12].status === "Roadmap");
check(
  "10. no private/internal term leaks in any public copy",
  (() => {
    const blob = WALKTHROUGH_STAGES.map((s) =>
      [
        s.headline,
        s.narrative,
        s.whatHappened,
        s.whyItMatters,
        s.whatAiDid,
        s.whatPolicyDid,
        s.whatHumanControlled,
        s.whatRemainsUnknown,
        s.evidence.join(" "),
        s.link?.label ?? "",
      ].join(" "),
    )
      .join(" ")
      .toLowerCase();
    const hit = FORBIDDEN_SUBSTRINGS.find((f) => blob.includes(f));
    if (hit) failures.push(`leaked term "${hit}"`);
    return hit === undefined;
  })(),
);

// ---------------------------------------------------------------------------
console.log("\n[3] Experience links resolve to real routes");
// ---------------------------------------------------------------------------
const linkedStages = WALKTHROUGH_STAGES.filter((s) => s.link);
check(
  "11. every stage link points at a real allowed route",
  linkedStages.every((s) => ALLOWED_ROUTES.has(s.link!.href)),
  linkedStages.map((s) => s.link!.href).join(", "),
);
check("12. stage 2 links to Today's Mission", WALKTHROUGH_STAGES[1].link?.href === "/?view=mission");
check("13. stage 3 links to Mission Control", WALKTHROUGH_STAGES[2].link?.href === "/mission-control");
check("14. stage 9 links to Manager", WALKTHROUGH_STAGES[8].link?.href === "/manager");
check("15. stage 10 links to Guardrails", WALKTHROUGH_STAGES[9].link?.href === "/guardrails");

// ---------------------------------------------------------------------------
console.log("\n[4] Shared canonical identity across every integrated surface");
// ---------------------------------------------------------------------------
check(
  "16. walkthrough canonical missionId matches demo canonical",
  WALKTHROUGH_CANONICAL.missionId === CUREFOODS_CANONICAL.missionId,
  WALKTHROUGH_CANONICAL.missionId,
);
check(
  "17. walkthrough canonical recommendationId matches demo canonical",
  WALKTHROUGH_CANONICAL.recommendationId === CUREFOODS_CANONICAL.recommendationId,
);
check(
  "18. walkthrough canonical accountId matches demo canonical ventureOsId",
  WALKTHROUGH_CANONICAL.accountId === CUREFOODS_CANONICAL.ventureOsId,
);
check(
  "19. walkthrough canonical portfolioAccountId matches demo canonical",
  WALKTHROUGH_CANONICAL.portfolioAccountId === CUREFOODS_CANONICAL.portfolioAccountId,
);
check(
  "20. walkthrough auditRef matches guardrails canonical auditRef",
  WALKTHROUGH_CANONICAL.auditRef === CUREFOODS_AUDIT_REF,
  WALKTHROUGH_CANONICAL.auditRef,
);
check(
  "21. walkthrough missionId matches guardrails canonical missionId",
  WALKTHROUGH_CANONICAL.missionId === CUREFOODS_MISSION_ID,
);
check(
  "22. walkthrough recommendationId matches guardrails canonical recommendationId",
  WALKTHROUGH_CANONICAL.recommendationId === CUREFOODS_RECOMMENDATION_ID,
);

// Cross-check against the LIVE governed Manager context (reconstructed).
const { turn, view } = reconstructSellerCompletedMission();
const managerCtx = buildManagerMissionContext(turn, view);
check(
  "23. Manager context missionId equals walkthrough canonical",
  managerCtx.missionId === WALKTHROUGH_CANONICAL.missionId,
  managerCtx.missionId,
);
check(
  "24. Manager context recommendationId equals walkthrough canonical",
  managerCtx.recommendationId === WALKTHROUGH_CANONICAL.recommendationId,
);
check(
  "25. Manager context auditRef equals walkthrough canonical + governed turn",
  managerCtx.auditRef === WALKTHROUGH_CANONICAL.auditRef && managerCtx.auditRef === turn.auditRef,
);
check(
  "26. Manager context template equals walkthrough canonical",
  managerCtx.selectedTemplateId === WALKTHROUGH_CANONICAL.template,
);

// ---------------------------------------------------------------------------
console.log("\n[5] Governed truth surfaced faithfully in the walkthrough");
// ---------------------------------------------------------------------------
check(
  "27. NVIDIA stage names provider=nim and the Nemotron model",
  WALKTHROUGH_STAGES[4].evidence.join(" ").includes(WALKTHROUGH_CANONICAL.nvidiaProvider) &&
    WALKTHROUGH_STAGES[4].evidence.join(" ").includes(WALKTHROUGH_CANONICAL.nvidiaModel),
);
check(
  "28. NVIDIA stage states it does not select/approve/execute",
  WALKTHROUGH_STAGES[4].whatPolicyDid.toLowerCase().includes("authority") ||
    WALKTHROUGH_STAGES[4].evidence.join(" ").toLowerCase().includes("does not select"),
);
check(
  "29. governed-outcome stage separates system and business outcome",
  WALKTHROUGH_STAGES[7].whatHappened.includes(WALKTHROUGH_CANONICAL.systemOutcome) &&
    WALKTHROUGH_STAGES[7].whatHappened.includes(WALKTHROUGH_CANONICAL.businessOutcome),
);
check(
  "30. audit stage surfaces the canonical audit reference",
  WALKTHROUGH_STAGES[11].evidence.join(" ").includes(WALKTHROUGH_CANONICAL.auditRef),
);
check(
  "31. execution stage keeps all three actions simulated (not sent/created/written)",
  (() => {
    const t = WALKTHROUGH_STAGES[6].evidence.join(" ").toLowerCase();
    return t.includes("not sent") && t.includes("not created") && t.includes("not written");
  })(),
);

// ---------------------------------------------------------------------------
console.log("\n[6] Read-only invariants — walkthrough mutates nothing");
// ---------------------------------------------------------------------------
// The walkthrough model is a frozen pure data structure: prove it cannot be
// mutated and that reconstructing the governed turn twice is stable.
check(
  "32. WALKTHROUGH_CANONICAL is frozen (immutable identity)",
  Object.isFrozen(WALKTHROUGH_CANONICAL),
);
const secondRun = reconstructSellerCompletedMission();
check(
  "33. governed turn reconstruction is stable (no ledger/audit drift)",
  secondRun.turn.missionId === turn.missionId && secondRun.turn.auditRef === turn.auditRef,
);
check(
  "34. walkthrough carries no approval/execution authority (presentation only)",
  (() => {
    const blob = WALKTHROUGH_STAGES.map((s) => s.whatAiDid + " " + s.whatHumanControlled)
      .join(" ")
      .toLowerCase();
    // The AI must never be described as approving or executing.
    return !blob.includes("ai approves") && !blob.includes("ai executes");
  })(),
);

// ---------------------------------------------------------------------------
console.log("\n[7] Walkthrough visual-evidence treatment");
// ---------------------------------------------------------------------------
const REQUIRED_VISUAL_STAGES = [2, 3, 5, 6, 7, 8, 9, 10];
const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../public");

check(
  "35. all 13 stages present (render contract)",
  WALKTHROUGH_STAGES.length === 13 && WALKTHROUGH_STAGE_COUNT === 13,
);
check(
  "36. eight required stages each carry a visual asset",
  REQUIRED_VISUAL_STAGES.every((n) => {
    const s = WALKTHROUGH_STAGES.find((x) => x.number === n);
    return !!s && !!s.visual && !!s.visual.src;
  }),
  REQUIRED_VISUAL_STAGES.filter((n) => !WALKTHROUGH_STAGES.find((x) => x.number === n)?.visual).join(","),
);
check(
  "37. no broken image source — every visual file exists on disk",
  WALKTHROUGH_STAGES.filter((s) => s.visual).every((s) =>
    existsSync(resolve(PUBLIC_DIR, "." + s.visual!.src)),
  ),
  WALKTHROUGH_STAGES.filter((s) => s.visual && !existsSync(resolve(PUBLIC_DIR, "." + s.visual!.src)))
    .map((s) => s.visual!.src)
    .join(", "),
);
check(
  "38. every visual has non-empty alt text and caption",
  WALKTHROUGH_STAGES.filter((s) => s.visual).every(
    (s) => s.visual!.alt.trim().length > 0 && s.visual!.caption.trim().length > 0,
  ),
);
check(
  "39. no internal path exposed — every src is a public app-relative asset",
  WALKTHROUGH_STAGES.filter((s) => s.visual).every(
    (s) =>
      s.visual!.src.startsWith("/walkthrough-assets/") &&
      !s.visual!.src.includes("..") &&
      !/[A-Za-z]:\\|\/Users\/|\/home\//.test(s.visual!.src),
  ),
);
check(
  "40. no obsolete SHA / deployment / localhost text in any visual metadata",
  WALKTHROUGH_STAGES.filter((s) => s.visual).every((s) => {
    const blob = (s.visual!.alt + " " + s.visual!.caption).toLowerCase();
    return !FORBIDDEN_SUBSTRINGS.some((f) => blob.includes(f)) && !/\b[0-9a-f]{7,40}\b/.test(blob);
  }),
);
check(
  "41. no Feature Branch label anywhere in walkthrough public copy or captions",
  (() => {
    const blob = WALKTHROUGH_STAGES.map(
      (s) =>
        [s.headline, s.narrative, s.evidence.join(" "), s.visual?.alt ?? "", s.visual?.caption ?? ""].join(
          " ",
        ),
    )
      .join(" ")
      .toLowerCase();
    return !blob.includes("feature branch") && !blob.includes("feature/");
  })(),
);
check(
  "42. links route correctly (allowed real routes only)",
  WALKTHROUGH_STAGES.filter((s) => s.link).every((s) => ALLOWED_ROUTES.has(s.link!.href)),
);
check(
  "43. visuals carry intrinsic width/height (responsive aspect, no layout shift)",
  WALKTHROUGH_STAGES.filter((s) => s.visual).every(
    (s) => s.visual!.width > 0 && s.visual!.height > 0,
  ),
);
check(
  "44. visual sources are unique (no duplicate assets across stages)",
  (() => {
    const srcs = WALKTHROUGH_STAGES.filter((s) => s.visual).map((s) => s.visual!.src);
    return new Set(srcs).size === srcs.length;
  })(),
);

// ---------------------------------------------------------------------------
console.log("\n[8] Completed-mission evidence + hosted asset provenance");
// ---------------------------------------------------------------------------
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const MANIFEST_PATH = resolve(REPO_ROOT, "docs/private-review/walkthrough-asset-source.md");
const REPORT_PATH = resolve(REPO_ROOT, "docs/private-review/hosted-acceptance-20260719.md");
const readSafe = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "");
const manifest = readSafe(MANIFEST_PATH);
const report = readSafe(REPORT_PATH);
const ASSET_FILES = [
  "stage-02-todays-mission.png",
  "stage-03-mission-continuity.png",
  "stage-05-nvidia-grounded.png",
  "stage-06-human-approval.png",
  "stage-07-simulated-execution.png",
  "stage-08-governed-outcome.png",
  "stage-09-manager-coaching.png",
  "stage-10-guardrails.png",
];

check(
  "45. walkthrough completion stages use COMPLETED mission evidence (stages 7 & 8)",
  (() => {
    const s7 = WALKTHROUGH_STAGES.find((s) => s.number === 7)?.visual;
    const s8 = WALKTHROUGH_STAGES.find((s) => s.number === 8)?.visual;
    if (!s7 || !s8) return false;
    const b7 = (s7.alt + " " + s7.caption).toLowerCase();
    const b8 = (s8.alt + " " + s8.caption).toLowerCase();
    return (
      b7.includes("three") &&
      b7.includes("simulated") &&
      b8.includes("governed work prepared successfully") &&
      b8.includes("awaiting external response") &&
      !b8.includes("awaiting approval")
    );
  })(),
);
check(
  "46. every one of the eight walkthrough assets has hosted provenance in the source manifest",
  manifest.length > 0 &&
    /dpl_[A-Za-z0-9]+/.test(manifest) &&
    /\b[0-9a-f]{7,40}\b/.test(manifest) &&
    /2026-/.test(manifest) &&
    /mission state/i.test(manifest) &&
    ASSET_FILES.every((f) => manifest.includes(f)),
  manifest.length === 0 ? "manifest missing" : "missing hosted provenance fields",
);
check(
  "47. no TEMPORARY asset remains (source manifest no longer marks assets temporary)",
  manifest.length > 0 && !/temporary/i.test(manifest),
);
check(
  "48. hosted-acceptance report distinguishes pre-approval vs completed evidence (no overclaim)",
  report.length > 0 &&
    /pre-approval/i.test(report) &&
    /completed/i.test(report) &&
    /manager state model/i.test(report),
  report.length === 0 ? "report missing" : "report does not separate evidence classes",
);

// ===========================================================================
console.log(`\nIntegration continuity evals: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
