// Tester Guide — main rendered component (presentation only)
// ===========================================================
// Renders the canonical guide content model as a polished, accessible,
// VentureOS-styled experience. No data fetching, no business logic.

"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Compass,
  Copy,
  Download,
  Eye,
  FileText,
  Info,
  Monitor,
  Shield,
  Target,
  X,
  type LucideIcon,
} from "lucide-react";
import { cx } from "@/lib/format";
import {
  GUIDE_METADATA,
  GUIDE_SECTIONS,
  GUIDE_TRUTH_TABLE,
  GUIDE_SEVERITY,
  GUIDE_FEEDBACK_FIELDS,
  GUIDE_CHECKLIST,
  GUIDE_GLOSSARY,
  type GuideSection,
  type GuideStep,
  type TruthClassification,
  type GuideScreenshot,
} from "@/lib/tester-guide";

// ── Screenshot Lightbox ──────────────────────────────────────────────

function ScreenshotFrame({ screenshot }: { screenshot: GuideScreenshot }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <figure className="mt-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group block w-full overflow-hidden rounded-xl border border-edge bg-surface transition-colors hover:border-brand/40"
          aria-label={`Expand screenshot: ${screenshot.alt}`}
        >
          <img
            src={screenshot.src}
            alt={screenshot.alt}
            width={screenshot.width}
            height={screenshot.height}
            loading="lazy"
            className="w-full object-contain"
          />
        </button>
        <figcaption className="mt-2 text-center text-[11px] text-faint">
          {screenshot.caption}
        </figcaption>
      </figure>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={screenshot.alt}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-lg border border-edge bg-surface p-2 text-muted hover:text-ink"
            aria-label="Close"
          >
            <X size={18} />
          </button>
          <img
            src={screenshot.src}
            alt={screenshot.alt}
            className="max-h-[90vh] max-w-[90vw] rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// ── Step Card ────────────────────────────────────────────────────────

function StepCard({ step, sectionNumber }: { step: GuideStep; sectionNumber: number }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="card p-5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Target size={14} className="shrink-0 text-brand-bright" />
            <h4 className="text-[14px] font-semibold text-ink">{step.title}</h4>
          </div>
          {step.route && (
            <code className="mt-1 block text-[11px] text-faint font-mono">{step.route}</code>
          )}
          <p className="mt-1 text-[13px] text-muted">{step.purpose}</p>
        </div>
        <span className="mt-1 shrink-0 text-faint">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 animate-fade-in">
          {/* Actions */}
          <DetailBlock icon={ClipboardList} label="What to do" tone="text-brand-bright">
            <ol className="space-y-1.5">
              {step.actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-ink">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-brand/15 text-[9px] font-bold text-brand-bright">
                    {i + 1}
                  </span>
                  {a.instruction}
                </li>
              ))}
            </ol>
          </DetailBlock>

          {/* Expected Results */}
          <DetailBlock icon={CheckCircle2} label="Expected result" tone="text-accent">
            <ul className="space-y-1">
              {step.expectedResults.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-muted">
                  <Check size={13} className="mt-0.5 shrink-0 text-accent" />
                  {r.description}
                </li>
              ))}
            </ul>
          </DetailBlock>

          {/* Failure Indicators */}
          {step.failureIndicators.length > 0 && (
            <DetailBlock icon={AlertTriangle} label="Failure indicators" tone="text-risk">
              <ul className="space-y-1">
                {step.failureIndicators.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-muted">
                    <X size={13} className="mt-0.5 shrink-0 text-risk" />
                    {f.description}
                  </li>
                ))}
              </ul>
            </DetailBlock>
          )}

          {/* Truth Notes */}
          {step.truthNotes.length > 0 && (
            <div className="rounded-lg border border-gov/30 bg-gov/5 px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gov-bright">
                <Info size={12} /> Truth note
              </div>
              {step.truthNotes.map((n, i) => (
                <p key={i} className="mt-1.5 text-[12px] text-muted">{n.text}</p>
              ))}
            </div>
          )}

          {/* Screenshot */}
          {step.screenshot && <ScreenshotFrame screenshot={step.screenshot} />}
        </div>
      )}
    </div>
  );
}

