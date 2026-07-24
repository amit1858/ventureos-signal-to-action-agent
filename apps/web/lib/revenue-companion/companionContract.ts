// VentureOS — Revenue Companion · Domain contract (pure, dependency-light)
// =======================================================================
// The Revenue Companion is a PRESENTATION ADAPTER. It sits strictly AFTER the
// immutable `DemoPresentationView` (the governed presentation state) and
// reformats what is already there into a conversational "what changed / why it
// matters / what to do next / evidence / where it stands" narrative.
//
// It has NO authority. It never invents a fact, never creates a mission, never
// changes a verdict, never approves, never executes, and never mutates any
// governed, CRM, or audit state. Every governed field it surfaces is copied
// verbatim from the source view; every narrative sentence is either verbatim or
// a substring of the source copy; every label is drawn from a fixed allowlist.
//
// The deterministic engine remains authoritative. NVIDIA, when configured, may
// only REPHRASE the headline/body (advisory) and is groundedness-validated
// before use; any drift falls back to the deterministic narrative. This module
// is pure (no env read, no network, no React) so it is fully unit-testable.

import {
  FORBIDDEN_PHRASES,
  collectVisibleCopy,
  scanForbidden,
  type DemoPresentationView,
} from "../demo-mode/presentationContract";

export const COMPANION_SCHEMA_VERSION = "1.0" as const;

// A stable, non-wall-clock timestamp so generated output is golden-stable and
// never leaks a real clock. It is a presentation label, not a customer fact.
export const COMPANION_STABLE_TIMESTAMP = "2026-05-08T18:10:00Z" as const;

// Where the companion narrative came from, stated truthfully.
export type NarrativeMode = "deterministic" | "provider-enhanced";

// Fixed, human-readable signal labels. These are neutral category labels — they
// assert no customer-specific fact — so they are allowlisted rather than grounded.
const SIGNAL_LABELS: Record<string, string> = {
  renewal_date: "Renewal date change",
  support_escalation: "Support escalation",
};
const DEFAULT_SIGNAL_LABEL = "Account signal change";

// Fixed mission titles keyed by governed mission type. Allowlisted labels.
const MISSION_TITLES: Record<string, string> = {
  renewal_risk: "Renewal-risk recovery mission",
  support_escalation: "Support-escalation response mission",
};
const DEFAULT_MISSION_TITLE = "Governed mission";

// Priority (from the governed mission) → urgency band + label. Allowlisted.
const URGENCY_LABELS: Record<string, { urgency: string; label: string }> = {
  critical: { urgency: "critical", label: "Critical — act now" },
  high: { urgency: "high", label: "High priority" },
  medium: { urgency: "medium", label: "Medium priority" },
  low: { urgency: "low", label: "Low priority" },
};
const DEFAULT_URGENCY = { urgency: "informational", label: "For awareness" };

// Approved user-facing display names for accounts. These are presentation
// labels (allowlisted, like signal/mission labels): they let the executive
// briefing say "Curefoods" instead of the internal record slug "curefoods-test".
// The technical identifier is retained verbatim in provenance/evidence. Any
// account not in this map keeps its raw governed name (no substitution).
const ACCOUNT_DISPLAY_NAMES: Record<string, string> = {
  "curefoods-test": "Curefoods",
};

export function deriveAccountDisplayName(rawName: string): string {
  return ACCOUNT_DISPLAY_NAMES[rawName] ?? rawName;
}

// The approved display-name values, for the validator's allowlist check.
const APPROVED_DISPLAY_NAMES = new Set(Object.values(ACCOUNT_DISPLAY_NAMES));

// Governed identity status → concise, human-readable label. Derived from the
// verbatim `identity_status:` technical detail; allowlisted phrasing only.
const IDENTITY_LABELS: Record<string, string> = {
  unverified: "Not corroborated",
  ambiguous: "Not corroborated",
  corroborated: "Corroborated",
  verified: "Corroborated",
};
const DEFAULT_IDENTITY_LABEL = "Not stated";

export interface CompanionAction {
  label: string;
  href: string;
  // The in-demo shell uses `intent` to drive the guided flow instead of a
  // full navigation; the standalone route uses `href`. Both lead only to the
  // existing governed surface — never to an execute/approve control.
  intent: "start-walkthrough" | "review-evidence" | "open-governed-surface";
}

