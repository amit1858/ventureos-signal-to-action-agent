// Manager Coaching Curefoods Slice — read-only Manager experience
// ===============================================================
// One focused Manager experience that answers "Where should I intervene?" for
// the SAME governed Curefoods renewal mission already in Production. It is
// read-only over every governed fact: it reads the seller-completed mission,
// projects it through the Manager lens, and renders one deterministic coaching
// recommendation + a 15-minute intervention plan.
//
// The ONLY mutable state is a client-only, simulated manager review status
// (not_reviewed -> reviewed -> simulated_intervention_assigned) persisted in
// localStorage. It sends no notification, changes no CRM record, and never
// mutates the mission, approval, simulation, audit, or ledger.
//
// This is intentionally NOT a manager dashboard: one seller, one account, one
// mission, one recommendation.

"use client";

import * as React from "react";
import {
  ShieldCheck,
  UserRound,
  Target,
  ClipboardCheck,
  ListChecks,
  HelpCircle,
  Link2,
  CheckCircle2,
  FlaskConical,
  GitBranch,
  Info,
} from "lucide-react";
import { cx } from "@/lib/format";
import { reconstructSellerCompletedMission } from "@/lib/manager/sellerCompletedMission";
import {
  buildManagerMissionContext,
  type ManagerMissionContext,
} from "@/lib/manager/managerMissionContext";
import {
  buildCoachingRecommendation,
  buildFifteenMinuteIntervention,
} from "@/lib/manager/coachingRecommendation";
import {
  loadManagerCoachingState,
  markReviewed,
  assignSimulatedIntervention,
  subscribeManagerCoaching,
  type ManagerCoachingStatus,
} from "@/lib/manager/coachingReviewState";
import {
  MANAGER_SCENARIO_LABEL,
  MANAGER_SCENARIO_DISCLAIMER,
  MANAGER_CONTINUITY_LABEL,
} from "@/lib/manager/managerScenarioCopy";

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "brand" | "sim" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded border px-1.5 py-[2px] text-[10px] font-medium uppercase tracking-wider",
        tone === "brand" && "border-brand/40 bg-brand/10 text-brand-bright",
        tone === "sim" && "border-amber/40 bg-amber/10 text-amber-700",
        tone === "muted" && "border-edge bg-surface2 text-faint",
      )}
    >
      {children}
    </span>
  );
}

