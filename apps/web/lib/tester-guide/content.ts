// VentureOS Signal-to-Action — Illustrated Tester Guide (canonical content model)
// ================================================================================
// The SINGLE source of truth for the self-guided tester experience. It is PURE
// (no React, no data fetching, no side effects) so the same typed model drives:
//   1. the native `/tester-guide` route,
//   2. the downloadable illustrated PDF (generated from this model), and
//   3. the internal editable source + machine-readable asset manifest.
// A deterministic eval (lib/tester-guide/eval) validates structure, provenance,
// canonical identity, and truthful labels so the three formats never drift.
//
// This module READS governed truth (it reuses the walkthrough's canonical
// constants). It owns no mission logic, policy, ranking, approval, or execution.

import { WALKTHROUGH_CANONICAL } from "../walkthrough/stages";

// ---------------------------------------------------------------------------
// Canonical facts (reused from the governed walkthrough model — no drift).
// ---------------------------------------------------------------------------
export const GUIDE_CANONICAL = Object.freeze({
  account: WALKTHROUGH_CANONICAL.account, // Curefoods
  accountId: WALKTHROUGH_CANONICAL.accountId, // VOS-CUREFOODS
  missionId: WALKTHROUGH_CANONICAL.missionId, // M-RENEWAL-1
  recommendationId: WALKTHROUGH_CANONICAL.recommendationId, // REC-M-RENEWAL-1
  template: WALKTHROUGH_CANONICAL.template, // renewal-risk-parallel-v1
  auditRef: WALKTHROUGH_CANONICAL.auditRef, // audit://M-RENEWAL-1/REC-M-RENEWAL-1
  systemOutcome: WALKTHROUGH_CANONICAL.systemOutcome, // Governed work prepared successfully.
  businessOutcome: WALKTHROUGH_CANONICAL.businessOutcome, // Awaiting external response.
  nvidiaProvider: WALKTHROUGH_CANONICAL.nvidiaProvider, // nim
  nvidiaModel: WALKTHROUGH_CANONICAL.nvidiaModel, // nvidia/nvidia-nemotron-nano-9b-v2
  receipts: Object.freeze({
    email: "receipt://M-RENEWAL-1/email",
    crmTask: "receipt://M-RENEWAL-1/crm_task",
    riskUpdate: "receipt://M-RENEWAL-1/risk_update",
  }),
  missionControlCta:
    "/mission-control?account=VOS-CUREFOODS&mission=M-RENEWAL-1&from=todays-mission",
});

// ---------------------------------------------------------------------------
// Guide metadata.
// ---------------------------------------------------------------------------
export const GUIDE_META = Object.freeze({
  product: "VentureOS",
  flagship: "Signal-to-Action Agent",
  title: "Signal-to-Action Tester Guide",
  statusLabel: "Tester Guide",
  tagline: "One signal, one mission, one governed outcome.",
  purpose:
    "A self-guided path that lets a new visitor understand and validate the complete VentureOS Curefoods story — from signal to governed outcome — without a live walkthrough.",
  estimatedMinutes: 20,
  canonicalUrl: "https://ventureos-signal-to-action-agent.vercel.app",
  suggestedBrowser: "Latest Chrome, Edge, or Safari",
  suggestedViewport: "1440px desktop; responsive to tablet and mobile",
  freshSessionAdvice:
    "Use a fresh browser session (or a private window) so no earlier demo state carries over.",
  // Provenance of every embedded screenshot in this guide.
  sourceSha: "7601844",
  sourceDeploymentId: "dpl_GtYXxF8yDNuDr2GzDVhtxJKdPUr4",
  pdfPath: "/guides/VentureOS-Signal-to-Action-Tester-Guide.pdf",
  feedbackTemplatePath: "/guides/VentureOS-Tester-Feedback-Template.md",
});

// ---------------------------------------------------------------------------
// Screenshot model — every public asset carries approved provenance.
// ---------------------------------------------------------------------------
export interface GuideScreenshot {
  readonly id: string;
  /** App-relative public asset (never an internal path or external URL). */
  readonly src: string;
  readonly alt: string;
  readonly caption: string;
  /** Intrinsic dimensions — reserve a responsive aspect box (no layout shift). */
  readonly width: number;
  readonly height: number;
  readonly sourceFile: string;
  readonly route: string;
  readonly deploymentId: string;
  readonly sha: string;
  readonly capturedAt: string;
  readonly missionState: string | null;
  readonly nvidiaState: string | null;
  readonly guardrailScenario: string | null;
  readonly cropped: boolean;
  readonly redacted: boolean;
  readonly checksumSha256Short: string;
  readonly provenance: "production-canonical";
}

const CAPTURED_AT = "2026-07-19T23:09:00+05:30";
const DEP = GUIDE_META.sourceDeploymentId;
const SHA = GUIDE_META.sourceSha;

const shot = (
  s: Omit<
    GuideScreenshot,
    "deploymentId" | "sha" | "capturedAt" | "provenance" | "cropped" | "redacted"
  > &
    Partial<Pick<GuideScreenshot, "cropped" | "redacted">>,
): GuideScreenshot => ({
  deploymentId: DEP,
  sha: SHA,
  capturedAt: CAPTURED_AT,
  provenance: "production-canonical",
  cropped: false,
  redacted: false,
  ...s,
});

