import { Layers, Target, BarChart3, ShieldCheck, Clock } from "lucide-react";
import type { ReactNode } from "react";
import type { Recommendation } from "@/lib/types";
import { cx } from "@/lib/format";

export function KpiStrip({
  recs,
  latencyMs,
  accountsAnalyzed,
}: {
  recs: Recommendation[];
  latencyMs: number;
  accountsAnalyzed: number;
}) {
  const highConf = recs.filter((r) => r.confidence_score >= 0.75).length;
  const pending = recs.filter((r) => r.approval_status === "pending").length;

  const items: Array<{ icon: typeof Layers; label: string; value: ReactNode; tone: string }> = [
    { icon: Layers, label: "Accounts analyzed", value: accountsAnalyzed, tone: "text-ink" },
    { icon: Target, label: "Priority actions", value: recs.length, tone: "text-cyan" },
    { icon: BarChart3, label: "High-confidence", value: highConf, tone: "text-accent" },
    { icon: ShieldCheck, label: "Approvals pending", value: pending, tone: "text-amber" },
    { icon: Clock, label: "Latency", value: `${latencyMs}ms`, tone: "text-ink" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => (
        <div key={it.label} className="rounded-lg border border-edge bg-surface2/50 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-faint">
            <it.icon size={11} />
            {it.label}
          </div>
          <div className={cx("mt-0.5 font-mono text-lg font-semibold", it.tone)}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}
