// Release 2.1A — Account Timeline adapter (READ-ONLY)
// ===================================================
// Maps Account Timeline entries -> MemoryEvents. The Account Timeline is a
// DERIVED engine (it composes drift + deltas + ledger into a per-account
// narrative). This adapter only reads its entries (handed in via
// `buildAccountTimeline(accountId)`), never writes back.
//
// Quality: derived.

import type { Severity, TimelineEntry } from "../../accountTimeline";
import type { MemoryCategory, MemoryEvent } from "../types";
import { eventId, evidence, safeIso } from "./base";

const MODULE = "account_timeline" as const;

const SEVERITY_MAGNITUDE: Record<Severity, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.8,
  critical: 1,
};

function categoryFor(entry: TimelineEntry): MemoryCategory {
  switch (entry.kind) {
    case "approval":
      return "decision";
    case "outcome":
      return "outcome";
    case "drift":
      return "risk";
    default:
      return "lifecycle";
  }
}

/** Map timeline entries to memory events. Pure and deterministic. */
export function accountTimelineToEvents(entries: TimelineEntry[]): MemoryEvent[] {
  const events: MemoryEvent[] = [];

  for (const entry of entries) {
    const ts = safeIso(entry.timestamp);
    if (!ts) continue;

    const mag = SEVERITY_MAGNITUDE[entry.severity];
    const evidenceItems = [
      evidence(`timeline:${entry.id}`, entry.kindLabel, entry.headline),
    ];
    if (entry.detail) {
      evidenceItems.push(evidence(`timeline:${entry.id}:detail`, "Detail", entry.detail));
    }

    events.push({
      eventId: eventId(MODULE, entry.id),
      source: { module: MODULE, entity: entry.account_id, quality: "derived" },
      category: categoryFor(entry),
      subjectId: entry.account_id,
      subjectLabel: entry.account_name,
      timestamp: ts,
      summary: entry.headline,
      evidence: evidenceItems,
      signals: {
        governance: entry.kind === "approval",
        customerImpact: mag,
        revenueImpact: mag * 0.6,
        sellerImpact: 0.3,
        managerImpact: entry.severity === "critical" ? 0.6 : 0.2,
      },
      dedupeKey: `timeline:${entry.id}`,
    });
  }

  return events;
}
