import * as React from "react";
import { cx } from "@/lib/format";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cx("card", className)}>{children}</div>;
}

export function PanelTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="panel-title">{children}</span>
      {right}
    </div>
  );
}

export function Pill({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ className }: { className?: string }) {
  return <span className={cx("inline-block h-1.5 w-1.5 rounded-full", className)} />;
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-edge bg-surface2/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className={cx("mt-0.5 font-mono text-sm font-semibold text-ink", tone)}>{value}</div>
      {hint ? <div className="text-[10px] text-faint">{hint}</div> : null}
    </div>
  );
}

// Horizontal value bar (0..1).
export function Bar({
  value,
  barClass,
  trackClass,
}: {
  value: number;
  barClass?: string;
  trackClass?: string;
}) {
  const w = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-surface2", trackClass)}>
      <div
        className={cx("h-full rounded-full transition-all", barClass || "bg-accent")}
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cx("font-mono", className)}>{children}</span>;
}

// Compact toggle switch used for Demo mode.
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors",
        checked ? "border-accent/50 bg-accent/25" : "border-edge bg-surface2",
      )}
    >
      <span
        className={cx(
          "inline-block h-3 w-3 rounded-full transition-transform",
          checked ? "translate-x-[15px] bg-accent" : "translate-x-[3px] bg-faint",
        )}
      />
    </button>
  );
}
