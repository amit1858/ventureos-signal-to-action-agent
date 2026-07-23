// VentureOS — Demo Mode · Access-control eval (server-only gate)
// ==============================================================
// Proves the two hardening corrections:
//   Correction 1 — access is decided by the SERVER-ONLY `VENTUREOS_DEMO_MODE`
//     flag. The public `NEXT_PUBLIC_VENTUREOS_DEMO_MODE` variable has NO effect.
//   Correction 2 — with no in-app authentication framework present, the route
//     fails closed on the server flag and is never wired into shared navigation;
//     hosting-level preview protection is the deployment-side access factor.
//
// This eval runs the REAL server gate (`isDemoModeAccessible`) under controlled
// environment permutations. It performs no network or model I/O.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/demo-mode/eval/accessControl.eval.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

import { DEMO_MODE_ENV_VAR } from "../featureFlag";
import { isDemoModeAccessible } from "../access.server";

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
const ROUTE_DIR = resolve(WEB_ROOT, "app/demo/signal-to-action");
const read = (f: string): string => readFileSync(f, "utf8");

const PUBLIC_VAR = "NEXT_PUBLIC_VENTUREOS_DEMO_MODE";

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
  check("gate is keyed on VENTUREOS_DEMO_MODE", DEMO_MODE_ENV_VAR === "VENTUREOS_DEMO_MODE");
  check("gate variable is NOT a NEXT_PUBLIC_ variable",
    !DEMO_MODE_ENV_VAR.startsWith("NEXT_PUBLIC_"));
}

// ===========================================================================
console.log("\n[2] Disabled by default + fails closed");
// ===========================================================================
{
  withEnv({ [DEMO_MODE_ENV_VAR]: undefined, [PUBLIC_VAR]: undefined }, () => {
    check("no flags set → not accessible", isDemoModeAccessible() === false);
  });
  withEnv({ [DEMO_MODE_ENV_VAR]: "false", [PUBLIC_VAR]: undefined }, () => {
    check("server flag 'false' → not accessible", isDemoModeAccessible() === false);
  });
  withEnv({ [DEMO_MODE_ENV_VAR]: "1", [PUBLIC_VAR]: undefined }, () => {
    check("server flag '1' → not accessible (only exact 'true')",
      isDemoModeAccessible() === false);
  });
  withEnv({ [DEMO_MODE_ENV_VAR]: "TRUE", [PUBLIC_VAR]: undefined }, () => {
    check("server flag 'TRUE' → not accessible (case-sensitive)",
      isDemoModeAccessible() === false);
  });
}

// ===========================================================================
console.log("\n[3] The server-only flag controls access");
// ===========================================================================
{
  withEnv({ [DEMO_MODE_ENV_VAR]: "true", [PUBLIC_VAR]: undefined }, () => {
    check("server flag exactly 'true' → accessible", isDemoModeAccessible() === true);
  });
}

// ===========================================================================
console.log("\n[4] The public NEXT_PUBLIC_ flag has NO effect (Correction 1)");
// ===========================================================================
{
  withEnv({ [DEMO_MODE_ENV_VAR]: undefined, [PUBLIC_VAR]: "true" }, () => {
    check("public flag 'true' + server flag unset → NOT accessible",
      isDemoModeAccessible() === false);
  });
  withEnv({ [DEMO_MODE_ENV_VAR]: "false", [PUBLIC_VAR]: "true" }, () => {
    check("public flag 'true' cannot override server flag 'false'",
      isDemoModeAccessible() === false);
  });
  withEnv({ [DEMO_MODE_ENV_VAR]: "true", [PUBLIC_VAR]: "false" }, () => {
    check("public flag 'false' does not disable an enabled server flag",
      isDemoModeAccessible() === true);
  });
}

// ===========================================================================
console.log("\n[5] Route + modules enforce the server-only boundary (Correction 2)");
// ===========================================================================
{
  const page = read(join(ROUTE_DIR, "page.tsx"));
  check("route imports the server-only access module",
    page.includes("access.server") && page.includes("isDemoModeAccessible"));
  check("route fails closed with notFound()", page.includes("notFound()"));
  check("route is noindex", page.includes("index: false"));
  check("route does not consult a NEXT_PUBLIC demo flag",
    !page.includes(PUBLIC_VAR));

  const access = read(join(LIB_DIR, "access.server.ts"));
  const accessFlat = access.replace(/\/\//g, " ").replace(/\s+/g, " ");
  check("access module has a browser guard",
    access.includes('typeof window !== "undefined"'));
  check("access module reads only process.env for the server-only var",
    access.includes("process.env") &&
    !access.includes("process.env.NEXT_PUBLIC") &&
    !access.includes("NEXT_PUBLIC_VENTUREOS_DEMO_MODE"));

  // No in-app authentication framework is claimed; document the deployment-side
  // condition explicitly so the gate is never mistaken for user auth.
  check("access module documents hosting-level preview protection",
    /hosting-level preview protection/i.test(accessFlat));

  const layout = read(resolve(WEB_ROOT, "app/layout.tsx"));
  check("route is absent from the root layout/navigation",
    !layout.includes("/demo/signal-to-action"));
}

// ===========================================================================
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
