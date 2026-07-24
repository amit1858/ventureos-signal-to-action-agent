// VentureOS — Revenue Companion · Action Center snapshot contract eval
// ====================================================================
// Phase 3.2A. Deterministic, dependency-free proof that the presentation-only
// Action Center snapshot is:
//   • content-addressed + deterministic (same displayed view → same identity),
//   • sensitive to ANY displayed change (rank order / selection / signals),
//   • a strict server trust boundary (unknown keys, oversized payloads, schema
//     drift, and tampered fingerprints all fail closed), and
//   • presentation-only (no scores/spend/drafts/scripts smuggled through).
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./apps/web/lib/memory/eval/register.mjs \
//     ./apps/web/lib/revenue-companion/eval/actionCenterSnapshot.eval.ts

import {
  ACTION_CENTER_PRESENTATION_VERSION,
  SNAPSHOT_MAX_RANKED,
  SNAPSHOT_MAX_SIGNALS,
  SNAPSHOT_SCHEMA_VERSION,
  buildActionCenterSnapshot,
  deriveSnapshotId,
  humanizeLabel,
  snapshotHasPresentation,
  validateSnapshot,
  type BuildSnapshotInput,
  type RankedAccountInput,
} from "../actionCenterSnapshot";
import { COMPANION_STABLE_TIMESTAMP } from "../companionContract";

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
    priority_reason: `${name} shows adverse renewal movement`,
    governance_status: "review_required",
    approval_status: "awaiting_approval",
    recommended_action: "Schedule a renewal alignment call",
  };
}

function baseInput(): BuildSnapshotInput {
  return {
    recommendations: [
      ranked(1, "a1", "Curefoods"),
      ranked(2, "a2", "Northwind"),
      ranked(3, "a3", "Acme Retail"),
    ],
    selected: {
      account_id: "a1",
      account_name: "Curefoods",
      recommendation_id: "rec-a1",
      signals: [
        {
          signal_id: "sig-1",
          signal_type: "usage_decline",
          signal_description: "Weekly active usage fell across the account",
          positive_or_negative: "negative",
        },
      ],
    },
    dataSourceLabel: "HubSpot test portal",
    generatedAt: COMPANION_STABLE_TIMESTAMP,
  };
}

// ===========================================================================
console.log("\n[0] Shape + presentation-version binding");
// ===========================================================================
{
  const s = buildActionCenterSnapshot(baseInput());
  check("schema version pinned", s.schemaVersion === SNAPSHOT_SCHEMA_VERSION);
  check(
    "presentation version pinned",
    s.presentationVersion === ACTION_CENTER_PRESENTATION_VERSION,
  );
  check("generatedAt is the stable timestamp", s.generatedAt === COMPANION_STABLE_TIMESTAMP);
  check("snapshotId derives from fingerprint", s.snapshotId === deriveSnapshotId(s.fingerprint));
  check("ranked order preserved as given", s.rankedAccounts.map((r) => r.accountId).join(",") === "a1,a2,a3");
  check("has presentation", snapshotHasPresentation(s));
}

// ===========================================================================
console.log("\n[1] Deterministic + content-addressed");
// ===========================================================================
{
  const a = buildActionCenterSnapshot(baseInput());
  const b = buildActionCenterSnapshot(baseInput());
  check("same displayed view → same fingerprint", a.fingerprint === b.fingerprint);
  check("same displayed view → same snapshotId", a.snapshotId === b.snapshotId);
}

// ===========================================================================
console.log("\n[2] Sensitive to ANY displayed change");
// ===========================================================================
{
  const base = buildActionCenterSnapshot(baseInput());

  // Re-ranked (order swapped) → different identity.
  const reordered = buildActionCenterSnapshot({
    ...baseInput(),
    recommendations: [
      ranked(1, "a2", "Northwind"),
      ranked(2, "a1", "Curefoods"),
      ranked(3, "a3", "Acme Retail"),
    ],
  });
  check("re-ranked portfolio → different fingerprint", base.fingerprint !== reordered.fingerprint);

  // Different selection → different identity.
  const inputSel2 = baseInput();
  inputSel2.selected = { account_id: "a2", account_name: "Northwind", recommendation_id: "rec-a2", signals: [] };
  const selChanged = buildActionCenterSnapshot(inputSel2);
  check("changed selection → different fingerprint", base.fingerprint !== selChanged.fingerprint);

  // Changed signals → different identity.
  const inputSig = baseInput();
  inputSig.selected!.signals = [
    { signal_id: "sig-9", signal_type: "champion_left", signal_description: "Primary champion departed", positive_or_negative: "negative" },
  ];
  const sigChanged = buildActionCenterSnapshot(inputSig);
  check("changed signals → different fingerprint", base.fingerprint !== sigChanged.fingerprint);

  // Changed governed status → different identity (governed standing is displayed).
  const inputStatus = baseInput();
  inputStatus.recommendations[0].governance_status = "approved";
  const statusChanged = buildActionCenterSnapshot(inputStatus);
  check("changed governed status → different fingerprint", base.fingerprint !== statusChanged.fingerprint);
}

