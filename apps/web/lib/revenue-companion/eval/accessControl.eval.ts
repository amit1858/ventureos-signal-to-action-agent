// VentureOS — Revenue Companion · Access-control eval (server-only gate)
// ======================================================================
// Proves the `/companion` route + in-demo companion access model:
//   * access is decided by the SERVER-ONLY `VENTUREOS_REVENUE_COMPANION` flag;
//     a public `NEXT_PUBLIC_` variable has NO effect;
//   * it is disabled by default and fails closed on anything but exactly "true";
//   * the route fails closed with notFound() and is noindex;
//   * the access module is server-guarded and reads only a bare process.env var;
//   * the demo page builds the companion only when the flag is on, so the frozen
//     demo experience is byte-identical when it is off.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/revenue-companion/eval/accessControl.eval.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

import { REVENUE_COMPANION_ENV_VAR } from "../featureFlag";
import { isRevenueCompanionAccessible } from "../access.server";

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
const ROUTE_DIR = resolve(WEB_ROOT, "app/companion");
const read = (f: string): string => readFileSync(f, "utf8");

const PUBLIC_VAR = "NEXT_PUBLIC_VENTUREOS_REVENUE_COMPANION";

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key] as string;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key] as string;
    }
  }
}

// ===========================================================================
console.log("\n[1] The gate uses the server-only variable name");
// ===========================================================================
{
  check("gate is keyed on VENTUREOS_REVENUE_COMPANION", REVENUE_COMPANION_ENV_VAR === "VENTUREOS_REVENUE_COMPANION");
  check("gate variable is NOT a NEXT_PUBLIC_ variable", !REVENUE_COMPANION_ENV_VAR.startsWith("NEXT_PUBLIC_"));
}

// ===========================================================================
console.log("\n[2] Disabled by default + fails closed");
// ===========================================================================
{
  withEnv({ [REVENUE_COMPANION_ENV_VAR]: undefined, [PUBLIC_VAR]: undefined }, () => {
    check("no flags set → not accessible", isRevenueCompanionAccessible() === false);
  });
  withEnv({ [REVENUE_COMPANION_ENV_VAR]: "false" }, () => {
    check("server flag 'false' → not accessible", isRevenueCompanionAccessible() === false);
  });
  withEnv({ [REVENUE_COMPANION_ENV_VAR]: "1" }, () => {
    check("server flag '1' → not accessible (only exact 'true')", isRevenueCompanionAccessible() === false);
  });
  withEnv({ [REVENUE_COMPANION_ENV_VAR]: "TRUE" }, () => {
    check("server flag 'TRUE' → not accessible (case-sensitive)", isRevenueCompanionAccessible() === false);
  });
}

// ===========================================================================
console.log("\n[3] The server-only flag controls access");
// ===========================================================================
{
  withEnv({ [REVENUE_COMPANION_ENV_VAR]: "true", [PUBLIC_VAR]: undefined }, () => {
    check("server flag exactly 'true' → accessible", isRevenueCompanionAccessible() === true);
  });
}

// ===========================================================================
console.log("\n[4] The public NEXT_PUBLIC_ flag has NO effect");
// ===========================================================================
{
  withEnv({ [REVENUE_COMPANION_ENV_VAR]: undefined, [PUBLIC_VAR]: "true" }, () => {
    check("public flag 'true' + server flag unset → NOT accessible", isRevenueCompanionAccessible() === false);
  });
  withEnv({ [REVENUE_COMPANION_ENV_VAR]: "false", [PUBLIC_VAR]: "true" }, () => {
    check("public flag 'true' cannot override server flag 'false'", isRevenueCompanionAccessible() === false);
  });
}

// ===========================================================================
console.log("\n[5] Route + modules enforce the server-only boundary");
// ===========================================================================
{
  const page = read(join(ROUTE_DIR, "page.tsx"));
  check("route imports the server-only access module",
    page.includes("access.server") && page.includes("isRevenueCompanionAccessible"));
  check("route fails closed with notFound()", page.includes("notFound()"));
  check("route is noindex", page.includes("index: false"));
  check("route does not consult a NEXT_PUBLIC companion flag", !page.includes(PUBLIC_VAR));

  const access = read(join(LIB_DIR, "access.server.ts"));
  check("access module has a browser guard", access.includes('typeof window !== "undefined"'));
  check("access module reads only process.env for the server-only var",
    access.includes("process.env") &&
    !access.includes("process.env.NEXT_PUBLIC") &&
    !access.includes(PUBLIC_VAR));

  const flag = read(join(LIB_DIR, "featureFlag.ts"));
  check("featureFlag module is pure (does not read process.env)", !flag.includes("process.env"));
}

// ===========================================================================
console.log("\n[6] Demo page gates the companion on the flag (frozen when off)");
// ===========================================================================
{
  const demoPage = read(resolve(WEB_ROOT, "app/demo/signal-to-action/page.tsx"));
  check("demo page gates companion build on isRevenueCompanionAccessible",
    demoPage.includes("isRevenueCompanionAccessible"));
  check("demo page passes companions only when the flag is on (undefined otherwise)",
    demoPage.includes("? buildCompanionsForDoc(doc)") && demoPage.includes(": undefined"));
  check("shell renders the companion only when the prop is present",
    read(resolve(WEB_ROOT, "components/demo-mode/DemoModeShell.tsx")).includes("companion ?"));
}

// ===========================================================================
console.log("\n[7] The companion route is not wired into shared navigation");
// ===========================================================================
{
  // The genuine invariant: the /companion route must not appear in the always-on
  // shared navigation (the shell nav config, the header, or the root layout), so
  // Production — where the flag is off — never exposes it. Phase 3.2 adds a
  // homepage teaser that DOES link the route, but only inside a block gated on
  // the server-probed `companionAvailable`, so it renders only when the companion
  // is accessible and is absent from Production entirely.
  const nav = read(resolve(WEB_ROOT, "lib/shell/nav.ts"));
  check("shell nav config does not list the companion route", !nav.includes("/companion"));
  const header = read(resolve(WEB_ROOT, "components/Header.tsx"));
  check("shared header does not link the companion route", !header.includes("/companion"));
  const layout = read(resolve(WEB_ROOT, "app/layout.tsx"));
  check("root layout does not link the companion route", !layout.includes("/companion"));

  // Any homepage reference to /companion must be flag-gated (never always-on).
  const landing = resolve(WEB_ROOT, "components/landing/LandingView.tsx");
  let landingText = "";
  try {
    landingText = read(landing);
  } catch {
    landingText = "";
  }
  const landingLinksCompanion = landingText.includes("/companion");
  check("any homepage companion link is gated on companionAvailable",
    !landingLinksCompanion || landingText.includes("companionAvailable"));
}

console.log(`\nRevenue Companion access control: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("FAILURES:\n" + failures.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
