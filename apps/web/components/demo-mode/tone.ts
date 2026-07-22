// VentureOS — Demo Mode · Presentational tone helpers (pure, no JSX)
// ==================================================================
// Maps governed status tones and safety labels to visual treatments. Kept as a
// pure module so eval tests can assert the mapping without rendering components.
// Status is never conveyed by colour alone — every tone also carries a word.

export type StatusTone = "success" | "caution" | "critical" | "neutral";

export function normalizeStatusTone(tone: string): StatusTone {
  switch (tone) {
    case "success":
      return "success";
    case "caution":
    case "warning":
      return "caution";
    case "critical":
    case "danger":
      return "critical";
    default:
      return "neutral";
  }
}

// A short, non-colour-only word that accompanies each tone for accessibility.
export function statusToneWord(tone: string): string {
  switch (normalizeStatusTone(tone)) {
    case "success":
      return "Governed outcome";
    case "caution":
      return "Attention";
    case "critical":
      return "Blocked";
    default:
      return "Status";
  }
}

export function statusToneChipClass(tone: string): string {
  switch (normalizeStatusTone(tone)) {
    case "success":
      return "border-gov/40 bg-gov/10 text-gov-bright";
    case "caution":
      return "border-amber/45 bg-amber/10 text-brand-bright";
    case "critical":
      return "border-risk/45 bg-risk/10 text-risk";
    default:
      return "border-edge bg-surface2 text-muted";
  }
}

// Safety labels are classified for styling. "Cautionary" labels (governed stop,
// single-source, no CRM write-back, unconfigured provider, simulated) are shown
// with a distinct treatment from affirmative ones.
const CAUTION_LABELS: ReadonlySet<string> = new Set([
  "Single-source identity",
  "Governed stop",
  "No CRM write-back",
  "NVIDIA unconfigured",
  "Not live multi-source execution",
  "Deterministic fallback",
  "Simulated execution",
]);

export function safetyLabelChipClass(label: string): string {
  if (CAUTION_LABELS.has(label)) {
    return "border-amber/45 bg-amber/10 text-brand-bright";
  }
  return "border-gov/40 bg-gov/10 text-gov-bright";
}
