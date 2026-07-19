// Tester Guide — canonical content (pure data, no React)
// ========================================================
// Consumed by the /tester-guide route, the PDF generator, and validation evals.

import type {
  GuideMetadata,
  GuideSection,
  TruthTableRow,
  SeverityGuidance,
  FeedbackField,
  ChecklistItem,
  GuardrailScenario,
  GlossaryEntry,
  GuideScreenshot,
} from "./types";

/** Canonical governed truth — shared with walkthrough stages. */
export const GUIDE_CANONICAL = Object.freeze({
  account: "Curefoods",
  accountId: "VOS-CUREFOODS",
  missionId: "M-RENEWAL-1",
  recommendationId: "REC-M-RENEWAL-1",
  template: "renewal-risk-parallel-v1",
  auditRef: "audit://M-RENEWAL-1/REC-M-RENEWAL-1",
  systemOutcome: "Governed work prepared successfully.",
  businessOutcome: "Awaiting external response.",
  nvidiaProvider: "nim",
  nvidiaModel: "nvidia/nvidia-nemotron-nano-9b-v2",
});

const C = GUIDE_CANONICAL;

// ── Screenshot manifest ──────────────────────────────────────────────
// Every screenshot is sourced from canonical Production.
const DEPLOY_ID = "dpl_GtYXxF8yDNuDr2GzDVhtxJKdPUr4";
const RUNTIME_SHA = "7601844";

function ss(
  src: string,
  alt: string,
  caption: string,
  sourceRoute: string,
  w = 1280,
  h = 720,
): GuideScreenshot {
  return {
    src,
    alt,
    caption,
    width: w,
    height: h,
    sourceRoute,
    deploymentId: DEPLOY_ID,
    sourceSha: RUNTIME_SHA,
  };
}

// ── Metadata ─────────────────────────────────────────────────────────

export const GUIDE_METADATA: GuideMetadata = {
  title: "VentureOS Signal-to-Action Tester Guide",
  version: "1.0.0",
  estimatedMinutes: 25,
  canonicalUrl: "https://ventureos-signal-to-action-agent.vercel.app",
  suggestedBrowser: "Chrome or Edge, latest stable release",
  suggestedViewport: "1280 × 800 or wider",
  deploymentId: DEPLOY_ID,
  runtimeSha: RUNTIME_SHA,
  lastUpdated: "2026-07-19",
};

// ── Sections ─────────────────────────────────────────────────────────

