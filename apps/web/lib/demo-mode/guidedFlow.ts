// VentureOS — Demo Mode · Guided-flow controller (pure, presentation-only)
// =========================================================================
// Track 1 — Guided Demo Experience v1.1.
//
// This module turns the immutable, pre-validated presentation view into a
// GUIDED sequence of stages. It is a PRESENTATION controller and nothing more:
// it owns only which stage is currently shown and which stages have been
// reached. It never re-runs detection, mission selection, governance, approval,
// or execution; it never mutates the loaded document; it makes no network,
// CRM, NVIDIA, ledger, or environment access. Every fact still comes from the
// generated `DemoPresentationView` — the stages are just an ordered lens over
// the SAME data, never a second copy of it.
//
// Kept as a pure, dependency-free module (types only) so the eval runtime can
// assert every transition without rendering React.

import type { DemoPresentationView } from "./presentationContract";

// The section of the immutable view each stage projects. The controller does
// not hold any copy itself — `kind` tells the shell which existing panel to
// render for the current stage, and the panel reads the view directly.
export type GuidedStageKind =
  | "signal"
  | "mission"
  | "governance"
  | "recommendation"
  | "approval"
  | "audit"
  | "closure";

export interface GuidedStageMeta {
  /** Stable id used for keys, tests, and deep-checks. */
  id: GuidedStageKind;
  /** Short stage title shown in the rail and stage header. */
  title: string;
  /** One-line, journey-neutral description of the beat. */
  caption: string;
}

// The guided beat order follows the approved narrative:
//   Signal → AI explains what changed → Mission → Governance → Recommendation
//   → Approval & execution → Audit & replay → closing record.
//
// Approval Outcome and Execution Outcome are presented together in one governed
// beat because the immutable Approval & Execution panel already shows both
// side by side, and a governed stop (Journey A) truthfully renders "not
// reached / no execution" in that same beat. A final closure stage provides the
// clear end state (explanation provider, safety labels, full technical record).
//
// This order is identical for both journeys; only the view CONTENT differs, so
// journey semantics are never changed by the controller.
export const GUIDED_STAGES: readonly GuidedStageMeta[] = [
  {
    id: "signal",
    title: "Signal observed",
    caption: "A governed signal changed. The AI explains what moved.",
  },
  {
    id: "mission",
    title: "Mission created",
    caption: "The change becomes a governed mission with linked evidence.",
  },
  {
    id: "governance",
    title: "Governance evaluation",
    caption: "Governance evaluates the mission before anything can run.",
  },
  {
    id: "recommendation",
    title: "Recommendation",
    caption: "One clear next step, advisory only.",
  },
  {
    id: "approval",
    title: "Approval & execution",
    caption: "Human approval, then simulated execution — or a governed stop.",
  },
  {
    id: "audit",
    title: "Audit & replay",
    caption: "Audit and replay evidence for the outcome.",
  },
  {
    id: "closure",
    title: "Outcome & safety",
    caption: "Explanation provider, safety labels, and the full record.",
  },
] as const;

export const STAGE_COUNT = GUIDED_STAGES.length;
export const LAST_STAGE_INDEX = STAGE_COUNT - 1;

// Presentation-only navigation state.
//   started    — has the visitor left the opening state?
//   stageIndex — the stage currently in focus (0..LAST_STAGE_INDEX).
//   maxReached — the furthest stage reached so far; earlier stages stay
//                accessible after going Back, later ones remain muted.
export interface GuidedState {
  started: boolean;
  stageIndex: number;
  maxReached: number;
}

export const INITIAL_GUIDED_STATE: GuidedState = Object.freeze({
  started: false,
  stageIndex: 0,
  maxReached: 0,
});

export function clampStageIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  const whole = Math.trunc(index);
  if (whole < 0) return 0;
  if (whole > LAST_STAGE_INDEX) return LAST_STAGE_INDEX;
  return whole;
}

