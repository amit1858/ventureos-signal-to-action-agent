"use client";

import * as React from "react";
import { FileCheck2 } from "lucide-react";

import type { DemoPresentationView } from "@/lib/demo-mode/presentationContract";
import { Switch } from "@/components/ui";
import { DemoSection } from "./DemoSection";
import { DEMO_STRINGS } from "@/lib/demo-mode/strings";

// Audit and replay evidence, without overwhelming the user. The replay-evidence
// toggle is OFF by default and presentation-only: it changes only what is shown,
// swapping to a separately validated view. It never re-runs anything.
export function AuditReplayPanel({
  view,
  supportsReplayToggle,
  showReplayValidated,
  onToggleReplay,
}: {
  view: DemoPresentationView;
  supportsReplayToggle: boolean;
  showReplayValidated: boolean;
  onToggleReplay: (v: boolean) => void;
}) {
  return (
    <DemoSection title="Audit & replay" headingId="demo-audit-heading">
      <div className="flex items-start gap-3">
        <FileCheck2 size={16} className="mt-0.5 shrink-0 text-gov-bright" aria-hidden="true" />
        <div className="flex-1 space-y-3">
          <div>
            <span className="section-label">Audit</span>
            <p className="mt-1 text-sm leading-relaxed text-ink">{view.auditLabel}</p>
          </div>
          <div>
            <span className="section-label">Replay</span>
            <p className="mt-1 text-sm leading-relaxed text-ink">{view.replayLabel}</p>
          </div>
          {supportsReplayToggle ? (
            <label className="flex items-start gap-3 rounded-lg border border-edge bg-surface2/50 px-3 py-2.5">
              <Switch
                checked={showReplayValidated}
                onChange={onToggleReplay}
                label={DEMO_STRINGS.replayToggleLabel}
              />
              <span className="text-xs leading-relaxed text-muted">
                <span className="font-medium text-ink">{DEMO_STRINGS.replayToggleLabel}</span>
                <br />
                {DEMO_STRINGS.replayToggleHint}
              </span>
            </label>
          ) : null}
        </div>
      </div>
    </DemoSection>
  );
}
