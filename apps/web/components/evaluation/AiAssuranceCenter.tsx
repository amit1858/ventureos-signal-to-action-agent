"use client";

import * as React from "react";
import { BadgeCheck, Cpu, ShieldCheck, UserCheck, AlertTriangle, MinusCircle } from "lucide-react";

import { cx } from "@/lib/format";
import { Card } from "@/components/ui";
import {
  type AiAssuranceCenterDoc,
  type AdvisoryDimension,
  BAND_LABELS,
  DIMENSION_SOURCE_LABEL,
  humanizeDimension,
} from "@/lib/assurance/aiAssuranceCenter";

// Colour is never the only signal — every state also carries a word.
type Tone = "good" | "warn" | "muted" | "info";
const TONE: Record<Tone, string> = {
  good: "border-accent/35 bg-accent/10 text-accent",
  warn: "border-amber/40 bg-amber/10 text-amber",
  muted: "border-edge bg-surface2/70 text-faint",
  info: "border-brand/35 bg-brand/10 text-brand-bright",
};

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

// ============================================================================
// AI Assurance summary band — three truthful states. Deterministic is
// authoritative; NVIDIA is advisory; human review derives from disagreement.
// ============================================================================

export function AiAssuranceBand({ doc }: { doc: AiAssuranceCenterDoc }) {
  const { band } = doc;
  const detTone: Tone = band.deterministicGovernance === "PASS" ? "good" : "warn";
  const advTone: Tone =
    band.nvidiaAdvisory === "PASS" ? "good" : band.nvidiaAdvisory === "CONCERN" ? "warn" : "muted";
  const revTone: Tone = band.humanReview === "NOT_REQUIRED" ? "good" : "warn";

  const tiles: {
    key: string;
    icon: React.ReactNode;
    title: string;
    value: string;
    tone: Tone;
    caption: string;
  }[] = [
    {
      key: "det",
      icon: <ShieldCheck size={16} className="text-accent" />,
      title: "Deterministic Governance",
      value: BAND_LABELS.deterministic[band.deterministicGovernance],
      tone: detTone,
      caption: "Authoritative",
    },
    {
      key: "adv",
      icon: <Cpu size={16} className="text-brand-bright" />,
      title: "NVIDIA Advisory Evaluation",
      value: BAND_LABELS.advisory[band.nvidiaAdvisory],
      tone: advTone,
      caption:
        band.nvidiaAdvisory === "UNAVAILABLE"
          ? "Advisory · no live proof"
          : `Advisory · ${band.provider || "NVIDIA"}`,
    },
    {
      key: "rev",
      icon: <UserCheck size={16} className="text-accent" />,
      title: "Human Review",
      value: BAND_LABELS.review[band.humanReview],
      tone: revTone,
      caption: "Derived from disagreement",
    },
  ];

  return (
    <Card className="border-brand/20 bg-gradient-to-br from-brand/[0.06] to-transparent p-5">
      <div className="mb-3 flex items-center gap-2">
        <BadgeCheck size={16} className="text-brand-bright" />
        <span className="panel-title">AI Assurance</span>
        <span className="text-[11px] text-faint">
          Deterministic decides · NVIDIA advises · humans approve
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.key} className="rounded-xl border border-edge bg-base/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[12px] font-medium text-muted">
                {t.icon}
                {t.title}
              </span>
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <Chip tone={t.tone}>{t.value}</Chip>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-faint">{t.caption}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        NVIDIA is advisory only. It never approves, executes, or overrides a governed verdict; the
        deterministic result is authoritative.
      </p>
    </Card>
  );
}

// ============================================================================
// Independent AI Evaluation — provider trace + the seven advisory dimensions +
// disagreement evidence. Read-only; no raw model output, no prompts, no secrets.
// ============================================================================

function dimensionTone(d: AdvisoryDimension): Tone {
  if (d.source === "not_evaluated") return "muted";
  if (d.verdict === "acceptable") return "good";
  if (d.verdict === "concern") return "warn";
  return "warn";
}

