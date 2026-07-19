// Release 2.1C — Conversation Runtime
// ====================================
// Evidence citation handoff.
//
// APEF: Evidence Before Confidence. Citations are a pure PROJECTION of a record's
// provenance evidence (established back in 2.1A). The runtime never invents,
// paraphrases, or re-derives evidence — it only re-shapes what already exists so
// that 2.1D / 2.2 can render "why should I believe this?" without touching memory.

import type { MemoryRecord } from "../memory";
import type { EvidenceCitation } from "./types";

/**
 * Project a record's supporting evidence into citations. Each citation carries
 * the record's deterministic source module, source quality, and confidence band
 * so a downstream surface can show provenance without re-reading the store.
 *
 * Returns [] when a record has no supporting evidence — the composer treats that
 * as "not citable" and refuses to surface it as a claim (evidence before
 * confidence). Order follows the record's own evidence order (deterministic).
 */
export function citeRecord(record: MemoryRecord): EvidenceCitation[] {
  return record.provenance.supportingEvidence.map((evidence) => {
    const citation: EvidenceCitation = {
      recordId: record.recordId,
      sourceModule: record.provenance.sourceModule,
      sourceQuality: record.sourceQuality,
      confidenceBand: record.confidence.band,
      ref: evidence.ref,
      label: evidence.label,
    };
    if (evidence.detail !== undefined) citation.detail = evidence.detail;
    return citation;
  });
}

/**
 * Deduplicate a flat list of citations by (recordId, ref), preserving first-seen
 * order. Used to build the response-level union across all segments.
 */
export function dedupeCitations(citations: EvidenceCitation[]): EvidenceCitation[] {
  const seen = new Set<string>();
  const out: EvidenceCitation[] = [];
  for (const citation of citations) {
    const key = `${citation.recordId}::${citation.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(citation);
  }
  return out;
}
