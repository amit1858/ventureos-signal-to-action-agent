// VentureOS — AI Assurance · Page copy (single source of user-visible strings)
// ============================================================================
// Static, truthful copy for the `/assurance` screen. Kept in one module so the
// eval tests can assert wording without rendering. Nothing here overstates: NVIDIA
// is described as advisory, the deterministic engine as authoritative, execution
// as simulated, and the environment truthfully (live vs synthetic vs deterministic
// vs fallback).

export const assuranceStrings = {
  bannerLabel: "AI Assurance",
  title: "AI Assurance",
  intro:
    "How VentureOS proves its governed decisions are correct, grounded, and safe. " +
    "The deterministic engine is authoritative; NVIDIA is advisory only and can never " +
    "override a governed gate, decide, approve, or execute.",
  sections: {
    overall: {
      title: "Overall readiness",
      subtitle: "The single readiness verdict, rolled up from every deterministic gate.",
    },
    gates: {
      title: "Deterministic gates",
      subtitle:
        "Each assurance dimension is decided by the real deterministic engine. This verdict is authoritative.",
    },
    nvidia: {
      title: "NVIDIA advisory evaluation",
      subtitle:
        "Advisory only. NVIDIA annotates; it never sets or overrides a verdict. Deterministic-first, server-only, fail-closed.",
    },
    human: {
      title: "Human review",
      subtitle: "Which dimensions require a human sign-off before they are considered closed.",
    },
    evidence: {
      title: "Synthetic evidence",
      subtitle:
        "A deterministic synthetic corpus of fictional accounts, each realized against the real engine. No customer data is used.",
    },
    runtime: {
      title: "Runtime verification",
      subtitle:
        "Live, secret-free verification of the NVIDIA runtime posture and always-on safety invariants.",
    },
    regression: {
      title: "Regression history",
      subtitle: "The validated suite baseline. Structured for future dated entries.",
    },
  },
  labels: {
    advisory: "Advisory",
    authoritative: "Authoritative",
    deterministic: "Deterministic",
    synthetic: "Synthetic",
    live: "Live",
    fallback: "Deterministic fallback",
    notConfigured: "Not configured",
    simulated: "Simulated execution",
    noWriteBack: "No CRM write-back",
  },
} as const;
