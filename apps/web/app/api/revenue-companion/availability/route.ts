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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function GET(): Response {
  return NextResponse.json(
    { available: isRevenueCompanionAccessible() },
    { status: 200, headers: NO_STORE },
  );
}
