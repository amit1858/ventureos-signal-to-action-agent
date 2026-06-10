"use client";

import * as React from "react";
import {
  ListChecks,
  StickyNote,
  Loader2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  PlugZap,
} from "lucide-react";
import type { HubspotStatus, HubspotWriteback as Writeback } from "@/lib/types";
import { cx, timeAgo } from "@/lib/format";
import { PanelTitle } from "./ui";

export function HubspotWriteback({
  status,
  writebacks,
  busy,
  error,
  onTask,
  onNote,
  visible = true,
}: {
  status: HubspotStatus | null;
  writebacks: Writeback[];
  busy: "task" | "note" | null;
  error: string | null;
  onTask: () => void;
  onNote: () => void;
  visible?: boolean;
}) {
  if (!visible) return null;
  const enabled = !!status?.enabled;
  const configured = !!status?.configured;
  const writeback = !!status?.writeback_enabled;
  const canWrite = enabled && configured && writeback;

  return (
    <div className="border-t border-edge pt-3">
      <PanelTitle right={<PlugZap size={13} className={canWrite ? "text-accent" : "text-faint"} />}>
        Create HubSpot follow-up
      </PanelTitle>

      {!canWrite ? (
        <p className="mt-2 rounded-lg border border-edge bg-surface2/40 px-2.5 py-2 text-[10px] leading-relaxed text-faint">
          {!enabled
            ? "HubSpot connector is available but not configured."
            : !configured
              ? "Add HUBSPOT_ACCESS_TOKEN to enable test CRM write-back."
              : "Enable HUBSPOT_WRITEBACK_ENABLED=true to write a task/note to the HubSpot test instance."}
        </p>
      ) : (
        <>
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted">
            <ShieldCheck size={12} className="text-accent" />
            Approved — you may write back to the HubSpot test instance.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              onClick={onTask}
              disabled={!!busy}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-accent/50 bg-accent/15 px-2 py-2 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "task" ? <Loader2 size={13} className="animate-spin" /> : <ListChecks size={13} />}
              Create HubSpot task
            </button>
            <button
              onClick={onNote}
              disabled={!!busy}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-edge bg-surface2/60 px-2 py-2 text-[11px] font-semibold text-muted transition-colors hover:border-accent/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "note" ? <Loader2 size={13} className="animate-spin" /> : <StickyNote size={13} />}
              Create HubSpot note
            </button>
          </div>
        </>
      )}

      {error ? (
        <p className="mt-2 flex items-start gap-1 rounded-lg border border-risk/30 bg-risk/5 px-2.5 py-1.5 text-[10px] leading-relaxed text-risk">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}

      {/* Results */}
      {writebacks.length > 0 ? (
        <div className="mt-2.5 space-y-2">
          {writebacks.map((wb, i) => (
            <WritebackResultCard key={`${wb.external_id}-${i}`} wb={wb} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WritebackResultCard({ wb }: { wb: Writeback }) {
  const preview = Object.entries(wb.payload_preview || {});
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/[0.04] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent">
          <CheckCircle2 size={13} />
          HubSpot {wb.object_type} created
        </span>
        <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
          {wb.status}
        </span>
      </div>

      <dl className="mt-2 space-y-1 text-[10px]">
        <Row k="Object type" v={<span className="font-mono text-muted">{wb.object_type}</span>} />
        <Row
          k="External id"
          v={
            wb.hubspot_url ? (
              <a
                href={wb.hubspot_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-cyan hover:underline"
              >
                {wb.external_id}
                <ExternalLink size={10} />
              </a>
            ) : (
              <span className="font-mono text-muted">{wb.external_id ?? "—"}</span>
            )
          }
        />
        <Row
          k="Created"
          v={
            <span className="font-mono text-muted">
              {wb.created_at ? timeAgo(wb.created_at) : "—"}
            </span>
          }
        />
        {wb.portal_id ? <Row k="Portal" v={<span className="font-mono text-muted">{wb.portal_id}</span>} /> : null}
      </dl>

      {preview.length > 0 ? (
        <div className="mt-2 rounded-md border border-edge bg-surface/80 p-2">
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-faint">
            Payload preview
          </div>
          {preview.map(([k, v]) => (
            <div key={k} className="text-[10px] leading-relaxed">
              <span className="font-mono text-cyan">{k}</span>{" "}
              <span className="text-muted">{v}</span>
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-2 flex items-start gap-1 text-[9px] leading-relaxed text-faint">
        <ShieldCheck size={10} className="mt-0.5 shrink-0 text-accent/70" />
        {wb.safety_note}
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-faint">{k}</dt>
      <dd className="min-w-0 truncate text-right">{v}</dd>
    </div>
  );
}