export const GUIDE_SCREENSHOTS: readonly GuideScreenshot[] = [
  shot({
    id: "landing",
    src: "/guides/screenshots/01-landing.png",
    alt: "VentureOS landing page hero on the canonical production URL, showing the Signal-to-Action Agent product identity and human-approval assurances.",
    caption: "Production landing — the product hero and governance assurances.",
    width: 1440,
    height: 2749,
    sourceFile: "01_landing.png",
    route: "/",
    missionState: null,
    nvidiaState: null,
    guardrailScenario: null,
    checksumSha256Short: "906E7724361311B6",
  }),
  shot({
    id: "walkthrough-overview",
    src: "/guides/screenshots/02-walkthrough-overview.png",
    alt: "Full-page Product Walkthrough showing all governed stages of the canonical Curefoods journey in order.",
    caption: "Product Walkthrough — the full narrative, all stages in order.",
    width: 1440,
    height: 10542,
    sourceFile: "02_walkthrough_overview.png",
    route: "/walkthrough",
    missionState: null,
    nvidiaState: null,
    guardrailScenario: null,
    checksumSha256Short: "BCA2A883958B2C05",
  }),
  shot({
    id: "walkthrough-lightbox",
    src: "/guides/screenshots/03-walkthrough-lightbox.png",
    alt: "Walkthrough visual-evidence lightbox open, showing an enlarged product screenshot in an accessible dialog over a dimmed backdrop.",
    caption: "Walkthrough lightbox — click any evidence image to enlarge; Escape closes it.",
    width: 1440,
    height: 900,
    sourceFile: "03_walkthrough_lightbox.png",
    route: "/walkthrough",
    missionState: null,
    nvidiaState: null,
    guardrailScenario: null,
    checksumSha256Short: "C6D1F45C366D298A",
  }),
  shot({
    id: "todays-mission",
    src: "/guides/screenshots/04-todays-mission.png",
    alt: "Today's Mission showing the Curefoods renewal-protection mission labelled a deterministic governed demo, with an Open governed mission action.",
    caption: "Today's Mission — Curefoods renewal protection, the canonical hosted entry.",
    width: 1440,
    height: 900,
    sourceFile: "04_todays_mission.png",
    route: "/?view=mission",
    missionState: "ready_for_review",
    nvidiaState: null,
    guardrailScenario: null,
    checksumSha256Short: "D626CA435251FFB9",
  }),
  shot({
    id: "mission-control-awaiting",
    src: "/guides/screenshots/05-mission-control-awaiting.png",
    alt: "Mission Control awaiting approval — evidence and provenance, verification three of three complete, and proposed (not yet sent) actions.",
    caption: "Mission Control — awaiting approval; verification 3/3 precedes approval; actions proposed, not sent.",
    width: 1440,
    height: 4326,
    sourceFile: "05_mission_control_awaiting.png",
    route: "/mission-control",
    missionState: "awaiting_approval",
    nvidiaState: "live grounded (nim, nemotron-nano-9b-v2, fallbackUsed=false, ~11.2s)",
    guardrailScenario: null,
    checksumSha256Short: "FDABD946593A9F45",
  }),
  shot({
    id: "approval-accepted",
    src: "/guides/screenshots/06-approval-accepted.png",
    alt: "Approval accepted — the mission moves to completed, with three simulated actions, receipts, the governed outcome, persona projections, and a valid audit chain.",
    caption: "Approval accepted — mission completed; simulation becomes eligible only after human approval.",
    width: 1440,
    height: 4689,
    sourceFile: "06_approval_accepted.png",
    route: "/mission-control",
    missionState: "completed",
    nvidiaState: "live grounded",
    guardrailScenario: null,
    checksumSha256Short: "95F874D3A411400B",
  }),
  shot({
    id: "simulated-actions",
    src: "/guides/screenshots/07-simulated-actions-receipts.png",
    alt: "Simulated execution section showing three controlled actions — customer email, CRM task, risk update — each labelled simulated with a sandbox receipt.",
    caption: "Simulated execution — three controlled actions with sandbox receipts; nothing real is sent, created, or written.",
    width: 1440,
    height: 900,
    sourceFile: "07_simulated_actions_receipts.png",
    route: "/mission-control",
    missionState: "completed",
    nvidiaState: "live grounded",
    guardrailScenario: null,
    checksumSha256Short: "3B9279473F37DBAA",
  }),
  shot({
    id: "governed-outcome",
    src: "/guides/screenshots/08-governed-outcome.png",
    alt: "Governed outcome — system outcome reads Governed work prepared successfully while the business outcome remains Awaiting external response, with the canonical audit reference.",
    caption: "Governed outcome — system outcome and business outcome are stated separately and honestly.",
    width: 1440,
    height: 900,
    sourceFile: "08_completed_outcome.png",
    route: "/mission-control",
    missionState: "completed",
    nvidiaState: "live grounded",
    guardrailScenario: null,
    checksumSha256Short: "4BC8877BA816BF75",
  }),
  shot({
    id: "persona-projections",
    src: "/guides/screenshots/09-persona-projections.png",
    alt: "Seller, Executive (Production-Partial) and Operations (Production-Partial) projections of the same Curefoods mission, sharing one audit reference and adding no new facts.",
    caption: "Persona projections — Seller, Executive (Production-Partial) and Operations (Production-Partial) share one governed truth.",
    width: 1440,
    height: 900,
    sourceFile: "09a_projection_seller.png",
    route: "/mission-control",
    missionState: "completed",
    nvidiaState: "live grounded",
    guardrailScenario: null,
    checksumSha256Short: "7390D8E9B28A50A2",
  }),
  shot({
    id: "audit-chain",
    src: "/guides/screenshots/10-audit-chain.png",
    alt: "Complete audit chain showing nine mission-history stages marked Done and the chain reported valid.",
    caption: "Audit chain — nine mission stages Done; chain valid; replay stays idempotent.",
    width: 1440,
    height: 900,
    sourceFile: "10_audit_chain.png",
    route: "/mission-control",
    missionState: "completed",
    nvidiaState: "live grounded",
    guardrailScenario: null,
    checksumSha256Short: "21903014D859AA30",
  }),
  shot({
    id: "manager-guided",
    src: "/guides/screenshots/11-manager-guided.png",
    alt: "Manager Coaching shown as a post-mission Guided Scenario — a read-only deterministic snapshot of the same canonical Curefoods mission, with a browser-local review state.",
    caption: "Manager Coaching — a post-mission Guided Scenario; browser-local state; Mission Control is unaffected.",
    width: 1440,
    height: 1767,
    sourceFile: "11_manager_guided.png",
    route: "/manager",
    missionState: "post-mission simulated snapshot",
    nvidiaState: null,
    guardrailScenario: null,
    checksumSha256Short: "F0BA297D58CF2FEE",
  }),
  shot({
    id: "guardrails-safe",
    src: "/guides/screenshots/12-guardrails-safe-live.png",
    alt: "Guardrails Lab safe grounded request — Allowed by deterministic policy, with live NVIDIA telemetry shown as supplementary and not authoritative, and no action executed.",
    caption: "Guardrails — safe request Allowed; live NVIDIA telemetry is supplementary, not the decision.",
    width: 1440,
    height: 1759,
    sourceFile: "12_guardrails_safe_live.png",
    route: "/guardrails",
    missionState: "n/a",
    nvidiaState: "available=true, fallbackUsed=false, mode=live",
    guardrailScenario: "safe-grounded",
    checksumSha256Short: "DF2AB80A30228F45",
  }),
  shot({
    id: "guardrails-injection",
    src: "/guides/screenshots/13-guardrails-prompt-injection.png",
    alt: "Guardrails Lab prompt injection blocked by deterministic rails even though the NVIDIA jailbreak boolean is false; the raw score is labelled as not a probability; audit projection is read-only.",
    caption: "Guardrails — prompt injection Blocked by deterministic rails even when NVIDIA jailbreak=false.",
    width: 1440,
    height: 1834,
    sourceFile: "13_guardrails_prompt_injection.png",
    route: "/guardrails",
    missionState: "n/a",
    nvidiaState: "available=true, booleanResult=false, mode=live, ~195ms",
    guardrailScenario: "prompt-injection",
    checksumSha256Short: "421571644A64D40E",
  }),
  shot({
    id: "guardrails-redacted",
    src: "/guides/screenshots/14-guardrails-sensitive-redacted.png",
    alt: "Guardrails Lab sensitive-data request redacted — no secret or personal data is shown and no action is executed.",
    caption: "Guardrails — sensitive-data request Redacted; no secret or PII is shown.",
    width: 1440,
    height: 1759,
    sourceFile: "14_guardrails_sensitive_redacted.png",
    route: "/guardrails",
    missionState: "n/a",
    nvidiaState: "available=true, mode=live",
    guardrailScenario: "sensitive-data",
    checksumSha256Short: "DE44E5DE886BB611",
  }),
  shot({
    id: "guardrails-fallback",
    src: "/guides/screenshots/15-guardrails-forced-fallback.png",
    alt: "Guardrails Lab under a forced NVIDIA outage — the safe request is still Allowed by deterministic policy, classification is marked unavailable and fallback used, and the safe scenario is not bricked.",
    caption: "Guardrails — forced fallback; deterministic policy still applies and a safe scenario is not bricked.",
    width: 1440,
    height: 1737,
    sourceFile: "15_guardrails_forced_fallback.png",
    route: "/guardrails",
    missionState: "n/a",
    nvidiaState: "available=false, fallbackUsed=true, mode=forced_fallback",
    guardrailScenario: "forced-fallback",
    checksumSha256Short: "86CC5FC89461A60B",
  }),
];

