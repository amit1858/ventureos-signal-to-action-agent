// Release 2.3 — Curefoods Canonical Mission Continuity (pure identity bridge)
// ===========================================================================
// The single source of truth that binds the TWO Curefoods identity spaces that
// previously never met:
//
//   * Portfolio / Seller space  — `ACC-0016` "Curefoods" (synthetic accounts,
//     Morning Brief, Today's Mission, DECISION_DEMO_ACCOUNTS).
//   * Governed Mission space     — `VOS-CUREFOODS` / mission `M-RENEWAL-1` /
//     recommendation `REC-M-RENEWAL-1` (Mission Control, Python harness turn).
//
// Before this module the "Open governed mission" CTA discarded all identity and
// Mission Control silently ran a hard-coded mission, so a viewer could never
// prove the seller's account and the governed mission were the SAME Curefoods.
// This module makes that binding explicit, deterministic and testable.
//
// Design invariants (LOCKED):
//   * It OWNS no governance and re-derives no policy, ranking, verification,
//     approval or execution. It only maps identity and projects presentation.
//   * It is a pure module (types + plain functions; no JSX, no clock, no
//     network, no node-only APIs) so the deterministic eval loader can verify it.
//   * Navigation only ever carries SAFE identifiers (canonical account id,
//     mission id, source surface). It NEVER serialises a payload hash, evidence
//     ref, approval binding, token or any secret.
//   * An incoming context is honoured ONLY if it matches this deterministic
//     allowlist. Unknown ids are rejected — Mission Control must never silently
//     switch to an unverified account.

// ---------------------------------------------------------------------------
// The canonical binding — ONE Curefoods identity across both spaces
// ---------------------------------------------------------------------------

/** The immutable identity binding for the governed Curefoods renewal demo. It
 * ties every id the two surfaces use to the same account and mission so the
 * seller -> Mission Control -> outcome journey is provably continuous. */
export interface CanonicalDemoAccount {
  /** Portfolio / Seller account id (synthetic accounts, Morning Brief). */
  readonly portfolioAccountId: string;
  /** Governed VentureOS canonical account id (Mission Control turn). */
  readonly ventureOsId: string;
  /** Human-facing account name, identical on both surfaces. */
  readonly canonicalName: string;
  /** The governed mission this account's renewal risk maps to. */
  readonly missionId: string;
  /** The governed recommendation the mission carries. */
  readonly recommendationId: string;
  /** The deterministically selected mission template. */
  readonly selectedTemplateId: string;
}

/** The single supported governed demo account. Frozen so no surface can mutate
 * the canonical identity. Additional accounts would be added here (and only
 * here) once their governed missions exist. */
export const CUREFOODS_CANONICAL: CanonicalDemoAccount = Object.freeze({
  portfolioAccountId: "ACC-0016",
  ventureOsId: "VOS-CUREFOODS",
  canonicalName: "Curefoods",
  missionId: "M-RENEWAL-1",
  recommendationId: "REC-M-RENEWAL-1",
  selectedTemplateId: "renewal-risk-parallel-v1",
});

/** The deterministic allowlist of governed demo accounts. A single entry today;
 * the resolver + validator are written to scale to more without code changes. */
export const CANONICAL_DEMO_ACCOUNTS: readonly CanonicalDemoAccount[] =
  Object.freeze([CUREFOODS_CANONICAL]);

// ---------------------------------------------------------------------------
// Mission context — the safe, navigable handoff object
// ---------------------------------------------------------------------------

/** Where a governed-mission handoff originated. Used only for an honest
 * continuity cue; it never changes any governed fact. */
export type MissionContextSource = "todays-mission" | "direct" | "unknown";

/** The presentation-safe context passed from the seller surface to Mission
 * Control. Carries ONLY safe identifiers — never a hash, evidence ref or token. */
export interface CanonicalMissionContext {
  readonly ventureOsId: string;
  readonly missionId: string;
  readonly canonicalName: string;
  readonly source: MissionContextSource;
  /** True when the seller was actually viewing this canonical account when the
   * handoff was created (so the continuity cue can be precise vs. generic). */
  readonly matchedSelectedAccount: boolean;
}

