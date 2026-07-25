// VentureOS — AI Assurance Center · Loader
// ========================================
// Server/build-time loader. Imports the build-time-generated AI Assurance Center
// projection (the authoritative Python `ai_assurance_center_export.py` output),
// validates it against the mirrored contract, and returns a typed document. It
// fails closed: an invalid or drifted document throws rather than rendering
// unverified copy.
//
// The generated JSON is bundled at build time — no filesystem path is exposed to
// the client and no engine, provider, ledger, or network code is imported.

import generated from "./data/aiAssuranceCenter.generated.json";
import { loadAiAssuranceFrom, type AiAssuranceCenterDoc } from "./aiAssuranceCenter";

export function loadAiAssurance(): AiAssuranceCenterDoc {
  return loadAiAssuranceFrom(generated);
}
