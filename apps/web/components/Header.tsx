import * as React from "react";
import { Activity, Cpu, ShieldCheck, FlaskConical, LayoutDashboard, Columns3 } from "lucide-react";
import { cx } from "@/lib/format";
import { Dot, Pill } from "./ui";

export type AppView = "command" | "workspace";

export function Header({
  modelProvider,
  model,
  dataReady,
  view,
  onViewChange,
}: {
  modelProvider: string;
  model: string;
  dataReady: boolean;
  view: AppView;
  onViewChange: (v: AppView) => void;
}) {
  const isMock = modelProvider.toLowerCase().includes("mock");
  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-base/85 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-3">
          {/* Mark (NVIDIA-inspired, not NVIDIA-branded) */}
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-accent/40 bg-gradient-to-br from-accent/20 to-cyan/10">
            <Activity size={18} className="text-accent" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent animate-pulseline" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-semibold leading-tight text-ink">
                Signal-to-Action Agent
              </h1>
              <span className="hidden rounded border border-edge bg-surface2 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wider text-faint sm:inline">
                v0.1 · MVP
              </span>
            </div>
            <p className="text-[11px] leading-tight text-muted">
              Sovereign multi-agent workflow for enterprise next-best actions
            </p>
          </div>
        </div>

        {/* View switch: Executive Command Center vs detailed Workspace */}
        <div className="flex items-center rounded-lg border border-edge bg-surface2/60 p-0.5">
          <ViewTab
            active={view === "command"}
            onClick={() => onViewChange("command")}
            icon={<LayoutDashboard size={13} />}
            label="Command Center"
          />
          <ViewTab
            active={view === "workspace"}
            onClick={() => onViewChange("workspace")}
            icon={<Columns3 size={13} />}
            label="Workspace"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Pill
            className="border-accent/40 bg-accent/10 text-accent"
            title="Architected for NVIDIA NIM / Nemotron runtime — set MODEL_PROVIDER=nvidia to switch"
          >
            <Dot className="bg-accent animate-pulseline" />
            NVIDIA-ready runtime
          </Pill>
          <Pill
            className="border-cyan/40 bg-cyan/10 text-cyan"
            title={`Active model adapter: ${modelProvider} · ${model}`}
          >
            <Cpu size={12} />
            {isMock ? "Inference-only MVP" : "Live inference"}
          </Pill>
          <Pill
            className="border-amber/40 bg-amber/10 text-amber"
            title="No action executes without an explicit human decision"
          >
            <ShieldCheck size={12} />
            Human approval required
          </Pill>
          <Pill
            className={cx(
              dataReady ? "border-edge bg-surface2 text-muted" : "border-risk/40 bg-risk/10 text-risk",
            )}
            title={dataReady ? "100% synthetic dataset — no real customer records" : "Dataset not generated"}
          >
            <FlaskConical size={12} className={dataReady ? "text-accent" : "text-risk"} />
            {dataReady ? "Synthetic data" : "No data"}
          </Pill>
        </div>
      </div>
    </header>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-accent/15 text-accent shadow-glow-soft" : "text-faint hover:text-muted",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
