// VentureOS — Revenue Companion · Presentation parity eval
// ========================================================
// Phase 3.2A. Deterministic, dependency-free proof that WHAT THE SELLER SEES =
// WHAT THE COMPANION SAYS = WHAT GNANI READS. Every answer is composed from the
// live, fingerprinted Action Center snapshot, so:
//   A. priority parity   — the answer enumerates accounts in the DISPLAYED rank
//      order (never re-sorted),
//   B. mission parity    — "today's mission" names the rank-1 account on screen,
//   C. signal parity     — top signals come from the SELECTED account's signals,
//      in displayed order, and are classified as selected-account context,
//   D. focus parity      — next-action / reason describe the selected account
//      when one is open, else the rank-1 account,
//   E. voice parity      — the spoken text is the SAME governed copy, and its
//      fingerprint recomputes (so the voice seam re-verifies it),
//   F. fallback truth    — an empty snapshot forces the caller to fall back
//      (compose throws) rather than inventing a live answer,
//   G. no cross-context  — a changed selection changes the answer identity, so a
//      stale (other-account) voice request can never be honored,
//   H. no ranking mutation — a deliberately non-alphabetical displayed order is
//      read back verbatim,
//   I. no application mutation — composing mutates neither the snapshot nor any
//      governed field; the answer is advisory, provenance = snapshot,
//   J. answer safety     — all rendered copy is slug/id-free and governed.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/revenue-companion/eval/presentationParity.eval.ts

import {
  buildActionCenterSnapshot,
  type BuildSnapshotInput,
  type RankedAccountInput,
} from "../actionCenterSnapshot";
import {
  composeSnapshotAnswer,
  composeSnapshotAnswerForDirectIntent,
  composeSnapshotAnswerForIntent,
} from "../snapshotComposer";
import {
  computeAnswerFingerprint,
  scanAnswerText,
  validateAnswer,
} from "../answerContract";
import { COMPANION_STABLE_TIMESTAMP } from "../companionContract";
import { GUIDED_INTENTS, type GuidedIntent } from "../guided/intentRouter";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

// --- fixtures --------------------------------------------------------------

function ranked(rank: number, id: string, name: string): RankedAccountInput {
  return {
    priority_rank: rank,
    account_id: id,
    account_name: name,
    recommendation_id: `rec-${id}`,
    priority_reason: `${name} is trending toward an earlier, higher-risk renewal`,
    governance_status: "review_required",
    approval_status: "awaiting_approval",
    recommended_action: "Schedule a renewal alignment call with the buyer",
  };
}

// Deliberately NON-alphabetical displayed order to prove no re-sorting.
function portfolioInput(selectedId: string | null): BuildSnapshotInput {
  const recs = [
    ranked(1, "z-cure", "Zenith Foods"),
    ranked(2, "a-north", "Acme Northwind"),
    ranked(3, "m-mid", "Midtown Retail"),
  ];
  const selected =
    selectedId === null
      ? null
      : {
          account_id: selectedId,
          account_name: recs.find((r) => r.account_id === selectedId)?.account_name ?? "Zenith Foods",
          recommendation_id: `rec-${selectedId}`,
          signals: [
            {
              signal_id: "sig-a",
              signal_type: "usage_decline",
              signal_description: "Weekly active usage dropped sharply over the last month",
              positive_or_negative: "negative",
            },
            {
              signal_id: "sig-b",
              signal_type: "support_escalation",
              signal_description: "A critical support ticket was escalated by the buyer",
              positive_or_negative: "negative",
            },
          ],
        };
  return {
    recommendations: recs,
    selected,
    dataSourceLabel: "HubSpot test portal",
    generatedAt: COMPANION_STABLE_TIMESTAMP,
  };
}

const withSelection = buildActionCenterSnapshot(portfolioInput("z-cure"));
const noSelection = buildActionCenterSnapshot(portfolioInput(null));

function rendered(a: {
  headline: string;
  visibleSections: { heading: string; body: string }[];
  spokenText: string;
}): string {
  return [a.headline, ...a.visibleSections.map((s) => s.body), a.spokenText].join("\n");
}

// ===========================================================================
console.log("\n[A] Priority parity — displayed rank order is read back verbatim");
// ===========================================================================
{
  const ans = composeSnapshotAnswerForIntent(withSelection, "PRIORITY_ACCOUNTS");
  const body = ans.visibleSections.map((s) => s.body).join(" ");
  const zPos = body.indexOf("Zenith Foods");
  const aPos = body.indexOf("Acme Northwind");
  const mPos = body.indexOf("Midtown Retail");
  check("all three displayed accounts named", zPos >= 0 && aPos >= 0 && mPos >= 0);
  check("named in displayed rank order (not alphabetical)", zPos < aPos && aPos < mPos, body);
  check("classified as live presentation", ans.sourceClassification === "action_center_live_presentation");
  check(
    "source account ids follow displayed order",
    ans.sourceAccountIds.join(",") === "z-cure,a-north,m-mid",
    ans.sourceAccountIds.join(","),
  );
}

