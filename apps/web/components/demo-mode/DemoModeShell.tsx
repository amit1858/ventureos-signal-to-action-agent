"use client";

import * as React from "react";

import {
  selectView,
  type DemoJourneysDoc,
} from "@/lib/demo-mode/presentationContract";
import { DEMO_STRINGS } from "@/lib/demo-mode/strings";
import { DemoModeBanner } from "./DemoModeBanner";
import { JourneySelector } from "./JourneySelector";
import { JourneyNarrative } from "./JourneyNarrative";
import { RecommendationPanel } from "./RecommendationPanel";
import { GovernanceOutcome } from "./GovernanceOutcome";
import { EvidenceChain } from "./EvidenceChain";
import { ApprovalExecutionPanel } from "./ApprovalExecutionPanel";
import { AuditReplayPanel } from "./AuditReplayPanel";
import { ProviderStatus } from "./ProviderStatus";
import { SafetyDisclosures } from "./SafetyDisclosures";
import { TechnicalDisclosure } from "./TechnicalDisclosure";

// Orchestrates the demo experience. It owns only presentation state
// (which journey is shown, whether separately-validated replay evidence is
// displayed). It never mutates the loaded document and never derives governed
// facts client-side — every fact comes from the pre-validated view model.
export function DemoModeShell({ doc }: { doc: DemoJourneysDoc }) {
  const [selectedKey, setSelectedKey] = React.useState(doc.defaultJourneyKey);
  const [showReplayValidated, setShowReplayValidated] = React.useState(false);

  const journey =
    doc.journeys.find((j) => j.key === selectedKey) ?? doc.journeys[0];
  const view = selectView(journey, showReplayValidated);

  function handleSelect(key: string) {
    setSelectedKey(key);
    // Replay evidence is a per-journey choice; reset it when switching journeys
    // so nothing carries over misleadingly.
    setShowReplayValidated(false);
  }

  return (
    <div className="mx-auto w-full max-w-[820px] px-5 py-8">
      <div className="space-y-2">
        <p className="eyebrow">{DEMO_STRINGS.eyebrow}</p>
        <h1 className="text-2xl font-semibold text-ink">{DEMO_STRINGS.title}</h1>
        <p className="section-sub max-w-[62ch]">{DEMO_STRINGS.intro}</p>
      </div>

      <div className="mt-5">
        <DemoModeBanner />
      </div>

      <div className="mt-5">
        <p className="section-label mb-2">{DEMO_STRINGS.selectorLabel}</p>
        <JourneySelector
          journeys={doc.journeys}
          selectedKey={journey.key}
          onSelect={handleSelect}
        />
      </div>

      <div className="mt-6 space-y-4">
        <JourneyNarrative view={view} />
        <RecommendationPanel view={view} />
        <GovernanceOutcome view={view} />
        <EvidenceChain view={view} />
        <ApprovalExecutionPanel view={view} />
        <AuditReplayPanel
          view={view}
          supportsReplayToggle={journey.supportsReplayEvidenceToggle}
          showReplayValidated={showReplayValidated}
          onToggleReplay={setShowReplayValidated}
        />
        <ProviderStatus view={view} />
        <SafetyDisclosures view={view} />
        <TechnicalDisclosure view={view} />
      </div>

      <p className="mt-8 text-xs leading-relaxed text-faint">{DEMO_STRINGS.footerNote}</p>
    </div>
  );
}