const byId = (id: string): GuideScreenshot => {
  const s = GUIDE_SCREENSHOTS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown screenshot id: ${id}`);
  return s;
};

// ---------------------------------------------------------------------------
// Section / step model.
// ---------------------------------------------------------------------------
export interface GuideStep {
  readonly action: string;
  readonly expected: string;
}

export interface GuideSection {
  readonly number: number;
  readonly id: string;
  readonly title: string;
  readonly purpose: string;
  readonly route: string | null;
  readonly explain: readonly string[];
  readonly steps: readonly GuideStep[];
  readonly expectedResults: readonly string[];
  readonly failureIndicators: readonly string[];
  readonly truthNote: string | null;
  readonly technicalDetail: readonly string[];
  readonly screenshotIds: readonly string[];
}

const C = GUIDE_CANONICAL;

export const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    number: 1,
    id: "before-you-begin",
    title: "Before you begin",
    purpose: "Set expectations so you can test the product honestly and safely.",
    route: null,
    explain: [
      "VentureOS is an Enterprise AI Workforce Platform; Signal-to-Action Agent is the current flagship experience.",
      "The hosted scenario is a deterministic governed demo centred on Curefoods.",
      "The journey uses one canonical governed mission — no real email is sent, no real CRM task is created, and no real risk record is written.",
      "Manager Coaching state is presentation-local; Executive and Operations are read-only Production-Partial projections.",
      "Guardrails Lab evaluates curated scenarios and does not intercept real Production traffic.",
    ],
    steps: [
      {
        action: `Open the canonical URL in a fresh browser session: ${GUIDE_META.canonicalUrl}`,
        expected: "The VentureOS landing experience loads with no error banner and no login wall.",
      },
    ],
    expectedResults: [
      `Canonical URL: ${GUIDE_META.canonicalUrl}`,
      `Suggested browser: ${GUIDE_META.suggestedBrowser}`,
      `Suggested viewport: ${GUIDE_META.suggestedViewport}`,
      `Estimated duration: about ${GUIDE_META.estimatedMinutes} minutes`,
    ],
    failureIndicators: ["A login wall", "A backend error banner", "A blank page"],
    truthNote:
      "This is a deterministic governed demo. Nothing you do here sends real email, changes a real CRM, or writes a real risk record.",
    technicalDetail: [
      GUIDE_META.freshSessionAdvice,
      "To restart the journey, open the canonical URL again in a new private window.",
    ],
    screenshotIds: [],
  },
  {
    number: 2,
    id: "product-in-two-minutes",
    title: "Understand the product in two minutes",
    purpose: "Grasp the VentureOS story before touching the governed flow.",
    route: "/",
    explain: [
      "Signals are fragmented across CRMs, product usage, and support.",
      "VentureOS turns signals into governed decisions — evidence comes before confidence.",
      "One recommendation is surfaced; approval comes before action; execution stays controlled; all activity is auditable.",
    ],
    steps: [
      { action: "Open the canonical URL and confirm the hero renders.", expected: "The product hero renders with no blank page and no backend error." },
      { action: "Confirm the page states that human approval is required.", expected: "A human-approval assurance is visible." },
      { action: "Confirm the page indicates the active data source truthfully.", expected: "The active CRM / data source is described honestly, not overstated." },
      { action: "Click Explore VentureOS (or See how it works).", expected: "You are taken into the product story or walkthrough with no broken CTA." },
    ],
    expectedResults: [
      "No blank page, backend error banner, or local backend address message.",
      "No pre-release branch label, secret, or internal URL.",
      "No broken CTA.",
    ],
    failureIndicators: ["Blank hero", "Backend error banner", "local backend address text", "pre-release branch label", "Broken CTA"],
    truthNote: "The landing experience is Production.",
    technicalDetail: [
      "The landing signals/recommendations layer is fetched from a public by-design signals API; it carries no secret, executes no action, and bypasses no approval.",
    ],
    screenshotIds: ["landing"],
  },
  {
    number: 3,
    id: "product-walkthrough",
    title: "Review the full product walkthrough",
    purpose: "See the same canonical Curefoods journey told end to end, with product evidence.",
    route: "/walkthrough",
    explain: [
      "The walkthrough is the narrative guide to the same canonical Curefoods journey.",
      "Embedded screenshots are product evidence, not decorative mockups.",
      "Clicking an image expands it; Escape or the close control dismisses it.",
    ],
    steps: [
      { action: "Open /walkthrough and scroll through all stages.", expected: "Every stage renders with its embedded image loaded." },
      { action: "Open at least two screenshots, then close the lightbox with Escape.", expected: "The lightbox opens and closes cleanly with no layout shift." },
      { action: "Use one CTA to enter the product journey.", expected: "The CTA resolves into the real product experience." },
    ],
    expectedResults: [
      "All stages render and all embedded images load.",
      "Captions match the stage; status labels remain truthful.",
      "The lightbox opens and closes; there is no broken image.",
    ],
    failureIndicators: ["Missing stage", "Broken image", "Caption/stage mismatch", "Lightbox will not close"],
    truthNote: "Status labels in the walkthrough (Production, Production-Partial, Guided Demo, Guardrails Lab, Roadmap) are truthful and must remain visible.",
    technicalDetail: [],
    screenshotIds: ["walkthrough-overview", "walkthrough-lightbox"],
  },
  {
    number: 4,
    id: "todays-mission",
    title: "Begin with Today's Mission",
    purpose: "Enter the canonical governed mission from the hosted priority.",
    route: "/?view=mission",
    explain: [
      `Account: ${C.account} · VentureOS account ID: ${C.accountId}`,
      `Mission: ${C.missionId} · Recommendation: ${C.recommendationId}`,
      `Template: ${C.template}`,
      `Audit reference: ${C.auditRef}`,
    ],
    steps: [
      { action: "Open Today's Mission and confirm Curefoods is the authoritative hosted demo entry.", expected: "Curefoods is presented as the canonical mission — not substituted by a provider mock." },
      { action: "Confirm the title Renewal protection mission and the truth label Deterministic governed demo mission.", expected: "Both the title and the deterministic governed demo label are visible." },
      { action: "Click Open governed mission.", expected: `You are routed to ${C.missionControlCta}` },
    ],
    expectedResults: [
      "No Tessera substitution and no empty mission.",
      "No provider-mock replacement of the canonical journey.",
      "Curefoods remains authoritative whether the public root API is warm, cold, mock, or synthetic.",
    ],
    failureIndicators: ["Tessera or other account substituted", "Empty mission", "Provider-mock replacement", "local backend address error"],
    truthNote: "Today's Mission canonical hosted journey is Production.",
    technicalDetail: [`Expected CTA target: ${C.missionControlCta}`],
    screenshotIds: ["todays-mission"],
  },
  {
    number: 5,
    id: "mission-continuity",
    title: "Confirm mission continuity",
    purpose: "Verify Mission Control is the same mission, not a second re-selected one.",
    route: C.missionControlCta,
    explain: [
      "Identity resolution is deterministic.",
      "Continuity is preserved across account, mission, recommendation, template, and audit reference.",
    ],
    steps: [
      { action: `Confirm ${C.account} and mission ${C.missionId}.`, expected: "The same account and mission carry over from Today's Mission." },
      { action: "Confirm the continuity cue and that nothing was re-selected.", expected: "A continuity cue indicates the same mission; there is no re-selection step." },
      { action: "Confirm the shared application navigation remains available.", expected: "Shell navigation is present and functional." },
    ],
    expectedResults: [
      "Today's Mission and Mission Control describe the same mission.",
      "No identity mismatch, no duplicate shell, and no broken navigation.",
    ],
    failureIndicators: ["Identity mismatch", "Duplicate shell", "Broken navigation", "A second re-selected mission"],
    truthNote: "The Mission Control governed flow is Production.",
    technicalDetail: [],
    screenshotIds: ["mission-control-awaiting"],
  },
  {
    number: 6,
    id: "signal-and-evidence",
    title: "Review the signal and evidence",
    purpose: "Confirm evidence precedes the recommendation and confidence wording is honest.",
    route: C.missionControlCta,
    explain: [
      "Mission Control sections include: What happened, Recommended renewal mission, Why this account is at risk, Confidence & evidence & provenance, Proposed actions, and Verification.",
      "Account-match confidence is identity confidence — not renewal probability.",
    ],
    steps: [
      { action: "Review the signal narrative.", expected: "The signal is described before any recommendation is asserted." },
      { action: "Confirm three verified evidence sources: account health, renewal timeline, usage trend.", expected: "All three evidence sources are present and verified." },
      { action: "Confirm governance checks are 3 of 3, then expand technical evidence.", expected: "Governance shows 3/3; technical evidence expands with provenance visible." },
    ],
    expectedResults: [
      "Evidence precedes the recommendation and provenance is visible.",
      "Unsupported claims are absent and confidence wording is honest.",
      "The recommendation is not portrayed as autonomous execution.",
    ],
    failureIndicators: ["Recommendation shown before evidence", "Confidence framed as renewal probability", "Unsupported claim"],
    truthNote: "Account-match confidence describes identity confidence, not the probability that the renewal will be won.",
    technicalDetail: ["Evidence sources: account health, renewal timeline, usage trend.", "Governance checks: 3 of 3."],
    screenshotIds: ["mission-control-awaiting"],
  },
  {
    number: 7,
    id: "nvidia-role",
    title: "Understand NVIDIA's role",
    purpose: "See exactly what NVIDIA Nemotron does — and what it never does.",
    route: C.missionControlCta,
    explain: [
      "NVIDIA Nemotron generates or supports the explanation layer and must remain grounded in supplied evidence.",
      "It does not select the mission, does not approve the mission, does not execute an action, and does not replace deterministic policy.",
      "It may fall back honestly when unavailable; intermittent deterministic fallback is an accepted resilience condition.",
    ],
    steps: [
      { action: "Inspect the NVIDIA explanation evidence.", expected: `Provider ${C.nvidiaProvider} and model ${C.nvidiaModel} are shown when live.` },
      { action: "Confirm validation grounded and fallbackUsed false on a successful live run.", expected: "Validation reads grounded; fallbackUsed is false; grounded evidence references are shown." },
      { action: "If NVIDIA falls back, confirm it is labelled truthfully.", expected: "Fallback is labelled honestly and the product remains usable." },
    ],
    expectedResults: [
      "Live NVIDIA evidence is visible on at least one run.",
      "The product remains usable if NVIDIA falls back.",
      "No browser-to-NVIDIA request and no secret exposure.",
    ],
    failureIndicators: ["Browser-to-NVIDIA request", "Secret exposure", "Fallback bypasses policy or approval"],
    truthNote: "A fallback must never bypass policy or approval. NVIDIA integration is grounded narrative only.",
    technicalDetail: [
      `Provider: ${C.nvidiaProvider}`,
      `Model: ${C.nvidiaModel}`,
      "The governed EXECUTE and guardrails CLASSIFY calls are server-side; the browser never calls NVIDIA directly.",
    ],
    screenshotIds: ["mission-control-awaiting"],
  },
  {
    number: 8,
    id: "approval-mandatory",
    title: "Verify approval is mandatory",
    purpose: "Prove nothing runs before an explicit human approval.",
    route: C.missionControlCta,
    explain: [
      "The system may recommend and prepare actions, but only a human may approve.",
      "Approval is bound to the specific mission and proposed action; nothing runs before approval.",
    ],
    steps: [
      { action: "Locate the Approval section and inspect what will be simulated and the technical approval binding.", expected: "Status is Awaiting approval; simulated execution has not run; the outcome says no action has run." },
      { action: "Confirm approve, request revision, and reject controls are available.", expected: "All three governed controls are present." },
      { action: "Click Approve and complete the second confirmation step.", expected: "Approval accepted; approved by Account owner (or equivalent) is shown; mission version stays bound; simulation becomes eligible." },
    ],
    expectedResults: [
      "Before approval: Awaiting approval, no simulated execution, and no action has run.",
      "After approval: approval accepted, actor displayed, mission version bound, simulation eligible.",
    ],
    failureIndicators: ["Any action runs before approval", "Approval not bound to the mission", "No second confirmation"],
    truthNote: "This is governed approval before simulation — not autonomous execution.",
    technicalDetail: ["Approval is bound to the specific mission version and proposed action set."],
    screenshotIds: ["mission-control-awaiting", "approval-accepted"],
  },
  {
    number: 9,
    id: "simulated-execution",
    title: "Validate simulated execution",
    purpose: "Confirm three controlled actions run only in a sandbox, with receipts.",
    route: C.missionControlCta,
    explain: [
      "Three controlled actions are produced: a customer email (drafted, not sent), a CRM task (proposed, not created), and a risk update (proposed, not written).",
      "Each action is labelled Simulated and completes in a sandbox with a receipt.",
    ],
    steps: [
      { action: "Verify all three actions appear and each is labelled Simulated.", expected: "Three actions appear, all labelled Simulated." },
      { action: "Verify the before and after state and each receipt.", expected: `Receipts are shown: ${C.receipts.email}, ${C.receipts.crmTask}, ${C.receipts.riskUpdate}` },
      { action: "Verify each action reads Completed in sandbox.", expected: "Each action reads Completed in sandbox; nothing real occurred." },
    ],
    expectedResults: [
      "No real email is sent, no CRM record is created, and no risk record is written.",
      "Three simulation receipts are visible.",
      "No mission action occurs before approval.",
    ],
    failureIndicators: ["A real email/CRM/risk action", "Missing receipt", "Action ran before approval"],
    truthNote: "Email drafting, CRM task proposal, and risk-update proposal are Simulated.",
    technicalDetail: [`Receipt IDs: ${C.receipts.email} · ${C.receipts.crmTask} · ${C.receipts.riskUpdate}`],
    screenshotIds: ["simulated-actions", "approval-accepted"],
  },
  {
    number: 10,
    id: "governed-outcome",
    title: "Validate the governed outcome",
    purpose: "Understand why the system outcome and the business outcome differ.",
    route: C.missionControlCta,
    explain: [
      `System outcome: "${C.systemOutcome}"`,
      `Business outcome: "${C.businessOutcome}"`,
      "The product completed internal preparation; the customer has not responded, so no renewal is won and no revenue impact is claimed.",
    ],
    steps: [
      { action: "Confirm mission state Complete and all three simulated action statements.", expected: "Mission state is Complete with three simulated action statements." },
      { action: `Confirm mission ID ${C.missionId} and audit reference ${C.auditRef}.`, expected: "Mission ID and canonical audit reference are shown." },
      { action: "Confirm the business outcome remains awaiting external response.", expected: `Business outcome reads "${C.businessOutcome}".` },
    ],
    expectedResults: [
      "No unsupported success claim.",
      "No customer renewed, risk reduced to zero, or meeting booked statement.",
      "No fabricated customer behaviour.",
    ],
    failureIndicators: ["Customer renewed claim", "Risk reduced to zero claim", "Meeting booked claim", "Fabricated customer behaviour"],
    truthNote: `System outcome is exactly "${C.systemOutcome}"; business outcome is exactly "${C.businessOutcome}".`,
    technicalDetail: [],
    screenshotIds: ["governed-outcome"],
  },
  {
    number: 11,
    id: "persona-projections",
    title: "Review shared persona projections",
    purpose: "See the same governed mission through Seller, Executive, and Operations.",
    route: C.missionControlCta,
    explain: [
      "Seller sees the full governed mission.",
      "Executive — Production-Partial — receives a read-only summary.",
      "Operations — Production-Partial — sees audit status, simulated action count, and template.",
    ],
    steps: [
      { action: `Verify all projections refer to ${C.account} and ${C.missionId}.`, expected: "Every projection references the same account and mission." },
      { action: "Verify Executive is a read-only summary and Operations shows audit status, action count, and template.", expected: "Executive is read-only; Operations shows audit/action/template details." },
      { action: "Verify no projection adds a new fact or executes an action.", expected: "No projection introduces a new fact or runs an action." },
    ],
    expectedResults: [
      "Shared state, shared audit reference, and shared governed outcome.",
      "No persona-specific contradiction.",
      "Production-Partial labels remain visible.",
    ],
    failureIndicators: ["Persona contradiction", "A projection adds a new fact", "A projection executes an action", "Missing Production-Partial label"],
    truthNote: "Executive and Operations projections are Production-Partial.",
    technicalDetail: [],
    screenshotIds: ["persona-projections"],
  },
  {
    number: 12,
    id: "manager-coaching",
    title: "Review Manager Coaching",
    purpose: "Understand Manager Coaching as a post-mission Guided Scenario.",
    route: "/manager",
    explain: [
      "Manager Coaching is a post-mission Guided Scenario — a deterministic post-completion snapshot of the same canonical Curefoods mission.",
      "It is not reading the current browser Mission Control session and is not a CRM-backed manager identity.",
      "Its review state is browser-local; it does not change Mission Control, calculate coaching effectiveness, or claim revenue uplift or risk reduction.",
    ],
    steps: [
      { action: "Confirm the post-mission Guided Scenario label, the disclaimer, and canonical mission identity.", expected: "The Guided Scenario label, disclaimer, and canonical identity are all visible." },
      { action: "Click Review coaching guidance, then Assign simulated coaching intervention.", expected: "State moves NOT REVIEWED → REVIEWED → SIMULATED INTERVENTION ASSIGNED." },
      { action: "Refresh the page and confirm browser-local state persistence.", expected: "The reviewed/assigned state persists locally in the browser." },
    ],
    expectedResults: [
      "No notification sent, no CRM record changed, and no mission state changed.",
      "No audit reference changed and Mission Control remains unaffected.",
    ],
    failureIndicators: ["Notification sent", "CRM changed", "Mission state changed", "Audit reference changed", "Manager disclaimer missing"],
    truthNote: "Manager Coaching is a Guided Scenario (Post-mission Guided Scenario). Manager interaction state is browser-local.",
    technicalDetail: [],
    screenshotIds: ["manager-guided"],
  },
  {
    number: 13,
    id: "guardrails-lab",
    title: "Review Guardrails Lab",
    purpose: "See how deterministic policy stays authoritative while NVIDIA adds telemetry.",
    route: "/guardrails",
    explain: [
      "VentureOS deterministic policy is authoritative; NVIDIA NeMoGuard JailbreakDetect is supplementary telemetry.",
      "The NVIDIA raw score is not a calibrated probability; NVIDIA does not select, approve, execute, or override the decision.",
      "Guardrails Lab uses curated auditable scenarios; it does not intercept real Production requests, appends no ledger event, and references the canonical audit record read-only.",
    ],
    steps: [
      { action: "Run the safe grounded request.", expected: "Allowed, zero deterministic findings, no action executed." },
      { action: "Run prompt injection, unsupported business claim, and skip-approval scenarios.", expected: "Each is Blocked, with named deterministic findings (instruction conflict, approval bypass, execution request, unsupported claim)." },
      { action: "Run the sensitive-data and account-substitution scenarios.", expected: "Sensitive data is Redacted; account substitution is Blocked with evidence-manipulation findings." },
      { action: "Toggle Live NVIDIA and Forced fallback.", expected: "Live: available true, fallbackUsed false, raw score shown honestly. Fallback: unavailable, fallbackUsed true, deterministic policy still applies, safe stays Allowed and unsafe stays Blocked/Redacted." },
    ],
    expectedResults: [
      "Deterministic policy is visibly the final authority; NVIDIA is supplementary telemetry.",
      `Audit projection: Referenced recommendation ${C.recommendationId}; Referenced audit ref ${C.auditRef}.`,
      "missionUnchanged true, auditRefUnchanged true, ledgerMutated false, actionExecuted false.",
    ],
    failureIndicators: ["NVIDIA presented as the decision", "Raw score shown as probability", "A safe scenario bricked under fallback", "Ledger mutated"],
    truthNote: "Deterministic policy is the final authority. NVIDIA NeMoGuard is supplementary telemetry and never selects, approves, executes, or overrides.",
    technicalDetail: [
      `Referenced recommendation: ${C.recommendationId}`,
      `Referenced audit ref: ${C.auditRef}`,
      "Guardrails Lab route is available after approved promotion; it intercepts no Production traffic.",
    ],
    screenshotIds: ["guardrails-safe", "guardrails-injection", "guardrails-redacted", "guardrails-fallback"],
  },
  {
    number: 14,
    id: "audit-and-idempotency",
    title: "Validate the audit chain and idempotency",
    purpose: "Confirm a stable audit chain and idempotent replay.",
    route: C.missionControlCta,
    explain: [
      "Every mission stage is represented in the history and the audit chain must be valid.",
      "Replaying the same approved mission must not create duplicate ledger growth.",
      "Narrative provider variability must not alter the deterministic audit result.",
    ],
    steps: [
      { action: "Confirm all nine mission-history stages are Done after completion and the chain is valid.", expected: "Nine stages are Done and the chain reports valid." },
      { action: `Confirm the audit reference ${C.auditRef}.`, expected: "The canonical audit reference is shown." },
      { action: "Where an approved tester workflow exists, replay the mission and verify the same audit reference.", expected: "Replay yields the same audit reference with no duplicate ledger growth." },
    ],
    expectedResults: [
      "Stable audit reference and stable ledger record count.",
      "Idempotent replay and no duplicate action execution.",
      "No change caused by live NVIDIA versus deterministic fallback.",
    ],
    failureIndicators: ["Invalid audit chain", "Duplicate ledger growth", "Audit reference changed by NVIDIA vs fallback"],
    truthNote: "Simulation and audit behaviour are Production; replay is idempotent.",
    technicalDetail: [`Audit reference: ${C.auditRef}`],
    screenshotIds: ["audit-chain"],
  },
  {
    number: 15,
    id: "navigation-resilience",
    title: "Test navigation and resilience",
    purpose: "Confirm every route loads and recovers cleanly.",
    route: null,
    explain: [
      "Test direct route loading, browser refresh, back navigation, walkthrough image loading, lightbox Escape close, shell navigation, and all CTAs.",
    ],
    steps: [
      { action: "Load each expected route directly and refresh it.", expected: "Every route returns 200 with no blank route and no repeated 5xx." },
      { action: "Use back navigation and the lightbox Escape close.", expected: "Back navigation works; the lightbox closes with Escape." },
    ],
    expectedResults: [
      "Routes: /, /walkthrough, /tester-guide, /manager, /guardrails, /mission-control, /?view=mission, /?view=command, /?view=workspace, /?view=trust.",
      "All return 200 with no broken image, local backend address reference, Preview-only label, or secret.",
      "No unintended Production action.",
    ],
    failureIndicators: ["Blank route", "Repeated 5xx", "Broken image", "local backend address reference", "Preview-only label"],
    truthNote: null,
    technicalDetail: [],
    screenshotIds: [],
  },
  {
    number: 16,
    id: "production-vs-demonstration",
    title: "What is Production versus demonstration",
    purpose: "Read the truth table so you never over-claim what is live.",
    route: null,
    explain: [
      "Use the truth table below to classify each surface honestly.",
      "Voice and Digital Human are future presentation adapters and are not implemented.",
    ],
    steps: [
      { action: "Read each row of the truth table.", expected: "You can classify every surface as Production, Production-Partial, Guided Demo, Simulated, Not-implemented, or Future." },
    ],
    expectedResults: [
      "Voice and Digital Human are not claimed as implemented.",
      "Simulated and Production-Partial surfaces are labelled honestly.",
    ],
    failureIndicators: ["Voice or Digital Human claimed as Production", "A simulated surface presented as real"],
    truthNote: "Do not claim Voice or Digital Human is implemented.",
    technicalDetail: [],
    screenshotIds: [],
  },
  {
    number: 17,
    id: "defect-reporting",
    title: "Defect reporting",
    purpose: "Capture the right evidence when something fails.",
    route: null,
    explain: [
      "For every defect, record severity (P0/P1/P2), route, date/time, browser/device, action taken, expected vs actual, and a screenshot.",
      "Also record whether refresh reproduces it, whether it blocks the canonical Curefoods journey, whether approval was bypassed, whether a real action occurred, whether audit identity changed, and whether a secret was visible.",
    ],
    steps: [
      { action: "When something fails, capture a screenshot and complete the defect template.", expected: "A complete, reproducible defect record with severity and evidence." },
    ],
    expectedResults: [
      "Every defect has a severity, a route, and a screenshot.",
      "P0/P1/P2 severities follow the guidance below.",
    ],
    failureIndicators: [],
    truthNote: null,
    technicalDetail: [],
    screenshotIds: [],
  },
  {
    number: 18,
    id: "final-checklist",
    title: "Final tester checklist",
    purpose: "Confirm you exercised and understood the whole journey.",
    route: null,
    explain: ["Tick each item once you have completed and understood it."],
    steps: [
      { action: "Complete every checklist item, then submit feedback.", expected: "All items are checked and structured feedback is submitted." },
    ],
    expectedResults: ["All checklist items complete.", "Feedback submitted via the downloadable template."],
    failureIndicators: [],
    truthNote: null,
    technicalDetail: [],
    screenshotIds: [],
  },
];

// ---------------------------------------------------------------------------
// Section 16 — Production vs demonstration truth table.
// ---------------------------------------------------------------------------
export type TruthTier =
  | "Production"
  | "Production-Partial"
  | "Guided Demo"
  | "Simulated"
  | "Not implemented as real external actions"
  | "Future";

export interface TruthRow {
  readonly tier: TruthTier;
  readonly items: readonly string[];
}

export const TRUTH_TABLE: readonly TruthRow[] = [
  {
    tier: "Production",
    items: [
      "Landing experience",
      "Today's Mission canonical hosted journey",
      "Mission Control governed flow",
      "Walkthrough route",
      "Tester Guide route (after approved promotion)",
      "Deterministic governance and approval",
      "Simulation and audit behaviour",
      "NVIDIA grounded narrative integration",
      "Guardrails Lab route (after approved promotion)",
    ],
  },
  { tier: "Production-Partial", items: ["Executive projection", "Operations projection"] },
  { tier: "Guided Demo", items: ["Manager post-mission coaching scenario", "Browser-local Manager interaction state"] },
  { tier: "Simulated", items: ["Email drafting", "CRM task proposal", "Risk-update proposal", "Manager intervention assignment"] },
  {
    tier: "Not implemented as real external actions",
    items: [
      "Real email sending",
      "Real CRM record creation",
      "Real risk-record write",
      "Real customer response",
      "Real revenue outcome",
      "Real coaching-effectiveness measurement",
    ],
  },
  {
    tier: "Future",
    items: [
      "Persistent cross-route Manager state",
      "Production CRM identities and data",
      "External action execution after governance approval",
      "Voice and Digital Human presentation adapters",
    ],
  },
];

// ---------------------------------------------------------------------------
// Section 17 — Severity guidance.
// ---------------------------------------------------------------------------
export interface SeverityTier {
  readonly level: "P0" | "P1" | "P2";
  readonly label: string;
  readonly items: readonly string[];
}

export const SEVERITY_GUIDANCE: readonly SeverityTier[] = [
  {
    level: "P0",
    label: "Critical — blocks trust or the canonical journey",
    items: [
      "Canonical outage or a blank product route",
      "Approval bypass",
      "A non-simulated external action",
      "Invalid audit chain",
      "Identity mismatch",
      "Secret exposure",
      "Browser-to-NVIDIA or browser-to-Railway call",
      "Curefoods canonical mission replaced by mock/legacy state",
      "Truthful simulation labels missing",
    ],
  },
  {
    level: "P1",
    label: "Major — material but not a trust breach",
    items: [
      "Material navigation failure",
      "Inaccurate persona projection",
      "Broken walkthrough image",
      "Manager disclaimer missing",
      "Guardrails authority wording incorrect",
      "Deterministic fallback breaks a safe scenario",
      "An important expected state cannot be reached",
    ],
  },
  {
    level: "P2",
    label: "Minor — polish",
    items: ["Cosmetic copy issue", "Spacing issue", "Minor mobile layout issue", "Non-blocking caption or icon issue"],
  },
];

// ---------------------------------------------------------------------------
// Section E — structured tester feedback fields (in-guide + downloadable).
// ---------------------------------------------------------------------------
export interface FeedbackField {
  readonly key: string;
  readonly label: string;
  readonly kind: "text" | "longtext" | "rating" | "choice";
}

export const FEEDBACK_FIELDS: readonly FeedbackField[] = [
  { key: "testerName", label: "Tester name", kind: "text" },
  { key: "date", label: "Date", kind: "text" },
  { key: "browserDevice", label: "Browser and device", kind: "text" },
  { key: "overallImpression", label: "Overall impression", kind: "longtext" },
  { key: "productStoryClarity", label: "Product story clarity", kind: "rating" },
  { key: "trustGovernanceClarity", label: "Trust and governance clarity", kind: "rating" },
  { key: "easeOfNavigation", label: "Ease of navigation", kind: "rating" },
  { key: "understandingNvidia", label: "Understanding of NVIDIA's role", kind: "rating" },
  { key: "understandingApproval", label: "Understanding of human approval", kind: "rating" },
  { key: "understandingSimulation", label: "Understanding of simulation boundaries", kind: "rating" },
  { key: "defectsFound", label: "Defects found", kind: "longtext" },
  { key: "unclearTerms", label: "Unclear terms", kind: "longtext" },
  { key: "missingInformation", label: "Missing information", kind: "longtext" },
  { key: "suggestedImprovement", label: "Suggested improvement", kind: "longtext" },
  { key: "severity", label: "Severity (P0 / P1 / P2)", kind: "choice" },
  { key: "screenshotFilename", label: "Screenshot filename", kind: "text" },
  { key: "route", label: "Route", kind: "text" },
  { key: "reproductionSteps", label: "Reproduction steps", kind: "longtext" },
  { key: "expectedResult", label: "Expected result", kind: "longtext" },
  { key: "actualResult", label: "Actual result", kind: "longtext" },
];

// ---------------------------------------------------------------------------
// Section 18 — final tester checklist.
// ---------------------------------------------------------------------------
export const FINAL_CHECKLIST: readonly string[] = [
  "Product story understood",
  "Curefoods mission found",
  "Mission continuity confirmed",
  "Evidence reviewed",
  "NVIDIA role understood",
  "Approval completed",
  "Three simulated actions verified",
  "Governed outcome understood",
  "Persona projections reviewed",
  "Manager scenario tested",
  "Guardrails scenarios tested",
  "Live NVIDIA tested",
  "Forced fallback tested",
  "Audit chain validated",
  "No secrets observed",
  "No real action observed",
  "Feedback submitted",
];

// ---------------------------------------------------------------------------
// Glossary.
// ---------------------------------------------------------------------------
export interface GlossaryTerm {
  readonly term: string;
  readonly definition: string;
}

export const GLOSSARY: readonly GlossaryTerm[] = [
  { term: "Signal", definition: "An observation from a source system (CRM, product usage, or support) that may warrant attention." },
  { term: "Mission", definition: "A governed unit of work created from a signal; here, the canonical Curefoods renewal-protection mission M-RENEWAL-1." },
  { term: "Recommendation", definition: "The evidence-backed next-best action proposed for a mission (REC-M-RENEWAL-1). It is never executed autonomously." },
  { term: "Deterministic governed demo", definition: "A hosted scenario whose outcome is fixed and policy-controlled — not live customer CRM truth." },
  { term: "Deterministic policy", definition: "The authoritative VentureOS rules that decide allow/block/redact. NVIDIA telemetry never overrides it." },
  { term: "Grounded narrative", definition: "An explanation produced by NVIDIA Nemotron that must stay tied to supplied evidence." },
  { term: "Fallback", definition: "A resilience state where NVIDIA is unavailable; deterministic policy still applies and a safe scenario is not bricked." },
  { term: "Simulated", definition: "An action that runs only in a sandbox and produces a receipt; no real email, CRM record, or risk record is created." },
  { term: "Receipt", definition: "A sandbox record of a simulated action, e.g. receipt://M-RENEWAL-1/email." },
  { term: "System outcome", definition: "What the product completed internally: Governed work prepared successfully." },
  { term: "Business outcome", definition: "The real-world result, which here remains Awaiting external response." },
  { term: "Audit reference", definition: "The canonical, stable identifier for the mission's governed record: audit://M-RENEWAL-1/REC-M-RENEWAL-1." },
  { term: "Production-Partial", definition: "A read-only projection (Executive, Operations) of the governed mission that adds no new facts." },
  { term: "Guided Scenario", definition: "A deterministic post-mission snapshot (Manager Coaching) with browser-local state; it changes no governed state." },
];

// Aggregate export for consumers (route, PDF generator, internal source, evals).
export const TESTER_GUIDE = Object.freeze({
  meta: GUIDE_META,
  canonical: GUIDE_CANONICAL,
  sections: GUIDE_SECTIONS,
  screenshots: GUIDE_SCREENSHOTS,
  truthTable: TRUTH_TABLE,
  severity: SEVERITY_GUIDANCE,
  feedbackFields: FEEDBACK_FIELDS,
  checklist: FINAL_CHECKLIST,
  glossary: GLOSSARY,
  screenshotById: byId,
});

export { byId as screenshotById };
