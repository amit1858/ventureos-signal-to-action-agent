// VentureOS — Revenue Companion · Bounded deterministic intent router (pure)
// ==========================================================================
// Phase 3.2. Maps a seller's typed or spoken question to ONE of a fixed,
// bounded set of supported intents — with NO LLM, NO network, NO learning.
// Resolution is a pure function of the normalized text and fixed allow-lists:
//   1. exact match  — the normalized question equals an approved phrasing;
//   2. alias match  — the normalized question equals an approved alias;
//   3. keyword map  — deterministic keyword scoring picks the best intent;
//   4. ambiguous    — two or more intents tie on a non-zero keyword score;
//   5. unsupported  — nothing matches → a truthful, bounded fallback.
//
// The router NEVER invents an intent, never ranks accounts, never approves,
// executes, or mutates anything. It only classifies. Overlong or empty input
// fails closed to `unsupported` (with a distinct reason) so the answer layer
// can respond truthfully without ever calling a model.

export const GUIDED_INTENTS = [
  "MISSION_TODAY",
  "PRIORITY_ACCOUNTS",
  "TOP_SIGNALS",
  "NEXT_ACTION",
  "ACCOUNT_PRIORITY_REASON",
] as const;

export type GuidedIntent = (typeof GUIDED_INTENTS)[number];

export function isGuidedIntent(value: unknown): value is GuidedIntent {
  return (
    typeof value === "string" &&
    (GUIDED_INTENTS as readonly string[]).includes(value)
  );
}

// A supported question is bounded in length. Anything longer is rejected before
// any matching so the router can never be used as a free-text sink.
export const MAX_QUESTION_CHARS = 200 as const;

export type IntentMatchType = "exact" | "alias" | "keyword";

export type IntentResolution =
  | { kind: "intent"; intent: GuidedIntent; matchType: IntentMatchType }
  | { kind: "ambiguous"; candidates: GuidedIntent[] }
  | {
      kind: "unsupported";
      reason: "empty" | "too_long" | "no_match";
    };

// Normalize a raw question to a stable comparison key: Unicode-normalized,
// lower-cased, apostrophes/punctuation stripped, whitespace collapsed. This is
// deterministic and allocation-light; it never calls out to anything.
export function normalizeQuestion(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2019'`]/g, "") // curly + straight apostrophes, backtick
    .replace(/[^a-z0-9]+/g, " ") // any other punctuation → space
    .trim()
    .replace(/\s+/g, " ");
}

// Approved exact/alias phrasings per intent (already in normalized form). The
// first entry of each list is the canonical phrasing; the rest are aliases.
// Extending this list is the ONLY way to broaden coverage — deliberately.
const INTENT_PHRASES: Record<GuidedIntent, readonly string[]> = {
  MISSION_TODAY: [
    "what is my top mission today",
    "what is my mission today",
    "what should i focus on today",
    "tell me todays mission",
    "tell me my mission today",
    "where should i start today",
    "whats my mission today",
    "what is todays mission",
  ],
  PRIORITY_ACCOUNTS: [
    "which accounts need my attention first",
    "which accounts need attention",
    "which accounts should i focus on",
    "show my priority accounts",
    "which customers are at risk",
    "what accounts need attention this week and why",
    "which accounts need my attention",
  ],
  TOP_SIGNALS: [
    "what are my top signals today",
    "what are my top signals",
    "what changed today",
    "what signals matter",
    "what should i know today",
    "whats changed today",
  ],
  NEXT_ACTION: [
    "what should i do next",
    "what is the next action",
    "what do you recommend",
    "where should i begin",
    "what is my next action",
  ],
  ACCOUNT_PRIORITY_REASON: [
    "why is curefoods a priority",
    "why does this account matter",
    "why should i focus on this account",
    "explain this account",
    "why is this account a priority",
  ],
};

// Deterministic keyword weights. Scoring is a simple additive count of matched
// keywords (space-padded containment), so it is fully reproducible and
// explainable. Keywords are pre-normalized (lowercase, single-spaced).
const INTENT_KEYWORDS: Record<GuidedIntent, readonly string[]> = {
  MISSION_TODAY: ["mission", "focus today", "start today"],
  PRIORITY_ACCOUNTS: [
    "accounts",
    "customers",
    "at risk",
    "need attention",
    "priority accounts",
  ],
  TOP_SIGNALS: ["signal", "signals", "changed", "know today"],
  NEXT_ACTION: ["next", "recommend", "begin"],
  ACCOUNT_PRIORITY_REASON: ["why", "reason", "explain", "matter"],
};

// Reverse lookup of every approved phrase → intent for O(1) exact/alias
// resolution. Computed once at module load (pure, no observable side effects).
const PHRASE_TO_INTENT: ReadonlyMap<string, GuidedIntent> = (() => {
  const m = new Map<string, GuidedIntent>();
  for (const intent of GUIDED_INTENTS) {
    for (const phrase of INTENT_PHRASES[intent]) {
      if (!m.has(phrase)) m.set(phrase, intent);
    }
  }
  return m;
})();

// The canonical (first) phrase of each intent, used for exact-vs-alias labeling.
const CANONICAL_PHRASE: Record<GuidedIntent, string> = Object.fromEntries(
  GUIDED_INTENTS.map((i) => [i, INTENT_PHRASES[i][0]]),
) as Record<GuidedIntent, string>;

function keywordScores(normalized: string): Record<GuidedIntent, number> {
  const padded = ` ${normalized} `;
  const scores = {} as Record<GuidedIntent, number>;
  for (const intent of GUIDED_INTENTS) {
    let score = 0;
    for (const kw of INTENT_KEYWORDS[intent]) {
      if (padded.includes(` ${kw} `)) score += 1;
    }
    scores[intent] = score;
  }
  return scores;
}

// Resolve a raw question to a bounded intent, an ambiguity, or a truthful
// unsupported fallback. Pure and deterministic.
export function resolveIntent(rawQuestion: string): IntentResolution {
  if (typeof rawQuestion !== "string") {
    return { kind: "unsupported", reason: "no_match" };
  }
  if (rawQuestion.length > MAX_QUESTION_CHARS) {
    return { kind: "unsupported", reason: "too_long" };
  }
  const normalized = normalizeQuestion(rawQuestion);
  if (normalized.length === 0) {
    return { kind: "unsupported", reason: "empty" };
  }

  // 1 + 2. Exact / alias match.
  const exact = PHRASE_TO_INTENT.get(normalized);
  if (exact) {
    return {
      kind: "intent",
      intent: exact,
      matchType: normalized === CANONICAL_PHRASE[exact] ? "exact" : "alias",
    };
  }

  // 3 + 4. Deterministic keyword scoring with tie → ambiguous.
  const scores = keywordScores(normalized);
  let best = 0;
  for (const intent of GUIDED_INTENTS) {
    if (scores[intent] > best) best = scores[intent];
  }
  if (best === 0) {
    return { kind: "unsupported", reason: "no_match" };
  }
  const winners = GUIDED_INTENTS.filter((i) => scores[i] === best);
  if (winners.length > 1) {
    return { kind: "ambiguous", candidates: winners };
  }
  return { kind: "intent", intent: winners[0], matchType: "keyword" };
}

// A caller may also select an intent directly (e.g. a curated prompt chip). This
// validates that a supplied intent string is one of the bounded set.
export function resolveDirectIntent(intent: unknown): GuidedIntent | null {
  return isGuidedIntent(intent) ? intent : null;
}
