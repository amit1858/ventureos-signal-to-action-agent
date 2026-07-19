// Release 2.5 — Mission Control · governed analysis progress (F2.2 product review)
// ================================================================================
// Pure, deterministic logic for the LIVE governed-mission loading experience. It
// turns "time elapsed since the mission request began" into honest, business-facing
// progress copy and an ESTIMATED position along the governed mission pipeline.
//
// Truthfulness contract (locked — the component must not violate these):
//   * There is NO streaming, SSE, WebSocket, or polling. The BFF is a single
//     request/response, so we genuinely CANNOT observe the real backend sub-stage.
//     The six stages are therefore presented as the mission's EXPECTED pipeline
//     (a roadmap the user can read), NOT as live backend telemetry.
//   * The only transitions tied to REAL events are the start (request begins) and
//     the terminal resolve (a real MissionTurn / fallback arrives) — those are
//     owned by the component, not this module.
//   * NVIDIA Nemotron participates ONLY at the "enhance" stage, which is placed
//     AFTER account resolution, evidence verification and mission preparation. No
//     stage may imply NVIDIA resolves the account, selects/verifies the mission,
//     assigns confidence, approves, executes, updates CRM, contacts the customer,
//     closes the mission, or writes the audit ledger.
//   * No fabricated percentages, no chain-of-thought, no reasoning tokens.
//
// Pure module: types + constants + pure functions. No JSX, no clock, no network,
// no globals. The elapsed time is passed IN so this is fully deterministic.

/** Who a pipeline stage belongs to. Governance stages are VentureOS-owned; only
 * the explanation-enhancement stage is NVIDIA-owned, and it is a late,
 * presentation-only step. */
export type StageOwner = "ventureos" | "nvidia";

/** One stage of the governed mission pipeline shown in the progress timeline. */
export interface AnalysisStage {
  id: string;
  /** Business-facing label — an observable product stage, never chain-of-thought. */
  label: string;
  owner: StageOwner;
}

/** The ordered governed-mission pipeline. The first three stages represent the
 * overall governed request (Python Adaptive Mission Harness); "enhance" is the
 * NVIDIA narrative step; "validate" is the deterministic grounding guard; "ready"
 * is the terminal roadmap endpoint (only reached on a real resolve). */
export const ANALYSIS_STAGES: readonly AnalysisStage[] = [
  { id: "understand", label: "Understanding the account", owner: "ventureos" },
  { id: "verify", label: "Verifying the evidence", owner: "ventureos" },
  { id: "prepare", label: "Preparing the governed mission", owner: "ventureos" },
  { id: "enhance", label: "Enhancing the explanation with NVIDIA Nemotron", owner: "nvidia" },
  { id: "validate", label: "Validating claims against the evidence", owner: "ventureos" },
  { id: "ready", label: "Mission ready for review", owner: "ventureos" },
] as const;

/** Index of the NVIDIA-owned stage — the ONLY stage that may show NVIDIA wording. */
export const NVIDIA_STAGE_INDEX = ANALYSIS_STAGES.findIndex((s) => s.owner === "nvidia");

// --- Copy (locked wording from the product spec) ---------------------------------
export const PRIMARY_INITIAL = "Running the governed renewal-risk mission…";
export const SUPPORT_INITIAL =
  "VentureOS is resolving the account, verifying evidence, and preparing the mission for review.";
export const PRIMARY_NVIDIA = "Enhancing the explanation with NVIDIA Nemotron…";
export const SUPPORT_NVIDIA = "The mission decision and approval scope remain governed by VentureOS.";
export const DELAYED_HINT =
  "This may take a few more seconds while the explanation is checked against verified evidence.";

/** When to surface the honest "this may take a few more seconds" hint. */
export const DELAYED_HINT_AFTER_MS = 8_000;

/** Estimated cumulative END time (ms) for each stage, tuned to the measured
 * ~11–12 s live latency. This is an EXPECTED schedule used only to animate the
 * roadmap while we wait — it is never presented as a precise backend readout and
 * never becomes a percentage. The longest window is the NVIDIA model call. A real
 * resolve always overrides this estimate (handled by the component). */
const STAGE_END_MS: readonly number[] = [
  1_500, // understand
  3_500, // verify
  5_000, // prepare
  9_500, // enhance (model call — the longest window)
  10_500, // validate (last time-selectable stage)
];

export interface AnalysisProgress {
  /** Estimated active stage index (0..len-1). Clamped; never past the last. */
  activeIndex: number;
  /** The active stage. */
  stage: AnalysisStage;
  /** Whether the active stage is the NVIDIA explanation-enhancement step. */
  isNvidiaStage: boolean;
  /** Primary business-facing message. NVIDIA wording appears ONLY on the NVIDIA stage. */
  primary: string;
  /** Supporting message clarifying VentureOS retains governance. */
  support: string;
  /** Whether to show the honest delayed-wait hint. */
  showDelayedHint: boolean;
}

/** Clamp helper. */
function clampIndex(i: number): number {
  if (i < 0) return 0;
  const max = ANALYSIS_STAGES.length - 1;
  return i > max ? max : i;
}

/** Derive the estimated active stage index from elapsed time. Deterministic:
 * same elapsedMs -> same index. The terminal "ready" stage (index 5) has no time
 * window and is never selected by time alone; it is only reached on a real resolve. */
export function stageIndexForElapsed(elapsedMs: number): number {
  const t = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  for (let i = 0; i < STAGE_END_MS.length; i++) {
    if (t < STAGE_END_MS[i]) return clampIndex(i);
  }
  // Past every finite window but not resolved: hold on the last pre-terminal stage.
  return clampIndex(ANALYSIS_STAGES.length - 2);
}

/** Derive the full honest progress state for a given elapsed time while the
 * governed mission request is still in flight. NVIDIA wording is gated strictly to
 * the NVIDIA-owned stage. */
export function deriveAnalysisProgress(elapsedMs: number): AnalysisProgress {
  const activeIndex = stageIndexForElapsed(elapsedMs);
  const stage = ANALYSIS_STAGES[activeIndex];
  const isNvidiaStage = stage.owner === "nvidia";
  return {
    activeIndex,
    stage,
    isNvidiaStage,
    primary: isNvidiaStage ? PRIMARY_NVIDIA : PRIMARY_INITIAL,
    support: isNvidiaStage ? SUPPORT_NVIDIA : SUPPORT_INITIAL,
    showDelayedHint: (Number.isFinite(elapsedMs) ? elapsedMs : 0) >= DELAYED_HINT_AFTER_MS,
  };
}

/** Visual state of a single stage marker in the timeline, given the active
 * estimate. There is deliberately NO "done" / "complete" / "confirmed" state:
 * because the six stages are a time-driven roadmap (not backend telemetry), a
 * stage the estimate has already passed is rendered only as a QUIETER "past"
 * marker — never a completion checkmark that would falsely imply the backend
 * confirmed it. Exactly one stage is "active" at a time; everything else is
 * "past" (behind the estimate) or "upcoming" (ahead of it). The real mission
 * result/fallback is the ONLY thing that confirms completion, and it is shown by
 * the parent unmounting this component — not by any marker here. */
export type StageMarker = "past" | "active" | "upcoming";

export function stageMarker(stageIndex: number, activeIndex: number): StageMarker {
  if (stageIndex < activeIndex) return "past";
  if (stageIndex === activeIndex) return "active";
  return "upcoming";
}
