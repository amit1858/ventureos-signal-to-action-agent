// VentureOS — Revenue Companion · Shared deterministic answer composer (pure)
// ==========================================================================
// Phase 3.2. Turns a resolved intent + the immutable governed journey view into
// exactly ONE `RevenueCompanionAnswer`. Every rendered word is grounded in a
// field the governed engine already produced (allowlisted labels + verbatim
// governed prose). The composer:
//   • NEVER invents a fact, an account, a mission, or a number;
//   • NEVER re-ranks — for portfolio-wide questions it points to the Action
//     Center, where the deterministic engine owns the ordering;
//   • NEVER approves or executes — it only describes and recommends.
// One composer feeds all three surfaces (homepage, Action Center, /companion)
// and the voice route, so they can never drift.

import {
  possessiveDisplayName,
  computeScriptFingerprint,
  COMPANION_STABLE_TIMESTAMP,
  type RevenueCompanionViewModel,
} from "./companionContract";
import {
  ANSWER_SCHEMA_VERSION,
  computeAnswerFingerprint,
  validateAnswer,
  type AnswerIntent,
  type AnswerSection,
  type RevenueCompanionAnswer,
  type WorkspaceFocus,
} from "./answerContract";
import {
  resolveDirectIntent,
  resolveIntent,
  type GuidedIntent,
  type IntentResolution,
} from "./guided/intentRouter";

// --- small deterministic text helpers -------------------------------------

