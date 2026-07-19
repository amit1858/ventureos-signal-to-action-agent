// Release 2.3 — Product shell navigation & routing evals
// ======================================================
// Deterministic proof that the shared shell nav integrates the governed Mission
// Control route into the existing Release 1.4 journey WITHOUT breaking it:
//   - the six items appear in the required order
//   - Mission Control is a real route (`/mission-control`), discoverable in nav
//   - no navigation item is dead (every item resolves to a target)
//   - active state resolves correctly per surface (root SPA vs governed route)
//   - `?view=` deep links parse safely
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/shell/eval/shellNav.eval.ts

import {
  SHELL_NAV_ITEMS,
  MISSION_CONTROL_ROUTE,
  resolveActiveNavKey,
  parseViewParam,
  viewItemHref,
  shellNavItemHref,
  VALID_SHELL_VIEWS,
} from "../nav";

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

// ===========================================================================
console.log("\n[1] Nav order matches the required Production journey");
// ===========================================================================
const EXPECTED_ORDER = [
  "Morning Brief",
  "Today's Mission",
  "Mission Control",
  "Command Center",
  "Workspace",
  "Trust & Governance",
];
const labels = SHELL_NAV_ITEMS.map((i) => i.label);
check("nav has exactly six items", SHELL_NAV_ITEMS.length === 6, `${SHELL_NAV_ITEMS.length}`);
check("nav order is exact", JSON.stringify(labels) === JSON.stringify(EXPECTED_ORDER), labels.join(" | "));
check(
  "Mission Control sits between Today's Mission and Command Center",
  labels.indexOf("Mission Control") === labels.indexOf("Today's Mission") + 1 &&
    labels.indexOf("Command Center") === labels.indexOf("Mission Control") + 1,
);

// ===========================================================================
console.log("\n[2] Mission Control is a discoverable real route; no dead items");
// ===========================================================================
const mc = SHELL_NAV_ITEMS.find((i) => i.key === "mission-control");
check("Mission Control item exists", Boolean(mc));
check("Mission Control is a route item", mc?.kind === "route");
check(
  "Mission Control routes to /mission-control",
  mc?.kind === "route" && mc.href === MISSION_CONTROL_ROUTE,
  mc?.kind === "route" ? mc.href : "(not a route)",
);
// Every item resolves to a concrete, non-empty target on the off-root surface
// (i.e. rendered from /mission-control): view items deep-link, route items link.
for (const item of SHELL_NAV_ITEMS) {
  const href = shellNavItemHref(item, { onRoot: false });
  check(`'${item.label}' has a non-empty target off-root`, href.length > 0 && href !== "#", href);
}
// On the root SPA the view items are in-app switches (no navigation href needed).
for (const item of SHELL_NAV_ITEMS) {
  if (item.kind === "view") {
    check(`'${item.label}' is an in-app switch on root`, shellNavItemHref(item, { onRoot: true }) === "#");
  }
}
check(
  "view deep-link href is /?view=<key>",
  viewItemHref("command") === "/?view=command",
  viewItemHref("command"),
);

// ===========================================================================
console.log("\n[3] Active-state resolves correctly per surface");
// ===========================================================================
check(
  "on /mission-control the governed route is active",
  resolveActiveNavKey({ pathname: MISSION_CONTROL_ROUTE }) === "mission-control",
);
check(
  "on / with view=command the Command Center item is active",
  resolveActiveNavKey({ pathname: "/", view: "command" }) === "command",
);
check(
  "on / the Mission Control route is NOT active",
  resolveActiveNavKey({ pathname: "/", view: "command" }) !== "mission-control",
);
check(
  "on / landing nothing is active",
  resolveActiveNavKey({ pathname: "/", view: "landing" }) === null,
);
check(
  "on / with no view nothing is active",
  resolveActiveNavKey({ pathname: "/", view: null }) === null,
);
check(
  "each in-app view resolves active on root",
  VALID_SHELL_VIEWS.every((v) => resolveActiveNavKey({ pathname: "/", view: v }) === v),
);

// ===========================================================================
console.log("\n[4] `?view=` deep links parse safely");
// ===========================================================================
check("valid view param parses", parseViewParam("workspace") === "workspace");
check("landing is not a deep-linkable view", parseViewParam("landing") === null);
check("unknown view param rejected", parseViewParam("hacker") === null);
check("null view param rejected", parseViewParam(null) === null);
check("empty view param rejected", parseViewParam("") === null);
check(
  "every valid view round-trips through parse",
  VALID_SHELL_VIEWS.every((v) => parseViewParam(v) === v),
);

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Shell navigation evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All shell-navigation checks passed. Mission Control is integrated, discoverable and non-breaking.");
console.log("=".repeat(70));
