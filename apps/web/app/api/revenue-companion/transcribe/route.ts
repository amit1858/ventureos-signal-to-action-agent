// Revenue Companion — transcribe route `POST /api/revenue-companion/transcribe`
// =============================================================================
// The ONLY seam between the Revenue Companion browser UI and Gnani speech-to-
// text. The browser posts a short recorded audio clip as multipart/form-data.
// The server validates it, calls Gnani server-side (the API key is read server-
// side only and is NEVER returned to the browser), sanitizes the transcript, and
// returns it for the seller to REVIEW. This route does NOT execute the question:
// intent routing + the governed answer happen only when the seller presses Ask.
// It has no capability to mutate governance, approval, execution, CRM, or audit.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { handleTranscribe } from "../../../../lib/revenue-companion/stt/sttService.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 25;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: NextRequest): Promise<Response> {
  let form: FormData | null = null;
  try {
    form = await request.formData();
  } catch {
    form = null;
  }

  const outcome = await handleTranscribe(form);

  switch (outcome.status) {
    case "ok":
      return NextResponse.json(
        { ok: true, status: "ok", transcript: outcome.transcript },
        { status: 200, headers: NO_STORE },
      );
    case "forbidden":
      // Fail closed: when the feature is off the route does not exist to the client.
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
      // Truthful: voice input is offered but no live transcription is available.
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
