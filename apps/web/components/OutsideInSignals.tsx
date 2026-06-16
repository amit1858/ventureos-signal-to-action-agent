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
  ScrollText,
  Sparkles,
  Building2,
  Target,
  ListChecks,
  ClipboardList,
  ShieldAlert,
  CalendarClock,
} from "lucide-react";
import type {
  CRMWritebackRecommendation,
  ExecutiveBrief,
  ExternalSignal,
  ExternalSignalsResult,
  ExternalSource,
  InternalEvidenceItem,
} from "@/lib/types";
import { cx } from "@/lib/format";

function impactTone(impact: string): { text: string; chip: string; Icon: typeof Minus; label: string } {
  if (impact === "negative")
    return { text: "text-amber", chip: "border-amber/30 bg-amber/5", Icon: AlertTriangle, label: "Headwind" };
  if (impact === "positive")
    return { text: "text-accent", chip: "border-accent/30 bg-accent/5", Icon: TrendingUp, label: "Tailwind" };
  return { text: "text-faint", chip: "border-edge bg-surface2/60", Icon: Minus, label: "Context" };
}

function toneDot(tone: string): string {
  if (tone === "negative") return "bg-amber";
  if (tone === "positive") return "bg-accent";
  return "bg-faint/50";
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

function priorityTone(p: string): string {
  const v = (p || "").toLowerCase();
  if (v === "high") return "border-amber/40 bg-amber/10 text-amber";
  if (v === "low") return "border-edge bg-surface text-faint";
  return "border-brand/30 bg-brand/5 text-brand-bright";
}

function modeBadge(mode?: string): { label: string; cls: string } | null {
  if (!mode) return null;
  if (mode === "live") return { label: "Live", cls: "border-accent/30 bg-accent/5 text-accent" };
  if (mode === "fallback") return { label: "Illustrative", cls: "border-amber/30 bg-amber/5 text-amber" };
  return { label: "Demo context", cls: "border-edge bg-surface text-faint" };
}

/** A small labelled block with an icon — the building block of the brief. */
function Block({
  icon: Icon,
  label,
  aside,
  children,
}: {
  icon: typeof Globe;
  label: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon size={11} className="shrink-0 text-faint" />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-faint">{label}</span>
        {aside ? <span className="ml-auto">{aside}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** A plain prose line used by several brief sections. */
function Prose({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-[11px] leading-relaxed text-muted">{children}</p>;
}

function InternalEvidenceGrid({ items }: { items: InternalEvidenceItem[] }) {
  return (
    <ul className="grid grid-cols-2 gap-1.5">
      {items.map((it, i) => (
        <li key={`${it.label}-${i}`} className="rounded-lg border border-edge bg-surface/60 px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", toneDot(it.tone))} />
            <span className="truncate text-[9px] uppercase tracking-wider text-faint">{it.label}</span>
          </div>
          <div className="mt-0.5 pl-3 text-[11px] font-semibold text-ink">{it.value}</div>
        </li>
      ))}
    </ul>
  );
}

function CrmWriteback({ wb }: { wb: CRMWritebackRecommendation }) {
  const [open, setOpen] = React.useState(false);
  const t = wb.task;
  return (
    <Block
      icon={ClipboardList}
      label="Recommended CRM write-back"
      aside={
        <span className="inline-flex items-center gap-1 rounded-full border border-edge bg-surface px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-faint">
          Draft · needs approval
        </span>
      }
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-lg border border-edge bg-surface/60 px-2.5 py-1.5 text-left transition-colors hover:border-brand/30"
        aria-expanded={open}
      >
        <ChevronDown size={11} className={cx("shrink-0 text-faint transition-transform", open && "rotate-180")} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted">{t.title}</span>
        <span
          className={cx(
            "shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider",
            priorityTone(t.priority),
          )}
        >
          {t.priority}
        </span>
      </button>

      {open ? (
        <div className="mt-1.5 space-y-2 rounded-lg border border-edge bg-surface/40 p-2.5">
          {/* CRM Task */}
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-faint">CRM task</div>
            <p className="mt-0.5 text-[11px] font-semibold text-ink">{t.title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{t.description}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] uppercase tracking-wider text-faint">
              <span className="inline-flex items-center gap-1">
                <Target size={9} /> {t.priority} priority
              </span>
              <span className="inline-flex items-center gap-1">
                <Building2 size={9} /> {t.owner}
              </span>
              {t.suggested_due_date ? (
                <span className="inline-flex items-center gap-1">
                  <CalendarClock size={9} /> {t.suggested_due_date}
                </span>
              ) : null}
            </div>
          </div>

          {/* CRM Note */}
          {wb.note ? (
            <div className="border-t border-edge pt-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-faint">CRM note</div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{wb.note}</p>
            </div>
          ) : null}

          {/* Follow-up reminder */}
          {wb.follow_up_reminder ? (
            <div className="border-t border-edge pt-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-faint">Follow-up reminder</div>
              <p className="mt-0.5 inline-flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
                <CalendarClock size={11} className="mt-0.5 shrink-0 text-faint" />
                {wb.follow_up_reminder}
              </p>
            </div>
          ) : null}

          <p className="flex items-start gap-1.5 border-t border-edge pt-2 text-[9px] leading-relaxed text-faint">
            <Info size={10} className="mt-0.5 shrink-0" />
            Suggested only. Nothing is written to the CRM automatically — use the approval controls above to
            log a task or note after the conversation.
          </p>
        </div>
      ) : null}
    </Block>
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
 * Executive Decision Brief (Phase 4.2): converts internal CRM evidence + outside-in
 * intelligence into an explainable, executive-quality decision artifact a seller can
 * consume in ~30 seconds and act on. Rendered as *supporting* context — it never
 * changes ranking, scoring, governance, confidence or CRM write-back, and the CRM
 * write-back recommendation is advisory and approval-gated. Returns null when the
 * layer is disabled or empty, so the workspace is unchanged when external signals
 * are off.
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
      <div className="rounded-xl border border-edge bg-surface2/40 p-3">
        <div className="flex items-center gap-2 text-[11px] text-faint">
          <ScrollText size={13} className="animate-pulse" /> Composing executive decision brief…
        </div>
      </div>
    );
  }

  // Hidden entirely when the layer is off or there is nothing to show.
  if (!data || !data.enabled) return null;
  const brief: ExecutiveBrief | null = data.brief ?? null;
  if (!brief && data.signals.length === 0) return null;

  const sources = (data.sources && data.sources.length ? data.sources : brief?.sources) ?? [];
  const mode = modeBadge(data.provider_mode);

  // Backward-compatible reads: Phase 4.2 fields fall back to Phase 4.1 prose.
  const execSummary = brief?.executive_summary || brief?.fused_insight || "";
  const internalEvidence = brief?.internal_evidence ?? [];
  const externalIntel = brief?.external_intelligence ?? [];
  const strategySteps = brief?.conversation_strategy_steps ?? [];
  const whatNotToDo = brief?.what_not_to_do ?? [];
  const confidenceWhy = brief?.confidence_rationale || "";
  const crmWriteback = brief?.crm_writeback ?? null;

  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-surface2/40">
      {/* Header band — framed as an executive brief, still clearly supporting */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge bg-surface/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <ScrollText size={15} className="text-brand-bright" />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink">
              Executive Decision Brief
            </div>
            <div className="text-[9px] text-faint">Internal CRM evidence × outside-in intelligence</div>
          </div>
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
        <div className="space-y-3 p-3">
          {/* 1. Executive summary — the lead */}
          <div className="rounded-lg border border-brand/25 bg-brand/5 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-brand-bright">
                Executive summary · What&apos;s happening
              </span>
              <span
                className={cx(
                  "shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                  confTone(brief.confidence),
                )}
              >
                Confidence {brief.confidence}
              </span>
            </div>
            <p className="text-[12px] leading-relaxed text-ink">{execSummary}</p>
          </div>

          {/* 2. Why this matters */}
          {brief.why_it_matters ? (
            <Block icon={Target} label="Why this matters">
              <Prose>{brief.why_it_matters}</Prose>
            </Block>
          ) : null}

          {/* 5. AI fused insight — the most important read */}
          {brief.fused_insight ? (
            <div className="rounded-lg border border-edge bg-surface/60 p-2.5">
              <div className="mb-1 flex items-center gap-1.5">
                <Sparkles size={11} className="shrink-0 text-brand-bright" />
                <span className="text-[9px] font-semibold uppercase tracking-wider text-brand-bright">
                  AI fused insight
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-ink">{brief.fused_insight}</p>
            </div>
          ) : null}

          {/* 3. Internal evidence (source of truth) */}
          {internalEvidence.length ? (
            <Block
              icon={Building2}
              label="Internal evidence"
              aside={
                <span className="text-[8px] font-semibold uppercase tracking-wider text-accent">Source of truth</span>
              }
            >
              <InternalEvidenceGrid items={internalEvidence} />
            </Block>
          ) : brief.internal_summary ? (
            <Block icon={Building2} label="Internal evidence">
              <Prose>{brief.internal_summary}</Prose>
            </Block>
          ) : null}

          {/* 4. External intelligence (synthesized, supporting) */}
          {externalIntel.length ? (
            <Block
              icon={Globe}
              label="External intelligence"
              aside={
                <span className="text-[8px] font-semibold uppercase tracking-wider text-faint">Supporting</span>
              }
            >
              <ul className="space-y-1">
                {externalIntel.map((pt, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-bright/70" />
                    {pt}
                  </li>
                ))}
              </ul>
            </Block>
          ) : brief.external_summary ? (
            <Block icon={Globe} label="External intelligence">
              <Prose>{brief.external_summary}</Prose>
            </Block>
          ) : null}

          {/* 6 + 7 implications */}
          <div className="grid gap-3 sm:grid-cols-2">
            {brief.business_implication ? (
              <Block icon={TrendingUp} label="Business implication">
                <Prose>{brief.business_implication}</Prose>
              </Block>
            ) : null}
            {brief.seller_implication ? (
              <Block icon={Target} label="Seller implication">
                <Prose>{brief.seller_implication}</Prose>
              </Block>
            ) : null}
          </div>

          {/* 8. Recommended conversation strategy */}
          {strategySteps.length ? (
            <Block icon={ListChecks} label="Recommended conversation strategy">
              <ol className="space-y-1">
                {strategySteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
                    <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-brand/30 bg-brand/5 text-[9px] font-semibold text-brand-bright">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </Block>
          ) : brief.recommended_conversation_strategy ? (
            <Block icon={ListChecks} label="Recommended conversation strategy">
              <Prose>{brief.recommended_conversation_strategy}</Prose>
            </Block>
          ) : null}

          {/* 9. Suggested opening line */}
          {brief.suggested_opening_line ? (
            <div className="rounded-lg border border-edge bg-surface/60 p-2.5">
              <div className="mb-0.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                <Quote size={10} /> Suggested opening line
              </div>
              <p className="text-[11px] italic leading-relaxed text-muted">
                &ldquo;{brief.suggested_opening_line}&rdquo;
              </p>
            </div>
          ) : null}

          {/* 10. Recommended CRM write-back (advisory, approval-gated) */}
          {crmWriteback ? <CrmWriteback wb={crmWriteback} /> : null}

          {/* 11. Confidence + why */}
          {confidenceWhy ? (
            <Block icon={Info} label="Confidence">
              <p className="flex items-center gap-2 text-[11px] leading-relaxed text-muted">
                <span
                  className={cx(
                    "shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                    confTone(brief.confidence),
                  )}
                >
                  {brief.confidence}
                </span>
                {confidenceWhy}
              </p>
            </Block>
          ) : null}

          {/* 12. What NOT to do */}
          {whatNotToDo.length ? (
            <div className="rounded-lg border border-amber/30 bg-amber/5 p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-amber">
                <ShieldAlert size={11} /> What not to do
              </div>
              <ul className="space-y-0.5">
                {whatNotToDo.map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber/70" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* 13. Sources */}
          {sources.length ? (
            <Block icon={Newspaper} label="Sources">
              <ul className="space-y-1">
                {sources.map((s, i) => (
                  <SourceRow key={`${s.title}-${i}`} s={s} />
                ))}
              </ul>
            </Block>
          ) : null}

          {/* Supporting raw signals — collapsed to keep the brief calm */}
          {data.signals.length ? (
            <div>
              <button
                type="button"
                onClick={() => setShowSignals((v) => !v)}
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-faint transition-colors hover:text-muted"
                aria-expanded={showSignals}
              >
                <ChevronDown size={11} className={cx("transition-transform", showSignals && "rotate-180")} />
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
          <div className="flex items-start gap-1.5 border-t border-edge pt-2.5 text-[9px] leading-relaxed text-faint">
            <AlertTriangle size={10} className="mt-0.5 shrink-0 text-amber/80" />
            <span>
              {data.caveat}
              {data.provider ? <span className="ml-1 opacity-80">· Source: {data.provider} provider</span> : null}
              {data.cached ? <span className="opacity-80"> · cached</span> : null}
            </span>
          </div>
        </div>
      ) : (
        // Backward-compatible fallback: raw signals + takeaway (no fusion brief present)
        <div className="p-3">
          <p className="text-[10px] leading-relaxed text-faint">
            Public context that may affect this account. Supporting only — it never changes ranking, scoring,
            governance or CRM write-back.
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
          <div className="mt-2.5 flex items-start gap-1.5 text-[9px] leading-relaxed text-faint">
            <AlertTriangle size={10} className="mt-0.5 shrink-0 text-amber/80" />
            <span>
              {data.caveat}
              {data.provider ? <span className="ml-1 opacity-80">· Source: {data.provider} provider</span> : null}
              {data.cached ? <span className="opacity-80"> · cached</span> : null}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
