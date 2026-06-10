import { scoreTone, pct, confidenceLabel, cx } from "@/lib/format";
import { Bar } from "./ui";

// Inline horizontal confidence bar — used in compact contexts.
export function ConfidenceMeter({
  value,
  label = "Confidence",
  size = "md",
}: {
  value: number;
  label?: string;
  size?: "sm" | "md";
}) {
  const tone = scoreTone(value);
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-faint">{label}</span>
        <span className={`font-mono text-xs font-semibold ${tone.text}`}>{pct(value)}</span>
      </div>
      <Bar value={value} barClass={tone.bar} />
      {size === "md" ? (
        <div className="mt-1 flex justify-between text-[9px] uppercase tracking-wider text-faint">
          <span>Low</span>
          <span>High</span>
        </div>
      ) : null}
    </div>
  );
}

// Premium radial confidence ring — used in the decision workspace.
export function ConfidenceRing({ value, caption }: { value: number; caption?: string }) {
  const tone = scoreTone(value);
  const v = Math.max(0, Math.min(1, value));
  const r = 26;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - v);
  const stroke = v >= 0.75 ? "#76B900" : v >= 0.5 ? "#F5B84B" : "#EF6B73";
  return (
    <div className="flex items-center gap-3 rounded-lg border border-edge bg-surface2/40 p-3">
      <div className="relative h-[68px] w-[68px] shrink-0">
        <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="#1B2127" strokeWidth="6" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cx("font-mono text-sm font-bold", tone.text)}>{pct(value)}</span>
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-faint">Confidence</div>
        <div className={cx("text-sm font-semibold", tone.text)}>{confidenceLabel(value)}</div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted">
          {caption ?? "Evidence-weighted reliability of this recommendation."}
        </p>
      </div>
    </div>
  );
}
