// Release 2.1A — Drift Engine adapter (READ-ONLY)
// ===============================================
// Maps Live Signal Drift events -> MemoryEvents. The Drift Engine is a PURE
// FRONTEND SIMULATION; it never mutates authoritative payloads. This adapter
// only reads its events (handed in via the drift engine's read API), never
// writes back.
//
// Quality: inferred (simulated telemetry) — this is why drift-sourced memories
// carry lower confidence than ledger-sourced ones.

import type { DriftEvent, DriftImpact } from "../../driftEngine";
import type { MemoryCategory, MemoryEvent } from "../types";
import { clamp01, eventId, evidence, safeIso } from "./base";

const MODULE = "drift_engine" as const;

const MAGNITUDE_SCORE: Record<DriftEvent["magnitude"], number> = {
  minor: 0.3,
  moderate: 0.6,
  major: 0.9,
};

function categoryFor(impact: DriftImpact): MemoryCategory {
  if (impact === "risk") return "risk";
  if (impact === "opportunity") return "opportunity";
  return "engagement";
}

/** Map drift events to memory events. Pure and deterministic. */
export function driftEngineToEvents(driftEvents: DriftEvent[]): MemoryEvent[] {
  const events: MemoryEvent[] = [];

  for (const d of driftEvents) {
    const ts = safeIso(d.timestamp);
    if (!ts) continue;

    const mag = MAGNITUDE_SCORE[d.magnitude];
    const isRisk = d.impact === "risk";

    events.push({
      eventId: eventId(MODULE, d.id),
      source: { module: MODULE, entity: d.account_id, quality: "inferred" },
      category: categoryFor(d.impact),
      subjectId: d.account_id,
      subjectLabel: d.account_name,
      timestamp: ts,
      summary: `${d.account_name}: ${d.reason}`,
      evidence: [
        evidence(`drift:${d.id}`, `${d.signalLabel} (${d.agent})`, d.reason),
      ],
      signals: {
        governance: false,
        customerImpact: isRisk ? mag : mag * 0.5,
        revenueImpact: clamp01(mag * (d.impact === "opportunity" ? 0.9 : 0.7)),
        sellerImpact: mag * 0.6,
        managerImpact: d.magnitude === "major" ? 0.5 : 0.2,
      },
      // Each dimension gets its own memory so risk/opportunity trajectories stay
      // distinct; multiple drift events on the same dimension merge together.
      dedupeKey: `drift:${d.dimension}`,
    });
  }

  return events;
}
