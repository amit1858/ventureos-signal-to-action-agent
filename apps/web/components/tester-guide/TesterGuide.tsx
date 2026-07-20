// TesterGuide — renders the canonical tester-guide content model
// ===============================================================
// Server component (static, no side effects). It renders the single source of
// truth (lib/tester-guide/content) as a self-guided, illustrated page: an intro
// with primary CTAs, every numbered section (purpose, route, what-to-do +
// expected, expected results, failure indicators, truth note, optional
// technical detail, and embedded product screenshots), a production-vs-demo
// truth table, severity guidance, a copyable feedback block, the final tester
// checklist, and a glossary. Interactive bits (lightbox, copy) are small client
// islands; everything else is server-rendered and works without JavaScript.

import Link from "next/link";
import {
  BookOpenCheck,
  FileDown,
  Compass,
  ArrowLeft,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Info,
} from "lucide-react";

import {
  GUIDE_META,
  GUIDE_CANONICAL,
  GUIDE_SECTIONS,
  TRUTH_TABLE,
  SEVERITY_GUIDANCE,
  FEEDBACK_FIELDS,
  FINAL_CHECKLIST,
  GLOSSARY,
  screenshotById,
  toPublicGuideImage,
} from "@/lib/tester-guide/content";
import { GuideImage } from "./GuideImage";
import { FeedbackCopy } from "./FeedbackCopy";

const WRAP = "mx-auto w-full max-w-[1000px] px-5";

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-faint">{label}</span>
      <code className="text-[12px] text-ink">{value}</code>
    </div>
  );
}

