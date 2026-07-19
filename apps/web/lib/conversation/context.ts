// Release 2.1C — Conversation Runtime
// ====================================
// Context binding — turns a ConversationContext + ConversationSession into a
// deterministic 2.1B RetrievalQuery, and runs retrieval READ ONLY.
//
// APEF: Protected Engine Boundaries + Deterministic AI. This module is the sole
// bridge into 2.1B. It:
//   * forwards `asOfMs` verbatim (the injected clock — never Date.now()),
//   * ALWAYS passes `currentTurn` from the session (per the 2.1C invariant),
//   * hands `servedHistory` back to retrieval so retrieval — which owns the
//     anti-repetition math — can apply it,
//   * never mutates the store and never re-ranks or re-scores results.
//
// If a malformed session ever carries a non-empty `servedHistory` without a
// finite `currentTurn`, the 2.1B `RetrievalError` surfaces UNCAUGHT — this
// module deliberately does not swallow it.

import { retrieve } from "../memory";
import type { MemoryStore, RetrievalQuery, RetrievalResult } from "../memory";
import type { ConversationContext, ConversationSession } from "./types";

/**
 * Build the deterministic retrieval query for this turn. `currentTurn` and
 * `servedHistory` are always taken straight from the session so retrieval can
 * apply anti-repetition; `asOfMs` and scope come from the context.
 */
export function buildRetrievalQuery(
  ctx: ConversationContext,
  session: ConversationSession,
): RetrievalQuery {
  const query: RetrievalQuery = {
    asOfMs: ctx.asOfMs,
    servedHistory: session.servedHistory,
    // Always forwarded from the session (2.1C invariant). Retrieval ignores it
    // when servedHistory is empty and requires it when it is not.
    currentTurn: session.currentTurn,
  };
  if (ctx.subjectId !== undefined) query.subjectId = ctx.subjectId;
  if (ctx.categories !== undefined) query.categories = ctx.categories;
  if (ctx.matchTerms !== undefined) query.matchTerms = ctx.matchTerms;
  if (ctx.limit !== undefined) query.limit = ctx.limit;
  return query;
}

/**
 * Run 2.1B retrieval for this turn. Pure pass-through: the store is only read,
 * nothing is re-ranked or re-scored. Any `RetrievalError` propagates uncaught.
 */
export function runRetrieval(
  store: MemoryStore,
  ctx: ConversationContext,
  session: ConversationSession,
): RetrievalResult {
  return retrieve(store, buildRetrievalQuery(ctx, session));
}
