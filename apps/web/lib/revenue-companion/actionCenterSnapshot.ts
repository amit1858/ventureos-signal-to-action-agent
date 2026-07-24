// VentureOS — Revenue Companion · Action Center presentation snapshot (pure)
// ==========================================================================
// Phase 3.2A. An IMMUTABLE, presentation-only projection of exactly what the
// seller currently sees in the Action Center — the ranked portfolio, the
// selected account and its visible signals, and the active mission framing.
//
// This contract is the bridge that guarantees:
//     WHAT THE SELLER SEES  =  WHAT THE COMPANION SAYS  =  WHAT GNANI READS
//
// Authority boundary (hard rules, enforced by the validator + composer):
//   • The snapshot NEVER re-ranks, re-scores, re-orders, or infers anything.
//     It only echoes fields the deterministic engine already produced and the
//     Action Center already rendered.
//   • It carries NO secrets, credentials, tokens, raw provider payloads,
//     mutable commands, financial figures, drafted emails, or call scripts.
//   • It is content-addressed: `snapshotId` and `fingerprint` are derived
//     purely from the presentation content, so any change to what is displayed
//     (rank order, selection, signals, governed status) yields a new identity.
//   • Client-supplied snapshots are PRESENTATION STATE ONLY — never authority.
//     Even a hand-crafted snapshot can only change what the Companion narrates
//     back to that same user; it can never rank, approve, execute, write CRM,
//     or mutate the Decision Ledger.
//
// Transport model (documented decision): the live ranked portfolio exists only
// client-side (it is produced by the backend workflow and held in React state),
// so pure server-side reconstruction is impractical without re-running ranking
// (forbidden). We therefore use the VALIDATED-CLIENT-FIELD model: the browser
// composes this snapshot from already-displayed state, the server validates
// every field, rejects unknown keys, constrains sizes, recomputes the
// fingerprint, binds `presentationVersion`, and treats the whole thing as
// presentation state only. See `validateSnapshot`.

import { computeScriptFingerprint, SCRIPT_FINGERPRINT_PREFIX } from "./companionContract";

export const SNAPSHOT_SCHEMA_VERSION = "1.0" as const;

// The presentation version this snapshot family speaks. Bound end-to-end (answer
// + voice) so a stale presentation contract can never be spoken as if current.
export const ACTION_CENTER_PRESENTATION_VERSION = "ac-1.0" as const;

// Bounds — a snapshot is a small presentation projection, never a data dump.
export const SNAPSHOT_MAX_RANKED = 12 as const;
export const SNAPSHOT_MAX_SIGNALS = 8 as const;
export const SNAPSHOT_MAX_EVIDENCE = 24 as const;
export const SNAPSHOT_MAX_STRING = 400 as const;

// Where an answer's facts came from, in strict source-hierarchy order.
export type SnapshotSourceClassification =
  | "action_center_live_presentation"
  | "selected_account_context"
  | "canonical_demo_fallback"
  | "unavailable";

export const SNAPSHOT_SOURCE_CLASSIFICATIONS: readonly SnapshotSourceClassification[] = [
  "action_center_live_presentation",
  "selected_account_context",
  "canonical_demo_fallback",
  "unavailable",
];

// One displayed, ranked account — presentation-safe fields only.
export interface SnapshotRankedAccount {
  rank: number;
  accountId: string;
  displayName: string;
  recommendationId: string;
  priorityReason: string;
  governanceStatus: string;
  approvalStatus: string;
  recommendedAction: string;
}

// One visible signal on the selected account, in displayed order.
export interface SnapshotSignal {
  signalId: string;
  label: string;
  description: string;
  polarity: string;
}

// The selected account and the signals the seller currently sees for it.
export interface SnapshotSelectedAccount {
  accountId: string;
  displayName: string;
  recommendationId: string;
  signals: SnapshotSignal[];
}

// The active mission framing (echoed from the governed recommendation the
// mission is about — never a newly generated mission).
export interface SnapshotActiveMission {
  missionId: string;
  accountId: string;
  title: string;
  status: string;
  recommendedAction: string;
  governanceReason: string;
}

