// Manager Coach POC — isolated embeddability probe (presentation support).
//
// The Soul Machines hosted assistant enforces its own framing policy
// (X-Frame-Options / CSP frame-ancestors). When that policy does not allow the
// VentureOS origin, the assistant CANNOT be embedded in an iframe and the
// browser shows a "refused to connect" page. This route inspects those headers
// server-side (a public URL, no secrets) so the client can present a clean
// "open in new window" fallback instead of a raw browser error.
//
// It is a presentation-support adapter only: it reads no business data and
// touches no ranking, governance, approval, memory, mission or CRM logic.

import { NextResponse } from "next/server";

import { getAssistantUrl, isSoulMachinesPocEnabled } from "@/lib/soul-machines/config";

export const dynamic = "force-dynamic";

type ProbeResult = {
  embeddable: boolean;
  reason: "ok" | "config-missing" | "x-frame-options" | "frame-ancestors" | "probe-failed";
  xFrameOptions?: string | null;
  frameAncestors?: string | null;
};

function extractFrameAncestors(csp: string | null): string | null {
  if (!csp) return null;
  const directive = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith("frame-ancestors"));
  return directive ?? null;
}

/**
 * A same-origin (self) or none frame-ancestors policy blocks embedding from a
 * different origin. We can only reason about "self"/"none" reliably; wildcard
 * or explicit host allow-lists are treated as not-embeddable here because the
 * VentureOS origin is not soulmachines.com. Fail closed.
 */
function isEmbeddableFromOtherOrigin(
  xfo: string | null,
  frameAncestors: string | null,
): { embeddable: boolean; reason: ProbeResult["reason"] } {
  const xfoLower = (xfo ?? "").toLowerCase();
  if (xfoLower.includes("deny") || xfoLower.includes("sameorigin")) {
    return { embeddable: false, reason: "x-frame-options" };
  }
  if (frameAncestors) {
    const value = frameAncestors.toLowerCase();
    // Only an explicit wildcard would clearly permit our origin. Anything
    // scoped to 'self'/'none'/specific hosts is treated as blocked.
    const permitsAny = value.includes("*") && !value.includes("'none'");
    if (!permitsAny) return { embeddable: false, reason: "frame-ancestors" };
  }
  return { embeddable: true, reason: "ok" };
}

export async function GET() {
  // Fail closed: the probe only exists when the POC is explicitly enabled.
  if (!isSoulMachinesPocEnabled()) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const assistantUrl = getAssistantUrl();
  if (!assistantUrl) {
    return NextResponse.json<ProbeResult>(
      { embeddable: false, reason: "config-missing" },
      { status: 200 },
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(assistantUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    const xfo = res.headers.get("x-frame-options");
    const csp = res.headers.get("content-security-policy");
    const frameAncestors = extractFrameAncestors(csp);
    const { embeddable, reason } = isEmbeddableFromOtherOrigin(xfo, frameAncestors);

    return NextResponse.json<ProbeResult>(
      { embeddable, reason, xFrameOptions: xfo, frameAncestors },
      { status: 200 },
    );
  } catch {
    // Fail closed: if we cannot verify, do not attempt to embed.
    return NextResponse.json<ProbeResult>(
      { embeddable: false, reason: "probe-failed" },
      { status: 200 },
    );
  }
}
