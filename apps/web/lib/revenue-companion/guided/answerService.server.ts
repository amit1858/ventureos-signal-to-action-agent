// VentureOS — Revenue Companion · Guided answer service (server-only)
// ==================================================================
// Server-side orchestrator behind `POST /api/revenue-companion/answer`. It gates
// on the server-only Revenue Companion flag, rebuilds the trusted companion view
// model for the requested journey from IMMUTABLE generated data, and composes a
// bounded, grounded `RevenueCompanionAnswer` from a typed question or a direct
// intent. It has NO capability to rank, approve, execute, or mutate CRM/audit
// state — it only reads governed data and returns a presentation projection.

import {
  buildValidatedCompanion,
  type RevenueCompanionViewModel,
} from "../companionContract";
import {
  loadDemoJourneys,
  findJourney,
  defaultJourney,
} from "../../demo-mode/loadDemoJourney";
import { resolveCompanionNarrative } from "../narrativeAdapter.server";
import { isRevenueCompanionAccessible } from "../access.server";
import {
  composeAnswer,
  composeAnswerForDirectIntent,
} from "../answerComposer";
import type { RevenueCompanionAnswer } from "../answerContract";

if (typeof window !== "undefined") {
  throw new Error(
    "revenue-companion/guided/answerService.server must only run on the server; it must not be imported by client components.",
  );
}

export type AnswerServiceOutcome =
  | { status: "ok"; answer: RevenueCompanionAnswer }
  | { status: "forbidden" }
  | { status: "bad_request"; reason: string };

// Rebuild the trusted companion for a journey key (or the default journey) from
// the immutable generated document. Returns null for an unknown key.
export function rebuildGuidedCompanion(
  narrativeId?: string,
): RevenueCompanionViewModel | null {
  const doc = loadDemoJourneys();
  const journey = narrativeId ? findJourney(doc, narrativeId) : defaultJourney(doc);
  if (!journey) return null;
  const resolved = resolveCompanionNarrative(journey.view);
  return buildValidatedCompanion(
    journey.view,
    { journeyKey: journey.key, journeyTitle: journey.title },
    resolved,
  );
}

export function handleAnswerRequest(rawBody: unknown): AnswerServiceOutcome {
  // 1. Feature gate — fail closed when the companion is not offered.
  if (!isRevenueCompanionAccessible()) {
    return { status: "forbidden" };
  }

  if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
    return { status: "bad_request", reason: "body_not_object" };
  }
  const obj = rawBody as Record<string, unknown>;

  const narrativeId =
    typeof obj.narrativeId === "string" && obj.narrativeId.length > 0
      ? obj.narrativeId
      : undefined;
  const question = obj.question;
  const intent = obj.intent;

  const vm = rebuildGuidedCompanion(narrativeId);
  if (!vm) {
    return { status: "bad_request", reason: "unknown_narrative" };
  }

  // 2. Direct intent (curated chip) takes precedence when present.
  if (intent !== undefined) {
    const answer = composeAnswerForDirectIntent(
      vm,
      intent,
      typeof question === "string" ? question : undefined,
    );
    if (!answer) {
      return { status: "bad_request", reason: "intent_not_allowed" };
    }
    return { status: "ok", answer };
  }

  // 3. Otherwise a typed question routes through the bounded intent router.
  if (typeof question !== "string") {
    return { status: "bad_request", reason: "missing_question" };
  }
  if (question.length > 200) {
    return { status: "bad_request", reason: "question_too_long" };
  }
  return { status: "ok", answer: composeAnswer(vm, question) };
}
