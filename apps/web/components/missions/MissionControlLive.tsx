"use client";

// Release 2.2 — Mission Control · live renewal-risk loader (F1 correction)
// ========================================================================
// The client seam that runs the governed renewal-risk mission through the REAL
// stack: it POSTs the presentation request to the Next.js Mission BFF
// (`POST /api/missions/execute`), which calls the Python Adaptive Mission Harness,
// composes the TypeScript MissionTurn (Memory Core + Conversation Runtime), and
// returns ONE governed `MissionTurn`. That live turn is what the shared
// presentation surface renders.
//
// The browser NEVER calls Python directly and never sees the Python endpoint or
// service token — it only talks to this same-origin BFF route.
//
// Fallback is HONEST and VISIBLY LABELED: if the live mission service is
// unavailable, we render the deterministic offline demo turn behind an explicit
// banner so a viewer can never mistake it for a live governed result.

import * as React from "react";
import { AlertTriangle, Link2 } from "lucide-react";

import { MissionControl } from "@/components/missions/MissionControl";
import { GovernedAnalysisProgress } from "@/components/missions/GovernedAnalysisProgress";
import { RENEWAL_PRESENTATION_REQUEST, buildRenewalDemoTurn } from "@/lib/missions/demo";
import {
  validateIncomingMissionContext,
  continuityCue,
  MISSION_CONTEXT_PARAMS,
} from "@/lib/demo/canonicalMission";
import type { MissionTurn } from "@/lib/missions/types";

type LoadState =
  | { phase: "loading" }
  | { phase: "live"; turn: MissionTurn }
  | { phase: "offline"; turn: MissionTurn; reason: string };

/** The honest, business-English continuity cue shown when Mission Control is
 * opened from Today's Mission with a validated canonical context. It confirms —
 * from a deterministic allowlist — that this is the SAME Curefoods account and
 * governed mission the seller opened, and never silently switches accounts. */
function ContinuityCue() {
  // Read the incoming context AFTER mount (client-only). A `useMemo` that reads
  // `window` returns null during SSR and is not guaranteed to recompute on
  // hydration, so the cue could silently never appear on the hosted deployment.
  // Computing it in an effect forces a client-side render once the URL is known.
  const [cue, setCue] = React.useState<{ title: string; detail: string } | null>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const validation = validateIncomingMissionContext({
      account: params.get(MISSION_CONTEXT_PARAMS.account),
      mission: params.get(MISSION_CONTEXT_PARAMS.mission),
      from: params.get(MISSION_CONTEXT_PARAMS.from),
    });
    setCue(continuityCue(validation));
  }, []);

  if (!cue) return null;
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-6">
      <div className="flex items-start gap-3 rounded-lg border border-gov/40 bg-gov/10 p-4 text-sm">
        <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-gov-bright" aria-hidden />
        <div>
          <p className="font-medium text-ink">{cue.title}</p>
          <p className="mt-1 text-muted">{cue.detail}</p>
        </div>
      </div>
    </div>
  );
}

export function MissionControlLive() {
  const [state, setState] = React.useState<LoadState>({ phase: "loading" });

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch("/api/missions/execute", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(RENEWAL_PRESENTATION_REQUEST),
        });
        const body = (await res.json()) as { missionTurn?: MissionTurn | null };
        if (cancelled) return;
        if (res.ok && body && body.missionTurn) {
          setState({ phase: "live", turn: body.missionTurn });
          return;
        }
        setState({
          phase: "offline",
          turn: buildRenewalDemoTurn(),
          reason: "The mission service returned no governed turn.",
        });
      } catch {
        if (cancelled) return;
        setState({
          phase: "offline",
          turn: buildRenewalDemoTurn(),
          reason: "The mission service is unavailable.",
        });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === "loading") {
    return (
      <>
        <ContinuityCue />
        <GovernedAnalysisProgress />
      </>
    );
  }

  return (
    <>
      <ContinuityCue />
      {state.phase === "offline" && (
        <div className="mx-auto w-full max-w-4xl px-4 pt-6">
          <div className="flex items-start gap-3 rounded-lg border border-risk/40 bg-risk/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-risk" aria-hidden />
            <div>
              <p className="font-medium text-ink">Offline demo turn — not a live mission</p>
              <p className="mt-1 text-muted">
                {state.reason} Showing the deterministic renewal-risk demo turn so the experience stays
                reviewable. Start the local Python harness and Next.js BFF to run the live governed mission.
              </p>
            </div>
          </div>
        </div>
      )}
      <MissionControl turn={state.turn} />
    </>
  );
}
