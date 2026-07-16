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

/** Business labels for evidence / signal categories shown in primary content
 * (mandatory evidence, why-at-risk chips). Raw ids stay available for Technical
 * Evidence and audit. Unmapped ids humanise (e.g. `renewal_risk` -> "Renewal
 * risk") rather than leaking a snake_case token. */
const CATEGORY_LABELS: Record<string, string> = {
  renewal_risk: "Renewal risk",
  account_health: "Account health",
  renewal_timeline: "Renewal timeline",
  usage_trend: "Usage trend",
  decision: "Decision",
  engagement: "Engagement",
};

/** Business labels for provenance source modules shown in primary content. Raw
 * module ids remain the canonical technical identifier for traceability. */
const SOURCE_MODULE_LABELS: Record<string, string> = {
  decision_ledger: "Decision ledger",
  account_timeline: "Account timeline",
  mission_audit: "Mission audit",
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

/** Business label for an evidence / signal category (e.g. `renewal_timeline`).
 * Raw id is kept by callers for Technical Evidence / audit. */
export function categoryLabel(id: string): string {
  return CATEGORY_LABELS[id] ?? humanizeId(id);
}

/** Business label for a provenance source module (e.g. `decision_ledger`). The
 * raw module id remains the canonical technical identifier for traceability. */
export function sourceModuleLabel(id: string): string {
  return SOURCE_MODULE_LABELS[id] ?? humanizeId(id);
}

/** Raw governed identifiers that must not appear verbatim inside PRIMARY business
 * prose (evidence summaries, mission-objective / success-criteria sentences).
 * Each maps to its readable, lower-case in-prose form; sentence capitalization is
 * re-applied afterwards so a leading token reads naturally (e.g. `renewal_risk
 * mission objective…` -> `Renewal-risk mission objective…`). Raw ids stay in
 * `title=` / Technical Evidence for traceability — this only changes what a
 * business reviewer reads by default. Reuses the same taxonomy as the label maps
 * above; it does not introduce a competing source of truth. */
const PROSE_TOKEN_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ["renewal_risk", "renewal-risk"],
  ["account_health", "account health"],
  ["renewal_timeline", "renewal timeline"],
  ["usage_trend", "usage trend"],
  ["renewal_outreach", "renewal outreach"],
  ["stakeholder_brief", "stakeholder briefing"],
  ["mission-audit", "mission audit"],
  ["mission_audit", "mission audit"],
  ["decision_ledger", "decision ledger"],
  ["account_timeline", "account timeline"],
];

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace any embedded raw governed identifier inside a PRIMARY business sentence
 * with its readable form, then sentence-case the first character. Purely a
 * label substitution — it introduces no new fact, number, or clause; it only
 * swaps a known internal token for the human phrase it already denotes. Callers
 * keep the raw text for `title=` / Technical Evidence. Safe for both the frozen
 * demo payload and the live harness payload, which share these token shapes. */
export function projectBusinessText(text: string): string {
  let out = text ?? "";
  for (const [raw, readable] of PROSE_TOKEN_REPLACEMENTS) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(raw)}\\b`, "g"), readable);
  }
  const trimmed = out.trim();
  if (trimmed.length === 0) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Business label for a mandatory-evidence summary. The governed payload encodes
 * these as `mandatory evidence: <category>` (raw token in the display string); we
 * present the governance meaning ("Required evidence") and keep the raw summary in
 * `title=`. Live summaries that are already natural business text are projected
 * token-safe instead of overwritten. */
export function evidenceRequirementLabel(summary: string): string {
  if (/^\s*mandatory evidence\s*:/i.test(summary ?? "")) return "Required evidence";
  return projectBusinessText(summary);
}
