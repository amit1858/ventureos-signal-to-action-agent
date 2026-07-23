// VentureOS — Revenue Companion · Static chrome strings
// =====================================================
// All fixed presenter chrome copy lives here so eval tests can scan it for
// forbidden claims without rendering JSX. Journey-specific copy always comes
// from the generated companion view model, never from this file.
//
// The Revenue Companion is a conversational RESTATEMENT of governed presentation
// state. The chrome copy below never asserts an outcome; it only frames the
// narrative and states, truthfully, what the companion is and is not.

export const COMPANION_STRINGS = {
  eyebrow: "VentureOS · Revenue Companion",
  title: "Revenue Companion",
  // The companion "speaks first": a short, plain-language framing.
  intro:
    "A plain-language read of one governed journey — what changed, why it matters, and the one governed next step. This is a narrative view of already-decided results. It creates nothing, approves nothing, and executes nothing.",
  bannerLabel: "Revenue Companion — narrative view of governed results",
  sections: {
    whatChanged: "What changed",
    whyItMatters: "Why it matters",
    recommendation: "Recommended next step",
    evidence: "Evidence",
    status: "Where it stands",
    provider: "Narrative provider",
    safety: "Safety labels",
  },
  providerHeading:
    "NVIDIA may only rephrase this narrative. The deterministic engine decides; NVIDIA never ranks, approves, or executes.",
  footerNote:
    "The Revenue Companion restates governed presentation state in plain language. It does not create missions, change verdicts, approve actions, execute anything, or write back to any CRM. Deterministic governance remains authoritative.",
  // Standalone-route affordance back into the full guided demo.
  openDemoLabel: "Open the full guided demo",
} as const;
