// Release 2.1A — Operations Health adapter (READ-ONLY, forward-compatible)
// ========================================================================
// Maps Operations Health snapshots -> MemoryEvents.
//
// NOTE: A dedicated Operations Health engine module does not yet exist in the
// frontend `lib`. As with Manager Coaching, this adapter defines the minimal
// READ contract it will consume so the ingestion surface is complete without
// coupling to or fabricating that engine. When the engine ships, expose a
// reader returning `OperationsHealthSnapshot[]` and this adapter is unchanged.
//
// The adapter is a pure mapping and never writes back.
// Quality: derived.

import type { MemoryEvent } from "../types";
import { clamp01, eventId, evidence, safeIso } from "./base";

const MODULE = "operations_health" as const;

/** Operational status tiers (deterministic magnitude mapping below). */
export type OpsStatus = "healthy" | "degraded" | "critical";

/** The read contract this adapter expects from a future Operations Health engine. */
export interface OperationsHealthSnapshot {
  /** Stable health-check id. */
  check_id: string;
  /** Subsystem / component the check covers. */
  component: string;
  /** Account the health signal pertains to (memory subject). */
  account_id: string;
  account_name: string;
  /** ISO timestamp of the health observation. */
  timestamp: string;
  status: OpsStatus;
  /** One-line description of the observation. */
  headline: string;
  /** Customer-facing impact magnitude 0..1 (deterministic input). */
  customer_impact?: number;
}

const STATUS_MAGNITUDE: Record<OpsStatus, number> = {
  healthy: 0.15,
  degraded: 0.6,
  critical: 1,
};

/** Map operations-health snapshots to memory events. Pure and deterministic. */
export function operationsHealthToEvents(
  snapshots: OperationsHealthSnapshot[],
): MemoryEvent[] {
  const events: MemoryEvent[] = [];

  for (const h of snapshots) {
    const ts = safeIso(h.timestamp);
    if (!ts) continue;
    const mag = STATUS_MAGNITUDE[h.status];
    const customer = Math.max(clamp01(h.customer_impact), h.status === "healthy" ? 0 : mag * 0.7);

    events.push({
      eventId: eventId(MODULE, h.check_id),
      source: { module: MODULE, entity: h.account_id, quality: "derived" },
      category: "operations",
      subjectId: h.account_id,
      subjectLabel: h.account_name,
      timestamp: ts,
      summary: `${h.component} is ${h.status} for ${h.account_name}: ${h.headline}`,
      evidence: [evidence(`ops:${h.check_id}`, `${h.component} health`, h.headline)],
      signals: {
        governance: h.status === "critical",
        customerImpact: customer,
        revenueImpact: mag * 0.6,
        sellerImpact: 0.2,
        managerImpact: h.status === "critical" ? 0.7 : 0.3,
      },
      dedupeKey: `ops:${h.component}`,
    });
  }

  return events;
}
