// Phase 15A — Adaptive Experience Modes.
//
// Persisted view preference that toggles top-level section visibility
// across the Command Center. Pure UI / IA layer — never touches data,
// ranking, recommendations, governance, approvals, ledger, agents, or
// the backend.

"use client";

import { useEffect, useState } from "react";

export type ExperienceMode = "executive" | "seller" | "operations";

export const EXPERIENCE_MODES: ExperienceMode[] = ["executive", "seller", "operations"];

export const MODE_LABEL: Record<ExperienceMode, string> = {
  executive: "Executive",
  seller: "Seller",
  operations: "Operations",
};

export const MODE_TAGLINE: Record<ExperienceMode, string> = {
  executive: "What needs attention?",
  seller: "What should I do next?",
  operations: "How is the system operating?",
};

export const MODE_DESCRIPTION: Record<ExperienceMode, string> = {
  executive: "Portfolio overview and prioritization",
  seller: "Account execution and outreach",
  operations: "System monitoring and governance",
};

// Top-level section keys gated by experience mode. Sub-section accordions
// (Phase 15B/15C) remain owned by their own components.
export type SectionKey =
  | "chiefOfStaff"           // ChiefOfStaffNarrativeCard hero
  | "attentionBrief"         // Phase 15B Executive Attention Brief
  | "dailyBriefing"          // ExecutiveDailyBriefingPanel
  | "portfolioPulse"         // PortfolioPulseBar (Executive Snapshot)
  | "executiveChangeBrief"   // ExecutiveChangeBriefPanel
  | "deltaCompact"           // RecommendationDeltaCompact
  | "workbench"              // Work Queue + Account Workspace
  | "portfolioIntelligence"  // drift, timeline, external changes, rankings, matrix, health, trends
  | "trustGovernance";       // workflow rail, ledger, manager, CRM readiness

export const VISIBILITY: Record<ExperienceMode, Record<SectionKey, boolean>> = {
  // Executive: leadership-facing portfolio overview + drill-down to top
  // accounts. Hides operational/technical surfaces (governance internals,
  // drift analytics, delta tracking, dataset/CRM admin).
  executive: {
    chiefOfStaff:          true,
    attentionBrief:        true,
    dailyBriefing:         true,
    portfolioPulse:        true,
    executiveChangeBrief:  true,
    deltaCompact:          false,
    workbench:             true,   // Top 5 actions + Open Account drill-down
    portfolioIntelligence: false,
    trustGovernance:       false,
  },
  // Seller: account execution surface. Retains compact strategic context
  // (CoS + Daily Brief + Pulse + Change Brief) so the seller still
  // understands "what changed and why this account matters" before they
  // open the workbench.
  seller: {
    chiefOfStaff:          true,
    attentionBrief:        true,   // Collapsed by default — see MODE_DEFAULT_OPEN
    dailyBriefing:         true,
    portfolioPulse:        true,
    executiveChangeBrief:  true,
    deltaCompact:          false,
    workbench:             true,
    portfolioIntelligence: false,
    trustGovernance:       false,
  },
  // Operations: full technical surface preserved.
  operations: {
    chiefOfStaff:          true,
    attentionBrief:        false,  // Operations work the underlying ledger, not the executive narrative
    dailyBriefing:         true,
    portfolioPulse:        true,
    executiveChangeBrief:  true,
    deltaCompact:          true,
    workbench:             true,
    portfolioIntelligence: true,
    trustGovernance:       true,
  },
};

// Phase 15B — Default open/closed state for progressive-disclosure
// accordions, per mode. Used as the initial value before any persisted
// user choice overrides it. Sections not listed default to `true`.
export const MODE_DEFAULT_OPEN: Record<ExperienceMode, Partial<Record<SectionKey, boolean>>> = {
  // Executive sees the strategic spine open by default.
  executive: {
    attentionBrief:        true,
    portfolioPulse:        true,
    executiveChangeBrief:  true,
    deltaCompact:          false,
  },
  // Seller lands focused on action — intelligence accordions start collapsed.
  seller: {
    attentionBrief:        false,
    portfolioPulse:        false,
    executiveChangeBrief:  false,
    deltaCompact:          false,
  },
  // Operations sees everything open by default (preserves current behavior).
  operations: {
    attentionBrief:        false,
    portfolioPulse:        true,
    executiveChangeBrief:  true,
    deltaCompact:          true,
  },
};

export function isOpenByDefault(mode: ExperienceMode, key: SectionKey): boolean {
  const override = MODE_DEFAULT_OPEN[mode][key];
  return override === undefined ? true : override;
}

const STORAGE_KEY = "s2a_experience_mode_v1";
const EVENT_NAME = "s2a:experience-mode:changed";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadExperienceMode(): ExperienceMode {
  if (!isBrowser()) return "executive";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "executive" || raw === "seller" || raw === "operations") return raw;
  } catch {
    /* fall through */
  }
  return "executive";
}

export function saveExperienceMode(mode: ExperienceMode, previous?: ExperienceMode): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
    // Lightweight frontend-only analytics event. No backend, no SDK.
    if (previous && previous !== mode) {
      const payload = {
        previous_mode: previous,
        new_mode: mode,
        timestamp: new Date().toISOString(),
      };
      window.dispatchEvent(new CustomEvent("experience_mode_changed", { detail: payload }));
      if (typeof console !== "undefined" && console.info) {
        console.info("[analytics] experience_mode_changed", payload);
      }
    }
  } catch {
    /* quota */
  }
}

/** React hook that reads + persists the active experience mode. */
export function useExperienceMode(): [ExperienceMode, (m: ExperienceMode) => void] {
  // Default to executive on the server render to avoid layout flicker on
  // first paint; rehydrate from localStorage on mount.
  const [mode, setMode] = useState<ExperienceMode>("executive");

  useEffect(() => {
    setMode(loadExperienceMode());
    const onChange = () => setMode(loadExperienceMode());
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);

  const update = (next: ExperienceMode) => {
    setMode((prev) => {
      saveExperienceMode(next, prev);
      return next;
    });
  };

  return [mode, update];
}

/** Helper for callers to ask "should this section render in the current mode?". */
export function isSectionVisible(mode: ExperienceMode, key: SectionKey): boolean {
  return VISIBILITY[mode][key];
}
