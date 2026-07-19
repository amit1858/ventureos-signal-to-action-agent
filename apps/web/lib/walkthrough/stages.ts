// Product Walkthrough — pure stage model (native, testable)
// =========================================================
// The single source of truth for the `/walkthrough` storytelling route. It is
// PURE (no React, no data fetching, no side effects) so the deterministic
// integration eval can verify: 13 stages present, truthful public status labels,
// correct experience links, and shared canonical Curefoods identity — without
// rendering JSX. The walkthrough READS the governed truth; it owns no mission
// logic, policy, approval, ranking, or execution.

/** Public-facing status labels permitted in the integrated release. */
export type WalkthroughStatus =
  | "Product context"
  | "Production"
  | "Production — Partial"
  | "Guided Demo"
  | "Guardrails Lab"
  | "Roadmap";

/** A link into an existing experience. Hrefs stay within this app. */
export interface WalkthroughLink {
  readonly label: string;
  readonly href: string;
}

/**
 * Framed visual evidence for a stage. `src` is an app-relative public asset
 * (never an internal filesystem path or external URL). `width`/`height` are the
 * intrinsic asset dimensions so the frame reserves a responsive aspect box and
 * avoids layout shift. TEMPORARY assets captured from the committed SHA are
 * replaced with hosted-Preview captures before public Production promotion.
 */
export interface WalkthroughVisual {
  readonly src: string;
  readonly alt: string;
  readonly caption: string;
  readonly width: number;
  readonly height: number;
}

export interface WalkthroughStage {
  readonly number: number;
  readonly id: string;
  readonly status: WalkthroughStatus;
  readonly headline: string;
  /** One or two concise sentences that set the scene. */
  readonly narrative: string;
  readonly whatHappened: string;
  readonly whyItMatters: string;
  readonly whatAiDid: string;
  /** What the deterministic VentureOS policy/engines did (authoritative). */
  readonly whatPolicyDid: string;
  readonly whatHumanControlled: string;
  /** Concrete, checkable evidence bullets (native "visual evidence"). */
  readonly evidence: readonly string[];
  readonly whatRemainsUnknown: string;
  readonly link?: WalkthroughLink;
  readonly visual?: WalkthroughVisual;
}

/** Canonical governed truth shared across every integrated surface. Read-only. */
export const WALKTHROUGH_CANONICAL = Object.freeze({
  account: "Curefoods",
  accountId: "VOS-CUREFOODS",
  portfolioAccountId: "ACC-0016",
  missionId: "M-RENEWAL-1",
  recommendationId: "REC-M-RENEWAL-1",
  template: "renewal-risk-parallel-v1",
  auditRef: "audit://M-RENEWAL-1/REC-M-RENEWAL-1",
  systemOutcome: "Governed work prepared successfully.",
  businessOutcome: "Awaiting external response.",
  nvidiaProvider: "nim",
  nvidiaModel: "nvidia/nvidia-nemotron-nano-9b-v2",
});

/** Experience links used by the walkthrough (must resolve to real routes). */
export const WALKTHROUGH_LINKS = Object.freeze({
  todaysMission: { label: "Open Today's Mission", href: "/?view=mission" },
  missionControl: { label: "Open Mission Control", href: "/mission-control" },
  managerCoaching: { label: "Open Manager Coaching", href: "/manager" },
  guardrailsLab: { label: "Open Guardrails Lab", href: "/guardrails" },
});

const C = WALKTHROUGH_CANONICAL;

