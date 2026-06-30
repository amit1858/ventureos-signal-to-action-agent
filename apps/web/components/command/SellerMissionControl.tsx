// Release 1.4B — Seller Mission Control.
//
// A guided, step-by-step seller working mode that lives inside the Account
// Workspace. It moves a seller from recommendation to action without scrolling
// across many panels: Review Account → Review Evidence → Prepare Outreach →
// Draft CRM Note → Submit for Approval → Execute Action → Capture Outcome.
//
// This is a FRONTEND workflow layer only. It composes existing, account-specific
// data (the recommendation, account, reasoning bundle, and real evidence) and
// delegates the stateful / governed parts to existing modules — it never
// duplicates or modifies them:
//   • Execution  → <ActionExecutionPanel> + @/lib/executionEngine
//   • Approval   → appendLedgerEntry (same write path as the ApprovalDrawer)
//   • Outcome    → recordOutcome (existing Decision Ledger API)
//   • Progress   → @/lib/missionState (session-only; no backend, no schema change)

"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  FileText,
  Globe,
  ListChecks,
  MessageSquare,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import type { Account, Recommendation } from "@/lib/types";
import type { RecommendationReasoning } from "@/lib/reasoning";
import { cx, pct, titleCase } from "@/lib/format";
import {
  LIFECYCLE_LABEL,
  OUTCOME_LABEL,
  appendLedgerEntry,
  lifecycleFor,
  listLedgerForAccount,
  recordOutcome,
  subscribeLedger,
  type LifecycleState,
  type OutcomeKind,
} from "@/lib/decisionLedger";
import {
  EXECUTION_STATUS_LABEL,
  getCurrentRun,
  subscribeExecution,
  type ExecutionStatus,
} from "@/lib/executionEngine";
import { ActionExecutionPanel } from "@/components/command/ActionExecutionPanel";
import {
  MISSION_STEPS,
  MISSION_STEP_LABEL,
  MISSION_STEP_QUESTION,
  MISSION_STEP_SHORT,
  MISSION_STEP_WHY,
  completeMission,
  completeMissionStep,
  getMissionForAccount,
  markApprovalResolved,
  markApprovalSubmitted,
  markOutcomeCaptured,
  missionMetrics,
  requestMission,
  setMissionStep,
  startMission,
  subscribeMissions,
  type MissionRecord,
  type MissionStepId,
} from "@/lib/missionState";

// ---------------------------------------------------------------------------
// Local, presentation-only derivations. These produce account-specific copy
// from the existing recommendation + reasoning bundle. No scoring/ranking.

function riskLevel(account?: Account): "High" | "Medium" | "Low" {
  if (!account) return "Medium";
  const spendDelta =
    account.previous_month_spend > 0
      ? (account.current_month_spend - account.previous_month_spend) / account.previous_month_spend
      : 0;
  const urgentRenewal = account.renewal_days >= 0 && account.renewal_days <= 30;
  if (account.support_risk_score >= 70 || spendDelta <= -0.2 || urgentRenewal) return "High";
  if (account.support_risk_score >= 50 || spendDelta <= -0.1 || account.engagement_score <= 45) return "Medium";
  return "Low";
}