export const GUIDE_SECTIONS: readonly GuideSection[] = [
  // SECTION 1 — Before you begin
  {
    number: 1,
    id: "before-you-begin",
    title: "Before You Begin",
    explanation: [
      "VentureOS is an Enterprise AI Workforce Platform. Signal-to-Action Agent is the current flagship experience.",
      "The hosted scenario is a deterministic governed demo centred on Curefoods. The journey uses a canonical governed mission.",
      "No real email is sent. No real CRM task is created. No real risk record is written.",
      "Manager state is presentation-local. Executive and Operations are read-only Production-Partial projections.",
      "Guardrails Lab evaluates curated scenarios and does not intercept real Production traffic.",
    ],
    steps: [
      {
        id: "prerequisites",
        title: "Check prerequisites",
        route: undefined,
        purpose: "Ensure your environment is ready for testing.",
        actions: [
          { instruction: `Open the canonical URL: ${GUIDE_METADATA.canonicalUrl}` },
          { instruction: `Use ${GUIDE_METADATA.suggestedBrowser} at ${GUIDE_METADATA.suggestedViewport} or wider.` },
          { instruction: "Use a fresh browser session (Incognito or clear site data)." },
        ],
        expectedResults: [
          { description: "The landing page loads without errors." },
          { description: "No localhost references are visible." },
          { description: "No Feature Branch label is visible." },
        ],
        failureIndicators: [
          { description: "Blank page or 5xx error." },
          { description: "Console errors referencing localhost or internal API." },
        ],
        truthNotes: [
          { text: "This is a deterministic governed demo — not live customer CRM data." },
          { text: "Estimated test duration: approximately 25 minutes." },
        ],
      },
    ],
  },
  // SECTION 2 — Understand the product
  {
    number: 2,
    id: "understand-product",
    title: "Understand the Product in Two Minutes",
    route: "/",
    explanation: [
      "Signals are fragmented across CRM, product usage, and support systems.",
      "VentureOS turns signals into governed decisions: evidence comes before confidence, one recommendation is surfaced, approval comes before action, execution remains controlled, and all activity is auditable.",
    ],
    steps: [
      {
        id: "landing-hero",
        title: "Verify the landing page",
        route: "/",
        purpose: "Confirm the product story renders correctly.",
        actions: [
          { instruction: "Open the canonical URL." },
          { instruction: "Confirm the hero headline renders." },
          { instruction: "Confirm the page shows 'Human-approved' and 'Evidence-backed'." },
          { instruction: "Click 'Explore VentureOS' or 'See how it works'." },
        ],
        expectedResults: [
          { description: "Hero renders with the governed action headline." },
          { description: "No blank page, no backend error banner." },
          { description: "No localhost message, no Feature Branch label." },
          { description: "No broken CTA, no secret or internal URL." },
        ],
        failureIndicators: [
          { description: "Blank hero area." },
          { description: "Error banner or 5xx status." },
          { description: "CTA links to localhost or Preview URL." },
        ],
        truthNotes: [
          { text: "The landing page is Production." },
        ],
        screenshot: ss(
          "/walkthrough-assets/stage-02-todays-mission.png",
          "Production landing page showing the VentureOS hero with governed action headline.",
          "Production landing page — VentureOS hero.",
          "/",
          900, 283,
        ),
      },
    ],
  },
  // SECTION 3 — Product Walkthrough
  {
    number: 3,
    id: "product-walkthrough",
    title: "Review the Full Product Walkthrough",
    route: "/walkthrough",
    explanation: [
      "The walkthrough is the narrative guide describing the same canonical Curefoods journey.",
      "Screenshots are Product evidence, not decorative mockups. Clicking an image expands it; Escape or the close control dismisses it.",
    ],
    steps: [
      {
        id: "walkthrough-review",
        title: "Walk through all stages",
        route: "/walkthrough",
        purpose: "Confirm the narrative guide renders correctly.",
        actions: [
          { instruction: "Open /walkthrough." },
          { instruction: "Scroll through all stages." },
          { instruction: "Open at least two screenshots in the lightbox." },
          { instruction: "Close the lightbox with Escape or the close button." },
          { instruction: "Use one CTA to enter the Product journey." },
        ],
        expectedResults: [
          { description: "All stages render with content." },
          { description: "All embedded images load without broken placeholders." },
          { description: "Captions match the stage they illustrate." },
          { description: "Lightbox opens and closes cleanly." },
          { description: "No layout shift or broken image." },
          { description: "Status labels remain truthful (Production, Guided Demo, etc.)." },
        ],
        failureIndicators: [
          { description: "Missing stage content." },
          { description: "Broken image icon." },
          { description: "Lightbox fails to open or close." },
        ],
        truthNotes: [
          { text: "The walkthrough is a read-only presentation of the governed story." },
        ],
      },
    ],
  },
  // SECTION 4 — Today's Mission
  {
    number: 4,
    id: "todays-mission",
    title: "Begin with Today's Mission",
    route: "/?view=mission",
    explanation: [
      `The canonical mission entry: Account ${C.account} (${C.accountId}), Mission ${C.missionId}, Recommendation ${C.recommendationId}, Template ${C.template}.`,
      `Audit reference: ${C.auditRef}.`,
    ],
    steps: [
      {
        id: "open-mission",
        title: "Open Today's Mission",
        route: "/?view=mission",
        purpose: "Confirm Curefoods is the authoritative hosted demo entry.",
        actions: [
          { instruction: "Open Today's Mission." },
          { instruction: `Confirm ${C.account} is the authoritative hosted demo entry.` },
          { instruction: "Confirm the title 'Renewal protection mission'." },
          { instruction: "Confirm the truth label 'Deterministic governed demo mission'." },
          { instruction: "Click 'Open governed mission'." },
        ],
        expectedResults: [
          { description: `${C.account} appears as the canonical mission.` },
          { description: "No Tessera substitution, no empty mission." },
          { description: "No 'provider mock' replacement of the canonical journey." },
          { description: "No localhost error." },
        ],
        failureIndicators: [
          { description: "Different account name appears." },
          { description: "Empty mission card." },
          { description: "CTA does not navigate to Mission Control." },
        ],
        truthNotes: [
          { text: `Curefoods remains authoritative whether the public root API is warm, cold, mock, or synthetic.` },
        ],
        screenshot: ss(
          "/walkthrough-assets/stage-02-todays-mission.png",
          `Today's Mission screen showing ${C.account} renewal protection as the canonical governed demo mission.`,
          `Today's Mission — ${C.account} canonical entry.`,
          "/?view=mission",
          900, 283,
        ),
      },
    ],
  },
  // SECTION 5 — Mission Continuity
  {
    number: 5,
    id: "mission-continuity",
    title: "Confirm Mission Continuity",
    route: `/mission-control?account=${C.accountId}&mission=${C.missionId}&from=todays-mission`,
    explanation: [
      "This is the same mission, not a second re-selected mission. Identity resolution is deterministic.",
      "Continuity is preserved across account, mission, recommendation, template, and audit reference.",
    ],
    steps: [
      {
        id: "verify-continuity",
        title: "Verify mission identity carries forward",
        route: `/mission-control?account=${C.accountId}&mission=${C.missionId}&from=todays-mission`,
        purpose: "Confirm mission continuity between Today's Mission and Mission Control.",
        actions: [
          { instruction: `Confirm ${C.account} in Mission Control.` },
          { instruction: `Confirm mission ${C.missionId}.` },
          { instruction: "Confirm the continuity cue and nothing was re-selected." },
          { instruction: "Confirm shared application navigation remains available." },
        ],
        expectedResults: [
          { description: "Today's Mission and Mission Control describe the same mission." },
          { description: "No identity mismatch, no duplicate shell." },
          { description: "No broken navigation." },
        ],
        failureIndicators: [
          { description: "Different mission ID in Mission Control." },
          { description: "Navigation elements missing or broken." },
        ],
        truthNotes: [
          { text: "Deterministic identity resolution — the same mission continues, never re-selected." },
        ],
        screenshot: ss(
          "/walkthrough-assets/stage-03-mission-continuity.png",
          `Mission Control showing ${C.account} ${C.missionId} with continuity from Today's Mission.`,
          "Mission Control — identity continuity confirmed.",
          "/mission-control",
          900, 283,
        ),
      },
    ],
  },
  // SECTION 6 — Signal and Evidence
  {
    number: 6,
    id: "signal-evidence",
    title: "Review the Signal and Evidence",
    route: "/mission-control",
    explanation: [
      "Mission Control presents: What happened, Recommended renewal mission, Why this account is at risk, Confidence/evidence/provenance, Proposed actions, and Verification.",
    ],
    steps: [
      {
        id: "review-evidence",
        title: "Review signal narrative and evidence",
        route: "/mission-control",
        purpose: "Confirm evidence precedes the recommendation and claims are honest.",
        actions: [
          { instruction: "Review the signal narrative." },
          { instruction: "Confirm three verified evidence sources: account health, renewal timeline, usage trend." },
          { instruction: "Confirm governance checks are 3 of 3." },
          { instruction: "Expand technical evidence." },
          { instruction: "Confirm account-match confidence is described as identity confidence, not renewal probability." },
        ],
        expectedResults: [
          { description: "Evidence precedes the recommendation." },
          { description: "Unsupported claims are absent." },
          { description: "Confidence wording is honest." },
          { description: "Provenance is visible." },
          { description: "The recommendation is not portrayed as autonomous execution." },
        ],
        failureIndicators: [
          { description: "Recommendation appears before evidence." },
          { description: "Confidence described as 'renewal probability'." },
          { description: "Missing evidence sources." },
        ],
        truthNotes: [
          { text: "Evidence and provenance must always precede any recommendation." },
        ],
      },
    ],
  },
  // SECTION 7 — NVIDIA's Role
  {
    number: 7,
    id: "nvidia-role",
    title: "Understand NVIDIA's Role",
    route: "/mission-control",
    explanation: [
      "NVIDIA Nemotron generates or supports the explanation layer. It must remain grounded in supplied evidence.",
      "NVIDIA does not select, approve, or execute the mission. It does not replace deterministic policy. It may fall back honestly when unavailable.",
      "Intermittent deterministic fallback is an accepted resilience condition. Fallback must be labelled truthfully and must never bypass policy or approval.",
    ],
    steps: [
      {
        id: "nvidia-evidence",
        title: "Inspect NVIDIA explanation evidence",
        route: "/mission-control",
        purpose: "Confirm NVIDIA's supplementary role and honest fallback labelling.",
        actions: [
          { instruction: "Inspect the NVIDIA explanation evidence panel." },
          { instruction: `Confirm provider: ${C.nvidiaProvider}.` },
          { instruction: `Confirm model: ${C.nvidiaModel}.` },
          { instruction: "Confirm validation: grounded." },
          { instruction: "Confirm fallbackUsed: false on a successful live run." },
          { instruction: "Confirm grounded evidence references are shown." },
        ],
        expectedResults: [
          { description: "Live NVIDIA evidence is visible on at least one run." },
          { description: "Product remains usable if NVIDIA falls back." },
          { description: "No browser-to-NVIDIA request." },
          { description: "No secret exposure." },
        ],
        failureIndicators: [
          { description: "NVIDIA panel shows error without fallback label." },
          { description: "Browser network tab shows direct NVIDIA API call." },
          { description: "API key or secret visible in UI." },
        ],
        truthNotes: [
          { text: "NVIDIA is supplementary telemetry — deterministic policy is always the final authority." },
        ],
        screenshot: ss(
          "/walkthrough-assets/stage-05-nvidia-grounded.png",
          "NVIDIA grounded explanation evidence panel showing provider, model, and validation status.",
          "NVIDIA explanation — grounded evidence.",
          "/mission-control",
          900, 283,
        ),
      },
    ],
  },
  // SECTION 8 — Approval
  {
    number: 8,
    id: "approval",
    title: "Verify Approval Is Mandatory",
    route: "/mission-control",
    explanation: [
      "The system may recommend and prepare actions. Only a human may approve.",
      "Approval is bound to the specific mission and proposed action. Nothing runs before approval.",
    ],
    steps: [
      {
        id: "approval-flow",
        title: "Complete the approval flow",
        route: "/mission-control",
        purpose: "Confirm nothing executes without explicit human approval.",
        actions: [
          { instruction: "Locate the Approval section." },
          { instruction: "Inspect what will be simulated." },
          { instruction: "Inspect technical approval binding." },
          { instruction: "Click 'Approve'." },
          { instruction: "Complete the second confirmation step." },
        ],
        expectedResults: [
          { description: "Before approval: status 'Awaiting approval', simulated execution has not run." },
          { description: "Before approval: approval, request revision, and reject controls are available." },
          { description: "After approval: approval accepted, approved by Account owner or equivalent." },
          { description: "After approval: mission version remains bound, simulated execution becomes eligible." },
        ],
        failureIndicators: [
          { description: "Actions execute before approval button is clicked." },
          { description: "No confirmation step shown." },
          { description: "Approval status does not update." },
        ],
        truthNotes: [
          { text: "This is human-approved simulation, not autonomous execution." },
        ],
        screenshot: ss(
          "/walkthrough-assets/stage-06-human-approval.png",
          "Human approval section showing Awaiting approval status with Approve, Revise, and Reject controls.",
          "Human approval gate — nothing runs without approval.",
          "/mission-control",
          900, 283,
        ),
      },
    ],
  },
  // SECTION 9 — Simulated Execution
  {
    number: 9,
    id: "simulated-execution",
    title: "Validate Simulated Execution",
    route: "/mission-control",
    explanation: [
      "Three controlled actions are produced after approval:",
      "1. Customer email — drafted, not sent.",
      "2. CRM task — proposed, not created.",
      "3. Risk update — proposed, not written.",
    ],
    steps: [
      {
        id: "verify-simulation",
        title: "Verify all three simulated actions",
        route: "/mission-control",
        purpose: "Confirm all actions are simulated and none are real.",
        actions: [
          { instruction: "Verify all three actions appear." },
          { instruction: "Verify each is labelled 'Simulated'." },
          { instruction: "Verify the before and after state." },
          { instruction: "Verify each receipt." },
          { instruction: "Verify 'Completed in sandbox'." },
        ],
        expectedResults: [
          { description: "No real email is sent." },
          { description: "No CRM record is created." },
          { description: "No risk record is written." },
          { description: "Three simulation receipts are visible: receipt://M-RENEWAL-1/email, receipt://M-RENEWAL-1/crm_task, receipt://M-RENEWAL-1/risk_update." },
          { description: "No mission action occurs before approval." },
        ],
        failureIndicators: [
          { description: "Fewer or more than three actions." },
          { description: "'Simulated' label missing from any action." },
          { description: "Receipt references missing." },
        ],
        truthNotes: [
          { text: "All three actions are simulated. No external system is modified." },
        ],
        screenshot: ss(
          "/walkthrough-assets/stage-07-simulated-execution.png",
          "Three simulated actions with receipts showing email drafted, CRM task proposed, risk update proposed.",
          "Simulated execution — three controlled actions with receipts.",
          "/mission-control",
          900, 283,
        ),
      },
    ],
  },
  // SECTION 10 — Governed Outcome
  {
    number: 10,
    id: "governed-outcome",
    title: "Validate the Governed Outcome",
    route: "/mission-control",
    explanation: [
      `System outcome: "${C.systemOutcome}"`,
      `Business outcome: "${C.businessOutcome}"`,
      "These differ because: the Product successfully completed internal preparation, but the customer has not responded. No renewal has been won, no risk reduction proven, no revenue impact claimed.",
    ],
    steps: [
      {
        id: "verify-outcome",
        title: "Verify outcome statements",
        route: "/mission-control",
        purpose: "Confirm outcome wording is honest and no unsupported claims are made.",
        actions: [
          { instruction: "Confirm mission state: Complete." },
          { instruction: "Confirm all three simulated action statements." },
          { instruction: `Confirm mission ID: ${C.missionId}.` },
          { instruction: `Confirm audit reference: ${C.auditRef}.` },
          { instruction: "Confirm the business outcome remains 'Awaiting external response'." },
        ],
        expectedResults: [
          { description: "No unsupported success claim." },
          { description: "No 'customer renewed' statement." },
          { description: "No 'risk reduced to zero' statement." },
          { description: "No 'meeting booked' claim." },
          { description: "No fabricated customer behaviour." },
        ],
        failureIndicators: [
          { description: "Business outcome claims success." },
          { description: "Revenue or risk-reduction figure stated." },
        ],
        truthNotes: [
          { text: `System outcome is "${C.systemOutcome}" — business outcome is "${C.businessOutcome}".` },
        ],
        screenshot: ss(
          "/walkthrough-assets/stage-08-governed-outcome.png",
          "Governed outcome showing system outcome as prepared and business outcome as awaiting external response.",
          "Governed outcome — honest distinction between system and business results.",
          "/mission-control",
          900, 283,
        ),
      },
    ],
  },
  // SECTION 11 — Persona Projections
  {
    number: 11,
    id: "persona-projections",
    title: "Review Shared Persona Projections",
    route: "/",
    explanation: [
      "The same mission is visible through Seller, Executive (Production-Partial), and Operations (Production-Partial) views.",
    ],
    steps: [
      {
        id: "verify-projections",
        title: "Verify persona projections share state",
        purpose: "Confirm all persona views reference the same mission without contradictions.",
        actions: [
          { instruction: `Verify all projections refer to ${C.account} and ${C.missionId}.` },
          { instruction: "Verify Executive receives a read-only summary." },
          { instruction: "Verify Operations sees audit status, simulated action count, and template." },
          { instruction: "Verify no projection adds a new fact or executes an action." },
        ],
        expectedResults: [
          { description: "Shared state, shared audit reference, shared governed outcome." },
          { description: "No persona-specific contradiction." },
          { description: "Production-Partial labels remain visible on Executive and Operations." },
        ],
        failureIndicators: [
          { description: "Different mission data across personas." },
          { description: "Missing Production-Partial label." },
        ],
        truthNotes: [
          { text: "Executive and Operations are Production-Partial projections — read-only views." },
        ],
      },
    ],
  },
  // SECTION 12 — Manager Coaching
  {
    number: 12,
    id: "manager-coaching",
    title: "Review Manager Coaching",
    route: "/manager",
    explanation: [
      "Manager Coaching is a guided post-mission scenario — not reading the current browser Mission Control session.",
      "It shows a deterministic post-completion snapshot of the same canonical Curefoods mission.",
      "It is not a CRM-backed manager identity. It does not change Mission Control. Its review state is browser-local.",
      "It does not calculate coaching effectiveness, and does not claim revenue uplift or risk reduction.",
    ],
    steps: [
      {
        id: "manager-test",
        title: "Test Manager guided scenario",
        route: "/manager",
        purpose: "Confirm Manager state is browser-local and does not affect Mission Control.",
        actions: [
          { instruction: "Confirm the post-mission guided-scenario label." },
          { instruction: "Confirm the disclaimer." },
          { instruction: "Confirm canonical mission identity." },
          { instruction: "Click 'Review coaching guidance'." },
          { instruction: "Click 'Assign simulated coaching intervention'." },
          { instruction: "Refresh the page and confirm browser-local state persistence." },
        ],
        expectedResults: [
          { description: "State transitions: NOT REVIEWED → REVIEWED → SIMULATED INTERVENTION ASSIGNED." },
          { description: "No notification sent, no CRM record changed." },
          { description: "No mission state changed, no audit reference changed." },
          { description: "Mission Control remains unaffected." },
        ],
        failureIndicators: [
          { description: "Manager changes appear in Mission Control." },
          { description: "Missing guided-scenario label or disclaimer." },
          { description: "State does not persist on refresh." },
        ],
        truthNotes: [
          { text: "Manager is a Post-mission Guided Scenario — browser-local, presentation-only." },
        ],
        screenshot: ss(
          "/walkthrough-assets/stage-09-manager-coaching.png",
          "Manager coaching screen showing guided scenario with review and intervention controls.",
          "Manager Coaching — guided post-mission scenario.",
          "/manager",
          900, 283,
        ),
      },
    ],
  },
  // SECTION 13 — Guardrails Lab
  {
    number: 13,
    id: "guardrails-lab",
    title: "Review Guardrails Lab",
    route: "/guardrails",
    explanation: [
      "VentureOS deterministic policy is authoritative. NVIDIA NeMoGuard JailbreakDetect is supplementary telemetry.",
      "The NVIDIA raw score is not a calibrated probability. NVIDIA does not select, approve, execute, or override the decision.",
      "Guardrails Lab uses curated auditable scenarios. It does not intercept real Production requests or append a ledger event.",
    ],
    steps: [
      {
        id: "guardrails-scenarios",
        title: "Test all guardrail scenarios",
        route: "/guardrails",
        purpose: "Confirm deterministic policy remains authoritative in all scenarios.",
        actions: [
          { instruction: "Test: Safe grounded request → expected Allowed." },
          { instruction: "Test: Prompt injection / instruction conflict → expected Blocked." },
          { instruction: "Test: Unsupported business-outcome claim → expected Blocked." },
          { instruction: "Test: Skip approval and send → expected Blocked." },
          { instruction: "Test: Sensitive-data request → expected Redacted." },
          { instruction: "Test: Account substitution / evidence manipulation → expected Blocked." },
        ],
        expectedResults: [
          { description: "Safe request: Allowed, zero deterministic findings." },
          { description: "Injection: Blocked with instruction conflict and approval bypass findings." },
          { description: "Unsupported claim: Blocked." },
          { description: "Skip approval: Blocked with approval bypass and execution request." },
          { description: "Sensitive data: Redacted, no secret or PII shown." },
          { description: "Account substitution: Blocked with evidence manipulation finding." },
        ],
        failureIndicators: [
          { description: "Unsafe request allowed through." },
          { description: "Safe request incorrectly blocked." },
          { description: "Deterministic policy overridden by NVIDIA score." },
        ],
        truthNotes: [
          { text: "Deterministic policy is always the final authority — NVIDIA is supplementary." },
        ],
        screenshot: ss(
          "/walkthrough-assets/stage-10-guardrails.png",
          "Guardrails Lab showing scenario evaluation with deterministic policy verdicts.",
          "Guardrails Lab — deterministic policy is authoritative.",
          "/guardrails",
          900, 283,
        ),
      },
      {
        id: "guardrails-modes",
        title: "Test classifier modes",
        route: "/guardrails",
        purpose: "Confirm both live NVIDIA and forced fallback produce correct results.",
        actions: [
          { instruction: "Test Live NVIDIA mode: available true, live classification, fallbackUsed false." },
          { instruction: "Test Forced fallback mode: classification unavailable, fallbackUsed true." },
          { instruction: "Verify deterministic policy still applies in fallback mode." },
        ],
        expectedResults: [
          { description: "Live: raw score shown honestly, deterministic policy remains final authority." },
          { description: "Fallback: safe scenario remains Allowed, unsafe remains Blocked/Redacted." },
        ],
        failureIndicators: [
          { description: "Fallback changes the verdict from deterministic policy." },
          { description: "Forced fallback mode not available." },
        ],
        truthNotes: [
          { text: "Forced fallback is an accepted resilience condition — policy is never bypassed." },
        ],
      },
      {
        id: "guardrails-audit",
        title: "Verify audit projection",
        route: "/guardrails",
        purpose: "Confirm guardrails reference the canonical audit record read-only.",
        actions: [
          { instruction: `Confirm referenced recommendation: ${C.recommendationId}.` },
          { instruction: `Confirm referenced audit ref: ${C.auditRef}.` },
          { instruction: "Confirm missionUnchanged: true, auditRefUnchanged: true." },
          { instruction: "Confirm ledgerMutated: false, actionExecuted: false." },
        ],
        expectedResults: [
          { description: "Audit projection is read-only and matches canonical references." },
          { description: "No ledger mutation, no action execution." },
        ],
        failureIndicators: [
          { description: "Audit reference does not match canonical." },
          { description: "ledgerMutated shown as true." },
        ],
        truthNotes: [
          { text: "Guardrails Lab references the canonical audit record but never mutates it." },
        ],
      },
    ],
  },
  // SECTION 14 — Audit Chain
  {
    number: 14,
    id: "audit-chain",
    title: "Validate the Audit Chain and Idempotency",
    route: "/mission-control",
    explanation: [
      "Every mission stage is represented in the history. The audit chain must be valid.",
      "Replaying the same approved mission must not create duplicate ledger growth.",
      "Narrative provider variability must not alter the deterministic audit result.",
    ],
    steps: [
      {
        id: "verify-audit",
        title: "Verify audit chain integrity",
        route: "/mission-control",
        purpose: "Confirm the audit chain is valid and idempotent.",
        actions: [
          { instruction: "Confirm all nine mission-history stages are Done after completion." },
          { instruction: "Confirm 'Chain valid'." },
          { instruction: `Confirm audit reference: ${C.auditRef}.` },
          { instruction: "If supported, replay the mission and verify the same audit reference." },
        ],
        expectedResults: [
          { description: "Stable audit reference." },
          { description: "Stable ledger record count." },
          { description: "Idempotent replay — no duplicate action execution." },
          { description: "No change caused by live NVIDIA versus deterministic fallback." },
        ],
        failureIndicators: [
          { description: "Chain shows invalid." },
          { description: "Ledger count increases on replay." },
          { description: "Audit reference changes." },
        ],
        truthNotes: [
          { text: "Audit integrity is a P0 requirement — the chain must always be valid." },
        ],
      },
    ],
  },
  // SECTION 15 — Navigation and Resilience
  {
    number: 15,
    id: "navigation-resilience",
    title: "Test Navigation and Resilience",
    explanation: [
      "Verify all major routes load correctly, respond to browser navigation, and maintain state.",
    ],
    steps: [
      {
        id: "navigation-test",
        title: "Test all navigation paths",
        purpose: "Confirm all routes are functional and resilient.",
        actions: [
          { instruction: "Test direct route loading for each route." },
          { instruction: "Test browser refresh on each route." },
          { instruction: "Test back navigation." },
          { instruction: "Test walkthrough image loading and lightbox Escape close." },
          { instruction: "Test shell navigation and landing CTAs." },
        ],
        expectedResults: [
          { description: "All routes return 200: /, /walkthrough, /tester-guide, /manager, /guardrails, /mission-control." },
          { description: "All view routes work: /?view=mission, /?view=command, /?view=workspace, /?view=trust." },
          { description: "No blank route, no repeated 5xx." },
          { description: "No broken image, no localhost reference." },
          { description: "No Preview-only label, no secret." },
        ],
        failureIndicators: [
          { description: "Any route returns 404, 500, or blank page." },
          { description: "Navigation breaks on refresh." },
          { description: "Image fails to load." },
        ],
        truthNotes: [],
      },
    ],
  },
  // SECTION 16 — Truth Table (content is in truthTable array below)
  {
    number: 16,
    id: "truth-table",
    title: "What Is Production Versus Demonstration",
    explanation: [
      "Refer to the truth table to understand the classification of every feature.",
    ],
    steps: [],
  },
  // SECTION 17 — Defect Reporting (content is in severityGuidance array below)
  {
    number: 17,
    id: "defect-reporting",
    title: "Defect Reporting",
    explanation: [
      "When you find a defect, record it using the structured template below.",
    ],
    steps: [],
  },
  // SECTION 18 — Final Checklist (content is in checklist array below)
  {
    number: 18,
    id: "final-checklist",
    title: "Final Tester Checklist",
    explanation: [
      "Complete all items below before submitting your feedback.",
    ],
    steps: [],
  },
];

