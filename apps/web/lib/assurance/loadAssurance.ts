// VentureOS — AI Assurance · Loader
// =================================
// Server/build-time loader. Imports the build-time-generated projection (the
// authoritative Python `assurance_web_export.py` output), validates it against the
// mirrored contract, and returns a typed document. It fails closed: an invalid or
// drifted document throws rather than rendering unverified copy.
//
// The generated JSON is bundled at build time — no filesystem path is exposed to
// the client and no engine, provider, ledger, or network code is imported.

import generated from "./data/assurance.generated.json";
import { validateAssuranceDoc, type AssuranceDoc } from "./contract";

export function loadAssurance(): AssuranceDoc {
  const result = validateAssuranceDoc(generated);
  if (!result.ok) {
    throw new Error(`Assurance data failed contract validation: ${result.errors.join("; ")}`);
  }
  return generated as unknown as AssuranceDoc;
}
