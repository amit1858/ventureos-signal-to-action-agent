// Release 2.1A — Shared Enterprise Memory Core
// ============================================
// Retrieval Engine — PLACEHOLDER ONLY.
//
// APEF: Progressive Dependency. Release 2.1A deliberately does NOT build
// retrieval. This module exists so the pipeline shape is visible and downstream
// releases have a stable contract to implement against:
//
//   Memory Store -> Retrieval Engine (placeholder) -> Conversation Runtime (future)
//
// Nothing here ranks, scores, or interprets memory. It returns an explicit,
// well-formed "not implemented" result so callers fail loudly-but-safely.

import type { MemoryRecord } from "./types";
import type { MemoryStore } from "./store";

export interface RetrievalQuery {
  subjectId?: string;
  category?: MemoryRecord["category"];
  limit?: number;
}

export interface RetrievalResult {
  implemented: false;
  query: RetrievalQuery;
  results: MemoryRecord[];
  note: string;
}

/**
 * Placeholder retrieval. Always returns an empty result set with a clear note.
 * Real retrieval (ranking, relevance, recency blending) is Release 2.1B.
 */
export function retrieve(_store: MemoryStore, query: RetrievalQuery): RetrievalResult {
  return {
    implemented: false,
    query,
    results: [],
    note: "Retrieval Engine is a placeholder in Release 2.1A. Implemented in Release 2.1B.",
  };
}
