// Release 2.2 — Mission BFF · Next.js route `POST /api/missions/execute`
// ======================================================================
// The single server-side seam between presentation and the Python Adaptive
// Mission Harness. The browser (screen / voice / Digital Human) calls ONLY this
// route; it never reaches Python directly. This handler is a thin adapter: it
// parses the request, wires the real dependencies, delegates to the pure
// governed core, and serialises the presentation-safe result.
//
// The private Python endpoint and service token are read server-side only and
// are never sent to the browser.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { defaultHarnessCaller } from "../../../../lib/harness/client";
import { defaultInjectedTimestamps } from "../../../../lib/harness/requestBuilder";
import { executeMissionRequest } from "../../../../lib/missions/bff";
import type { MissionBffDeps } from "../../../../lib/missions/bff";
import { renewalMissionMemoryDeps } from "../../../../lib/missions/demo";
import { nvidiaConfigFromEnv, selectNarrativeProvider } from "../../../../lib/nvidia/provider";

// Never statically optimise or cache: every mission is evaluated fresh.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Bounded server budget so the deterministic fallback always completes on the
// server before Vercel terminates the function. Worst case ≈ harness (≤20s,
// 10s + one retry) + NVIDIA narrative (≤30s per-attempt + total budget) + assembly.
// 60s is the Vercel Hobby ceiling and leaves headroom above that ~50s worst case.
export const maxDuration = 60;

function newId(prefix: string): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${uuid}`;
}

function realDeps(): MissionBffDeps {
  // Release 2.3 — resolve the NVIDIA narrative provider from SERVER-ONLY config.
  // Defaults to the deterministic mock (no live key / no network this release);
  // no NVIDIA URL or key is ever exposed to the browser.
  const nvidiaConfig = nvidiaConfigFromEnv(process.env);
  return {
    callHarness: defaultHarnessCaller(),
    newRequestId: () => newId("REQ"),
    newCorrelationId: () => newId("CORR"),
    newIdempotencyKey: () => newId("IDEM"),
    injectedTimestamps: defaultInjectedTimestamps,
    // Live MissionTurn assembly: the completed governed payload is composed
    // through the TypeScript Memory Core + Conversation Runtime (F1.5) and packaged
    // by the F1.6 assembler. Python never composes language and none crosses back.
    buildMemoryDeps: renewalMissionMemoryDeps,
    // Post-decision, pre-presentation grounded narrative (presentation only).
    nvidiaProvider: selectNarrativeProvider(nvidiaConfig),
    nvidiaAudience: nvidiaConfig.audience,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = null; // the core validator will reject a non-object body (422).
  }

  const result = await executeMissionRequest(payload, realDeps());
  return NextResponse.json(result.body, { status: result.httpStatus });
}
