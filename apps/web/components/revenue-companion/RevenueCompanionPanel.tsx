"use client";

import * as React from "react";
import {
  Sparkles,
  ArrowRight,
  FileSearch,
  ShieldCheck,
  CheckCircle2,
  Circle,
  ChevronDown,
} from "lucide-react";

import { buildVoiceBriefingRequest } from "@/lib/revenue-companion/voice/voiceRequest";
import type {
  RevenueCompanionViewModel,
  CompanionAction,
} from "@/lib/revenue-companion/companionContract";
import { COMPANION_STRINGS } from "@/lib/revenue-companion/strings";
import { cx } from "@/lib/format";
import {
  VoicePlaybackControl,
  type VoiceStatusProp,
} from "./VoicePlaybackControl";

// Presentational, read-only Revenue Companion panel, in an executive-brief
// order: AI speaks first with a natural-language headline, then one governed
// recommendation and an optional spoken briefing, then a compact governed
// status. Supporting evidence, how-generated, and technical provenance are
// available on demand (progressive disclosure) so the first read stays calm and
// decision-first. The panel owns no governed state and performs no mutation; its
// actions only open the existing governed surface.
export function RevenueCompanionPanel({
  vm,
  voiceStatus,
  onPrimary,
  onSecondary,
}: {
  vm: RevenueCompanionViewModel;
  voiceStatus?: VoiceStatusProp;
  onPrimary?: () => void;
  onSecondary?: () => void;
}) {
  const s = COMPANION_STRINGS;
  return (
    <section className="card-elevated p-6" aria-labelledby="companion-heading">
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

      {/* Executive headline + narrative — the natural-language briefing. */}
      <h2
        id="companion-heading"
        className="mt-3 text-xl font-semibold leading-snug text-ink"
      >
        {vm.narrativeHeadline}
      </h2>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        {vm.narrativeBody}
      </p>

      {/* Compact identity + account line. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-faint">{s.sections.identity}:</span>
        <span className="font-medium text-ink">{vm.accountDisplayName}</span>
        <span className="text-faint">·</span>
        <span className="text-muted">{vm.identityStatus}</span>
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

        {/* Optional spoken briefing sits with the recommendation. */}
        {voiceStatus ? (
          <VoicePlaybackControl
            status={voiceStatus}
            request={buildVoiceBriefingRequest(vm)}
          />
        ) : null}
      </div>

      {/* Compact governed status: one plain line + detail on demand. */}
      <div className="mt-5">
        <p className="section-label mb-1">{s.sections.status}</p>
        <p className="text-sm text-ink">{s.statusHeadline}</p>
        <Disclosure summary={s.disclosures.governedStatus}>
          <ul className="space-y-1.5">
            <StatusLine label="Governance" value={vm.governanceStatus} />
            <StatusLine label="Approval" value={vm.approvalStatus} />
            <StatusLine label="Execution" value={vm.executionStatus} />
          </ul>
        </Disclosure>
      </div>

      {/* Supporting evidence — collapsed by default. */}
      <Disclosure summary={s.disclosures.supportingEvidence} className="mt-4">
        <div>
          <p className="section-label mb-1">{s.sections.whatChanged}</p>
          <p className="text-sm text-ink">
            <span className="font-medium">{vm.signalLabel}</span>
            {vm.accountDisplayName ? (
              <span className="text-muted"> · {vm.accountDisplayName}</span>
            ) : null}
          </p>
          {vm.signalSummary ? (
            <p className="mt-1 font-mono text-xs leading-relaxed text-faint">
              {vm.signalSummary}
            </p>
          ) : null}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {vm.businessImpact}
        </p>
        <ul className="mt-3 space-y-1">
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
      </Disclosure>

      {/* How this briefing was generated — provider truth, collapsed. */}
      <Disclosure summary={s.disclosures.howGenerated} className="mt-3">
        <p className="text-xs leading-relaxed text-muted">
          <span className="font-medium text-ink">{vm.narrativeProvider}</span> ·
          narrative mode: {vm.narrativeMode}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-faint">
          {vm.fallbackStatus}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          {s.providerHeading}
        </p>
      </Disclosure>

      {/* Technical provenance — safety labels + provenance, collapsed. */}
      <Disclosure summary={s.disclosures.technicalProvenance} className="mt-3">
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
        <p className="mt-3 text-[11px] leading-relaxed text-faint">
          {vm.provenance} · {s.footerNote}
        </p>
      </Disclosure>
    </section>
  );
}

// A lightweight native disclosure (keyboard-accessible, no extra JS state).
function Disclosure({
  summary,
  children,
  className,
}: {
  summary: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={cx("group mt-2", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md py-1 text-xs font-medium text-faint transition-colors hover:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60">
        <ChevronDown
          size={13}
          aria-hidden="true"
          className="transition-transform group-open:rotate-180"
        />
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
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
