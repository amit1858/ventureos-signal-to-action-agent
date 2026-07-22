// VentureOS — Demo Mode · Safety, isolation + source-scan eval
// ============================================================
// Structural, dependency-free evaluation proving Demo Mode is disabled by
// default, does no I/O of any kind, duplicates no fixtures into the frontend,
// is route-isolated, and carries the accessibility/responsive affordances the
// spec requires. It scans the actual Demo Mode source (no JSX rendering needed).
//
// Covers spec test cases 1, 2, 18, 26–31, 34, 37–40.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/demo-mode/eval/demoModeSafety.eval.ts

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

import { isDemoModeValueEnabled, DEMO_MODE_ENV_VAR } from "../featureFlag";

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
const COMPONENTS_DIR = resolve(WEB_ROOT, "components/demo-mode");
const ROUTE_DIR = resolve(WEB_ROOT, "app/demo/signal-to-action");
const DATA_DIR = resolve(LIB_DIR, "data");

function listSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) {
      out.push(...listSources(full));
    } else if (name.name.endsWith(".ts") || name.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

// All Demo Mode source (excluding eval scripts themselves).
const SOURCES = [
  ...listSources(LIB_DIR).filter((f) => !f.includes(`${join("demo-mode", "eval")}`)),
  ...listSources(COMPONENTS_DIR),
  ...listSources(ROUTE_DIR),
];

function read(file: string): string {
  return readFileSync(file, "utf8");
}

// ===========================================================================
console.log("\n[1] Feature-flag predicate is server-only + fails closed (cases 1, 2, 18)");
// ===========================================================================
{
  check("env var is the server-only VENTUREOS_DEMO_MODE (no NEXT_PUBLIC_)",
    DEMO_MODE_ENV_VAR === "VENTUREOS_DEMO_MODE" && !DEMO_MODE_ENV_VAR.startsWith("NEXT_PUBLIC_"));
  check("disabled when value absent", isDemoModeValueEnabled(undefined) === false);
  check("disabled when value empty", isDemoModeValueEnabled("") === false);
  check("disabled when value 'false'", isDemoModeValueEnabled("false") === false);
  check("disabled when value '1' (only exact 'true' enables)",
    isDemoModeValueEnabled("1") === false);
  check("disabled when value 'TRUE' (case-sensitive)",
    isDemoModeValueEnabled("TRUE") === false);
  check("enabled only when value exactly 'true'",
    isDemoModeValueEnabled("true") === true);
}

// ===========================================================================
console.log("\n[2] No network / CRM / NVIDIA / ledger / approval I/O (cases 26–30)");
// ===========================================================================
{
  // Network primitives.
  const networkRe = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|axios|\bhttps?\.request|navigator\.sendBeacon/;
  // CRM write-back.
  const crmRe = /hubspot|create_task|create_note|writeback|write-back.*enabl/i;
  // NVIDIA provider transport.
  const nvidiaRe = /nvapi-|nvidia.*api|api\.nvidia|integrate\.api\.nvidia/i;
  // Ledger / persistence writes.
  const ledgerRe = /\.sqlite|MissionAuditLedger|INSERT\s+INTO|ledger\.record|writeMission/i;
  // Governed-state mutation.
  const mutationRe = /integrate_live_mission|execute_mission|generate_mission_for_event|approveMission|setApproval/;

  for (const file of SOURCES) {
    const src = read(file);
    const base = file.slice(WEB_ROOT.length + 1);
    // presentationContract.ts owns the FORBIDDEN_PHRASES guard list, whose
    // literals intentionally contain words like "hubspot"/"crm write-back".
    // Those literals are guard definitions, not requests, so the textual
    // CRM/NVIDIA scans skip that one file (network/ledger/mutation still apply).
    const isGuardOwner = base.endsWith(join("demo-mode", "presentationContract.ts"));
    check(`${base}: no network primitive`, !networkRe.test(src));
    if (!isGuardOwner) {
      check(`${base}: no CRM write-back reference`, !crmRe.test(src));
      check(`${base}: no NVIDIA transport`, !nvidiaRe.test(src));
    }
    check(`${base}: no ledger write`, !ledgerRe.test(src));
    check(`${base}: no governed-state mutation call`, !mutationRe.test(src));
  }
}

// ===========================================================================
console.log("\n[3] Fixtures are not duplicated into the frontend (case 31)");
// ===========================================================================
{
  const dataFiles = readdirSync(DATA_DIR);
  check("data dir holds only the generated projection",
    dataFiles.length === 1 && dataFiles[0] === "demo-journeys.generated.json",
    JSON.stringify(dataFiles));
  // No raw DemoJourneyResult fixture copied under apps/web.
  const anyFixtureCopy = SOURCES.some((f) =>
    read(f).includes("demo_journey_live_single_source") ||
    read(f).includes("demo_journey_controlled_execution"),
  );
  check("no raw backend fixture referenced from frontend source", !anyFixtureCopy);
}

// ===========================================================================
console.log("\n[4] Route isolation + server-only gate (case 34)");
// ===========================================================================
{
  const page = read(join(ROUTE_DIR, "page.tsx"));
  check("route gates on the server-only access module",
    page.includes("isDemoModeAccessible") && page.includes("access.server"));
  check("route returns notFound when disabled", page.includes("notFound()"));
  check("route opts out of indexing", page.includes("index: false"));
  check("route does not read a NEXT_PUBLIC demo flag",
    !page.includes("NEXT_PUBLIC_VENTUREOS_DEMO_MODE"));
  // The demo path must not be wired into any shared navigation/layout.
  const layout = read(resolve(WEB_ROOT, "app/layout.tsx"));
  check("root layout does not link the demo route",
    !layout.includes("/demo/signal-to-action"));
}

// ===========================================================================
console.log("\n[4b] Server-only flag is never imported/read by client code");
// ===========================================================================
{
  // Any file that opts into the client bundle must not touch the flag modules
  // or process.env — the flag is decided only on the server.
  for (const file of SOURCES) {
    const src = read(file);
    const base = file.slice(WEB_ROOT.length + 1);
    const isClient = /^["']use client["'];?/m.test(src) || src.includes('"use client"');
    if (isClient) {
      check(`${base}: client component does not import access.server`,
        !src.includes("access.server"));
      check(`${base}: client component does not import featureFlag`,
        !/from\s+["'].*demo-mode\/featureFlag["']/.test(src));
      check(`${base}: client component does not read process.env`,
        !src.includes("process.env"));
      check(`${base}: client component does not name the demo flag`,
        !src.includes("VENTUREOS_DEMO_MODE"));
    }
  }
  // Only the server route reads the environment; the pure predicate never does.
  const flag = read(join(LIB_DIR, "featureFlag.ts"));
  check("featureFlag.ts is pure (no process.env read)", !flag.includes("process.env"));
  const access = read(join(LIB_DIR, "access.server.ts"));
  check("access.server.ts guards against browser evaluation",
    access.includes('typeof window !== "undefined"'));
  check("access.server.ts reads only the server-only var",
    access.includes("DEMO_MODE_ENV_VAR") &&
    !access.includes("process.env.NEXT_PUBLIC") &&
    !access.includes("NEXT_PUBLIC_VENTUREOS_DEMO_MODE"));
}

// ===========================================================================
console.log("\n[5] Accessibility + keyboard affordances (cases 37, 38)");
// ===========================================================================
{
  const selector = read(join(COMPONENTS_DIR, "JourneySelector.tsx"));
  check("selector is a keyboard-accessible radiogroup",
    selector.includes('role="radiogroup"') && selector.includes('role="radio"'));
  check("selector items expose aria-checked", selector.includes("aria-checked"));
  check("selector items have visible focus ring", selector.includes("focus-visible:ring"));

  const section = read(join(COMPONENTS_DIR, "DemoSection.tsx"));
  check("sections are labelled for assistive tech", section.includes("aria-labelledby"));

  const technical = read(join(COMPONENTS_DIR, "TechnicalDisclosure.tsx"));
  check("technical disclosure exposes aria-expanded", technical.includes("aria-expanded"));

  const narrative = read(join(COMPONENTS_DIR, "JourneyNarrative.tsx"));
  check("decorative icons are aria-hidden", narrative.includes('aria-hidden="true"'));
}

// ===========================================================================
console.log("\n[6] Reduced-motion + responsive (cases 39, 40)");
// ===========================================================================
{
  const globals = read(resolve(WEB_ROOT, "app/globals.css"));
  check("global stylesheet honours prefers-reduced-motion",
    globals.includes("prefers-reduced-motion"));
  // Demo Mode carries no autoplay media and no animation gate on understanding.
  const anyAutoplay = SOURCES.some((f) => /autoplay|new Audio\(|<video|<audio/i.test(read(f)));
  check("no autoplay media in Demo Mode", !anyAutoplay);
  // Responsive layout: shell + grids use responsive breakpoints.
  const shell = read(join(COMPONENTS_DIR, "DemoModeShell.tsx"));
  const approvals = read(join(COMPONENTS_DIR, "ApprovalExecutionPanel.tsx"));
  check("shell constrains width for readable layout", shell.includes("max-w-"));
  check("panels use responsive breakpoints", approvals.includes("sm:grid-cols-2"));
}

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Demo Mode safety + isolation eval: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All Demo Mode safety + isolation checks passed.");
console.log("=".repeat(70));
