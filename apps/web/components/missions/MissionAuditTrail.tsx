"use client";

// Release 2.2 — Mission Control · mission audit timeline (F1.9)
// =============================================================
// A readable mission history: sequence, actor, timestamp, status, and the
// evidence / approval / receipt references for each governed stage. Raw hashes
// and internal refs are hidden behind an expandable "technical evidence" toggle
// per the F1.9 spec — the default view stays human-readable.

import * as React from "react";
import { CheckCircle2, CircleDashed, XCircle, ShieldAlert, ShieldCheck, ChevronDown } from "lucide-react";
import { cx } from "@/lib/format";
import type { AuditStepStatus, MissionAuditStep, MissionAuditTrail } from "@/lib/missions/auditTrail";

function StatusIcon({ status }: { status: AuditStepStatus }) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-accent" />;
  if (status === "rejected") return <XCircle className="h-4 w-4 text-risk" />;
  if (status === "blocked") return <ShieldAlert className="h-4 w-4 text-risk" />;
  return <CircleDashed className="h-4 w-4 text-faint" />;
}

function RefChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="chip text-[10px]" title={value}>
      {label}: <span className="font-mono">{value}</span>
    </span>
  );
}

function Step({ step }: { step: MissionAuditStep }) {
  const [open, setOpen] = React.useState(false);
  return (
    <li className="relative pl-8">
      <span className="absolute left-0 top-0.5">
        <StatusIcon status={step.status} />
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">
          {step.sequence}. {step.title}
        </span>
        <span className="chip text-[10px] capitalize">{step.status}</span>
        <span className="ml-auto font-mono text-[10px] text-faint">{step.timestamp}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">{step.detail}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="chip text-[10px]">actor: {step.actor}</span>
        {step.evidenceRef && <RefChip label="evidence" value={step.evidenceRef} />}
        {step.approvalRef && <RefChip label="approval" value={step.approvalRef} />}
        {step.receiptRef && <RefChip label="receipt" value={step.receiptRef} />}
        {step.technical.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-[10px] text-faint hover:text-muted"
          >
            <ChevronDown className={cx("h-3 w-3 transition-transform", open && "rotate-180")} />
            technical evidence
          </button>
        )}
      </div>
      {open && step.technical.length > 0 && (
        <div className="mt-1.5 space-y-1 rounded-lg border border-edge bg-base px-3 py-2">
          {step.technical.map((t) => (
            <div key={t.label + t.value} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-faint">{t.label}</span>
              <span className="break-all font-mono text-muted">{t.value}</span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

export function MissionAuditTrailView({ trail }: { trail: MissionAuditTrail }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className={cx("h-4 w-4", trail.chainValid ? "text-accent" : "text-risk")} />
        <span className="text-sm text-ink">Mission history</span>
        <span
          className={cx(
            "chip ml-auto text-[10px]",
            trail.chainValid ? "border-accent/30 bg-accent/10 text-accent" : "border-risk/40 bg-risk/10 text-risk",
          )}
        >
          {trail.chainValid ? "chain valid" : "chain broken"}
        </span>
      </div>
      <ol className="space-y-4 border-l border-edge pl-1">
        {trail.steps.map((s) => (
          <Step key={s.stageId} step={s} />
        ))}
      </ol>
    </div>
  );
}
