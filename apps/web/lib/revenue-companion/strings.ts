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
    identity: "Account identity",
  },
  // Progressive-disclosure section labels. The executive brief shows the
  // narrative and one governed status line by default; the detail below is
  // available on demand so the first read stays calm and decision-first.
  disclosures: {
    supportingEvidence: "Supporting evidence",
    howGenerated: "How this briefing was generated",
    technicalProvenance: "Technical provenance",
    governedStatus: "Governed status detail",
  },
  statusHeadline: "Governed and awaiting your decision",
  providerHeading:
    "NVIDIA may only rephrase this narrative. The deterministic engine decides; NVIDIA never ranks, approves, or executes.",
  footerNote:
    "The Revenue Companion restates governed presentation state in plain language. It does not create missions, change verdicts, approve actions, execute anything, or write back to any CRM. Deterministic governance remains authoritative.",
  // Standalone-route affordance back into the full guided demo.
  openDemoLabel: "Open the full guided demo",

  // Optional voice briefing. The voice is a PRESENTATION ADAPTER: it reads the
  // exact deterministic briefing aloud and can change no governed field. These
  // labels never claim the voice decided, approved, or executed anything.
  voice: {
    sectionLabel: "Voice briefing",
    play: "Play briefing",
    preparing: "Preparing briefing…",
    pause: "Pause",
    resume: "Resume",
    replay: "Replay briefing",
    unavailable: "Voice unavailable",
    // Truthful provider truth-lines by state.
    providerLive: "Voice · Gnani text-to-speech",
    providerConfiguredPending: "Voice · Gnani configured — verification pending",
    providerUnconfigured: "Voice · Not configured — text briefing shown",
    // Status region copy (announced to assistive tech).
    statusIdle: "Voice briefing ready.",
    statusLoading: "Preparing the spoken briefing.",
    statusPlaying: "Playing the spoken briefing.",
    statusPaused: "Spoken briefing paused.",
    statusCompleted: "Spoken briefing finished.",
    statusUnavailable:
      "Spoken voice is not available. The written briefing is complete on its own.",
    statusError:
      "The spoken briefing could not be produced. The written briefing is complete on its own.",
    disclaimer:
      "The voice reads the written briefing aloud. It is a presentation adapter only — it changes no governed decision, approval, or execution, and it writes back to no CRM.",
  },
} as const;