// Begin the guided flow from the opening state. Always lands on the first stage
// with nothing yet reached beyond it.
export function startFlow(): GuidedState {
  return { started: true, stageIndex: 0, maxReached: 0 };
}

// Advance one stage. Starting the flow counts as reaching the first stage.
// Advancing past the last stage is a no-op (clamped).
export function nextStage(state: GuidedState): GuidedState {
  if (!state.started) return startFlow();
  const stageIndex = clampStageIndex(state.stageIndex + 1);
  return {
    started: true,
    stageIndex,
    maxReached: Math.max(state.maxReached, stageIndex),
  };
}

// Step back one stage. Going back from the first stage returns to the opening
// state. `maxReached` is preserved so forward stages stay accessible.
export function prevStage(state: GuidedState): GuidedState {
  if (!state.started) return INITIAL_GUIDED_STATE;
  if (state.stageIndex <= 0) {
    return { started: false, stageIndex: 0, maxReached: state.maxReached };
  }
  return {
    started: true,
    stageIndex: clampStageIndex(state.stageIndex - 1),
    maxReached: state.maxReached,
  };
}

// Jump directly to a stage. Only stages already reached may be targeted; a
// request beyond `maxReached` is clamped to the furthest reached stage so the
// flow can never skip ahead of the narrative.
export function goToStage(state: GuidedState, index: number): GuidedState {
  if (!state.started) return state;
  const requested = clampStageIndex(index);
  const stageIndex = Math.min(requested, state.maxReached);
  return { started: true, stageIndex, maxReached: state.maxReached };
}

// Return to the opening state and forget all progress.
export function restartFlow(): GuidedState {
  return { started: false, stageIndex: 0, maxReached: 0 };
}

export function isFirstStage(state: GuidedState): boolean {
  return state.started && state.stageIndex === 0;
}

export function isLastStage(state: GuidedState): boolean {
  return state.started && state.stageIndex === LAST_STAGE_INDEX;
}

export type StageStatus = "complete" | "current" | "upcoming";

// Status of a stage relative to the current position, for the progress rail.
// Before the flow starts, no stage is current or complete.
export function stageStatus(index: number, state: GuidedState): StageStatus {
  if (!state.started) return "upcoming";
  if (index < state.stageIndex) return "complete";
  if (index === state.stageIndex) return "current";
  return "upcoming";
}

// Whether a stage can be navigated to directly (already reached).
export function isStageReachable(index: number, state: GuidedState): boolean {
  if (!state.started) return false;
  return index >= 0 && index <= state.maxReached;
}

export function currentStage(state: GuidedState): GuidedStageMeta {
  return GUIDED_STAGES[clampStageIndex(state.stageIndex)];
}

// Human-readable "Step N of M" for the current stage (1-based). Returns null in
// the opening state, where no stage is active.
export function stageProgressLabel(state: GuidedState): string | null {
  if (!state.started) return null;
  return `Step ${clampStageIndex(state.stageIndex) + 1} of ${STAGE_COUNT}`;
}

// The replay-evidence toggle is only meaningful on the audit stage, and only
// for a journey that advertises separately-validated replay evidence. The
// controller decides *when* the toggle may appear; it never changes the toggle
// value or the underlying view.
export function isReplayToggleStage(
  state: GuidedState,
  supportsReplayToggle: boolean,
): boolean {
  return (
    state.started &&
    supportsReplayToggle &&
    currentStage(state).id === "audit"
  );
}

// Convenience projection used by the shell: the current stage's kind plus the
// exact view fields that stage surfaces. This never copies the view — it
// returns references into the SAME immutable object — so there is only ever one
// model of the governed result.
export interface StageProjection {
  meta: GuidedStageMeta;
  view: DemoPresentationView;
}

export function projectStage(
  state: GuidedState,
  view: DemoPresentationView,
): StageProjection {
  return { meta: currentStage(state), view };
}