const VALID_SOURCES: readonly MissionContextSource[] = [
  "todays-mission",
  "direct",
  "unknown",
];

function normaliseSource(value: string | null | undefined): MissionContextSource {
  return value && (VALID_SOURCES as readonly string[]).includes(value)
    ? (value as MissionContextSource)
    : "unknown";
}

// ---------------------------------------------------------------------------
// Resolution — portfolio id -> canonical binding (deterministic)
// ---------------------------------------------------------------------------

/** Resolve the canonical governed account for a portfolio (seller) account id.
 * Deterministic and case-insensitive on the id. Returns `null` for any account
 * that has no governed mission — the caller must NOT invent one. */
export function resolveCanonicalByPortfolioId(
  portfolioAccountId: string | null | undefined,
): CanonicalDemoAccount | null {
  if (!portfolioAccountId) return null;
  const id = portfolioAccountId.trim().toUpperCase();
  return (
    CANONICAL_DEMO_ACCOUNTS.find(
      (a) => a.portfolioAccountId.toUpperCase() === id,
    ) ?? null
  );
}

/** Resolve the canonical governed account for a VentureOS canonical id.
 * Deterministic and case-insensitive. Returns `null` when unknown. */
export function resolveCanonicalByVentureOsId(
  ventureOsId: string | null | undefined,
): CanonicalDemoAccount | null {
  if (!ventureOsId) return null;
  const id = ventureOsId.trim().toUpperCase();
  return (
    CANONICAL_DEMO_ACCOUNTS.find((a) => a.ventureOsId.toUpperCase() === id) ??
    null
  );
}

// ---------------------------------------------------------------------------
// Seller -> Mission Control handoff (build)
// ---------------------------------------------------------------------------

/** Build the governed-mission handoff context for a seller who is viewing
 * `selectedPortfolioAccountId`. If that account maps to a governed mission the
 * context is bound to it (`matchedSelectedAccount:true`); otherwise the seller
 * is handed the single supported governed demo (Curefoods) with
 * `matchedSelectedAccount:false`, so the continuity cue stays truthful. */
export function buildMissionContextForSeller(
  selectedPortfolioAccountId: string | null | undefined,
): CanonicalMissionContext {
  const matched = resolveCanonicalByPortfolioId(selectedPortfolioAccountId);
  const account = matched ?? CUREFOODS_CANONICAL;
  return {
    ventureOsId: account.ventureOsId,
    missionId: account.missionId,
    canonicalName: account.canonicalName,
    source: "todays-mission",
    matchedSelectedAccount: matched !== null,
  };
}

/** Query-parameter keys for the safe navigation handoff. Short + stable. */
export const MISSION_CONTEXT_PARAMS = Object.freeze({
  account: "account",
  mission: "mission",
  from: "from",
});

/** Serialise a mission context to a URL query string fragment carrying ONLY
 * safe identifiers. Never includes a hash, evidence, approval binding or token.
 * The leading `?`/`&` is the caller's concern; this returns `k=v&k=v`. */
export function serialiseMissionContext(ctx: CanonicalMissionContext): string {
  const params = new URLSearchParams();
  params.set(MISSION_CONTEXT_PARAMS.account, ctx.ventureOsId);
  params.set(MISSION_CONTEXT_PARAMS.mission, ctx.missionId);
  params.set(MISSION_CONTEXT_PARAMS.from, ctx.source);
  return params.toString();
}

/** Build the full Mission Control href for a seller handoff (safe ids only). */
export function buildMissionControlHref(
  selectedPortfolioAccountId: string | null | undefined,
  route = "/mission-control",
): string {
  const ctx = buildMissionContextForSeller(selectedPortfolioAccountId);
  return `${route}?${serialiseMissionContext(ctx)}`;
}

// ---------------------------------------------------------------------------
// Mission Control input validation (parse + allowlist)
// ---------------------------------------------------------------------------

