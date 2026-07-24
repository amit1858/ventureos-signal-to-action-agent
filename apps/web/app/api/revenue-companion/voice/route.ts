// Revenue Companion — voice briefing route `POST /api/revenue-companion/voice`
// ===========================================================================
// The ONLY seam between the Revenue Companion browser UI and Gnani text-to-
// speech. The browser posts a journey reference + fingerprint (NEVER spoken
// text). The server rebuilds the deterministic script from immutable data,
// verifies the fingerprint, and synthesizes server-side. The Gnani API key is
// read server-side only and is NEVER returned to the browser. This route has no
// capability to mutate governance, approval, execution, CRM, or audit state.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { handleVoiceBriefing } from "../../../../lib/revenue-companion/voice/voiceBriefing.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: NextRequest): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const outcome = await handleVoiceBriefing(payload);

  switch (outcome.status) {
    case "ok":
      return new NextResponse(outcome.audio as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": outcome.contentType,
          "Content-Length": String(outcome.audio.byteLength),
          ...NO_STORE,
        },
      });
    case "forbidden":
      return NextResponse.json(
        { ok: false, status: "forbidden" },
        { status: 404, headers: NO_STORE },
      );
    case "bad_request":
      return NextResponse.json(
        { ok: false, status: "bad_request", reason: outcome.reason },
        { status: 400, headers: NO_STORE },
      );
    case "unconfigured":
      // Truthful: the feature is offered but no live voice is available.
      return NextResponse.json(
        { ok: false, status: "unconfigured" },
        { status: 200, headers: NO_STORE },
      );
    case "provider_error":
    default:
      return NextResponse.json(
        { ok: false, status: "provider_error" },
        { status: 502, headers: NO_STORE },
      );
  }
}
