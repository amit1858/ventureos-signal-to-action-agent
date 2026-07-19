// Release 2.1A — deterministic-eval TypeScript loader (test tooling only)
// ======================================================================
// Lets the deterministic evaluation suite run the memory core's .ts files
// directly under Node with ZERO changes to the source tree, the app build, or
// package.json. It does two things:
//   1. resolve: append a .ts / .tsx / /index.ts extension to extensionless
//      relative imports (the source uses bundler-style extensionless imports).
//   2. load:    strip TypeScript types via Node's built-in stripTypeScriptTypes
//      and hand Node plain ESM.
//
// This file is NOT imported by the application; it exists purely so the eval
// harness is runnable and repeatable.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const TS_FORMAT = "memory-ts";

export async function resolve(specifier, context, next) {
  const isRelative = specifier.startsWith(".");
  const hasExt = /\.[cm]?[jt]sx?$/i.test(specifier);
  if (isRelative && !hasExt && context.parentURL) {
    const base = new URL(specifier, context.parentURL);
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const candidate = new URL(base.href + ext);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, format: TS_FORMAT, shortCircuit: true };
      }
    }
  }
  const resolved = await next(specifier, context);
  if (resolved.url.endsWith(".ts") || resolved.url.endsWith(".tsx")) {
    return { ...resolved, format: TS_FORMAT };
  }
  return resolved;
}

export async function load(url, context, next) {
  if (context.format === TS_FORMAT) {
    const source = readFileSync(fileURLToPath(url), "utf8");
    const js = stripTypeScriptTypes(source, { mode: "strip" });
    return { format: "module", source: js, shortCircuit: true };
  }
  return next(url, context);
}
