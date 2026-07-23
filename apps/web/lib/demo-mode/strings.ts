// VentureOS — Demo Mode · Static chrome strings
// =============================================
// All fixed presenter chrome copy lives here so eval tests can scan it for
// forbidden claims without rendering JSX. Journey-specific copy always comes
// from the generated view model, never from this file.

export const DEMO_STRINGS = {
  eyebrow: "VentureOS · Signal-to-Action",
  title: "Governed Signal-to-Action Demo",
  intro:
    "One signal, one mission, one governed outcome. Experience VentureOS using deterministic demo data — two validated governed journeys, rendered read-only from committed results. This walkthrough demonstrates governed AI decision-making. No customer data is used. No CRM actions are performed. No live systems are modified.",
  bannerLabel: "Interactive Product Demonstration — read-only presentation of governed results",
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
  // Guided-flow chrome. The walkthrough steps through the SAME committed result
  // one beat at a time; these labels never assert anything about the outcome.
  guided: {
    openingTitle: "Take the guided walkthrough",
    openingIntro:
      "Step through one governed journey one beat at a time — from the signal that changed to the final audited record. Nothing runs live; each step reveals part of the same committed result.",
    stagePrefix: "Step",
    railLabel: "Walkthrough progress",
    start: "Start walkthrough",
    next: "Next",
    back: "Back",
    finish: "Finish",
    restart: "Restart",
    switchHint: "Switch the journey above to walk through the other outcome.",
    completeTitle: "Walkthrough complete",
    completeBody:
      "You have seen the full governed journey, from signal to audited record. Restart to watch it again, or switch journeys above.",
  },
} as const;