export const WALKTHROUGH_STAGES: readonly WalkthroughStage[] = [
  {
    number: 1,
    id: "enterprise-problem",
    status: "Product context",
    headline: "Fragmented signals do not become governed action.",
    narrative:
      "Enterprise customer information lives in disconnected systems, and recommendations rarely carry the traceability and approval an enterprise needs before acting.",
    whatHappened:
      "Customer information is fragmented across CRMs, product usage, and support — and disconnected from execution.",
    whyItMatters:
      "Without traceability and a human approval gate, teams cannot trust an AI recommendation enough to act on it.",
    whatAiDid: "Nothing yet — this stage frames the enterprise problem VentureOS is built to solve.",
    whatPolicyDid:
      "Establishes the operating principle: every recommendation must be evidence-backed, governed, and human-approved before any action.",
    whatHumanControlled: "The human defines the governed workflow and remains the approver of any action.",
    evidence: [
      "Signals originate in separate systems (CRM, usage, support).",
      "Recommendations are often disconnected from execution and audit.",
      "Enterprise teams require traceability plus explicit approval.",
    ],
    whatRemainsUnknown: "Which specific account most needs attention today — answered next.",
  },
  {
    number: 2,
    id: "todays-priority",
    status: "Production",
    headline: "Today's priority: protect the Curefoods renewal.",
    narrative:
      `${C.account} surfaces as today's canonical mission — a renewal-protection scenario, presented honestly as a deterministic governed demo, not live customer CRM truth.`,
    whatHappened:
      `${C.account} (${C.accountId}) becomes the canonical mission ${C.missionId} under template ${C.template}.`,
    whyItMatters:
      "One clear priority replaces a noisy list — the seller starts the day on the highest-value governed action.",
    whatAiDid:
      "Composes the mission narrative and 'why now' framing; it does not invent the priority or the evidence.",
    whatPolicyDid:
      "Deterministic ranking/selection make Curefoods the canonical mission; the demo mission is labelled truthfully.",
    whatHumanControlled: "The seller chooses whether to open the governed mission.",
    evidence: [
      `Account: ${C.account} (${C.accountId})`,
      "Mission: Renewal protection · why now",
      "Label: Deterministic governed demo mission",
      "Not claimed as live customer CRM truth.",
    ],
    whatRemainsUnknown: "Whether the same identity carries into Mission Control — verified next.",
    link: WALKTHROUGH_LINKS.todaysMission,
    visual: {
      src: "/walkthrough-assets/stage-02-todays-mission.png",
      alt: "Today's Mission screen showing Curefoods renewal protection as the canonical, deterministic governed demo mission with an Open governed mission action.",
      caption: "Today's Mission surfaces Curefoods as the canonical governed demo mission.",
      width: 900,
      height: 283,
    },
  },
  {
    number: 3,
    id: "mission-continuity",
    status: "Production",
    headline: "The same mission continues into Mission Control.",
    narrative:
      "Opening the governed mission carries the exact same account, mission, and recommendation forward — nothing is re-selected or changed.",
    whatHappened:
      `Mission Control resolves the same ${C.account} account, mission ${C.missionId}, and recommendation ${C.recommendationId}.`,
    whyItMatters:
      "Continuity is the strongest trust signal: there is one shared source of truth, not a second one created downstream.",
    whatAiDid: "Presents the continued mission; it does not fork or duplicate the mission truth.",
    whatPolicyDid: "Guarantees identity continuity — the same canonical identifiers, no duplicate mission or recommendation.",
    whatHumanControlled: "The human navigates between surfaces; the mission identity stays fixed.",
    evidence: [
      `Same account: ${C.account}`,
      `Same mission: ${C.missionId}`,
      `Same recommendation: ${C.recommendationId}`,
      "Continuity cue visible · nothing re-selected.",
    ],
    whatRemainsUnknown: "Whether the recommendation is backed by real evidence — shown next.",
    link: WALKTHROUGH_LINKS.missionControl,
    visual: {
      src: "/walkthrough-assets/stage-03-mission-continuity.png",
      alt: "Mission Control persona projections showing the same governed Curefoods mission M-RENEWAL-1 read only by Seller, Executive and Operations lenses.",
      caption: "The same governed mission, read only by Seller, Executive and Operations.",
      width: 900,
      height: 272,
    },
  },
  {
    number: 4,
    id: "verified-evidence",
    status: "Production",
    headline: "Verified evidence supports the recommendation.",
    narrative:
      "Account health, renewal timeline, and usage trend are presented with explicit evidence references and a 3-of-3 verification.",
    whatHappened: "Evidence is assembled and verified (3 of 3) before the recommendation is trusted.",
    whyItMatters: "The recommendation rests on checkable evidence, not on fabricated model claims.",
    whatAiDid: "Explains the evidence in readable language; it does not fabricate the underlying facts.",
    whatPolicyDid: "Requires evidence references and verification before a recommendation can proceed.",
    whatHumanControlled: "The human can inspect every evidence reference behind the recommendation.",
    evidence: [
      "Account health · renewal timeline · usage trend",
      "Evidence references present",
      "Verification 3 of 3",
      "Evidence is not fabricated by the LLM.",
    ],
    whatRemainsUnknown: "How the explanation is grounded — the NVIDIA stage explains this.",
  },
  {
    number: 5,
    id: "nvidia-grounded",
    status: "Production",
    headline: "NVIDIA grounds the explanation — but never decides.",
    narrative:
      `A live NVIDIA NIM run (${C.nvidiaModel}) produces a grounded explanation with evidence references; deterministic VentureOS systems remain authoritative.`,
    whatHappened:
      `Live path: provider=${C.nvidiaProvider}, model=${C.nvidiaModel}, grounded=true, fallbackUsed=false, with evidence references.`,
    whyItMatters:
      "NVIDIA improves clarity of the explanation without ever selecting the account or approving/executing anything.",
    whatAiDid: "Enhances the explanation, grounded in the verified evidence.",
    whatPolicyDid: "Remains the authority for selection, approval, and execution; a truthful deterministic fallback is used if NIM is unavailable.",
    whatHumanControlled: "The human reads the grounded explanation before approving.",
    evidence: [
      `provider=${C.nvidiaProvider}`,
      `model=${C.nvidiaModel}`,
      "grounded=true · fallbackUsed=false",
      "NVIDIA does not select, approve, or execute.",
    ],
    whatRemainsUnknown: "Whether the action proceeds — that requires human approval, next.",
    visual: {
      src: "/walkthrough-assets/stage-05-nvidia-grounded.png",
      alt: "Mission Control What happened panel stating the explanation is grounded against 3 verified evidence sources, with a voice summary line.",
      caption: "The grounded explanation cites 3 verified evidence sources; NVIDIA never decides.",
      width: 900,
      height: 247,
    },
  },
  {
    number: 6,
    id: "human-approval",
    status: "Production",
    headline: "A human must approve before anything executes.",
    narrative:
      "The approval gate shows the exact action scope and requires an explicit two-step approval binding. The AI cannot approve its own action.",
    whatHappened: "Execution is blocked until a human completes the explicit two-step approval for the exact action scope.",
    whyItMatters: "The approval gate is the enforceable boundary between recommendation and action.",
    whatAiDid: "Proposes the action scope; it cannot self-approve or bypass the gate.",
    whatPolicyDid: "Enforces mandatory approval and binds approval to the exact recommendation and action scope.",
    whatHumanControlled: "The human explicitly approves (or rejects) — nothing executes before that.",
    evidence: [
      "Approval gate mandatory",
      "Exact action scope visible",
      "Two-step approval binding",
      "AI cannot approve its own action.",
    ],
    whatRemainsUnknown: "What execution looks like — it is intentionally simulated, next.",
    visual: {
      src: "/walkthrough-assets/stage-06-human-approval.png",
      alt: "Mission Control approval gate for Curefoods showing the exact action scope, verification passed, and Approve, Request revision and Reject controls.",
      caption: "Human approval is mandatory before any action; the AI cannot self-approve.",
      width: 900,
      height: 463,
    },
  },
  {
    number: 7,
    id: "simulated-execution",
    status: "Production",
    headline: "Execution is intentionally simulated.",
    narrative:
      "After approval, the email is drafted (not sent), the CRM task is proposed (not created), and the risk update is proposed (not written). Receipts are produced.",
    whatHappened: "The three actions are simulated; no external system is changed.",
    whyItMatters: "The demo proves the governed pipeline end-to-end without touching real customer systems.",
    whatAiDid: "Drafts the artifacts (email copy, task, risk note) for human review.",
    whatPolicyDid: "Holds execution in simulation-only mode and records receipts for each simulated action.",
    whatHumanControlled: "The human approved the exact scope that is now simulated.",
    evidence: [
      "Email drafted, not sent",
      "CRM task proposed, not created",
      "Risk update proposed, not written",
      "Receipts produced.",
    ],
    whatRemainsUnknown: "The customer's actual response — separated in the governed outcome, next.",
    visual: {
      src: "/walkthrough-assets/stage-07-simulated-execution.png",
      alt: "Mission Control completed simulated execution showing all three approved actions simulated in the controlled sandbox with receipts — email drafted not sent, CRM task proposed not created, risk update proposed not written.",
      caption: "After approval, all three actions are simulated in a controlled sandbox — receipts produced, nothing sent.",
      width: 900,
      height: 148,
    },
  },
  {
    number: 8,
    id: "governed-outcome",
    status: "Production",
    headline: "Governed work is complete — the customer outcome is not claimed.",
    narrative:
      `The system outcome and business outcome are deliberately separated: "${C.systemOutcome}" versus "${C.businessOutcome}".`,
    whatHappened: `System outcome: ${C.systemOutcome} Business outcome: ${C.businessOutcome}`,
    whyItMatters: "Separating system completion from business result prevents overclaiming a renewal that has not happened.",
    whatAiDid: "States the governed outcome in honest language; it claims no customer or revenue result.",
    whatPolicyDid: "Distinguishes governed completion from external business result and blocks unsupported outcome claims.",
    whatHumanControlled: "The human reads a truthful outcome, free of overclaim.",
    evidence: [
      `System: ${C.systemOutcome}`,
      `Business: ${C.businessOutcome}`,
      "No claimed renewal, revenue, or risk-reduction result.",
    ],
    whatRemainsUnknown: "Whether the customer renews — genuinely unknown, and not asserted.",
    visual: {
      src: "/walkthrough-assets/stage-08-governed-outcome.png",
      alt: "Mission Control completed governed outcome separating the system outcome, governed work prepared successfully, from the business outcome, awaiting external response, with mission M-RENEWAL-1 and its audit reference.",
      caption: "Completed: system outcome \"Governed work prepared successfully\" is separated from business \"Awaiting external response\".",
      width: 900,
      height: 296,
    },
  },
  {
    number: 9,
    id: "manager-coaching",
    status: "Guided Demo",
    headline: "Manager Coaching: where should I intervene?",
    narrative:
      "A manager-lens Guided Demo reads a deterministic post-completion snapshot of the same Curefoods mission and recommends one focused, 15-minute coaching intervention — read-only, with no authority to act.",
    whatHappened:
      "One seller needs attention; the deterministic recommendation is to coach the Curefoods renewal conversation.",
    whyItMatters: "Coaching answers a different question — where to intervene — without creating a second source of truth.",
    whatAiDid: "Frames the coaching recommendation from the same mission evidence.",
    whatPolicyDid: "Keeps Manager read-only: same canonical mission, recommendation, and audit reference; no mutation of mission state.",
    whatHumanControlled: "The manager reviews and assigns a simulated intervention; nothing is notified or written.",
    evidence: [
      "Same canonical mission — post-completion snapshot, not the live Mission Control session state",
      "15-minute coaching intervention",
      "Simulated manager action · no notification · no CRM mutation",
      "Not an enterprise-persistent workflow.",
    ],
    whatRemainsUnknown: "The coaching's real-world effectiveness — not calculated or claimed.",
    link: WALKTHROUGH_LINKS.managerCoaching,
    visual: {
      src: "/walkthrough-assets/stage-09-manager-coaching.png",
      alt: "Manager Coaching Post-mission Guided Scenario hero stating one seller needs attention on the Curefoods renewal, labelled as a completed-mission snapshot that does not read the live browser mission state.",
      caption: "Manager Coaching reads a post-completion snapshot of the same mission to recommend one 15-minute intervention.",
      width: 900,
      height: 168,
    },
  },
  {
    number: 10,
    id: "guardrails",
    status: "Guardrails Lab",
    headline: "Guardrails: what the AI cannot do.",
    narrative:
      "An isolated Guardrails Lab runs curated scenarios: safe requests are allowed, prompt injection and approval bypass are blocked, and sensitive-data requests are redacted. NVIDIA NemoGuard is telemetry only.",
    whatHappened:
      "Deterministic policy is the final decision on every scenario; NVIDIA classification is an additional, non-authoritative signal.",
    whyItMatters: "Proving what the AI cannot do — even when the classifier disagrees — is core to enterprise trust.",
    whatAiDid: "Provides NemoGuard classification telemetry; it never selects, approves, or executes.",
    whatPolicyDid: "Blocks injection and approval bypass, redacts sensitive data, and remains authoritative during provider outage.",
    whatHumanControlled: "The reviewer inspects each decision and the deterministic rail that triggered it.",
    evidence: [
      "Safe request allowed",
      "Prompt injection blocked · approval bypass blocked",
      "Sensitive-data request redacted",
      "Forced fallback: deterministic policy still applies. Curated scenarios only — not global Production interception.",
    ],
    whatRemainsUnknown: "Coverage is limited to curated scenarios; it is not a claim of total protection.",
    link: WALKTHROUGH_LINKS.guardrailsLab,
    visual: {
      src: "/walkthrough-assets/stage-10-guardrails.png",
      alt: "Guardrails Lab NVIDIA NemoGuard classification panel labelled additional telemetry, not authoritative, showing a live boolean result and a raw jailbreak score that is explicitly not a probability.",
      caption: "NVIDIA NemoGuard is additional telemetry; the raw score is not a probability.",
      width: 688,
      height: 626,
    },
  },
  {
    number: 11,
    id: "executive-operations",
    status: "Production — Partial",
    headline: "Executive and Operations read the same mission.",
    narrative:
      "The same Curefoods mission is projected for different personas — an Executive read-only outcome and an Operations health/audit view — without any persona creating a second source of truth.",
    whatHappened: "One shared mission is viewed through role-specific projections.",
    whyItMatters: "Personas align on one governed truth rather than diverging into separate versions.",
    whatAiDid: "Renders role-appropriate summaries of the same mission.",
    whatPolicyDid: "Guarantees one shared mission truth across all persona projections.",
    whatHumanControlled: "Each persona reads the projection relevant to their role.",
    evidence: [
      "Same mission across personas",
      "Executive: read-only governed outcome",
      "Operations: health and audit",
      "No persona creates a second source of truth.",
    ],
    whatRemainsUnknown: "Some persona projections are partial in this release.",
  },
  {
    number: 12,
    id: "audit-trust",
    status: "Production",
    headline: "Audit proves what actually happened.",
    narrative:
      "A canonical audit reference ties approval, simulation, and outcome into a valid chain; idempotent replay does not grow the ledger and there is no hidden execution.",
    whatHappened: `The canonical audit reference ${C.auditRef} anchors a valid, replay-safe audit chain.`,
    whyItMatters: "Auditability is what lets an enterprise trust that only the approved, simulated work occurred.",
    whatAiDid: "Nothing that mutates the audit — the AI has no write authority over the ledger.",
    whatPolicyDid: "Maintains a valid audit chain and idempotent replay with no duplicate ledger growth.",
    whatHumanControlled: "The human can trace approval → simulation → outcome against the canonical reference.",
    evidence: [
      `Canonical audit reference: ${C.auditRef}`,
      "Approval · simulation · outcome — chain valid",
      "Idempotent replay · no hidden execution",
    ],
    whatRemainsUnknown: "Nothing about the governed run — the chain is complete and checkable.",
  },
  {
    number: 13,
    id: "what-is-next",
    status: "Roadmap",
    headline: "What's next: Voice and Digital Human as presentation adapters.",
    narrative:
      "Voice Companion is Planned and a Digital Human is a Future direction. Both are presentation adapters only — intelligence and governance remain unchanged beneath them.",
    whatHappened: "The roadmap adds presentation adapters, not new authority.",
    whyItMatters: "New surfaces must adapt around the governed core — they never own business logic, approval, or execution.",
    whatAiDid: "Would speak or present the same governed truth through a new adapter.",
    whatPolicyDid: "Remains the single authority regardless of the presentation surface.",
    whatHumanControlled: "The human still approves every action, whatever the interface.",
    evidence: [
      "Voice Companion: Planned",
      "Digital Human: Future",
      "Presentation adapters only — governance unchanged.",
    ],
    whatRemainsUnknown: "Delivery timing for Voice and Digital Human.",
  },
];

/** Convenience: total stage count (contract expects 13). */
export const WALKTHROUGH_STAGE_COUNT = WALKTHROUGH_STAGES.length;
