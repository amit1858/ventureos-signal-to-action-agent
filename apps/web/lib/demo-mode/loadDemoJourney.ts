// VentureOS — Demo Mode · Journey loader
// ======================================
// Server/build-time loader. Imports the build-time-generated projection (the
// authoritative Python `presentation_web_export.py` output), validates it against
// the mirrored contract, and returns a typed document. It fails closed: an
// invalid or drifted document throws rather than rendering unverified copy.
//
// The generated JSON is bundled at build time — no filesystem path is exposed to
// the client and no engine, provider, ledger, or network code is imported.

import generated from "./data/demo-journeys.generated.json";
import {
  validateDemoJourneysDoc,
  type DemoJourney,
  type DemoJourneysDoc,
} from "./presentationContract";

export function loadDemoJourneys(): DemoJourneysDoc {
  const result = validateDemoJourneysDoc(generated);
  if (!result.ok) {
    throw new Error(
      `Demo Mode data failed contract validation: ${result.errors.join("; ")}`,
    );
  }
  return generated as unknown as DemoJourneysDoc;
}

export function findJourney(
  doc: DemoJourneysDoc,
  key: string,
): DemoJourney | undefined {
  return doc.journeys.find((j) => j.key === key);
}

export function defaultJourney(doc: DemoJourneysDoc): DemoJourney {
  return findJourney(doc, doc.defaultJourneyKey) ?? doc.journeys[0];
}