export function TesterGuide() {
  return (
    <div className="pb-24">
      {/* Intro ------------------------------------------------------------- */}
      <section className={`${WRAP} pt-10`}>
        <span className="section-label">{GUIDE_META.statusLabel}</span>
        <h1 className="mt-3 text-[30px] font-semibold leading-tight text-ink sm:text-[38px]">
          {GUIDE_META.title}
        </h1>
        <p className="mt-2 text-[15px] text-brand-bright">{GUIDE_META.tagline}</p>
        <p className="mt-4 max-w-[720px] text-[14px] leading-relaxed text-muted">{GUIDE_META.purpose}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <a href="#section-1" className="btn btn-primary">
            <BookOpenCheck size={16} /> Start testing
          </a>
          <a href={GUIDE_META.pdfPath} download className="btn btn-outline-primary">
            <FileDown size={16} /> Download illustrated PDF
          </a>
          <Link href="/walkthrough" className="btn btn-ghost">
            <Compass size={16} /> Open product walkthrough
          </Link>
          <Link href="/" className="btn btn-ghost">
            <ArrowLeft size={16} /> Return to VentureOS
          </Link>
        </div>

        <div className="card mt-8 p-5">
          <div className="flex items-center gap-2">
            <MapPin size={15} className="text-brand-bright" />
            <span className="panel-title">The one journey you will test</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <IdentityRow label="Account" value={`${GUIDE_CANONICAL.account} · ${GUIDE_CANONICAL.accountId}`} />
            <IdentityRow label="Mission" value={GUIDE_CANONICAL.missionId} />
            <IdentityRow label="Recommendation" value={GUIDE_CANONICAL.recommendationId} />
            <IdentityRow label="Template" value={GUIDE_CANONICAL.template} />
            <IdentityRow label="Audit reference" value={GUIDE_CANONICAL.auditRef} />
            <IdentityRow label="System outcome" value={GUIDE_CANONICAL.systemOutcome} />
            <IdentityRow label="Business outcome" value={GUIDE_CANONICAL.businessOutcome} />
            <IdentityRow label="Estimated time" value={`~${GUIDE_META.estimatedMinutes} minutes`} />
          </div>
          <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-relaxed text-faint">
            <Info size={14} className="mt-0.5 shrink-0 text-brand-bright" />
            This is a deterministic governed demo. Actions are simulated — no real email is sent, no real CRM
            record is created, and no real risk record is written. Deterministic policy is the final authority;
            NVIDIA Nemotron provides grounded narrative only.
          </p>
        </div>
      </section>

      {/* Sections ---------------------------------------------------------- */}
      <div className={`${WRAP} mt-4`}>
        {GUIDE_SECTIONS.map((s) => {
          const shots = s.screenshotIds.map((id) => toPublicGuideImage(screenshotById(id)));
          return (
            <section
              key={s.id}
              id={`section-${s.number}`}
              className="scroll-mt-24 border-t border-edge py-9"
            >
              <div className="flex items-baseline gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-[13px] font-semibold text-brand-bright">
                  {s.number}
                </span>
                <h2 className="text-[20px] font-semibold leading-tight text-ink">{s.title}</h2>
              </div>

              <p className="mt-3 text-[14px] leading-relaxed text-muted">
                <span className="font-medium text-ink">Purpose. </span>
                {s.purpose}
              </p>

              {s.route ? (
                <p className="mt-2 text-[12.5px] text-faint">
                  Route:{" "}
                  <code className="rounded bg-surface2 px-1.5 py-0.5 text-[12px] text-ink">{s.route}</code>
                </p>
              ) : null}

              {s.explain.length ? (
                <ul className="mt-4 space-y-1.5">
                  {s.explain.map((e, i) => (
                    <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-muted">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-bright" />
                      {e}
                    </li>
                  ))}
                </ul>
              ) : null}

              {s.steps.length ? (
                <div className="card mt-5 p-4">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-faint">
                    What to do &amp; what to expect
                  </span>
                  <ol className="mt-3 space-y-3">
                    {s.steps.map((st, i) => (
                      <li key={i} className="flex gap-3 text-[13.5px]">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-edge text-[11px] text-muted">
                          {i + 1}
                        </span>
                        <span>
                          <span className="block text-ink">{st.action}</span>
                          <span className="mt-0.5 block text-[12.5px] text-accent">
                            Expect: {st.expected}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {(s.expectedResults.length || s.failureIndicators.length) ? (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {s.expectedResults.length ? (
                    <div className="rounded-xl border border-accent/25 bg-accent/[0.04] p-4">
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-accent">
                        <CheckCircle2 size={14} /> Expected result
                      </div>
                      <ul className="mt-2 space-y-1.5 text-[13px] text-muted">
                        {s.expectedResults.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {s.failureIndicators.length ? (
                    <div className="rounded-xl border border-risk/25 bg-risk/[0.04] p-4">
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-risk">
                        <AlertTriangle size={14} /> Failure indicators
                      </div>
                      <ul className="mt-2 space-y-1.5 text-[13px] text-muted">
                        {s.failureIndicators.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {s.truthNote ? (
                <p className="mt-5 flex items-start gap-2 rounded-lg border-l-2 border-brand bg-brand/[0.06] px-3 py-2.5 text-[13px] leading-relaxed text-ink">
                  <ShieldCheck size={15} className="mt-0.5 shrink-0 text-brand-bright" />
                  <span>
                    <span className="font-medium">Truth note. </span>
                    {s.truthNote}
                  </span>
                </p>
              ) : null}

              {shots.map((sc) => (
                <GuideImage key={sc.id} shot={sc} />
              ))}

              {s.technicalDetail.length ? (
                <details className="mt-5 rounded-lg border border-edge bg-surface/40 px-4 py-3">
                  <summary className="cursor-pointer text-[12.5px] font-medium text-muted">
                    Technical detail (optional)
                  </summary>
                  <ul className="mt-2 space-y-1.5 text-[12.5px] text-faint">
                    {s.technicalDetail.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </section>
          );
        })}
      </div>

      {/* Truth table ------------------------------------------------------- */}
      <section className={`${WRAP} border-t border-edge py-10`}>
        <h2 className="text-[20px] font-semibold text-ink">Production versus demonstration</h2>
        <p className="mt-2 text-[13.5px] text-muted">
          What is real Production, what is a read-only projection, what is a guided demo, and what is simulated
          or not yet built.
        </p>
        <div className="mt-5 space-y-3">
          {TRUTH_TABLE.map((r) => (
            <div key={r.tier} className="card grid gap-2 p-4 sm:grid-cols-[220px_1fr]">
              <span className="chip w-fit">{r.tier}</span>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
                {r.items.map((i, idx) => (
                  <li key={idx} className="before:mr-1.5 before:text-faint before:content-['·']">
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Severity ---------------------------------------------------------- */}
      <section className={`${WRAP} border-t border-edge py-10`}>
        <h2 className="text-[20px] font-semibold text-ink">How to rate what you find</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {SEVERITY_GUIDANCE.map((s) => (
            <div key={s.level} className="card p-4">
              <div className="flex items-center gap-2">
                <span
                  className={
                    "flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-semibold " +
                    (s.level === "P0"
                      ? "bg-risk/20 text-risk"
                      : s.level === "P1"
                        ? "bg-brand/20 text-brand-bright"
                        : "bg-surface2 text-muted")
                  }
                >
                  {s.level}
                </span>
                <span className="text-[13px] font-medium text-ink">{s.label}</span>
              </div>
              <ul className="mt-3 space-y-1 text-[12.5px] text-muted">
                {s.items.map((i, idx) => (
                  <li key={idx}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Feedback ---------------------------------------------------------- */}
      <section className={`${WRAP} border-t border-edge py-10`}>
        <h2 className="text-[20px] font-semibold text-ink">Share your feedback</h2>
        <p className="mt-2 text-[13.5px] text-muted">
          Copy the structured template (or download it) and send it to the VentureOS team. Nothing is submitted
          from this page.
        </p>
        <div className="card mt-5 p-5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-faint">Feedback fields</span>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] text-muted sm:grid-cols-3">
            {FEEDBACK_FIELDS.map((f) => (
              <li key={f.key} className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-brand-bright" />
                {f.label}
              </li>
            ))}
          </ul>
          <FeedbackCopy
            heading={`${GUIDE_META.product} ${GUIDE_META.flagship}`}
            templatePath={GUIDE_META.feedbackTemplatePath}
            fieldLabels={FEEDBACK_FIELDS.map((f) => f.label)}
          />
        </div>
      </section>

      {/* Final checklist --------------------------------------------------- */}
      <section className={`${WRAP} border-t border-edge py-10`}>
        <h2 className="text-[20px] font-semibold text-ink">Final tester checklist</h2>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {FINAL_CHECKLIST.map((c, i) => (
            <li key={i} className="flex items-center gap-2.5 rounded-lg border border-edge bg-surface/40 px-3 py-2 text-[13px] text-muted">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-edge text-transparent">
                ✓
              </span>
              {c}
            </li>
          ))}
        </ul>
      </section>

      {/* Glossary ---------------------------------------------------------- */}
      <section className={`${WRAP} border-t border-edge py-10`}>
        <h2 className="text-[20px] font-semibold text-ink">Glossary</h2>
        <dl className="mt-5 space-y-3">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="grid gap-1 sm:grid-cols-[200px_1fr]">
              <dt className="text-[13px] font-medium text-ink">{g.term}</dt>
              <dd className="text-[13px] leading-relaxed text-muted">{g.definition}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Footer CTAs ------------------------------------------------------- */}
      <section className={`${WRAP} border-t border-edge pt-10`}>
        <div className="flex flex-wrap gap-3">
          <a href={GUIDE_META.pdfPath} download className="btn btn-outline-primary">
            <FileDown size={16} /> Download illustrated PDF
          </a>
          <Link href="/walkthrough" className="btn btn-ghost">
            <Compass size={16} /> Product walkthrough
          </Link>
          <Link href="/" className="btn btn-ghost">
            <ArrowLeft size={16} /> Return to VentureOS
          </Link>
        </div>
        <p className="mt-6 text-[11.5px] leading-relaxed text-faint">
          Screenshots in this guide were captured from the canonical production application. This guide adds no
          new product capability; it documents the existing governed experience. Voice and Digital Human are
          future presentation adapters and are not implemented here.
        </p>
      </section>
    </div>
  );
}
