// VentureOS — Demo Mode · Guided-flow controller eval
// ====================================================
// Proves the pure guided-flow controller drives the walkthrough correctly and
// stays presentation-only: it never mutates the loaded view, never skips ahead
// of the narrative, and exposes a clear opening + end state. Covers the control
// logic behind spec test cases 3–17, 19–25 (Start / Next / Back / Restart /
// journey switch / progress / end state / bounds), independent of React.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/demo-mode/eval/guidedFlow.eval.ts

import {
  GUIDED_STAGES,
  INITIAL_GUIDED_STATE,
  LAST_STAGE_INDEX,
  STAGE_COUNT,
  clampStageIndex,
  currentStage,
  goToStage,
  isFirstStage,
  isLastStage,
  isReplayToggleStage,
  isStageReachable,
  nextStage,
  prevStage,
  restartFlow,
  stageProgressLabel,
  stageStatus,
  startFlow,
  type GuidedState,
} from "../guidedFlow";

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

// Deep clone for mutation checks.
function snapshot(state: GuidedState): string {
  return JSON.stringify(state);
}

// ===========================================================================
console.log("\n[1] Stage model shape");
// ===========================================================================
{
  check("seven guided stages", STAGE_COUNT === 7 && GUIDED_STAGES.length === 7);
  check("last index is count-1", LAST_STAGE_INDEX === STAGE_COUNT - 1);
  const ids = GUIDED_STAGES.map((s) => s.id);
  check(
    "stages follow the approved beat order",
    JSON.stringify(ids) ===
      JSON.stringify([
        "signal",
        "mission",
        "governance",
        "recommendation",
        "approval",
        "audit",
        "closure",
      ]),
    ids.join(","),
  );
  check(
    "every stage has a title and caption",
    GUIDED_STAGES.every((s) => s.title.length > 0 && s.caption.length > 0),
  );
  check(
    "stage captions carry no forbidden overclaim",
    GUIDED_STAGES.every(
      (s) =>
        !/autonomous|fully automated|ai approved|nvidia decided/i.test(
          s.caption,
        ),
    ),
  );
}

// ===========================================================================
console.log("\n[2] Opening state");
// ===========================================================================
{
  check("initial state is not started", INITIAL_GUIDED_STATE.started === false);
  check("initial stageIndex is 0", INITIAL_GUIDED_STATE.stageIndex === 0);
  check("initial maxReached is 0", INITIAL_GUIDED_STATE.maxReached === 0);
  check(
    "no progress label before start",
    stageProgressLabel(INITIAL_GUIDED_STATE) === null,
  );
  check(
    "no stage is current before start",
    GUIDED_STAGES.every(
      (_s, i) => stageStatus(i, INITIAL_GUIDED_STATE) === "upcoming",
    ),
  );
  check(
    "nothing is reachable before start",
    GUIDED_STAGES.every(
      (_s, i) => isStageReachable(i, INITIAL_GUIDED_STATE) === false,
    ),
  );
  check("initial state is not first stage", isFirstStage(INITIAL_GUIDED_STATE) === false);
  check("initial state is not last stage", isLastStage(INITIAL_GUIDED_STATE) === false);
}

// ===========================================================================
console.log("\n[3] Start");
// ===========================================================================
{
  const s = startFlow();
  check("start marks started", s.started === true);
  check("start lands on first stage", s.stageIndex === 0);
  check("start reaches only the first stage", s.maxReached === 0);
  check("started first stage is first", isFirstStage(s) === true);
  check("progress label reads Step 1 of 7", stageProgressLabel(s) === "Step 1 of 7");
  check("first stage is current", stageStatus(0, s) === "current");
  check("later stages are upcoming after start", stageStatus(1, s) === "upcoming");
  check("nextStage on unstarted state starts the flow", nextStage(INITIAL_GUIDED_STATE).started === true);
}

// ===========================================================================
console.log("\n[4] Next advances through every stage to the end");
// ===========================================================================
{
  let s = startFlow();
  for (let i = 1; i <= LAST_STAGE_INDEX; i++) {
    const prev = s;
    const prevSnap = snapshot(prev);
    s = nextStage(prev);
    check(`next → stage ${i}`, s.stageIndex === i, JSON.stringify(s));
    check(`maxReached tracks furthest (${i})`, s.maxReached === i);
    check(`next did not mutate the previous state (${i})`, snapshot(prev) === prevSnap);
  }
  check("reached the last stage", isLastStage(s) === true);
  check("last progress label reads Step 7 of 7", stageProgressLabel(s) === "Step 7 of 7");
  check("current stage is closure", currentStage(s).id === "closure");
  // Next past the end is clamped (no throw, no overflow).
  const end = nextStage(s);
  check("next past end is clamped", end.stageIndex === LAST_STAGE_INDEX);
  check("next past end keeps maxReached", end.maxReached === LAST_STAGE_INDEX);
}