// ── Truth Table ──────────────────────────────────────────────────────

export const GUIDE_TRUTH_TABLE: readonly TruthTableRow[] = [
  { feature: "Landing experience", classification: "Production", detail: "Live public-facing hero and product story." },
  { feature: "Today's Mission canonical hosted journey", classification: "Production", detail: "Deterministic governed demo mission." },
  { feature: "Mission Control governed flow", classification: "Production", detail: "Full mission lifecycle with approval." },
  { feature: "Walkthrough route", classification: "Production", detail: "Narrative guide with Production evidence." },
  { feature: "Tester Guide route (after approved promotion)", classification: "Production", detail: "Self-guided testing experience." },
  { feature: "Deterministic governance and approval", classification: "Production", detail: "Policy engine, approval gate." },
  { feature: "Simulation and audit behaviour", classification: "Production", detail: "Deterministic simulation with audit chain." },
  { feature: "NVIDIA grounded narrative integration", classification: "Production", detail: "Supplementary explanation with honest fallback." },
  { feature: "Guardrails Lab route (after approved promotion)", classification: "Production", detail: "Curated scenario evaluation." },
  { feature: "Executive projection", classification: "Production-Partial", detail: "Read-only summary view." },
  { feature: "Operations projection", classification: "Production-Partial", detail: "Read-only audit and template view." },
  { feature: "Manager post-mission coaching scenario", classification: "Guided Demo", detail: "Browser-local guided scenario." },
  { feature: "Browser-local Manager interaction state", classification: "Guided Demo", detail: "State persists in browser only." },
  { feature: "Email drafting", classification: "Simulated", detail: "Drafted, not sent." },
  { feature: "CRM task proposal", classification: "Simulated", detail: "Proposed, not created." },
  { feature: "Risk-update proposal", classification: "Simulated", detail: "Proposed, not written." },
  { feature: "Manager intervention assignment", classification: "Simulated", detail: "Browser-local, no notification sent." },
  { feature: "Real email sending", classification: "Not implemented", detail: "No external email delivery." },
  { feature: "Real CRM record creation", classification: "Not implemented", detail: "No real CRM write." },
  { feature: "Real risk-record write", classification: "Not implemented", detail: "No real risk system write." },
  { feature: "Real customer response", classification: "Not implemented", detail: "No real customer interaction." },
  { feature: "Real revenue outcome", classification: "Not implemented", detail: "No real revenue measurement." },
  { feature: "Real coaching-effectiveness measurement", classification: "Not implemented", detail: "No real coaching metrics." },
  { feature: "Persistent cross-route Manager state", classification: "Future", detail: "Planned for future release." },
  { feature: "Production CRM identities and data", classification: "Future", detail: "Planned for future release." },
  { feature: "External action execution after governance approval", classification: "Future", detail: "Planned for future release." },
  { feature: "Voice and Digital Human presentation adapters", classification: "Future", detail: "Planned for future release — not implemented." },
];

