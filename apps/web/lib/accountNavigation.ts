"use client";

import type { ExperienceMode } from "@/lib/experienceMode";

export type AccountOpenPreferredSection =
  | "overview"
  | "conversationPrep"
  | "emailDraft"
  | "crmUpdate"
  | "evidence"
  | "timeline"
  | "evolution"
  | "reasoning"
  | "intelligence"
  // Backward-compatible aliases used by older click handlers.
  | "prep"
  | "email"
  | "crm";

export type WorkspaceSectionTarget =
  | "overview"
  | "prep"
  | "email"
  | "crm"
  | "evidence"
  | "timeline"
  | "evolution"
  | "reasoning"
  | "intelligence";

export interface OpenAccountFromSurfaceInput {
  accountId: string;
  source: string;
  preferredSection?: AccountOpenPreferredSection;
  mode?: ExperienceMode;
}

export function normalizePreferredSection(
  section?: AccountOpenPreferredSection | null,
): WorkspaceSectionTarget | undefined {
  if (!section) return undefined;
  switch (section) {
    case "conversationPrep":
      return "prep";
    case "emailDraft":
      return "email";
    case "crmUpdate":
      return "crm";
    default:
      return section;
  }
}
