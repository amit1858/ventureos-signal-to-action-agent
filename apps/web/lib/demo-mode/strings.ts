// VentureOS — Demo Mode · Static chrome strings
// =============================================
// All fixed presenter chrome copy lives here so eval tests can scan it for
// forbidden claims without rendering JSX. Journey-specific copy always comes
// from the generated view model, never from this file.

export const DEMO_STRINGS = {
  eyebrow: "VentureOS · Signal-to-Action",
  title: "Governed Signal-to-Action Demo",
  intro:
    "One signal, one mission, one governed outcome. This is an internal demo of two validated governed journeys, rendered read-only from committed results. No live CRM change is made.",
  bannerLabel: "Internal demo — read-only presentation of governed results",
  selectorLabel: "Journey",
  sections: {
    narrative: "What the AI says",
    recommendation: "Recommended next step",
    governance: "Governance outcome",
    evidence: "Evidence chain",
    approval: "Approval",
    execution: "Execution",
    audit: "Audit & replay",
    provider: "Explanation provider",
    safety: "Safety labels",
    technical: "Technical disclosure",
  },
  replayToggleLabel: "Show separately validated replay evidence",
  replayToggleHint:
    "Off by default. When on, this shows separately validated replay evidence for the controlled journey. It changes only what is displayed.",
  technicalToggleLabel: "Show technical details",
  providerHeading: "NVIDIA is an explanation provider, not the decision authority.",
  footerNote:
    "Deterministic governance is authoritative. NVIDIA explains only and cannot rank, prioritise, approve, or execute. No CRM write-back occurs in this demo.",
} as const;