// ── Severity Guidance ────────────────────────────────────────────────

export const GUIDE_SEVERITY: readonly SeverityGuidance[] = [
  {
    severity: "P0",
    description: "Critical — blocks the canonical journey or violates trust guarantees.",
    examples: [
      "Canonical outage or blank Product route",
      "Approval bypass — action executes without approval",
      "Non-simulated external action (real email, CRM write, risk write)",
      "Invalid audit chain",
      "Identity mismatch (wrong account, mission, or recommendation)",
      "Secret exposure (API key, internal URL, deployment ID visible)",
      "Browser-to-NVIDIA or browser-to-Railway call",
      "Curefoods canonical mission replaced by mock/legacy state",
      "Truthful simulation labels missing",
    ],
  },
  {
    severity: "P1",
    description: "Material — impacts the testing experience but does not break trust.",
    examples: [
      "Material navigation failure",
      "Inaccurate persona projection",
      "Broken walkthrough image",
      "Manager disclaimer missing",
      "Guardrails authority wording incorrect",
      "Deterministic fallback breaks a safe scenario",
      "Important expected state cannot be reached",
    ],
  },
  {
    severity: "P2",
    description: "Polish — cosmetic or minor issues.",
    examples: [
      "Cosmetic copy issue",
      "Spacing issue",
      "Minor mobile layout issue",
      "Non-blocking caption or icon issue",
    ],
  },
];

