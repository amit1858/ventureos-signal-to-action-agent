"use client";

// FeedbackCopy — copyable structured tester-feedback block
// ========================================================
// Presentation only. Builds a plain-text feedback form from the canonical
// FEEDBACK_FIELDS and copies it to the clipboard so a tester can paste it into
// email or an issue. No backend submission; nothing leaves the browser except
// via the tester's own paste.

import * as React from "react";
import { Copy, Check } from "lucide-react";

function buildPlainTemplate(heading: string, fieldLabels: readonly string[]): string {
  const lines: string[] = [];
  lines.push(`${heading} — Tester Feedback`);
  lines.push("");
  for (const label of fieldLabels) {
    lines.push(`${label}:`);
  }
  lines.push("");
  lines.push("Per-defect (repeat as needed):");
  lines.push("Severity (P0/P1/P2): ");
  lines.push("Route: ");
  lines.push("Action taken: ");
  lines.push("Expected result: ");
  lines.push("Actual result: ");
  lines.push("Screenshot filename: ");
  return lines.join("\n");
}

export function FeedbackCopy({
  heading,
  templatePath,
  fieldLabels,
}: {
  heading: string;
  templatePath: string;
  fieldLabels: readonly string[];
}) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = async () => {
    const text = buildPlainTemplate(heading, fieldLabels);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" onClick={onCopy} className="btn btn-outline-primary">
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? "Copied to clipboard" : "Copy feedback template"}
      </button>
      <a href={templatePath} download className="btn btn-ghost">
        Download .md template
      </a>
    </div>
  );
}