function Card({
  icon,
  title,
  label,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  label?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-edge bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-brand-bright">{icon}</span>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
        </div>
        {label}
      </div>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-[13px] leading-snug text-muted">
          <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-brand/70" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// 1. Guided Demo status
// ---------------------------------------------------------------------------

function FeatureBranchStatus() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber/30 bg-amber/[0.06] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <GitBranch size={15} className="text-amber-700" />
        <span className="text-[13px] font-semibold text-amber-700">{MANAGER_SCENARIO_LABEL}</span>
        <span className="text-[13px] text-muted">
          Manager Coaching Curefoods slice — not part of the Production persona navigation.
        </span>
        <Chip tone="brand">Deterministic governed demo</Chip>
      </div>
      <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-amber-100/80">
        <Info size={13} className="mt-[2px] shrink-0 text-amber-700" />
        {MANAGER_SCENARIO_DISCLAIMER} Mission Control holds the live, session-local mission and may still be
        awaiting approval.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Manager briefing hero
// ---------------------------------------------------------------------------

function ManagerBriefingHero({ ctx }: { ctx: ManagerMissionContext }) {
  return (
    <section className="rounded-xl border border-brand/30 bg-gradient-to-br from-brand/[0.08] to-transparent p-5">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheck size={16} className="text-brand-bright" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-faint">
          {ctx.managerLabel} · Where should I intervene?
        </span>
      </div>
      <h1 className="text-xl font-semibold leading-tight text-ink">
        One seller needs your attention today.
      </h1>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
        The <span className="text-ink">{ctx.sellerLabel}</span> on{" "}
        <span className="text-ink">{ctx.accountName}</span> has completed the governed renewal
        mission’s internal preparation. The business outcome is still awaiting an external response —
        a focused coaching conversation is the next best step.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip tone="muted">
          <UserRound size={11} /> {ctx.sellerLabel} · presentation-only demo context
        </Chip>
        <Chip tone="muted">{ctx.accountName}</Chip>
        <Chip tone="muted">{ctx.missionId}</Chip>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 3 + 4. Recommendation + reason
// ---------------------------------------------------------------------------

function CoachingRecommendationCard({ title, focus }: { title: string; focus: string }) {
  return (
    <Card
      icon={<Target size={16} />}
      title="Coaching recommendation"
      label={<Chip tone="brand">focus · {focus}</Chip>}
    >
      <p className="text-[15px] font-medium text-ink">{title}</p>
    </Card>
  );
}

function CoachingReasonCard({ reason }: { reason: readonly string[] }) {
  return (
    <Card icon={<Info size={16} />} title="Why coach this now">
      <BulletList items={reason} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 5. 15-minute intervention
// ---------------------------------------------------------------------------

function FifteenMinuteInterventionCard({
  ctx,
}: {
  ctx: ManagerMissionContext;
}) {
  const plan = React.useMemo(() => buildFifteenMinuteIntervention(ctx), [ctx]);
  const blocks: Array<{ icon: React.ReactNode; heading: string; items: readonly string[] }> = [
    { icon: <ListChecks size={14} />, heading: "What to discuss", items: plan.whatToDiscuss },
    { icon: <Info size={14} />, heading: "Why it matters", items: plan.whyItMatters },
    { icon: <ClipboardCheck size={14} />, heading: "What good preparation looks like", items: plan.whatGoodLooksLike },
    { icon: <HelpCircle size={14} />, heading: "What remains unknown", items: plan.whatRemainsUnknown },
  ];
  return (
    <Card
      icon={<ClipboardCheck size={16} />}
      title="Suggested 15-minute intervention"
      label={<Chip tone="muted">{plan.durationMinutes} min</Chip>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {blocks.map((b) => (
          <div key={b.heading}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink">
              <span className="text-brand-bright">{b.icon}</span>
              {b.heading}
            </div>
            <BulletList items={b.items} />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 6. Mission continuity strip
// ---------------------------------------------------------------------------

function MissionContinuityStrip({ ctx }: { ctx: ManagerMissionContext }) {
  const rows: Array<[string, string]> = [
    ["Seller", ctx.sellerLabel],
    ["Account", `${ctx.accountName} (${ctx.accountId})`],
    ["Mission", ctx.missionId],
    ["Recommendation", ctx.recommendationId],
    ["Template", ctx.selectedTemplateId],
    ["Mission state", ctx.missionState],
    ["Audit reference", ctx.auditRef],
  ];
  return (
    <Card
      icon={<Link2 size={16} />}
      title="Mission continuity"
      label={<Chip tone="muted">{MANAGER_CONTINUITY_LABEL}</Chip>}
    >
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <dt className="text-[10px] font-medium uppercase tracking-wider text-faint">{k}</dt>
            <dd className="break-all text-[13px] text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] text-faint">
        Read-only — this manager view reads a deterministic post-completion snapshot of the same canonical
        Curefoods mission (identical account, mission, recommendation, template and audit reference) and changes
        none of these governed facts. It is not the live Mission Control session state.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 7. Governed outcome
// ---------------------------------------------------------------------------

function GovernedOutcomeCard({ ctx }: { ctx: ManagerMissionContext }) {
  return (
    <Card
      icon={<ShieldCheck size={16} />}
      title="Governed outcome"
      label={<Chip tone="muted">{ctx.simulatedActionCount} simulated</Chip>}
    >
      <div className="space-y-2">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-faint">System outcome</div>
          <div className="text-[14px] font-medium text-ink">{ctx.governedSystemOutcome}</div>
        </div>
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-faint">Business outcome</div>
          <div className="text-[14px] text-muted">{ctx.governedBusinessOutcome}</div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 8. Manager action bar (simulated only)
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<ManagerCoachingStatus, string> = {
  not_reviewed: "Not reviewed",
  reviewed: "Reviewed",
  simulated_intervention_assigned: "Simulated intervention assigned",
};

function ManagerActionBar({
  status,
  onReview,
  onAssign,
}: {
  status: ManagerCoachingStatus;
  onReview: () => void;
  onAssign: () => void;
}) {
  const reviewed = status !== "not_reviewed";
  const assigned = status === "simulated_intervention_assigned";
  return (
    <Card
      icon={<CheckCircle2 size={16} />}
      title="Manager action"
      label={
        <Chip tone="sim">
          <FlaskConical size={11} /> {STATUS_LABEL[status]}
        </Chip>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onReview}
          className={cx(
            "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
            reviewed
              ? "border-edge bg-surface2 text-faint"
              : "border-brand/50 bg-brand/10 text-brand-bright hover:border-brand",
          )}
        >
          {reviewed ? "Marked as reviewed" : "Review coaching guidance"}
        </button>
        <button
          type="button"
          onClick={onAssign}
          disabled={assigned}
          className={cx(
            "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
            assigned
              ? "border-amber/40 bg-amber/10 text-amber-700"
              : "border-brand/50 bg-brand/10 text-brand-bright hover:border-brand",
          )}
        >
          {assigned ? "Simulated manager intervention assigned" : "Assign simulated coaching intervention"}
        </button>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
        <span>Simulated manager intervention</span>
        <span>· No notification sent</span>
        <span>· No CRM record changed</span>
        <span>· No mission state changed</span>
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 9. Truth + simulation notice
// ---------------------------------------------------------------------------

function TruthAndSimulationNotice() {
  return (
    <section className="rounded-xl border border-edge bg-surface2 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Info size={14} className="text-faint" />
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-faint">
          Truth &amp; simulation notice
        </h2>
      </div>
      <ul className="grid gap-1.5 text-[12px] text-muted sm:grid-cols-2">
        <li>“Assigned seller” is presentation-only demo context — not a CRM-backed identity.</li>
        <li>This is a deterministic governed demo; no coaching effectiveness is calculated.</li>
        <li>The manager cannot approve, execute, or send — those remain the governed mission’s gates.</li>
        <li>No revenue impact, adoption uplift, risk reduction, or customer response is claimed.</li>
        <li>Manager review state is simulated and stored only in this browser.</li>
        <li>The governed mission, approval, simulation, audit, and ledger are never modified here.</li>
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page-level composition
// ---------------------------------------------------------------------------

export function ManagerCoachingView() {
  // Deterministic, read-only reconstruction of the seller-completed governed
  // mission. Stable across refreshes — same input, same output.
  const { turn, view } = React.useMemo(() => reconstructSellerCompletedMission(), []);

  const [status, setStatus] = React.useState<ManagerCoachingStatus>("not_reviewed");

  // Rehydrate the simulated review status on mount + subscribe to changes.
  React.useEffect(() => {
    setStatus(loadManagerCoachingState().status);
    return subscribeManagerCoaching(() => setStatus(loadManagerCoachingState().status));
  }, []);

  const ctx = React.useMemo(
    () => buildManagerMissionContext(turn, view, status),
    [turn, view, status],
  );
  const recommendation = React.useMemo(() => buildCoachingRecommendation(ctx), [ctx]);

  const onReview = React.useCallback(() => setStatus(markReviewed().status), []);
  const onAssign = React.useCallback(() => setStatus(assignSimulatedIntervention().status), []);

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-4 px-5 py-6">
      <FeatureBranchStatus />
      <ManagerBriefingHero ctx={ctx} />
      <CoachingRecommendationCard title={recommendation.title} focus={recommendation.focus} />
      <CoachingReasonCard reason={recommendation.reason} />
      <FifteenMinuteInterventionCard ctx={ctx} />
      <MissionContinuityStrip ctx={ctx} />
      <GovernedOutcomeCard ctx={ctx} />
      <ManagerActionBar status={status} onReview={onReview} onAssign={onAssign} />
      <TruthAndSimulationNotice />
    </div>
  );
}