function capitalizeFirst(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function lowerFirst(s: string): string {
  return s.length ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

// Make a governed status label read naturally when spoken/inlined: turn the
// "A -- B" separator into a comma and drop a trailing period.
function speakable(label: string): string {
  return label
    .replace(/\s*--\s*/g, ", ")
    .replace(/\.\s*$/, "")
    .trim();
}

function speakLower(label: string): string {
  return speakable(label).toLowerCase();
}

function extractReference(evidenceItems: readonly string[], prefix: string): string[] {
  const hit = evidenceItems.find((i) => i.startsWith(prefix));
  if (!hit) return [];
  const value = hit.slice(prefix.length).trim();
  return value ? [value] : [];
}

// --- workspace focus (presentation-only panel pointers) --------------------
// Each intent maps to an EXISTING Action Center DOM anchor. These ids already
// exist in the Action Center shell (#workbench, #portfolio-pulse); the overlay
// scrolls/highlights them. No data or ranking is touched.
const WORKSPACE_FOCUS: Record<GuidedIntent, WorkspaceFocus> = {
  MISSION_TODAY: { focusKey: "top-mission", anchorId: "workbench", label: "Today's mission" },
  PRIORITY_ACCOUNTS: {
    focusKey: "priority-accounts",
    anchorId: "workbench",
    label: "Priority accounts",
  },
  TOP_SIGNALS: {
    focusKey: "portfolio-signals",
    anchorId: "portfolio-pulse",
    label: "Portfolio signals",
  },
  NEXT_ACTION: { focusKey: "next-action", anchorId: "workbench", label: "Recommended next step" },
  ACCOUNT_PRIORITY_REASON: {
    focusKey: "account-detail",
    anchorId: "workbench",
    label: "Account detail",
  },
};

// Canonical clean question shown in the UI per intent (never a raw slug).
const DISPLAYED_QUESTION: Record<GuidedIntent, string> = {
  MISSION_TODAY: "What's my top mission today?",
  PRIORITY_ACCOUNTS: "Which accounts need my attention first?",
  TOP_SIGNALS: "What are my top signals today?",
  NEXT_ACTION: "What should I do next?",
  ACCOUNT_PRIORITY_REASON: "Why is this account a priority?",
};

interface ComposedBody {
  headline: string;
  sections: AnswerSection[];
  spokenText: string;
}

function composeBody(
  intent: GuidedIntent,
  v: RevenueCompanionViewModel,
): ComposedBody {
  const display = v.accountDisplayName || v.accountName;
  const owner = possessiveDisplayName(display);
  const missionInline = lowerFirst(v.recommendedMissionTitle);
  const urgencyLower = v.urgencyLabel.toLowerCase();
  const impact = v.businessImpact;
  const reason = v.recommendationReason;
  const signalLower = v.signalLabel.toLowerCase();

  switch (intent) {
    case "MISSION_TODAY":
      return {
        headline: `Today's top mission: ${owner} ${missionInline}`,
        sections: [
          { heading: "Top mission", body: `${owner} ${v.recommendedMissionTitle} — ${v.urgencyLabel}.` },
          { heading: "Why it matters", body: impact },
          { heading: "Recommended next step", body: reason },
        ],
        spokenText: [
          `Your top mission today is ${owner} ${missionInline}.`,
          impact,
          `${capitalizeFirst(speakable(v.governanceStatus))}.`,
          `I recommend: ${reason}`,
        ].join(" "),
      };

    case "PRIORITY_ACCOUNTS":
      return {
        headline: `Priority account in focus: ${display}`,
        sections: [
          { heading: "Account in focus", body: `${display} — ${v.urgencyLabel} ${missionInline}.` },
          { heading: "Why it's surfaced", body: impact },
          {
            heading: "Full portfolio",
            body:
              "Open the Action Center to see every account ranked by the deterministic engine. The Companion never reorders that ranking.",
          },
        ],
        spokenText: [
          `In this governed journey, ${display} is the account in focus, carrying a ${urgencyLower} ${missionInline}.`,
          impact,
          "For your full ranked portfolio, open the Action Center, where the deterministic engine orders every account.",
          `I recommend starting with ${display}.`,
        ].join(" "),
      };

    case "TOP_SIGNALS":
      return {
        headline: `Top signal today: ${v.signalLabel}`,
        sections: [
          { heading: "Top signal", body: `${v.signalLabel} on ${display}.` },
          { heading: "What it means", body: impact },
          {
            heading: "Where to look",
            body: "Open the portfolio signals in the Action Center to review the full evidence.",
          },
        ],
        spokenText: [
          `Your top signal today is a ${signalLower} on ${display}.`,
          impact,
          `This is what created ${owner} ${missionInline}.`,
          "I recommend reviewing the signal evidence before you act.",
        ].join(" "),
      };

    case "NEXT_ACTION":
      return {
        headline: "Recommended next step",
        sections: [
          { heading: "Recommended next step", body: reason },
          {
            heading: "Where it stands",
            body: `${v.governanceStatus}. ${v.approvalStatus}. ${v.executionStatus}.`,
          },
          {
            heading: "Your control",
            body:
              "Nothing executes without your explicit approval. VentureOS never writes back to the CRM on its own.",
          },
        ],
        spokenText: [
          `For ${display}, here is the recommended next step.`,
          reason,
          `Right now, ${speakLower(v.governanceStatus)}; ${speakLower(v.approvalStatus)}; ${speakLower(v.executionStatus)}.`,
          "Nothing executes without your explicit approval, and VentureOS never writes to the CRM on its own.",
        ].join(" "),
      };

    case "ACCOUNT_PRIORITY_REASON":
      return {
        headline: `Why ${display} is a priority`,
        sections: [
          { heading: "Why it's a priority", body: impact },
          { heading: "Mission raised", body: `${v.recommendedMissionTitle} — ${v.urgencyLabel}.` },
          { heading: "Recommended next step", body: reason },
        ],
        spokenText: [
          `${display} is a priority because of a ${signalLower}.`,
          impact,
          `That is why VentureOS raised ${owner} ${missionInline} at ${urgencyLower}.`,
          `I recommend: ${reason}`,
        ].join(" "),
      };
  }
}

const UNSUPPORTED_BODY: ComposedBody = {
  headline: "I can help with your governed revenue priorities",
  sections: [
    {
      heading: "What I can answer",
      body:
        "Your top mission today · which account needs attention · your top signals · the recommended next step · why an account is a priority.",
    },
    {
      heading: "How I answer",
      body:
        "Every answer is grounded in your governed journey. I never invent data, reorder rankings, approve, or execute.",
    },
  ],
  spokenText:
    "I can't answer that one yet. Here is what I can help with: your top mission today, which account needs attention, your top signals, the recommended next step, and why an account is a priority. Ask me one of those and I'll ground the answer in your governed journey.",
};

function responseId(
  intent: AnswerIntent,
  normalizedQuestion: string,
  presentationVersion: string,
): string {
  const fp = computeScriptFingerprint(
    `${intent}|${normalizedQuestion}|${presentationVersion}`,
  );
  return `rca-${fp.replace(/^vcs1:/, "")}`;
}

function finalize(
  intent: AnswerIntent,
  body: ComposedBody,
  v: RevenueCompanionViewModel,
  normalizedQuestion: string,
  displayedQuestion: string,
  workspaceFocus: WorkspaceFocus | null,
): RevenueCompanionAnswer {
  const supported = intent !== "UNSUPPORTED";
  const draft: RevenueCompanionAnswer = {
    schemaVersion: ANSWER_SCHEMA_VERSION,
    responseId: responseId(intent, normalizedQuestion, v.presentationVersion),
    presentationVersion: v.presentationVersion,
    intent,
    normalizedQuestion,
    displayedQuestion,
    headline: body.headline,
    visibleSections: body.sections,
    spokenText: body.spokenText,
    accountIds: supported && v.accountRef ? [v.accountRef] : [],
    recommendationIds: [],
    missionIds: supported && v.recommendedMissionId ? [v.recommendedMissionId] : [],
    signalReferences: supported ? extractReference(v.evidenceItems, "Change event:") : [],
    evidenceReferences: supported ? [...v.evidenceItems] : [],
    governanceStatus: supported ? v.governanceStatus : "",
    approvalStatus: supported ? v.approvalStatus : "",
    recommendedAction: supported ? v.recommendationReason : "",
    workspaceFocus,
    generatedFrom: {
      source: "governed-journey-view",
      journeyKey: v.journeyKey,
      narrativeId: v.narrativeId,
      presentationVersion: v.presentationVersion,
    },
    fingerprint: "",
    generatedAt: COMPANION_STABLE_TIMESTAMP,
  };
  draft.fingerprint = computeAnswerFingerprint(draft);
  return draft;
}

export class AnswerCompositionError extends Error {}

// Compose an answer for an already-resolved intent (e.g. a curated prompt chip).
export function composeAnswerForIntent(
  view: RevenueCompanionViewModel,
  intent: GuidedIntent,
  rawQuestion?: string,
): RevenueCompanionAnswer {
  const normalized = (rawQuestion ?? DISPLAYED_QUESTION[intent]).trim();
  const answer = finalize(
    intent,
    composeBody(intent, view),
    view,
    normalized || DISPLAYED_QUESTION[intent],
    DISPLAYED_QUESTION[intent],
    WORKSPACE_FOCUS[intent],
  );
  const check = validateAnswer(answer);
  if (!check.ok) {
    throw new AnswerCompositionError(
      `composed ${intent} answer failed validation: ${check.errors.join("; ")}`,
    );
  }
  return answer;
}

// The truthful, bounded fallback answer for ambiguous / unsupported questions.
export function composeUnsupportedAnswer(
  view: RevenueCompanionViewModel,
  rawQuestion: string,
): RevenueCompanionAnswer {
  const displayed = rawQuestion.trim().slice(0, 200) || "Your question";
  const answer = finalize(
    "UNSUPPORTED",
    UNSUPPORTED_BODY,
    view,
    rawQuestion.trim() || "unsupported",
    displayed,
    null,
  );
  const check = validateAnswer(answer);
  if (!check.ok) {
    throw new AnswerCompositionError(
      `unsupported answer failed validation: ${check.errors.join("; ")}`,
    );
  }
  return answer;
}

// Resolve + compose in one step from a raw seller question.
export function composeAnswer(
  view: RevenueCompanionViewModel,
  rawQuestion: string,
  resolution?: IntentResolution,
): RevenueCompanionAnswer {
  const resolved = resolution ?? resolveIntent(rawQuestion);
  if (resolved.kind === "intent") {
    return composeAnswerForIntent(view, resolved.intent, rawQuestion);
  }
  return composeUnsupportedAnswer(view, rawQuestion);
}

// Validate that a supplied intent string is a bounded intent, then compose.
export function composeAnswerForDirectIntent(
  view: RevenueCompanionViewModel,
  intent: unknown,
  rawQuestion?: string,
): RevenueCompanionAnswer | null {
  const valid = resolveDirectIntent(intent);
  if (!valid) return null;
  return composeAnswerForIntent(view, valid, rawQuestion);
}
