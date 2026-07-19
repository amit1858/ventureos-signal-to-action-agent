// Guardrails Lab — same-origin classify route `POST /api/guardrails/classify`
// ===========================================================================
// The ONLY seam between the Guardrails Lab browser UI and the NVIDIA classifier.
// The browser posts a curated scenarioId (and an optional mode toggle for the
// live / forced-fallback demonstration); the server runs the AUTHORITATIVE
// deterministic rails, calls NVIDIA server-side, and returns a read-only
// evaluation + audit projection. The NVIDIA API key is read server-side only and
// is NEVER returned to the browser.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { guardrailsConfigFromEnv } from "../../../../lib/guardrails/config";
import { classifyJailbreak } from "../../../../lib/guardrails/nvidiaAdapter";
import { evaluateGuardrail, projectGuardrailAudit } from "../../../../lib/guardrails/evaluate";
import { getScenario } from "../../../../lib/guardrails/scenarios";
import type { NvidiaGuardrailsMode } from "../../../../lib/guardrails/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

function readMode(raw: unknown): NvidiaGuardrailsMode | undefined {
  if (raw === "live" || raw === "mock" || raw === "forced_fallback") return raw;
  return undefined;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const rec = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>;
  const scenarioId = typeof rec.scenarioId === "string" ? rec.scenarioId : "";
  const scenario = getScenario(scenarioId);
  if (!scenario) {
    return NextResponse.json({ error: "unknown_scenario" }, { status: 422 });
  }

  // Base config from server-only env; an optional request mode toggles the
  // demonstration path (live / mock / forced_fallback). The key is never exposed
  // and 'live' still only runs when the server is configured for it.
  const baseConfig = guardrailsConfigFromEnv(process.env);
  const requestedMode = readMode(rec.mode);
  const config = requestedMode ? { ...baseConfig, mode: requestedMode } : baseConfig;

  const nvidia = await classifyJailbreak(scenario.requestText, config);
  const evaluation = evaluateGuardrail(scenario, nvidia);
  const audit = projectGuardrailAudit(evaluation);

  return NextResponse.json({ evaluation, audit }, { status: 200 });
}
