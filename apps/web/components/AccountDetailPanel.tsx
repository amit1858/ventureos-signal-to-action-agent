"use client";

import * as React from "react";
import { Building2, Radio, StickyNote, ArrowDownRight, ArrowUpRight, Sparkles, ArrowRight, Lock, ShieldCheck, FileSearch } from "lucide-react";
import type { AccountDetail, Recommendation } from "@/lib/types";
import { cx, money, titleCase } from "@/lib/format";
import type { AIOverlay } from "@/lib/aiOverlay";
import { providerLabel } from "@/lib/aiOverlay";
import { GeneratedWithBadge } from "@/components/AIReasoningStatus";
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
  overlay,
}: {
  rec: Recommendation;
  detail: AccountDetail | null;
  loading: boolean;
  overlay?: AIOverlay | null;
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

      {/* Phase 6 · Reasoning Source flow + optional AI interpretation. */}
      <AIInterpretation overlay={overlay ?? null} />
    </div>
  );
}

// Phase 6 · The explicit Evidence → AI → Action → Approval flow strip plus
// the AI-generated executive summary / reasoning when an overlay is present.
function AIInterpretation({ overlay }: { overlay: AIOverlay | null }) {
  return (
    <div className="space-y-3 border-t border-edge pt-3">
      <PanelTitle right={overlay ? <GeneratedWithBadge provider={overlay.provider} model={overlay.model} /> : null}>
        Reasoning source
      </PanelTitle>
      <ol className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-muted">
        <FlowStep icon={<FileSearch size={11} />} label="Deterministic Evidence" tone="brand" />
        <FlowArrow />
        <FlowStep
          icon={<Sparkles size={11} />}
          label="AI Interpretation"
          tone={overlay ? "accent" : "faint"}
        />
        <FlowArrow />
        <FlowStep icon={<ArrowRight size={11} />} label="Suggested Action" tone="brand" />
        <FlowArrow />
        <FlowStep icon={<ShieldCheck size={11} />} label="Human Approval" tone="amber" />
      </ol>

      {overlay ? (
        <div className="rounded-xl border border-accent/25 bg-accent/[0.05] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">
            AI interpretation · {providerLabel(overlay.provider)}
          </div>
          {overlay.executive_summary ? (
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink">{overlay.executive_summary}</p>
          ) : null}
          {overlay.business_implication ? (
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              <span className="text-faint">Business implication · </span>
              {overlay.business_implication}
            </p>
          ) : null}
          {overlay.conversation_strategy?.length ? (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wider text-faint">Conversation strategy</div>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] leading-relaxed text-muted">
                {overlay.conversation_strategy.slice(0, 3).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {overlay.opening_line ? (
            <div className="mt-2 rounded-lg border border-edge bg-bg/40 p-2">
              <div className="text-[10px] uppercase tracking-wider text-faint">Suggested opening line</div>
              <p className="mt-0.5 text-[12px] italic leading-relaxed text-ink">&ldquo;{overlay.opening_line}&rdquo;</p>
            </div>
          ) : null}
          {overlay.caveats?.length ? (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-faint">
              <Lock size={10} className="mt-0.5 shrink-0" />
              <span>{overlay.caveats.join(" · ")}</span>
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-[11px] leading-relaxed text-faint">
          Evidence and the governed recommendation above were generated by the deterministic
          engine. Activate a BYOK provider in <span className="text-muted">Trust &amp; Governance</span> to
          enrich this view with AI interpretation.
        </p>
      )}
    </div>
  );
}

function FlowStep({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "brand" | "accent" | "amber" | "faint";
}) {
  const cls =
    tone === "accent"
      ? "border-accent/40 bg-accent/10 text-accent"
      : tone === "amber"
      ? "border-amber/40 bg-amber/10 text-amber"
      : tone === "faint"
      ? "border-edge bg-surface2/40 text-faint"
      : "border-brand/35 bg-brand/10 text-brand-bright";
  return (
    <li className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5", cls)}>
      {icon}
      <span>{label}</span>
    </li>
  );
}

function FlowArrow() {
  return <span className="text-faint" aria-hidden>→</span>;
}
