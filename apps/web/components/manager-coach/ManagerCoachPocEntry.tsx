// Manager Coach — POC entry card.
//
// A clearly-labelled, experimental entry rendered inside the Manager persona
// surface (above the existing AI Sales Director coaching experience). It only
// links to the dedicated POC route; it loads NO Soul Machines resources itself.
// When the POC flag is disabled it renders nothing, so existing Manager flows
// are byte-identical.

"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, FlaskConical, Sparkles } from "lucide-react";

import { Card } from "@/components/ui";
import {
  POC_ROUTE,
  PERSONA_NAME,
  isSoulMachinesPocEnabled,
} from "@/lib/soul-machines/config";

export function ManagerCoachPocEntry() {
  if (!isSoulMachinesPocEnabled()) return null;

  return (
    <Card className="border-dashed">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            <h3 className="text-sm font-semibold text-ink">Manager Coach</h3>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
              <FlaskConical className="h-3 w-3" aria-hidden />
              POC · Experimental
            </span>
          </div>
          <p className="max-w-prose text-[13px] leading-relaxed text-muted">
            Preview the {PERSONA_NAME} as a Soul Machines Digital Person. This is
            an isolated presentation experiment — it does not change any coaching,
            ranking, governance or approval logic.
          </p>
        </div>

        <Link
          href={POC_ROUTE}
          className="btn-outline-primary inline-flex shrink-0 items-center gap-1.5 text-sm"
        >
          Open Manager Coach
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}
