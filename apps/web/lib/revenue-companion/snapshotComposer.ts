// VentureOS — Revenue Companion · Snapshot-bound answer composer (pure)
// ======================================================================
// Phase 3.2A. Composes exactly ONE `RevenueCompanionAnswer` from the live,
// fingerprinted `ActionCenterPresentationSnapshot` — so the Companion narrates
// the SAME ranked accounts, selected account, signals, and governed standing the
// seller currently sees. It is the live-presentation twin of `answerComposer.ts`
// (which composes from the canonical demo journey).
//
// Guarantees:
//   • It READS the snapshot; it never re-ranks, re-orders, re-scores, invents a
//     mission/account/signal, approves, executes, or writes anything.
//   • Rendered copy uses only presentation-safe atoms (account display names,
//     rank ordinals, humanized status labels, and free-text fields that pass the
//     answer scan). Any free-text field that would leak an id/slug is replaced
//     with a neutral grounded phrase — the answer never emits a raw atom.
//   • The answer's copy is fingerprinted, so ANY change to the displayed rank
//     order / selection / signals yields a different answer (and, downstream, a
//     voice request that no longer matches — see the voice seam).

import {
  computeScriptFingerprint,
  COMPANION_STABLE_TIMESTAMP,
} from "./companionContract";
import {
  ANSWER_SCHEMA_VERSION,
  computeAnswerFingerprint,
  scanAnswerText,
  validateAnswer,
  type AnswerSection,
  type RevenueCompanionAnswer,
  type WorkspaceFocus,
} from "./answerContract";
import {
  humanizeLabel,
  snapshotHasPresentation,
  type ActionCenterPresentationSnapshot,
  type SnapshotRankedAccount,
  type SnapshotSourceClassification,
} from "./actionCenterSnapshot";
import {
  resolveDirectIntent,
  resolveIntent,
  type GuidedIntent,
  type IntentResolution,
} from "./guided/intentRouter";

export class SnapshotAnswerError extends Error {}

// --- small deterministic text helpers -------------------------------------

function capitalizeFirst(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Return `text` only if it is present AND carries no forbidden token/slug/id;
// otherwise the neutral, grounded fallback. This lets us surface a governed
// free-text field when it is clean, and never leak a raw atom when it is not.
function safeProse(text: string | undefined, fallback: string): string {
  const t = (text ?? "").trim();
  if (t.length === 0) return fallback;
  if (scanAnswerText(t) !== null) return fallback;
  return t;
}

// A readable status label (governed status echoed, Title-cased, slug-free).
function statusLabel(raw: string, fallback: string): string {
  const h = humanizeLabel(raw);
  if (!h) return fallback;
  return scanAnswerText(h) === null ? h : fallback;
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];
function ordinalWord(rank: number): string {
  return ORDINALS[rank - 1] ?? `number ${rank}`;
}

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
  workspaceFocus: WorkspaceFocus | null;
  classification: SnapshotSourceClassification;
  accountIds: string[];
  recommendationIds: string[];
  signalIds: string[];
  missionId: string | null;
  governanceStatus: string;
  approvalStatus: string;
  recommendedAction: string;
}

// Resolve the account an account-scoped intent should describe: the selected
// account when one is open, otherwise the rank-1 account (with the matching
// classification recorded).
function focusAccount(s: ActionCenterPresentationSnapshot): {
  account: SnapshotRankedAccount;
  classification: SnapshotSourceClassification;
} {
  if (s.selectedAccount) {
    const match = s.rankedAccounts.find(
      (r) => r.accountId === s.selectedAccount!.accountId,
    );
    if (match) {
      return { account: match, classification: "selected_account_context" };
    }
  }
  return { account: s.rankedAccounts[0], classification: "action_center_live_presentation" };
}

