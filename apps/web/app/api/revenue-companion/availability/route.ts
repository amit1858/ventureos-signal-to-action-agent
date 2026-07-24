// Revenue Companion — availability probe `GET /api/revenue-companion/availability`
// ============================================================================
// A minimal, server-only truth check the client landing surface can call to
// decide whether to render the Revenue Companion teaser. It returns a single
// boolean derived from the server-only `VENTUREOS_REVENUE_COMPANION` flag; it
// never echoes the flag value, never returns any secret, and carries no
// capability to rank, approve, execute, or mutate CRM/audit state. When the
// flag is off the honest answer is simply `{ available: false }` — the surface
// then stays hidden. This keeps the flag out of the browser bundle while still
// letting the client hydrate its presentation from server truth.

import { NextResponse } from "next/server";

import { isRevenueCompanionAccessible } from "../../../../lib/revenue-companion/access.server";
import { resolveVoicePresentationStatus } from "../../../../lib/revenue-companion/voice/access.server";
import { resolveVoiceInputPresentationStatus } from "../../../../lib/revenue-companion/stt/sttConfig.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function GET(): Response {
  const available = isRevenueCompanionAccessible();
  // Voice status is a truthful booleans-only projection (offered/configured/
  // classification) — never a key, endpoint, or fragment. Only surfaced when the
  // companion itself is available; otherwise the client gets no voice affordance.
  const voice = available ? resolveVoicePresentationStatus() : null;
  // Voice INPUT (speech-to-text) is a separate axis, gated by its own flag.
  const voiceInput = available ? resolveVoiceInputPresentationStatus() : null;
  return NextResponse.json(
    {
      available,
      voice: voice && voice.offered ? voice : null,
      voiceInput: voiceInput && voiceInput.offered ? voiceInput : null,
    },
    { status: 200, headers: NO_STORE },
  );
}
