// Tester Guide — canonical typed content model
// ==============================================
// Single source of truth for all tester guide content. The web route, PDF, and
// internal documentation all consume this model. Pure data — no React, no IO.

/** Severity levels for defect reporting. */
export type DefectSeverity = "P0" | "P1" | "P2";

/** A screenshot asset with full provenance. */
export interface GuideScreenshot {
  /** Public asset filename (under /walkthrough-assets/ or /guides/). */
  readonly src: string;
  readonly alt: string;
  readonly caption: string;
  readonly width: number;
  readonly height: number;
  /** Route the screenshot was captured from. */
  readonly sourceRoute: string;
  /** Canonical deployment ID the screenshot came from. */
  readonly deploymentId: string;
  /** Runtime SHA the screenshot came from. */
  readonly sourceSha: string;
}

/** A single tester action within a guide step. */
export interface TesterAction {
  readonly instruction: string;
}

/** An expected result a tester should verify. */
export interface ExpectedResult {
  readonly description: string;
}

/** A failure indicator the tester should watch for. */
export interface FailureIndicator {
  readonly description: string;
}

/** A truth note — important context about simulation, limitations, etc. */
export interface TruthNote {
  readonly text: string;
}

/** A single test step within a guide section. */
export interface GuideStep {
  readonly id: string;
  readonly title: string;
  readonly route?: string;
  readonly purpose: string;
  readonly actions: readonly TesterAction[];
  readonly expectedResults: readonly ExpectedResult[];
  readonly failureIndicators: readonly FailureIndicator[];
  readonly truthNotes: readonly TruthNote[];
  readonly screenshot?: GuideScreenshot;
}

/** A complete section of the tester guide. */
export interface GuideSection {
  readonly number: number;
  readonly id: string;
  readonly title: string;
  readonly route?: string;
  /** Prose explanation of what this section covers. */
  readonly explanation: readonly string[];
  readonly steps: readonly GuideStep[];
  readonly screenshot?: GuideScreenshot;
}

/** Truth-table classification for a feature. */
export type TruthClassification =
  | "Production"
  | "Production-Partial"
  | "Guided Demo"
  | "Simulated"
  | "Not implemented"
  | "Future";

/** A row in the truth table (Section 16). */
export interface TruthTableRow {
  readonly feature: string;
  readonly classification: TruthClassification;
  readonly detail: string;
}

/** Severity guidance entry. */
export interface SeverityGuidance {
  readonly severity: DefectSeverity;
  readonly description: string;
  readonly examples: readonly string[];
}

/** A field in the feedback template. */
export interface FeedbackField {
  readonly name: string;
  readonly label: string;
  readonly type: "text" | "textarea" | "select" | "rating";
  readonly required: boolean;
  readonly options?: readonly string[];
  readonly placeholder?: string;
}

/** A checklist item for Section 18. */
export interface ChecklistItem {
  readonly id: string;
  readonly label: string;
}

/** Guardrails scenario. */
export interface GuardrailScenario {
  readonly id: string;
  readonly name: string;
  readonly expectedVerdict: "Allowed" | "Blocked" | "Redacted";
  readonly expectedFindings: readonly string[];
}

/** Glossary entry. */
export interface GlossaryEntry {
  readonly term: string;
  readonly definition: string;
}

/** Top-level guide metadata. */
export interface GuideMetadata {
  readonly title: string;
  readonly version: string;
  readonly estimatedMinutes: number;
  readonly canonicalUrl: string;
  readonly suggestedBrowser: string;
  readonly suggestedViewport: string;
  readonly deploymentId: string;
  readonly runtimeSha: string;
  readonly lastUpdated: string;
}

/** Complete tester guide content model. */
export interface TesterGuideModel {
  readonly metadata: GuideMetadata;
  readonly canonical: typeof import("./content").GUIDE_CANONICAL;
  readonly sections: readonly GuideSection[];
  readonly truthTable: readonly TruthTableRow[];
  readonly severityGuidance: readonly SeverityGuidance[];
  readonly feedbackFields: readonly FeedbackField[];
  readonly checklist: readonly ChecklistItem[];
  readonly guardrailScenarios: readonly GuardrailScenario[];
  readonly glossary: readonly GlossaryEntry[];
}
