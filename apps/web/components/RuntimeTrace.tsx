"use client";

import * as React from "react";
import { ChevronUp, Gauge, Cpu, Workflow, Server, ArrowRight } from "lucide-react";
import type { DecisionLedger } from "@/lib/types";
import { cx } from "@/lib/format";
import { useExperienceMode } from "@/lib/experienceMode";

export function RuntimeTrace({
  ledger,
  apiBaseUrl,
  dataSource,
  lastSyncedAt,
}: {
  ledger: DecisionLedger | null;
  apiBaseUrl: string;
  dataSource?: string;
  lastSyncedAt?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [experienceMode] = useExperienceMode();
  const showEngineering = experienceMode === "operations";
  const isMock = (ledger?.model_provider ?? "mock").toLowerCase().includes("mock");
  const ran = !!ledger;
  const source = ledger?.data_source ?? dataSource ?? "Synthetic local dataset";
  const isHubspot = source.includes("HubSpot");

  return (
    <div className="sticky bottom-0 z-30 border-t border-edge bg-base/90 backdrop-blur">
      {/* Expanded detail */}
      <div
        className={cx(
          "overflow-hidden transition-all duration-300",
          open ? "max-h-[420px]" : "max-h-0",
        )}
      >
        <div className="grid gap-3 px-5 py-4 lg:grid-cols-3">
          {/* Agents invoked */}
          <div className="rounded-xl border border-edge bg-surface p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
              <Workflow size={13} className="text-cyan" /> Agents invoked
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(ledger?.agents_invoked ?? []).map((a, i) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 rounded-md border border-edge bg-surface2 px-2 py-1 text-[11px] text-muted"
                >
                  <span className="font-mono text-[9px] text-faint">{i + 1}</span>
                  {a}
                </span>
              ))}
            </div>
          </div>

          {/* Runtime metrics */}
          <div className="rounded-xl border border-edge bg-surface p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
              <Gauge size={13} className="text-accent" /> Runtime
            </div>
            <dl className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-muted">Total latency</dt>
                <dd className="font-mono font-semibold text-ink">{ledger?.latency_ms ?? "—"} ms</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">Model provider</dt>
                <dd className="font-mono text-cyan">{ledger?.model_provider ?? "mock"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">Evidence considered</dt>
                <dd className="font-mono text-ink">{ledger?.evidence_used ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">Data source</dt>
                <dd className={cx("font-mono text-[10px]", isHubspot ? "text-cyan" : "text-muted")}>
                  {isHubspot ? "HubSpot test CRM" : "Synthetic local"}
                  {isHubspot && lastSyncedAt ? <span className="text-faint"> · synced</span> : null}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">API endpoint</dt>
                <dd className="truncate font-mono text-[10px] text-faint">{apiBaseUrl}</dd>
              </div>
            </dl>
          </div>

          {/* NVIDIA integration status */}
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
              <Server size={13} /> NVIDIA-ready integration
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <span className="rounded-md border border-edge bg-surface2 px-2 py-1 font-mono">
                {isMock ? "mock_adapter" : ledger?.model_provider}
              </span>
              <ArrowRight size={13} className="text-faint" />
              <span className="rounded-md border border-accent/40 bg-accent/10 px-2 py-1 font-mono text-accent">
                nvidia_nim_adapter
              </span>
            </div>
            <dl className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-1 text-[10px] sm:grid-cols-2">
              {[
                ["Current provider", isMock ? "mock" : ledger?.model_provider ?? "mock"],
                ["NVIDIA target", "NIM / Nemotron"],
                ["Agent orchestration", "NeMo-ready contracts"],
                ["Optimization focus", "Latency · structured outputs · eval"],
                ["GPU-backed inference", "Planned"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2 border-b border-edge/40 py-0.5">
                  <dt className="text-faint">{k}</dt>
                  <dd className="text-right font-medium text-muted">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              Swap the model layer via <span className="font-mono text-muted">MODEL_PROVIDER=nvidia</span>{" "}
              with <span className="font-mono text-muted">NVIDIA_API_KEY</span>. Nemotron / NIM endpoints
              power reasoning &amp; summarization; NeMo Agent Toolkit can later formalize the orchestrator.
            </p>
          </div>
        </div>
      </div>

      {/* Collapsed status bar */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-2.5 text-left"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span
            className={cx(
              "flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-medium",
              ran
                ? "border-accent/30 bg-accent/5 text-accent"
                : "border-edge bg-surface2 text-faint",
            )}
          >
            <span
              className={cx(
                "h-1.5 w-1.5 rounded-full",
                ran ? "bg-accent animate-pulseline" : "bg-faint",
              )}
            />
            {ran ? "Workflow completed" : "Workflow idle"}
          </span>
          {showEngineering ? (
            <>
              <span className="flex items-center gap-1.5 text-muted">
                <Cpu size={13} className="text-cyan" />
                Provider <span className="font-mono text-cyan">{ledger?.model_provider ?? "mock"}</span>
              </span>
              <span className="flex items-center gap-1.5 text-muted">
                <Gauge size={13} className="text-accent" />
                <span className="font-mono text-ink">{ledger?.latency_ms ?? "—"} ms</span>
              </span>
              <span className="flex items-center gap-1.5 text-muted">
                <Workflow size={13} className="text-faint" />
                <span className="font-mono text-ink">{ledger?.agents_invoked.length ?? 0}</span> agents
              </span>
              <span className="hidden items-center gap-1.5 text-faint sm:flex">
                Runtime trace · NVIDIA integration path
              </span>
            </>
          ) : (
            <span className="hidden items-center gap-1.5 text-faint sm:flex">
              Governed decision engine · {ledger?.agents_invoked.length ?? 0} agents reviewed your portfolio
            </span>
          )}
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-faint">
          {open ? "Hide" : "Details"}
          <ChevronUp size={14} className={cx("transition-transform", open ? "" : "rotate-180")} />
        </span>
      </button>
    </div>
  );
}
