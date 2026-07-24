// VentureOS — Revenue Companion · Shared per-intent answer contract (pure)
// ==========================================================================
// Phase 3.2. `RevenueCompanionAnswer` is the ONE response shape every surface
// (homepage preview, embedded Action Center overlay, standalone /companion)
// renders and every voice request references. It is a presentation projection
// over the immutable governed journey view — it never introduces a new fact,
// never re-ranks, never approves, and never executes.
//
// Hard rules encoded here:
//   • spoken text is 35–80 words (executive-brief length);
//   • 2–4 visible sections (scannable, never a wall of JSON);
//   • NO raw IDs / slugs / JSON in any rendered string (metadata IDs live in
//     the reference arrays, never in headline/visibleText/spokenText);
//   • a stable FNV-1a fingerprint over the spoken+visible copy lets the voice
//     server rebuild and verify the exact text without trusting the browser.

import {
  COMPANION_STABLE_TIMESTAMP,
  computeScriptFingerprint,
  scanVoiceScript,
} from "./companionContract";
import type { GuidedIntent } from "./guided/intentRouter";
import { isGuidedIntent } from "./guided/intentRouter";
import {
  SNAPSHOT_SOURCE_CLASSIFICATIONS,
  type SnapshotSourceClassification,
} from "./actionCenterSnapshot";

export const ANSWER_SCHEMA_VERSION = "1.0" as const;

// Spoken answers are executive-brief length. Enforced by the validator.
export const ANSWER_SPOKEN_MIN_WORDS = 35 as const;
export const ANSWER_SPOKEN_MAX_WORDS = 80 as const;
export const ANSWER_MIN_SECTIONS = 2 as const;
export const ANSWER_MAX_SECTIONS = 4 as const;

// The bounded intent (or the truthful unsupported fallback) an answer serves.
export type AnswerIntent = GuidedIntent | "UNSUPPORTED";

export function isAnswerIntent(value: unknown): value is AnswerIntent {
  return value === "UNSUPPORTED" || isGuidedIntent(value);
}

// A visible section is a short heading + grounded body. Two-to-four of these
// make the on-screen answer; they are never raw data dumps.
export interface AnswerSection {
  heading: string;
  body: string;
}

// Presentation-only pointer to an EXISTING Action Center panel to highlight and
// scroll into view. It carries no data and never changes ranking or state — it
// only tells a surface where the seller should look next. Phase 3.2A adds
// OPTIONAL specific targets (account / recommendation / signal / mission) so a
// live-bound answer can point at the exact row when the DOM exposes it; the
// generic `anchorId` remains the guaranteed fallback.
export interface WorkspaceFocus {
  focusKey:
    | "top-mission"
    | "priority-accounts"
    | "portfolio-signals"
    | "next-action"
    | "account-detail";
  anchorId: string; // an id that already exists in the Action Center DOM
  label: string;
  targetAccountId?: string;
  targetRecommendationId?: string;
  targetSignalId?: string;
  targetMissionId?: string;
}

// Provenance of the answer — either the immutable canonical journey view, or the
// live, fingerprinted Action Center presentation snapshot (Phase 3.2A).
export interface AnswerProvenance {
  source: "governed-journey-view" | "action-center-snapshot";
  journeyKey: string;
  narrativeId: string;
  presentationVersion: string;
}

export interface RevenueCompanionAnswer {
  schemaVersion: string;
  responseId: string;
  presentationVersion: string;
  intent: AnswerIntent;
  normalizedQuestion: string;
  displayedQuestion: string;

  // Rendered copy (all human, no IDs/slugs/JSON).
  headline: string;
  visibleSections: AnswerSection[];
  spokenText: string;

  // Traceability metadata — reference IDs live HERE, never in rendered copy.
  accountIds: string[];
  recommendationIds: string[];
  missionIds: string[];
  signalReferences: string[];
  evidenceReferences: string[];

  // Governed status echoed verbatim from the view (labels, not new facts).
  governanceStatus: string;
  approvalStatus: string;
  recommendedAction: string;

  // Phase 3.2A traceability — WHERE the facts came from. Reference IDs live here
  // (never in rendered copy). `sourceClassification` names the source-hierarchy
  // rung this answer used; `snapshotId`/`sourceFingerprint` bind it to the exact
  // Action Center presentation the seller saw (null on the canonical fallback).
  snapshotId: string | null;
  sourceClassification: SnapshotSourceClassification;
  sourceAccountIds: string[];
  sourceRecommendationIds: string[];
  sourceMissionId: string | null;
  sourceSignalIds: string[];
  sourceFingerprint: string | null;

  // Where to look + how this was produced.
  workspaceFocus: WorkspaceFocus | null;
  generatedFrom: AnswerProvenance;

  // Integrity + clock-free stamp.
  fingerprint: string;
  generatedAt: string;
}

export interface AnswerValidationResult {
  ok: boolean;
  errors: string[];
}

export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

// Identifiers/slugs that must never appear in RENDERED answer copy. Reuses the
// voice forbidden-token/phrase scan, then adds a snake_case-slug guard (e.g.
// "renewal_date", "mission_id") so a raw governed atom can never leak into text.
export function scanAnswerText(text: string): string | null {
  const base = scanVoiceScript(text);
  if (base) return base;
  const snake = text.toLowerCase().match(/\b[a-z0-9]+_[a-z0-9]+\b/);
  if (snake) return snake[0];
  return null;
}