// ── Feedback Fields ──────────────────────────────────────────────────

export const GUIDE_FEEDBACK_FIELDS: readonly FeedbackField[] = [
  { name: "testerName", label: "Tester Name", type: "text", required: true, placeholder: "Your name" },
  { name: "date", label: "Date", type: "text", required: true, placeholder: "YYYY-MM-DD" },
  { name: "browserDevice", label: "Browser & Device", type: "text", required: true, placeholder: "e.g. Chrome 126 / MacBook Pro" },
  { name: "overallImpression", label: "Overall Impression", type: "rating", required: true, options: ["1 — Poor", "2 — Below expectations", "3 — Meets expectations", "4 — Above expectations", "5 — Excellent"] },
  { name: "storyClarity", label: "Product Story Clarity", type: "rating", required: true, options: ["1 — Unclear", "2 — Somewhat clear", "3 — Clear", "4 — Very clear", "5 — Crystal clear"] },
  { name: "trustClarity", label: "Trust & Governance Clarity", type: "rating", required: true, options: ["1 — Unclear", "2 — Somewhat clear", "3 — Clear", "4 — Very clear", "5 — Crystal clear"] },
  { name: "easeOfNavigation", label: "Ease of Navigation", type: "rating", required: true, options: ["1 — Very difficult", "2 — Difficult", "3 — Acceptable", "4 — Easy", "5 — Very easy"] },
  { name: "nvidiaUnderstanding", label: "Understanding of NVIDIA's Role", type: "rating", required: true, options: ["1 — Unclear", "2 — Somewhat clear", "3 — Clear", "4 — Very clear", "5 — Crystal clear"] },
  { name: "approvalUnderstanding", label: "Understanding of Human Approval", type: "rating", required: true, options: ["1 — Unclear", "2 — Somewhat clear", "3 — Clear", "4 — Very clear", "5 — Crystal clear"] },
  { name: "simulationUnderstanding", label: "Understanding of Simulation Boundaries", type: "rating", required: true, options: ["1 — Unclear", "2 — Somewhat clear", "3 — Clear", "4 — Very clear", "5 — Crystal clear"] },
  { name: "defectsFound", label: "Defects Found", type: "textarea", required: false, placeholder: "Describe any defects…" },
  { name: "unclearTerms", label: "Unclear Terms", type: "textarea", required: false, placeholder: "List any unclear terms…" },
  { name: "missingInfo", label: "Missing Information", type: "textarea", required: false, placeholder: "What was missing?" },
  { name: "suggestedImprovement", label: "Suggested Improvement", type: "textarea", required: false, placeholder: "Suggestions…" },
  { name: "severity", label: "Highest Defect Severity", type: "select", required: false, options: ["None", "P0 — Critical", "P1 — Material", "P2 — Polish"] },
  { name: "screenshotFilename", label: "Screenshot Filename", type: "text", required: false, placeholder: "e.g. defect-001.png" },
  { name: "defectRoute", label: "Route", type: "text", required: false, placeholder: "e.g. /mission-control" },
  { name: "reproductionSteps", label: "Reproduction Steps", type: "textarea", required: false, placeholder: "1. Open…\n2. Click…" },
  { name: "expectedResult", label: "Expected Result", type: "textarea", required: false, placeholder: "What should have happened?" },
  { name: "actualResult", label: "Actual Result", type: "textarea", required: false, placeholder: "What actually happened?" },
];