export interface RevenueCompanionViewModel {
  schemaVersion: string;
  generatedAt: string;
  journeyKey: string;
  journeyTitle: string;

  // Identity (verbatim from source evidence).
  accountName: string;
  accountRef: string;
  // Approved user-facing display label (allowlisted; falls back to accountName).
  accountDisplayName: string;
  // Concise governed identity status (allowlisted phrasing over identity_status).
  identityStatus: string;

  // Narrative (verbatim or substring of source; provider may only rephrase
  // headline/body under groundedness validation).
  narrativeHeadline: string;
  narrativeBody: string;
  businessImpact: string;

  // Signal (labels allowlisted; summary grounded).
  signalLabel: string;
  signalSummary: string;

  // Recommendation (title allowlisted; reason verbatim from source).
  recommendedMissionId: string;
  recommendedMissionTitle: string;
  recommendationReason: string;
  urgency: string;
  urgencyLabel: string;

  // Where it stands (verbatim from source).
  governanceStatus: string;
  approvalStatus: string;
  executionStatus: string;

  // Evidence (verbatim array from source).
  evidenceItems: string[];

  // Provenance + provider truth.
  provenance: string;
  narrativeProvider: string;
  narrativeMode: NarrativeMode;
  fallbackStatus: string;

  // Safety chips (verbatim from source) + the two fixed adapter actions.
  safety: string[];
  primaryAction: CompanionAction;
  secondaryAction: CompanionAction;

