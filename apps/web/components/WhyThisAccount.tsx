"use client";

import { AlertTriangle, TrendingUp, Minus, Zap, Clock, Sparkles, ShieldAlert } from "lucide-react";
import type { Account, Recommendation } from "@/lib/types";
import { reasonForRecommendation, type ImpactDetail, type Level } from "@/lib/reasoning";
import { type ReasonTone } from "@/lib/portfolio";
import { cx, inrCompact } from "@/lib/format";

function toneClasses(tone: ReasonTone): { text: string; Icon: typeof AlertTriangle } {
  if (tone === "risk") return { text: "text-risk", Icon: AlertTriangle };
  if (tone === "opp") return { text: "text-accent", Icon: TrendingUp };
  return { text: "text-faint", Icon: Minus };
}

// "High is bad" colour ramp (churn risk).
function riskLevelClass(l: Level): string {
  return l === "High" ? "text-risk" : l === "Medium" ? "text-amber" : "text-accent";
}
// "High is good" colour ramp (expansion).
function goodLevelClass(l: Level): string {
  return l === "High" ? "text-accent" : l === "Medium" ? "text-amber" : "text-faint";
}
function confidenceClass(l: Level): string {
  return l === "High" ? "text-accent" : l === "Medium" ? "text-amber" : "text-risk";
}

// Full deterministic narrative for a recommendation: why this account, the
// business impact, the recommended action, and the why-now / if-ignored /
// expected-outcome story. Used in the decision workspace.
export function WhyThisAccount({ rec, account }: { rec: Recommendation; account?: Account }) {
  const r = reasonForRecommendation(rec, account);
  const Action = r.action.icon;

  return (
    <div className="space-y-3.5">
      {/* Why this account */}
      <div>
        <div className="section-label text-ink">Why this account?</div>
        <ul className="mt-2 space-y-1.5">
          {r.reasons.length > 0 ? (
            r.reasons.map((reason) => {
              const tc = toneClasses(reason.tone);
              return (
                <li key={reason.key} className="flex items-start gap-2 text-xs leading-snug text-muted">
                  <tc.Icon size={13} className={cx("mt-0.5 shrink-0", tc.text)} />
                  <span>{reason.text}</span>
                </li>
              );
            })
          ) : (
            <li className="text-xs leading-snug text-muted">{rec.priority_reason}</li>
          )}
        </ul>
      </div>

      {/* Business impact */}
      <BusinessImpactCard impact={r.impact} />

      {/* Recommended action */}
      <div className={cx("rounded-lg border p-3", r.action.ring, r.action.bg)}>
        <div className="flex items-start gap-2.5">
          <Action size={17} className={cx("mt-0.5 shrink-0", r.action.tone)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-faint">Recommended action</span>
              <span
                className={cx(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                  r.action.ring,
                  r.action.tone,
                )}
              >
                <Zap size={9} /> {r.action.urgencyLabel}
              </span>
            </div>
            <div className="mt-1 text-sm font-semibold text-ink">{r.action.label}</div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{r.action.value}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
              <span className="inline-flex items-center gap-1">
                <Clock size={11} /> Timing: {r.timing}
              </span>
              {r.estimatedMinutes > 0 ? <span>~{r.estimatedMinutes} min</span> : null}
            </div>
          </div>
        </div>
      </div>

      {/* Why now / If ignored / Expected outcome */}
      <div className="space-y-2">
        <NarrativeRow icon={Clock} tone="text-cyan" label="Why now" text={r.whyNow} />
        <NarrativeRow icon={ShieldAlert} tone="text-risk" label="If ignored" text={r.ifIgnored} />
        <NarrativeRow icon={Sparkles} tone="text-accent" label="Expected outcome" text={r.expectedOutcome} />
      </div>
    </div>
  );
}

function BusinessImpactCard({ impact }: { impact: ImpactDetail }) {
  const revenueLabel =
    impact.revenue.kind === "risk"
      ? "Revenue at risk"
      : impact.revenue.kind === "growth"
        ? "Growth upside"
        : "Revenue impact";
  const revenueTone =
    impact.revenue.kind === "risk" ? "text-risk" : impact.revenue.kind === "growth" ? "text-accent" : "text-faint";
  const revenueValue = impact.revenue.amount > 0 ? inrCompact(impact.revenue.amount) : "Stable";

  return (
    <div className="rounded-lg border border-edge bg-surface2/50 p-3">
      <div className="section-label text-ink">Business impact</div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ImpactStat label="Churn risk" value={impact.churnRisk} tone={riskLevelClass(impact.churnRisk)} />
        <ImpactStat label={revenueLabel} value={revenueValue} tone={revenueTone} />
        <ImpactStat label="Expansion" value={impact.expansion} tone={goodLevelClass(impact.expansion)} />
        <ImpactStat label="Confidence" value={impact.confidence} tone={confidenceClass(impact.confidence)} />
      </div>
      <p className={cx("mt-2 text-xs font-medium", toneClasses(impact.headlineTone).text)}>{impact.headline}</p>
    </div>
  );
}

function ImpactStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-md border border-edge bg-surface px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-faint">{label}</div>
      <div className={cx("mt-0.5 text-sm font-semibold", tone)}>{value}</div>
    </div>
  );
}

function NarrativeRow({
  icon: Icon,
  tone,
  label,
  text,
}: {
  icon: typeof Clock;
  tone: string;
  label: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={13} className={cx("mt-0.5 shrink-0", tone)} />
      <p className="text-xs leading-relaxed text-muted">
        <span className="font-semibold text-ink">{label}: </span>
        {text}
      </p>
    </div>
  );
}