export interface ActionCenterPresentationSnapshot {
  schemaVersion: string;
  snapshotId: string;
  presentationVersion: string;
  generatedAt: string;
  dataSourceLabel: string;
  rankedAccounts: SnapshotRankedAccount[];
  selectedAccount: SnapshotSelectedAccount | null;
  activeMission: SnapshotActiveMission | null;
  evidenceReferences: string[];
  fingerprint: string;
}

// --- small pure helpers ----------------------------------------------------

function clampString(value: unknown, max = SNAPSHOT_MAX_STRING): string {
  if (typeof value !== "string") return "";
  const t = value.trim();
  return t.length > max ? t.slice(0, max) : t;
}

// Humanize a snake/kebab slug into readable Title-case prose (e.g.
// "usage_decline" → "Usage decline"). Guarantees no residual underscore slug,
// so a signal type can be surfaced in copy without tripping the answer scan.
export function humanizeLabel(raw: string): string {
  const spaced = clampString(raw)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return "";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// --- fingerprint (content address) -----------------------------------------

// Deterministic, order-sensitive serialization of the presentation content
// (everything except the derived identity fields). Rank order and selection are
// intentionally part of the address so any change invalidates the snapshot.
function snapshotContentSource(
  s: Omit<ActionCenterPresentationSnapshot, "snapshotId" | "fingerprint">,
): string {
  const ranked = s.rankedAccounts
    .map((r) =>
      [
        r.rank,
        r.accountId,
        r.displayName,
        r.recommendationId,
        r.priorityReason,
        r.governanceStatus,
        r.approvalStatus,
        r.recommendedAction,
      ].join("\u241f"),
    )
    .join("\u241e");
  const selected = s.selectedAccount
    ? [
        s.selectedAccount.accountId,
        s.selectedAccount.displayName,
        s.selectedAccount.recommendationId,
        s.selectedAccount.signals
          .map((g) => [g.signalId, g.label, g.description, g.polarity].join("\u241f"))
          .join("\u241e"),
      ].join("\u2021")
    : "none";
  const mission = s.activeMission
    ? [
        s.activeMission.missionId,
        s.activeMission.accountId,
        s.activeMission.title,
        s.activeMission.status,
        s.activeMission.recommendedAction,
        s.activeMission.governanceReason,
      ].join("\u2021")
    : "none";
  return [
    s.schemaVersion,
    s.presentationVersion,
    s.generatedAt,
    s.dataSourceLabel,
    ranked,
    selected,
    mission,
    s.evidenceReferences.join("\u241e"),
  ].join("\u2016");
}

export function computeSnapshotFingerprint(
  s: Omit<ActionCenterPresentationSnapshot, "snapshotId" | "fingerprint">,
): string {
  return computeScriptFingerprint(snapshotContentSource(s));
}

export function deriveSnapshotId(fingerprint: string): string {
  return `acs-${fingerprint.replace(SCRIPT_FINGERPRINT_PREFIX, "")}`;
}

// --- builder (pure; safe to run in the browser) ----------------------------
// Minimal structural inputs so this module never imports app-wide `lib/types`
// and stays trivially testable. The overlay maps live `Recommendation` /
// `AccountDetail` shapes onto these before calling.

export interface RankedAccountInput {
  priority_rank?: number;
  account_id?: string;
  account_name?: string;
  recommendation_id?: string;
  priority_reason?: string;
  governance_status?: string;
  approval_status?: string;
  recommended_action?: string;
}

export interface SignalInput {
  signal_id?: string;
  signal_type?: string;
  signal_description?: string;
  positive_or_negative?: string;
}

export interface SelectedAccountInput {
  account_id: string;
  account_name?: string;
  recommendation_id?: string;
  signals?: SignalInput[];
}

export interface BuildSnapshotInput {
  recommendations: RankedAccountInput[];
  selected?: SelectedAccountInput | null;
  dataSourceLabel?: string;
  generatedAt: string; // caller passes the stable companion timestamp
  presentationVersion?: string;
}

export function buildActionCenterSnapshot(
  input: BuildSnapshotInput,
): ActionCenterPresentationSnapshot {
  const rankedAccounts: SnapshotRankedAccount[] = (input.recommendations ?? [])
    .slice()
    // Preserve the DISPLAYED order: the deterministic engine's priority_rank.
    .sort((a, b) => (a.priority_rank ?? 0) - (b.priority_rank ?? 0))
    .slice(0, SNAPSHOT_MAX_RANKED)
    .map((r) => ({
      rank: Number.isFinite(r.priority_rank) ? Number(r.priority_rank) : 0,
      accountId: clampString(r.account_id),
      displayName: clampString(r.account_name),
      recommendationId: clampString(r.recommendation_id),
      priorityReason: clampString(r.priority_reason),
      governanceStatus: clampString(r.governance_status),
      approvalStatus: clampString(r.approval_status),
      recommendedAction: clampString(r.recommended_action),
    }));

  let selectedAccount: SnapshotSelectedAccount | null = null;
  if (input.selected && clampString(input.selected.account_id)) {
    const match = rankedAccounts.find(
      (r) => r.accountId === clampString(input.selected!.account_id),
    );
    selectedAccount = {
      accountId: clampString(input.selected.account_id),
      displayName:
        clampString(input.selected.account_name) || match?.displayName || "",
      recommendationId:
        clampString(input.selected.recommendation_id) ||
        match?.recommendationId ||
        "",
      signals: (input.selected.signals ?? [])
        .slice(0, SNAPSHOT_MAX_SIGNALS)
        .map((g) => ({
          signalId: clampString(g.signal_id),
          label: humanizeLabel(g.signal_type ?? ""),
          description: clampString(g.signal_description),
          polarity: clampString(g.positive_or_negative),
        })),
    };
  }

  // Active mission = the governed recommendation the mission is about. Prefer
  // the selected account; otherwise the rank-1 account. No mission is invented.
  const missionBasis =
    (selectedAccount &&
      rankedAccounts.find((r) => r.accountId === selectedAccount!.accountId)) ||
    rankedAccounts[0] ||
    null;
  const activeMission: SnapshotActiveMission | null = missionBasis
    ? {
        missionId: missionBasis.recommendationId
          ? `msn-${computeScriptFingerprint(missionBasis.recommendationId).replace(
              SCRIPT_FINGERPRINT_PREFIX,
              "",
            )}`
          : "",
        accountId: missionBasis.accountId,
        title: missionBasis.displayName,
        status: missionBasis.governanceStatus,
        recommendedAction: missionBasis.recommendedAction,
        governanceReason: missionBasis.priorityReason,
      }
    : null;

  const evidenceReferences = rankedAccounts
    .map((r) => r.recommendationId)
    .filter((id) => id.length > 0)
    .slice(0, SNAPSHOT_MAX_EVIDENCE);

  const core: Omit<ActionCenterPresentationSnapshot, "snapshotId" | "fingerprint"> = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    presentationVersion: input.presentationVersion ?? ACTION_CENTER_PRESENTATION_VERSION,
    generatedAt: input.generatedAt,
    dataSourceLabel: clampString(input.dataSourceLabel) || "Synthetic local dataset",
    rankedAccounts,
    selectedAccount,
    activeMission,
    evidenceReferences,
  };
  const fingerprint = computeSnapshotFingerprint(core);
  return { ...core, snapshotId: deriveSnapshotId(fingerprint), fingerprint };
}

