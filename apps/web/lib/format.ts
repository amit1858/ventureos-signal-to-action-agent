// Presentation helpers: formatting + colour mapping for the console UI.
import type { Polarity } from "./types";
import { businessAction, type ActionContext } from "./actions";

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

// Compact Indian-rupee formatting (Cr / L) for executive money KPIs. The
// portfolio is India-led and SMB-scale, so crores/lakhs read naturally.
export function inrCompact(value: number): string {
  const n = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (n >= 1e7) return `${sign}₹${(n / 1e7).toFixed(n / 1e7 >= 10 ? 0 : 1)} Cr`;
  if (n >= 1e5) return `${sign}₹${(n / 1e5).toFixed(n / 1e5 >= 10 ? 0 : 1)} L`;
  if (n >= 1e3) return `${sign}₹${Math.round(n / 1e3)}K`;
  return `${sign}₹${Math.round(n)}`;
}

export function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Executive, business-readable action label. Delegates to the shared
// business-action mapping so the table, cards and workspace stay consistent.
export function actionLabel(actionType: string, ctx?: ActionContext): string {
  return businessAction(actionType, ctx).label;
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
