import * as React from "react";
import { cx } from "@/lib/format";

// Reusable titled section wrapper for the demo narrative flow. Uses semantic
// heading levels so the page reads as an ordered story to assistive tech.
export function DemoSection({
  index,
  title,
  subtitle,
  children,
  className,
  headingId,
}: {
  index?: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  headingId?: string;
}) {
  return (
    <section className={cx("card p-5", className)} aria-labelledby={headingId}>
      <div className="mb-3">
        <div className="section-label">
          {typeof index === "number" ? `${index}. ` : ""}
          {title}
        </div>
        {subtitle ? <p className="section-sub mt-1">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
