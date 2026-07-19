"use client";

// Release 2.2 — Mission Control · guided renewal-risk experience (F1.7)
// ====================================================================
// The complete renewal-risk SCREEN experience, rendered from ONE governed
// `MissionTurn`. This is the same turn the Voice and Digital Human surfaces
// consume — there is no screen-only business logic here. It is a guided mission
// NARRATIVE (AI speaks first, narrative before metrics, one recommendation
// before alternatives), never a dashboard grid.
//
// Governed principle: this component RENDERS a turn. It never re-derives state,
// verification, approval policy, or the allowed actions. Blocked / rejected /
// revision / failed turns render a governed, non-executable notice instead.
// Approval interaction and the simulated receipt land in F1.8 — here the
// approval control is presented but not yet wired.

import * as React from "react";
import {
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  CircleDashed,
  FileText,
  Layers,
  Sparkles,
  Volume2,
  Lock,
  Building2,
  ScrollText,
} from "lucide-react";
import { cx, pct } from "@/lib/format";
import { MISSION_SECTIONS } from "@/lib/missions/demo";
import { isCompletedMissionTurn } from "@/lib/missions/types";
import type { CompletedMissionTurn, GovernedMissionTurn, MissionTurn } from "@/lib/missions/types";
import { simulateApprovedActions } from "@/lib/missions/simulation";
import type { ApprovalCapture, SimulatedActionProposal } from "@/lib/missions/simulation";
import { deriveMissionPhase, missionPhaseNarrative } from "@/lib/missions/missionStatusCopy";
import { deriveMissionView } from "@/lib/missions/missionView";
import type { MissionView } from "@/lib/missions/missionView";
import {
  actionLabel,
  categoryLabel,
  checkLabel,
  evidenceRequirementLabel,
  intentLabel,
  permittedActionLabel,
  projectBusinessText,
  sourceModuleLabel,
  targetTypeLabel,
  templateLabel,
} from "@/lib/missions/missionLabels";
import { buildMissionAuditTrail } from "@/lib/missions/auditTrail";
import type { MissionAuditTrail } from "@/lib/missions/auditTrail";
import { narrativeStateLabel, MODEL_SELECTION_STATEMENT } from "@/lib/nvidia/presentation";
import { projectVoiceSummary, toSupportingEvidenceProse } from "@/lib/nvidia/narrativeProjection";
import { NVIDIA_VOICE_SUMMARY_MAX_CHARS } from "@/lib/nvidia/types";
import { groundedEvidenceCue, projectGovernedOutcome, projectMissionForPersona, type PersonaLens } from "@/lib/demo/missionProjection";
import { ApprovalPanel } from "@/components/missions/ApprovalPanel";
import { MissionAuditTrailView } from "@/components/missions/MissionAuditTrail";

// ---------------------------------------------------------------------------
// Small presentation atoms (local — no external state)
// ---------------------------------------------------------------------------

function SectionShell({
  index,
  title,
  subtitle,
  icon,
  children,
}: {
  index: number;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="relative pl-10">
      <div className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full border border-edge bg-surface2 text-[11px] font-mono text-faint">
        {index}
      </div>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex items-center">{icon}</span>
        <div>
          <h2 className="section-h text-[19px] sm:text-[20px]">{title}</h2>
          <p className="text-xs text-faint">{subtitle}</p>
        </div>
      </div>
      <div className="card p-4 sm:p-5">{children}</div>
    </section>
  );
}

