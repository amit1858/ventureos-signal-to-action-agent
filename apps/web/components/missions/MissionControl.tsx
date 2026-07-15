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
import { buildMissionAuditTrail } from "@/lib/missions/auditTrail";
import type { MissionAuditTrail } from "@/lib/missions/auditTrail";
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

function WhatHappened({ turn }: { turn: CompletedMissionTurn }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p className="text-[15px] leading-relaxed text-ink">{turn.signalNarrative}</p>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-gov/25 bg-gov/5 px-3 py-2">
        <Volume2 className="h-3.5 w-3.5 shrink-0 text-gov-bright" />
        <span className="text-xs italic text-muted">{turn.voiceSummary}</span>
        <span className="chip ml-auto shrink-0 text-[10px]">shared voice line</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Why this account is at risk — composed narrative, before the metrics
// ---------------------------------------------------------------------------

function WhyAtRisk({ turn }: { turn: CompletedMissionTurn }) {
  const segments = turn.personaResponse.segments;
  if (segments.length === 0) {
    return <p className="text-sm text-muted">{turn.personaResponse.voiceSummary}</p>;
  }
  return (
    <ol className="space-y-3">
      {segments.map((s) => (
        <li key={s.recordId} className="border-l-2 border-accent/30 pl-3">
          <p className="text-sm leading-relaxed text-ink">{s.text}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="chip text-[10px] uppercase">{s.category}</span>
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
      <Meta label="Intent" value={turn.intent} />
      <Meta label="Template" value={turn.selectedTemplateId} mono />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Confidence, evidence & provenance
// ---------------------------------------------------------------------------

function EvidenceProvenance({ turn }: { turn: CompletedMissionTurn }) {
  const confidence = turn.recommendation.confidenceScore;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="text-2xl font-semibold text-accent">{pct(confidence)}</div>
        <div className="text-xs text-faint">
          governance <span className="text-muted">{turn.recommendation.governanceStatus}</span>
        </div>
      </div>
      <div>
        <div className="panel-title mb-2">Mandatory evidence</div>
        <ul className="space-y-1.5">
          {turn.evidence.map((e) => (
            <li key={e.recordId} className="flex items-center gap-2 text-sm text-muted">
              <FileText className="h-3.5 w-3.5 shrink-0 text-faint" />
              <span className="text-ink">{e.category}</span>
              <span className="text-faint">· {e.summary}</span>
              <span className="chip ml-auto text-[10px]">{e.source}</span>
            </li>
          ))}
        </ul>
      </div>
      {turn.personaResponse.citations.length > 0 && (
        <div>
          <div className="panel-title mb-2">Provenance</div>
          <div className="flex flex-wrap gap-1.5">
            {turn.personaResponse.citations.map((c) => (
              <span key={c.recordId} className="chip text-[10px]" title={c.ref}>
                {c.sourceModule} · {c.sourceQuality}
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
      <div className="flex items-center gap-2">
        <span className="chip border-brand/40 bg-brand/10 text-brand-bright">
          {turn.recommendation.actionType}
        </span>
        <span className="chip text-[10px]">priority 1</span>
        {def && <span className="chip text-[10px]">risk: {def.riskLevel}</span>}
      </div>
      {def ? (
        <>
          <p className="text-sm leading-relaxed text-ink">{def.objective}</p>
          <p className="text-xs italic text-faint">{def.rationale}</p>
          <div>
            <div className="panel-title mb-1.5">Success criteria</div>
            <ul className="space-y-1">
              {def.successCriteria.map((c) => (
                <li key={c.criterionId} className="flex items-start gap-2 text-sm text-muted">
                  <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
                  <span>{c.description}</span>
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
          <span className="font-mono text-xs text-ink">{a}</span>
          <span className="chip ml-auto border-accent/30 bg-accent/10 text-[10px] text-accent">simulated</span>
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
            <span className="font-mono text-xs text-ink">{c.name}</span>
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
        <span className="chip ml-auto border-accent/30 bg-accent/10 text-[10px] text-accent">simulated=true</span>
      </div>
      <ul className="space-y-2">
        {proposals.map((p) => (
          <li key={p.receiptId} className="rounded-lg border border-edge bg-surface2/50 p-3">
            <div className="flex items-center gap-2">
              <span className="chip text-[10px] uppercase">{p.targetType.replace("_", " ")}</span>
              <span className="text-sm font-medium text-ink">{p.title}</span>
              <span className="chip ml-auto border-accent/30 bg-accent/10 text-[10px] text-accent">simulated</span>
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
// 10. Outcome & audit trail
// ---------------------------------------------------------------------------

function OutcomeAudit({ turn, trail }: { turn: CompletedMissionTurn; trail: MissionAuditTrail }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink">{turn.outcome.headline}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Meta label="Mission state" value={turn.outcome.state} mono />
        <Meta label="Mission id" value={turn.missionId} mono />
        <Meta label="Audit reference" value={turn.auditRef} mono />
      </div>
      <MissionAuditTrailView trail={trail} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Governed (non-executable) outcomes render a governed notice — never a mission
// ---------------------------------------------------------------------------

function GovernedNotice({ turn }: { turn: GovernedMissionTurn }) {
  return (
    <div className="card-premium mx-auto max-w-2xl p-6">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-gov-bright" />
        <h2 className="section-h text-[20px]">Mission held by governance</h2>
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
  "why-at-risk": <Sparkles className="h-4 w-4 text-accent" />,
  "unified-context": <Building2 className="h-4 w-4 text-cyan" />,
  evidence: <FileText className="h-4 w-4 text-faint" />,
  "recommended-mission": <Layers className="h-4 w-4 text-brand" />,
  "proposed-actions": <Layers className="h-4 w-4 text-brand" />,
  verification: <ShieldCheck className="h-4 w-4 text-accent" />,
  approval: <Lock className="h-4 w-4 text-gov-bright" />,
  "simulated-execution": <CircleDashed className="h-4 w-4 text-faint" />,
  "outcome-audit": <ScrollText className="h-4 w-4 text-muted" />,
};

interface SectionCtx {
  turn: CompletedMissionTurn;
  capture: ApprovalCapture | null;
  proposals: SimulatedActionProposal[];
  trail: MissionAuditTrail;
  onDecision: (capture: ApprovalCapture | null) => void;
}

function sectionBody(id: string, ctx: SectionCtx): React.ReactNode {
  const { turn } = ctx;
  switch (id) {
    case "what-happened":
      return <WhatHappened turn={turn} />;
    case "why-at-risk":
      return <WhyAtRisk turn={turn} />;
    case "unified-context":
      return <UnifiedContext turn={turn} />;
    case "evidence":
      return <EvidenceProvenance turn={turn} />;
    case "recommended-mission":
      return <RecommendedMission turn={turn} />;
    case "proposed-actions":
      return <ProposedActions turn={turn} />;
    case "verification":
      return <Verification turn={turn} />;
    case "approval":
      return <ApprovalPanel turn={turn} capture={ctx.capture} onDecision={ctx.onDecision} />;
    case "simulated-execution":
      return <SimulatedExecution capture={ctx.capture} proposals={ctx.proposals} />;
    case "outcome-audit":
      return <OutcomeAudit turn={turn} trail={ctx.trail} />;
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
  const ctx: SectionCtx = { turn, capture, proposals, trail, onDecision: setCapture };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <header className="mb-8">
        <div className="eyebrow mb-1">Mission Control · Renewal risk</div>
        <h1 className="section-h text-[26px] sm:text-[30px]">{turn.account.canonicalName}</h1>
        <p className="section-sub mt-1">{turn.outcome.headline}</p>
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
