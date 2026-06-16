import * as React from "react";
import { Activity, LayoutDashboard, Columns3, Database, Gauge } from "lucide-react";
import { cx } from "@/lib/format";

export type AppView = "landing" | "command" | "workspace" | "evaluation";

// Slim, quiet product header (P4): brand mark (returns home) + the
// Landing → Command Center → Workspace journey + a single calm source
// indicator. Runtime/model/governance chips live in secondary locations.
export function Header({
  dataReady,
  view,
  onViewChange,
  onHome,
  dataSourceLabel,
  isHubspotSource,
  accountCount,
}: {
  dataReady: boolean;
  view: AppView;
  onViewChange: (v: AppView) => void;
  onHome: () => void;
  dataSourceLabel: string;
  isHubspotSource: boolean;
  accountCount: number;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-base/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1840px] flex-wrap items-center justify-between gap-3 px-5 py-3">
        {/* Brand mark — click to return to the landing experience */}
        <button
          type="button"
          onClick={onHome}
          className="group flex items-center gap-3 text-left"
          aria-label="Signal-to-Action Agent — home"
        >
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-brand/40 bg-gradient-to-br from-brand/25 to-brand/5 transition-colors group-hover:border-brand/70">
            <Activity size={18} className="text-brand-bright" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand animate-pulseline" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-semibold leading-tight text-ink">
                Signal-to-Action Agent
              </h1>
              <span className="hidden rounded border border-edge bg-surface2 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wider text-faint sm:inline">
                by VentureOS
              </span>
            </div>
            <p className="text-[11px] leading-tight text-muted">
              Sovereign multi-agent workflow for enterprise next-best actions
            </p>
          </div>
        </button>

        {/* Journey: Command Center → Workspace (hidden on the landing screen) */}
        {view !== "landing" ? (
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
            <ViewTab
              active={view === "evaluation"}
              onClick={() => onViewChange("evaluation")}
              icon={<Gauge size={13} />}
              label="Evaluation"
            />
          </div>
        ) : null}

        {/* Single calm source indicator (P4) */}
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-2 rounded-full border border-edge bg-surface2/70 px-3 py-1 text-[11px] font-medium text-muted"
            title={dataReady ? `Active data source: ${dataSourceLabel}` : "Dataset not generated"}
          >
            <span
              className={cx(
                "inline-block h-1.5 w-1.5 rounded-full",
                !dataReady ? "bg-risk" : isHubspotSource ? "bg-accent" : "bg-brand",
              )}
            />
            <Database size={12} className="text-faint" />
            {isHubspotSource ? "HubSpot test CRM" : "Synthetic dataset"}
            {dataReady ? (
              <>
                <span className="text-faint/40">·</span>
                <span className="font-mono text-ink">{accountCount}</span>
                <span className="text-faint">accounts</span>
              </>
            ) : null}
          </span>
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
        active ? "bg-brand/15 text-brand-bright shadow-glow-soft" : "text-faint hover:text-muted",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
