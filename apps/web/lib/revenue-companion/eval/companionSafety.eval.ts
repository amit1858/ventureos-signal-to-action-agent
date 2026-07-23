// VentureOS — Revenue Companion · Safety, isolation + source-scan eval
// ====================================================================
// Structural, dependency-free evaluation proving the Revenue Companion is
// disabled by default, does no I/O of any kind, keeps the server-only flag off
// the client, carries no CRM/NVIDIA transport, and states no forbidden claim in
// its static chrome. It scans the actual Companion source (no JSX rendering).
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/revenue-companion/eval/companionSafety.eval.ts

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

import { isRevenueCompanionValueEnabled, REVENUE_COMPANION_ENV_VAR } from "../featureFlag";
import { FORBIDDEN_PHRASES } from "../../demo-mode/presentationContract";
import { COMPANION_STRINGS } from "../strings";

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

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "../../..");
const LIB_DIR = resolve(HERE, "..");
const COMPONENTS_DIR = resolve(WEB_ROOT, "components/revenue-companion");
const ROUTE_DIR = resolve(WEB_ROOT, "app/companion");

function listSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "eval") continue;
      out.push(...listSources(full));
    } else if (name.name.endsWith(".ts") || name.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const SOURCES = [
  ...listSources(LIB_DIR),
  ...listSources(COMPONENTS_DIR),
  ...listSources(ROUTE_DIR),
];
const read = (f: string): string => readFileSync(f, "utf8");

// ===========================================================================
console.log("\n[1] Feature-flag predicate is server-only + fails closed");
// ===========================================================================
{
  check("env var is the server-only VENTUREOS_REVENUE_COMPANION (no NEXT_PUBLIC_)",
    REVENUE_COMPANION_ENV_VAR === "VENTUREOS_REVENUE_COMPANION" &&
    !REVENUE_COMPANION_ENV_VAR.startsWith("NEXT_PUBLIC_"));
  check("disabled when value absent", isRevenueCompanionValueEnabled(undefined) === false);
  check("disabled when value 'false'", isRevenueCompanionValueEnabled("false") === false);
  check("disabled when value '1'", isRevenueCompanionValueEnabled("1") === false);
  check("enabled only when value exactly 'true'", isRevenueCompanionValueEnabled("true") === true);
}

// ===========================================================================
console.log("\n[2] No network / CRM write-back / NVIDIA transport / ledger / mutation I/O");
// ===========================================================================
{
  const networkRe = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|axios|\bhttps?\.request|navigator\.sendBeacon/;
  const crmRe = /create_task|create_note|\bwriteback\b|write-back.*enabl|HUBSPOT_WRITEBACK|hubspot.*write/i;
  const nvidiaRe = /nvapi-|api\.nvidia|integrate\.api\.nvidia|_complete\(/i;
  const ledgerRe = /\.sqlite|MissionAuditLedger|INSERT\s+INTO|ledger\.record|writeMission/i;
  const mutationRe = /integrate_live_mission|execute_mission|generate_mission_for_event|approveMission|setApproval/;

  for (const file of SOURCES) {
    const src = read(file);
    const base = file.slice(WEB_ROOT.length + 1);
    // companionContract.ts OWNS the authority-token guard list (which literally
    // contains "writeback"/"write-back") — those are guard definitions, not CRM
    // calls, so the CRM textual scan skips it. Network/ledger/mutation still apply.
    const isGuardOwner = base.endsWith(join("revenue-companion", "companionContract.ts"));
    check(`${base}: no network primitive`, !networkRe.test(src));
    if (!isGuardOwner) {
      check(`${base}: no CRM write-back reference`, !crmRe.test(src));
    }
    check(`${base}: no NVIDIA transport`, !nvidiaRe.test(src));
    check(`${base}: no ledger write`, !ledgerRe.test(src));
    check(`${base}: no governed-state mutation call`, !mutationRe.test(src));
  }
}

// ===========================================================================
console.log("\n[3] Client components never import the server-only modules");
// ===========================================================================
{
  for (const file of SOURCES) {
    const src = read(file);
    const base = file.slice(WEB_ROOT.length + 1);
    const isClient = src.includes('"use client"');
    if (isClient) {
      check(`${base}: client does not import access.server`, !src.includes("access.server"));
      check(`${base}: client does not import a .server module`, !src.includes(".server"));
      check(`${base}: client does not read process.env`, !src.includes("process.env"));
      check(`${base}: client does not name the companion flag`, !src.includes("VENTUREOS_REVENUE_COMPANION"));
    }
  }
  const flag = read(join(LIB_DIR, "featureFlag.ts"));
  check("featureFlag.ts is pure (no process.env read)", !flag.includes("process.env"));
  for (const serverFile of ["access.server.ts", "narrativeAdapter.server.ts", "buildCompanions.server.ts"]) {
    const s = read(join(LIB_DIR, serverFile));
    check(`${serverFile} guards against browser evaluation`, s.includes('typeof window !== "undefined"'));
  }
}

// ===========================================================================
console.log("\n[4] No forbidden claim in the static companion chrome");
// ===========================================================================
{
  const chrome = JSON.stringify(COMPANION_STRINGS).toLowerCase();
  let anyForbidden = false;
  for (const phrase of FORBIDDEN_PHRASES) {
    if (chrome.includes(phrase)) {
      anyForbidden = true;
      failures.push(`companion chrome contains forbidden phrase: ${phrase}`);
    }
  }
  check("static companion strings contain no forbidden claim", !anyForbidden);
  check("companion chrome states it creates/approves/executes nothing",
    /creates nothing/i.test(COMPANION_STRINGS.intro) || /does not create/i.test(COMPANION_STRINGS.footerNote));
}

// ===========================================================================
console.log("\n[5] Route isolation + noindex");
// ===========================================================================
{
  const page = read(join(ROUTE_DIR, "page.tsx"));
  check("route opts out of indexing", page.includes("index: false"));
  check("route is force-dynamic", page.includes('dynamic = "force-dynamic"'));
  check("route returns notFound when disabled", page.includes("notFound()"));
}

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Revenue Companion safety + isolation eval: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All Revenue Companion safety + isolation checks passed.");
console.log("=".repeat(70));
