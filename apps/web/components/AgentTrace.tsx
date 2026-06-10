import { CheckCircle2, Circle, AlertTriangle, Check } from "lucide-react";
import type { LedgerAgentStep } from "@/lib/types";
import { cx, titleCase } from "@/lib/format";

const SHORT_NAMES: Record<string, string> = {
  signal_ingestion: "Ingestion",
  account_health: "Health",
  opportunity: "Opportunity",
  governance: "Governance",
  action: "Action",
  communication: "Communication",
};

function shortName(agent: string): string {
  return SHORT_NAMES[agent] ?? titleCase(agent);
}

// Horizontal agent pipeline used at the top of the center column:
//   Signal Ingestion -> Account Health -> ... -> Communication
export function AgentPipeline({ agents, active }: { agents: string[]; active?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {agents.map((a, i) => (
        <span key={a} className="flex items-center gap-1">
          <span
            className={cx(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
              active
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-edge bg-surface2 text-muted",
            )}
          >
            {active ? (
              <Check size={11} className="text-accent" />
            ) : (
              <span className="font-mono text-[9px] text-faint">{i + 1}</span>
            )}
            {shortName(a)}
          </span>
          {i < agents.length - 1 ? (
            <span className={cx("h-px w-3", active ? "bg-accent/40" : "bg-edge")} aria-hidden />
          ) : null}
        </span>
      ))}
    </div>
  );
}

// Vertical agent trace with status + per-step summary (decision workspace / ledger).
export function AgentTrace({ steps }: { steps: LedgerAgentStep[] }) {
  return (
    <ol className="relative space-y-3 pl-5">
      <span className="absolute bottom-2 left-[7px] top-2 w-px bg-edge" aria-hidden />
      {steps.map((s, i) => {
        const done = s.status === "completed";
        const err = s.status === "error";
        const Icon = done ? CheckCircle2 : err ? AlertTriangle : Circle;
        const tone = done ? "text-accent" : err ? "text-risk" : "text-faint";
        return (
          <li key={i} className="relative">
            <span className="absolute -left-5 top-0 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface">
              <Icon size={13} className={tone} />
            </span>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-ink">{titleCase(s.agent_name)}</span>
              <span className="shrink-0 font-mono text-[10px] text-faint">{s.duration_ms}ms</span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted">{s.summary}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className={cx(
                  "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                  done
                    ? "border-accent/30 bg-accent/5 text-accent"
                    : err
                      ? "border-risk/30 bg-risk/5 text-risk"
                      : "border-edge bg-surface2 text-faint",
                )}
              >
                {s.status}
              </span>
              {s.evidence_count > 0 ? (
                <span className="text-[9px] uppercase tracking-wider text-faint">
                  {s.evidence_count} evidence used
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