function Meta({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-edge bg-surface2/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className={cx("mt-0.5 text-sm font-medium text-ink", mono && "font-mono text-xs")}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. What happened — the AI speaks first
// ---------------------------------------------------------------------------

function GroundedNarrativeIndicator({ turn }: { turn: CompletedMissionTurn }) {
  const gn = turn.groundedNarrative;
  if (!gn) return null;
  const { label, tone } = narrativeStateLabel(gn.provider, gn.fallbackUsed);
  const emphasised = tone !== "fallback";
  return (
    <div className="rounded-lg border border-edge bg-surface2/60 px-3 py-2">
      <div className="flex items-center gap-2">
        <Sparkles
          className={cx("h-3.5 w-3.5 shrink-0", emphasised ? "text-accent" : "text-faint")}
          aria-hidden="true"
        />
        <span className="text-[11px] font-medium text-muted">{label}</span>
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-faint">
          Technical evidence
        </summary>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          <Meta label="Narrative provider" value={gn.provider} mono />
          <Meta label="Narrative model" value={gn.model} mono />
          <Meta label="Validation" value={gn.validationStatus} mono />
          <Meta label="Fallback used" value={gn.fallbackUsed ? "yes" : "no"} mono />
          {typeof gn.latencyMs === "number" ? (
            <Meta label="Provider latency" value={`${gn.latencyMs} ms`} mono />
          ) : null}
          {typeof gn.attempts === "number" ? (
            <Meta label="Provider attempts" value={String(gn.attempts)} mono />
          ) : null}
          <Meta
            label="Grounded evidence refs"
            value={gn.evidenceRefs.length > 0 ? gn.evidenceRefs.join(", ") : "—"}
            mono
          />
        </div>
        {tone === "live" ? (
          <p className="mt-2 text-[10px] leading-relaxed text-faint">{MODEL_SELECTION_STATEMENT}</p>
        ) : null}
      </details>
    </div>
  );
}

function WhatHappened({ turn }: { turn: CompletedMissionTurn }) {
  const gn = turn.groundedNarrative;
  // Prefer the grounded narrative's natural business framing when present (it is
  // already evidence-validated or the safe deterministic baseline); otherwise use
  // the deterministic opening. Never re-derives a governed fact.
  const fallbackOpening = `${turn.account.canonicalName} shows signs of renewal risk. VentureOS recommends preparing focused renewal outreach and a stakeholder briefing before the next customer milestone.`;
  const opening = gn && gn.whatChanged.trim().length > 0 ? gn.whatChanged : fallbackOpening;
  // Business-facing trust cue from EXISTING grounding metadata (dynamic count).
  const evidenceCue = groundedEvidenceCue(turn);
  // Speak naturally: prefer a live, grounded model voice line; otherwise normalize
  // the persona voice line so it no longer reads as internal Memory phrasing.
  const spokenSummary = projectVoiceSummary(
    {
      personaVoiceSummary: turn.voiceSummary,
      narrativeVoiceSummary: gn?.voiceSummary ?? null,
      narrativeIsLiveGrounded: !!gn && gn.grounded && !gn.fallbackUsed,
    },
    NVIDIA_VOICE_SUMMARY_MAX_CHARS,
  );
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p className="text-[15px] leading-relaxed text-ink">{opening}</p>
      </div>
      {evidenceCue ? (
        <div className="flex items-center gap-2 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          <span className="text-xs font-medium text-ink">{evidenceCue.text}</span>
        </div>
      ) : null}
      <div className="flex items-center gap-2 rounded-lg border border-gov/25 bg-gov/5 px-3 py-2">
        <Volume2 className="h-3.5 w-3.5 shrink-0 text-gov-bright" aria-hidden="true" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-gov-bright">Voice summary</span>
        <span className="text-xs italic text-muted">{spokenSummary}</span>
      </div>
      <GroundedNarrativeIndicator turn={turn} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Why this account is at risk — composed narrative, before the metrics
// ---------------------------------------------------------------------------

function WhyAtRisk({ turn }: { turn: CompletedMissionTurn }) {
  const gn = turn.groundedNarrative;
  // A live/grounded (or safe fallback) risk explanation reads as natural business
  // language; surface it as the lead paragraph. Evidence chips below are unchanged,
  // so every reference is still preserved.
  const riskLead = gn && gn.riskExplanation.trim().length > 0 ? gn.riskExplanation : null;
  const segments = turn.personaResponse.segments;
  if (segments.length === 0) {
    return (
      <div className="space-y-3">
        {riskLead && <p className="text-sm leading-relaxed text-ink">{riskLead}</p>}
        <p className="text-sm text-muted">{toSupportingEvidenceProse(turn.personaResponse.voiceSummary)}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {riskLead && <p className="text-sm leading-relaxed text-ink">{riskLead}</p>}
      <ol className="space-y-3">
        {segments.map((s) => (
          <li key={s.recordId} className="border-l-2 border-accent/30 pl-3">
            <p className="text-sm leading-relaxed text-ink" title={s.text}>{toSupportingEvidenceProse(s.text)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="chip text-[10px] uppercase" title={s.category}>
                {categoryLabel(s.category)}
              </span>
              <span className="chip text-[10px]">{s.confidenceBand}</span>
              {s.citations.map((c) => (
                <span key={c.recordId} className="chip text-[10px]" title={c.ref}>
                  {c.label}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Unified customer context
// ---------------------------------------------------------------------------

function UnifiedContext({ turn }: { turn: CompletedMissionTurn }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Meta label="Account" value={turn.account.canonicalName} />
      <Meta label="VentureOS id" value={turn.account.ventureOsId} mono />
      <Meta label="Review type" value={intentLabel(turn.intent)} />
      <Meta label="Mission" value={templateLabel(turn.selectedTemplateId)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Confidence, evidence & provenance
// ---------------------------------------------------------------------------

function EvidenceProvenance({ turn }: { turn: CompletedMissionTurn }) {
  const matchConfidence = turn.recommendation.confidenceScore;
  const checks = turn.verification.checks;
  const passedChecks = checks.filter((c) => c.passed).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-edge bg-surface2/60 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-faint">Account match confidence</div>
          <div className="mt-0.5 text-2xl font-semibold text-accent">{pct(matchConfidence)}</div>
        </div>
        <div className="rounded-lg border border-edge bg-surface2/60 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-faint">Governance checks</div>
          <div className="mt-0.5 text-2xl font-semibold text-gov-bright">
            {passedChecks} of {checks.length} <span className="text-sm font-medium text-muted">passed</span>
          </div>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-faint">
        Account match confidence reflects deterministic identity resolution across the source systems — how sure we
        are this is the right customer. It is not a prediction of renewal loss.
      </p>
      <div>
        <div className="panel-title mb-2">Mandatory evidence</div>
        <ul className="space-y-1.5">
          {turn.evidence.map((e) => (
            <li key={e.recordId} className="flex items-center gap-2 text-sm text-muted">
              <FileText className="h-3.5 w-3.5 shrink-0 text-faint" />
              <span className="text-ink" title={e.category}>{categoryLabel(e.category)}</span>
              <span className="text-faint" title={e.summary}>· {evidenceRequirementLabel(e.summary)}</span>
              <span className="chip ml-auto text-[10px]" title={e.source}>{sourceModuleLabel(e.source)}</span>
            </li>
          ))}
        </ul>
      </div>
      {turn.personaResponse.citations.length > 0 && (
        <div>
          <div className="panel-title mb-2">Provenance</div>
          <div className="flex flex-wrap gap-1.5">
            {turn.personaResponse.citations.map((c) => (
              <span key={c.recordId} className="chip text-[10px]" title={`${c.sourceModule} · ${c.ref}`}>
                {sourceModuleLabel(c.sourceModule)} · {c.sourceQuality}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Recommended renewal mission — one mission, before alternatives
// ---------------------------------------------------------------------------

function RecommendedMission({ turn }: { turn: CompletedMissionTurn }) {
  const def = turn.missionDefinition;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="chip border-brand/40 bg-brand/10 text-brand-bright"
          title={turn.selectedTemplateId}
        >
          {templateLabel(turn.selectedTemplateId)}
        </span>
        <span className="chip text-[10px]" title={turn.recommendation.actionType}>
          {actionLabel(turn.recommendation.actionType)}
        </span>
        {def && <span className="chip text-[10px]">risk: {def.riskLevel}</span>}
      </div>
      {def ? (
        <>
          <p className="text-sm leading-relaxed text-ink" title={def.objective}>{projectBusinessText(def.objective)}</p>
          <div>
            <div className="panel-title mb-1.5">Success criteria</div>
            <ul className="space-y-1">
              {def.successCriteria.map((c) => (
                <li key={c.criterionId} className="flex items-start gap-2 text-sm text-muted">
                  <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
                  <span title={c.description}>{projectBusinessText(c.description)}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">Mission recommended for {turn.account.canonicalName}.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Proposed actions
// ---------------------------------------------------------------------------

function ProposedActions({ turn }: { turn: CompletedMissionTurn }) {
  return (
    <ul className="space-y-2">
      {turn.permittedActions.map((a) => (
        <li key={a} className="flex items-center gap-2 rounded-lg border border-edge bg-surface2/50 px-3 py-2">
          <Layers className="h-3.5 w-3.5 shrink-0 text-brand" />
          <span className="text-sm text-ink" title={a}>{permittedActionLabel(a)}</span>
          <span className="chip ml-auto border-edge bg-surface2 text-[10px] text-faint">
            Proposed · will not be sent
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// 7. Verification — checked before you are asked
// ---------------------------------------------------------------------------

function Verification({ turn }: { turn: CompletedMissionTurn }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-accent" />
        <span className="text-sm font-medium text-ink">{turn.verificationSummary}</span>
      </div>
      <ul className="space-y-1">
        {turn.verification.checks.map((c) => (
          <li key={c.name} className="flex items-center gap-2 text-sm">
            {c.passed ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-risk" />
            )}
            <span className="text-ink" title={c.name}>{checkLabel(c.name)}</span>
            <span className="text-faint">· {c.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 9. Simulated execution — nothing leaves the sandbox
// ---------------------------------------------------------------------------

function SimulatedExecution({
  capture,
  proposals,
}: {
  capture: ApprovalCapture | null;
  proposals: SimulatedActionProposal[];
}) {
  if (!capture || capture.outcome !== "approved") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-edge bg-surface2/40 px-3 py-3">
        <CircleDashed className="h-4 w-4 shrink-0 text-faint" />
        <span className="text-sm text-muted">
          Runs only after approval. Every action is simulated — nothing leaves the controlled sandbox.
        </span>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-accent" />
        <span className="text-sm text-ink">
          {proposals.length} action{proposals.length === 1 ? "" : "s"} simulated for the approved mission.
        </span>
        <span className="chip ml-auto border-accent/30 bg-accent/10 text-[10px] text-accent">Completed in sandbox</span>
      </div>
      <ul className="space-y-2">
        {proposals.map((p) => (
          <li key={p.receiptId} className="rounded-lg border border-edge bg-surface2/50 p-3">
            <div className="flex items-center gap-2">
              <span className="chip text-[10px] uppercase" title={p.targetType}>{targetTypeLabel(p.targetType)}</span>
              <span className="text-sm font-medium text-ink">{p.title}</span>
              <span className="chip ml-auto border-accent/30 bg-accent/10 text-[10px] text-accent">Simulated</span>
            </div>
            <p className="mt-1.5 text-sm text-muted">{p.summary}</p>
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <div className="rounded border border-edge bg-base px-2 py-1.5 text-xs text-faint">
                <span className="text-[10px] uppercase tracking-wider">before</span>
                <div className="text-muted">{p.before}</div>
              </div>
              <div className="rounded border border-accent/25 bg-accent/5 px-2 py-1.5 text-xs">
                <span className="text-[10px] uppercase tracking-wider text-faint">after</span>
                <div className="text-ink">{p.after}</div>
              </div>
            </div>
            <div className="mt-1.5 font-mono text-[11px] text-faint">receipt {p.receiptId}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 9. Outcome — driven by ONE authoritative mission view (never turn.outcome.*)
// ---------------------------------------------------------------------------

const STATE_TONE: Record<MissionView["missionStateTone"], string> = {
  gov: "border-gov/40 bg-gov/10 text-gov-bright",
  accent: "border-accent/40 bg-accent/15 text-accent",
  risk: "border-risk/40 bg-risk/15 text-risk",
  muted: "border-line bg-surface2 text-muted",
};

function Outcome({ turn, view }: { turn: CompletedMissionTurn; view: MissionView }) {
  const projected = projectGovernedOutcome(view);
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink">{view.outcomeHeadline}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-gov/30 bg-gov/5 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-faint">System outcome</div>
          <p className="mt-1 text-[13px] text-ink">{projected.systemOutcome}</p>
        </div>
        <div className="rounded-lg border border-edge bg-surface2/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-faint">Business outcome</div>
          <p className="mt-1 text-[13px] text-ink">{projected.businessOutcome}</p>
        </div>
      </div>
      {projected.supportingLines.length > 0 ? (
        <ul className="space-y-1">
          {projected.supportingLines.map((line) => (
            <li key={line} className="flex items-center gap-2 text-xs text-muted">
              <CircleDashed className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-edge bg-surface2/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-faint">Mission state</div>
          <span
            className={cx(
              "mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
              STATE_TONE[view.missionStateTone],
            )}
          >
            {view.missionStateLabel}
          </span>
        </div>
        <Meta label="Mission id" value={turn.missionId} mono />
        <Meta label="Audit reference" value={turn.auditRef} mono />
      </div>
      <p className="text-xs text-faint">{view.outcomeNotice}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 10. Supporting customer context & audit (progressively disclosed)
// ---------------------------------------------------------------------------

function SupportingContext({
  turn,
  trail,
  view,
}: {
  turn: CompletedMissionTurn;
  trail: MissionAuditTrail;
  view: MissionView;
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="panel-title mb-2">Unified customer context</div>
        <UnifiedContext turn={turn} />
      </div>
      <PersonaProjections turn={turn} view={view} />
      <MissionAuditTrailView trail={trail} />
    </div>
  );
}

// One governed mission, read through each persona lens. This is a READ-ONLY
// projection of the SAME turn — no second source of truth, no Manager lens.
const PERSONA_LENSES: readonly { lens: PersonaLens; label: string }[] = [
  { lens: "seller", label: "Seller" },
  { lens: "executive", label: "Executive" },
  { lens: "operations", label: "Operations" },
];

function PersonaProjections({ turn, view }: { turn: CompletedMissionTurn; view: MissionView }) {
  return (
    <div>
      <div className="panel-title mb-2">The same mission, read by each persona</div>
      <p className="mb-3 text-xs text-muted">
        One governed Curefoods mission, projected read-only through each persona lens. Executive and
        Operations views are Production-Partial projections — they add no new facts and take no action.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {PERSONA_LENSES.map(({ lens, label }) => {
          const p = projectMissionForPersona(turn, view, lens);
          return (
            <div key={lens} className="rounded-lg border border-edge bg-surface2/60 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-faint">{label}</span>
                {lens !== "seller" ? (
                  <span className="rounded-full border border-line px-1.5 py-0.5 text-[9px] text-muted">
                    Production-Partial
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[12px] font-medium text-ink">{p.headline}</p>
              <ul className="mt-1.5 space-y-1">
                {p.facts.map((f) => (
                  <li key={f} className="text-[11px] leading-snug text-muted">
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Governed (non-executable) outcomes render a governed notice — never a mission
// ---------------------------------------------------------------------------

function GovernedNotice({ turn }: { turn: GovernedMissionTurn }) {
  const phaseCopy = missionPhaseNarrative(deriveMissionPhase(turn, null));
  return (
    <div className="card-premium mx-auto max-w-2xl p-6">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-gov-bright" />
        <h2 className="section-h text-[20px]">Mission held by governance</h2>
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-muted">
          {phaseCopy.label}
        </span>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-muted">{turn.governedNarrative}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Meta label="Status" value={turn.status} />
        <Meta label="Mission id" value={turn.missionId} mono />
        <Meta label="Audit reference" value={turn.auditRef || "—"} mono />
      </div>
      <p className="mt-4 text-[11px] text-faint">
        No executable action is available for this outcome. This is not a failure of the surface — the mission was
        not cleared to proceed.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mission Control shell
// ---------------------------------------------------------------------------

const SECTION_ICON: Record<string, React.ReactNode> = {
  "what-happened": <AlertTriangle className="h-4 w-4 text-risk" />,
  "recommended-mission": <Layers className="h-4 w-4 text-brand" />,
  "why-at-risk": <Sparkles className="h-4 w-4 text-accent" />,
  evidence: <FileText className="h-4 w-4 text-faint" />,
  "proposed-actions": <Layers className="h-4 w-4 text-brand" />,
  verification: <ShieldCheck className="h-4 w-4 text-accent" />,
  approval: <Lock className="h-4 w-4 text-gov-bright" />,
  "simulated-execution": <CircleDashed className="h-4 w-4 text-faint" />,
  outcome: <ScrollText className="h-4 w-4 text-muted" />,
  "supporting-context": <Building2 className="h-4 w-4 text-cyan" />,
};

interface SectionCtx {
  turn: CompletedMissionTurn;
  capture: ApprovalCapture | null;
  proposals: SimulatedActionProposal[];
  trail: MissionAuditTrail;
  view: MissionView;
  onDecision: (capture: ApprovalCapture | null) => void;
}

function sectionBody(id: string, ctx: SectionCtx): React.ReactNode {
  const { turn } = ctx;
  switch (id) {
    case "what-happened":
      return <WhatHappened turn={turn} />;
    case "recommended-mission":
      return <RecommendedMission turn={turn} />;
    case "why-at-risk":
      return <WhyAtRisk turn={turn} />;
    case "evidence":
      return <EvidenceProvenance turn={turn} />;
    case "proposed-actions":
      return <ProposedActions turn={turn} />;
    case "verification":
      return <Verification turn={turn} />;
    case "approval":
      return <ApprovalPanel turn={turn} capture={ctx.capture} onDecision={ctx.onDecision} />;
    case "simulated-execution":
      return <SimulatedExecution capture={ctx.capture} proposals={ctx.proposals} />;
    case "outcome":
      return <Outcome turn={turn} view={ctx.view} />;
    case "supporting-context":
      return <SupportingContext turn={turn} trail={ctx.trail} view={ctx.view} />;
    default:
      return null;
  }
}

/** The complete renewal-risk Mission Control experience for one governed turn. */
export function MissionControl({ turn }: { turn: MissionTurn }) {
  const [capture, setCapture] = React.useState<ApprovalCapture | null>(null);

  if (!isCompletedMissionTurn(turn)) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <GovernedNotice turn={turn} />
      </div>
    );
  }

  const proposals =
    capture && capture.outcome === "approved" ? simulateApprovedActions(turn, capture) : [];
  const trail = buildMissionAuditTrail({ turn, capture, proposals });
  const view = deriveMissionView(turn, capture, proposals);
  const ctx: SectionCtx = { turn, capture, proposals, trail, view, onDecision: setCapture };
  const phaseCopy = missionPhaseNarrative(view.phase);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <header className="mb-8">
        <div className="mb-1 flex items-center gap-2">
          <span className="eyebrow">Mission Control · Renewal risk</span>
          <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-muted">
            {phaseCopy.label}
          </span>
        </div>
        <h1 className="section-h text-[26px] sm:text-[30px]">{turn.account.canonicalName}</h1>
        <p className="section-sub mt-1">{phaseCopy.headline}</p>
      </header>
      <div className="space-y-8">
        {MISSION_SECTIONS.map((s) => (
          <SectionShell
            key={s.id}
            index={s.index}
            title={s.title}
            subtitle={s.subtitle}
            icon={SECTION_ICON[s.id]}
          >
            {sectionBody(s.id, ctx)}
          </SectionShell>
        ))}
      </div>
    </div>
  );
}
