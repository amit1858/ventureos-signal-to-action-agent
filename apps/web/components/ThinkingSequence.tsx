"use client";

import * as React from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { cx } from "@/lib/format";

// The six controlled agents, in the order the orchestrator runs them.
const FALLBACK_AGENTS = [
  "Signal Ingestion Agent",
  "Account Health Agent",
  "Opportunity Agent",
  "Governance Agent",
  "Action Agent",
  "Communication Agent",
];

// Human narration for each agent — what it is *doing*, so the viewer watches
// intelligence reason rather than a spinner. Purely presentational.
const AGENT_VERB: Record<string, string> = {
  "Signal Ingestion Agent": "Reading customer signals",
  "Account Health Agent": "Assessing account health",
  "Opportunity Agent": "Weighing growth opportunity",
  "Governance Agent": "Checking evidence & governance",
  "Action Agent": "Choosing the next-best action",
  "Communication Agent": "Drafting the outreach",
};

// A cinematic "reasoning" beat shown while the workflow runs: each agent lights
// up in sequence with a line of narration. No business logic — it simply
// animates over the known agent order until the real result replaces it.
export function ThinkingSequence({
  agents,
  caption = "Reviewing your portfolio",
  className,
}: {
  agents?: string[];
  caption?: string;
  className?: string;
}) {
  const list = React.useMemo(
    () => (agents && agents.length ? agents : FALLBACK_AGENTS),
    [agents],
  );
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    setStep(0);
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduce ? 950 : 600;
    const id = setInterval(() => {
      // Advance through the agents, then hold on the last so it keeps reading
      // as "still working" until the result arrives and unmounts this view.
      setStep((p) => (p + 1 >= list.length ? list.length - 1 : p + 1));
    }, ms);
    return () => clearInterval(id);
  }, [list.length]);

  return (
    <div className={cx("animate-fade-in-fast", className)}>
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
        <Sparkles size={15} className="text-brand-bright" />
        {caption}
        <span className="animate-pulse text-faint" aria-hidden>
          …
        </span>
      </div>
      <ol className="relative ml-1 space-y-2 border-l border-edge pl-5">
        {list.map((a, i) => {
          const done = i < step;
          const active = i === step;
          const verb = AGENT_VERB[a] ?? a;
          return (
            <li key={a} className="relative flex items-center gap-2.5">
              <span
                className={cx(
                  "absolute -left-[26px] flex h-4 w-4 items-center justify-center rounded-full border transition-colors",
                  done
                    ? "border-accent/50 bg-accent/20 text-accent"
                    : active
                      ? "border-brand/60 bg-brand/20 text-brand-bright"
                      : "border-edge bg-surface2 text-faint",
                )}
              >
                {done ? (
                  <Check size={10} />
                ) : active ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <span className="h-1 w-1 rounded-full bg-current" />
                )}
              </span>
              <span
                className={cx(
                  "text-[13px] transition-colors",
                  done ? "text-muted" : active ? "font-medium text-ink" : "text-faint",
                )}
              >
                {verb}
              </span>
              {active ? (
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-brand-bright">
                  reasoning
                </span>
              ) : done ? (
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-accent/70">
                  done
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