function composeBody(
  intent: GuidedIntent,
  s: ActionCenterPresentationSnapshot,
): ComposedBody {
  const top = s.rankedAccounts[0];

  switch (intent) {
    case "PRIORITY_ACCOUNTS": {
      const listed = s.rankedAccounts.slice(0, Math.min(5, s.rankedAccounts.length));
      const names = listed.map((r) => r.displayName);
      const ordered = listed.map((r) => `${r.rank}. ${r.displayName}`).join("  ·  ");
      const spokenList = names
        .slice(0, 3)
        .map((n, i) => (i === names.slice(0, 3).length - 1 && names.length > 1 ? `and ${n}` : n))
        .join(", ");
      return {
        headline: "Your priority accounts, in the engine's order",
        sections: [
          { heading: "In priority order", body: ordered },
          {
            heading: "Why this order",
            body:
              "This is the exact order shown in your Action Center. The Companion never reorders the deterministic ranking — it only reads it back to you.",
          },
          {
            heading: "Start here",
            body: `${top.displayName} is your ${ordinalWord(1)} priority — ${statusLabel(top.governanceStatus, "governed and awaiting your review")}.`,
          },
        ],
        spokenText: [
          `In your Action Center, the deterministic engine ranks ${s.rankedAccounts.length} ${s.rankedAccounts.length === 1 ? "account" : "accounts"}.`,
          `Your top priorities, in order, are ${spokenList}.`,
          `${top.displayName} sits at number one.`,
          "This is the exact order on your screen — I never reorder it. Start with the account at the top.",
        ].join(" "),
        workspaceFocus: {
          focusKey: "priority-accounts",
          anchorId: "workbench",
          label: "Priority accounts",
          targetAccountId: top.accountId,
          targetRecommendationId: top.recommendationId,
        },
        classification: "action_center_live_presentation",
        accountIds: listed.map((r) => r.accountId),
        recommendationIds: listed.map((r) => r.recommendationId).filter(Boolean),
        signalIds: [],
        missionId: null,
        governanceStatus: top.governanceStatus,
        approvalStatus: top.approvalStatus,
        recommendedAction: top.recommendedAction,
      };
    }

    case "MISSION_TODAY": {
      const nextStep = safeProse(
        top.recommendedAction,
        "Review the account and take the governed next step.",
      );
      return {
        headline: `Today's top mission: ${top.displayName}`,
        sections: [
          {
            heading: "Top mission",
            body: `${top.displayName} is your number one priority in the Action Center right now.`,
          },
          { heading: "Recommended next step", body: nextStep },
          {
            heading: "Where it stands",
            body: `${statusLabel(top.governanceStatus, "Governed")}. ${statusLabel(top.approvalStatus, "Awaiting your approval")}.`,
          },
        ],
        spokenText: [
          `Your top mission today is ${top.displayName}, ranked number one by the deterministic engine in your Action Center.`,
          `${capitalizeFirst(nextStep)}`,
          `Right now it is ${statusLabel(top.governanceStatus, "governed").toLowerCase()} and ${statusLabel(top.approvalStatus, "awaiting your approval").toLowerCase()}.`,
          "Nothing executes without your explicit approval.",
        ].join(" "),
        workspaceFocus: {
          focusKey: "top-mission",
          anchorId: "workbench",
          label: "Today's mission",
          targetAccountId: top.accountId,
          targetRecommendationId: top.recommendationId,
          ...(s.activeMission ? { targetMissionId: s.activeMission.missionId } : {}),
        },
        classification: "action_center_live_presentation",
        accountIds: [top.accountId],
        recommendationIds: top.recommendationId ? [top.recommendationId] : [],
        signalIds: [],
        missionId: s.activeMission?.missionId ?? null,
        governanceStatus: top.governanceStatus,
        approvalStatus: top.approvalStatus,
        recommendedAction: top.recommendedAction,
      };
    }

    case "TOP_SIGNALS": {
      const sel = s.selectedAccount;
      if (sel && sel.signals.length > 0) {
        const labels = sel.signals.slice(0, 3).map((g) => g.label).filter(Boolean);
        const labelLine = labels.join("  ·  ") || "current signals";
        const firstDesc = safeProse(
          sel.signals[0]?.description,
          "Review the full signal evidence before you act.",
        );
        return {
          headline: `Top signals on ${sel.displayName}`,
          sections: [
            { heading: "Signals in view", body: labelLine },
            { heading: "What it means", body: firstDesc },
            {
              heading: "Where to look",
              body: "Open the portfolio signals in the Action Center to review the full evidence for this account.",
            },
          ],
          spokenText: [
            `For ${sel.displayName}, your Action Center shows ${sel.signals.length} ${sel.signals.length === 1 ? "signal" : "signals"}.`,
            `The most prominent ${labels.length > 1 ? "are" : "is"} ${labels.join(", ") || "on screen now"}.`,
            firstDesc,
            "Review the signal evidence in your Action Center before you act.",
          ].join(" "),
          workspaceFocus: {
            focusKey: "portfolio-signals",
            anchorId: "portfolio-pulse",
            label: "Portfolio signals",
            targetAccountId: sel.accountId,
            ...(sel.signals[0]?.signalId ? { targetSignalId: sel.signals[0].signalId } : {}),
          },
          classification: "selected_account_context",
          accountIds: [sel.accountId],
          recommendationIds: sel.recommendationId ? [sel.recommendationId] : [],
          signalIds: sel.signals.map((g) => g.signalId).filter(Boolean),
          missionId: null,
          governanceStatus: "",
          approvalStatus: "",
          recommendedAction: "",
        };
      }
      // No selected account signals — point to the live portfolio truthfully.
      return {
        headline: "Signals across your ranked portfolio",
        sections: [
          {
            heading: "Where to look",
            body: "Open Portfolio Pulse in the Action Center to see the current signals across your ranked accounts.",
          },
          {
            heading: "Get a specific read",
            body: `Select an account — for example ${top.displayName}, your top priority — and I'll walk its signals with you.`,
          },
        ],
        spokenText: [
          "You don't have an account selected, so I can't name a single top signal yet.",
          "Open Portfolio Pulse in your Action Center to see the current signals across your ranked accounts.",
          `Then select an account, such as ${top.displayName} at the top of your list, and I'll walk its signals with you.`,
        ].join(" "),
        workspaceFocus: {
          focusKey: "portfolio-signals",
          anchorId: "portfolio-pulse",
          label: "Portfolio signals",
        },
        classification: "action_center_live_presentation",
        accountIds: [top.accountId],
        recommendationIds: top.recommendationId ? [top.recommendationId] : [],
        signalIds: [],
        missionId: null,
        governanceStatus: "",
        approvalStatus: "",
        recommendedAction: "",
      };
    }

    case "NEXT_ACTION": {
      const { account, classification } = focusAccount(s);
      const nextStep = safeProse(
        account.recommendedAction,
        "Review the account and take the governed next step it recommends.",
      );
      return {
        headline: `Recommended next step: ${account.displayName}`,
        sections: [
          { heading: "Recommended next step", body: nextStep },
          {
            heading: "Where it stands",
            body: `${statusLabel(account.governanceStatus, "Governed")}. ${statusLabel(account.approvalStatus, "Awaiting your approval")}.`,
          },
          {
            heading: "Your control",
            body:
              "Nothing executes without your explicit approval. VentureOS never writes to the CRM on its own.",
          },
        ],
        spokenText: [
          `For ${account.displayName}, here is the recommended next step.`,
          capitalizeFirst(nextStep),
          `Right now it is ${statusLabel(account.governanceStatus, "governed").toLowerCase()} and ${statusLabel(account.approvalStatus, "awaiting your approval").toLowerCase()}.`,
          "Nothing executes without your explicit approval, and VentureOS never writes to the CRM on its own.",
        ].join(" "),
        workspaceFocus: {
          focusKey: "next-action",
          anchorId: "workbench",
          label: "Recommended next step",
          targetAccountId: account.accountId,
          targetRecommendationId: account.recommendationId,
        },
        classification,
        accountIds: [account.accountId],
        recommendationIds: account.recommendationId ? [account.recommendationId] : [],
        signalIds: [],
        missionId: null,
        governanceStatus: account.governanceStatus,
        approvalStatus: account.approvalStatus,
        recommendedAction: account.recommendedAction,
      };
    }

    case "ACCOUNT_PRIORITY_REASON": {
      const { account, classification } = focusAccount(s);
      const reason = safeProse(
        account.priorityReason,
        "It carries the strongest governed priority signals in your current portfolio.",
      );
      const nextStep = safeProse(
        account.recommendedAction,
        "Review the account and take the governed next step it recommends.",
      );
      return {
        headline: `Why ${account.displayName} is a priority`,
        sections: [
          { heading: "Why it's a priority", body: reason },
          {
            heading: "Where it ranks",
            body: `${account.displayName} is ranked ${ordinalWord(account.rank)} by the deterministic engine — ${statusLabel(account.governanceStatus, "governed")}.`,
          },
          { heading: "Recommended next step", body: nextStep },
        ],
        spokenText: [
          `${account.displayName} is a priority for a clear reason.`,
          reason,
          `That is why the deterministic engine ranks it ${ordinalWord(account.rank)} in your Action Center.`,
          `My recommended next step: ${nextStep}`,
        ].join(" "),
        workspaceFocus: {
          focusKey: "account-detail",
          anchorId: "workbench",
          label: "Account detail",
          targetAccountId: account.accountId,
          targetRecommendationId: account.recommendationId,
        },
        classification,
        accountIds: [account.accountId],
        recommendationIds: account.recommendationId ? [account.recommendationId] : [],
        signalIds: [],
        missionId: null,
        governanceStatus: account.governanceStatus,
        approvalStatus: account.approvalStatus,
        recommendedAction: account.recommendedAction,
      };
    }
  }
}

