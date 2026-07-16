// Release 2.5 — Mission Control · governed analysis progress evals (F2.2)
// ======================================================================
// Deterministic, NETWORK-FREE proof of the GovernedAnalysisProgress logic and the
// model-selection evidence copy. No React render, no clock, no DOM — the pure
// module takes elapsed-ms IN, so every transition is checked at fixed inputs.
//
// It proves the honesty contract:
//   * six ordered stages with exactly one NVIDIA-owned stage placed AFTER the
//     governance stages;
//   * NVIDIA wording (primary/support) appears ONLY on the NVIDIA stage;
//   * governance-stage copy never implies NVIDIA owns account/mission/approval/
//     execution/audit; no stage copy fabricates a percentage or reasoning;
//   * time -> stage estimate is monotonic and never selects the terminal "ready"
//     stage by time alone;
//   * the delayed hint appears only at/after 8 s;
//   * stage markers (done/active/upcoming) are consistent;
//   * the model-selection statement is present, mentions grounding + latency, and
//     is not parameter-count-based.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/nvidia/eval/governedAnalysisProgress.eval.ts

import {
  ANALYSIS_STAGES,
  NVIDIA_STAGE_INDEX,
  PRIMARY_INITIAL,
  PRIMARY_NVIDIA,
  SUPPORT_INITIAL,
  SUPPORT_NVIDIA,
  DELAYED_HINT_AFTER_MS,
  deriveAnalysisProgress,
  stageIndexForElapsed,
  stageMarker,
} from "../governedAnalysisProgress";
import {
  MODEL_SELECTION_STATEMENT,
  MODEL_SELECTION_CANDIDATE_NOTE,
  MODEL_SELECTION_DEFAULT,
  MODEL_SELECTION_CANDIDATE,
} from "../presentation";

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

// Wording that must NEVER appear anywhere in the progress copy.
const BANNED = [
  /%/,
  /percent/i,
  /chain[- ]of[- ]thought/i,
  /reasoning token/i,
  /scratchpad/i,
  /deep thinking/i,
  /reading the model/i,
  /nvidia is deciding/i,
  /nvidia is executing/i,
  /contacting the customer/i,
  /email sent/i,
  /crm updated/i,
];
// Governance verbs NVIDIA must never be said to perform.
const NVIDIA_FORBIDDEN_VERBS =
  /nvidia[^.]*\b(resolv|select|verif|approv|execut|assign|clos|updat|contact|audit)/i;

// ===========================================================================
console.log("\n[1] Pipeline shape: six ordered stages, one NVIDIA stage, placed late");
// ===========================================================================
check("exactly 6 stages", ANALYSIS_STAGES.length === 6, String(ANALYSIS_STAGES.length));
const nvidiaStages = ANALYSIS_STAGES.filter((s) => s.owner === "nvidia");
check("exactly one NVIDIA-owned stage", nvidiaStages.length === 1, String(nvidiaStages.length));
check("NVIDIA stage index resolved", NVIDIA_STAGE_INDEX === 3, String(NVIDIA_STAGE_INDEX));
check(
  "NVIDIA stage sits AFTER the three governance stages",
  NVIDIA_STAGE_INDEX >= 3 && ANALYSIS_STAGES.slice(0, 3).every((s) => s.owner === "ventureos"),
);
check(
  "first stage understands the account",
  /understanding the account/i.test(ANALYSIS_STAGES[0].label),
);
check("NVIDIA stage mentions Nemotron", /nvidia nemotron/i.test(ANALYSIS_STAGES[NVIDIA_STAGE_INDEX].label));
check("last stage is the ready endpoint", /ready for review/i.test(ANALYSIS_STAGES[5].label));
// No non-NVIDIA stage label may mention NVIDIA.
check(
  "only the NVIDIA stage mentions NVIDIA",
  ANALYSIS_STAGES.every((s, i) => (/(nvidia|nemotron)/i.test(s.label) ? i === NVIDIA_STAGE_INDEX : true)),
);

// ===========================================================================
console.log("\n[2] NVIDIA wording is gated strictly to the NVIDIA stage");
// ===========================================================================
// Sample the whole timeline in 250ms steps up to 13s.
for (let t = 0; t <= 13_000; t += 250) {
  const p = deriveAnalysisProgress(t);
  const usesNvidiaCopy = p.primary === PRIMARY_NVIDIA || /nemotron/i.test(p.primary);
  if (p.isNvidiaStage) {
    check(
      `t=${t}ms NVIDIA stage -> NVIDIA copy`,
      p.primary === PRIMARY_NVIDIA && p.support === SUPPORT_NVIDIA,
    );
  } else {
    check(
      `t=${t}ms non-NVIDIA stage -> no NVIDIA copy`,
      !usesNvidiaCopy && p.primary === PRIMARY_INITIAL && p.support === SUPPORT_INITIAL,
      p.primary,
    );
  }
}

