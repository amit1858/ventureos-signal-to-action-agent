"use client";

import * as React from "react";
import { Building2, Radio, StickyNote, ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { AccountDetail, Recommendation } from "@/lib/types";
import { cx, money, titleCase } from "@/lib/format";
import { Bar, PanelTitle } from "./ui";

function MoM({ cur, prev }: { cur: number; prev: number }) {
  const delta = prev > 0 ? (cur - prev) / prev : 0;
  const down = delta < 0;
  return (
    <span className={cx("inline-flex items-center gap-0.5 font-mono text-xs", down ? "text-risk" : "text-accent")}>
      {down ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
      {(delta * 100).toFixed(0)}%
    </span>
  );
}

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-edge bg-surface2/50 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider text-faint">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-mono text-sm font-semibold text-ink">{value}</span>
        {sub}
      </div>
    </div>
  );
}

const DRIVER_LABELS: Record<string, string> = {
  support_risk: "Support risk",
  spend_decline: "Spend decline",
  growth_potential: "Expansion potential",
  renewal_urgency: "Renewal urgency",
  campaign_response: "Campaign response",
  engagement_gap: "Engagement gap",
  last_contact_gap: "Last-contact gap",
};

export function AccountDetailPanel({
  rec,
  detail,
  loading,
}: {
  rec: Recommendation;
  detail: AccountDetail | null;
  loading: boolean;
}) {
  const drivers = Object.entries(rec.score_breakdown).filter(([k]) => k !== "priority_score");

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-edge bg-surface2">
          <Building2 size={18} className="text-muted" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ink">{rec.account_name}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {detail ? (
              <>
                <span className="chip">{detail.segment}</span>
                <span className="chip">{detail.industry}</span>
                <span className="chip">{detail.region}</span>
              </>
            ) : (
              <span className="font-mono text-[11px] text-faint">{rec.account_id}</span>
            )}
          </div>
        </div>
      </div>

      {/* Key metrics */}
      {detail ? (
        <div className="grid grid-cols-3 gap-2">
          <Metric
            label="Current Investment"
            value={money(detail.current_month_spend)}
            sub={<MoM cur={detail.current_month_spend} prev={detail.previous_month_spend} />}
          />
          <Metric label="Product Adoption" value={detail.product_usage_score.toFixed(0)} />
          <Metric label="Customer Engagement" value={detail.engagement_score.toFixed(0)} />
          <Metric label="Support Risk" value={detail.support_risk_score.toFixed(0)} />
          <Metric label="Expansion Potential" value={detail.growth_potential_score.toFixed(0)} />
          <Metric label="Campaign Response" value={detail.campaign_response_score.toFixed(0)} />
          <Metric label="Last Touch" value={`${detail.last_contact_days}d`} />
          <Metric
            label="Renewal Window"
            value={detail.renewal_days < 0 ? `${Math.abs(detail.renewal_days)}d late` : `${detail.renewal_days}d`}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-edge bg-surface2/40 px-3 py-4 text-center text-xs text-faint">
          {loading ? "Loading account metrics…" : "Account metrics unavailable."}
        </div>
      )}

      {/* Score breakdown */}
      <div>
        <PanelTitle>Priority score drivers</PanelTitle>
        <ul className="mt-2 space-y-1.5">
          {drivers
            .sort((a, b) => (b[1] as number) - (a[1] as number))
            .map(([k, v]) => (
              <li key={k} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-[11px] text-muted">{DRIVER_LABELS[k] ?? titleCase(k)}</span>
                <Bar value={v as number} barClass={(v as number) >= 0.5 ? "bg-accent" : "bg-accent/50"} />
                <span className="w-8 shrink-0 text-right font-mono text-[10px] text-faint">
                  {Math.round((v as number) * 100)}
                </span>
              </li>
            ))}
        </ul>
      </div>

      {/* Signals */}
      {detail && detail.signals.length > 0 ? (
        <div>
          <PanelTitle right={<Radio size={13} className="text-cyan" />}>
            Signals ({detail.signals.length})
          </PanelTitle>
          <ul className="mt-2 space-y-1.5">
            {detail.signals.slice(0, 6).map((s) => (
              <li key={s.signal_id} className="rounded-lg border border-edge bg-surface2/40 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cx(
                      "inline-flex items-center gap-1 text-[11px] font-medium",
                      s.positive_or_negative === "positive"
                        ? "text-accent"
                        : s.positive_or_negative === "negative"
                          ? "text-risk"
                          : "text-muted",
                    )}
                  >
                    {titleCase(s.signal_type)}
                  </span>
                  <span className="font-mono text-[10px] text-faint">{s.signal_date}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{s.signal_description}</p>
                <div className="mt-1 flex items-center gap-2 text-[9px] uppercase tracking-wider text-faint">
                  <span>{s.source_system}</span>
                  <span className="h-2 w-px bg-edge" />
                  <span>strength {Math.round(s.signal_strength * 100)}%</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Notes */}
      {detail && detail.notes.length > 0 ? (
        <div>
          <PanelTitle right={<StickyNote size={13} className="text-muted" />}>
            Notes ({detail.notes.length})
          </PanelTitle>
          <ul className="mt-2 space-y-1.5">
            {detail.notes.slice(0, 3).map((n, i) => (
              <li key={i} className="rounded-lg border border-edge bg-surface2/40 px-2.5 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan">
                    {n.note_type}
                  </span>
                  <span className="font-mono text-[10px] text-faint">{n.created_date}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{n.note_text}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
