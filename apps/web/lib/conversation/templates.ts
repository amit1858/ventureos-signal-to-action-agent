// Release 2.1C — Conversation Runtime
// ====================================
// Deterministic response templates.
//
// APEF: Deterministic AI. Persona language is TEMPLATED, never generated. Given
// the same (intent, tone, band, record view) the rendered text is byte-identical
// every time. There is no model call, no paraphrase, and no randomness. Templates
// draw ONLY from whitelisted record fields (subjectLabel, category, summary,
// importance tier) — they never introduce a fact that isn't already in the record.
//
// Confidence-gated wording is delegated to `guardrails.hedgePrefix`, so the same
// published hedge phrasing is used everywhere.

import type { ConfidenceBand, MemoryCategory, MemoryImportanceTier } from "../memory";
import type { ConversationIntent, PersonaTone } from "./types";
import { hedgePrefix } from "./guardrails";

/** The minimal, whitelisted record view a template is allowed to see. */
export interface SegmentView {
  subjectLabel: string;
  category: MemoryCategory;
  summary: string;
  importanceTier: MemoryImportanceTier;
  confidenceBand: ConfidenceBand;
}

/** A rendered segment plus the id of the template that produced it. */
export interface RenderedSegment {
  text: string;
  templateId: string;
}

/** Deterministic persona lead-in per tone. Neutral adds nothing. */
const TONE_LEAD: Record<PersonaTone, string> = {
  executive: "Executive view —",
  coaching: "Coaching note —",
  advisory: "Advisory —",
  neutral: "",
};

/** Deterministic framing verb per intent. */
const INTENT_FRAME: Record<ConversationIntent, string> = {
  resume: "picking up on",
  status: "current status for",
  risk_review: "risk to watch on",
  next_step: "recommended next step for",
  recap: "recap on",
};

/**
 * Render one memory into deterministic persona text. Assembly order is fixed:
 *   [tone lead] [confidence hedge] [importance flag] [intent frame] [subject]: [summary]
 * Empty parts are dropped and whitespace is collapsed so the output is stable.
 */
export function renderSegment(
  intent: ConversationIntent,
  tone: PersonaTone,
  view: SegmentView,
): RenderedSegment {
  const importanceFlag = view.importanceTier === "critical" ? "Critical —" : "";

  const parts = [
    TONE_LEAD[tone],
    hedgePrefix(view.confidenceBand),
    importanceFlag,
    INTENT_FRAME[intent],
    `${view.subjectLabel}:`,
    view.summary,
  ];

  const text = parts
    .filter((p) => p.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return { text, templateId: `${intent}.${tone}.${view.confidenceBand}` };
}
