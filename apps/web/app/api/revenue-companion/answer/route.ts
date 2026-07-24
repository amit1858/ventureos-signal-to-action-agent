// Revenue Companion — guided answer route `POST /api/revenue-companion/answer`
// ============================================================================
// Returns ONE bounded, grounded `RevenueCompanionAnswer` for a typed question or
// a curated intent, composed server-side from the immutable governed journey
// view. Gated by the server-only Revenue Companion flag (404 when off). The
// response is a presentation projection only — it carries no secrets and has no
// capability to rank, approve, execute, or mutate CRM/audit state.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { handleAnswerRequest } from "../../../../lib/revenue-companion/guided/answerService.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: NextRequest): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const outcome = handleAnswerRequest(payload);

  switch (outcome.status) {
    case "ok":
      return NextResponse.json(
        { ok: true, answer: outcome.answer },
        { status: 200, headers: NO_STORE },
      );
    case "forbidden":
      return NextResponse.json(
        { ok: false, status: "forbidden" },
        { status: 404, headers: NO_STORE },
      );
    case "bad_request":
    default:
      return NextResponse.json(
        { ok: false, status: "bad_request", reason: outcome.reason },
        { status: 400, headers: NO_STORE },
      );
  }
}
