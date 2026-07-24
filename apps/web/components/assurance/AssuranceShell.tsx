import * as React from "react";

import type { AssuranceDoc } from "@/lib/assurance/contract";
import { assuranceStrings } from "@/lib/assurance/strings";
import { OverallReadiness } from "./OverallReadiness";
import { DeterministicGates } from "./DeterministicGates";
import { NvidiaAdvisory } from "./NvidiaAdvisory";
import { HumanReview } from "./HumanReview";
import { EvidencePanel } from "./EvidencePanel";
import { RuntimeVerificationPanel } from "./RuntimeVerificationPanel";
import { RegressionHistory } from "./RegressionHistory";

// Read-only AI Assurance report. Ordering follows the approved hierarchy:
// Overall readiness -> Deterministic gates -> NVIDIA advisory -> Human review ->
// Evidence -> Runtime verification -> Regression history.
export function AssuranceShell({ doc }: { doc: AssuranceDoc }) {
  return (
    <div className="mx-auto w-full max-w-[900px] px-5 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">{assuranceStrings.title}</h1>
        <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted">
          {assuranceStrings.intro}
        </p>
      </header>
      <div className="flex flex-col gap-5">
        <OverallReadiness data={doc.overallReadiness} />
        <DeterministicGates gates={doc.deterministicGates} />
        <NvidiaAdvisory data={doc.nvidiaAdvisory} />
        <HumanReview rows={doc.humanReview} />
        <EvidencePanel data={doc.syntheticEvidence} />
        <RuntimeVerificationPanel data={doc.runtimeVerification} />
        <RegressionHistory entries={doc.regressionHistory} />
      </div>
    </div>
  );
}