// ── Final Checklist ──────────────────────────────────────────────────

export const GUIDE_CHECKLIST: readonly ChecklistItem[] = [
  { id: "story", label: "Product story understood" },
  { id: "mission-found", label: "Curefoods mission found" },
  { id: "continuity", label: "Mission continuity confirmed" },
  { id: "evidence", label: "Evidence reviewed" },
  { id: "nvidia", label: "NVIDIA role understood" },
  { id: "approval", label: "Approval completed" },
  { id: "simulation", label: "Three simulated actions verified" },
  { id: "outcome", label: "Governed outcome understood" },
  { id: "projections", label: "Persona projections reviewed" },
  { id: "manager", label: "Manager scenario tested" },
  { id: "guardrails", label: "Guardrails scenarios tested" },
  { id: "nvidia-live", label: "Live NVIDIA tested" },
  { id: "fallback", label: "Forced fallback tested" },
  { id: "audit", label: "Audit chain validated" },
  { id: "no-secrets", label: "No secrets observed" },
  { id: "no-real-action", label: "No real action observed" },
  { id: "feedback", label: "Feedback submitted" },
];

// ── Guardrail Scenarios ──────────────────────────────────────────────

export const GUIDE_GUARDRAIL_SCENARIOS: readonly GuardrailScenario[] = [
  { id: "safe", name: "Safe grounded request", expectedVerdict: "Allowed", expectedFindings: [] },
  { id: "injection", name: "Prompt injection / instruction conflict", expectedVerdict: "Blocked", expectedFindings: ["instruction conflict", "approval bypass", "execution request"] },
  { id: "unsupported-claim", name: "Unsupported business-outcome claim", expectedVerdict: "Blocked", expectedFindings: ["unsupported claim"] },
  { id: "skip-approval", name: "Skip approval and send", expectedVerdict: "Blocked", expectedFindings: ["approval bypass", "execution request"] },
  { id: "sensitive-data", name: "Sensitive-data request", expectedVerdict: "Redacted", expectedFindings: [] },
  { id: "account-substitution", name: "Account substitution / evidence manipulation", expectedVerdict: "Blocked", expectedFindings: ["account substitution", "evidence manipulation"] },
];

