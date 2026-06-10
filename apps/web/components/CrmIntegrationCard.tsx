"use client";

import * as React from "react";
import {
  Plug,
  PlugZap,
  Loader2,
  RefreshCw,
  CloudDownload,
  CheckCircle2,
  ShieldAlert,
  Database,
  AlertTriangle,
  Undo2,
} from "lucide-react";
import type { HubspotStatus } from "@/lib/types";
import { cx, timeAgo } from "@/lib/format";
import { Card, PanelTitle } from "./ui";

type Busy = "test" | "seed" | "sync" | "revert" | null;

function StatusPill({ status, error }: { status: HubspotStatus | null; error: string | null }) {
  let cls = "border-edge bg-surface2 text-faint";
  let dot = "bg-faint";
  let label = "Loading…";
  if (error) {
    cls = "border-risk/40 bg-risk/10 text-risk";
    dot = "bg-risk";
    label = "Sync failed";
  } else if (status) {
    if (!status.enabled) {
      cls = "border-edge bg-surface2 text-faint";
      dot = "bg-faint";
      label = "Not configured";
    } else if (!status.configured) {
      cls = "border-amber/40 bg-amber/10 text-amber";
      dot = "bg-amber";
      label = "Token required";
    } else if (status.connected) {
      cls = "border-accent/40 bg-accent/10 text-accent";
      dot = "bg-accent";
      label = "Connected";
    } else {
      cls = "border-cyan/40 bg-cyan/10 text-cyan";
      dot = "bg-cyan";
      label = "Configured";
    }
  }
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold", cls)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

function CrmButton({
  onClick,
  busy,
  disabled,
  icon,
  children,
  variant = "ghost",
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  variant?: "ghost" | "primary";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className={cx(
        "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary"
          ? "border-accent/50 bg-accent/15 text-accent hover:bg-accent/25"
          : "border-edge bg-surface2/60 text-muted hover:border-accent/40 hover:text-ink",
      )}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function CrmIntegrationCard({
  status,
  busy,
  error,
  onTest,
  onSeed,
  onSync,
  onRevert,
}: {
  status: HubspotStatus | null;
  busy: Busy;
  error: string | null;
  onTest: () => void;
  onSeed: () => void;
  onSync: () => void;
  onRevert: () => void;
}) {
  const enabled = !!status?.enabled;
  const configured = !!status?.configured;
  const connected = !!status?.connected;
  const writeback = !!status?.writeback_enabled;
  const isHubspot = status?.active_source === "hubspot";
  const records = status?.records ?? {};
  const recordTotal = Object.values(records).reduce((a, b) => a + (b || 0), 0);

  return (
    <Card className="p-4">
      <PanelTitle right={isHubspot ? <PlugZap size={13} className="text-accent" /> : <Plug size={13} className="text-muted" />}>
        CRM Integration
      </PanelTitle>

      {/* Status + data source mode */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <StatusPill status={status} error={error} />
        <span
          className={cx(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium",
            isHubspot ? "border-cyan/40 bg-cyan/10 text-cyan" : "border-edge bg-surface2 text-muted",
          )}
          title="Active data source for the workflow"
        >
          <Database size={11} />
          {isHubspot ? "HubSpot test CRM" : "Synthetic local"}
        </span>
      </div>

      {/* Contextual copy */}
      {!enabled ? (
        <p className="mt-2 text-[10px] leading-relaxed text-faint">
          HubSpot connector is available but not configured. Set{" "}
          <span className="font-mono text-muted">HUBSPOT_ENABLED=true</span> to begin.
        </p>
      ) : !configured ? (
        <p className="mt-2 text-[10px] leading-relaxed text-amber/90">
          Add <span className="font-mono">HUBSPOT_ACCESS_TOKEN</span> to enable test CRM integration.
        </p>
      ) : error ? (
        <p className="mt-2 flex items-start gap-1 text-[10px] leading-relaxed text-risk">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : (
        <p className="mt-2 flex items-center gap-1 text-[10px] leading-relaxed text-muted">
          {connected ? <CheckCircle2 size={11} className="text-accent" /> : null}
          {status?.message}
        </p>
      )}

      {/* Sync telemetry */}
      {isHubspot ? (
        <div className="mt-2.5 rounded-lg border border-edge bg-surface2/40 px-2.5 py-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-faint">Last sync</span>
            <span className="font-mono text-muted">
              {status?.last_synced_at ? timeAgo(status.last_synced_at) : "—"}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {[
              ["Companies", records.companies],
              ["Contacts", records.contacts],
              ["Deals", records.deals],
              ["Activities", records.activities],
            ]
              .filter(([, v]) => v != null)
              .map(([k, v]) => (
                <span key={k as string} className="rounded border border-edge bg-surface px-1.5 py-0.5 text-[9px] text-muted">
                  <span className="font-mono text-ink">{v as number}</span> {k}
                </span>
              ))}
            {recordTotal === 0 ? <span className="text-[9px] text-faint">No records loaded yet</span> : null}
          </div>
          {status?.portal_id ? (
            <div className="mt-1 text-[9px] text-faint">
              Portal <span className="font-mono">{status.portal_id}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Controls */}
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <CrmButton onClick={onTest} busy={busy === "test"} disabled={!enabled || !configured} icon={<PlugZap size={13} />}>
          Test connection
        </CrmButton>
        <CrmButton
          onClick={onSync}
          busy={busy === "sync"}
          disabled={!enabled || !configured}
          icon={<RefreshCw size={13} />}
          variant="primary"
        >
          Sync from HubSpot
        </CrmButton>
        <CrmButton
          onClick={onSeed}
          busy={busy === "seed"}
          disabled={!enabled || !configured || !writeback}
          icon={<CloudDownload size={13} />}
        >
          Seed demo data
        </CrmButton>
        {isHubspot ? (
          <CrmButton onClick={onRevert} busy={busy === "revert"} icon={<Undo2 size={13} />}>
            Use synthetic
          </CrmButton>
        ) : (
          <div className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-edge px-2 py-2 text-[10px] text-faint">
            <ShieldAlert size={12} className="text-amber/70" />
            {enabled && configured && !writeback ? "Seed needs write-back" : "Read-only"}
          </div>
        )}
      </div>

      <p className="mt-2 text-[9px] leading-relaxed text-faint">
        Test CRM only. Synthetic records, no real customer data. Write-back requires{" "}
        <span className="font-mono">HUBSPOT_WRITEBACK_ENABLED=true</span> and human approval.
      </p>
    </Card>
  );
}
