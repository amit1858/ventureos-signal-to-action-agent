"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Play,
  RotateCcw,
} from "lucide-react";

import {
  selectView,
  type DemoJourneysDoc,
  type DemoPresentationView,
} from "@/lib/demo-mode/presentationContract";
import {
  GUIDED_STAGES,
  INITIAL_GUIDED_STATE,
  currentStage,
  goToStage,
  isLastStage,
  isReplayToggleStage,
  isStageReachable,
  nextStage,
  prevStage,
  restartFlow,
  stageProgressLabel,
  stageStatus,
  startFlow,
  type GuidedStageKind,
  type GuidedState,
} from "@/lib/demo-mode/guidedFlow";
import { cx } from "@/lib/format";
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

// Orchestrates the demo experience as a GUIDED walkthrough. It owns only
// presentation state: which journey is shown, whether separately-validated
// replay evidence is displayed, and which guided stage is currently in focus.
// It never mutates the loaded document and never derives governed facts
// client-side — every fact comes from the pre-validated view model, and the
// guided stages are just an ordered lens over that same immutable view.
export function DemoModeShell({ doc }: { doc: DemoJourneysDoc }) {
  const [selectedKey, setSelectedKey] = React.useState(doc.defaultJourneyKey);
  const [showReplayValidated, setShowReplayValidated] = React.useState(false);
  const [flow, setFlow] = React.useState<GuidedState>(INITIAL_GUIDED_STATE);

  const journey =
    doc.journeys.find((j) => j.key === selectedKey) ?? doc.journeys[0];
  const view = selectView(journey, showReplayValidated);

  function handleSelect(key: string) {
    if (key === selectedKey) return;
    setSelectedKey(key);
    // Switching journeys restarts the walkthrough from the opening and clears
    // the replay-evidence choice, so nothing carries over misleadingly.
    setShowReplayValidated(false);
    setFlow(restartFlow());
  }

  const stage = currentStage(flow);
  const g = DEMO_STRINGS.guided;

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

      {!flow.started ? (
        <OpeningCard onStart={() => setFlow(startFlow())} />
      ) : (
        <div className="mt-6 space-y-5">
          <ProgressRail flow={flow} onJump={(i) => setFlow(goToStage(flow, i))} />

          <div>
            <p className="eyebrow">
              {stageProgressLabel(flow)} · {stage.title}
            </p>
            <p className="section-sub mt-1 max-w-[62ch]">{stage.caption}</p>
          </div>

          <div className="space-y-4" aria-live="polite">
            <StageContent
              kind={stage.id}
              view={view}
              supportsReplayToggle={isReplayToggleStage(
                flow,
                journey.supportsReplayEvidenceToggle,
              )}
              showReplayValidated={showReplayValidated}
              onToggleReplay={setShowReplayValidated}
            />
          </div>

          {isLastStage(flow) ? (
            <div
              role="note"
              className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3"
            >
              <p className="text-sm font-semibold text-ink">{g.completeTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {g.completeBody}
              </p>
            </div>
          ) : null}

          <FlowControls
            flow={flow}
            onBack={() => setFlow(prevStage(flow))}
            onNext={() => setFlow(nextStage(flow))}
            onRestart={() => setFlow(restartFlow())}
          />
        </div>
      )}

      <p className="mt-8 text-xs leading-relaxed text-faint">
        {DEMO_STRINGS.footerNote}
      </p>
    </div>
  );
}

