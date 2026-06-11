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

export interface BusinessAction {
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

function build(label: string, icon: LucideIcon, value: string, urgency: Urgency): BusinessAction {
  const u = URGENCY[urgency];
  return { label, icon, value, urgency, urgencyLabel: u.label, tone: u.tone, ring: u.ring, bg: u.bg };
}

export function businessAction(actionType: string, ctx: ActionContext = {}): BusinessAction {
  switch (actionType) {
    case "support_escalation":
      return build("Recover At-Risk Customer", ShieldAlert, "Protect recurring revenue and prevent churn", "critical");
    case "renewal_prep":
      return build("Executive Renewal Call", CalendarClock, "Secure and de-risk the upcoming renewal", "this_week");
    case "optimization_review":
      return build("Strategic Account Review", LineChart, "Reverse declining spend and restore value", "this_week");
    case "reactivation":
      return build("Win-Back Outreach", RotateCcw, "Re-establish value on a fading account", "this_week");
    case "follow_up": {
      if ((ctx.growthPotential ?? 0) >= OPP_HIGH)
        return build("Cross-sell AI Copilot Bundle", PackagePlus, "Expand the account with an add-on bundle", "opportunity");
      if ((ctx.productUsage ?? 100) < 55)
        return build("Schedule Adoption Workshop", GraduationCap, "Drive deeper product adoption", "opportunity");
      return build("Proactive Check-in", MessageCircle, "Confirm account health and surface new needs", "this_week");
    }
    case "monitor":
      if (ctx.governanceStatus === "insufficient_evidence")
        return build("Route for Manual Review", Search, "Evidence is too thin for an automated call", "review");
      return build("Do Not Contact Yet", PauseCircle, "Account is stable — hold outreach for now", "hold");
    default:
      return build(
        actionType.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        MessageCircle,
        "Review and decide the next step",
        "this_week",
      );
  }
}
