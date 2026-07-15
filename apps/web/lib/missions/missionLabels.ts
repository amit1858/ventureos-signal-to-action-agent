// Release 2.2 — Mission Control · business-language label map (F1 correction)
// ===========================================================================
// Deterministic, presentation-only mapping from the governed raw identifiers a
// mission carries (intents, template ids, action types, permitted actions,
// verification-check names, simulated target types) to the business-readable
// labels the PRIMARY Mission Control UI shows. The raw ids are NEVER discarded —
// callers keep them for the opt-in technical evidence sections; this layer only
// decides what a business reviewer reads by default.
//
// This owns NO governance and re-derives nothing: it is a pure lookup with a
// humanising fallback so an unmapped id degrades to a readable phrase instead of
// leaking a snake_case / kebab-case internal token.
//
// Pure module: types + plain functions only (no JSX, no globals, no network).

/** Humanise an unmapped raw id into a readable phrase (fallback only). Strips a
 * trailing version suffix (`-v1`), splits on separators, and sentence-cases. */
export function humanizeId(id: string): string {
  const base = id
    .replace(/[-_]v\d+$/i, "")
    .replace(/[/:]/g, " ")
    .replace(/[-_]+/g, " ")
    .trim();
  if (base.length === 0) return id;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

const INTENT_LABELS: Record<string, string> = {
  risk_review: "Renewal risk review",
  status: "Account status review",
  next_step: "Next best step",
  recap: "Account recap",
  resume: "Resume mission",
};

const TEMPLATE_LABELS: Record<string, string> = {
  "renewal-risk-parallel-v1": "Renewal protection mission",
  "support-escalation-sequential-v1": "Support escalation mission",
};

const ACTION_LABELS: Record<string, string> = {
  renewal_outreach: "Prepare renewal outreach",
  stakeholder_brief: "Prepare stakeholder briefing",
};

const PERMITTED_ACTION_LABELS: Record<string, string> = {
  simulate_renewal_outreach: "Prepare customer renewal email",
  simulate_stakeholder_brief: "Prepare stakeholder briefing",
};

const CHECK_LABELS: Record<string, string> = {
  identity_resolved: "Customer identity confirmed",
  evidence_sufficient: "Required evidence available",
  policy_passed: "Governance checks passed",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  email: "Customer email",
  crm_task: "CRM task",
  risk_update: "Risk update",
};

/** Business label for a governed conversation intent (e.g. `risk_review`). */
export function intentLabel(id: string): string {
  return INTENT_LABELS[id] ?? humanizeId(id);
}

/** Business label for a mission template id (e.g. `renewal-risk-parallel-v1`). */
export function templateLabel(id: string): string {
  return TEMPLATE_LABELS[id] ?? humanizeId(id);
}

/** Business label for a recommended action type (e.g. `renewal_outreach`). */
export function actionLabel(id: string): string {
  return ACTION_LABELS[id] ?? humanizeId(id);
}

/** Business label for a permitted (simulate_*) action id. */
export function permittedActionLabel(id: string): string {
  return PERMITTED_ACTION_LABELS[id] ?? humanizeId(id);
}

/** Business label for a verification check name (e.g. `identity_resolved`). */
export function checkLabel(id: string): string {
  return CHECK_LABELS[id] ?? humanizeId(id);
}

/** Business label for a simulated action target type (e.g. `crm_task`). */
export function targetTypeLabel(id: string): string {
  return TARGET_TYPE_LABELS[id] ?? humanizeId(id);
}
