// Release 2.4 — NVIDIA-Grounded Mission Intelligence · hosted NIM evals
// =====================================================================
// Deterministic, NETWORK-FREE proof of the hosted NVIDIA NIM provider and the
// live-output security hardening. The hosted endpoint is replaced by an injected
// stub `fetch`, so these run with zero network and zero secrets. They prove:
//   * request formation (endpoint, model, messages, JSON-only intent);
//   * the Authorization header is set for the call but NEVER leaks into output;
//   * provider/model on the narrative are server-owned and cannot be spoofed;
//   * defensive parsing of malformed / prose / missing-field completions;
//   * every Feature 2.1 grounding rule still rejects bad live output;
//   * live-output security rejection (secrets, tokens, paths, stack traces,
//     URLs, DB strings, HTML/script injection, control chars);
//   * retry policy (retry once on 429/503/timeout/network; never on 400/401);
//   * fail-closed fallback + truthful labels for every failure path;
//   * blocked / rejected / revision missions NEVER invoke the provider.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/nvidia/eval/nvidiaNim.eval.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { RENEWAL_DEMO_PAYLOAD, renewalMissionMemoryDeps } from "../../missions/demo";
import type { PersonaResponse } from "../../conversation/types";
import { composeMockNarrative } from "../mockProvider";
import { validateGroundedNarrative, securityViolations } from "../grounding";
import { buildNarrativeRequest, groundMissionNarrative } from "../narrative";
import { selectNarrativeProvider, nvidiaConfigFromEnv, hasLiveNimConfig } from "../provider";
import {
  narrativeStateLabel,
  NARRATIVE_LABEL_MOCK,
  NARRATIVE_LABEL_LIVE,
  NARRATIVE_LABEL_FALLBACK,
} from "../presentation";
import {
  createNimProvider,
  buildNimUserContent,
  extractNarrativeJson,
  NIM_SYSTEM_INSTRUCTION,
} from "../nimProvider";
import type { NimFetchLike, NimProviderConfig } from "../nimProvider";
import { executeMissionRequest } from "../../missions/bff";
import type { MissionBffDeps } from "../../missions/bff";
import type {
  ContractFixtureEnvelope,
  HarnessServiceRequest,
  HarnessServiceResponse,
} from "../../harness/types";
import type {
  NvidiaGroundedNarrative,
  NvidiaNarrativeProvider,
  NvidiaNarrativeRequest,
} from "../types";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

// A fake, obviously-not-real key. The real key lives only in .env.local.
const CONFIG: NimProviderConfig = {
  baseUrl: "https://example.invalid/v1",
  apiKey: "test-fake-key-do-not-use",
  model: "nvidia/test-nemotron",
  timeoutMs: 5000,
  maxRetries: 1,
};

const persona = {
  personaId: "persona-renewal_risk",
  intent: "risk_review",
  voiceSummary: "Curefoods is at renewal risk; prepare renewal outreach. All actions are simulated.",
  segments: [],
  citations: [],
} as unknown as PersonaResponse;

const REQUEST_INPUT = {
  payload: RENEWAL_DEMO_PAYLOAD,
  personaResponse: persona,
  requestId: "REQ-NIM-1",
  correlationId: "CORR-NIM-1",
};
const request: NvidiaNarrativeRequest = buildNarrativeRequest(REQUEST_INPUT);

/** A valid grounded-narrative body (mirrors what a well-behaved model returns). */
function validBody(): Record<string, unknown> {
  const m = composeMockNarrative(request);
  return {
    whatChanged: m.whatChanged,
    riskExplanation: m.riskExplanation,
    recommendationRationale: m.recommendationRationale,
    approvalExplanation: m.approvalExplanation,
    voiceSummary: m.voiceSummary,
    evidenceRefs: m.evidenceRefs,
    caveats: m.caveats,
  };
}

/** Wrap a body object as an OpenAI-compatible chat-completions envelope. */
function envelope(bodyObj: unknown, asProse = false): string {
  const content = asProse ? String(bodyObj) : JSON.stringify(bodyObj);
  return JSON.stringify({ choices: [{ message: { content } }] });
}