/** The result of validating an incoming Mission Control context. `valid` is
 * true ONLY when both ids resolve to the SAME canonical account on the
 * allowlist; otherwise the caller must fall back to the default demo and never
 * switch accounts. */
export interface MissionContextValidation {
  valid: boolean;
  /** The resolved canonical account when valid; `null` otherwise. */
  account: CanonicalDemoAccount | null;
  /** The safe context echoed back (source preserved) when valid; `null` else. */
  context: CanonicalMissionContext | null;
  /** A deterministic, presentation-safe reason when invalid. */
  reason: string | null;
}

/** Validate raw query values arriving at Mission Control. Rejects unknown ids,
 * and rejects a request whose account and mission ids belong to DIFFERENT
 * canonical accounts (mismatched pairing) — never silently switching accounts. */
export function validateIncomingMissionContext(raw: {
  account?: string | null;
  mission?: string | null;
  from?: string | null;
}): MissionContextValidation {
  const hasAny = Boolean(raw.account || raw.mission);
  if (!hasAny) {
    return { valid: false, account: null, context: null, reason: "no-context" };
  }
  const byAccount = resolveCanonicalByVentureOsId(raw.account);
  if (!byAccount) {
    return {
      valid: false,
      account: null,
      context: null,
      reason: "unrecognised-account",
    };
  }
  // If a mission id was supplied it must belong to the SAME canonical account.
  if (
    raw.mission &&
    raw.mission.trim().toUpperCase() !== byAccount.missionId.toUpperCase()
  ) {
    return {
      valid: false,
      account: null,
      context: null,
      reason: "mission-account-mismatch",
    };
  }
  const source = normaliseSource(raw.from);
  return {
    valid: true,
    account: byAccount,
    reason: null,
    context: {
      ventureOsId: byAccount.ventureOsId,
      missionId: byAccount.missionId,
      canonicalName: byAccount.canonicalName,
      source,
      matchedSelectedAccount: source === "todays-mission",
    },
  };
}

// ---------------------------------------------------------------------------
// Today's Mission canonical entry — truthful fallback when the legacy root API
// is unavailable (Release 2.3, narrow P0 continuity correction)
// ---------------------------------------------------------------------------
//
// The legacy Morning Brief / Today's Mission experience is driven by a separate
// decision-engine backend (port 8000) that is NOT part of the hosted Vercel
// deployment. In hosted environments that backend is unreachable, so the seller
// surface would otherwise show a raw "cannot reach backend" error and a "no
// mission selected" empty state right next to the "Open governed mission" CTA —
// making the whole product look broken even though the governed /mission-control
// route is healthy.
//
// This model provides a truthful, deterministic Curefoods entry state so the
// canonical journey visibly begins with the same account and mission it hands
// off to. It re-derives NO recommendation, ranking or governance — it is fixed
// presentation copy bound to the canonical Curefoods identity, and is explicitly
// labelled as a deterministic governed demo mission (never claimed as live CRM
// data).

/** The presentation model for the canonical Today's Mission entry card. */
export interface CanonicalMissionEntryModel {
  /** Section eyebrow, e.g. "Today's priority". */
  readonly priorityLabel: string;
  /** Canonical account name — the SAME account the CTA hands off. */
  readonly accountName: string;
  /** The governed mission title. */
  readonly missionTitle: string;
  /** Why this mission is surfaced now (evidence categories, no business claim). */
  readonly whyNow: string;
  /** Lifecycle status — governed mission is prepared and awaiting review. */
  readonly status: string;
  /** Explicit truth label so no viewer mistakes this for live CRM data. */
  readonly truthLabel: string;
  /** The handoff CTA label. */
  readonly ctaLabel: string;
}

/** The single canonical Curefoods entry, bound to {@link CUREFOODS_CANONICAL}.
 * Frozen so no surface can mutate the canonical presentation. */