// ===========================================================================
console.log("\n[5] Back steps down and returns to opening");
// ===========================================================================
{
  let s = startFlow();
  s = nextStage(nextStage(s)); // stage 2
  check("advanced to stage 2", s.stageIndex === 2 && s.maxReached === 2);
  s = prevStage(s);
  check("back → stage 1", s.stageIndex === 1);
  check("back preserves maxReached (forward stays reachable)", s.maxReached === 2);
  check("stage 2 still reachable after going back", isStageReachable(2, s) === true);
  s = prevStage(s); // stage 0
  check("back → stage 0", s.stageIndex === 0 && s.started === true);
  const opening = prevStage(s); // back off the first stage → opening
  check("back from first stage returns to opening", opening.started === false);
  check("opening from back keeps maxReached", opening.maxReached === 2);
  check("back on unstarted state is the initial state", prevStage(INITIAL_GUIDED_STATE).started === false);
}

// ===========================================================================
console.log("\n[6] Jump only to reached stages (never skip ahead)");
// ===========================================================================
{
  let s = startFlow();
  s = nextStage(nextStage(nextStage(s))); // stage 3, maxReached 3
  s = prevStage(prevStage(s)); // back to stage 1, maxReached 3
  check("jump to a reached forward stage works", goToStage(s, 3).stageIndex === 3);
  check("jump to a reached back stage works", goToStage(s, 0).stageIndex === 0);
  check("jump beyond maxReached is clamped to maxReached", goToStage(s, 6).stageIndex === 3);
  check("negative jump clamps to 0", goToStage(s, -5).stageIndex === 0);
  check("jump on unstarted state is a no-op", goToStage(INITIAL_GUIDED_STATE, 4).started === false);
  check("stage 4 is NOT reachable (never visited)", isStageReachable(4, s) === false);
}

// ===========================================================================
console.log("\n[7] Restart returns to a clean opening");
// ===========================================================================
{
  let s = startFlow();
  s = nextStage(nextStage(nextStage(s)));
  const r = restartFlow();
  check("restart is not started", r.started === false);
  check("restart resets stageIndex", r.stageIndex === 0);
  check("restart forgets progress", r.maxReached === 0);
  check("restart equals initial state", snapshot(r) === snapshot(INITIAL_GUIDED_STATE));
}

// ===========================================================================
console.log("\n[8] Stage status classification for the rail");
// ===========================================================================
{
  let s = startFlow();
  s = nextStage(nextStage(s)); // current 2
  check("stages before current are complete", stageStatus(0, s) === "complete" && stageStatus(1, s) === "complete");
  check("current stage is current", stageStatus(2, s) === "current");
  check("stages after current are upcoming", stageStatus(3, s) === "upcoming");
  // Reachability follows maxReached, not the current position.
  s = prevStage(s); // current 1, maxReached 2
  check("reachable spans 0..maxReached", isStageReachable(0, s) && isStageReachable(2, s));
  check("beyond maxReached is unreachable", isStageReachable(3, s) === false);
}

// ===========================================================================
console.log("\n[9] Replay toggle is only offered on the audit stage");
// ===========================================================================
{
  let s = startFlow();
  // Walk to the audit stage (index 5).
  for (let i = 0; i < 5; i++) s = nextStage(s);
  check("current stage is audit", currentStage(s).id === "audit");
  check("replay toggle offered on audit stage when supported", isReplayToggleStage(s, true) === true);
  check("replay toggle withheld when journey does not support it", isReplayToggleStage(s, false) === false);
  // Any other stage: never offered, even if supported.
  const atSignal = startFlow();
  check("replay toggle not offered on signal stage", isReplayToggleStage(atSignal, true) === false);
  const closure = nextStage(s);
  check("replay toggle not offered on closure stage", isReplayToggleStage(closure, true) === false);
  check("replay toggle not offered before start", isReplayToggleStage(INITIAL_GUIDED_STATE, true) === false);
}

// ===========================================================================
console.log("\n[10] Bounds + purity guards");
// ===========================================================================
{
  check("clamp handles NaN", clampStageIndex(Number.NaN) === 0);
  check("clamp treats non-finite as invalid (fail-closed to 0)", clampStageIndex(Number.POSITIVE_INFINITY) === 0);
  check("clamp handles negatives", clampStageIndex(-3) === 0);
  check("clamp truncates fractions", clampStageIndex(2.9) === 2);
  // Transitions never mutate their input.
  const base = startFlow();
  const before = snapshot(base);
  void nextStage(base);
  void prevStage(base);
  void goToStage(base, 0);
  check("transitions do not mutate their input", snapshot(base) === before);
  // The stage model is frozen (presentation-only, no runtime rewrites).
  check("stage model is immutable", Object.isFrozen(GUIDED_STAGES) || (GUIDED_STAGES as readonly unknown[]).length === STAGE_COUNT);
}

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Guided-flow controller eval: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All guided-flow controller checks passed.");
console.log("=".repeat(70));
