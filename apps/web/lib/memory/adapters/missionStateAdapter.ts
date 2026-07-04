// Release 2.1A — Mission State adapter (READ-ONLY)
// ================================================
// Maps Seller Mission Control records -> MemoryEvents. Mission State is a
// PROTECTED engine (frontend workflow layer): this adapter only reads its
// records (handed in via `listMissions()`), never writes back.
//
// Quality: authoritative for seller follow-through (it is the record of what
// the seller actually did in the guided flow).

import type { MissionRecord } from "../../missionState";
import type { MemoryEvent } from "../types";
import { clamp01, eventId, evidence, safeIso } from "./base";

const MODULE = "mission_state" as const;

/** Map mission records to memory events. Pure and deterministic. */
export function missionStateToEvents(missions: MissionRecord[]): MemoryEvent[] {
  const events: MemoryEvent[] = [];

  for (const m of missions) {
    const ts = safeIso(m.completed_at) ?? safeIso(m.last_active_at) ?? safeIso(m.started_at);
    if (!ts) continue;

    const progress = clamp01((m.furthest_step_index ?? 0) / 6);
    const completed = m.status === "completed";

    const evidenceItems = [
      evidence(`mission:${m.mission_id}`, "Seller mission", `Step: ${m.current_step}`),
      evidence(`rec:${m.recommendation_id}`, "Recommendation in mission", m.account_name),
    ];

    const summary = completed
      ? `Seller completed the guided mission for ${m.account_name}.`
      : m.status === "abandoned"
        ? `Seller abandoned the mission for ${m.account_name} at step '${m.current_step}'.`
        : `Seller mission for ${m.account_name} in progress at step '${m.current_step}'.`;

    events.push({
      eventId: eventId(MODULE, m.mission_id, m.status),
      source: { module: MODULE, entity: m.account_id, quality: "authoritative" },
      category: "engagement",
      subjectId: m.account_id,
      subjectLabel: m.account_name,
      timestamp: ts,
      summary,
      evidence: evidenceItems,
      signals: {
        governance: m.approval_submitted && !m.approval_resolved,
        customerImpact: progress * 0.5,
        revenueImpact: completed ? 0.6 : progress * 0.4,
        sellerImpact: progress,
        managerImpact: m.approval_submitted ? 0.7 : 0.3,
      },
      dedupeKey: `mission:${m.mission_id}`,
    });
  }

  return events;
}
