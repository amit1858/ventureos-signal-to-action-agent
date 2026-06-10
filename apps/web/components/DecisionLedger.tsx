import { ScrollText, AlertTriangle, Lock } from "lucide-react";
import type { ReactNode } from "react";
import type { DecisionLedger } from "@/lib/types";
import { approvalTone, cx, pct, timeAgo, titleCase } from "@/lib/format";
import { AgentTrace } from "./AgentTrace";
import { Mono, PanelTitle } from "./ui";

function LedgerRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex gap-3 px-2.5 py-1.5">
      <dt className="w-24 shrink-0 text-faint">{k}</dt>
      <dd className="min-w-0 flex-1 break-words text-muted">{v}</dd>
    </div>
  );
}

export function DecisionLedgerView({ ledger }: { ledger: DecisionLedger }) {
  const appr = approvalTone(ledger.approval_status);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScrollText size={14} className="text-cyan" />
          <span className="text-sm font-semibold text-ink">Decision Ledger</span>
          <span className="inline-flex items-center gap-1 rounded border border-edge bg-surface2 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
            <Lock size={9} /> Auditable
          </span>
        </div>
        <Mono className="shrink-0 text-[10px] text-faint">{ledger.ledger_id}</Mono>
      </div>

      {/* Auditable metadata record */}
      <dl className="divide-y divide-edge/60 overflow-hidden rounded-lg border border-edge bg-surface2/40 text-[11px]">
        <LedgerRow
          k="Timestamp"
          v={
            <span className="font-mono">
              {new Date(ledger.timestamp).toLocaleString()} · {timeAgo(ledger.timestamp)}
            </span>
          }
        />
        <LedgerRow k="User query" v={ledger.user_query} />
        <LedgerRow
          k="Agents"
          v={ledger.agents_invoked.map((a) => titleCase(a)).join(" → ")}
        />
        <LedgerRow
          k="Data source"
          v={
            <span
              className={cx(
                "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium",
                (ledger.data_source ?? "").includes("HubSpot")
                  ? "border-cyan/40 bg-cyan/10 text-cyan"
                  : "border-edge bg-surface2 text-muted",
              )}
            >
              {ledger.data_source ?? "Synthetic local dataset"}
            </span>
          }
        />
        <LedgerRow k="Outcome" v={ledger.final_recommendation} />
      </dl>

      <p className="text-xs leading-relaxed text-muted">{ledger.reasoning_summary}</p>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-edge bg-surface2/60 px-2 py-1.5 text-center">
          <div className="font-mono text-sm font-semibold text-ink">
            {ledger.agents_invoked.length}
          </div>
          <div className="text-[9px] uppercase tracking-wider text-faint">Agents</div>
        </div>
        <div className="rounded-lg border border-edge bg-surface2/60 px-2 py-1.5 text-center">
          <div className="font-mono text-sm font-semibold text-ink">{ledger.evidence_used}</div>
          <div className="text-[9px] uppercase tracking-wider text-faint">Evidence</div>
        </div>
        <div className="rounded-lg border border-edge bg-surface2/60 px-2 py-1.5 text-center">
          <div className="font-mono text-sm font-semibold text-accent">
            {pct(ledger.confidence_score)}
          </div>
          <div className="text-[9px] uppercase tracking-wider text-faint">Confidence</div>
        </div>
      </div>

      <div>
        <PanelTitle>Agent workflow trace</PanelTitle>
        <div className="mt-2">
          <AgentTrace steps={ledger.steps} />
        </div>
      </div>

      {ledger.caveats.length > 0 ? (
        <div className="rounded-lg border border-amber/30 bg-amber/5 p-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-amber">
            <AlertTriangle size={12} />
            Governance caveats
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-[11px] leading-relaxed text-muted">
            {ledger.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-edge pt-2 text-[10px] text-faint">
        <span>
          Provider <span className="font-mono text-muted">{ledger.model_provider}</span> ·{" "}
          {ledger.latency_ms}ms
        </span>
        <span className={cx("rounded-full border px-2 py-0.5 font-medium", appr.cls)}>
          {appr.label}
        </span>
      </div>
    </div>
  );
}