interface StubStep {
  status?: number;
  text?: string;
  throwAbort?: boolean;
  throwNetwork?: boolean;
}
interface Stub {
  fn: NimFetchLike;
  calls: () => number;
  inits: { url: string; headers: Record<string, string>; body: string }[];
}
function stubFetch(steps: StubStep[]): Stub {
  let i = 0;
  const inits: Stub["inits"] = [];
  const fn: NimFetchLike = async (url, init) => {
    inits.push({ url, headers: init.headers, body: init.body });
    const step = steps[Math.min(i, steps.length - 1)];
    i++;
    if (step.throwAbort) {
      const e = new Error("aborted") as Error & { name: string };
      e.name = "AbortError";
      throw e;
    }
    if (step.throwNetwork) throw new Error("ECONNRESET");
    const status = step.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => step.text ?? "",
    };
  };
  return { fn, calls: () => i, inits };
}

function nim(steps: StubStep[]): { provider: NvidiaNarrativeProvider; stub: Stub } {
  const stub = stubFetch(steps);
  return { provider: createNimProvider(CONFIG, { fetchImpl: stub.fn }), stub };
}

async function run(): Promise<void> {
  // -------------------------------------------------------------------------
  console.log("\n[1] Request formation + server-owned metadata");
  // -------------------------------------------------------------------------
  {
    const { provider, stub } = nim([{ status: 200, text: envelope(validBody()) }]);
    const n = await provider.generate(request);
    const sent = JSON.parse(stub.inits[0].body) as {
      model: string;
      messages: { role: string; content: string }[];
      temperature: number;
      stream: boolean;
    };
    check("calls the /chat/completions endpoint", stub.inits[0].url === "https://example.invalid/v1/chat/completions");
    check("request uses the server-configured model", sent.model === CONFIG.model);
    check("request has a system + user message", sent.messages.length === 2 && sent.messages[0].role === "system" && sent.messages[1].role === "user");
    check("system instruction forbids execution/approval", NIM_SYSTEM_INSTRUCTION.includes("Do NOT execute") && NIM_SYSTEM_INSTRUCTION.includes("Do NOT approve"));
    check("request is deterministic (temperature 0, no stream)", sent.temperature === 0 && sent.stream === false);
    check("user content is the governed payload JSON", sent.messages[1].content === buildNimUserContent(request));
    check("narrative provider is server-owned 'nim'", n.provider === "nim");
    check("narrative model is server-owned config model", n.model === CONFIG.model);
    check("telemetry latency captured", typeof n.latencyMs === "number" && (n.latencyMs as number) >= 0);
    check("telemetry attempts captured (1 on first success)", n.attempts === 1);
  }

  // -------------------------------------------------------------------------
  console.log("\n[2] Authorization header set for the call, never leaked to output");
  // -------------------------------------------------------------------------
  {
    const { provider, stub } = nim([{ status: 200, text: envelope(validBody()) }]);
    const n = await provider.generate(request);
    check("Authorization header is a Bearer token", stub.inits[0].headers.Authorization === `Bearer ${CONFIG.apiKey}`);
    const serialized = JSON.stringify(n);
    check("narrative JSON does not contain the api key", !serialized.includes(CONFIG.apiKey));
    check("narrative JSON has no Authorization field", !/authorization/i.test(serialized));
  }

  // -------------------------------------------------------------------------
  console.log("\n[3] provider/model cannot be spoofed by model output");
  // -------------------------------------------------------------------------
  {
    const spoof = { ...validBody(), provider: "evil-provider", model: "evil-model" };
    const { provider } = nim([{ status: 200, text: envelope(spoof) }]);
    const n = await provider.generate(request);
    check("spoofed provider ignored (stays 'nim')", n.provider === "nim");
    check("spoofed model ignored (stays config model)", n.model === CONFIG.model);
  }

  // -------------------------------------------------------------------------
  console.log("\n[4] Valid hosted-NIM response is grounded end-to-end");
  // -------------------------------------------------------------------------
  {
    const { provider } = nim([{ status: 200, text: envelope(validBody()) }]);
    const att = await groundMissionNarrative(REQUEST_INPUT, provider);
    check("valid response -> grounded", att.narrative.grounded === true && att.narrative.validationStatus === "grounded");
    check("valid response -> not fallback", att.narrative.fallbackUsed === false);
    check("valid response -> provider nim", att.narrative.provider === "nim");
    check("valid response -> evidence subset preserved", att.narrative.evidenceRefs.every((r) => request.evidenceRefs.includes(r)));
    check("valid response -> live label", narrativeStateLabel(att.narrative.provider, att.narrative.fallbackUsed).label === NARRATIVE_LABEL_LIVE);
  }

  // -------------------------------------------------------------------------
  console.log("\n[5] Defensive parsing: malformed / prose / missing fields -> fallback");
  // -------------------------------------------------------------------------
  {
    // Reasoning + code fences around valid JSON must still parse.
    const wrapped = "<think>let me reason</think>\n```json\n" + JSON.stringify(validBody()) + "\n```";
    const parsed = extractNarrativeJson(wrapped);
    check("strips <think> and code fences", typeof parsed.whatChanged === "string");

    const cases: { name: string; text: string }[] = [
      { name: "malformed json", text: envelope("{not valid json", true) },
      { name: "prose instead of json", text: envelope("The account looks risky, here is my analysis.", true) },
      { name: "missing required fields", text: envelope({ whatChanged: "", voiceSummary: "" }) },
      { name: "empty content", text: JSON.stringify({ choices: [{ message: { content: "" } }] }) },
      { name: "no choices", text: JSON.stringify({ choices: [] }) },
    ];
    for (const c of cases) {
      const { provider } = nim([{ status: 200, text: c.text }]);
      const att = await groundMissionNarrative(REQUEST_INPUT, provider);
      check(`${c.name} -> deterministic fallback`, att.narrative.fallbackUsed === true && att.narrative.provider === "ventureos-deterministic");
    }
  }

  // -------------------------------------------------------------------------
  console.log("\n[6] Grounding rejections (Feature 2.1 rules) on live output -> fallback");
  // -------------------------------------------------------------------------
  {
    const base = validBody();
    const bad: { name: string; mutate: (b: Record<string, unknown>) => void }[] = [
      { name: "unsupported evidence ref", mutate: (b) => { b.evidenceRefs = [...(b.evidenceRefs as string[]), "EVIDENCE-FORGED-999"]; } },
      { name: "fabricated metric", mutate: (b) => { b.riskExplanation = "Revenue dropped 73% last quarter for this account."; } },
      { name: "foreign action", mutate: (b) => { b.recommendationRationale = "We should issue a refund and a discount to retain them."; } },
      { name: "approval claim", mutate: (b) => { b.approvalExplanation = "The mission has been approved and is ready."; } },
      { name: "real-execution claim", mutate: (b) => { b.whatChanged = "The renewal email was sent to the customer."; } },
    ];
    for (const c of bad) {
      const body = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
      c.mutate(body);
      const { provider } = nim([{ status: 200, text: envelope(body) }]);
      const att = await groundMissionNarrative(REQUEST_INPUT, provider);
      check(`${c.name} -> fallback`, att.narrative.fallbackUsed === true);
      check(`${c.name} -> fallback label`, narrativeStateLabel(att.narrative.provider, att.narrative.fallbackUsed).label === NARRATIVE_LABEL_FALLBACK);
    }
  }

  // -------------------------------------------------------------------------
  console.log("\n[7] Live-output security rejection");
  // -------------------------------------------------------------------------
  {
    const leaks: { name: string; text: string }[] = [
      { name: "api key (nvapi-)", text: "The key is nvapi-ABCD1234EFGH5678 for access." },
      { name: "openai key (sk-)", text: "Use sk-abcdef123456 to authenticate." },
      { name: "bearer token", text: "Send header Authorization Bearer abcdef123456789." },
      { name: "masked secret", text: "The token is ****** now." },
      { name: "env assignment", text: "Set NVIDIA_API_KEY=supersecretvalue to proceed." },
      { name: "internal service var", text: "The PYTHON_HARNESS_URL is configured." },
      { name: "localhost ref", text: "Reach the service at localhost for details." },
      { name: "windows path", text: "See C:\\Users\\admin\\secrets\\key.txt for the value." },
      { name: "unix path", text: "The secret sits in /etc/passwd on the host." },
      { name: "stack trace (js)", text: "Error: boom\n    at handler (server.js:42:13)" },
      { name: "python traceback", text: "Traceback (most recent call last): boom" },
      { name: "url", text: "Read more at https://evil.example.com/exfil for context." },
      { name: "db connection", text: "Connect via postgres://user:pw@db:5432/app now." },
      { name: "secret json", text: 'The config is {"api_key": "abc123"} in memory.' },
      { name: "script injection", text: "Summary <script>steal()</script> follows." },
      { name: "html embed", text: "Look at <iframe src=x> for the chart." },
      { name: "control char", text: "Bad text with a null \u0000 byte inside." },
    ];
    for (const l of leaks) {
      check(`security scan flags ${l.name}`, securityViolations(l.text).length > 0);
      const body = validBody();
      body.riskExplanation = l.text + " " + String(body.riskExplanation);
      const { provider } = nim([{ status: 200, text: envelope(body) }]);
      const att = await groundMissionNarrative(REQUEST_INPUT, provider);
      check(`${l.name} -> security fallback`, att.narrative.fallbackUsed === true);
    }
    check("clean mock narrative has no security violations", securityViolations([
      request.canonicalAccount.canonicalName,
      composeMockNarrative(request).riskExplanation,
      composeMockNarrative(request).approvalExplanation,
    ].join(" ")) .length === 0);
  }

  // -------------------------------------------------------------------------
  console.log("\n[8] Retry policy");
  // -------------------------------------------------------------------------
  {
    // 401 / 400 never retry.
    for (const status of [401, 400, 403]) {
      const { provider, stub } = nim([{ status }, { status: 200, text: envelope(validBody()) }]);
      let threw = false;
      try { await provider.generate(request); } catch { threw = true; }
      check(`${status} -> throws without retry`, threw && stub.calls() === 1, `calls=${stub.calls()}`);
    }
    // 429 / 503 retry once then succeed.
    for (const status of [429, 502, 503, 504]) {
      const { provider, stub } = nim([{ status }, { status: 200, text: envelope(validBody()) }]);
      const n = await provider.generate(request);
      check(`${status} -> retries once then succeeds`, stub.calls() === 2 && n.provider === "nim");
      check(`${status} -> attempts=2 telemetry`, n.attempts === 2);
    }
    // Retryable but exhausted -> at most one retry (2 calls total).
    {
      const { provider, stub } = nim([{ status: 503 }, { status: 503 }, { status: 200, text: envelope(validBody()) }]);
      let threw = false;
      try { await provider.generate(request); } catch { threw = true; }
      check("exhausted retries -> at most one retry (2 calls)", threw && stub.calls() === 2, `calls=${stub.calls()}`);
    }
    // Timeout retries once.
    {
      const { provider, stub } = nim([{ throwAbort: true }, { status: 200, text: envelope(validBody()) }]);
      const n = await provider.generate(request);
      check("timeout -> retries once then succeeds", stub.calls() === 2 && n.provider === "nim");
    }
    // Network error retries once.
    {
      const { provider, stub } = nim([{ throwNetwork: true }, { status: 200, text: envelope(validBody()) }]);
      const n = await provider.generate(request);
      check("network error -> retries once then succeeds", stub.calls() === 2 && n.provider === "nim");
    }
  }

  // -------------------------------------------------------------------------
  console.log("\n[9] Fail-closed fallback correctness through the pipeline");
  // -------------------------------------------------------------------------
  {
    const { provider } = nim([{ status: 500 }]);
    const att = await groundMissionNarrative(REQUEST_INPUT, provider);
    check("http 500 -> deterministic fallback", att.narrative.fallbackUsed === true && att.narrative.provider === "ventureos-deterministic");
    check("fallback preserves supplied evidence refs", att.narrative.evidenceRefs.length === request.evidenceRefs.length);
    check("fallback label after live failure", narrativeStateLabel(att.narrative.provider, att.narrative.fallbackUsed).label === NARRATIVE_LABEL_FALLBACK);
  }

  // -------------------------------------------------------------------------
  console.log("\n[10] Labels: live only for validated nim; mock unchanged");
  // -------------------------------------------------------------------------
  {
    check("nim + not-fallback -> live label", narrativeStateLabel("nim", false).label === NARRATIVE_LABEL_LIVE);
    check("nim + fallback -> deterministic label", narrativeStateLabel("nim", true).label === NARRATIVE_LABEL_FALLBACK);
    check("mock label unchanged", narrativeStateLabel("mock", false).label === NARRATIVE_LABEL_MOCK);
    check("deterministic provider -> fallback label", narrativeStateLabel("ventureos-deterministic", true).label === NARRATIVE_LABEL_FALLBACK);
  }

  // -------------------------------------------------------------------------
  console.log("\n[11] Config resolution + selection");
  // -------------------------------------------------------------------------
  {
    const full = nvidiaConfigFromEnv({
      NVIDIA_PROVIDER: "nim",
      NVIDIA_API_BASE_URL: "https://integrate.api.nvidia.com/v1",
      NVIDIA_API_KEY: "test-fake",
      NVIDIA_MODEL: "nvidia/test",
      NVIDIA_TIMEOUT_MS: "8000",
      NVIDIA_MAX_RETRIES: "1",
    });
    check("env: mode from NVIDIA_PROVIDER", full.mode === "nim");
    check("env: timeout parsed", full.timeoutMs === 8000);
    check("env: hasLiveNimConfig true when complete", hasLiveNimConfig(full) === true);
    check("selects real nim provider when configured", selectNarrativeProvider(full).name === "nim" && selectNarrativeProvider(full).model === "nvidia/test");

    const incomplete = nvidiaConfigFromEnv({ NVIDIA_PROVIDER: "nim" });
    check("incomplete nim config -> not live", hasLiveNimConfig(incomplete) === false);
    const att = await groundMissionNarrative(REQUEST_INPUT, selectNarrativeProvider(incomplete));
    check("incomplete nim config -> deterministic fallback", att.narrative.fallbackUsed === true);

    check("legacy NVIDIA_NARRATIVE_MODE still honoured", nvidiaConfigFromEnv({ NVIDIA_NARRATIVE_MODE: "nim" }).mode === "nim");
    check("default mode is mock", selectNarrativeProvider(nvidiaConfigFromEnv({})).name === "mock");
  }

  // -------------------------------------------------------------------------
  console.log("\n[12] Governed non-completed missions NEVER invoke the provider");
  // -------------------------------------------------------------------------
  {
    let calls = 0;
    const spy: NvidiaNarrativeProvider = {
      name: "nim",
      model: "spy",
      generate: async (req) => { calls += 1; return composeMockNarrative(req); },
    };
    const HERE = dirname(fileURLToPath(import.meta.url));
    const FIXTURES_DIR = resolve(HERE, "../../../../../services/api/harness/fixtures/contracts");
    const loadResponse = (file: string): HarnessServiceResponse =>
      (JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf8")) as ContractFixtureEnvelope).response;

    function deps(file: string, withMemory: boolean): MissionBffDeps {
      return {
        newRequestId: () => "REQ-fixed",
        newCorrelationId: () => "CORR-fixed",
        newIdempotencyKey: () => "IDEM-fixed",
        injectedTimestamps: () => ({ default: "2026-07-16T10:00:00Z" }),
        callHarness: async (r: HarnessServiceRequest) => ({
          ok: true,
          httpStatus: 200,
          body: { ...loadResponse(file), requestId: r.requestId, correlationId: r.correlationId },
        }),
        ...(withMemory ? { buildMemoryDeps: renewalMissionMemoryDeps } : {}),
        nvidiaProvider: spy,
      };
    }
    const input = { missionId: "M", scenarioId: "s", actor: "a", actorRole: "r" };

    calls = 0;
    await executeMissionRequest(input, deps("01_completed_renewal_risk.json", true));
    check("completed -> provider invoked once", calls === 1, `calls=${calls}`);

    for (const file of ["03_blocked_unsupported_signal.json", "05_rejected_approval.json", "06_revision_required.json"]) {
      calls = 0;
      await executeMissionRequest(input, deps(file, true));
      check(`${file} -> provider NOT invoked`, calls === 0, `calls=${calls}`);
    }
  }

  // -------------------------------------------------------------------------
  console.log("\n[13] Direct guard security unit checks");
  // -------------------------------------------------------------------------
  {
    const clean = composeMockNarrative(request);
    const cleanRes = validateGroundedNarrative(request, clean);
    check("mock narrative still valid after security hardening", cleanRes.valid === true);

    const leaked: NvidiaGroundedNarrative = JSON.parse(JSON.stringify(clean));
    leaked.whatChanged = leaked.whatChanged + " Key nvapi-DEADBEEF00001111 leaked.";
    const leakedRes = validateGroundedNarrative(request, leaked);
    check("security violation marks narrative invalid", leakedRes.valid === false);
    check("security violation recorded in errors", leakedRes.errors.some((e) => e.startsWith("security_violation:")));
  }

  console.log("\n" + "=".repeat(70));
  console.log(`NVIDIA hosted-NIM evaluation: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    console.log("FAILURES:");
    for (const f of failures) console.log("  - " + f);
    console.log("=".repeat(70));
    process.exit(1);
  }
  console.log("All hosted-NIM checks passed. Server-side only, governance untouched.");
  console.log("=".repeat(70));
}

void run();