function responseId(
  intent: GuidedIntent,
  normalizedQuestion: string,
  snapshot: ActionCenterPresentationSnapshot,
): string {
  const fp = computeScriptFingerprint(
    `${intent}|${normalizedQuestion}|${snapshot.fingerprint}`,
  );
  return `rca-${fp.replace(/^vcs1:/, "")}`;
}

function finalize(
  intent: GuidedIntent,
  body: ComposedBody,
  snapshot: ActionCenterPresentationSnapshot,
  normalizedQuestion: string,
  displayedQuestion: string,
): RevenueCompanionAnswer {
  const draft: RevenueCompanionAnswer = {
    schemaVersion: ANSWER_SCHEMA_VERSION,
    responseId: responseId(intent, normalizedQuestion, snapshot),
    presentationVersion: snapshot.presentationVersion,
    intent,
    normalizedQuestion,
    displayedQuestion,
    headline: body.headline,
    visibleSections: body.sections,
    spokenText: body.spokenText,
    accountIds: body.accountIds,
    recommendationIds: body.recommendationIds,
    missionIds: body.missionId ? [body.missionId] : [],
    signalReferences: body.signalIds,
    evidenceReferences: [...snapshot.evidenceReferences],
    governanceStatus: statusLabel(body.governanceStatus, ""),
    approvalStatus: statusLabel(body.approvalStatus, ""),
    recommendedAction: body.recommendedAction,
    snapshotId: snapshot.snapshotId,
    sourceClassification: body.classification,
    sourceAccountIds: body.accountIds,
    sourceRecommendationIds: body.recommendationIds,
    sourceMissionId: body.missionId,
    sourceSignalIds: body.signalIds,
    sourceFingerprint: snapshot.fingerprint,
    workspaceFocus: body.workspaceFocus,
    generatedFrom: {
      source: "action-center-snapshot",
      journeyKey: snapshot.snapshotId,
      narrativeId: snapshot.snapshotId,
      presentationVersion: snapshot.presentationVersion,
    },
    fingerprint: "",
    generatedAt: COMPANION_STABLE_TIMESTAMP,
  };
  draft.fingerprint = computeAnswerFingerprint(draft);
  return draft;
}

