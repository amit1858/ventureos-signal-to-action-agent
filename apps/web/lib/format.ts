// Presentation helpers: formatting + colour mapping for the console UI.
import type { Polarity } from "./types";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const ACTION_LABELS: Record<string, string> = {
  follow_up: "Schedule follow-up",
  reactivation: "Reactivation outreach",
  optimization_review: "Optimization review",
  support_escalation: "Escalate support",
  renewal_prep: "Renewal prep",
  monitor: "Monitor only",
};

export function actionLabel(actionType: string): string {
  return ACTION_LABELS[actionType] ?? titleCase(actionType);
}

export function polarityClasses(polarity: Polarity | string): string {
  switch (polarity) {
    case "positive":
      return "border-accent/40 bg-accent/10 text-accent";
    case "negative":
      return "border-risk/40 bg-risk/10 text-risk";
    default:
      return "border-edge bg-surface2 text-muted";
  }
}

// Confidence/score colour ramp: red -> amber -> green.
export function scoreTone(value: number): { text: string; bar: string; ring: string } {
  if (value >= 0.75) return { text: "text-accent", bar: "bg-accent", ring: "ring-accent/40" };
  if (value >= 0.5) return { text: "text-amber", bar: "bg-amber", ring: "ring-amber/40" };
  return { text: "text-risk", bar: "bg-risk", ring: "ring-risk/40" };
}

export function confidenceLabel(value: number): string {
  if (value >= 0.75) return "High confidence";
  if (value >= 0.5) return "Moderate confidence";
  return "Low confidence";
}

// Normalised, business-readable mapping for evidence source systems.
// Backend emits: CRM | Billing | Support | Telemetry | Marketing | derived.
export interface SourceMeta {
  label: string;
  key: "crm" | "spend" | "support" | "usage" | "campaign" | "derived";
}

const SOURCE_META: Record<string, SourceMeta> = {
  CRM: { label: "CRM", key: "crm" },
  Billing: { label: "Spend", key: "spend" },
  Support: { label: "Support", key: "support" },
  Telemetry: { label: "Product Usage", key: "usage" },
  Marketing: { label: "Campaign", key: "campaign" },
  derived: { label: "Derived", key: "derived" },
};

export function sourceMeta(system: string): SourceMeta {
  return SOURCE_META[system] ?? { label: titleCase(system), key: "derived" };
}

export function governanceTone(status: string): { label: string; cls: string } {
  switch (status) {
    case "ok":
      return { label: "Evidence sufficient", cls: "border-accent/40 bg-accent/10 text-accent" };
    case "insufficient_evidence":
      return { label: "Insufficient evidence", cls: "border-risk/40 bg-risk/10 text-risk" };
    case "review_required":
    default:
      return { label: "Review required", cls: "border-amber/40 bg-amber/10 text-amber" };
  }
}

export function approvalTone(status: string): { label: string; cls: string } {
  switch (status) {
    case "approved":
      return { label: "Approved", cls: "border-accent/50 bg-accent/15 text-accent" };
    case "rejected":
      return { label: "Rejected", cls: "border-risk/50 bg-risk/15 text-risk" };
    case "pending":
    default:
      return { label: "Awaiting human approval", cls: "border-amber/50 bg-amber/15 text-amber" };
  }
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const secs = Math.max(1, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}
