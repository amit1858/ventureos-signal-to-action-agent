// Business-action mapping.
//
// Translates the backend's technical `action_type` into an executive,
// business-readable next-best action — with an icon, a one-line business
// value statement, and an urgency band. Pure + presentation-free (icons are
// component references only); no backend changes.
//
// `follow_up` and `monitor` are intentionally overloaded by the action agent,
// so we disambiguate them client-side using governance status and the
// account's growth / adoption scores (all already available in the payload).
//
// A single `resolveActionKey()` is the source of truth for *which* business
// action applies. Both the presentation mapping (`businessAction`) and the
// deterministic reasoning layer (lib/reasoning.ts) branch on the same key, so
// labels, timing, estimates and expected-outcome copy never drift apart.

import type { LucideIcon } from "lucide-react";
import {
  ShieldAlert,
  CalendarClock,
  LineChart,
  RotateCcw,
  PackagePlus,
  GraduationCap,
  MessageCircle,
  Search,
  PauseCircle,
} from "lucide-react";
import { OPP_HIGH } from "./portfolio";

export type Urgency = "critical" | "this_week" | "opportunity" | "review" | "hold";

// Stable, presentation-free identifier for the resolved next-best action.
export type ActionKey =
  | "recover"
  | "renewal"
  | "review"
  | "winback"
  | "crosssell"
  | "adoption"
  | "checkin"
  | "manual_review"
  | "hold"
  | "generic";

export interface BusinessAction {
  key: ActionKey;
  label: string;
  icon: LucideIcon;
  value: string; // one-line business value
  urgency: Urgency;
  urgencyLabel: string;
  tone: string; // tailwind text token
  ring: string; // tailwind border token
  bg: string; // tailwind bg token
}

export interface ActionContext {
  governanceStatus?: string;
  growthPotential?: number;
  productUsage?: number;
}

const URGENCY: Record<Urgency, { label: string; tone: string; ring: string; bg: string }> = {
  critical: { label: "Act within 48h", tone: "text-risk", ring: "border-risk/40", bg: "bg-risk/10" },
  this_week: { label: "This week", tone: "text-amber", ring: "border-amber/40", bg: "bg-amber/10" },
  opportunity: { label: "Growth play", tone: "text-accent", ring: "border-accent/40", bg: "bg-accent/10" },
  review: { label: "Needs review", tone: "text-cyan", ring: "border-cyan/30", bg: "bg-cyan/10" },
  hold: { label: "Hold outreach", tone: "text-faint", ring: "border-edge", bg: "bg-surface2/60" },
};

// Resolve the technical action_type (+ context) to a single business action key.
export function resolveActionKey(actionType: string, ctx: ActionContext = {}): ActionKey {
  switch (actionType) {
    case "support_escalation":
      return "recover";
    case "renewal_prep":
      return "renewal";
    case "optimization_review":
      return "review";
    case "reactivation":
      return "winback";
    case "follow_up":
      if ((ctx.growthPotential ?? 0) >= OPP_HIGH) return "crosssell";
      if ((ctx.productUsage ?? 100) < 55) return "adoption";
      return "checkin";
    case "monitor":
      if (ctx.governanceStatus === "insufficient_evidence") return "manual_review";
      return "hold";
    default:
      return "generic";
  }
}

interface ActionDef {
  label: string;
  icon: LucideIcon;
  value: string;
  urgency: Urgency;
}

const ACTION_DEF: Record<Exclude<ActionKey, "generic">, ActionDef> = {
  recover: {
    label: "Recover At-Risk Customer",
    icon: ShieldAlert,
    value: "Protect recurring revenue and prevent churn",
    urgency: "critical",
  },
  renewal: {
    label: "Executive Renewal Call",
    icon: CalendarClock,
    value: "Secure and de-risk the upcoming renewal",
    urgency: "this_week",
  },
  review: {
    label: "Strategic Account Review",
    icon: LineChart,
    value: "Reverse declining spend and restore value",
    urgency: "this_week",
  },
  winback: {
    label: "Win-Back Motion",
    icon: RotateCcw,
    value: "Re-establish value on a fading account",
    urgency: "this_week",
  },
  crosssell: {
    label: "Cross-sell AI Copilot Bundle",
    icon: PackagePlus,
    value: "Expand the account with an add-on bundle",
    urgency: "opportunity",
  },
  adoption: {
    label: "Schedule Adoption Workshop",
    icon: GraduationCap,
    value: "Drive deeper product adoption",
    urgency: "opportunity",
  },
  checkin: {
    label: "Proactive Check-in",
    icon: MessageCircle,
    value: "Confirm account health and surface new needs",
    urgency: "this_week",
  },
  manual_review: {
    label: "Route for Review",
    icon: Search,
    value: "Evidence is too thin for an automated call",
    urgency: "review",
  },
  hold: {
    label: "Do Not Contact Yet",
    icon: PauseCircle,
    value: "Account is stable — hold outreach for now",
    urgency: "hold",
  },
};

function build(key: ActionKey, label: string, icon: LucideIcon, value: string, urgency: Urgency): BusinessAction {
  const u = URGENCY[urgency];
  return { key, label, icon, value, urgency, urgencyLabel: u.label, tone: u.tone, ring: u.ring, bg: u.bg };
}

export function businessAction(actionType: string, ctx: ActionContext = {}): BusinessAction {
  const key = resolveActionKey(actionType, ctx);
  if (key === "generic") {
    return build(
      "generic",
      actionType.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      MessageCircle,
      "Review and decide the next step",
      "this_week",
    );
  }
  const d = ACTION_DEF[key];
  return build(key, d.label, d.icon, d.value, d.urgency);
}

// Human-readable timing phrase for the brief / narrative ("…within 48 hours").
export function timingPhrase(urgency: Urgency): string {
  switch (urgency) {
    case "critical":
      return "within 48 hours";
    case "this_week":
    case "opportunity":
      return "this week";
    case "review":
      return "after a quick review";
    case "hold":
    default:
      return "no action needed yet";
  }
}

// Deterministic, believable time-to-complete estimate (minutes) for an action.
// Base effort per action key, nudged by how much evidence must be reviewed.
const ACTION_MINUTES: Record<ActionKey, number> = {
  recover: 36,
  renewal: 34,
  review: 30,
  winback: 28,
  crosssell: 30,
  adoption: 55,
  checkin: 18,
  manual_review: 12,
  hold: 0,
  generic: 25,
};

export function estimateActionMinutes(key: ActionKey, evidenceCount = 0): number {
  return ACTION_MINUTES[key] + Math.min(Math.max(evidenceCount, 0), 10);
}