// ===========================================================================
console.log("\n[B] Mission parity — today's mission = the rank-1 account on screen");
// ===========================================================================
{
  const ans = composeSnapshotAnswerForIntent(withSelection, "MISSION_TODAY");
  check("headline names rank-1 account", ans.headline.includes("Zenith Foods"), ans.headline);
  check("does NOT name a lower-ranked account first", !ans.headline.includes("Midtown Retail"));
  check("bound to rank-1 account id", ans.sourceAccountIds[0] === "z-cure");
}

// ===========================================================================
console.log("\n[C] Signal parity — selected account's signals, in displayed order");
// ===========================================================================
{
  const ans = composeSnapshotAnswerForIntent(withSelection, "TOP_SIGNALS");
  check("classified as selected-account context", ans.sourceClassification === "selected_account_context");
  check("bound to selected account", ans.sourceAccountIds[0] === "z-cure");
  check(
    "signal references follow displayed order",
    ans.sourceSignalIds.join(",") === "sig-a,sig-b",
    ans.sourceSignalIds.join(","),
  );

  // With no selection, it must truthfully point to the portfolio, not invent one.
  const noSel = composeSnapshotAnswerForIntent(noSelection, "TOP_SIGNALS");
  check("no-selection top-signals classified as live presentation", noSel.sourceClassification === "action_center_live_presentation");
  check("no-selection top-signals emits no signal ids", noSel.sourceSignalIds.length === 0);
  check("no-selection top-signals points to portfolio pulse", noSel.workspaceFocus?.anchorId === "portfolio-pulse");
}

// ===========================================================================
console.log("\n[D] Focus parity — selected account when open, else rank-1");
// ===========================================================================
{
  for (const intent of ["NEXT_ACTION", "ACCOUNT_PRIORITY_REASON"] as GuidedIntent[]) {
    const sel = composeSnapshotAnswerForIntent(withSelection, intent);
    check(`${intent}: selection open → describes selected account`, sel.sourceAccountIds[0] === "z-cure");
    check(`${intent}: selection open → selected-account classification`, sel.sourceClassification === "selected_account_context");

    const unsel = composeSnapshotAnswerForIntent(noSelection, intent);
    check(`${intent}: no selection → describes rank-1 account`, unsel.sourceAccountIds[0] === "z-cure");
    check(`${intent}: no selection → live-presentation classification`, unsel.sourceClassification === "action_center_live_presentation");
  }
}

// ===========================================================================
console.log("\n[E] Voice parity — spoken text is the SAME governed copy + recomputes");
// ===========================================================================
{
  for (const intent of GUIDED_INTENTS) {
    const a = composeSnapshotAnswerForIntent(withSelection, intent);
    // Fingerprint recomputes (the voice seam re-verifies exactly this).
    check(`${intent}: answer fingerprint recomputes`, computeAnswerFingerprint(a) === a.fingerprint);
    // Deterministic: same snapshot + intent → identical spoken text + fingerprint.
    const b = composeSnapshotAnswerForIntent(withSelection, intent);
    check(`${intent}: spoken text is deterministic`, a.spokenText === b.spokenText);
    check(`${intent}: fingerprint is deterministic`, a.fingerprint === b.fingerprint);
    // Spoken text is bounded (35–80 words) — validateAnswer enforces this, and
    // compose throws otherwise, so reaching here already proves it; assert too.
    const words = a.spokenText.trim().split(/\s+/).length;
    check(`${intent}: spoken word count in [35,80]`, words >= 35 && words <= 80, String(words));
    // Provenance is the live snapshot, not the canonical journey.
    check(`${intent}: provenance = action-center-snapshot`, a.generatedFrom.source === "action-center-snapshot");
    check(`${intent}: narrativeId = snapshotId`, a.generatedFrom.narrativeId === withSelection.snapshotId);
  }
}