export const CUREFOODS_MISSION_ENTRY: CanonicalMissionEntryModel = Object.freeze({
  priorityLabel: "Today's priority",
  accountName: CUREFOODS_CANONICAL.canonicalName,
  missionTitle: "Renewal protection mission",
  whyNow:
    "Renewal risk has been identified from verified account-health, renewal-timeline and usage-trend evidence.",
  status: "Governed mission ready for review",
  truthLabel: "Deterministic governed demo mission",
  ctaLabel: "Open governed mission",
});

/** The minimal live selected recommendation shape needed to decide usability.
 * Mirrors the real `Recommendation` contract (a superset) so the predicate can be
 * unit-tested without importing the full type. */
export interface SelectedMissionRecommendation {
  readonly account_id?: string | null;
  readonly recommendation_id?: string | null;
  readonly account_name?: string | null;
}

/** Inputs describing the ACTUAL live selected mission/recommendation state. */
export interface UsableSelectedMissionInput {
  /** The live selected recommendation, when one has resolved. */
  readonly selectedRecommendation?: SelectedMissionRecommendation | null;
  /** Whether the selected account resolves to a known account record. Optional —
   * only blocks usability when explicitly `false` (so a missing lookup never
   * wrongly forces the fallback over a real selected mission). */
  readonly selectedAccountResolved?: boolean;
  /** Whether the legacy decision engine that produced the selected mission is a
   * PROVEN real, non-mock, non-synthetic governed engine. Defaults to `false`.
   *
   * Per the canonical hosted Today's Mission policy (Option B), a backend-selected
   * mission is only allowed to REPLACE the canonical Curefoods governed entry when
   * it is proven real: a non-mock provider AND a non-synthetic (live/production)
   * dataset. In the current hosted demo the decision engine always reports mock /
   * synthetic data, so this is `false` and Curefoods stays authoritative whether
   * the backend is cold, unavailable, warm, mock or synthetic. Only a future,
   * proven real governed backend flips this to `true` and is allowed to defer. */
  readonly decisionEngineIsRealGoverned?: boolean;
}

/** Deterministic: is there a real, renderable, safely-continuable selected
 * mission that is allowed to REPLACE the canonical Curefoods governed entry on the
 * hosted Today's Mission journey?
 *
 * This evaluates two things together:
 *  1. The DECISION-ENGINE REALNESS gate — the mission must come from a proven
 *     real, non-mock, non-synthetic governed engine (`decisionEngineIsRealGoverned`).
 *     A mock/synthetic backend mission (e.g. the legacy "Tessera DocOnline" demo
 *     fixture) is NOT usable for the canonical journey, so Curefoods stays.
 *  2. The SELECTED RECOMMENDATION CONTRACT — a resolved recommendation with the
 *     account + mission identifiers needed to render and to continue safely.
 *
 * It deliberately does NOT look at API reachability, `bootError`, account count or
 * agent count — those are diagnostics, not the authoritative signal. */
export function hasUsableSelectedMission(input: UsableSelectedMissionInput): boolean {
  // Realness gate first (Option B): a mock/synthetic engine never yields a
  // canonical-journey-usable mission — Curefoods remains authoritative.
  if (input?.decisionEngineIsRealGoverned !== true) return false;
  const rec = input?.selectedRecommendation;
  if (!rec) return false; // a selected recommendation must exist
  const accountId = typeof rec.account_id === "string" ? rec.account_id.trim() : "";
  const recommendationId =
    typeof rec.recommendation_id === "string" ? rec.recommendation_id.trim() : "";
  const accountName = typeof rec.account_name === "string" ? rec.account_name.trim() : "";
  if (!accountId || !recommendationId) return false; // required identifiers present
  if (!accountName) return false; // renderable (has a display name)
  if (input.selectedAccountResolved === false) return false; // selected account exists
  return true;
}

