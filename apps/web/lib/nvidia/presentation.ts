// Release 2.3 — NVIDIA-Grounded Mission Intelligence · presentation labels
// =======================================================================
// Pure, deterministic mapping from a narrative's provenance to the TRUTHFUL
// label the Mission Control surface shows. This exists so the primary UI can
// never imply a live NVIDIA Nemotron call when only the deterministic mock ran,
// and never imply a model was used when the deterministic fallback is presented.
//
// Rules (locked):
//   * The live-NVIDIA label appears ONLY when a real hosted NIM narrative was
//     used (provider "nim" AND not fallen back).
//   * The mock provider is labelled as a SIMULATION, not as a live AI call.
//   * Any fallback (guard rejection, provider failure, or the deterministic
//     baseline) is labelled as the deterministic VentureOS explanation.
//
// Pure module: types + one function, no JSX, no globals, no network.

export type NarrativeStateTone = "grounded" | "live" | "fallback";

export interface NarrativeStateLabel {
  /** The primary, business-facing label. */
  label: string;
  /** Presentation tone the surface maps to an icon/colour. */
  tone: NarrativeStateTone;
}

export const NARRATIVE_LABEL_MOCK = "Grounded narrative simulation";
export const NARRATIVE_LABEL_LIVE = "AI explanation generated with NVIDIA Nemotron";
export const NARRATIVE_LABEL_FALLBACK = "Deterministic VentureOS explanation";

/** Concise, honest model-selection decision statement for Technical Evidence and
 * demo/judging notes ONLY. It explains WHY the interactive default is the smaller
 * model — grounded reliability and fail-safe behaviour, not parameter count. This
 * must never appear in the primary mission workflow. */
export const MODEL_SELECTION_DEFAULT = "nvidia/nvidia-nemotron-nano-9b-v2";
export const MODEL_SELECTION_CANDIDATE = "nvidia/nemotron-3-nano-30b-a3b";
export const MODEL_SELECTION_STATEMENT =
  "VentureOS selected the smallest reliable model based on grounding, structured-output reliability, latency, and fail-safe behaviour—not parameter count.";
export const MODEL_SELECTION_CANDIDATE_NOTE =
  "The 30B candidate was reachable with the same key but failed the bounded structured-output configuration; it is tested and deferred, not incapable.";

/** Resolve the truthful narrative-state label from its provenance. `fallbackUsed`
 * wins over everything: if the model narrative was not actually used, the surface
 * must present the deterministic label regardless of which provider was asked. */
export function narrativeStateLabel(
  provider: string,
  fallbackUsed: boolean,
): NarrativeStateLabel {
  if (fallbackUsed || provider === "ventureos-deterministic") {
    return { label: NARRATIVE_LABEL_FALLBACK, tone: "fallback" };
  }
  if (provider === "nim") {
    return { label: NARRATIVE_LABEL_LIVE, tone: "live" };
  }
  // mock (and any non-fallback provider that is not the live NIM) is a
  // deterministic simulation — never labelled as a live NVIDIA call.
  return { label: NARRATIVE_LABEL_MOCK, tone: "grounded" };
}
