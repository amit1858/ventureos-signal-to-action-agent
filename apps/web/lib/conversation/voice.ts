// Release 2.1C — Conversation Runtime
// ====================================
// Voice summary builder — the forward contract for the future 2.2 Voice Companion.
//
// APEF: Deterministic AI + Future Readiness. 2.1C produces `voiceSummary`; 2.2
// consumes it. Shipping it now (always defined, markdown-free, length-bounded)
// means 2.2 needs zero runtime changes. The summary is derived ONLY from already
// composed, already cited segment text (or an honest fallback line) — it invents
// nothing. No clock, no randomness, no model call.

import type { ConversationIntent, ResponseSegment } from "./types";
import { sanitizeInline } from "./guardrails";

/** Hard upper bound on voice summary length (characters, incl. any ellipsis). */
export const VOICE_SUMMARY_MAX_CHARS = 240;

/** Deterministic safe default when there is genuinely nothing to say. */
const VOICE_EMPTY_DEFAULT = "No memory to summarize.";

/** Deterministic spoken lead-in per intent. */
const VOICE_INTENT_WORD: Record<ConversationIntent, string> = {
  resume: "Resuming",
  status: "Status from",
  risk_review: "Risk review of",
  next_step: "Next step from",
  recap: "Recap of",
};

export interface VoiceSummaryInput {
  intent: ConversationIntent;
  segments: ResponseSegment[];
  /** Honest fallback line, when the response is a fallback. */
  fallbackLine?: string;
}

/**
 * Build the single-line voice summary. ALWAYS returns a defined, non-empty,
 * markdown-free string no longer than {@link VOICE_SUMMARY_MAX_CHARS}.
 */
export function buildVoiceSummary(input: VoiceSummaryInput): string {
  if (input.fallbackLine !== undefined) {
    return boundLength(sanitizeInline(input.fallbackLine)) || VOICE_EMPTY_DEFAULT;
  }

  if (input.segments.length === 0) {
    return VOICE_EMPTY_DEFAULT;
  }

  const count = input.segments.length;
  const noun = count === 1 ? "memory" : "memories";
  const head = `${VOICE_INTENT_WORD[input.intent]} ${count} ${noun}.`;
  const lead = sanitizeInline(input.segments[0].text);
  const summary = sanitizeInline(`${head} Top: ${lead}`);

  return boundLength(summary) || VOICE_EMPTY_DEFAULT;
}

/** Deterministically bound a string to the max length with a trailing ellipsis. */
function boundLength(text: string): string {
  if (text.length <= VOICE_SUMMARY_MAX_CHARS) return text;
  return `${text.slice(0, VOICE_SUMMARY_MAX_CHARS - 1)}\u2026`;
}
