// Release 2.1B — Memory Intelligence
// ====================================
// Deterministic recall — candidate selection over the Memory Store.
//
// APEF: Protected Engine Boundaries + Deterministic AI. Recall READS from the
// store only (never mutates it) and applies structured, deterministic filters:
//   * subject scope
//   * category scope
//   * lifecycle eligibility (archived + compressed excluded by default)
//   * optional literal term match against the record summary
//
// No embeddings, no NLP, no randomness. Term matching is a literal,
// lower-cased, whitespace-tokenized containment test so it is fully repeatable.

import type { MemoryLifecycle, MemoryRecord } from "../types";
import type { MemoryStore } from "../store";
import type { RetrievalQuery } from "./types";

/** Lifecycles excluded from retrieval unless a query opts them back in. */
export const DEFAULT_EXCLUDED_LIFECYCLES: ReadonlyArray<MemoryLifecycle> = [
  "archived",
  "compressed",
];

/** A recalled candidate carrying why it was recalled and its term-match count. */
export interface RetrievalCandidate {
  record: MemoryRecord;
  recallReason: string;
  /** Number of distinct query terms found in the summary (0 when no terms). */
  matchCount: number;
}

export interface RecallOutcome {
  candidates: RetrievalCandidate[];
  filtersApplied: string[];
}

/** Deterministic tokenization: lower-case, split on non-alphanumeric runs. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/** Count how many distinct query terms appear as tokens in the summary. */
function countMatches(summary: string, terms: string[]): number {
  const tokens = new Set(tokenize(summary));
  const seen = new Set<string>();
  let count = 0;
  for (const raw of terms) {
    const term = raw.toLowerCase().trim();
    if (term.length === 0 || seen.has(term)) continue;
    seen.add(term);
    if (tokens.has(term)) count++;
  }
  return count;
}

/**
 * Select ranked-eligible candidates from the store. Pure and deterministic: the
 * store is only read, and the returned candidates preserve the store's canonical
 * (recordId-ascending) order for a stable downstream sort.
 */
export function recall(store: MemoryStore, query: RetrievalQuery): RecallOutcome {
  const filtersApplied: string[] = [];

  // Subject scope — use the store's indexed read when possible.
  let base: MemoryRecord[];
  if (query.subjectId !== undefined) {
    base = store.readBySubject(query.subjectId);
    filtersApplied.push(`subject=${query.subjectId}`);
  } else {
    base = store.all();
  }

  // Category scope.
  const categorySet =
    query.categories && query.categories.length > 0 ? new Set(query.categories) : undefined;
  if (categorySet) {
    filtersApplied.push(`categories=${[...categorySet].sort().join(",")}`);
  }

  // Lifecycle eligibility.
  const whitelist =
    query.includeLifecycles && query.includeLifecycles.length > 0
      ? new Set(query.includeLifecycles)
      : undefined;
  if (whitelist) {
    filtersApplied.push(`lifecycle_include=${[...whitelist].sort().join(",")}`);
  } else {
    filtersApplied.push(`lifecycle_exclude=${[...DEFAULT_EXCLUDED_LIFECYCLES].join(",")}`);
  }

  // Term match.
  const terms =
    query.matchTerms && query.matchTerms.length > 0 ? query.matchTerms : undefined;
  if (terms) {
    filtersApplied.push(`match=${terms.map((t) => t.toLowerCase().trim()).join(",")}`);
  }

  const candidates: RetrievalCandidate[] = [];
  for (const record of base) {
    if (categorySet && !categorySet.has(record.category)) continue;

    if (whitelist) {
      if (!whitelist.has(record.lifecycle)) continue;
    } else if (DEFAULT_EXCLUDED_LIFECYCLES.includes(record.lifecycle)) {
      continue;
    }

    let matchCount = 0;
    if (terms) {
      matchCount = countMatches(record.summary, terms);
      // When terms are supplied, a record must match at least one of them.
      if (matchCount === 0) continue;
    }

    candidates.push({
      record,
      matchCount,
      recallReason: buildRecallReason(record, query, matchCount, terms !== undefined),
    });
  }

  return { candidates, filtersApplied };
}

function buildRecallReason(
  record: MemoryRecord,
  query: RetrievalQuery,
  matchCount: number,
  hasTerms: boolean,
): string {
  const parts: string[] = [];
  if (query.subjectId !== undefined) parts.push(`subject '${record.subjectId}'`);
  if (query.categories && query.categories.length > 0) {
    parts.push(`category '${record.category}'`);
  }
  if (hasTerms) parts.push(`matched ${matchCount} query term(s)`);
  parts.push(`lifecycle '${record.lifecycle}'`);
  return `Recalled by ${parts.join(", ")}.`;
}
