import * as React from "react";
import { cx } from "@/lib/format";

// Reusable titled section wrapper for the assurance screen. Semantic headings so
// the page reads as an ordered report to assistive technology.
export function AssuranceSection({
  title,
  subtitle,
  children,
  className,
  headingId,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  headingId?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cx("card p-5", className)} aria-labelledby={headingId}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id={headingId} className="section-label">
            {title}
          </h2>
          {subtitle ? <p className="section-sub mt-1">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

// Pass/fail-style pill that never relies on colour alone — each carries a word.
export function VerdictPill({ verdict }: { verdict: string }) {
  const pass = verdict === "PASS" || verdict === "pass" || verdict === "READY";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        pass
          ? "border-gov/40 bg-gov/10 text-gov-bright"
          : "border-risk/45 bg-risk/10 text-risk",
      )}
    >
      {verdict}
    </span>
  );
}
