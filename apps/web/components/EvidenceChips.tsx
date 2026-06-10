import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Users,
  LifeBuoy,
  DollarSign,
  Activity,
  Megaphone,
  Sparkles,
} from "lucide-react";
import type { Evidence } from "@/lib/types";
import { cx, polarityClasses, sourceMeta } from "@/lib/format";

function PolarityIcon({ polarity, size = 12 }: { polarity: string; size?: number }) {
  if (polarity === "positive") return <ArrowUpRight size={size} />;
  if (polarity === "negative") return <ArrowDownRight size={size} />;
  return <Minus size={size} />;
}

function SourceIcon({ system, size = 14 }: { system: string; size?: number }) {
  const { key } = sourceMeta(system);
  const Icon =
    key === "crm"
      ? Users
      : key === "support"
        ? LifeBuoy
        : key === "spend"
          ? DollarSign
          : key === "usage"
            ? Activity
            : key === "campaign"
              ? Megaphone
              : Sparkles;
  return <Icon size={size} />;
}

// Compact chips — used on recommendation cards.
export function EvidenceChips({ evidence, max = 4 }: { evidence: Evidence[]; max?: number }) {
  const shown = evidence.slice(0, max);
  const extra = evidence.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((e, i) => (
        <span
          key={i}
          title={`${sourceMeta(e.source_system).label} · ${e.source_agent}: ${e.detail}`}
          className={cx(
            "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
            polarityClasses(e.polarity),
          )}
        >
          <PolarityIcon polarity={e.polarity} />
          {e.label}
        </span>
      ))}
      {extra > 0 ? (
        <span className="inline-flex items-center rounded-md border border-edge bg-surface2 px-2 py-0.5 text-[11px] text-faint">
          +{extra} more
        </span>
      ) : null}
    </div>
  );
}

// Full evidence ledger — used in the decision workspace.
export function EvidenceLedger({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) {
    return (
      <p className="text-xs text-faint">No evidence items were attached to this recommendation.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {evidence.map((e, i) => {
        const src = sourceMeta(e.source_system);
        const tileTone =
          e.polarity === "positive"
            ? "border-accent/30 bg-accent/10 text-accent"
            : e.polarity === "negative"
              ? "border-risk/30 bg-risk/10 text-risk"
              : "border-edge bg-surface2 text-muted";
        const barTone = e.polarity === "negative" ? "bg-risk" : e.polarity === "positive" ? "bg-accent" : "bg-faint";
        return (
          <li key={i} className="flex gap-2.5 rounded-lg border border-edge bg-surface2/50 p-2.5">
            <div
              className={cx(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                tileTone,
              )}
              title={`Source: ${src.label}`}
            >
              <SourceIcon system={e.source_system} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-ink">{e.label}</span>
                <span className="shrink-0 rounded border border-edge bg-surface px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                  {src.label}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{e.detail}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span
                  className={cx(
                    "flex items-center",
                    e.polarity === "negative"
                      ? "text-risk"
                      : e.polarity === "positive"
                        ? "text-accent"
                        : "text-faint",
                  )}
                >
                  <PolarityIcon polarity={e.polarity} size={11} />
                </span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface">
                  <div
                    className={cx("h-full rounded-full", barTone)}
                    style={{ width: `${Math.round(e.strength * 100)}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-faint">
                  {Math.round(e.strength * 100)}%
                </span>
              </div>
              <div className="mt-1 text-[9px] uppercase tracking-wider text-faint">
                {e.source_agent.replace(/_/g, " ")}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
