"use client";

import * as React from "react";
import {
  Database,
  Radio,
  Cpu,
  FileText,
  UserCheck,
  ScrollText,
  Send,
  ChevronRight,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { cx } from "@/lib/format";

type StageState = "done" | "current" | "future";

interface Stage {
  key: string;
  label: string;
  icon: LucideIcon;
}

export interface WorkflowState {
  loading: boolean;
  hasResult: boolean;
  anyApproved: boolean;
  anyWriteback: boolean;
  sourceLabel: string; // e.g. "HubSpot Test CRM" or "Synthetic local dataset"
}

// Returns the index of the currently-active stage given app state.
function activeIndex(s: WorkflowState): number {
  if (s.anyWriteback) return 6; // writeback complete
  if (s.anyApproved) return 6; // approved -> writeback is the live next step
  if (s.hasResult) return 4; // recommendations ready -> awaiting approval
  if (s.loading) return 2; // analysis running
  return 1; // data loaded -> signal detection ready
}

export function LiveWorkflowRail({ state }: { state: WorkflowState }) {
  const stages: Stage[] = [
    { key: "source", label: state.sourceLabel, icon: Database },
    { key: "signal", label: "Signal Detection", icon: Radio },
    { key: "ai", label: "AI Analysis", icon: Cpu },
    { key: "evidence", label: "Evidence", icon: FileText },
    { key: "approval", label: "Human Approval", icon: UserCheck },
    { key: "ledger", label: "Decision Ledger", icon: ScrollText },
    { key: "writeback", label: "CRM Writeback", icon: Send },
  ];
  const active = activeIndex(state);

  function stateOf(i: number): StageState {
    if (i < active) return "done";
    if (i === active) return "current";
    return "future";
  }

  return (
    <div className="flex flex-wrap items-stretch gap-1.5">
      {stages.map((st, i) => {
        const ss = stateOf(i);
        const isWritebackDone = i === 6 && state.anyWriteback;
        return (
          <React.Fragment key={st.key}>
            <div
              className={cx(
                "flex min-w-[116px] flex-1 flex-col gap-1.5 rounded-lg border px-3 py-2.5 transition-colors",
                ss === "done" && "border-accent/30 bg-accent/5",
                ss === "current" && "border-accent/60 bg-accent/10 shadow-glow-soft",
                ss === "future" && "border-edge bg-surface2/30",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cx(
                    "flex h-7 w-7 items-center justify-center rounded-md border",
                    ss === "future" ? "border-edge bg-surface2 text-faint" : "border-accent/40 bg-accent/10 text-accent",
                  )}
                >
                  {ss === "done" || isWritebackDone ? (
                    <CheckCircle2 size={14} className="text-accent" />
                  ) : (
                    <st.icon size={14} className={cx(ss === "current" && "animate-pulseline")} />
                  )}
                </span>
                <span
                  className={cx(
                    "text-[9px] font-semibold uppercase tracking-wider",
                    ss === "done" && "text-accent/70",
                    ss === "current" && "text-accent",
                    ss === "future" && "text-faint",
                  )}
                >
                  {ss === "current" ? "Live" : ss === "done" ? "Done" : `0${i + 1}`}
                </span>
              </div>
              <div
                className={cx(
                  "truncate text-[11px] font-medium leading-tight",
                  ss === "future" ? "text-faint" : "text-ink",
                )}
                title={st.label}
              >
                {st.label}
              </div>
            </div>
            {i < stages.length - 1 ? (
              <div className="flex items-center self-center text-edge">
                <ChevronRight size={14} className={cx(i < active ? "text-accent/50" : "text-edge")} />
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}
