// Release 2.1A — Read-only ingestion adapters barrel.
//
// Each adapter is a PURE mapping from an already-read source snapshot to
// MemoryEvent[]. Adapters emit MemoryEvents and nothing more; they never write
// back to any source engine (Protected Engine Boundaries).

export * from "./base";
export { decisionLedgerToEvents } from "./decisionLedgerAdapter";
export { missionStateToEvents } from "./missionStateAdapter";
export { accountTimelineToEvents } from "./accountTimelineAdapter";
export { recommendationDeltaToEvents } from "./recommendationDeltaAdapter";
export { driftEngineToEvents } from "./driftEngineAdapter";
export { executiveBriefToEvents } from "./executiveBriefAdapter";
export {
  managerCoachingToEvents,
  type ManagerCoachingSnapshot,
} from "./managerCoachingAdapter";
export {
  operationsHealthToEvents,
  type OperationsHealthSnapshot,
  type OpsStatus,
} from "./operationsHealthAdapter";