// Canonical serialization the fingerprint is computed over: the rendered copy
// plus the intent + presentation version, joined with a stable separator.
export function answerFingerprintSource(
  a: Pick<
    RevenueCompanionAnswer,
    "intent" | "presentationVersion" | "headline" | "visibleSections" | "spokenText"
  >,
): string {
  const sections = a.visibleSections
    .map((s) => `${s.heading}\u241f${s.body}`)
    .join("\u241e");
  return [
    a.intent,
    a.presentationVersion,
    a.headline,
    sections,
    a.spokenText,
  ].join("\u2016");
}

export function computeAnswerFingerprint(
  a: Pick<
    RevenueCompanionAnswer,
    "intent" | "presentationVersion" | "headline" | "visibleSections" | "spokenText"
  >,
): string {
  return computeScriptFingerprint(answerFingerprintSource(a));
}

// Full structural + safety validation. Every surface and the voice route call
// this before trusting an answer; the composer calls it before returning.
export function validateAnswer(
  a: RevenueCompanionAnswer,
): AnswerValidationResult {
  const errors: string[] = [];

  if (a.schemaVersion !== ANSWER_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${ANSWER_SCHEMA_VERSION}`);
  }
  if (!isAnswerIntent(a.intent)) {
    errors.push(`intent is not a supported answer intent (${String(a.intent)})`);
  }
  for (const [field, value] of [
    ["responseId", a.responseId],
    ["presentationVersion", a.presentationVersion],
    ["normalizedQuestion", a.normalizedQuestion],
    ["displayedQuestion", a.displayedQuestion],
    ["headline", a.headline],
    ["spokenText", a.spokenText],
  ] as const) {
    if (!value || value.trim().length === 0) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  const words = countWords(a.spokenText);
  if (words < ANSWER_SPOKEN_MIN_WORDS || words > ANSWER_SPOKEN_MAX_WORDS) {
    errors.push(
      `spokenText must be ${ANSWER_SPOKEN_MIN_WORDS}-${ANSWER_SPOKEN_MAX_WORDS} words (was ${words})`,
    );
  }

  if (
    a.visibleSections.length < ANSWER_MIN_SECTIONS ||
    a.visibleSections.length > ANSWER_MAX_SECTIONS
  ) {
    errors.push(
      `visibleSections must be ${ANSWER_MIN_SECTIONS}-${ANSWER_MAX_SECTIONS} (was ${a.visibleSections.length})`,
    );
  }

  // No IDs/slugs/JSON in any rendered string.
  const rendered: Array<[string, string]> = [["headline", a.headline], ["spokenText", a.spokenText]];
  a.visibleSections.forEach((s, i) => {
    rendered.push([`visibleSections[${i}].heading`, s.heading]);
    rendered.push([`visibleSections[${i}].body`, s.body]);
  });
  for (const [where, text] of rendered) {
    if (!text || text.trim().length === 0) {
      errors.push(`${where} must be non-empty`);
      continue;
    }
    const hit = scanAnswerText(text);
    if (hit) errors.push(`${where} contains a forbidden token/slug (${hit})`);
  }

  if (a.generatedAt !== COMPANION_STABLE_TIMESTAMP) {
    errors.push("generatedAt must be the stable companion timestamp (no wall clock)");
  }

  const expected = computeAnswerFingerprint(a);
  if (a.fingerprint !== expected) {
    errors.push(`fingerprint mismatch (expected ${expected})`);
  }

  if (
    a.generatedFrom.source !== "governed-journey-view" &&
    a.generatedFrom.source !== "action-center-snapshot"
  ) {
    errors.push("generatedFrom.source must be a supported provenance");
  }

  // Traceability coherence (Phase 3.2A).
  if (!SNAPSHOT_SOURCE_CLASSIFICATIONS.includes(a.sourceClassification)) {
    errors.push(`sourceClassification is not supported (${String(a.sourceClassification)})`);
  }
  if (a.generatedFrom.source === "governed-journey-view") {
    if (a.sourceClassification !== "canonical_demo_fallback") {
      errors.push("journey-view provenance must classify as canonical_demo_fallback");
    }
    if (a.snapshotId !== null || a.sourceFingerprint !== null) {
      errors.push("journey-view provenance must not carry a snapshot identity");
    }
  }
  if (a.generatedFrom.source === "action-center-snapshot") {
    if (
      a.sourceClassification !== "action_center_live_presentation" &&
      a.sourceClassification !== "selected_account_context"
    ) {
      errors.push("snapshot provenance must classify as a live-presentation source");
    }
    if (!a.snapshotId || !a.sourceFingerprint) {
      errors.push("snapshot provenance must carry snapshotId + sourceFingerprint");
    }
  }
  for (const [field, arr] of [
    ["sourceAccountIds", a.sourceAccountIds],
    ["sourceRecommendationIds", a.sourceRecommendationIds],
    ["sourceSignalIds", a.sourceSignalIds],
  ] as const) {
    if (!Array.isArray(arr) || !arr.every((x) => typeof x === "string")) {
      errors.push(`${field} must be a string array`);
    }
  }

  return { ok: errors.length === 0, errors };
}
