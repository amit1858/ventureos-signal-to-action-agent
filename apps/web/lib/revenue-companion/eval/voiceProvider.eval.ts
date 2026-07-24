// VentureOS — Revenue Companion · Gnani provider eval (mocked transport)
// ======================================================================
// Proves the server-only Gnani provider is safe in every state WITHOUT a real
// key or a real network call: it returns a truthful "unconfigured" result (and
// makes NO request) when no key is set, and validates status / content-type /
// size while leaking no key or upstream body when a (mocked) call is made.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/revenue-companion/eval/voiceProvider.eval.ts

import { synthesizeVoice } from "../voice/gnaniProvider.server";
import {
  GNANI_MIN_AUDIO_BYTES,
  GNANI_TTS_ENDPOINT,
  GNANI_API_KEY_HEADER,
} from "../voice/gnaniConfig";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const SCRIPT = "Curefoods' renewal-risk mission was stopped at identity.";

interface FakeResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}

function fakeResponse(opts: {
  ok: boolean;
  status: number;
  contentType: string;
  bytes: number;
}): FakeResponse {
  return {
    ok: opts.ok,
    status: opts.status,
    headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? opts.contentType : null) },
    arrayBuffer: async () => new Uint8Array(opts.bytes).buffer,
  };
}

const realFetch = globalThis.fetch;
const realKey = process.env.GNANI_API_KEY;
interface RecordedCall {
  url: unknown;
  init: RequestInit | undefined;
}
const calls: RecordedCall[] = [];
function lastCall(): RecordedCall | undefined {
  return calls[calls.length - 1];
}

function installFetch(handler: (url: unknown, init?: RequestInit) => Promise<unknown>): void {
  // @ts-expect-error test shim
  globalThis.fetch = (url: unknown, init?: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  };
}

async function main(): Promise<void> {
  // =========================================================================
  console.log("\n[1] Unconfigured → truthful 'unconfigured', NO network call");
  // =========================================================================
  {
    delete process.env.GNANI_API_KEY;
    calls.length = 0;
    let called = false;
    installFetch(async () => {
      called = true;
      return fakeResponse({ ok: true, status: 200, contentType: "audio/wav", bytes: 4096 });
    });
    const r = await synthesizeVoice(SCRIPT);
    check("returns unconfigured when no key", r.status === "unconfigured");
    check("makes no network call when unconfigured", called === false);
  }

  // =========================================================================
  console.log("\n[2] Configured + valid audio → ok, key sent via header only");
  // =========================================================================
  {
    process.env.GNANI_API_KEY = "gk_test_secret_value";
    installFetch(async () => fakeResponse({ ok: true, status: 200, contentType: "audio/wav", bytes: 4096 }));
    const r = await synthesizeVoice(SCRIPT);
    check("returns ok with audio", r.status === "ok");
    if (r.status === "ok") {
      check("provider classified gnani_live only after a real success", r.provider === "gnani_live");
      check("content type is audio/wav", r.contentType === "audio/wav");
      check("audio bytes returned", r.audio.byteLength >= GNANI_MIN_AUDIO_BYTES);
    }
    // Key isolation: sent only in the documented header, never in URL or body.
    check("request targets the Gnani endpoint", lastCall()?.url === GNANI_TTS_ENDPOINT);
    const headers = (lastCall()?.init?.headers ?? {}) as Record<string, string>;
    check("key sent via the X-API-Key-ID header", headers[GNANI_API_KEY_HEADER] === "gk_test_secret_value");
    check("key never placed in the URL", String(lastCall()?.url).indexOf("gk_test_secret_value") === -1);
    check("key never placed in the body", String(lastCall()?.init?.body ?? "").indexOf("gk_test_secret_value") === -1);
    check("body carries the script text", String(lastCall()?.init?.body ?? "").includes("renewal-risk mission"));
  }

  // =========================================================================
  console.log("\n[3] Upstream failures map to generic provider_error");
  // =========================================================================
  {
    process.env.GNANI_API_KEY = "gk_test_secret_value";

    installFetch(async () => fakeResponse({ ok: false, status: 503, contentType: "text/plain", bytes: 0 }));
    const nonOk = await synthesizeVoice(SCRIPT);
    check("non-2xx → provider_error", nonOk.status === "provider_error");
    check("non-2xx reason is coarse (status code only)", nonOk.status === "provider_error" && /^upstream_status_503$/.test(nonOk.reason));

    installFetch(async () => fakeResponse({ ok: true, status: 200, contentType: "application/json", bytes: 4096 }));
    const badType = await synthesizeVoice(SCRIPT);
    check("wrong content-type → provider_error", badType.status === "provider_error");

    installFetch(async () => fakeResponse({ ok: true, status: 200, contentType: "audio/wav", bytes: 8 }));
    const tooSmall = await synthesizeVoice(SCRIPT);
    check("empty/stub audio → provider_error", tooSmall.status === "provider_error");

    installFetch(async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    });
    const aborted = await synthesizeVoice(SCRIPT);
    check("abort/timeout → provider_error(timeout)", aborted.status === "provider_error" && aborted.reason === "timeout");

    installFetch(async () => {
      throw new Error("boom with gk_test_secret_value in message");
    });
    const netErr = await synthesizeVoice(SCRIPT);
    check("network error → provider_error(network_error)", netErr.status === "provider_error" && netErr.reason === "network_error");
    check("error reason never leaks the key", netErr.status === "provider_error" && !netErr.reason.includes("gk_test_secret_value"));
  }
}

await main();

// Restore globals.
if (realKey === undefined) delete process.env.GNANI_API_KEY;
else process.env.GNANI_API_KEY = realKey;
globalThis.fetch = realFetch;

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Revenue Companion voice provider eval: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All Revenue Companion voice provider checks passed.");
console.log("=".repeat(70));