// Compose a snapshot-bound answer for an already-resolved intent. Throws when
// the snapshot has no displayed accounts (the caller must fall back).
export function composeSnapshotAnswerForIntent(
  snapshot: ActionCenterPresentationSnapshot,
  intent: GuidedIntent,
  rawQuestion?: string,
): RevenueCompanionAnswer {
  if (!snapshotHasPresentation(snapshot)) {
    throw new SnapshotAnswerError("snapshot has no displayed accounts to bind to");
  }
  const normalized = (rawQuestion ?? DISPLAYED_QUESTION[intent]).trim();
  const answer = finalize(
    intent,
    composeBody(intent, snapshot),
    snapshot,
    normalized || DISPLAYED_QUESTION[intent],
    DISPLAYED_QUESTION[intent],
  );
  const check = validateAnswer(answer);
  if (!check.ok) {
    throw new SnapshotAnswerError(
      `composed ${intent} snapshot answer failed validation: ${check.errors.join("; ")}`,
    );
  }
  return answer;
}

// Resolve a raw seller question against the snapshot. Returns null for the
// UNSUPPORTED / ambiguous branches so the caller can serve the canonical
// unsupported fallback (which does not depend on live data).
export function composeSnapshotAnswer(
  snapshot: ActionCenterPresentationSnapshot,
  rawQuestion: string,
  resolution?: IntentResolution,
): RevenueCompanionAnswer | null {
  const resolved = resolution ?? resolveIntent(rawQuestion);
  if (resolved.kind !== "intent") return null;
  return composeSnapshotAnswerForIntent(snapshot, resolved.intent, rawQuestion);
}

// Validate a supplied intent string, then compose against the snapshot.
export function composeSnapshotAnswerForDirectIntent(
  snapshot: ActionCenterPresentationSnapshot,
  intent: unknown,
  rawQuestion?: string,
): RevenueCompanionAnswer | null {
  const valid = resolveDirectIntent(intent);
  if (!valid) return null;
  return composeSnapshotAnswerForIntent(snapshot, valid, rawQuestion);
}