// --- validation (server trust boundary) ------------------------------------

export type SnapshotValidation =
  | { ok: true; snapshot: ActionCenterPresentationSnapshot }
  | { ok: false; reason: string };

const RANKED_KEYS = new Set([
  "rank",
  "accountId",
  "displayName",
  "recommendationId",
  "priorityReason",
  "governanceStatus",
  "approvalStatus",
  "recommendedAction",
]);
const SIGNAL_KEYS = new Set(["signalId", "label", "description", "polarity"]);
const SELECTED_KEYS = new Set([
  "accountId",
  "displayName",
  "recommendationId",
  "signals",
]);
const MISSION_KEYS = new Set([
  "missionId",
  "accountId",
  "title",
  "status",
  "recommendedAction",
  "governanceReason",
]);
const SNAPSHOT_KEYS = new Set([
  "schemaVersion",
  "snapshotId",
  "presentationVersion",
  "generatedAt",
  "dataSourceLabel",
  "rankedAccounts",
  "selectedAccount",
  "activeMission",
  "evidenceReferences",
  "fingerprint",
]);

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function onlyKnownKeys(obj: Record<string, unknown>, allowed: Set<string>): string | null {
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) return k;
  }
  return null;
}

function reqStr(v: unknown, max: number = SNAPSHOT_MAX_STRING): string | null {
  if (typeof v !== "string") return null;
  if (v.length > max) return null;
  return v;
}

