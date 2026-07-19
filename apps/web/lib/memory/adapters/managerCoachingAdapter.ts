// Release 2.1A — Manager Coaching adapter (READ-ONLY, forward-compatible)
// =======================================================================
// Maps Manager Coaching snapshots -> MemoryEvents.
//
// NOTE: A dedicated Manager Coaching engine module does not yet exist in the
// frontend `lib`. To honor the spec's list of ingestion sources without
// coupling to or fabricating that engine, this adapter defines the minimal
// READ contract it will consume. When the engine ships, it need only expose a
// reader returning `ManagerCoachingSnapshot[]`; this adapter stays unchanged.
//
// The adapter is a pure mapping and never writes back.
// Quality: derived.

import type { MemoryEvent } from "../types";
import { clamp01, eventId, evidence, safeIso } from "./base";

const MODULE = "manager_coaching" as const;

/** The read contract this adapter expects from a future Manager Coaching engine. */
export interface ManagerCoachingSnapshot {
  /** Stable coaching-note id. */
  coaching_id: string;
  /** Seller/rep the coaching is about. */
  seller_id: string;
  seller_name: string;
  /** Account the coaching pertains to (memory subject). */
  account_id: string;
  account_name: string;
  /** ISO timestamp of the coaching note. */
  timestamp: string;
  /** One-line coaching headline. */
  headline: string;
  /** Coaching detail / rationale. */
  detail?: string;
  /** Manager-assessed severity 0..1 (deterministic input). */
  severity?: number;
  /** True when the coaching flags a governance concern. */
  governance_flag?: boolean;
}

/** Map manager coaching snapshots to memory events. Pure and deterministic. */
export function managerCoachingToEvents(
  snapshots: ManagerCoachingSnapshot[],
): MemoryEvent[] {
  const events: MemoryEvent[] = [];

  for (const c of snapshots) {
    const ts = safeIso(c.timestamp);
    if (!ts) continue;
    const sev = clamp01(c.severity);

    const evidenceItems = [
      evidence(`coaching:${c.coaching_id}`, `Coaching · ${c.seller_name}`, c.headline),
    ];
    if (c.detail) {
      evidenceItems.push(evidence(`coaching:${c.coaching_id}:detail`, "Detail", c.detail));
    }

    events.push({
      eventId: eventId(MODULE, c.coaching_id),
      source: { module: MODULE, entity: c.account_id, quality: "derived" },
      category: "coaching",
      subjectId: c.account_id,
      subjectLabel: c.account_name,
      timestamp: ts,
      summary: `Coaching for ${c.seller_name} on ${c.account_name}: ${c.headline}`,
      evidence: evidenceItems,
      signals: {
        governance: Boolean(c.governance_flag),
        customerImpact: sev * 0.4,
        revenueImpact: sev * 0.5,
        sellerImpact: Math.max(sev, 0.5),
        managerImpact: Math.max(sev, 0.6),
      },
      dedupeKey: `coaching:${c.seller_id}`,
    });
  }

  return events;
}