// ===========================================================================
console.log("\n[3] Copy is honest: no banned wording, no false authority");
// ===========================================================================
const allCopy = [
  PRIMARY_INITIAL,
  PRIMARY_NVIDIA,
  SUPPORT_INITIAL,
  SUPPORT_NVIDIA,
  ...ANALYSIS_STAGES.map((s) => s.label),
];
for (const line of allCopy) {
  check(`no banned wording: "${line.slice(0, 40)}"`, !BANNED.some((re) => re.test(line)), line);
  check(`no false NVIDIA authority: "${line.slice(0, 40)}"`, !NVIDIA_FORBIDDEN_VERBS.test(line), line);
}
check(
  "support copy affirms VentureOS keeps governance",
  /governed by VentureOS/i.test(SUPPORT_NVIDIA),
);

// ===========================================================================
console.log("\n[4] Time -> stage estimate is monotonic and never terminal by time");
// ===========================================================================
let prev = -1;
let monotonic = true;
let everTerminalByTime = false;
for (let t = 0; t <= 60_000; t += 100) {
  const idx = stageIndexForElapsed(t);
  if (idx < prev) monotonic = false;
  if (idx === ANALYSIS_STAGES.length - 1) everTerminalByTime = true;
  prev = idx;
}
check("stage index never decreases as time advances", monotonic);
check("time alone never selects the terminal 'ready' stage", !everTerminalByTime);
check("elapsed 0 -> first stage", stageIndexForElapsed(0) === 0);
check("negative/NaN elapsed clamps to first stage", stageIndexForElapsed(-5) === 0 && stageIndexForElapsed(NaN) === 0);
check("very large elapsed holds on pre-terminal stage", stageIndexForElapsed(1_000_000) === ANALYSIS_STAGES.length - 2);
// The NVIDIA stage is actually reachable by the estimate.
let reachesNvidia = false;
for (let t = 0; t <= 13_000; t += 100) if (stageIndexForElapsed(t) === NVIDIA_STAGE_INDEX) reachesNvidia = true;
check("estimate actually reaches the NVIDIA stage", reachesNvidia);

// ===========================================================================
console.log("\n[5] Delayed hint appears only at/after 8s");
// ===========================================================================
check("no delayed hint at 0s", deriveAnalysisProgress(0).showDelayedHint === false);
check("no delayed hint just before 8s", deriveAnalysisProgress(DELAYED_HINT_AFTER_MS - 1).showDelayedHint === false);
check("delayed hint at 8s", deriveAnalysisProgress(DELAYED_HINT_AFTER_MS).showDelayedHint === true);
check("delayed hint after 8s", deriveAnalysisProgress(10_000).showDelayedHint === true);

// ===========================================================================
console.log("\n[6] Stage markers are consistent with the active estimate");
// ===========================================================================
check("before active -> done", stageMarker(0, 2) === "done");
check("at active -> active", stageMarker(2, 2) === "active");
check("after active -> upcoming", stageMarker(3, 2) === "upcoming");
// At every sampled time exactly one stage is active, the rest done/upcoming.
for (let t = 0; t <= 12_000; t += 500) {
  const active = deriveAnalysisProgress(t).activeIndex;
  const markers = ANALYSIS_STAGES.map((_, i) => stageMarker(i, active));
  check(`t=${t}ms exactly one active marker`, markers.filter((m) => m === "active").length === 1);
}

// ===========================================================================
console.log("\n[7] Model-selection evidence copy is honest and non-size-based");
// ===========================================================================
check("statement mentions grounding", /grounding/i.test(MODEL_SELECTION_STATEMENT));
check("statement mentions latency", /latency/i.test(MODEL_SELECTION_STATEMENT));
check("statement mentions fail-safe", /fail-safe|fail safe/i.test(MODEL_SELECTION_STATEMENT));
check("statement explicitly not parameter count", /not parameter count/i.test(MODEL_SELECTION_STATEMENT));
check("candidate note frames 30B as tested and deferred", /deferred/i.test(MODEL_SELECTION_CANDIDATE_NOTE) && /not incapable/i.test(MODEL_SELECTION_CANDIDATE_NOTE));
check("default model id correct", MODEL_SELECTION_DEFAULT === "nvidia/nvidia-nemotron-nano-9b-v2");
check("candidate model id correct", MODEL_SELECTION_CANDIDATE === "nvidia/nemotron-3-nano-30b-a3b");

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Governed analysis progress evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All governed analysis progress checks passed. Honest staged wait holds.");
console.log("=".repeat(70));