/** Decide whether the Today's Mission surface should show the canonical Curefoods
 * governed entry instead of a raw backend-error / mock / empty state.
 *
 * The decision is based on PRODUCT READINESS, not API reachability: the fallback
 * activates whenever the seller is on Today's Mission with NO canonical-journey-
 * usable selected mission and the canonical Curefoods mission is available. Because
 * `hasUsableSelectedMission` requires a PROVEN real, non-mock, non-synthetic
 * governed engine, the canonical Curefoods entry stays authoritative whenever the
 * root API is unreachable, reachable-but-mock, reachable-but-synthetic,
 * reachable-but-empty, reachable-but-returns-no-selected-recommendation, OR
 * reachable-but-returns-a-mock/synthetic legacy mission (e.g. "Tessera DocOnline").
 *
 * Only a proven real governed backend mission (non-mock, non-synthetic, compatible
 * identifiers) is allowed to defer and preserve the normal root mission experience.
 * The caller keeps general backend diagnostics visible on other views. */
export function shouldShowCanonicalMissionFallback(args: {
  readonly isTodaysMissionView: boolean;
  readonly hasUsableSelectedMission: boolean;
  readonly canonicalMissionAvailable?: boolean;
}): boolean {
  const canonicalAvailable = args.canonicalMissionAvailable ?? true;
  return (
    args.isTodaysMissionView === true &&
    args.hasUsableSelectedMission === false &&
    canonicalAvailable === true
  );
}

/** Descriptors of the legacy decision engine that produced the current output. */
export interface DecisionEngineDescriptor {
  /** `model_provider` from the recommendation result or meta (e.g. "mock", "nim"). */
  readonly modelProvider?: string | null;
  /** Dataset mode from meta (e.g. "synthetic", "live", "production"). */
  readonly dataSourceMode?: string | null;
  /** Human dataset/source label from meta (e.g. "HubSpot test CRM"). */
  readonly dataSourceLabel?: string | null;
}

/** Provider tokens that denote a mock / non-real decision engine. */
const MOCK_PROVIDER_TOKENS = ["mock", "synthetic", "demo", "deterministic", "fixture", "sample"];
/** Dataset tokens that denote synthetic / non-live data. */
const SYNTHETIC_DATASET_TOKENS = ["synthetic", "mock", "test", "demo", "sample", "fixture"];

/** Deterministic: is the legacy decision engine a PROVEN real, non-mock,
 * non-synthetic governed engine? Conservative by design — returns `true` ONLY when
 * BOTH the provider is a real (non-mock) provider AND the dataset is an explicitly
 * live/production (non-synthetic) source. Missing/unknown descriptors resolve to
 * `false`, so the canonical Curefoods entry stays authoritative until a real
 * governed backend is proven. */
export function isRealGovernedDecisionEngine(engine: DecisionEngineDescriptor | null | undefined): boolean {
  if (!engine) return false;
  const provider = typeof engine.modelProvider === "string" ? engine.modelProvider.trim().toLowerCase() : "";
  if (!provider) return false;
  const providerIsMock = MOCK_PROVIDER_TOKENS.some((t) => provider.includes(t));
  if (providerIsMock) return false;
  const mode = typeof engine.dataSourceMode === "string" ? engine.dataSourceMode.trim().toLowerCase() : "";
  const label = typeof engine.dataSourceLabel === "string" ? engine.dataSourceLabel.trim().toLowerCase() : "";
  // Dataset must be explicitly live/production to count as real.
  const datasetIsLive = mode === "live" || mode === "production" || mode === "real";
  if (!datasetIsLive) return false;
  const datasetLooksSynthetic = SYNTHETIC_DATASET_TOKENS.some((t) => mode.includes(t) || label.includes(t));
  if (datasetLooksSynthetic) return false;
  return true;
}

/** A short, business-English continuity cue for a validated context. Returns
 * `null` when there is nothing to say (direct load / invalid context). */
export function continuityCue(
  validation: MissionContextValidation,
): { title: string; detail: string } | null {
  if (!validation.valid || !validation.context) return null;
  if (validation.context.source !== "todays-mission") return null;
  return {
    title: `Continuing from Today's Mission — ${validation.context.canonicalName} renewal`,
    detail:
      "This is the same account and governed mission you opened from Today's Mission. Nothing was re-selected or changed.",
  };
}