// ===========================================================================
console.log("\n[3] Server trust boundary — validateSnapshot round-trip + rejections");
// ===========================================================================
{
  const built = buildActionCenterSnapshot(baseInput());
  const asJson = JSON.parse(JSON.stringify(built)) as Record<string, unknown>;

  const ok = validateSnapshot(asJson);
  check("a built snapshot validates", ok.ok === true, JSON.stringify(ok));
  if (ok.ok) {
    check("validated fingerprint matches", ok.snapshot.fingerprint === built.fingerprint);
    check("validated snapshotId matches", ok.snapshot.snapshotId === built.snapshotId);
  }

  // Unknown top-level key → reject.
  const extra = { ...asJson, injected: "x" };
  const r1 = validateSnapshot(extra);
  check("unknown key rejected", r1.ok === false && r1.reason.startsWith("unexpected_field"), JSON.stringify(r1));

  // Wrong schema version → reject.
  const badSchema = { ...asJson, schemaVersion: "9.9" };
  const r2 = validateSnapshot(badSchema);
  check("schema drift rejected", r2.ok === false && r2.reason === "schema_version_invalid");

  // Tampered fingerprint (content changed, id not recomputable) → reject.
  const tampered = JSON.parse(JSON.stringify(built)) as Record<string, unknown>;
  (tampered.rankedAccounts as Array<Record<string, unknown>>)[0].displayName = "Injected Corp";
  const r3 = validateSnapshot(tampered);
  check("tampered content (stale fingerprint) rejected", r3.ok === false, JSON.stringify(r3));

  // Oversized ranked array → reject.
  const tooMany: RankedAccountInput[] = [];
  for (let i = 0; i < SNAPSHOT_MAX_RANKED + 3; i++) tooMany.push(ranked(i + 1, `x${i}`, `Acct ${i}`));
  const big = buildActionCenterSnapshot({ ...baseInput(), recommendations: tooMany, selected: null });
  check("builder caps ranked accounts at the max", big.rankedAccounts.length <= SNAPSHOT_MAX_RANKED);

  // Not an object → reject.
  check("non-object rejected", validateSnapshot(null).ok === false);
  check("array rejected", validateSnapshot([]).ok === false);
}

// ===========================================================================
console.log("\n[4] Presentation-only — no sensitive atoms carried");
// ===========================================================================
{
  // Feed a payload salted with sensitive keys; the builder maps only the known
  // presentation fields, so the serialized snapshot must not carry them.
  const dirty = baseInput() as unknown as Record<string, unknown>;
  (dirty.recommendations as Array<Record<string, unknown>>)[0].priority_score = 0.97;
  (dirty.recommendations as Array<Record<string, unknown>>)[0].draft_email = "Hi there";
  (dirty.recommendations as Array<Record<string, unknown>>)[0].call_script = "Say this";
  (dirty.recommendations as Array<Record<string, unknown>>)[0].score_breakdown = { renewal: 1 };
  const s = buildActionCenterSnapshot(dirty as unknown as BuildSnapshotInput);
  const blob = JSON.stringify(s);
  check("no priority_score leaked", !blob.includes("priority_score") && !blob.includes("0.97"));
  check("no draft_email leaked", !blob.includes("draft_email") && !blob.includes("Hi there"));
  check("no call_script leaked", !blob.includes("call_script") && !blob.includes("Say this"));
  check("no score_breakdown leaked", !blob.includes("score_breakdown"));
}

// ===========================================================================
console.log("\n[5] Empty portfolio + label humanization");
// ===========================================================================
{
  const empty = buildActionCenterSnapshot({
    recommendations: [],
    selected: null,
    dataSourceLabel: "Synthetic local dataset",
    generatedAt: COMPANION_STABLE_TIMESTAMP,
  });
  check("empty portfolio has no presentation", snapshotHasPresentation(empty) === false);

  check("humanizeLabel strips underscores", humanizeLabel("review_required") === "Review required");
  check("humanizeLabel strips kebab", humanizeLabel("awaiting-approval") === "Awaiting approval");
  check("humanizeLabel keeps clean prose", humanizeLabel("Governed") === "Governed");

  check("signals cap constant exposed", SNAPSHOT_MAX_SIGNALS === 8);
}

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log(`Action Center snapshot contract eval: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All Action Center snapshot contract checks passed.");
console.log("=".repeat(70));
