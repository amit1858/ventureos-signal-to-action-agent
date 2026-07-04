// Release 2.1A — Shared Enterprise Memory Core
// ============================================
// The Memory Store — the single source of truth. Everything downstream consumes
// memory THROUGH this store; nothing bypasses it.
//
// APEF: Architecture First + Protected Engine Boundaries.
//   * The store only ever READS from source engines (via already-read snapshots
//     handed to adapters). It NEVER writes back to any protected engine.
//   * State is explicit and inspectable (no hidden globals). Callers construct a
//     store, feed it events, and can snapshot / replay it deterministically.
//
// Surface (per the Release 2.1 spec):
//   read · write · update · merge · archive · summarize (placeholder) ·
//   compression hooks (placeholder)

import type {
  MemoryEvent,
  MemoryLifecycle,
  MemoryRecord,
  MemoryReducerResult,
  ReducerContext,
} from "./types";
import { reduceEvent, deriveRecordId } from "./reducers";
import { deriveLifecycle, canTransition } from "./lifecycle";
import { computeConfidence } from "./confidence";

// ---------------------------------------------------------------------------
// Summary (placeholder) contracts
// ---------------------------------------------------------------------------

/**
 * Structural, deterministic summary of the store. This is a PLACEHOLDER for the
 * Release 2.1B semantic summarizer — it only counts and buckets records; it
 * performs no NLP and invents nothing.
 */
export interface MemorySummary {
  placeholder: true;
  subjectId?: string;
  recordCount: number;
  byCategory: Record<string, number>;
  byLifecycle: Record<string, number>;
  byImportanceTier: Record<string, number>;
  note: string;
}

// ---------------------------------------------------------------------------
// Compression hook (placeholder) contract
// ---------------------------------------------------------------------------

/**
 * A compression hook is invoked when a record is compressed. Release 2.1A ships
 * the hook surface only; no real compression codec runs yet.
 */