// ===========================================================================
console.log("\n[F] Fallback truth — empty snapshot forces caller fallback");
// ===========================================================================
{
  const empty = buildActionCenterSnapshot({
    recommendations: [],
    selected: null,
    dataSourceLabel: "Synthetic local dataset",
    generatedAt: COMPANION_STABLE_TIMESTAMP,
  });
  let threw = false;
  try {
    composeSnapshotAnswerForIntent(empty, "MISSION_TODAY");
  } catch {
    threw = true;
  }
  check("empty snapshot → compose throws (never invents a live answer)", threw);

  // Unsupported free-text → null (caller serves the live-independent fallback).
  check(
    "unsupported question → null (caller falls back)",
    composeSnapshotAnswer(withSelection, "what is the weather in paris") === null,
  );
  // Junk direct intent → null.
  check(
    "junk direct intent → null",
    composeSnapshotAnswerForDirectIntent(withSelection, "EXECUTE_NOW") === null,
  );
  // A supported free-text question → bound answer.
  const supported = composeSnapshotAnswer(withSelection, "what should I focus on today");
  check("supported question → bound answer", supported !== null && supported.generatedFrom.source === "action-center-snapshot");
}

// ===========================================================================
console.log("\n[G] No cross-context leakage — changed selection changes identity");
// ===========================================================================
{
  const selZ = buildActionCenterSnapshot(portfolioInput("z-cure"));
  const selA = buildActionCenterSnapshot(portfolioInput("a-north"));
  check("different selection → different snapshot identity", selZ.snapshotId !== selA.snapshotId);

  const ansZ = composeSnapshotAnswerForIntent(selZ, "ACCOUNT_PRIORITY_REASON");
  const ansA = composeSnapshotAnswerForIntent(selA, "ACCOUNT_PRIORITY_REASON");
  check("different selection → different answer fingerprint", ansZ.fingerprint !== ansA.fingerprint);
  check("selecting a-north describes a-north", ansA.sourceAccountIds[0] === "a-north");
  check("selecting a-north never describes z-cure", !ansA.headline.includes("Zenith Foods"));
  // A voice request built for ansZ but replayed against selA's fingerprint would
  // mismatch — proven here by the fingerprints being distinct.
  check("stale (z) answer fingerprint ≠ current (a) snapshot answer", ansZ.fingerprint !== ansA.fingerprint);
}

// ===========================================================================
console.log("\n[H] No ranking mutation — non-alphabetical order preserved");
// ===========================================================================
{
  // Displayed order is Zenith, Acme, Midtown (NOT alphabetical: Acme, Midtown,
  // Zenith). The answer must read it back as displayed.
  const ans = composeSnapshotAnswerForIntent(withSelection, "PRIORITY_ACCOUNTS");
  const orderBody = ans.visibleSections.find((s) => /order/i.test(s.heading))?.body ?? "";
  const first = orderBody.indexOf("Zenith Foods");
  const second = orderBody.indexOf("Acme Northwind");
  check("engine order (not alphabetical) is preserved", first >= 0 && second >= 0 && first < second, orderBody);
}

// ===========================================================================
console.log("\n[I] No application mutation — snapshot + governed fields untouched");
// ===========================================================================
{
  const snap = buildActionCenterSnapshot(portfolioInput("z-cure"));
  const before = JSON.stringify(snap);
  for (const intent of GUIDED_INTENTS) composeSnapshotAnswerForIntent(snap, intent);
  check("composing does not mutate the snapshot", JSON.stringify(snap) === before);

  const ans = composeSnapshotAnswerForIntent(snap, "MISSION_TODAY");
  // Advisory only — the answer carries no approval/execution capability.
  const blob = JSON.stringify(ans).toLowerCase();
  check("answer contains no execute/approve verb as an action", !/"action":\s*"(execute|approve)"/.test(blob));
  check("recommendedAction is advisory copy (present, not a command flag)", typeof ans.recommendedAction === "string");
  check("no writeback field on the answer", !("writeback" in (ans as unknown as Record<string, unknown>)));
}

// ===========================================================================
console.log("\n[J] Answer safety — every rendered atom is slug/id-free + governed");
// ===========================================================================
{
  for (const snap of [withSelection, noSelection]) {
    for (const intent of GUIDED_INTENTS) {
      const a = composeSnapshotAnswerForIntent(snap, intent);
      const text = rendered(a);
      check(`${intent}: rendered copy passes the answer scan`, scanAnswerText(text) === null, text.slice(0, 120));
      check(`${intent}: answer validates`, validateAnswer(a).ok === true);
      // No raw snapshot id / mission id / fingerprint token leaks into copy.
      check(`${intent}: no snapshotId in rendered copy`, !text.includes(snap.snapshotId));
      check(`${intent}: no fingerprint token in rendered copy`, !text.includes("vcs1:") && !text.includes("acs-"));
    }
  }
}

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Revenue Companion presentation parity eval: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All presentation parity checks passed.");
console.log("=".repeat(70));
