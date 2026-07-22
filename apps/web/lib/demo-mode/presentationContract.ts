// VentureOS — Demo Mode · Presentation contract (web mirror)
// ==========================================================
// Dependency-free TypeScript mirror of the committed Python presentation
// contract (`services/api/live_signals/presentation.py` ->
// `PresentationViewModel`). The web Demo Mode is a *consumer only*: it renders a
// build-time-generated projection of the two committed governed
// `DemoJourneyResult` fixtures and never re-runs detection, mission selection,
// governance, approval, or execution.
//
// Parity is guaranteed on two sides:
//   * Python `presentation_web_export.py --check` (golden) proves the generated
//     JSON matches the authoritative projection;
//   * the validators here fail closed on any drift or snake_case key leak before
//     the page renders.
//
// No field in this module can change product state. Everything is read-only copy.

export const PRESENTATION_SCHEMA_VERSION = "1.0" as const;

// Exact forbidden-claim list mirrored from `presentation.py` FORBIDDEN_PHRASES.
// A generated view containing any of these is rejected — Demo Mode must never
// overstate what the governed result proved.
export const FORBIDDEN_PHRASES: readonly string[] = [
  "autonomous execution",
  "production execution",
  "live multi-source identity",
  "crm action completed",
  "fully automated",
  "ai approved",
  "nvidia decided",
  "real crm write-back",
  "action executed in hubspot",
  "fully automated revenue operations",
  "production-ready end-to-end execution",
  "live salesforce corroboration",
];

// The 16 camelCase fields of a projected presentation view (mirrors the frozen
// PresentationViewModel field set, camelCased for the wire).
export interface DemoPresentationView {
  schemaVersion: string;
  headline: string;
  primaryNarrative: string;
  recommendation: string;
  journeyLabel: string;
  governanceLabel: string;
  approvalLabel: string;
  executionLabel: string;
  evidenceItems: string[];
  auditLabel: string;
  replayLabel: string;
  providerLabel: string;
  safetyDisclosures: string[];
  statusTone: string;
  technicalDetails: string[];
  sourceResultReference: string;
}

export interface DemoJourney {
  key: string;
  title: string;
  subtitle: string;
  supportsReplayEvidenceToggle: boolean;
  view: DemoPresentationView;
  replayValidatedView: DemoPresentationView | null;
}

