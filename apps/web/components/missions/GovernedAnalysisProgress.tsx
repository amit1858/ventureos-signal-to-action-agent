"use client";

// Release 2.5 — Mission Control · GovernedAnalysisProgress (F2.2 product review)
// ==============================================================================
// The presentation-only loading experience for a LIVE governed renewal-risk
// mission run. It replaces the bare one-line spinner so the ~11–12 s wait feels
// transparent and intentional — WITHOUT streaming, SSE, WebSockets, polling, fake
// percentages, or any exposure of model chain-of-thought.
//
// Honesty (see lib/nvidia/governedAnalysisProgress.ts for the full contract):
//   * The six stages are the governed mission's EXPECTED pipeline (a readable
//     roadmap), animated on an estimated schedule while we await the single BFF
//     response. They are NOT live backend telemetry and never show a percentage.
//   * NVIDIA Nemotron wording appears ONLY on the enhancement stage, which sits
//     after account resolution, evidence verification and mission preparation.
//   * The component owns only two real-event transitions: mount (request begins)
//     and unmount (a real MissionTurn/fallback resolved — the parent swaps us out).
//   * Respects prefers-reduced-motion and is announced via role="status".

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";

import { cx } from "@/lib/format";
import {
  ANALYSIS_STAGES,
  DELAYED_HINT,
  deriveAnalysisProgress,
  stageMarker,
} from "@/lib/nvidia/governedAnalysisProgress";
import type { StageMarker } from "@/lib/nvidia/governedAnalysisProgress";

/** Poll cadence for the local elapsed-time estimate. Coarse on purpose — this is
 * a roadmap animation, not precise telemetry. */
const TICK_MS = 250;

/** Read the user's reduced-motion preference (client-only, SSR-safe). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

/** Elapsed-ms ticker that stops advancing under reduced motion (it settles on a
 * single honest resting state instead of animating). */
function useElapsedMs(reducedMotion: boolean): number {
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    if (reducedMotion) return; // hold at 0 -> stable first-stage copy, no motion
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - started), TICK_MS);
    return () => window.clearInterval(id);
  }, [reducedMotion]);
  return elapsed;
}

function StageDot({ marker, nvidia }: { marker: StageMarker; nvidia: boolean }) {
  if (marker === "active") {
    return (
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
        <span
          className={cx(
            "absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping motion-reduce:hidden",
            nvidia ? "bg-accent/50" : "bg-brand/50",
          )}
        />
        <span className={cx("relative h-2.5 w-2.5 rounded-full", nvidia ? "bg-accent" : "bg-brand")} />
      </span>
    );
  }
  // "past" and "upcoming" are BOTH low-emphasis dots — never a completion
  // checkmark. A time-driven stage is only quieter once the estimate passes it;
  // it is never presented as backend-confirmed. Past reads slightly stronger than
  // upcoming, but neither claims the stage finished.
  const past = marker === "past";
  return (
    <span
      className={cx(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
        past ? "border-edge" : "border-edge/50",
      )}
      aria-hidden="true"
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", past ? "bg-faint/70" : "bg-faint/30")} />
    </span>
  );
}

export function GovernedAnalysisProgress() {
  const reducedMotion = usePrefersReducedMotion();
  const elapsedMs = useElapsedMs(reducedMotion);
  const progress = deriveAnalysisProgress(elapsedMs);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-16">
      <div
        role="status"
        aria-live="polite"
        aria-label="Running the governed renewal-risk mission"
        className="card p-5 sm:p-6"
      >
        <div className="flex items-center gap-3">
          {progress.isNvidiaStage ? (
            <Sparkles
              className="h-5 w-5 shrink-0 text-accent motion-safe:animate-pulse motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <Loader2
              className="h-5 w-5 shrink-0 text-brand motion-safe:animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          <p className="text-sm font-medium text-ink">{progress.primary}</p>
        </div>
        <p className="mt-1.5 pl-8 text-xs text-muted">{progress.support}</p>

        <ol className="mt-5 space-y-2.5" aria-label="Governed mission stages">
          {ANALYSIS_STAGES.map((stage, i) => {
            const marker = stageMarker(i, progress.activeIndex);
            const nvidia = stage.owner === "nvidia";
            return (
              <li key={stage.id} className="flex items-center gap-3">
                <StageDot marker={marker} nvidia={nvidia} />
                <span
                  className={cx(
                    "text-sm",
                    marker === "active"
                      ? nvidia
                        ? "font-medium text-accent"
                        : "font-medium text-ink"
                      : marker === "past"
                        ? "text-muted"
                        : "text-faint",
                  )}
                >
                  {stage.label}
                </span>
              </li>
            );
          })}
        </ol>

        {progress.showDelayedHint ? (
          <p className="mt-4 border-t border-edge pt-3 text-xs text-faint">{DELAYED_HINT}</p>
        ) : null}
      </div>
      <p className="mt-3 px-1 text-center text-[11px] text-faint">
        Stages shown are the governed mission&rsquo;s expected sequence. VentureOS resolves the account,
        verifies evidence, selects and verifies the mission, and controls approval — NVIDIA Nemotron only
        enhances the explanation.
      </p>
    </div>
  );
}