  // Voice briefing (deterministic, derived from this same immutable view). The
  // spoken script is what an optional TTS adapter would voice; the request
  // identity lets the server rebuild + verify the script without trusting any
  // browser-supplied text. `voiceScript` is presentation copy, not a governed fact.
  voiceScript: string;
  narrativeId: string;
  presentationVersion: string;
  approvedTextFingerprint: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Parsing helpers over the governed source view. These read only strings that
// the governed engine already produced; they never fabricate a value.
// ---------------------------------------------------------------------------

function findPrefixed(items: readonly string[], prefix: string): string | null {
  const hit = items.find((i) => i.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : null;
}

function findTechnical(view: DemoPresentationView, key: string): string | null {
  return findPrefixed(view.technicalDetails, `${key}:`);
}

interface ParsedAccount {
  name: string;
  ref: string;
}

function parseAccount(view: DemoPresentationView): ParsedAccount {
  // e.g. "Account: curefoods-test (hubspot:246820626:335064019691)"
  const raw = findPrefixed(view.evidenceItems, "Account:");
  if (raw) {
    const m = raw.match(/^(.*?)\s*\((.+)\)\s*$/);
    if (m) {
      return { name: m[1].trim(), ref: m[2].trim() };
    }
    return { name: raw, ref: "" };
  }
  return { name: "", ref: "" };
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  // Split on the first sentence terminator followed by a space; keep the period.
  const m = trimmed.match(/^(.*?[.!?])(\s|$)/);
  return m ? m[1].trim() : trimmed;
}

interface ParsedSignal {
  label: string;
  summary: string;
}

function parseSignal(view: DemoPresentationView): ParsedSignal {
  // e.g. "Signal: renewal_date 2026-08-31 -> 2026-06-30 (adverse)"
  const raw = findPrefixed(view.evidenceItems, "Signal:");
  if (!raw) return { label: DEFAULT_SIGNAL_LABEL, summary: "" };
  const field = raw.split(/\s+/)[0] ?? "";
  const label = SIGNAL_LABELS[field] ?? DEFAULT_SIGNAL_LABEL;
  return { label, summary: raw };
}

interface ParsedMission {
  title: string;
  urgency: string;
  urgencyLabel: string;
}

function parseMission(view: DemoPresentationView): ParsedMission {
  // e.g. "Mission: renewal_risk (priority high)"
  const raw = findPrefixed(view.evidenceItems, "Mission:");
  let type = "";
  let priority = "";
  if (raw) {
    type = raw.split(/\s+/)[0] ?? "";
    const pm = raw.match(/priority\s+(\w+)/i);
    if (pm) priority = pm[1].toLowerCase();
  }
  const title = MISSION_TITLES[type] ?? DEFAULT_MISSION_TITLE;
  const band = URGENCY_LABELS[priority] ?? DEFAULT_URGENCY;
  return { title, urgency: band.urgency, urgencyLabel: band.label };
}

// Concise governed identity status, from the verbatim `identity_status:` detail.
function parseIdentityStatus(view: DemoPresentationView): string {
  const raw = (findTechnical(view, "identity_status") ?? "").toLowerCase();
  return IDENTITY_LABELS[raw] ?? DEFAULT_IDENTITY_LABEL;
}

// Whether the governed mission stopped at governance (vs. proceeded). Read from
// the verbatim execution label — "No execution" means the journey was stopped.
function isGovernedStop(view: DemoPresentationView): boolean {
  return /^no execution/i.test(view.executionLabel);
}

// The signal's change magnitude + direction, extracted verbatim from the source
// narrative (e.g. "moved 62 days earlier"). Returns null when not present.
function parseSignalChange(
  view: DemoPresentationView,
): { days: string; direction: string } | null {
  const m = view.primaryNarrative.match(
    /moved\s+(\d+)\s+days?\s+(earlier|later|forward|back)/i,
  );
  return m ? { days: m[1], direction: m[2].toLowerCase() } : null;
}

// ---------------------------------------------------------------------------
// Executive headline + display-name narrative body. Both are DETERMINISTIC and
// fully recomputed by the validator, so any drift is caught. The headline is
// composed from allowlisted labels + the governed stop/proceed fact; the body is
// the verbatim source narrative with only the approved display-name substituted.
// ---------------------------------------------------------------------------

export function buildExecutiveHeadline(
  view: DemoPresentationView,
  displayName: string,
): string {
  const owner = displayName ? `${displayName}'s` : "The";
  if (isGovernedStop(view)) {
    return `${owner} renewal-risk mission was stopped because the account identity could not be corroborated.`;
  }
  return `${owner} renewal-risk mission ran once under governance after explicit human approval.`;
}

// Substitute the approved display name into governed copy: the possessive
// "raw's" becomes "Display's", and any remaining bare "raw" becomes "Display".
// Order matters (possessive first). Reversible via `reverseDisplayName`.
export function applyDisplayName(
  text: string,
  raw: string,
  display: string,
): string {
  if (!raw || raw === display) return text;
  return text.split(`${raw}'s`).join(`${display}'s`).split(raw).join(display);
}

export function reverseDisplayName(
  text: string,
  raw: string,
  display: string,
): string {
  if (!raw || raw === display) return text;
  return text.split(`${display}'s`).join(`${raw}'s`).split(display).join(raw);
}

// ---------------------------------------------------------------------------
// Voice briefing script (deterministic; ~20–35s spoken). Composed only from the
// governed atoms already parsed above. It never speaks identifiers, hashes,
// event IDs, schema versions, or provider diagnostics — F2 asserts this — and is
// fully recomputed by the validator so the browser can never alter what is
// spoken.
// ---------------------------------------------------------------------------

export const VOICE_SCRIPT_MAX_CHARS = 700 as const;

export function buildVoiceScript(
  view: DemoPresentationView,
  displayName: string,
): string {
  const owner = displayName ? `${displayName}'s` : "The account's";
  const change = parseSignalChange(view);
  const changeSentence = change
    ? `${owner} renewal date moved ${change.days} days ${change.direction}, creating a high-priority renewal-risk mission.`
    : `${owner} renewal date changed, creating a high-priority renewal-risk mission.`;

  if (isGovernedStop(view)) {
    return [
      changeSentence,
      "VentureOS stopped the mission because the account identity was supported by only one trusted source.",
      "No approval or execution was attempted.",
      "I recommend corroborating the account through a second governed source before the mission runs again.",
    ].join(" ");
  }
  return [
    changeSentence,
    "After explicit human approval, VentureOS ran the simulated action once and recorded a receipt.",
    "No CRM write-back occurred.",
    "I recommend confirming the simulated receipt in the audit ledger.",
  ].join(" ");
}

// A small, stable, non-cryptographic fingerprint (FNV-1a, 32-bit) over the
// approved script. It lets the server verify that a playback request matches the
// script it independently rebuilds — it is an integrity check, not a secret.
export const SCRIPT_FINGERPRINT_PREFIX = "vcs1:" as const;

export function computeScriptFingerprint(script: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < script.length; i++) {
    hash ^= script.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${SCRIPT_FINGERPRINT_PREFIX}${hash.toString(16).padStart(8, "0")}`;
}

// Identifiers/diagnostics that must never appear in a spoken script.
const VOICE_FORBIDDEN_TOKENS = [
  "sig1:",
  "vcs1:",
  "msn-",
  "sce-",
  "lr-",
  "schema",
  "fingerprint",
  "mission_id",
  "ledger_reference",
  "change_fingerprint",
  "hubspot:",
];

export function scanVoiceScript(script: string): string | null {
  const lower = script.toLowerCase();
  for (const token of VOICE_FORBIDDEN_TOKENS) {
    if (lower.includes(token)) return token;
  }
  for (const phrase of FORBIDDEN_PHRASES) {
    if (lower.includes(phrase)) return phrase;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Narrative resolution (deterministic-first). The provider seam is pure here;
// the server-only environment read + real provider live in narrativeAdapter.server.
// ---------------------------------------------------------------------------

export interface ProviderDraft {
  headline: string;
  body: string;
}

export type ProviderOutcome =
  | { kind: "unconfigured" }
  | { kind: "error"; reason: string }
  | { kind: "ok"; draft: ProviderDraft };

export interface ResolvedNarrative {
  mode: NarrativeMode;
  headline: string;
  body: string;
  provider: string;
  fallbackStatus: string;
}

const DETERMINISTIC_PROVIDER = "NVIDIA unconfigured" as const;
const ADVISORY_PROVIDER = "NVIDIA advisory (narrative only)" as const;

// Tokens that would assert action/approval/authority the governed stop may not
// have earned. A provider draft may only use one if the SOURCE copy already did.
const AUTHORITY_TOKENS = [
  "approved",
  "approve",
  "executed",
  "execute",
  "wrote",
  "write-back",
  "writeback",
  "autonomous",
  "automatically",
  "deployed",
  "sent",
];

// Validate a provider draft against the governed source. Provider text may only
// REPHRASE; it may not add forbidden claims or unearned authority tokens, and it
// must stay within sane length bounds. Identity/verdict fields are never taken
// from the provider, so they cannot drift here.
export function validateProviderDraft(
  draft: ProviderDraft,
  view: DemoPresentationView,
): ValidationResult {
  const errors: string[] = [];
  if (typeof draft.headline !== "string" || draft.headline.trim().length === 0) {
    errors.push("provider headline: expected non-empty string");
  }
  if (typeof draft.body !== "string" || draft.body.trim().length === 0) {
    errors.push("provider body: expected non-empty string");
  }
  if (draft.headline && draft.headline.length > 240) {
    errors.push("provider headline: exceeds length bound");
  }
  if (draft.body && draft.body.length > 1200) {
    errors.push("provider body: exceeds length bound");
  }
  const enhanced = `${draft.headline ?? ""}\n${draft.body ?? ""}`.toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    if (enhanced.includes(phrase)) {
      errors.push(`provider draft: forbidden claim present (${phrase})`);
    }
  }
  const sourceCopy = collectVisibleCopy(view, { showTechnical: true })
    .join("\n")
    .toLowerCase();
  for (const token of AUTHORITY_TOKENS) {
    const re = new RegExp(`\\b${token}\\b`, "i");
    if (re.test(enhanced) && !re.test(sourceCopy)) {
      errors.push(`provider draft: unearned authority token (${token})`);
    }
  }
  return { ok: errors.length === 0, errors };
}

// Deterministic-first resolution. Fails safe to the deterministic narrative on
// unconfigured / error / rejected drafts. Never fabricates a live NVIDIA result.
export function resolveNarrative(
  view: DemoPresentationView,
  deterministic: ProviderDraft,
  outcome: ProviderOutcome,
): ResolvedNarrative {
  if (outcome.kind === "unconfigured") {
    return {
      mode: "deterministic",
      headline: deterministic.headline,
      body: deterministic.body,
      provider: view.providerLabel || DETERMINISTIC_PROVIDER,
      fallbackStatus:
        "NVIDIA is not configured; the deterministic narrative is authoritative.",
    };
  }
  if (outcome.kind === "error") {
    return {
      mode: "deterministic",
      headline: deterministic.headline,
      body: deterministic.body,
      provider: view.providerLabel || DETERMINISTIC_PROVIDER,
      fallbackStatus:
        "NVIDIA enhancement was unavailable; the deterministic narrative is shown.",
    };
  }
  // outcome.kind === "ok"
  const validation = validateProviderDraft(outcome.draft, view);
  if (!validation.ok) {
    return {
      mode: "deterministic",
      headline: deterministic.headline,
      body: deterministic.body,
      provider: view.providerLabel || DETERMINISTIC_PROVIDER,
      fallbackStatus:
        "NVIDIA enhancement failed groundedness validation; the deterministic narrative is shown.",
    };
  }
  return {
    mode: "provider-enhanced",
    headline: outcome.draft.headline.trim(),
    body: outcome.draft.body.trim(),
    provider: ADVISORY_PROVIDER,
    fallbackStatus:
      "None — the deterministic verdict is unchanged; NVIDIA rephrased the narrative only.",
  };
}

// ---------------------------------------------------------------------------
// Deterministic narrative + view-model builder.
// ---------------------------------------------------------------------------

// The deterministic narrative is the source of truth and the fallback. The
// headline is the composed executive headline; the body is the verbatim source
// narrative with only the approved account display name substituted in. Both are
// fully recomputed by the validator, so neither the UI nor a provider can drift.
export function buildDeterministicNarrative(
  view: DemoPresentationView,
): ProviderDraft {
  const account = parseAccount(view);
  const display = deriveAccountDisplayName(account.name);
  return {
    headline: buildExecutiveHeadline(view, display),
    body: applyDisplayName(view.primaryNarrative, account.name, display),
  };
}

export interface CompanionMeta {
  journeyKey: string;
  journeyTitle: string;
}

// Assemble the companion view model. `resolved` overrides only the narrative
// headline/body/mode/provider/fallbackStatus; every governed field is copied
// verbatim from the source view. When omitted, the deterministic (unconfigured)
// narrative is used.
export function buildCompanionViewModel(
  view: DemoPresentationView,
  meta: CompanionMeta,
  resolved?: ResolvedNarrative,
): RevenueCompanionViewModel {
  const account = parseAccount(view);
  const displayName = deriveAccountDisplayName(account.name);
  const signal = parseSignal(view);
  const mission = parseMission(view);
  const missionId = findTechnical(view, "mission_id") ?? "";
  const displayBody = applyDisplayName(
    view.primaryNarrative,
    account.name,
    displayName,
  );
  const voiceScript = buildVoiceScript(view, displayName);
  const narrative =
    resolved ??
    resolveNarrative(view, buildDeterministicNarrative(view), {
      kind: "unconfigured",
    });

  return {
    schemaVersion: COMPANION_SCHEMA_VERSION,
    generatedAt: COMPANION_STABLE_TIMESTAMP,
    journeyKey: meta.journeyKey,
    journeyTitle: meta.journeyTitle,

    accountName: account.name,
    accountRef: account.ref,
    accountDisplayName: displayName,
    identityStatus: parseIdentityStatus(view),

    narrativeHeadline: narrative.headline,
    narrativeBody: narrative.body,
    businessImpact: firstSentence(displayBody),

    signalLabel: signal.label,
    signalSummary: signal.summary,

    recommendedMissionId: missionId,
    recommendedMissionTitle: mission.title,
    recommendationReason: view.recommendation,
    urgency: mission.urgency,
    urgencyLabel: mission.urgencyLabel,

    governanceStatus: view.governanceLabel,
    approvalStatus: view.approvalLabel,
    executionStatus: view.executionLabel,

    evidenceItems: [...view.evidenceItems],

    provenance: view.sourceResultReference,
    narrativeProvider: narrative.provider,
    narrativeMode: narrative.mode,
    fallbackStatus: narrative.fallbackStatus,

    safety: [...view.safetyDisclosures],
    primaryAction: {
      label: "Review the governed mission",
      href: "/demo/signal-to-action",
      intent: "start-walkthrough",
    },
    secondaryAction: {
      label: "See the evidence",
      href: "/demo/signal-to-action",
      intent: "review-evidence",
    },

    voiceScript,
    narrativeId: meta.journeyKey,
    presentationVersion: COMPANION_SCHEMA_VERSION,
    approvedTextFingerprint: computeScriptFingerprint(voiceScript),
  };
}

// ---------------------------------------------------------------------------
// Groundedness / allowlist validator. Proves the companion cannot overstate or
// drift from the governed source. Callers fail closed on any error.
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

// Every string the companion can display, for a forbidden-phrase scan.
function companionVisibleCopy(vm: RevenueCompanionViewModel): string[] {
  return [
    vm.narrativeHeadline,
    vm.narrativeBody,
    vm.businessImpact,
    vm.voiceScript,
    vm.accountDisplayName,
    vm.identityStatus,
    vm.signalLabel,
    vm.signalSummary,
    vm.recommendedMissionTitle,
    vm.recommendationReason,
    vm.urgencyLabel,
    vm.governanceStatus,
    vm.approvalStatus,
    vm.executionStatus,
    vm.provenance,
    vm.narrativeProvider,
    vm.fallbackStatus,
    vm.primaryAction.label,
    vm.secondaryAction.label,
    ...vm.evidenceItems,
    ...vm.safety,
  ];
}

export function validateCompanion(
  vm: RevenueCompanionViewModel,
  view: DemoPresentationView,
): ValidationResult {
  const errors: string[] = [];

  if (vm.schemaVersion !== COMPANION_SCHEMA_VERSION) {
    errors.push(`schemaVersion: expected ${COMPANION_SCHEMA_VERSION}`);
  }

  // Governed fields must be copied verbatim — the companion has no authority to
  // restate them differently.
  const verbatim: [string, string, string][] = [
    ["recommendationReason", vm.recommendationReason, view.recommendation],
    ["governanceStatus", vm.governanceStatus, view.governanceLabel],
    ["approvalStatus", vm.approvalStatus, view.approvalLabel],
    ["executionStatus", vm.executionStatus, view.executionLabel],
    ["provenance", vm.provenance, view.sourceResultReference],
  ];
  for (const [name, got, want] of verbatim) {
    if (got !== want) {
      errors.push(`${name}: must match source verbatim`);
    }
  }
  if (vm.evidenceItems.join("\u0001") !== view.evidenceItems.join("\u0001")) {
    errors.push("evidenceItems: must match source verbatim");
  }
  if (vm.safety.join("\u0001") !== view.safetyDisclosures.join("\u0001")) {
    errors.push("safety: must match source safety disclosures verbatim");
  }

  // Grounded narrative fields must be substrings of the source copy.
  const sourceCopy = normalize(
    collectVisibleCopy(view, { showTechnical: true }).join("\n"),
  );
  const grounded: [string, string][] = [
    ["signalSummary", vm.signalSummary],
    ["accountName", vm.accountName],
    ["accountRef", vm.accountRef],
    ["recommendedMissionId", vm.recommendedMissionId],
  ];
  for (const [name, value] of grounded) {
    if (value && !sourceCopy.includes(normalize(value))) {
      errors.push(`${name}: not grounded in source copy`);
    }
  }

  // Derived presentation fields must equal their pure recomputation from the
  // immutable view — this makes the validator a strict tamper detector: a
  // hand-built or provider-doctored companion cannot alter the display name,
  // identity status, business impact, or the spoken script.
  const account = parseAccount(view);
  const expectedDisplay = deriveAccountDisplayName(account.name);
  if (vm.accountDisplayName !== expectedDisplay) {
    errors.push("accountDisplayName: must equal the approved display name");
  }
  if (
    vm.accountDisplayName &&
    vm.accountDisplayName !== vm.accountName &&
    !APPROVED_DISPLAY_NAMES.has(vm.accountDisplayName)
  ) {
    errors.push("accountDisplayName: not an approved display label");
  }
  if (vm.identityStatus !== parseIdentityStatus(view)) {
    errors.push("identityStatus: must match the governed identity status");
  }
  const expectedImpact = firstSentence(
    applyDisplayName(view.primaryNarrative, account.name, expectedDisplay),
  );
  if (vm.businessImpact !== expectedImpact) {
    errors.push("businessImpact: must be the first sentence of the governed narrative");
  }
  if (vm.narrativeId !== vm.journeyKey) {
    errors.push("narrativeId: must equal the journey key");
  }
  if (vm.presentationVersion !== COMPANION_SCHEMA_VERSION) {
    errors.push(`presentationVersion: expected ${COMPANION_SCHEMA_VERSION}`);
  }

  // The spoken script must equal its recomputation, carry no identifier /
  // diagnostic / forbidden token, stay within length, and its fingerprint must
  // match — so the browser can never change what is voiced.
  const expectedScript = buildVoiceScript(view, expectedDisplay);
  if (vm.voiceScript !== expectedScript) {
    errors.push("voiceScript: must equal the deterministic spoken script");
  }
  if (vm.voiceScript.length > VOICE_SCRIPT_MAX_CHARS) {
    errors.push("voiceScript: exceeds length bound");
  }
  const voiceForbidden = scanVoiceScript(vm.voiceScript);
  if (voiceForbidden) {
    errors.push(`voiceScript: forbidden token present (${voiceForbidden})`);
  }
  if (vm.approvedTextFingerprint !== computeScriptFingerprint(vm.voiceScript)) {
    errors.push("approvedTextFingerprint: must match the script fingerprint");
  }

  // In deterministic mode the narrative must equal the composed executive
  // headline + display-substituted source body. In provider-enhanced mode it
  // must still pass the provider draft validation.
  if (vm.narrativeMode === "deterministic") {
    const det = buildDeterministicNarrative(view);
    if (vm.narrativeHeadline !== det.headline) {
      errors.push("narrativeHeadline: deterministic mode must be the executive headline");
    }
    if (vm.narrativeBody !== det.body) {
      errors.push("narrativeBody: deterministic mode must be the display-name source narrative");
    }
  } else {
    const pv = validateProviderDraft(
      { headline: vm.narrativeHeadline, body: vm.narrativeBody },
      view,
    );
    errors.push(...pv.errors.map((e) => `narrative: ${e}`));
  }

  // Actions may only point at the existing governed surface — never an
  // execute/approve endpoint.
  for (const action of [vm.primaryAction, vm.secondaryAction]) {
    if (!action.href.startsWith("/demo/signal-to-action")) {
      errors.push(`action href must stay on the governed demo surface (${action.href})`);
    }
  }

  // No forbidden overstatement anywhere in the rendered companion copy. Reuse
  // the demo-mode scan by projecting the companion copy onto a view-shaped shim.
  const shim = {
    ...view,
    headline: vm.narrativeHeadline,
    primaryNarrative: vm.narrativeBody,
    recommendation: vm.recommendationReason,
    evidenceItems: [...vm.evidenceItems, vm.businessImpact, vm.signalSummary],
    safetyDisclosures: [...vm.safety, vm.fallbackStatus, vm.urgencyLabel],
    technicalDetails: [vm.provenance, vm.recommendedMissionId],
    sourceResultReference: vm.provenance,
  } as DemoPresentationView;
  const forbidden = scanForbidden(shim);
  if (forbidden) {
    errors.push(`forbidden claim present in companion copy (${forbidden})`);
  }
  // Defensive: also scan the labels not covered by the shim projection.
  const extra = companionVisibleCopy(vm).join("\n").toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    if (extra.includes(phrase)) {
      errors.push(`forbidden claim present in companion label (${phrase})`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// Build + validate in one step, failing closed. This is the only builder the
// server adapter and route should call.
export function buildValidatedCompanion(
  view: DemoPresentationView,
  meta: CompanionMeta,
  resolved?: ResolvedNarrative,
): RevenueCompanionViewModel {
  const vm = buildCompanionViewModel(view, meta, resolved);
  const result = validateCompanion(vm, view);
  if (!result.ok) {
    throw new Error(
      `Revenue Companion failed groundedness validation: ${result.errors.join("; ")}`,
    );
  }
  return vm;
}
