import { useEffect, useState, useCallback, useMemo } from "react";
import { Clock, AlertCircle, CheckCircle, Play, RotateCcw, Zap } from "lucide-react";
import {
  EXECUTION_PHASE_ORDER,
  EXECUTION_PHASE_LABEL,
  STAGE_LABEL,
  ACTOR_LABEL,
  ExecutionStageId,
  ExecutionRun,
  getCurrentRun,
  subscribeExecution,
  startExecution,
  advanceStage,
  markBlocked,
  resetExecution,
  formatStageClock,
  phaseOf,
  toggleAutoAdvance,
} from "@/lib/executionEngine";
import type { Recommendation } from "@/lib/types";

export interface ActionExecutionPanelProps {
  recommendation: Recommendation;
  reasoning: any;
  lifecycle: string;
}

const cn = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(" ");

function ProgressStrip({ phase }: { phase: string }) {
  return (
    <div className="flex items-center gap-2 mb-6 pb-4 border-b border-edge-soft">
      {(EXECUTION_PHASE_ORDER as string[]).map((p, idx) => {
        const isCurrent = p === phase;
        const isCompleted = (EXECUTION_PHASE_ORDER as string[]).indexOf(p) < (EXECUTION_PHASE_ORDER as string[]).indexOf(phase);
        return (
          <div key={p} className="flex items-center gap-1.5">
            <div
              className={cn(
                "w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-semibold transition-all",
                isCurrent
                  ? "bg-brand text-[#1a1206] border-brand shadow-glow-amber"
                  : isCompleted
                    ? "bg-accent text-[#f5f1e8] border-accent"
                    : "bg-surface2 text-muted border-edge-soft"
              )}
            >
              {isCompleted ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <span className="text-xs">{idx + 1}</span>
              )}
            </div>
            <span
              className={cn(
                "text-xs font-medium transition-colors",
                isCurrent ? "text-brand" : isCompleted ? "text-accent" : "text-muted"
              )}
            >
              {(EXECUTION_PHASE_LABEL as Record<string, string>)[p]}
            </span>
            {idx < (EXECUTION_PHASE_ORDER as string[]).length - 1 && (
              <div className="w-6 h-px bg-edge-soft mx-1" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function stageActor(stage: ExecutionStageId) {
  const mapping: Record<ExecutionStageId, string> = {
    prepare_outreach: "execution_agent",
    customer_contacted: "execution_agent",
    meeting_scheduled: "customer",
    executive_escalation: "executive_review",
    renewal_conversation_started: "customer",
    commercial_proposal_sent: "execution_agent",
    opportunity_created: "execution_agent",
    recovery_plan_initiated: "customer",
    executive_review: "executive_review",
    outcome_logged: "outcome_agent",
  };
  return (mapping[stage] || "execution_agent") as string;
}

function stageOffset(stage: ExecutionStageId): number {
  const offsets: Record<ExecutionStageId, number> = {
    prepare_outreach: 0,
    customer_contacted: 5,
    meeting_scheduled: 30,
    executive_escalation: 10,
    renewal_conversation_started: 20,
    commercial_proposal_sent: 90,
    opportunity_created: 60,
    recovery_plan_initiated: 60,
    executive_review: 70,
    outcome_logged: 1440,
  };
  return offsets[stage] || 0;
}

function StageRow({
  stage,
  isActive,
  isCompleted,
  isBlocked,
  startedAt,
}: {
  stage: ExecutionStageId;
  isActive: boolean;
  isCompleted: boolean;
  isBlocked: boolean;
  startedAt: string;
}) {
  const actor = stageActor(stage);
  return (
    <div className={cn("flex items-center gap-3 p-2.5 rounded text-sm", 
      isActive ? "bg-surface2 border-l-2 border-brand" : "")}>
      <div className="flex-shrink-0 w-20">
        <span className={cn(
          "text-xs font-semibold px-2 py-1 rounded",
          isActive ? "bg-brand/15 text-brand" : isCompleted ? "bg-accent/15 text-accent" : 
          isBlocked ? "bg-risk/15 text-risk" : "bg-muted/10 text-muted"
        )}>
          {(ACTOR_LABEL as Record<string, string>)[actor]}
        </span>
      </div>
      <div className="flex-grow">
        <p className="font-medium text-ink">{(STAGE_LABEL as Record<ExecutionStageId, string>)[stage]}</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <Clock className="w-3 h-3" />
        <span>{formatStageClock(startedAt, stageOffset(stage))}</span>
      </div>
      <div className="flex-shrink-0 w-5">
        {isCompleted && <CheckCircle className="w-5 h-5 text-accent" />}
        {isBlocked && <AlertCircle className="w-5 h-5 text-risk" />}
        {isActive && !isCompleted && !isBlocked && (
          <div className="w-3 h-3 rounded-full bg-brand animate-pulse" />
        )}
      </div>
    </div>
  );
}

export function ActionExecutionPanel({ recommendation, reasoning, lifecycle }: ActionExecutionPanelProps) {
  const isApproved = lifecycle === "approved";
  
  const [run, setRun] = useState<ExecutionRun | null>(() =>
    getCurrentRun(recommendation.recommendation_id)
  );

  const phase = useMemo(() => phaseOf(run), [run]);

  useEffect(() => {
    const unsubscribe = subscribeExecution(() => {
      setRun(getCurrentRun(recommendation.recommendation_id));
    });
    return unsubscribe;
  }, [recommendation.recommendation_id]);

  useEffect(() => {
    if (isApproved && !run) {
      const newRun = startExecution({
        recommendation,
        recommendedActionLabel: recommendation.recommended_action,
        actionKey: (recommendation as any).action_key || "generic",
        expectedOutcomeOverride: (recommendation as any).expected_outcome || "",
        autoAdvance: true, // Enable auto-advance by default for demo
      });
      setRun(newRun);
    }
  }, [isApproved, run, recommendation]);

  const onAdvance = useCallback(() => {
    if (!run) return;
    const updated = advanceStage(run.run_id);
    if (updated) setRun(updated);
  }, [run]);

  const onBlock = useCallback(() => {
    if (!run) return;
    const updated = markBlocked(run.run_id, "Blocked by seller");
    if (updated) setRun(updated);
  }, [run]);

  const onRestart = useCallback(() => {
    resetExecution(recommendation.recommendation_id);
    setRun(null);
  }, [recommendation.recommendation_id]);

  const onToggleAutoAdvance = useCallback(() => {
    if (!run) return;
    const updated = toggleAutoAdvance(run.run_id, !run.auto_advance);
    if (updated) setRun(updated);
  }, [run]);

  if (!isApproved) {
    return (
      <div className="p-4 bg-surface2 rounded border border-edge-soft">
        <p className="text-sm text-muted">
          Execution will begin once the recommendation is approved.
        </p>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-4 bg-surface2 rounded border border-edge-soft">
        <p className="text-sm text-muted">Initializing execution center...</p>
      </div>
    );
  }

  const currentStatus = run.status as string;
  const isBlocked = currentStatus === "blocked";
  const isCompleted = currentStatus === "completed_successfully";

  return (
    <div className="space-y-4">
      <ProgressStrip phase={phase} />

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted uppercase">Execution Timeline</p>
        {run.stages.map((stage, idx) => (
          <StageRow
            key={stage.stage}
            stage={stage.stage}
            isActive={idx === run.current_stage_index}
            isCompleted={stage.status === "completed"}
            isBlocked={stage.status === "blocked"}
            startedAt={run.started_at}
          />
        ))}
      </div>

      {/* Business Outcome (final result) */}
      {isCompleted && (
        <div className="p-3 bg-accent/10 rounded border-l-2 border-accent">
          <p className="text-xs font-semibold text-accent uppercase mb-1">Business Impact</p>
          <p className="text-sm text-ink font-medium">{run.business_outcome || run.expected_outcome}</p>
        </div>
      )}

      {/* Expected Outcome (in progress) */}
      {!isCompleted && (
        <div className="p-3 bg-surface2 rounded border-l-2 border-brand">
          <p className="text-xs font-semibold text-muted uppercase mb-1">Expected Outcome</p>
          <p className="text-sm text-ink">{run.expected_outcome}</p>
        </div>
      )}

      <div className="p-2 bg-muted/5 rounded text-xs text-muted italic">
        Execution orchestration — no external write-back performed. All events recorded in Decision Ledger.
      </div>

      {/* Controls */}
      <div className="flex gap-2 pt-2 flex-wrap">
        {!isBlocked && !isCompleted && (
          <>
            <button
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded bg-brand text-[#1a1206] hover:bg-brand/90 transition disabled:opacity-50"
              onClick={onAdvance}
              disabled={isBlocked}
            >
              <Play className="w-4 h-4" />
              Next Stage
            </button>
            <button
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded transition",
                run.auto_advance
                  ? "bg-brand/15 text-brand border border-brand"
                  : "bg-surface2 text-muted border border-edge hover:bg-surface"
              )}
              onClick={onToggleAutoAdvance}
              title={run.auto_advance ? "Auto-advance enabled" : "Auto-advance disabled"}
            >
              <Zap className="w-4 h-4" />
              {run.auto_advance ? "Auto" : "Manual"}
            </button>
            <button
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded bg-surface2 border border-edge text-ink hover:bg-surface transition"
              onClick={onBlock}
            >
              <AlertCircle className="w-4 h-4" />
              Block
            </button>
          </>
        )}
        <button
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded bg-transparent text-muted hover:text-ink transition"
          onClick={onRestart}
        >
          <RotateCcw className="w-4 h-4" />
          Restart Execution
        </button>
      </div>
    </div>
  );
}