// Pre-flow opening state: explains the walkthrough and previews the stages the
// visitor will step through, then offers a single Start action.
function OpeningCard({ onStart }: { onStart: () => void }) {
  const g = DEMO_STRINGS.guided;
  return (
    <div className="mt-6 card-elevated p-6">
      <h2 className="text-lg font-semibold text-ink">{g.openingTitle}</h2>
      <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted">
        {g.openingIntro}
      </p>
      <ol className="mt-4 flex flex-wrap gap-2" aria-label={g.railLabel}>
        {GUIDED_STAGES.map((s, i) => (
          <li
            key={s.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-surface2/50 px-2.5 py-1 text-xs text-faint"
          >
            <span className="font-mono text-[10px] text-faint">{i + 1}</span>
            {s.title}
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onStart}
        className="btn btn-primary mt-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
      >
        <Play size={15} aria-hidden="true" />
        {g.start}
      </button>
    </div>
  );
}

// Keyboard-accessible progress rail. Progress is conveyed with words, numbers,
// and an icon — never colour alone. Reached stages are buttons; upcoming stages
// are inert until the narrative reaches them.
function ProgressRail({
  flow,
  onJump,
}: {
  flow: GuidedState;
  onJump: (index: number) => void;
}) {
  const g = DEMO_STRINGS.guided;
  return (
    <ol
      className="flex flex-wrap gap-2"
      aria-label={g.railLabel}
    >
      {GUIDED_STAGES.map((s, i) => {
        const status = stageStatus(i, flow);
        const reachable = isStageReachable(i, flow);
        const isCurrent = status === "current";
        const label = `${g.stagePrefix} ${i + 1}: ${s.title} (${status})`;
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => reachable && onJump(i)}
              disabled={!reachable}
              aria-current={isCurrent ? "step" : undefined}
              aria-label={label}
              title={s.title}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-default",
                isCurrent && "border-brand/60 bg-brand/10 text-ink",
                status === "complete" &&
                  "border-accent/40 bg-accent/10 text-accent hover:border-accent/60",
                status === "upcoming" &&
                  "border-edge bg-surface2/40 text-faint",
              )}
            >
              <span
                aria-hidden="true"
                className="inline-flex h-4 w-4 items-center justify-center"
              >
                {status === "complete" ? (
                  <Check size={12} />
                ) : (
                  <span className="font-mono text-[10px]">{i + 1}</span>
                )}
              </span>
              <span className="hidden sm:inline">{s.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// Back / Next (or Finish) / Restart. Back on the first stage returns to the
// opening; Next on the last stage is disabled (the end state is explicit).
function FlowControls({
  flow,
  onBack,
  onNext,
  onRestart,
}: {
  flow: GuidedState;
  onBack: () => void;
  onNext: () => void;
  onRestart: () => void;
}) {
  const g = DEMO_STRINGS.guided;
  const last = isLastStage(flow);
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <button
        type="button"
        onClick={onBack}
        className="btn btn-ghost focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        {g.back}
      </button>
      {last ? (
        <button
          type="button"
          onClick={onRestart}
          className="btn btn-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <RotateCcw size={15} aria-hidden="true" />
          {g.restart}
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          className="btn btn-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          {g.next}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      )}
      {last ? null : (
        <button
          type="button"
          onClick={onRestart}
          className="btn btn-ghost ml-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <RotateCcw size={14} aria-hidden="true" />
          {g.restart}
        </button>
      )}
    </div>
  );
}

// Renders the single panel (or closing group) that the current stage projects.
// Every panel reads the same immutable `view`; the stage only chooses which
// beat is in focus.
function StageContent({
  kind,
  view,
  supportsReplayToggle,
  showReplayValidated,
  onToggleReplay,
}: {
  kind: GuidedStageKind;
  view: DemoPresentationView;
  supportsReplayToggle: boolean;
  showReplayValidated: boolean;
  onToggleReplay: (v: boolean) => void;
}) {
  switch (kind) {
    case "signal":
      return <JourneyNarrative view={view} />;
    case "mission":
      return <EvidenceChain view={view} />;
    case "governance":
      return <GovernanceOutcome view={view} />;
    case "recommendation":
      return <RecommendationPanel view={view} />;
    case "approval":
      return <ApprovalExecutionPanel view={view} />;
    case "audit":
      return (
        <AuditReplayPanel
          view={view}
          supportsReplayToggle={supportsReplayToggle}
          showReplayValidated={showReplayValidated}
          onToggleReplay={onToggleReplay}
        />
      );
    case "closure":
      return (
        <>
          <ProviderStatus view={view} />
          <SafetyDisclosures view={view} />
          <TechnicalDisclosure view={view} />
        </>
      );
    default:
      return null;
  }
}