export interface DemoJourneysDoc {
  schemaVersion: string;
  generatedBy: string;
  generatedFrom: string[];
  defaultJourneyKey: string;
  journeys: DemoJourney[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const VIEW_STRING_FIELDS: readonly (keyof DemoPresentationView)[] = [
  "schemaVersion",
  "headline",
  "primaryNarrative",
  "recommendation",
  "journeyLabel",
  "governanceLabel",
  "approvalLabel",
  "executionLabel",
  "auditLabel",
  "replayLabel",
  "providerLabel",
  "statusTone",
  "sourceResultReference",
];

const VIEW_STRING_ARRAY_FIELDS: readonly (keyof DemoPresentationView)[] = [
  "evidenceItems",
  "safetyDisclosures",
  "technicalDetails",
];

export const VIEW_FIELD_NAMES: readonly string[] = [
  ...VIEW_STRING_FIELDS,
  ...VIEW_STRING_ARRAY_FIELDS,
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

// A contract key must be camelCase — no snake_case keys may leak across the wire.
function hasSnakeCaseKey(keys: string[]): string | null {
  for (const k of keys) {
    if (k.includes("_")) {
      return k;
    }
  }
  return null;
}

export function validatePresentationView(
  value: unknown,
  path = "view",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { ok: false, errors: [`${path}: expected object`] };
  }
  const keys = Object.keys(value);
  const snake = hasSnakeCaseKey(keys);
  if (snake) {
    errors.push(`${path}: snake_case contract key leaked (${snake})`);
  }
  const expected = new Set<string>(VIEW_FIELD_NAMES);
  for (const k of keys) {
    if (!expected.has(k)) {
      errors.push(`${path}: unexpected field (${k})`);
    }
  }
  for (const field of VIEW_STRING_FIELDS) {
    if (!isString(value[field])) {
      errors.push(`${path}.${String(field)}: expected string`);
    }
  }
  for (const field of VIEW_STRING_ARRAY_FIELDS) {
    if (!isStringArray(value[field])) {
      errors.push(`${path}.${String(field)}: expected string[]`);
    }
  }
  if (isString(value.schemaVersion) && value.schemaVersion !== PRESENTATION_SCHEMA_VERSION) {
    errors.push(
      `${path}.schemaVersion: expected ${PRESENTATION_SCHEMA_VERSION}, got ${value.schemaVersion}`,
    );
  }
  // Fail closed on any forbidden overstatement in the rendered copy.
  if (errors.length === 0) {
    const hit = scanForbidden(value as unknown as DemoPresentationView);
    if (hit) {
      errors.push(`${path}: forbidden claim present (${hit})`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateDemoJourney(value: unknown, path = "journey"): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { ok: false, errors: [`${path}: expected object`] };
  }
  if (!isString(value.key)) errors.push(`${path}.key: expected string`);
  if (!isString(value.title)) errors.push(`${path}.title: expected string`);
  if (!isString(value.subtitle)) errors.push(`${path}.subtitle: expected string`);
  if (!isBoolean(value.supportsReplayEvidenceToggle)) {
    errors.push(`${path}.supportsReplayEvidenceToggle: expected boolean`);
  }
  const viewResult = validatePresentationView(value.view, `${path}.view`);
  errors.push(...viewResult.errors);

  const rv = value.replayValidatedView;
  if (rv === null || rv === undefined) {
    // Only journeys that advertise the toggle may omit the replay-validated view.
    if (value.supportsReplayEvidenceToggle === true) {
      errors.push(
        `${path}.replayValidatedView: required when supportsReplayEvidenceToggle is true`,
      );
    }
  } else {
    if (value.supportsReplayEvidenceToggle !== true) {
      errors.push(
        `${path}.replayValidatedView: present but supportsReplayEvidenceToggle is not true`,
      );
    }
    const rvResult = validatePresentationView(rv, `${path}.replayValidatedView`);
    errors.push(...rvResult.errors);
  }
  return { ok: errors.length === 0, errors };
}

export function validateDemoJourneysDoc(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { ok: false, errors: ["doc: expected object"] };
  }
  if (value.schemaVersion !== PRESENTATION_SCHEMA_VERSION) {
    errors.push(`doc.schemaVersion: expected ${PRESENTATION_SCHEMA_VERSION}`);
  }
  if (!isString(value.defaultJourneyKey)) {
    errors.push("doc.defaultJourneyKey: expected string");
  }
  if (!isStringArray(value.generatedFrom)) {
    errors.push("doc.generatedFrom: expected string[]");
  }
  if (!Array.isArray(value.journeys)) {
    errors.push("doc.journeys: expected array");
    return { ok: false, errors };
  }
  value.journeys.forEach((j, i) => {
    const r = validateDemoJourney(j, `doc.journeys[${i}]`);
    errors.push(...r.errors);
  });
  const keys = value.journeys
    .map((j) => (isObject(j) && isString(j.key) ? j.key : null))
    .filter((k): k is string => k !== null);
  if (isString(value.defaultJourneyKey) && !keys.includes(value.defaultJourneyKey)) {
    errors.push("doc.defaultJourneyKey: does not match any journey key");
  }
  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Pure copy helpers — shared by both React components and eval tests. The eval
// runtime cannot render JSX, so all user-visible copy derivation lives here and
// is asserted directly against data.
// ---------------------------------------------------------------------------

// The narrative-first ordering the presenter leads with (spec §PRODUCT EXPERIENCE).
export interface NarrationProjection {
  headline: string;
  primaryNarrative: string;
  recommendation: string;
  governanceLabel: string;
  approvalLabel: string;
  executionLabel: string;
  auditLabel: string;
  replayLabel: string;
  providerLabel: string;
}

export function narrationProjection(view: DemoPresentationView): NarrationProjection {
  return {
    headline: view.headline,
    primaryNarrative: view.primaryNarrative,
    recommendation: view.recommendation,
    governanceLabel: view.governanceLabel,
    approvalLabel: view.approvalLabel,
    executionLabel: view.executionLabel,
    auditLabel: view.auditLabel,
    replayLabel: view.replayLabel,
    providerLabel: view.providerLabel,
  };
}

export interface VisibleCopyOptions {
  showTechnical?: boolean;
}

// Every string a user can actually read for a given view + visibility state.
// Technical details are hidden unless explicitly revealed.
export function collectVisibleCopy(
  view: DemoPresentationView,
  options: VisibleCopyOptions = {},
): string[] {
  const copy: string[] = [
    view.headline,
    view.primaryNarrative,
    view.recommendation,
    view.journeyLabel,
    view.governanceLabel,
    view.approvalLabel,
    view.executionLabel,
    view.auditLabel,
    view.replayLabel,
    view.providerLabel,
    ...view.evidenceItems,
    ...view.safetyDisclosures,
  ];
  if (options.showTechnical) {
    copy.push(...view.technicalDetails, view.sourceResultReference);
  }
  return copy;
}

// Returns the first forbidden phrase found across all rendered strings, or null.
export function scanForbidden(view: DemoPresentationView): string | null {
  const haystack = collectVisibleCopy(view, { showTechnical: true })
    .join("\n")
    .toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    if (haystack.includes(phrase)) {
      return phrase;
    }
  }
  return null;
}

// Selects the view to render given the replay-evidence toggle. This is
// presentation-only: when the toggle is on and a separately-validated view
// exists, we swap to it without mutating anything.
export function selectView(
  journey: DemoJourney,
  showReplayValidated: boolean,
): DemoPresentationView {
  if (
    showReplayValidated &&
    journey.supportsReplayEvidenceToggle &&
    journey.replayValidatedView !== null
  ) {
    return journey.replayValidatedView;
  }
  return journey.view;
}
