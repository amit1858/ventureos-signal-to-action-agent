// Release 2.1A — Recommendation Delta adapter (READ-ONLY)
// =======================================================
// Maps Recommendation Delta events -> MemoryEvents. Recommendation Delta is a
// DERIVED engine (it diffs successive recommendation runs). This adapter only
// reads its deltas (handed in via `loadDeltas()`), never writes back and never
// touches ranking/scoring.
//
// Quality: derived.

import type { DeltaKind, RecommendationDelta } from "../../recommendationDelta";
import type { MemoryCategory, MemoryEvent } from "../types";
import { eventId, evidence, safeIso } from "./base";

const MODULE = "recommendation_delta" as const;

const KIND_MAGNITUDE: Record<DeltaKind, number> = {
  first_seen: 0.5,
  left_queue: 0.4,
  action_changed: 0.7,
  priority_jump: 0.8,
  refined: 0.3,
};

function categoryFor(kind: DeltaKind): MemoryCategory {
  if (kind === "left_queue") return "lifecycle";
  if (kind === "first_seen") return "opportunity";
  return "decision";
}

/** Map recommendation deltas to memory events. Pure and deterministic. */
export function recommendationDeltaToEvents(deltas: RecommendationDelta[]): MemoryEvent[] {
  const events: MemoryEvent[] = [];

  for (const d of deltas) {
    const ts = safeIso(d.timestamp);
    if (!ts) continue;

    const mag = KIND_MAGNITUDE[d.kind];
    const evidenceItems = [evidence(`delta:${d.id}`, `Recommendation ${d.kind}`, d.reason)];
    if (d.inferred_drift_event_id) {
      evidenceItems.push(
        evidence(
          `drift:${d.inferred_drift_event_id}`,
          "Inferred drift cause",
          d.inferred_drift_signal ?? undefined,
        ),
      );
    }

    events.push({
      eventId: eventId(MODULE, d.id),
      source: { module: MODULE, entity: d.account_id, quality: "derived" },
      category: categoryFor(d.kind),
      subjectId: d.account_id,
      subjectLabel: d.account_name,
      timestamp: ts,
      summary: `${d.account_name}: ${d.reason}`,
      evidence: evidenceItems,
      signals: {
        governance: false,
        customerImpact: mag * 0.6,
        revenueImpact: d.kind === "priority_jump" || d.kind === "action_changed" ? mag : mag * 0.5,
        sellerImpact: mag,
        managerImpact: 0.2,
      },
      dedupeKey: `delta:${d.account_id}`,
    });
  }

  return events;
}