function parseBulletLines(value: string, limit = 4): string[] {
  return (value || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function toneForUrgency(urgency: string): string {
  switch (urgency) {
    case "critical":
      return "Direct and reassuring — acknowledge the risk, lead with partnership.";
    case "opportunity":
      return "Confident and consultative — frame the upside, invite a next step.";
    case "review":
      return "Measured and exploratory — confirm context before committing.";
    case "hold":
      return "Light-touch — stay present without pushing for a decision.";
    default:
      return "Warm and professional — proactive check-in with a clear purpose.";
  }
}

function expectedReaction(reasoning: RecommendationReasoning, risk: "High" | "Medium" | "Low"): string {
  if (risk === "High") {
    return "Likely cautious at first — expect questions about what changed. Listening and a concrete plan turn the conversation positive.";
  }
  if (reasoning.action.urgency === "opportunity") {
    return "Generally receptive — the customer is engaged, so a relevant idea is usually welcomed and explored.";
  }
  return "Neutral-to-positive — a timely, well-prepared touch is typically appreciated and builds momentum.";
}

function topEvidence(rec: Recommendation, count = 3) {
  const items = rec.evidence ?? [];
  const score = (p: string, strength: number) => {
    const pol = String(p).toLowerCase();
    const weight = pol.startsWith("neg") ? 3 : pol.startsWith("pos") ? 1 : 2;
    return weight * 100 + Math.round((strength || 0) * 100);
  };
  return [...items].sort((a, b) => score(b.polarity, b.strength) - score(a.polarity, a.strength)).slice(0, count);
}

function crmNoteFor(rec: Recommendation, reasoning: RecommendationReasoning): string {
  return (
    rec.voice_summary ||
    `Reviewed ${rec.account_name} (priority #${rec.priority_rank}). ${rec.risk_summary} Recommended next action: ${reasoning.action.label} — ${reasoning.action.value}.`
  );
}

function formatTs(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const APPROVED_STATES: LifecycleState[] = ["approved", "executed", "outcome_captured"];

// Enriched "what's next" preview used by Mission Complete to make the hand-off
// feel rewarding (next account + its action + estimated effort). Presentation
// only — derived from the already-ranked recommendation list, never re-ranked.
export interface NextMissionPreview {
  account_id: string;
  account_name: string;
  action_label?: string;
  estimated_minutes?: number;
}

export interface SellerMissionControlProps {
  recommendation: Recommendation;
  account?: Account;
  reasoning: RecommendationReasoning;
  experienceMode: "executive" | "seller" | "operations";
  generatedAt?: string;
  nextAccount?: NextMissionPreview | null;
  onOpenAccount: (accountId: string, source?: string) => void;
  onClose: () => void;
  // Release 1.4B — Mission is now a first-class surface. "overlay" keeps the
  // legacy in-cockpit drawer; "page" renders Mission as the seller's full-screen
  // work mode (the promoted experience).
  variant?: "overlay" | "page";
  // Explain Mode escape hatch — available on every step in page variant.
  onOpenWorkspace?: (accountId: string) => void;
}

export function SellerMissionControl({
  recommendation,
  account,
  reasoning,
  experienceMode,
  generatedAt,
  nextAccount,
  onOpenAccount,
  onClose,
  variant = "overlay",
  onOpenWorkspace,
}: SellerMissionControlProps) {
  const isPage = variant === "page";
  const [mission, setMission] = React.useState<MissionRecord>(() =>
    startMission({
      account_id: recommendation.account_id,
      recommendation_id: recommendation.recommendation_id,
      account_name: recommendation.account_name,
      estimated_minutes: reasoning.estimatedMinutes,
    }),
  );

  // Re-render when the ledger or execution run change so derived lifecycle /
  // execution / outcome state stays live inside the flow.
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => subscribeLedger(() => setTick((t) => t + 1)), []);
  React.useEffect(() => subscribeExecution(() => setTick((t) => t + 1)), []);
  React.useEffect(() => subscribeMissions(() => {
    const fresh = getMissionForAccount(recommendation.account_id);
    if (fresh) setMission(fresh);
  }), [recommendation.account_id]);

  const lifecycle = React.useMemo<LifecycleState>(
    () => lifecycleFor(recommendation.recommendation_id, "prepared"),
    [recommendation.recommendation_id, tick],
  );
  const run = React.useMemo(() => getCurrentRun(recommendation.recommendation_id), [recommendation.recommendation_id, tick]);
  const ledgerEvents = React.useMemo(
    () => listLedgerForAccount(recommendation.account_id),
    [recommendation.account_id, tick],
  );
  const latestApproved = ledgerEvents.find((e) => e.decision_type === "approved");
  // Approval is sticky: once an approved entry exists (or an execution run was
  // started, which only happens post-approval) the seller stays "approved" even
  // though the shared executionEngine appends "review"-type orchestration
  // entries that would otherwise flip lifecycleFor() back to "submitted".
  const isApproved =
    APPROVED_STATES.includes(lifecycle) || Boolean(latestApproved) || Boolean(run);
  const outcomeCaptured = Boolean(latestApproved?.outcome);
  const risk = riskLevel(account);
  const metrics = React.useMemo(() => missionMetrics(), [tick, mission]);

  const stepIndex = MISSION_STEPS.indexOf(mission.current_step);
  const isComplete = mission.status === "completed";

  // Persist execution / outcome progress back into the mission record so the
  // (future) manager view + metrics stay accurate even if the seller skips
  // around. Effects are idempotent (mission setters de-dupe).
  React.useEffect(() => {
    if (mission.approval_submitted) return;
    if (lifecycle === "submitted" || isApproved) markApprovalSubmitted(mission.mission_id);
  }, [lifecycle, isApproved, mission.approval_submitted, mission.mission_id]);
  React.useEffect(() => {
    if (isApproved && !mission.approval_resolved) markApprovalResolved(mission.mission_id);
  }, [isApproved, mission.approval_resolved, mission.mission_id]);
  React.useEffect(() => {
    if (outcomeCaptured && !mission.outcome_captured) {
      markOutcomeCaptured(mission.mission_id);
      completeMissionStep(mission.mission_id, "capture_outcome");
    }
  }, [outcomeCaptured, mission.outcome_captured, mission.mission_id]);

  const goToStep = React.useCallback(
    (step: MissionStepId) => {
      const updated = setMissionStep(mission.mission_id, step);
      if (updated) setMission(updated);
    },
    [mission.mission_id],
  );

  const completeAndNext = React.useCallback(() => {
    completeMissionStep(mission.mission_id, mission.current_step);
    const idx = MISSION_STEPS.indexOf(mission.current_step);
    if (idx < MISSION_STEPS.length - 1) {
      goToStep(MISSION_STEPS[idx + 1]);
    }
  }, [mission.mission_id, mission.current_step, goToStep]);

  const goBack = React.useCallback(() => {
    const idx = MISSION_STEPS.indexOf(mission.current_step);
    if (idx > 0) goToStep(MISSION_STEPS[idx - 1]);
  }, [mission.current_step, goToStep]);

  const finishMission = React.useCallback(() => {
    const updated = completeMission(mission.mission_id);
    if (updated) setMission(updated);
  }, [mission.mission_id]);

  // Esc closes the overlay; focus the dialog on open for keyboard users. In page
  // variant Esc must NOT close (it's a surface, not a dismissible dialog).
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    dialogRef.current?.focus();
    if (isPage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isPage]);

  const executionStatusLabel = run
    ? EXECUTION_STATUS_LABEL[run.status as ExecutionStatus] ?? titleCase(String(run.status))
    : "Not started";

  return (
    <div
      role={isPage ? "region" : "dialog"}
      aria-modal={isPage ? undefined : true}
      aria-label="Seller Mission Control"
      className={cx(
        isPage
          ? "scene flex min-h-[calc(100vh-58px)] w-full justify-center px-4 py-5"
          : "fixed inset-0 z-50 flex items-stretch justify-end bg-black/50 backdrop-blur-[1px]",
      )}
      onClick={isPage ? undefined : onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={isPage ? undefined : (e) => e.stopPropagation()}
        className={cx(
          "scene flex flex-col outline-none",
          isPage
            ? "h-full w-full max-w-[1040px] rounded-2xl border border-edge bg-surface shadow-xl"
            : "h-full w-full max-w-[560px] border-l border-edge bg-surface shadow-2xl",
        )}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-edge surface-warm px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-bright">
                <Rocket size={12} /> {isPage ? "Today's Mission" : "Seller Mission Control"}
              </div>
              <h2 className="mt-0.5 truncate text-[16px] font-semibold tracking-tight text-ink">
                {recommendation.account_name}
              </h2>
              <p className="mt-0.5 text-[11px] text-muted">
                {reasoning.action.label} · Priority #{recommendation.priority_rank} · Risk {risk}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {isPage && onOpenWorkspace ? (
                <button
                  type="button"
                  onClick={() => onOpenWorkspace(recommendation.account_id)}
                  className="btn btn-ghost px-2.5 py-1.5 text-[11px]"
                  title="Open the full account workspace (Explain Mode) without losing your place"
                >
                  <ArrowUpRight size={13} /> Open Full Workspace
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                aria-label={isPage ? "Exit mission" : "Close mission"}
                className={cx(
                  "rounded-lg border border-edge-soft text-faint transition-colors hover:bg-surface2/50 hover:text-ink",
                  isPage ? "px-2.5 py-1.5 text-[11px] font-medium" : "p-1.5",
                )}
                title={isPage ? "Exit mission and return to your brief" : "Close mission"}
              >
                {isPage ? "Exit mission" : <X size={15} />}
              </button>
            </div>
          </div>

          {/* Metrics HUD */}
          <div className="mt-2.5 grid grid-cols-5 gap-1.5">
            <HudStat label="Est. time" value={`~${reasoning.estimatedMinutes}m`} />
            <HudStat label="Steps" value={`${mission.completed_steps.length}/${MISSION_STEPS.length}`} />
            <HudStat label="Approvals" value={`${metrics.approvalsPending}`} tone={metrics.approvalsPending ? "warn" : undefined} />
            <HudStat label="Done (session)" value={`${metrics.completed}`} />
            <HudStat label="Next ready" value={nextAccount ? "Yes" : "—"} />
          </div>
        </div>

        {/* Stepper */}
        {!isComplete ? (
          <Stepper
            current={mission.current_step}
            furthestIndex={mission.furthest_step_index}
            completed={mission.completed_steps}
            onJump={goToStep}
          />
        ) : null}

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {isComplete ? (
            <MissionComplete
              recommendation={recommendation}
              reasoning={reasoning}
              ledgerEventCount={ledgerEvents.length}
              lifecycleLabel={isApproved ? "Approved" : LIFECYCLE_LABEL[lifecycle]}
              executionStatusLabel={executionStatusLabel}
              outcomeLabel={latestApproved?.outcome ? OUTCOME_LABEL[latestApproved.outcome] : null}
              nextAccount={nextAccount}
              onStartNext={(accountId) => {
                onClose();
                onOpenAccount(accountId, "Mission Complete");
                requestMission(accountId);
              }}
              onClose={onClose}
            />
          ) : (
            <StepBody
              step={mission.current_step}
              recommendation={recommendation}
              account={account}
              reasoning={reasoning}
              risk={risk}
              generatedAt={generatedAt}
              lifecycle={lifecycle}
              isApproved={isApproved}
              outcomeCaptured={outcomeCaptured}
              latestOutcome={latestApproved?.outcome ?? null}
              onSubmitApproval={(decision, note) => {
                appendLedgerEntry({
                  recommendation_id: recommendation.recommendation_id,
                  account_id: recommendation.account_id,
                  account_name: recommendation.account_name,
                  recommended_action: reasoning.action.label,
                  decision_type: decision,
                  reviewer_name: "You (seller mission)",
                  reviewer_note: note,
                  confidence: recommendation.confidence_score,
                  risk_level: risk,
                  opportunity_level: account?.growth_potential_score ?? 0,
                  evidence_count: recommendation.evidence.length,
                  business_impact: `${reasoning.action.label} for ${recommendation.account_name}. ${reasoning.expectedOutcome}`,
                  governance_caveat: recommendation.governance_caveats[0],
                  source: (recommendation.agents_invoked?.length ?? 0) > 1 ? "multi_agent" : "deterministic",
                });
              }}
              onCaptureOutcome={(outcome, note) => {
                recordOutcome(recommendation.account_id, outcome, note);
              }}
            />
          )}
        </div>

        {/* Footer controls */}
        {!isComplete ? (
          <div className="shrink-0 border-t border-edge bg-surface2/40 px-4 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={goBack}
                disabled={stepIndex === 0}
                className="btn btn-ghost px-3 py-1.5 text-[12px]"
              >
                <ArrowLeft size={13} /> Back
              </button>
              <div className="text-[10px] text-faint">
                Step {stepIndex + 1} of {MISSION_STEPS.length} · {MISSION_STEP_LABEL[mission.current_step]}
              </div>
              {stepIndex < MISSION_STEPS.length - 1 ? (
                <button type="button" onClick={completeAndNext} className="btn btn-primary px-3 py-1.5 text-[12px]">
                  Next <ArrowRight size={13} />
                </button>
              ) : (
                <button type="button" onClick={finishMission} className="btn btn-primary px-3 py-1.5 text-[12px]">
                  <CheckCircle2 size={13} /> Complete mission
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function HudStat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-md border border-edge-soft bg-bg/40 px-1.5 py-1 text-center">
      <div className="text-[8.5px] uppercase tracking-wider text-faint">{label}</div>
      <div className={cx("text-[12px] font-semibold", tone === "warn" ? "text-yellow-400" : "text-ink")}>{value}</div>
    </div>
  );
}

function Stepper({
  current,
  furthestIndex,
  completed,
  onJump,
}: {
  current: MissionStepId;
  furthestIndex: number;
  completed: MissionStepId[];
  onJump: (step: MissionStepId) => void;
}) {
  return (
    <div className="shrink-0 border-b border-edge bg-bg/30 px-3 py-2">
      <div className="flex items-center gap-1" role="group" aria-label="Mission steps">
        {MISSION_STEPS.map((step, idx) => {
          const isCurrent = step === current;
          const isDone = completed.includes(step);
          const reachable = idx <= furthestIndex;
          return (
            <React.Fragment key={step}>
              <button
                type="button"
                onClick={() => reachable && onJump(step)}
                disabled={!reachable}
                aria-current={isCurrent ? "step" : undefined}
                title={MISSION_STEP_LABEL[step]}
                className={cx(
                  "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-1 py-1 transition-colors",
                  reachable ? "cursor-pointer hover:bg-surface2/50" : "cursor-not-allowed opacity-55",
                )}
              >
                <span
                  className={cx(
                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold transition-colors",
                    isCurrent
                      ? "border-brand-bright bg-brand text-[#1a1206] shadow-glow-amber"
                      : isDone
                        ? "border-accent/60 bg-accent/20 text-accent"
                        : "border-edge-soft text-faint",
                  )}
                >
                  {isDone && !isCurrent ? "✓" : idx + 1}
                </span>
                <span
                  className={cx(
                    "truncate text-[8.5px] font-medium tracking-wide",
                    isCurrent ? "text-brand-bright" : isDone ? "text-accent" : "text-faint",
                  )}
                >
                  {MISSION_STEP_SHORT[step]}
                </span>
              </button>
              {idx < MISSION_STEPS.length - 1 ? (
                <span aria-hidden className={cx("h-px w-2 shrink-0", idx < furthestIndex ? "bg-accent/50" : "bg-edge")} />
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function StepShell({
  step,
  children,
}: {
  step: MissionStepId;
  children: React.ReactNode;
}) {
  return (
    <div className="scene space-y-2.5">
      <div className="rounded-lg border border-brand/25 bg-brand/[0.06] px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-bright">
          {MISSION_STEP_LABEL[step]}
        </div>
        <p className="mt-0.5 text-[12.5px] font-medium text-ink">{MISSION_STEP_QUESTION[step]}</p>
        <p className="mt-1 text-[10.5px] text-muted">{MISSION_STEP_WHY[step]}</p>
      </div>
      {children}
    </div>
  );
}

function Card({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-edge bg-surface2/40 p-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
          {icon}
          {title}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-edge-soft bg-bg/30 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wider text-faint">{label}</div>
      <div className="text-[11px] font-medium text-ink">{value}</div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="inline-flex items-center gap-1 rounded border border-edge-soft px-1.5 py-0.5 text-[10px] text-faint transition-colors hover:bg-surface2/40 hover:text-ink"
    >
      {copied ? <CheckCircle2 size={11} /> : <Copy size={11} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function StepBody({
  step,
  recommendation,
  account,
  reasoning,
  risk,
  generatedAt,
  lifecycle,
  isApproved,
  outcomeCaptured,
  latestOutcome,
  onSubmitApproval,
  onCaptureOutcome,
}: {
  step: MissionStepId;
  recommendation: Recommendation;
  account?: Account;
  reasoning: RecommendationReasoning;
  risk: "High" | "Medium" | "Low";
  generatedAt?: string;
  lifecycle: LifecycleState;
  isApproved: boolean;
  outcomeCaptured: boolean;
  latestOutcome: OutcomeKind | null;
  onSubmitApproval: (decision: "approved" | "review", note?: string) => void;
  onCaptureOutcome: (outcome: OutcomeKind, note?: string) => void;
}) {
  switch (step) {
    case "review_account":
      return (
        <StepShell step={step}>
          <Card title="Recommendation" icon={<Target size={11} />}>
            <p className="text-[12px] font-semibold text-ink">{reasoning.action.label}</p>
            <p className="mt-0.5 text-[11px] text-muted">{reasoning.action.value}</p>
          </Card>
          <Card title="Why this account matters" icon={<Sparkles size={11} />}>
            <p className="text-[11px] text-muted">{recommendation.priority_reason}</p>
          </Card>
          <div className="grid grid-cols-2 gap-2">
            <Card title="Current risk" icon={<ShieldAlert size={11} />}>
              <p className="text-[11px] text-muted">{recommendation.risk_summary}</p>
              <p className="mt-1 text-[10px] italic text-faint">If ignored: {reasoning.ifIgnored}</p>
            </Card>
            <Card title="Current opportunity" icon={<TrendingUp size={11} />}>
              <p className="text-[11px] text-muted">{recommendation.opportunity_summary}</p>
            </Card>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <Stat label="Priority" value={`#${recommendation.priority_rank}`} />
            <Stat label="Risk" value={risk} />
            <Stat label="Confidence" value={pct(recommendation.confidence_score)} />
            <Stat label="Est. effort" value={`~${reasoning.estimatedMinutes}m`} />
          </div>
        </StepShell>
      );

    case "review_evidence": {
      const evidence = topEvidence(recommendation, 3);
      return (
        <StepShell step={step}>
          <Card title={`Top signals (${evidence.length})`} icon={<ListChecks size={11} />}>
            {evidence.length ? (
              <div className="space-y-1.5">
                {evidence.map((ev, idx) => {
                  const polarity = String(ev.polarity).toLowerCase();
                  const tone = polarity.startsWith("pos")
                    ? "bg-accent/15 text-accent"
                    : polarity.startsWith("neg")
                      ? "bg-risk/15 text-risk"
                      : "bg-surface2/60 text-faint";
                  return (
                    <div key={`mev-${idx}`} className="rounded border border-edge-soft bg-bg/30 px-2 py-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-semibold text-ink">{ev.label}</div>
                          <div className="text-[10px] text-muted">{ev.detail}</div>
                        </div>
                        <span className={cx("shrink-0 rounded px-1 text-[8.5px] font-semibold uppercase", tone)}>
                          {String(ev.polarity)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[9.5px] text-faint">
                        <span className="inline-flex items-center gap-1">
                          <Globe size={9} /> {ev.source_system}
                        </span>
                        <span>· Strength {pct(ev.strength)}</span>
                        {generatedAt ? <span>· {formatTs(generatedAt)}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-faint">No evidence snippets available for this account.</p>
            )}
          </Card>
          <Card title="Why this supports the recommendation" icon={<ShieldCheck size={11} />}>
            <p className="text-[11px] text-muted">
              {recommendation.evidence.length} signals point to {reasoning.action.label.toLowerCase()}. Overall
              confidence {pct(recommendation.confidence_score)}{recommendation.governance_status ? ` · governance ${titleCase(recommendation.governance_status)}` : ""}.
            </p>
          </Card>
        </StepShell>
      );
    }

    case "prepare_outreach": {
      const talkingPoints = parseBulletLines(recommendation.call_script, 4);
      const points = talkingPoints.length ? talkingPoints : reasoning.reasons.slice(0, 3).map((r) => r.text);
      return (
        <StepShell step={step}>
          <Card title="Suggested outreach angle" icon={<MessageSquare size={11} />}>
            <p className="text-[11px] text-muted">{reasoning.action.value}</p>
            <p className="mt-1 text-[10px] text-faint">{reasoning.timing}</p>
          </Card>
          <Card title="Customer-specific talking points" icon={<ListChecks size={11} />}>
            <ul className="space-y-1 text-[11px] text-muted">
              {points.map((p, idx) => (
                <li key={`tp-${idx}`}>• {p}</li>
              ))}
            </ul>
          </Card>
          <div className="grid grid-cols-1 gap-2">
            <Card title="Tone" icon={<Sparkles size={11} />}>
              <p className="text-[11px] text-muted">{toneForUrgency(reasoning.action.urgency)}</p>
            </Card>
            <Card title="Objective" icon={<Target size={11} />}>
              <p className="text-[11px] text-muted">{reasoning.action.label}</p>
            </Card>
            <Card title="Expected customer reaction" icon={<TrendingUp size={11} />}>
              <p className="text-[11px] text-muted">{expectedReaction(reasoning, risk)}</p>
            </Card>
          </div>
        </StepShell>
      );
    }

    case "draft_crm": {
      const note = crmNoteFor(recommendation, reasoning);
      return (
        <StepShell step={step}>
          <Card title="Ready-to-copy CRM note" icon={<ClipboardList size={11} />} action={<CopyButton text={note} />}>
            <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted">{note}</pre>
          </Card>
          <div className="grid grid-cols-1 gap-2">
            <Card title="Summary" icon={<FileText size={11} />}>
              <p className="text-[11px] text-muted">{recommendation.risk_summary || recommendation.opportunity_summary}</p>
            </Card>
            <Card title="Recommended next step" icon={<Zap size={11} />}>
              <p className="text-[11px] text-muted">{reasoning.action.label}</p>
              <p className="mt-0.5 text-[10px] text-faint">{reasoning.action.value}</p>
            </Card>
            <Card title="Customer context" icon={<Globe size={11} />}>
              <div className="grid grid-cols-3 gap-1.5">
                <Stat label="Segment" value={account?.segment ? titleCase(account.segment) : "—"} />
                <Stat label="Industry" value={account?.industry ? titleCase(account.industry) : "—"} />
                <Stat label="Renewal" value={account?.renewal_days != null ? `${account.renewal_days}d` : "—"} />
              </div>
            </Card>
            {recommendation.governance_caveats.length ? (
              <Card title="Approval note" icon={<ShieldAlert size={11} />}>
                <p className="text-[11px] text-muted">{recommendation.governance_caveats[0]}</p>
              </Card>
            ) : null}
          </div>
        </StepShell>
      );
    }

    case "submit_approval":
      return (
        <StepShell step={step}>
          <ApprovalStep
            recommendation={recommendation}
            reasoning={reasoning}
            risk={risk}
            lifecycle={lifecycle}
            isApproved={isApproved}
            onSubmitApproval={onSubmitApproval}
          />
        </StepShell>
      );

    case "execute_action":
      return (
        <StepShell step={step}>
          {!isApproved ? (
            <Card title="Awaiting approval" icon={<ShieldAlert size={11} />}>
              <p className="text-[11px] text-muted">
                Execution begins once the recommendation is approved. Go back to{" "}
                <span className="font-semibold text-ink">Submit for approval</span> and approve to continue.
              </p>
            </Card>
          ) : null}
          <Card title="Revenue Execution Center" icon={<Rocket size={11} />}>
            <p className="mb-2 text-[10.5px] text-muted">
              This hands off into the existing execution flow — no execution logic is duplicated. All events are
              recorded in the Decision Ledger.
            </p>
            <ActionExecutionPanel recommendation={recommendation} reasoning={reasoning} lifecycle={lifecycle} />
          </Card>
        </StepShell>
      );

    case "capture_outcome":
      return (
        <StepShell step={step}>
          <OutcomeStep
            isApproved={isApproved}
            outcomeCaptured={outcomeCaptured}
            latestOutcome={latestOutcome}
            onCaptureOutcome={onCaptureOutcome}
          />
        </StepShell>
      );

    default:
      return null;
  }
}

function ApprovalStep({
  recommendation,
  reasoning,
  risk,
  lifecycle,
  isApproved,
  onSubmitApproval,
}: {
  recommendation: Recommendation;
  reasoning: RecommendationReasoning;
  risk: "High" | "Medium" | "Low";
  lifecycle: LifecycleState;
  isApproved: boolean;
  onSubmitApproval: (decision: "approved" | "review", note?: string) => void;
}) {
  const [note, setNote] = React.useState("");
  const governanceReason =
    recommendation.governance_caveats[0] ||
    "Outreach actions require human approval before any customer-facing execution or CRM write-back.";
  return (
    <>
      <Card title="Why approval is required" icon={<ShieldAlert size={11} />}>
        <p className="text-[11px] text-muted">{governanceReason}</p>
      </Card>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Governance" value={recommendation.governance_status ? titleCase(recommendation.governance_status) : "Standard"} />
        <Stat label="Decision owner" value="Account owner" />
        <Stat label="Status" value={isApproved ? "Approved" : LIFECYCLE_LABEL[lifecycle]} />
        <Stat label="Confidence" value={pct(recommendation.confidence_score)} />
      </div>
      {recommendation.governance_caveats.length > 1 ? (
        <Card title="Additional caveats" icon={<ShieldAlert size={11} />}>
          <ul className="space-y-0.5 text-[11px] text-muted">
            {recommendation.governance_caveats.slice(1).map((c, i) => (
              <li key={`cav-${i}`}>• {c}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card title="Audit note (optional)" icon={<FileText size={11} />}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add context for the audit trail…"
          className="min-h-[56px] w-full resize-vertical rounded border border-edge-soft bg-bg/40 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-brand-bright"
        />
      </Card>
      {isApproved ? (
        <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-[11px] text-accent">
          <CheckCircle2 size={12} className="mb-0.5 inline" /> Approved — recorded in the Decision Ledger. You can move to
          execution.
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              onSubmitApproval("approved", note.trim() || undefined);
              setNote("");
            }}
            className="btn btn-primary px-3 py-1.5 text-[12px]"
          >
            <CheckCircle2 size={13} /> Approve
          </button>
          <button
            type="button"
            onClick={() => {
              onSubmitApproval("review", note.trim() || undefined);
              setNote("");
            }}
            className="btn btn-governance px-3 py-1.5 text-[12px]"
          >
            Submit for review
          </button>
        </div>
      )}
      <p className="text-[10px] text-faint">
        Approval uses the existing Decision Ledger lifecycle. Nothing is auto-sent — human approval is required before
        execution.
      </p>
    </>
  );
}

function OutcomeStep({
  isApproved,
  outcomeCaptured,
  latestOutcome,
  onCaptureOutcome,
}: {
  isApproved: boolean;
  outcomeCaptured: boolean;
  latestOutcome: OutcomeKind | null;
  onCaptureOutcome: (outcome: OutcomeKind, note?: string) => void;
}) {
  const [note, setNote] = React.useState("");
  if (!isApproved) {
    return (
      <Card title="Outcome capture locked" icon={<ShieldAlert size={11} />}>
        <p className="text-[11px] text-muted">
          Approve and execute the action first — outcomes attach to the approved Decision Ledger entry.
        </p>
      </Card>
    );
  }
  return (
    <>
      <Card title="What was the result?" icon={<Zap size={11} />}>
        <p className="mb-2 text-[11px] text-muted">
          {outcomeCaptured && latestOutcome
            ? `Recorded: ${OUTCOME_LABEL[latestOutcome]}. You can re-tag if the situation changed.`
            : "Tag the real-world result so the ledger reflects execution and the system learns."}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(OUTCOME_LABEL) as OutcomeKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onCaptureOutcome(k, note.trim() || undefined)}
              className={cx(
                "rounded border px-2 py-1.5 text-left text-[11px] transition-colors",
                latestOutcome === k
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-edge-soft text-muted hover:border-edge hover:bg-surface2/40 hover:text-ink",
              )}
            >
              {OUTCOME_LABEL[k]}
            </button>
          ))}
        </div>
      </Card>
      <Card title="Outcome note (optional)" icon={<FileText size={11} />}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What did we learn? Any next step…"
          className="min-h-[52px] w-full resize-vertical rounded border border-edge-soft bg-bg/40 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-brand-bright"
        />
      </Card>
    </>
  );
}

function MissionComplete({
  recommendation,
  reasoning,
  ledgerEventCount,
  lifecycleLabel,
  executionStatusLabel,
  outcomeLabel,
  nextAccount,
  onStartNext,
  onClose,
}: {
  recommendation: Recommendation;
  reasoning: RecommendationReasoning;
  ledgerEventCount: number;
  lifecycleLabel: string;
  executionStatusLabel: string;
  outcomeLabel: string | null;
  nextAccount?: NextMissionPreview | null;
  onStartNext: (accountId: string) => void;
  onClose: () => void;
}) {
  const accomplishments = [
    `${reasoning.action.label} prepared and ${lifecycleLabel.toLowerCase()}`,
    outcomeLabel ? `Outcome captured: ${outcomeLabel}` : "Execution handed to the Revenue Execution Center",
    `${ledgerEventCount} Decision Ledger event${ledgerEventCount === 1 ? "" : "s"} recorded`,
  ];
  const nextMinutes =
    nextAccount?.estimated_minutes != null ? Math.max(1, Math.round(nextAccount.estimated_minutes)) : null;

  return (
    <div className="scene space-y-3">
      {/* Celebration header */}
      <div className="rounded-xl border border-accent/40 bg-accent/[0.07] px-4 py-5 text-center ambient-glow">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-accent/50 bg-accent/15 text-accent">
          <CheckCircle2 size={26} />
        </div>
        <h3 className="mt-2 text-[18px] font-semibold tracking-tight text-ink">Mission complete</h3>
        <p className="mt-0.5 text-[12px] text-muted">
          {recommendation.account_name} · {reasoning.action.label}
        </p>
      </div>

      {/* What you accomplished */}
      <Card title="What you accomplished" icon={<CheckCircle2 size={11} />}>
        <ul className="space-y-1">
          {accomplishments.map((line) => (
            <li key={line} className="flex items-start gap-1.5 text-[12px] text-ink">
              <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-accent" />
              {line}
            </li>
          ))}
        </ul>
      </Card>

      {/* Business impact */}
      <Card title="Business impact" icon={<TrendingUp size={11} />}>
        <p className="text-[12px] leading-relaxed text-ink">{reasoning.impact.headline}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{reasoning.expectedOutcome}</p>
      </Card>

      {/* Audit snapshot — secondary, compact */}
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Approval" value={lifecycleLabel} />
        <Stat label="Execution" value={executionStatusLabel} />
        <Stat label="Outcome" value={outcomeLabel ?? "Logged"} />
      </div>

      {/* Next recommended mission + single CTA */}
      {nextAccount ? (
        <div className="rounded-xl border border-brand/35 bg-gradient-to-br from-brand/[0.10] to-transparent p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-bright">
            <Rocket size={11} /> Next recommended mission
          </div>
          <p className="mt-1.5 text-[15px] font-semibold tracking-tight text-ink">{nextAccount.account_name}</p>
          <p className="mt-0.5 text-[12px] text-muted">
            {nextAccount.action_label ?? "Recommended action ready"}
            {nextMinutes != null ? (
              <>
                {" "}
                · <span className="inline-flex items-center gap-1 text-faint"><Clock size={11} /> ~{nextMinutes} min</span>
              </>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => onStartNext(nextAccount.account_id)}
            className="btn btn-primary mt-3 w-full px-3 py-2 text-[13px]"
          >
            <Rocket size={14} /> Start next mission <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <Card title="Queue clear" icon={<CheckCircle2 size={11} />}>
          <p className="text-[11px] text-muted">No further recommended accounts right now. Nicely done.</p>
          <button type="button" onClick={onClose} className="btn btn-ghost mt-2 w-full px-3 py-1.5 text-[12px]">
            Return to brief
          </button>
        </Card>
      )}
    </div>
  );
}