// ── Glossary ─────────────────────────────────────────────────────────

export const GUIDE_GLOSSARY: readonly GlossaryEntry[] = [
  { term: "VentureOS", definition: "Enterprise AI Workforce Platform — the parent product." },
  { term: "Signal-to-Action Agent", definition: "The flagship experience that turns customer signals into governed, human-approved actions." },
  { term: "Mission", definition: "A governed workflow initiated by a detected signal, carrying a unique ID (e.g. M-RENEWAL-1)." },
  { term: "Recommendation", definition: "A proposed next-best action produced by the decision engine, bound to a specific mission." },
  { term: "Deterministic Policy", definition: "The authoritative policy engine that makes final governance decisions — NVIDIA does not override it." },
  { term: "NVIDIA Nemotron", definition: "Supplementary AI model (nvidia/nvidia-nemotron-nano-9b-v2) that generates grounded narrative explanations." },
  { term: "NeMoGuard JailbreakDetect", definition: "NVIDIA's supplementary telemetry classifier used in Guardrails Lab. Raw scores are not calibrated probabilities." },
  { term: "Human Approval", definition: "The mandatory gate where a person approves, revises, or rejects before any action executes." },
  { term: "Simulated", definition: "An action that is drafted/proposed but never executed against real external systems." },
  { term: "Production", definition: "Live, public-facing functionality served from the canonical deployment." },
  { term: "Production-Partial", definition: "A read-only projection that shows some but not all Production data (Executive, Operations)." },
  { term: "Guided Demo", definition: "A browser-local interactive scenario that does not modify Production state (Manager)." },
  { term: "Guardrails Lab", definition: "A testing surface for curated scenarios — it does not intercept real Production traffic." },
  { term: "Audit Chain", definition: "The immutable, verifiable record of every mission stage and decision." },
  { term: "Fallback", definition: "When NVIDIA is unavailable, the system falls back to deterministic-only operation. Labelled truthfully." },
  { term: "Decision Ledger", definition: "The structured record of all recommendations, evidence, and governance decisions." },
];
