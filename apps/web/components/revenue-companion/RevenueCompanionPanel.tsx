"use client";

import * as React from "react";
import {
  Sparkles,
  ArrowRight,
  FileSearch,
  ShieldCheck,
  CheckCircle2,
  Circle,
} from "lucide-react";

import type {
  RevenueCompanionViewModel,
  CompanionAction,
} from "@/lib/revenue-companion/companionContract";
import { COMPANION_STRINGS } from "@/lib/revenue-companion/strings";
import { cx } from "@/lib/format";

// Presentational, read-only Revenue Companion panel. It renders a governed,
// pre-validated view model in a narrative-first order — AI speaks first, one
// recommendation, evidence, then status. It owns no state and performs no I/O;
// the two actions only navigate to (or, in the guided demo, open) the existing
// governed surface. There is no execute or approve control here.
export function RevenueCompanionPanel({
  vm,
  onPrimary,
  onSecondary,
}: {
  vm: RevenueCompanionViewModel;
  onPrimary?: () => void;
  onSecondary?: () => void;
}) {
  const s = COMPANION_STRINGS;
  return (
    <section
      className="card-elevated p-6"
      aria-labelledby="companion-heading"
    >
      {/* Header: AI speaks first, with an urgency chip (never colour alone). */}
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand/40 bg-brand/10">
          <Sparkles size={15} className="text-brand-bright" aria-hidden="true" />
        </span>
        <span className="eyebrow">{s.eyebrow}</span>
        <span
          className={cx(
            "ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
            urgencyChipClass(vm.urgency),
          )}
        >
          {vm.urgencyLabel}
        </span>
      </div>

      <h2
        id="companion-heading"
        className="mt-3 text-xl font-semibold leading-snug text-ink"
      >
        {vm.narrativeHeadline}
      </h2>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        {vm.narrativeBody}
      </p>

      {/* What changed. */}
      <div className="mt-5">
        <p className="section-label mb-1">{s.sections.whatChanged}</p>
        <p className="text-sm text-ink">
          <span className="font-medium">{vm.signalLabel}</span>
          {vm.accountName ? (
            <span className="text-muted"> · {vm.accountName}</span>
          ) : null}
        </p>
        {vm.signalSummary ? (
          <p className="mt-1 font-mono text-xs leading-relaxed text-faint">
            {vm.signalSummary}
          </p>
        ) : null}
      </div>

      {/* Why it matters. */}
      <div className="mt-4">
        <p className="section-label mb-1">{s.sections.whyItMatters}</p>
        <p className="text-sm leading-relaxed text-muted">{vm.businessImpact}</p>
      </div>

      {/* Recommended next step — one recommendation, then actions. */}
      <div className="mt-5 rounded-lg border border-brand/30 bg-brand/5 p-4">
        <p className="section-label mb-1">{s.sections.recommendation}</p>
        <p className="text-sm font-semibold text-ink">
          {vm.recommendedMissionTitle}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {vm.recommendationReason}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <CompanionActionButton
            action={vm.primaryAction}
            variant="primary"
            icon={<ArrowRight size={15} aria-hidden="true" />}
            onClick={onPrimary}
          />
          <CompanionActionButton
            action={vm.secondaryAction}
            variant="ghost"
            icon={<FileSearch size={15} aria-hidden="true" />}
            onClick={onSecondary}
          />
        </div>
      </div>

      {/* Where it stands. */}
      <div className="mt-5">
        <p className="section-label mb-2">{s.sections.status}</p>
        <ul className="space-y-1.5">
          <StatusLine label="Governance" value={vm.governanceStatus} />
          <StatusLine label="Approval" value={vm.approvalStatus} />
          <StatusLine label="Execution" value={vm.executionStatus} />
        </ul>
      </div>

      {/* Evidence. */}
      <div className="mt-5">
        <p className="section-label mb-2">{s.sections.evidence}</p>
        <ul className="space-y-1">
          {vm.evidenceItems.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted">
              <CheckCircle2
                size={13}
                className="mt-0.5 shrink-0 text-accent"
                aria-hidden="true"
              />
              <span className="font-mono leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Narrative provider truth. */}
      <div className="mt-5 rounded-lg border border-edge bg-surface2/40 p-4">
        <p className="section-label mb-1">{s.sections.provider}</p>
        <p className="text-xs leading-relaxed text-muted">
          <span className="font-medium text-ink">{vm.narrativeProvider}</span>{" "}
          · narrative mode: {vm.narrativeMode}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-faint">
          {vm.fallbackStatus}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          {s.providerHeading}
        </p>
      </div>

      {/* Safety labels. */}
      <div className="mt-5">
        <p className="section-label mb-2">{s.sections.safety}</p>
        <ul className="flex flex-wrap gap-1.5">
          {vm.safety.map((label, i) => (
            <li
              key={i}
              className="inline-flex items-center gap-1 rounded-full border border-edge bg-surface2/50 px-2.5 py-1 text-[11px] text-faint"
            >
              <ShieldCheck size={11} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-faint">
        {vm.provenance} · {COMPANION_STRINGS.footerNote}
      </p>
    </section>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <Circle size={7} className="mt-1.5 shrink-0 text-faint" aria-hidden="true" />
      <span className="text-faint">{label}:</span>
      <span className="text-ink">{value}</span>
    </li>
  );
}

function CompanionActionButton({
  action,
  variant,
  icon,
  onClick,
}: {
  action: CompanionAction;
  variant: "primary" | "ghost";
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  const className = cx(
    "btn focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
    variant === "primary" ? "btn-primary" : "btn-ghost",
  );
  // When a handler is supplied (in the guided demo), the action drives the flow
  // in place; otherwise it navigates to the existing governed surface.
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {variant === "primary" ? null : icon}
        {action.label}
        {variant === "primary" ? icon : null}
      </button>
    );
  }
  return (
    <a href={action.href} className={className}>
      {variant === "primary" ? null : icon}
      {action.label}
      {variant === "primary" ? icon : null}
    </a>
  );
}

function urgencyChipClass(urgency: string): string {
  switch (urgency) {
    case "critical":
      return "border-risk/40 bg-risk/10 text-risk";
    case "high":
      return "border-brand/50 bg-brand/10 text-brand-bright";
    case "medium":
      return "border-gov/40 bg-gov/10 text-gov-bright";
    case "low":
      return "border-edge bg-surface2/50 text-muted";
    default:
      return "border-edge bg-surface2/50 text-faint";
  }
}
