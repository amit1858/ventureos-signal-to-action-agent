// VentureOS — Revenue Companion · Server-side builder
// ===================================================
// Builds the validated Revenue Companion view models from the already-loaded,
// contract-validated governed demo document. It runs the server-only narrative
// adapter (deterministic today) and the groundedness validator, then hands the
// plain, serializable view models to the client shell as props.
//
// Server-only by a hard runtime guard: the narrative adapter and the env-backed
// access gate must never reach the browser bundle.

import type { DemoJourneysDoc } from "../demo-mode/presentationContract";
import {
  buildValidatedCompanion,
  type RevenueCompanionViewModel,
} from "./companionContract";
import { resolveCompanionNarrative } from "./narrativeAdapter.server";

if (typeof window !== "undefined") {
  throw new Error(
    "revenue-companion/buildCompanions.server must only run on the server; it must not be imported by client components.",
  );
}

// One companion view model per journey key, keyed for the client shell to pick
// the model matching the selected journey. Built from the base governed view
// (the companion "speaks first" in the pre-walkthrough opening state).
export function buildCompanionsForDoc(
  doc: DemoJourneysDoc,
): Record<string, RevenueCompanionViewModel> {
  const out: Record<string, RevenueCompanionViewModel> = {};
  for (const journey of doc.journeys) {
    const resolved = resolveCompanionNarrative(journey.view);
    out[journey.key] = buildValidatedCompanion(
      journey.view,
      { journeyKey: journey.key, journeyTitle: journey.title },
      resolved,
    );
  }
  return out;
}

// The single companion for the default journey, for the standalone route.
export function buildDefaultCompanion(
  doc: DemoJourneysDoc,
): RevenueCompanionViewModel {
  const companions = buildCompanionsForDoc(doc);
  return companions[doc.defaultJourneyKey] ?? companions[doc.journeys[0].key];
}
