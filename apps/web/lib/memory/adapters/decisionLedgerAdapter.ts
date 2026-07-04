// Release 2.1A — Decision Ledger adapter (READ-ONLY)
// ==================================================
// Maps governed Decision Ledger entries -> MemoryEvents. The Decision Ledger is
// a PROTECTED engine: this adapter only reads its entries (handed in by the
// caller via `listLedger()` / `listLedgerForAccount()`), never writes back.
//
// Quality: authoritative (the ledger is the system of record for decisions).

import type { LedgerEntry } from "../../decisionLedger";
import type { MemoryCategory, MemoryEvent } from "../types";
import { clamp01, eventId, evidence, safeIso } from "./base";

const MODULE = "decision_ledger" as const;

function riskToMagnitude(risk: string): number {
  switch ((risk || "").toLowerCase()) {
    case "critical":
      return 1;
    case "high":
      return 0.8;
    case "medium":
      return 0.5;
    case "low":
      return 0.25;
    default:
      return 0.4;
  }
}

function categoryFor(entry: LedgerEntry): MemoryCategory {
  if (entry.outcome) return "outcome";
  if (entry.governance_caveat) return "governance";
  return "decision";
}

/** Map ledger entries to memory events. Pure and deterministic. */
export function decisionLedgerToEvents(entries: LedgerEntry[]): MemoryEvent[] {
  const events: MemoryEvent[] = [];

  for (const entry of entries) {
    const ts = safeIso(entry.outcome_at) ?? safeIso(entry.created_at);
    if (!ts) continue;

    const riskMag = riskToMagnitude(entry.risk_level);
    const oppMag = clamp01((entry.opportunity_level ?? 0) / 100);
    const hasGovernance = Boolean(entry.governance_caveat);

    const evidenceItems = [
      evidence(`ledger:${entry.ledger_id}`, "Decision ledger entry", entry.recommended_action),
      evidence(`rec:${entry.recommendation_id}`, "Recommendation", entry.business_impact),
    ];
    if (entry.reviewer_note) {
      evidenceItems.push(
        evidence(`review:${entry.ledger_id}`, `Reviewer: ${entry.reviewer_name}`, entry.reviewer_note),
      );
    }

    const summary = entry.outcome
      ? `Outcome for ${entry.account_name}: ${entry.outcome} (${entry.decision_type}).`
      : `${entry.decision_type === "approved" ? "Approved" : entry.decision_type === "rejected" ? "Rejected" : "Reviewed"} action for ${entry.account_name}: ${entry.recommended_action}.`;

    events.push({
      eventId: eventId(MODULE, entry.ledger_id, entry.outcome ? "outcome" : "decision"),
      source: { module: MODULE, entity: entry.account_id, quality: "authoritative" },
      category: categoryFor(entry),
      subjectId: entry.account_id,
      subjectLabel: entry.account_name,
      timestamp: ts,
      summary,
      evidence: evidenceItems,
      signals: {
        governance: hasGovernance,
        customerImpact: riskMag,
        revenueImpact: Math.max(riskMag * 0.75, oppMag),
        sellerImpact: clamp01((entry.evidence_count ?? 0) / 10),
        managerImpact: hasGovernance ? 0.6 : 0.2,
      },
      dedupeKey: `ledger:${entry.recommendation_id}`,
    });
  }

  return events;
}