// A short, honest outcome interpretation for a probe result.
function outcomeNote(d: AdvisoryDimension): string {
  if (d.source === "not_evaluated") return "No synthetic scenario in this dataset.";
  if (d.verdict === "acceptable") return "Grounded, policy-safe answer.";
  // Low advisory score on an adversarial probe is the correct, desired outcome.
  if (d.deterministicResult === "FAIL") return "Bad answer correctly flagged (advisory agrees).";
  return "Advisory flags a concern → human review (deterministic gate held).";
}

function TraceRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="text-[12px] font-medium text-ink">{value}</span>
    </div>
  );
}

export function IndependentAiEvaluation({ doc }: { doc: AiAssuranceCenterDoc }) {
  const { liveProof, reference, dimensions } = doc;

  return (
    <div className="space-y-4">
      {/* Provider trace summary */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Cpu size={16} className="text-brand-bright" />
          <span className="panel-title">Provider trace</span>
          <Chip tone="info">Advisory only</Chip>
        </div>
        {liveProof ? (
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div className="divide-y divide-edge/60">
              <TraceRow label="Provider" value={liveProof.providerLabel} />
              <TraceRow label="Model" value={liveProof.model} />
              <TraceRow label="Rubric version" value={liveProof.rubricVersion} />
              <TraceRow label="Prompt version" value={liveProof.promptVersion} />
              <TraceRow label="Dataset" value={liveProof.datasetVersion} />
              <TraceRow label="Evaluated at" value={liveProof.capturedAt} />
            </div>
            <div className="divide-y divide-edge/60">
              <TraceRow label="Scenarios" value={liveProof.scenarioCount} />
              <TraceRow label="Successful assessments" value={liveProof.scored} />
              <TraceRow label="Provider failures" value={liveProof.providerFailures} />
              <TraceRow label="Contract failures" value={liveProof.contractFailures} />
              <TraceRow label="Disagreements" value={liveProof.disagreementCount} />
              <TraceRow
                label="Review suggested / required"
                value={`${liveProof.reviewSuggestedCount} / ${liveProof.reviewRequiredCount}`}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-edge bg-surface2/50 p-3 text-[13px] text-muted">
            <AlertTriangle size={15} className="text-amber" />
            NVIDIA advisory evaluation is unavailable — no live proof is present. The deterministic
            result stands on its own.
          </div>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-faint">
          {reference.note}
        </p>
      </Card>

      {/* Seven advisory dimensions */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck size={16} className="text-accent" />
          <span className="panel-title">Advisory dimensions</span>
          <span className="text-[11px] text-faint">Seven dimensions mapped to governed gates</span>
        </div>
        <div className="space-y-2.5">
          {dimensions.map((d) => {
            const tone = dimensionTone(d);
            const sourceTone: Tone =
              d.source === "live_nvidia" ? "info" : d.source === "reference_offline" ? "muted" : "muted";
            return (
              <div
                key={d.advisoryDimension}
                className="rounded-xl border border-edge bg-surface2/40 p-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink">
                        {humanizeDimension(d.advisoryDimension)}
                      </span>
                      <Chip tone={sourceTone}>{DIMENSION_SOURCE_LABEL[d.source]}</Chip>
                    </div>
                    <p className="mt-1 text-[11px] text-faint">
                      Maps to {d.deterministicDimensions.map(humanizeDimension).join(", ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.score != null ? (
                      <span className="font-mono text-[12px] text-ink">
                        {d.score}/{d.maxScore}
                      </span>
                    ) : (
                      <MinusCircle size={15} className="text-faint" aria-label="not scored" />
                    )}
                    {d.verdict ? (
                      <Chip tone={tone}>{d.verdict}</Chip>
                    ) : (
                      <Chip tone="muted">not evaluated</Chip>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted">{outcomeNote(d)}</p>
                {d.agreement === "disagreement" ? (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber/40 bg-amber/10 px-2 py-0.5 text-[10px] font-medium text-amber">
                    <AlertTriangle size={11} /> Advisory disagrees · human review
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