export type CompressionHook = (record: MemoryRecord) => void;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class MemoryStore {
  private records = new Map<string, MemoryRecord>();
  /** Ordered log of accepted event ids (for duplicate rejection + replay). */
  private acceptedEventIds = new Set<string>();
  private eventLog: MemoryEvent[] = [];
  private compressionHooks: CompressionHook[] = [];

  // -- read ----------------------------------------------------------------

  /** Read one record by id. */
  read(recordId: string): MemoryRecord | undefined {
    return this.records.get(recordId);
  }

  /** All records, ordered deterministically by recordId. */
  all(): MemoryRecord[] {
    return [...this.records.values()].sort(byRecordId);
  }

  /** All records for a subject, ordered deterministically. */
  readBySubject(subjectId: string): MemoryRecord[] {
    return this.all().filter((r) => r.subjectId === subjectId);
  }

  /** All records in a category, ordered deterministically. */
  readByCategory(category: MemoryRecord["category"]): MemoryRecord[] {
    return this.all().filter((r) => r.category === category);
  }

  /** The accepted event log (replay source). Returns a copy. */
  events(): MemoryEvent[] {
    return [...this.eventLog];
  }

  // -- write / update / merge ---------------------------------------------

  /**
   * Write one event. Runs the pure reducer against any existing record for the
   * event's key, stores the result, and returns the reducer result. Merging of
   * same-key events happens automatically here — this IS the store's `merge`.
   */
  write(event: MemoryEvent, ctx: ReducerContext): MemoryReducerResult {
    const recordId = deriveRecordId(event);
    const existing = this.records.get(recordId);
    const result = reduceEvent(event, ctx, existing);

    if (result.op !== "duplicate_suppressed") {
      this.records.set(result.record.recordId, result.record);
      if (!this.acceptedEventIds.has(event.eventId)) {
        this.acceptedEventIds.add(event.eventId);
        this.eventLog.push(event);
      }
    }
    return result;
  }

  /** Alias for {@link write}; a new event on an existing key is an update. */
  update(event: MemoryEvent, ctx: ReducerContext): MemoryReducerResult {
    return this.write(event, ctx);
  }

  /** Bulk ingest. Events are applied in array order; result order matches. */
  ingest(events: MemoryEvent[], ctx: ReducerContext): MemoryReducerResult[] {
    return events.map((e) => this.write(e, ctx));
  }

  // -- lifecycle transitions (explicit, guarded) --------------------------

  /**
   * Archive a record. Guarded by the lifecycle transition table. Returns the
   * updated record, or undefined if the record does not exist. Throws on an
   * illegal transition (deterministic message).
   */
  archive(recordId: string, ctx: ReducerContext): MemoryRecord | undefined {
    return this.applyFlag(recordId, ctx, "archived", "archived");
  }

  /**
   * Promote a record to active after consolidation. Guarded transition.
   */
  activate(recordId: string, ctx: ReducerContext): MemoryRecord | undefined {
    return this.applyFlag(recordId, ctx, "activated", "active");
  }

  /**
   * Compress a record (placeholder codec). Only archived records may be
   * compressed. Fires registered compression hooks. Guarded transition.
   */
  compress(recordId: string, ctx: ReducerContext): MemoryRecord | undefined {
    const updated = this.applyFlag(recordId, ctx, "compressed", "compressed");
    if (updated) {
      for (const hook of this.compressionHooks) hook(updated);
    }
    return updated;
  }

  /** Register a compression hook (placeholder surface for Release 2.1B). */
  registerCompressionHook(hook: CompressionHook): void {
    this.compressionHooks.push(hook);
  }

  /**
   * Re-derive time-sensitive lifecycle (e.g. active/merged -> aged) for every
   * record against a new asOf clock. Pure re-derivation; no data is invented.
   */
  reconcileLifecycle(ctx: ReducerContext): void {
    for (const record of this.records.values()) {
      const next = deriveLifecycle({
        eventCount: record.eventCount,
        lastUpdatedIso: record.lastUpdated,
        asOfMs: ctx.asOfMs,
        flags: record.flags,
      });
      if (next !== record.lifecycle) {
        this.records.set(record.recordId, {
          ...record,
          lifecycle: next,
          confidence: computeConfidence({
            quality: record.sourceQuality,
            timestampIso: record.lastUpdated,
            asOfMs: ctx.asOfMs,
            evidenceCount: record.provenance.supportingEvidence.length,
          }),
        });
      }
    }
  }

  // -- summarize (placeholder) --------------------------------------------

  /**
   * Deterministic structural summary. PLACEHOLDER — counts only, no semantics.
   * Pass a subjectId to scope it to one subject.
   */
  summarize(subjectId?: string): MemorySummary {
    const scope = subjectId ? this.readBySubject(subjectId) : this.all();
    const byCategory: Record<string, number> = {};
    const byLifecycle: Record<string, number> = {};
    const byImportanceTier: Record<string, number> = {};
    for (const r of scope) {
      byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
      byLifecycle[r.lifecycle] = (byLifecycle[r.lifecycle] ?? 0) + 1;
      byImportanceTier[r.importance.tier] =
        (byImportanceTier[r.importance.tier] ?? 0) + 1;
    }
    return {
      placeholder: true,
      subjectId,
      recordCount: scope.length,
      byCategory,
      byLifecycle,
      byImportanceTier,
      note: "Structural summary only. Semantic summarization arrives in Release 2.1B.",
    };
  }

  // -- deterministic snapshot / replay ------------------------------------

  /** A stable, JSON-serializable snapshot for equality checks. */
  snapshot(): MemoryRecord[] {
    return this.all();
  }

  /** Number of stored records. */
  size(): number {
    return this.records.size;
  }

  /**
   * Rebuild a fresh store from an event log and asOf clock. Given the same log
   * + clock, produces an identical snapshot to the original — this is the core
   * determinism guarantee callers can assert against.
   */
  static replay(events: MemoryEvent[], ctx: ReducerContext): MemoryStore {
    const store = new MemoryStore();
    store.ingest(events, ctx);
    return store;
  }

  // -- internals -----------------------------------------------------------

  private applyFlag(
    recordId: string,
    ctx: ReducerContext,
    flag: "activated" | "archived" | "compressed",
    target: MemoryLifecycle,
  ): MemoryRecord | undefined {
    const record = this.records.get(recordId);
    if (!record) return undefined;
    if (!canTransition(record.lifecycle, target)) {
      throw new Error(
        `Illegal lifecycle transition ${record.lifecycle} -> ${target} for ${recordId}.`,
      );
    }
    const flags = { ...record.flags, [flag]: true };
    const lifecycle = deriveLifecycle({
      eventCount: record.eventCount,
      lastUpdatedIso: record.lastUpdated,
      asOfMs: ctx.asOfMs,
      flags,
    });
    const updated: MemoryRecord = { ...record, flags, lifecycle };
    this.records.set(recordId, updated);
    return updated;
  }
}

function byRecordId(a: MemoryRecord, b: MemoryRecord): number {
  return a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0;
}