function DetailBlock({
  icon: Icon,
  label,
  tone,
  children,
}: {
  icon: LucideIcon;
  label: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className={cx("flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider", tone)}>
        <Icon size={12} /> {label}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

// ── Section Block ────────────────────────────────────────────────────

function SectionBlock({ section }: { section: GuideSection }) {
  return (
    <section id={section.id} className="scroll-mt-24">
      <div className="flex items-baseline gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand/40 bg-brand/10 text-[13px] font-bold text-brand-bright">
          {section.number}
        </span>
        <div>
          <h3 className="text-[18px] font-semibold text-ink sm:text-[20px]">{section.title}</h3>
          {section.route && (
            <code className="text-[11px] text-faint font-mono">{section.route}</code>
          )}
        </div>
      </div>

      {section.explanation.length > 0 && (
        <div className="mt-3 space-y-2">
          {section.explanation.map((p, i) => (
            <p key={i} className="text-[13px] leading-relaxed text-muted">{p}</p>
          ))}
        </div>
      )}

      {section.screenshot && <ScreenshotFrame screenshot={section.screenshot} />}

      {section.steps.length > 0 && (
        <div className="mt-5 space-y-4">
          {section.steps.map((step) => (
            <StepCard key={step.id} step={step} sectionNumber={section.number} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Truth Table ──────────────────────────────────────────────────────

const TRUTH_COLORS: Record<TruthClassification, string> = {
  Production: "border-accent/40 bg-accent/10 text-accent-bright",
  "Production-Partial": "border-brand/40 bg-brand/10 text-brand-bright",
  "Guided Demo": "border-amber-500/40 bg-amber-500/10 text-amber-300",
  Simulated: "border-gov/40 bg-gov/10 text-gov-bright",
  "Not implemented": "border-edge bg-surface2 text-faint",
  Future: "border-edge bg-surface2 text-faint",
};

function TruthTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-edge text-left">
            <th className="pb-2 pr-4 text-[11px] font-semibold uppercase tracking-wider text-faint">Feature</th>
            <th className="pb-2 pr-4 text-[11px] font-semibold uppercase tracking-wider text-faint">Classification</th>
            <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Detail</th>
          </tr>
        </thead>
        <tbody>
          {GUIDE_TRUTH_TABLE.map((row, i) => (
            <tr key={i} className="border-b border-edge/50">
              <td className="py-2.5 pr-4 text-ink">{row.feature}</td>
              <td className="py-2.5 pr-4">
                <span className={cx("inline-flex rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider", TRUTH_COLORS[row.classification])}>
                  {row.classification}
                </span>
              </td>
              <td className="py-2.5 text-muted">{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Severity Guide ───────────────────────────────────────────────────

const SEV_COLORS: Record<string, string> = {
  P0: "border-risk/40 bg-risk/10 text-risk",
  P1: "border-brand/40 bg-brand/10 text-brand-bright",
  P2: "border-edge bg-surface2 text-faint",
};

function SeverityGuide() {
  return (
    <div className="space-y-4">
      {GUIDE_SEVERITY.map((s) => (
        <div key={s.severity} className="card p-5">
          <div className="flex items-center gap-2">
            <span className={cx("inline-flex rounded-full border px-2.5 py-[2px] text-[11px] font-bold uppercase", SEV_COLORS[s.severity])}>
              {s.severity}
            </span>
            <span className="text-[13px] text-muted">{s.description}</span>
          </div>
          <ul className="mt-3 space-y-1">
            {s.examples.map((ex, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-muted">
                <AlertTriangle size={11} className="mt-0.5 shrink-0 text-faint" /> {ex}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ── Feedback Form (copyable) ─────────────────────────────────────────

function FeedbackTemplate() {
  const [copied, setCopied] = React.useState(false);

  const templateText = GUIDE_FEEDBACK_FIELDS.map((f) => `${f.label}: `).join("\n");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(templateText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h4 className="text-[14px] font-semibold text-ink">Structured Feedback Template</h4>
        <button
          type="button"
          onClick={handleCopy}
          className="btn btn-ghost px-3 py-1.5 text-[12px]"
        >
          {copied ? (
            <><Check size={12} /> Copied</>
          ) : (
            <><Copy size={12} /> Copy template</>
          )}
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {GUIDE_FEEDBACK_FIELDS.map((f) => (
          <div key={f.name} className="flex items-start gap-2">
            <span className="text-[12px] font-medium text-muted">{f.label}:</span>
            {f.required && (
              <span className="text-[9px] text-risk">required</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Checklist ────────────────────────────────────────────────────────

function FinalChecklist() {
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});

  const toggle = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const total = GUIDE_CHECKLIST.length;
  const done = Object.values(checked).filter(Boolean).length;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h4 className="text-[14px] font-semibold text-ink">Final Checklist</h4>
        <span className="text-[12px] text-faint">
          {done} / {total}
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {GUIDE_CHECKLIST.map((item) => (
          <label
            key={item.id}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface2/60"
          >
            <input
              type="checkbox"
              checked={!!checked[item.id]}
              onChange={() => toggle(item.id)}
              className="h-4 w-4 rounded border-edge accent-brand"
            />
            <span className={cx("text-[13px]", checked[item.id] ? "text-faint line-through" : "text-ink")}>
              {item.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Glossary ─────────────────────────────────────────────────────────

function Glossary() {
  return (
    <div className="space-y-2">
      {GUIDE_GLOSSARY.map((g) => (
        <div key={g.term} className="rounded-lg border border-edge bg-surface px-4 py-3">
          <dt className="text-[13px] font-semibold text-ink">{g.term}</dt>
          <dd className="mt-0.5 text-[12px] text-muted">{g.definition}</dd>
        </div>
      ))}
    </div>
  );
}

// ── Table of Contents ────────────────────────────────────────────────

function TableOfContents() {
  return (
    <nav aria-label="Guide sections" className="card p-5">
      <h3 className="text-[14px] font-semibold text-ink">Guide Sections</h3>
      <ol className="mt-3 space-y-1.5">
        {GUIDE_SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] text-muted hover:bg-surface2/60 hover:text-ink transition-colors"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand/10 text-[10px] font-bold text-brand-bright">
                {s.number}
              </span>
              {s.title}
            </a>
          </li>
        ))}
        <li>
          <a
            href="#glossary"
            className="flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] text-muted hover:bg-surface2/60 hover:text-ink transition-colors"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gov/10 text-[10px] font-bold text-gov-bright">
              G
            </span>
            Glossary
          </a>
        </li>
      </ol>
    </nav>
  );
}

// ── Main Guide Component ─────────────────────────────────────────────

export function TesterGuide() {
  const M = GUIDE_METADATA;

  // Find special sections
  const truthSection = GUIDE_SECTIONS.find((s) => s.id === "truth-table");
  const defectSection = GUIDE_SECTIONS.find((s) => s.id === "defect-reporting");
  const checklistSection = GUIDE_SECTIONS.find((s) => s.id === "final-checklist");
  const regularSections = GUIDE_SECTIONS.filter(
    (s) => s.id !== "truth-table" && s.id !== "defect-reporting" && s.id !== "final-checklist",
  );

  return (
    <div className="mx-auto w-full max-w-[880px] px-5 py-10">
      {/* Hero */}
      <header className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-bright">
          <BookOpen size={12} /> Tester Guide
        </div>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {M.title}
        </h2>
        <p className="mt-3 text-base text-muted">
          A self-guided testing experience for the VentureOS Signal-to-Action Agent.
        </p>
        <p className="mt-1 text-[13px] text-faint">
          One signal, one mission, one governed outcome.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-[12px] text-faint">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={13} /> ~{M.estimatedMinutes} minutes
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Monitor size={13} /> {M.suggestedBrowser}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Eye size={13} /> {M.suggestedViewport}
          </span>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href={M.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary px-5 py-2.5 text-sm font-semibold"
          >
            Start Testing <ArrowRight size={14} />
          </a>
          <Link href="/walkthrough" className="btn btn-ghost px-5 py-2.5 text-sm font-semibold">
            <Compass size={14} /> Product Walkthrough
          </Link>
          <a
            href="/guides/VentureOS-Signal-to-Action-Tester-Guide.pdf"
            download
            className="btn btn-ghost px-5 py-2.5 text-sm font-semibold"
          >
            <Download size={14} /> Download PDF
          </a>
        </div>
      </header>

      {/* Prerequisites banner */}
      <div className="mb-8 rounded-xl border border-gov/30 bg-gov/5 px-5 py-4">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-gov-bright">
          <Shield size={14} /> Important
        </div>
        <p className="mt-2 text-[13px] text-muted">
          This is a <strong className="text-ink">deterministic governed demo</strong> — not live customer CRM data.
          No real email is sent. No real CRM task is created. No real risk record is written.
          All simulation labels and outcomes are truthful.
        </p>
      </div>

      {/* Table of Contents */}
      <TableOfContents />

      {/* Regular Sections */}
      <div className="mt-10 space-y-12">
        {regularSections.map((section) => (
          <SectionBlock key={section.id} section={section} />
        ))}
      </div>

      {/* Section 16 — Truth Table */}
      {truthSection && (
        <section id={truthSection.id} className="mt-12 scroll-mt-24">
          <div className="flex items-baseline gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand/40 bg-brand/10 text-[13px] font-bold text-brand-bright">
              {truthSection.number}
            </span>
            <h3 className="text-[18px] font-semibold text-ink sm:text-[20px]">{truthSection.title}</h3>
          </div>
          {truthSection.explanation.map((p, i) => (
            <p key={i} className="mt-3 text-[13px] text-muted">{p}</p>
          ))}
          <div className="mt-5">
            <TruthTable />
          </div>
        </section>
      )}

      {/* Section 17 — Defect Reporting */}
      {defectSection && (
        <section id={defectSection.id} className="mt-12 scroll-mt-24">
          <div className="flex items-baseline gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand/40 bg-brand/10 text-[13px] font-bold text-brand-bright">
              {defectSection.number}
            </span>
            <h3 className="text-[18px] font-semibold text-ink sm:text-[20px]">{defectSection.title}</h3>
          </div>
          {defectSection.explanation.map((p, i) => (
            <p key={i} className="mt-3 text-[13px] text-muted">{p}</p>
          ))}
          <div className="mt-5">
            <SeverityGuide />
          </div>
          <div className="mt-6">
            <FeedbackTemplate />
          </div>
        </section>
      )}

      {/* Section 18 — Final Checklist */}
      {checklistSection && (
        <section id={checklistSection.id} className="mt-12 scroll-mt-24">
          <div className="flex items-baseline gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand/40 bg-brand/10 text-[13px] font-bold text-brand-bright">
              {checklistSection.number}
            </span>
            <h3 className="text-[18px] font-semibold text-ink sm:text-[20px]">{checklistSection.title}</h3>
          </div>
          <div className="mt-5">
            <FinalChecklist />
          </div>
        </section>
      )}

      {/* Glossary */}
      <section id="glossary" className="mt-12 scroll-mt-24">
        <div className="flex items-baseline gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gov/40 bg-gov/10 text-[13px] font-bold text-gov-bright">
            G
          </span>
          <h3 className="text-[18px] font-semibold text-ink sm:text-[20px]">Glossary</h3>
        </div>
        <div className="mt-5">
          <Glossary />
        </div>
      </section>

      {/* Footer CTAs */}
      <div className="mt-16 rounded-xl border border-edge bg-surface p-8 text-center">
        <h3 className="text-xl font-semibold text-ink">Testing Complete?</h3>
        <p className="mt-2 text-[13px] text-muted">
          Submit your feedback using the template above, then return to the product.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <a
            href={M.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary px-5 py-2.5 text-sm font-semibold"
          >
            Return to VentureOS <ArrowRight size={14} />
          </a>
          <Link href="/walkthrough" className="btn btn-ghost px-5 py-2.5 text-sm font-semibold">
            <Compass size={14} /> Product Walkthrough
          </Link>
          <a
            href="/guides/VentureOS-Signal-to-Action-Tester-Guide.pdf"
            download
            className="btn btn-ghost px-5 py-2.5 text-sm font-semibold"
          >
            <Download size={14} /> Download PDF
          </a>
        </div>
      </div>
    </div>
  );
}
