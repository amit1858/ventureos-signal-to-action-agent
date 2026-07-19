// Release 2.1A — Executive Brief adapter (READ-ONLY)
// ==================================================
// Maps an Executive Change Brief -> MemoryEvents. The Executive Change Brief is
// a DERIVED, explanatory engine (it composes drift + deltas into a portfolio
// narrative). This adapter only reads a brief (handed in via
// `buildExecutiveChangeBrief(accounts)`), never writes back and never changes
// ranking/scoring.
//
// Quality: derived.

import type { ExecutiveChangeBrief, RiskMovement } from "../../executiveChangeBrief";
import type { MemoryCategory, MemoryEvent } from "../types";
import { clamp01, eventId, evidence, safeIso } from "./base";

const MODULE = "executive_brief" as const;

const MAGNITUDE_SCORE: Record<RiskMovement["magnitude"], number> = {
  minor: 0.3,
  moderate: 0.6,
  major: 0.9,
};

function movementEvents(
  brief: ExecutiveChangeBrief,
  movements: RiskMovement[],
  category: MemoryCategory,
  kind: "risk" | "opportunity",
): MemoryEvent[] {
  const out: MemoryEvent[] = [];
  for (const m of movements) {
    const ts = safeIso(m.timestamp) ?? safeIso(brief.windowEndIso);
    if (!ts) continue;
    const mag = MAGNITUDE_SCORE[m.magnitude];
    out.push({
      eventId: eventId(MODULE, kind, m.account_id, m.dimension, m.timestamp),
      source: { module: MODULE, entity: m.account_id, quality: "derived" },
      category,
      subjectId: m.account_id,
      subjectLabel: m.account_name,
      timestamp: ts,
      summary: `${m.account_name}: ${m.dimension} ${kind} movement — ${m.reason}`,
      evidence: [
        evidence(
          `exec:${kind}:${m.account_id}:${m.dimension}`,
          `Executive brief ${kind} movement (${m.agent})`,
          m.reason,
        ),
      ],
      signals: {
        governance: false,
        customerImpact: kind === "risk" ? mag : mag * 0.5,
        revenueImpact: clamp01(mag * 0.85),
        sellerImpact: mag * 0.5,
        managerImpact: 0.6,
      },
      dedupeKey: `exec:${kind}:${m.dimension}`,
    });
  }
  return out;
}

/** Map an executive change brief to memory events. Pure and deterministic. */
export function executiveBriefToEvents(brief: ExecutiveChangeBrief): MemoryEvent[] {
  return [
    ...movementEvents(brief, brief.riskMovements, "risk", "risk"),
    ...movementEvents(brief, brief.opportunityMovements, "opportunity", "opportunity"),
  ];
}
