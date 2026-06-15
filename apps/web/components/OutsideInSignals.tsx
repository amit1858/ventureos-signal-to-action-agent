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
  Quote,
  ChevronDown,
} from "lucide-react";
import type {
  ExternalSignal,
  ExternalSignalsResult,
  ExternalSource,
} from "@/lib/types";
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

function confTone(c: string): string {
  const v = (c || "").toLowerCase();
  if (v === "high") return "border-accent/30 bg-accent/5 text-accent";
  if (v === "low") return "border-amber/30 bg-amber/5 text-amber";
  return "border-edge bg-surface text-muted";
}

function modeBadge(mode?: string): { label: string; cls: string } | null {
  if (!mode) return null;
  if (mode === "live") return { label: "Live", cls: "border-accent/30 bg-accent/5 text-accent" };
  if (mode === "fallback") return { label: "Illustrative", cls: "border-amber/30 bg-amber/5 text-amber" };
  return { label: "Demo context", cls: "border-edge bg-surface text-faint" };
}

/** A labelled narrative line in the fusion brief. */
function BriefLine({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-wider text-faint">{label}</div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function SourceRow({ s }: { s: ExternalSource }) {
  const date = fmtDate(s.published_at);
  const body = (
    <span className="min-w-0 flex-1 truncate">
      {s.title}
      {s.source ? <span className="text-faint"> · {s.source}</span> : null}
      {date ? <span className="text-faint"> · {date}</span> : null}
    </span>
  );
  return (
    <li className="flex items-center gap-1.5 text-[10px] leading-relaxed text-faint">
      <Newspaper size={9} className="shrink-0" />
      {s.url ? (
        <a
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 flex-1 items-center gap-1 transition-colors hover:text-muted"
        >
          {body}
          <ExternalLink size={9} className="shrink-0" />
        </a>
      ) : (
        body
      )}
    </li>
  );
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
 * Outside-In Intelligence: an Executive Intelligence Fusion brief that combines
 * the account's internal CRM trajectory with public/external context. Rendered
 * deliberately *secondary* to internal HubSpot evidence and always caveated.
 * Returns null when the layer is disabled or empty, so the existing workspace is
 * unchanged when external signals are off. Explanatory only — it never changes
 * ranking, scoring, governance, confidence or CRM write-back.
 */
export function OutsideInSignals({
  data,
  loading,
}: {
  data: ExternalSignalsResult | null;
  loading?: boolean;
}) {
  const [showSignals, setShowSignals] = React.useState(false);

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
  if (!data || !data.enabled) return null;
  const brief = data.brief ?? null;
  if (!brief && data.signals.length === 0) return null;

  const sources = (data.sources && data.sources.length ? data.sources : brief?.sources) ?? [];
  const mode = modeBadge(data.provider_mode);

  return (
    <div className="rounded-xl border border-dashed border-edge bg-surface2/30 p-3">
      {/* Header — clearly framed as secondary, supporting intelligence */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-brand-bright" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Outside-In Intelligence
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {mode ? (
            <span
              className={cx(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                mode.cls,
              )}
            >
              {mode.label}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-full border border-edge bg-surface px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
            <Info size={9} /> External context only
          </span>
        </div>
      </div>

      {brief ? (
        <>
          {/* Lead — the fused executive insight */}
          <div className="mt-2.5 rounded-lg border border-brand/25 bg-brand/5 p-2.5">
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-brand-bright">
                What this means
              </span>
              <span
                className={cx(
                  "rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                  confTone(brief.confidence),
                )}
              >
                Confidence {brief.confidence}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-ink">{brief.fused_insight}</p>
          </div>

          {/* Narrative breakdown */}
          <div className="mt-2.5 space-y-2">
            <BriefLine label="What changed outside the CRM">{brief.external_summary}</BriefLine>
            <BriefLine label="Why it matters">{brief.business_implication}</BriefLine>
            <BriefLine label="Seller implication">{brief.seller_implication}</BriefLine>
            <BriefLine label="Suggested conversation strategy">
              {brief.recommended_conversation_strategy}
            </BriefLine>
          </div>

          {/* Suggested opening line — styled as a quotable line */}
          {brief.suggested_opening_line ? (
            <div className="mt-2.5 rounded-lg border border-edge bg-surface/60 p-2.5">
              <div className="mb-0.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                <Quote size={10} /> Suggested opening line
              </div>
              <p className="text-[11px] italic leading-relaxed text-muted">
                “{brief.suggested_opening_line}”
              </p>
            </div>
          ) : null}
        </>
      ) : (
        // Backward-compatible fallback: signals + takeaway (no fusion brief present)
        <>
          <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
            Public context that may affect this account. Supporting only — it never changes ranking,
            scoring, governance or CRM write-back.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {data.signals.map((s, i) => (
              <SignalRow key={`${s.title}-${i}`} s={s} />
            ))}
          </ul>
          {data.seller_takeaway ? (
            <div className="mt-2.5 rounded-lg border border-brand/25 bg-brand/5 p-2.5">
              <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-brand-bright">
                Seller takeaway
              </div>
              <p className="text-[11px] leading-relaxed text-muted">{data.seller_takeaway}</p>
            </div>
          ) : null}
        </>
      )}

      {/* Sources */}
      {sources.length ? (
        <div className="mt-2.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-faint">Sources</div>
          <ul className="mt-1 space-y-1">
            {sources.map((s, i) => (
              <SourceRow key={`${s.title}-${i}`} s={s} />
            ))}
          </ul>
        </div>
      ) : null}

      {/* Supporting evidence (the raw external signals) — collapsed by default to keep it calm */}
      {brief && data.signals.length ? (
        <div className="mt-2.5">
          <button
            type="button"
            onClick={() => setShowSignals((v) => !v)}
            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-faint transition-colors hover:text-muted"
            aria-expanded={showSignals}
          >
            <ChevronDown
              size={11}
              className={cx("transition-transform", showSignals && "rotate-180")}
            />
            {showSignals ? "Hide" : "Show"} supporting signals ({data.signals.length})
          </button>
          {showSignals ? (
            <ul className="mt-1.5 space-y-1.5">
              {data.signals.map((s, i) => (
                <SignalRow key={`${s.title}-${i}`} s={s} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Caveat footnote + provenance */}
      <div className="mt-2.5 flex items-start gap-1.5 text-[9px] leading-relaxed text-faint">
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
