"use client";

import * as React from "react";
import { Check, X, Pencil, Loader2, UserCheck } from "lucide-react";
import type { ApprovalStatus } from "@/lib/types";
import { approvalTone, cx } from "@/lib/format";
import { Pill } from "./ui";

export function ApprovalControls({
  status,
  busy,
  editing,
  onApprove,
  onReject,
  onToggleEdit,
}: {
  status: ApprovalStatus;
  busy: boolean;
  editing: boolean;
  onApprove: () => void;
  onReject: (reason?: string) => void;
  onToggleEdit: () => void;
}) {
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const tone = approvalTone(status);
  const decided = status !== "pending";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between rounded-lg border border-edge bg-surface2/40 px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
          <UserCheck size={13} className="text-accent" />
          Human approval
        </span>
        <Pill className={tone.cls}>{tone.label}</Pill>
      </div>

      {!rejectOpen ? (
        <div className="grid grid-cols-[1.4fr_1fr_0.9fr] gap-2">
          <button
            className={cx("btn btn-success py-2.5 font-semibold", status === "approved" && "ring-1 ring-accent/50")}
            onClick={onApprove}
            disabled={busy}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Approve
          </button>
          <button
            className={cx("btn btn-danger py-2.5 font-semibold", status === "rejected" && "ring-1 ring-risk/50")}
            onClick={() => setRejectOpen(true)}
            disabled={busy}
          >
            <X size={14} />
            Reject
          </button>
          <button
            className={cx("btn btn-ghost py-2.5", editing && "border-accent/40 text-accent")}
            onClick={onToggleEdit}
          >
            <Pencil size={14} />
            {editing ? "Editing" : "Edit"}
          </button>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-risk/30 bg-risk/5 p-2.5">
          <label className="text-[11px] font-medium text-muted">Reason for rejection (optional)</label>
          <textarea
            className="h-16 w-full resize-none rounded-md border border-edge bg-surface px-2 py-1.5 text-xs text-ink outline-none focus:border-faint"
            placeholder="e.g. Evidence too weak; revisit after next billing cycle."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="btn btn-danger flex-1"
              disabled={busy}
              onClick={() => {
                onReject(reason.trim() || undefined);
                setRejectOpen(false);
                setReason("");
              }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
              Confirm reject
            </button>
            <button className="btn btn-ghost" onClick={() => setRejectOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-faint">
        {decided
          ? "This decision is recorded in the decision ledger. Re-approve or reject to change it."
          : "No outreach is sent automatically. A human must approve before any action executes."}
      </p>
    </div>
  );
}