// Parse + validate an untrusted snapshot object (already JSON-parsed). Fails
// closed on: unknown keys, wrong types, oversized strings/arrays, schema/version
// drift, or a fingerprint that does not recompute. On success returns a snapshot
// rebuilt from the validated fields (so no unvetted bytes are ever trusted).
export function validateSnapshot(raw: unknown): SnapshotValidation {
  if (!isObj(raw)) return { ok: false, reason: "snapshot_not_object" };
  const unknown = onlyKnownKeys(raw, SNAPSHOT_KEYS);
  if (unknown) return { ok: false, reason: `unexpected_field:${unknown}` };

  if (raw.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    return { ok: false, reason: "schema_version_invalid" };
  }
  const presentationVersion = reqStr(raw.presentationVersion, 64);
  if (presentationVersion === null) return { ok: false, reason: "presentation_version_invalid" };
  const generatedAt = reqStr(raw.generatedAt, 64);
  if (generatedAt === null) return { ok: false, reason: "generated_at_invalid" };
  const dataSourceLabel = reqStr(raw.dataSourceLabel);
  if (dataSourceLabel === null) return { ok: false, reason: "data_source_label_invalid" };

  if (!Array.isArray(raw.rankedAccounts) || raw.rankedAccounts.length > SNAPSHOT_MAX_RANKED) {
    return { ok: false, reason: "ranked_accounts_invalid" };
  }
  const rankedAccounts: SnapshotRankedAccount[] = [];
  for (const item of raw.rankedAccounts) {
    if (!isObj(item)) return { ok: false, reason: "ranked_item_not_object" };
    const bad = onlyKnownKeys(item, RANKED_KEYS);
    if (bad) return { ok: false, reason: `ranked_unexpected_field:${bad}` };
    if (typeof item.rank !== "number" || !Number.isFinite(item.rank) || item.rank < 0) {
      return { ok: false, reason: "rank_invalid" };
    }
    const accountId = reqStr(item.accountId);
    const displayName = reqStr(item.displayName);
    const recommendationId = reqStr(item.recommendationId);
    const priorityReason = reqStr(item.priorityReason);
    const governanceStatus = reqStr(item.governanceStatus);
    const approvalStatus = reqStr(item.approvalStatus);
    const recommendedAction = reqStr(item.recommendedAction);
    if (
      accountId === null ||
      displayName === null ||
      recommendationId === null ||
      priorityReason === null ||
      governanceStatus === null ||
      approvalStatus === null ||
      recommendedAction === null
    ) {
      return { ok: false, reason: "ranked_field_invalid" };
    }
    rankedAccounts.push({
      rank: item.rank,
      accountId,
      displayName,
      recommendationId,
      priorityReason,
      governanceStatus,
      approvalStatus,
      recommendedAction,
    });
  }

  let selectedAccount: SnapshotSelectedAccount | null = null;
  if (raw.selectedAccount !== null && raw.selectedAccount !== undefined) {
    const sel = raw.selectedAccount;
    if (!isObj(sel)) return { ok: false, reason: "selected_not_object" };
    const bad = onlyKnownKeys(sel, SELECTED_KEYS);
    if (bad) return { ok: false, reason: `selected_unexpected_field:${bad}` };
    const accountId = reqStr(sel.accountId);
    const displayName = reqStr(sel.displayName);
    const recommendationId = reqStr(sel.recommendationId);
    if (accountId === null || displayName === null || recommendationId === null) {
      return { ok: false, reason: "selected_field_invalid" };
    }
    if (!Array.isArray(sel.signals) || sel.signals.length > SNAPSHOT_MAX_SIGNALS) {
      return { ok: false, reason: "signals_invalid" };
    }
    const signals: SnapshotSignal[] = [];
    for (const g of sel.signals) {
      if (!isObj(g)) return { ok: false, reason: "signal_not_object" };
      const sbad = onlyKnownKeys(g, SIGNAL_KEYS);
      if (sbad) return { ok: false, reason: `signal_unexpected_field:${sbad}` };
      const signalId = reqStr(g.signalId);
      const label = reqStr(g.label);
      const description = reqStr(g.description);
      const polarity = reqStr(g.polarity);
      if (signalId === null || label === null || description === null || polarity === null) {
        return { ok: false, reason: "signal_field_invalid" };
      }
      signals.push({ signalId, label, description, polarity });
    }
    selectedAccount = { accountId, displayName, recommendationId, signals };
  }

  let activeMission: SnapshotActiveMission | null = null;
  if (raw.activeMission !== null && raw.activeMission !== undefined) {
    const m = raw.activeMission;
    if (!isObj(m)) return { ok: false, reason: "mission_not_object" };
    const bad = onlyKnownKeys(m, MISSION_KEYS);
    if (bad) return { ok: false, reason: `mission_unexpected_field:${bad}` };
    const missionId = reqStr(m.missionId);
    const accountId = reqStr(m.accountId);
    const title = reqStr(m.title);
    const status = reqStr(m.status);
    const recommendedAction = reqStr(m.recommendedAction);
    const governanceReason = reqStr(m.governanceReason);
    if (
      missionId === null ||
      accountId === null ||
      title === null ||
      status === null ||
      recommendedAction === null ||
      governanceReason === null
    ) {
      return { ok: false, reason: "mission_field_invalid" };
    }
    activeMission = { missionId, accountId, title, status, recommendedAction, governanceReason };
  }

  if (
    !Array.isArray(raw.evidenceReferences) ||
    raw.evidenceReferences.length > SNAPSHOT_MAX_EVIDENCE ||
    !raw.evidenceReferences.every((e) => typeof e === "string" && e.length <= SNAPSHOT_MAX_STRING)
  ) {
    return { ok: false, reason: "evidence_references_invalid" };
  }

  if (typeof raw.snapshotId !== "string" || typeof raw.fingerprint !== "string") {
    return { ok: false, reason: "identity_fields_invalid" };
  }

  const core: Omit<ActionCenterPresentationSnapshot, "snapshotId" | "fingerprint"> = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    presentationVersion,
    generatedAt,
    dataSourceLabel,
    rankedAccounts,
    selectedAccount,
    activeMission,
    evidenceReferences: raw.evidenceReferences as string[],
  };
  const fingerprint = computeSnapshotFingerprint(core);
  if (fingerprint !== raw.fingerprint) {
    return { ok: false, reason: "fingerprint_mismatch" };
  }
  const snapshotId = deriveSnapshotId(fingerprint);
  if (snapshotId !== raw.snapshotId) {
    return { ok: false, reason: "snapshot_id_mismatch" };
  }

  return { ok: true, snapshot: { ...core, snapshotId, fingerprint } };
}

// True when a snapshot carries at least one displayed account — i.e. there is a
// live presentation to bind to (vs. an empty Action Center → canonical fallback).
export function snapshotHasPresentation(s: ActionCenterPresentationSnapshot): boolean {
  return s.rankedAccounts.length > 0;
}
