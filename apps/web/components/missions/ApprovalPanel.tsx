"use client";

// Release 2.2 — Mission Control · governed approval control (F1.8)
// ================================================================
// The human approval interaction. It shows the EXACT proposed action, the
// mission version, and the reviewed payload binding (ref + hash), then captures
// an explicit decision. Approve requires an explicit confirmation of the reviewed
// payload; reject / request-revision require a reason. All decisions are
// simulated-only and bound to the exact reviewed payload — no live action.

import * as React from "react";
import { Lock, ShieldCheck, CheckCircle2, XCircle, RotateCcw, ChevronDown } from "lucide-react";
import { cx } from "@/lib/format";
import { captureApproval, ApprovalError } from "@/lib/missions/simulation";
import type { ApprovalCapture, PresentationApprovalOutcome } from "@/lib/missions/simulation";
import { actionLabel, permittedActionLabel } from "@/lib/missions/missionLabels";
import type { CompletedMissionTurn } from "@/lib/missions/types";

function BindingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-faint">{label}</span>
      <span className="break-all font-mono text-[11px] text-ink">{value}</span>
    </div>
  );
}

/** The reviewed payload ref, full hash and low-level ids — collapsed by default
 * so the primary approval reads in business terms. Governance binding is intact;
 * only its PRESENTATION is progressively disclosed. */
function TechnicalBinding({ rows }: { rows: Array<{ label: string; value: string }> }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-lg border border-edge bg-surface2/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-faint hover:text-muted"
      >
        <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        Technical approval binding
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-2 border-t border-edge px-3 py-3 sm:grid-cols-2">
          {rows.map((r) => (
            <BindingRow key={r.label} label={r.label} value={r.value} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ApprovalPanel({
  turn,
  capture,
  onDecision,
}: {
  turn: CompletedMissionTurn;
  capture: ApprovalCapture | null;
  onDecision: (capture: ApprovalCapture | null) => void;
}) {
  const binding = turn.approvalBinding;
  const [mode, setMode] = React.useState<"idle" | "approve" | "rejected" | "revision_required">("idle");
  const [confirmed, setConfirmed] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  if (!binding) {
    return <p className="text-sm text-muted">This mission has no approval gate.</p>;
  }

  // Captured — show the decision receipt.
  if (capture) {
    const approved = capture.outcome === "approved";
    const rejected = capture.outcome === "rejected";
    return (
      <div className="space-y-3">
        <div
          className={cx(
            "flex items-center gap-2 rounded-lg border px-3 py-2",
            approved ? "border-accent/40 bg-accent/10" : rejected ? "border-risk/40 bg-risk/10" : "border-brand/40 bg-brand/10",
          )}
        >
          {approved ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
          ) : rejected ? (
            <XCircle className="h-4 w-4 shrink-0 text-risk" />
          ) : (
            <RotateCcw className="h-4 w-4 shrink-0 text-brand" />
          )}
          <span className="text-sm text-ink">
            {approved
              ? `Approved by ${capture.actor} — simulated execution may proceed.`
              : rejected
                ? `Rejected by ${capture.actor}.`
                : `Revision requested by ${capture.actor}.`}
          </span>
          <span className="chip ml-auto text-[10px]">{capture.channel}</span>
        </div>
        {capture.reason && <p className="text-xs italic text-faint">Reason: {capture.reason}</p>}
        <div className="text-xs text-muted">
          Mission version <span className="font-medium text-ink">{capture.missionVersion}</span> · nothing was sent
          and no record was written.
        </div>
        <TechnicalBinding
          rows={[
            { label: "Mission version", value: capture.missionVersion },
            { label: "Decision id", value: capture.decisionId },
            { label: "Bound payload ref", value: capture.approvedActionRef },
            { label: "Bound payload hash", value: capture.approvedPayloadHash },
          ]}
        />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            onDecision(null);
            setMode("idle");
            setConfirmed(false);
            setReason("");
            setError(null);
          }}
        >
          Reconsider decision
        </button>
      </div>
    );
  }

  function decide(outcome: PresentationApprovalOutcome): void {
    setError(null);
    try {
      const c = captureApproval(turn, {
        outcome,
        actor: "Account owner",
        actorRole: "account_owner",
        channel: "screen",
        confirmToken: outcome === "approved" ? binding!.actionPayloadHash : null,
        reason: outcome === "approved" ? null : reason,
      });
      onDecision(c);
    } catch (err) {
      if (err instanceof ApprovalError) setError(err.message);
      else setError("Could not capture the decision.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-gov/30 bg-gov/5 px-3 py-2">
        <Lock className="h-4 w-4 shrink-0 text-gov-bright" />
        <span className="text-sm text-ink">{binding.prompt}</span>
        <span className="chip ml-auto border-gov/40 bg-gov/10 text-[10px] text-gov-bright">
          Awaiting approval
        </span>
      </div>

      <div className="space-y-2 rounded-lg border border-edge bg-surface2/50 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-faint">Action to approve</div>
            <div className="mt-0.5 text-sm font-medium text-ink">
              {actionLabel(turn.recommendation.actionType)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-faint">Customer</div>
            <div className="mt-0.5 text-sm font-medium text-ink">{turn.account.canonicalName}</div>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-faint">What will be simulated</div>
          <ul className="mt-1 space-y-1">
            {turn.permittedActions.map((a) => (
              <li key={a} className="flex items-center gap-2 text-sm text-muted">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="text-ink">{permittedActionLabel(a)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="chip border-accent/30 bg-accent/10 text-[10px] text-accent">
            Verification passed
          </span>
          <span className="chip text-[10px]">Mission version {binding.missionVersion}</span>
        </div>
        <p className="text-[11px] text-faint">
          Nothing will be sent and no CRM record will be written. Every action runs only in a controlled sandbox.
        </p>
      </div>

      <TechnicalBinding
        rows={[
          { label: "Reviewed payload ref", value: binding.actionPayloadRef },
          { label: "Reviewed payload hash", value: binding.actionPayloadHash },
          { label: "Recommendation id", value: turn.recommendation.recommendationId },
          { label: "Mission version", value: binding.missionVersion },
        ]}
      />

      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={() => setMode("approve")}>
            Approve
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setMode("revision_required")}>
            Request revision
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setMode("rejected")}>
            Reject
          </button>
        </div>
      )}

      {mode === "approve" && (
        <div className="space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-3">
          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I confirm the exact reviewed action ({actionLabel(turn.recommendation.actionType)}) and its payload binding.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!confirmed}
              aria-disabled={!confirmed}
              onClick={() => decide("approved")}
            >
              <ShieldCheck className="h-4 w-4" /> Confirm approval
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setMode("idle"); setConfirmed(false); }}>
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-faint">
            Explicit confirmation is required — this also gates spoken approval on Voice and Digital Human.
          </p>
        </div>
      )}

      {(mode === "rejected" || mode === "revision_required") && (
        <div className="space-y-2 rounded-lg border border-edge bg-surface2/50 p-3">
          <label className="text-xs text-faint">
            {mode === "rejected" ? "Reason for rejection" : "What revision is needed?"}
          </label>
          <textarea
            className="w-full rounded-lg border border-edge bg-base px-3 py-2 text-sm text-ink outline-none focus:border-faint"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Required"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={mode === "rejected" ? "btn btn-danger" : "btn btn-outline-primary"}
              disabled={reason.trim().length === 0}
              aria-disabled={reason.trim().length === 0}
              onClick={() => decide(mode)}
            >
              {mode === "rejected" ? "Confirm rejection" : "Send back for revision"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setMode("idle"); setReason(""); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-risk">{error}</p>}
    </div>
  );
}
