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
import {
  composeSnapshotAnswer,
  composeSnapshotAnswerForDirectIntent,
} from "../snapshotComposer";
import {
  snapshotHasPresentation,
  validateSnapshot,
} from "../actionCenterSnapshot";
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
  const snapshotRaw = obj.presentationSnapshot;

  // 2. Source hierarchy, rung 1 + 2 — when the browser supplies the live Action
  //    Center presentation snapshot, validate it and (if it carries a displayed
  //    portfolio) bind the answer to it. The snapshot is presentation state only:
  //    it can never rank, approve, execute, or mutate anything.
  if (snapshotRaw !== undefined) {
    const validated = validateSnapshot(snapshotRaw);
    if (!validated.ok) {
      return { status: "bad_request", reason: `snapshot_${validated.reason}` };
    }
    const snapshot = validated.snapshot;
    if (snapshotHasPresentation(snapshot)) {
      try {
        if (intent !== undefined) {
          const answer = composeSnapshotAnswerForDirectIntent(snapshot, intent, typeof question === "string" ? question : undefined);
          if (!answer) return { status: "bad_request", reason: "intent_not_allowed" };
          return { status: "ok", answer };
        }
        if (typeof question !== "string") {
          return { status: "bad_request", reason: "missing_question" };
        }
        if (question.length > 200) {
          return { status: "bad_request", reason: "question_too_long" };
        }
        const bound = composeSnapshotAnswer(snapshot, question);
        if (bound) return { status: "ok", answer: bound };
        // Unsupported / ambiguous free-text: serve the bounded, live-independent
        // fallback (it names capabilities, not accounts) rather than Curefoods.
        return { status: "ok", answer: composeUnsupportedFallback(narrativeId, question) };
      } catch {
        // A live snapshot was supplied but could not be narrated. Fail closed
        // truthfully — never silently substitute the canonical demo journey.
        return { status: "bad_request", reason: "snapshot_answer_failed" };
      }
    }
    // Snapshot valid but empty (no displayed portfolio) → fall through to the
    // canonical fallback, which is explicitly classified as such.
  }

  // 3. Source hierarchy, rung 3 — canonical deterministic demo journey. Used by
  //    the homepage teaser, the standalone /companion route, and when there is
  //    no live Action Center presentation to bind to.
  const vm = rebuildGuidedCompanion(narrativeId);
  if (!vm) {
    return { status: "bad_request", reason: "unknown_narrative" };
  }

  // Direct intent (curated chip) takes precedence when present.
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

  // Otherwise a typed question routes through the bounded intent router.
  if (typeof question !== "string") {
    return { status: "bad_request", reason: "missing_question" };
  }
  if (question.length > 200) {
    return { status: "bad_request", reason: "question_too_long" };
  }
  return { status: "ok", answer: composeAnswer(vm, question) };
}

// Build the bounded, live-independent unsupported/ambiguous fallback answer. It
// names capabilities only (no account facts), so it is safe to serve when a live
// snapshot is present but the question is not one of the bounded intents.
function composeUnsupportedFallback(
  narrativeId: string | undefined,
  question: string,
): RevenueCompanionAnswer {
  const vm = rebuildGuidedCompanion(narrativeId);
  if (!vm) {
    // Should not happen (default journey always resolves); rethrow as a guard.
    throw new Error("cannot rebuild companion for unsupported fallback");
  }
  return composeAnswer(vm, question);
}
