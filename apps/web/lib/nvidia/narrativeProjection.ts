// Release 2.5 — Mission Control · business-language narrative projection (F2.2)
// =============================================================================
// Pure, deterministic, PRESENTATION-ONLY normalization that turns the internal
// Conversation Runtime persona phrasing into business-readable prose for the
// PRIMARY Mission Control surface. Amit's hosted review flagged primary copy such
// as "Advisory — On record, risk to watch on Curefoods…" and voice copy such as
// "Risk review of 2 memories. Top: Advisory" as too mechanical / internal.
//
// Contract (locked):
//   * This layer only REMOVES known internal scaffolding tokens (persona tone
//     leads, the high-confidence "On record," framing, the "Critical —" flag, and
//     the voice "<intent> of N memories. Top:" preamble). It NEVER adds a word:
//     every word in the output also appears in the input, so no fact is invented
//     and no claim is strengthened beyond the source.
//   * Medium/low-confidence hedges ("Based on what I have,", "I'm not fully
//     certain, but a tentative signal suggests") are intentionally KEPT so
//     supplied confidence is preserved in the sentence, not just the chips.
//   * It changes NOTHING governed: not the model request, not the authority
//     boundary, not evidence refs, not confidence, not approval state. Callers
//     keep the raw source text for the opt-in Technical Evidence sections.
//
// Pure module: constants + plain functions. No JSX, no globals, no clock, no
// network. Safe to import from both components (.tsx) and evals (.ts).

/** Leading, unambiguously-internal scaffolding phrases that must never dominate
 * primary business copy. Each is anchored to the START of the string so we only
 * strip a genuine lead-in, never a mid-sentence occurrence. Order does not matter
 * because {@link toBusinessProse} strips iteratively until stable. */
export const INTERNAL_LEAD_PATTERNS: readonly RegExp[] = [
  /^Executive view\s*[—–-]\s*/i, // persona tone lead (executive)
  /^Coaching note\s*[—–-]\s*/i, // persona tone lead (coaching)
  /^Advisory\s*[—–-]\s*/i, // persona tone lead (advisory)
  /^Critical\s*[—–-]\s*/i, // importance flag
  /^On record,\s*/i, // high-confidence hedge framing (pure scaffolding)
];

/** The voice-summary preamble the Conversation Runtime prepends, e.g.
 * "Risk review of 2 memories. Top: ". Stripping it leaves the actual spoken
 * content, which is then normalized like any other line. */
export const VOICE_PREAMBLE_PATTERN =
  /^(Resuming|Status from|Risk review of|Next step from|Recap of)\b[^.]*\.\s*(Top:\s*)?/i;

/** The Conversation Runtime assembles each supporting-evidence segment as
 *   [tone lead] [confidence hedge] [importance flag] [intent frame] [subject]: [summary]
 * (see conversation/templates.ts). For PRIMARY presentation we want just the
 * business summary, so this matches the whole leading scaffold up to and including
 * the `<intent frame> <subject>:` — any tone lead / hedge / flag in front is
 * absorbed by the lazy prefix. Subtractive: it only removes a genuine leading
 * frame and never rewrites the summary that follows. Confidence is not lost — it
 * stays on the segment's confidence-band chip. */
export const INTENT_FRAME_PREFIX_PATTERN =
  /^.*?\b(?:risk to watch on|recommended next step for|current status for|picking up on|recap on)\b[^:]*:\s*/i;

/** Collapse whitespace to single spaces and trim. Deterministic. */
function tidy(text: string): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Uppercase the first character only (no new words introduced). */
function capitalizeFirst(text: string): string {
  if (text.length === 0) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Project internal persona text into business-readable prose by removing known
 * internal lead-in scaffolding. Purely subtractive: the output is always a
 * substring-derived reduction of the input (plus first-letter capitalization), so
 * it can never introduce an unsupported claim. Medium/low hedges are preserved.
 */
export function toBusinessProse(text: string): string {
  let out = tidy(text);
  // Strip stacked leads (e.g. "Advisory — " THEN "On record, ") until stable.
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of INTERNAL_LEAD_PATTERNS) {
      const next = out.replace(re, "");
      if (next !== out) {
        out = tidy(next);
        changed = true;
      }
    }
  }
  return capitalizeFirst(out);
}

/**
 * Project a supporting-evidence segment ("Advisory — On record, risk to watch on
 * Curefoods: renewal risk flagged for enterprise account") into the business
 * sentence a reviewer should read ("Renewal risk flagged for enterprise
 * account."). Removes the leading `<intent frame> <subject>:` scaffold and any
 * remaining tone/hedge lead, subtractively — the surviving words all come from
 * the input, so no fact, number, action, or conclusion is introduced. If the
 * strip would empty the sentence, it falls back to the lead-only projection so
 * the output is always non-empty and usable. */
export function toSupportingEvidenceProse(text: string): string {
  const raw = tidy(text);
  const withoutFrame = raw.replace(INTENT_FRAME_PREFIX_PATTERN, "");
  const candidate = withoutFrame.trim().length > 0 ? withoutFrame : raw;
  const prose = toBusinessProse(candidate);
  return prose.length > 0 ? prose : toBusinessProse(raw);
}

/** Deterministically bound a string to `maxChars`, adding a single ellipsis when
 * it must be shortened. Never exceeds the bound (ellipsis included). */
export function boundLength(text: string, maxChars: number): string {
  const clean = tidy(text);
  if (clean.length <= maxChars) return clean;
  if (maxChars <= 1) return "…".slice(0, Math.max(0, maxChars));
  return clean.slice(0, maxChars - 1).trimEnd() + "…";
}

/**
 * Normalize a spoken-form voice summary so it reads naturally when spoken:
 * strips the "<intent> of N memories. Top:" preamble and the internal persona
 * scaffolding, then bounds length. Purely subtractive.
 */
export function normalizeVoiceSummary(text: string, maxChars: number): string {
  const withoutPreamble = tidy(text).replace(VOICE_PREAMBLE_PATTERN, "");
  const prose = toBusinessProse(withoutPreamble);
  return boundLength(prose, maxChars);
}

/** Minimal fields needed to choose and normalize the spoken summary. */
export interface VoiceSourceInput {
  /** The turn-level spoken line (persona-derived; may be mechanical). */
  personaVoiceSummary: string;
  /** The grounded narrative's spoken line, when a narrative is attached. */
  narrativeVoiceSummary?: string | null;
  /** True only when a LIVE, grounded (non-fallback) narrative was presented. */
  narrativeIsLiveGrounded?: boolean;
}

/**
 * Pick the best source for the spoken summary and normalize it. A live, grounded
 * model narrative already speaks in natural business language, so it is preferred;
 * otherwise the persona line is normalized. The result always obeys `maxChars`.
 */
export function projectVoiceSummary(input: VoiceSourceInput, maxChars: number): string {
  const preferNarrative =
    input.narrativeIsLiveGrounded === true &&
    typeof input.narrativeVoiceSummary === "string" &&
    input.narrativeVoiceSummary.trim().length > 0;
  const source = preferNarrative
    ? (input.narrativeVoiceSummary as string)
    : input.personaVoiceSummary;
  return normalizeVoiceSummary(source, maxChars);
}
