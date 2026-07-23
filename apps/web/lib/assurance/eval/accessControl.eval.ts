// VentureOS — AI Assurance · Access-control eval (server-only gate)
// =================================================================
// Proves the `/assurance` route access model:
//   * access is decided by the SERVER-ONLY `VENTUREOS_ASSURANCE` flag; a public
//     `NEXT_PUBLIC_VENTUREOS_ASSURANCE` variable has NO effect;
//   * it is disabled by default and fails closed on anything but exactly "true";
//   * the route fails closed with notFound() and is noindex;
//   * the access module is server-guarded and reads only a bare process.env var;
//   * the conditional Guardrails nav entry only appears when the flag is on, so
//     the frozen Production Guardrails surface is unchanged when it is off.
//
// This eval runs the REAL server gate under controlled env permutations. It
// performs no network or model I/O.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/assurance/eval/accessControl.eval.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

import { ASSURANCE_ENV_VAR } from "../featureFlag";
import { isAssuranceAccessible } from "../access.server";

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
const ROUTE_DIR = resolve(WEB_ROOT, "app/assurance");
const read = (f: string): string => readFileSync(f, "utf8");

const PUBLIC_VAR = "NEXT_PUBLIC_VENTUREOS_ASSURANCE";

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
  check("gate is keyed on VENTUREOS_ASSURANCE", ASSURANCE_ENV_VAR === "VENTUREOS_ASSURANCE");
  check("gate variable is NOT a NEXT_PUBLIC_ variable", !ASSURANCE_ENV_VAR.startsWith("NEXT_PUBLIC_"));
}

// ===========================================================================
console.log("\n[2] Disabled by default + fails closed");
// ===========================================================================
{
  withEnv({ [ASSURANCE_ENV_VAR]: undefined, [PUBLIC_VAR]: undefined }, () => {
    check("no flags set → not accessible", isAssuranceAccessible() === false);
  });
  withEnv({ [ASSURANCE_ENV_VAR]: "false", [PUBLIC_VAR]: undefined }, () => {
    check("server flag 'false' → not accessible", isAssuranceAccessible() === false);
  });
  withEnv({ [ASSURANCE_ENV_VAR]: "1", [PUBLIC_VAR]: undefined }, () => {
    check("server flag '1' → not accessible (only exact 'true')", isAssuranceAccessible() === false);
  });
  withEnv({ [ASSURANCE_ENV_VAR]: "TRUE", [PUBLIC_VAR]: undefined }, () => {
    check("server flag 'TRUE' → not accessible (case-sensitive)", isAssuranceAccessible() === false);
  });
}

// ===========================================================================
console.log("\n[3] The server-only flag controls access");
// ===========================================================================
{
  withEnv({ [ASSURANCE_ENV_VAR]: "true", [PUBLIC_VAR]: undefined }, () => {
    check("server flag exactly 'true' → accessible", isAssuranceAccessible() === true);
  });
}

// ===========================================================================
console.log("\n[4] The public NEXT_PUBLIC_ flag has NO effect");
// ===========================================================================
{
  withEnv({ [ASSURANCE_ENV_VAR]: undefined, [PUBLIC_VAR]: "true" }, () => {
    check("public flag 'true' + server flag unset → NOT accessible", isAssuranceAccessible() === false);
  });
  withEnv({ [ASSURANCE_ENV_VAR]: "false", [PUBLIC_VAR]: "true" }, () => {
    check("public flag 'true' cannot override server flag 'false'", isAssuranceAccessible() === false);
  });
  withEnv({ [ASSURANCE_ENV_VAR]: "true", [PUBLIC_VAR]: "false" }, () => {
    check("public flag 'false' does not disable an enabled server flag", isAssuranceAccessible() === true);
  });
}

// ===========================================================================
console.log("\n[5] Route + modules enforce the server-only boundary");
// ===========================================================================
{
  const page = read(join(ROUTE_DIR, "page.tsx"));
  check("route imports the server-only access module",
    page.includes("access.server") && page.includes("isAssuranceAccessible"));
  check("route fails closed with notFound()", page.includes("notFound()"));
  check("route is noindex", page.includes("index: false"));
  check("route does not consult a NEXT_PUBLIC assurance flag", !page.includes(PUBLIC_VAR));

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
console.log("\n[6] Guardrails nav entry is conditional (Production unchanged)");
// ===========================================================================
{
  const guardrails = read(resolve(WEB_ROOT, "app/guardrails/page.tsx"));
  check("guardrails gates the nav entry on the assurance flag",
    guardrails.includes("isAssuranceAccessible"));
  check("guardrails renders the entry conditionally",
    guardrails.includes("assuranceEnabled ?"));
  check("guardrails links to /assurance", guardrails.includes('href="/assurance"'));
}

// ===========================================================================
console.log("\n[7] The route is not wired into shared navigation");
// ===========================================================================
{
  // The assurance route must not be added to the primary landing navigation.
  const landing = resolve(WEB_ROOT, "components/landing/LandingView.tsx");
  let landingText = "";
  try {
    landingText = read(landing);
  } catch {
    landingText = "";
  }
  check("assurance route absent from landing navigation", !landingText.includes("/assurance"));
}

console.log(`\nAssurance access control: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("FAILURES:\n" + failures.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
