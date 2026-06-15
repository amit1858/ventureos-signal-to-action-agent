"use client";

import * as React from "react";
import {
  Globe,
  ExternalLink,
  AlertTriangle,
  TrendingUp,
  Minus,
  Info,
  Newspaper,
} from "lucide-react";
import type { ExternalSignal, ExternalSignalsResult } from "@/lib/types";
import { cx } from "@/lib/format";

function impactTone(impact: string): { text: string; chip: string; Icon: typeof Minus; label: string } {
  if (impact === "negative")
    return { text: "text-amber", chip: "border-amber/30 bg-amber/5", Icon: AlertTriangle, label: "Headwind" };
  if (impact === "positive")
    return { text: "text-accent", chip: "border-accent/30 bg-accent/5", Icon: TrendingUp, label: "Tailwind" };
  return { text: "text-faint", chip: "border-edge bg-surface2/60", Icon: Minus, label: "Context" };
}

function typeLabel(t: string): string {
  return (t || "").replace(/_/g, " ");
}

function fmtDate(d?: string | null): string | null {
  if (!d) return null;
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function SignalRow({ s }: { s: ExternalSignal }) {
  const tone = impactTone(s.impact);
  const date = fmtDate(s.published_at);
  return (
    <li className="rounded-lg border border-edge bg-surface/60 p-2.5">
      <div className="flex items-start gap-2">
        <tone.Icon size={13} className={cx("mt-0.5 shrink-0", tone.text)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] font-semibold leading-snug text-ink">{s.title}</p>
            {s.url ? (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 shrink-0 text-faint transition-colors hover:text-muted"
                title="Open source"
                aria-label="Open source"
              >
                <ExternalLink size={12} />
              </a>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{s.summary}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] uppercase tracking-wider text-faint">
            <span className={cx("rounded border px-1.5 py-0.5 font-semibold", tone.chip, tone.text)}>
              {typeLabel(s.signal_type)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Newspaper size={9} /> {s.source}
            </span>
            {date ? <span>{date}</span> : null}
            <span>conf {s.confidence}</span>
            <span>rel {s.relevance}</span>
          </div>
          {s.seller_takeaway ? (
            <p className="mt-1.5 text-[10px] italic leading-relaxed text-faint">{s.seller_takeaway}</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * Outside-In signals: public/external supporting context for the selected
 * account. Deliberately rendered *secondary* to internal HubSpot evidence and
 * always caveated. Returns null when the layer is disabled or empty, so the
 * existing workspace is unchanged when external signals are off.
 */
export function OutsideInSignals({
  data,
  loading,
}: {
  data: ExternalSignalsResult | null;
  loading?: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="rounded-xl border border-dashed border-edge bg-surface2/30 p-3">
        <div className="flex items-center gap-2 text-[11px] text-faint">
          <Globe size={13} className="animate-pulse" /> Gathering external context…
        </div>
      </div>
    );
  }

  // Hidden entirely when the layer is off or there is nothing to show.
  if (!data || !data.enabled || data.signals.length === 0) return null;

  return (
    <div className="rounded-xl border border-dashed border-edge bg-surface2/30 p-3">
      {/* Header — clearly framed as secondary, supporting context */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-brand-bright" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Outside-In signals
          </span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-edge bg-surface px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
          <Info size={9} /> External context only
        </span>
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
        Public context that may affect this account. Supporting only — it never changes ranking,
        scoring, governance or CRM write-back.
      </p>

      {/* External context bullets (the signals) */}
      <ul className="mt-2.5 space-y-1.5">
        {data.signals.map((s, i) => (
          <SignalRow key={`${s.title}-${i}`} s={s} />
        ))}
      </ul>

      {/* Overall seller takeaway — hedged language */}
      {data.seller_takeaway ? (
        <div className="mt-2.5 rounded-lg border border-brand/25 bg-brand/5 p-2.5">
          <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-brand-bright">
            Seller takeaway
          </div>
          <p className="text-[11px] leading-relaxed text-muted">{data.seller_takeaway}</p>
        </div>
      ) : null}

      {/* Caveat footnote + provenance */}
      <div className="mt-2 flex items-start gap-1.5 text-[9px] leading-relaxed text-faint">
        <AlertTriangle size={10} className="mt-0.5 shrink-0 text-amber/80" />
        <span>
          {data.caveat}
          {data.provider ? <span className="ml-1 opacity-80">· Source: {data.provider} provider</span> : null}
          {data.cached ? <span className="opacity-80"> · cached</span> : null}
        </span>
      </div>
    </div>
  );
}
