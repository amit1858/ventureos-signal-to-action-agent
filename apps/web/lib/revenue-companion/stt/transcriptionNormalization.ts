// VentureOS — Revenue Companion · Transcript normalization (pure)
// ===============================================================
// Turns a raw provider transcript string into a bounded, safe, presentation-
// ready value. Pure and deterministic. This is a SANITIZER, not an interpreter:
// it never decides an intent, never ranks, never approves. It strips control
// characters, collapses whitespace, removes obvious dictation artifacts, and
// hard-bounds the length. The result is then routed through the SAME bounded
// intent router that typed questions use.

import { STT_MAX_TRANSCRIPT_CHARS } from "./sttContract";

// Leading polite/filler prefixes a seller might speak. Removing them helps the
// downstream keyword router without changing meaning. Applied only at the very
// start, case-insensitively, and only once.
const LEADING_FILLERS = [
  "hey",
  "hi",
  "hello",
  "ok",
  "okay",
  "so",
  "um",
  "uh",
  "well",
  "please",
  "can you tell me",
  "can you",
  "could you",
  "i want to know",
  "id like to know",
  "tell me",
];

// Collapse whitespace, strip control chars and most punctuation noise, keep the
// sentence readable for the transcript-review UI. Does NOT lower-case — the
// review surface shows the seller a natural-looking sentence; the router does
// its own normalization downstream.
export function cleanTranscript(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let text = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ") // control chars
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > STT_MAX_TRANSCRIPT_CHARS) {
    text = text.slice(0, STT_MAX_TRANSCRIPT_CHARS).trim();
  }
  return text;
}

// Produce the normalized form used to compare/route. Lower-cases, strips
// punctuation (so filler removal is robust to commas/question marks), removes a
// single leading filler phrase, and collapses whitespace. Deterministic. This is
// the routing form; `cleanTranscript` remains the human-facing display form.
export function normalizeTranscript(cleaned: string): string {
  let text = cleaned
    .toLowerCase()
    .replace(/[\u2019'`]/g, "") // apostrophes
    .replace(/[^a-z0-9]+/g, " ") // any other punctuation → space
    .trim()
    .replace(/\s+/g, " ");
  // Strip one leading filler phrase (longest match first) if present.
  const sorted = [...LEADING_FILLERS].sort((a, b) => b.length - a.length);
  for (const filler of sorted) {
    if (text === filler || text.startsWith(filler + " ")) {
      text = text.slice(filler.length).trim();
      break;
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

// Convenience: clean + normalize in one call. Returns both the human-facing
// cleaned transcript and the normalized routing form.
export function prepareTranscript(raw: unknown): {
  transcript: string;
  normalizedTranscript: string;
} {
  const transcript = cleanTranscript(raw);
  return {
    transcript,
    normalizedTranscript: normalizeTranscript(transcript),
  };
}
