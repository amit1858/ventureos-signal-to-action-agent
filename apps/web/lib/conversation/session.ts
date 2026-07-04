// Release 2.1C — Conversation Runtime
// ====================================
// Conversation session — the runtime-owned anti-repetition ledger.
//
// This is the ONLY stateful piece of the pipeline. It owns two things and
// nothing else:
//   1. `currentTurn` — a monotonic integer conversation turn (never a clock).
//   2. `servedHistory` — the list of records already served, each tagged with
//      the turn it was served on (2.1B `ServedRecord`).
//
// APEF: Deterministic AI + Protected Engine Boundaries. There is no clock and no
// randomness here — only integer turn arithmetic. Transitions are immutable by
// convention (each returns a NEW session), so a conversation is fully replayable
// exactly like the 2.1A store: same script -> identical ledger, always. The
// runtime does NOT implement anti-repetition math — it only records what was
// served and hands the ledger back to retrieval, which owns that logic.

import type { ServedRecord } from "../memory";
import type { ConversationSession } from "./types";

/** The turn a fresh conversation starts on. */
export const INITIAL_TURN = 1;

/**
 * Create a fresh conversation session. Starts on {@link INITIAL_TURN} with an
 * empty served-history ledger.
 */
export function createSession(sessionId: string): ConversationSession {
  return { sessionId, currentTurn: INITIAL_TURN, servedHistory: [] };
}

/**
 * Record the memories served on the current turn and advance to the next turn.
 * Returns a NEW session (immutable by convention); the input is never mutated.
 *
 * The ledger is compacted to one entry per recordId carrying its most recent
 * served turn — this keeps it bounded and matches 2.1B's `buildServedIndex`,
 * which already keeps the max served turn per record. Compaction is a bookkeeping
 * choice; it performs no anti-repetition math (retrieval owns that).
 */
export function advance(
  session: ConversationSession,
  servedRecordIds: string[],
): ConversationSession {
  const byRecordId = new Map<string, number>();
  for (const entry of session.servedHistory) {
    byRecordId.set(entry.recordId, entry.servedTurn);
  }
  for (const recordId of servedRecordIds) {
    // Most-recent served turn wins (deterministic, integer-only).
    byRecordId.set(recordId, session.currentTurn);
  }

  const servedHistory: ServedRecord[] = [...byRecordId.entries()]
    .map(([recordId, servedTurn]) => ({ recordId, servedTurn }))
    .sort(byRecordIdAsc);

  return {
    sessionId: session.sessionId,
    currentTurn: session.currentTurn + 1,
    servedHistory,
  };
}

function byRecordIdAsc(a: ServedRecord, b: ServedRecord): number {
  return a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0;
}
