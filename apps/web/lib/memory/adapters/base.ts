// Release 2.1A — Shared Enterprise Memory Core · Read-only ingestion adapters
// ==========================================================================
// Adapters READ existing engines and emit MemoryEvents. Nothing more.
//
// APEF: Protected Engine Boundaries.
//   * An adapter is a PURE mapping: (already-read snapshot) -> MemoryEvent[].
//   * It never calls a source engine's write path and never mutates its input.
//   * The caller is responsible for reading the engine (e.g. `listLedger()`)
//     and handing the resulting data to the adapter. This keeps the memory core
//     free of browser storage APIs and fully deterministic.
//
// Every adapter clamps its signal magnitudes into 0..1 and derives a stable,
// collision-resistant event id from the source entity's own ids.

import type { MemoryEvidence } from "../types";

/** Clamp any number into 0..1; missing/non-finite collapses to 0. */
export function clamp01(value: number | undefined | null): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Build a deterministic event id namespaced by module + source id parts. */
export function eventId(module: string, ...parts: (string | number)[]): string {
  return [module, ...parts.map((p) => String(p))].join(":");
}

/** Convenience: a single evidence item. */
export function evidence(ref: string, label: string, detail?: string): MemoryEvidence {
  return detail === undefined ? { ref, label } : { ref, label, detail };
}

/** Coerce a possibly-missing ISO string into a valid one, else return null. */
export function safeIso(iso: string | undefined | null): string | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}
