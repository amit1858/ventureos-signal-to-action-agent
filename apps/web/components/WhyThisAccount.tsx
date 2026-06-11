"use client";

import { AlertTriangle, TrendingUp, Minus, Zap } from "lucide-react";
import type { Account, Recommendation } from "@/lib/types";
import { businessAction } from "@/lib/actions";
import { accountReasons, businessImpact, type ReasonTone } from "@/lib/portfolio";
import { cx } from "@/lib/format";

function toneClasses(tone: ReasonTone): { text: string; Icon: typeof AlertTriangle } {
  if (tone === "risk") return { text: "text-risk", Icon: AlertTriangle };
  if (tone === "opp") return { text: "text-accent", Icon: TrendingUp };
  return { text: "text-faint", Icon: Minus };
}

// Premium "Why this account?" narrative — concrete reasons, business impact,
// and the recommended business action. Used in the decision workspace.
export function WhyThisAccount({ rec, account }: { rec: Recommendation; account?: Account }) {
  const reasons = account ? accountReasons(account) : [];
  const impact = account ? businessImpact(account) : null;
  const ba = businessAction(rec.action_type, {
    governanceStatus: rec.governance_status,
    growthPotential: account?.growth_potential_score,
    productUsage: account?.product_usage_score,
  });
  const Action = ba.icon;
  const impactTone = impact ? toneClasses(impact.tone) : null;

  return (
    <div className="space-y-3">
      <div>
        <div className="section-label text-ink">Why this account?</div>
        <ul className="mt-2 space-y-1.5">
          {reasons.length > 0 ? (
            reasons.map((r) => {
              const tc = toneClasses(r.tone);
              return (
                <li key={r.key} className="flex items-start gap-2 text-xs leading-snug text-muted">
                  <tc.Icon size={13} className={cx("mt-0.5 shrink-0", tc.text)} />
                  <span>{r.text}</span>
                </li>
              );
            })
          ) : (
            <li className="text-xs leading-snug text-muted">{rec.priority_reason}</li>
          )}
        </ul>
      </div>

      {impact && impactTone ? (
        <div className="flex items-center gap-2 rounded-lg border border-edge bg-surface2/50 px-3 py-2">
          <span className="text-[10px] uppercase tracking-wider text-faint">Business impact</span>
          <span className={cx("text-xs font-medium", impactTone.text)}>{impact.text}</span>
        </div>
      ) : null}

      <div className={cx("rounded-lg border p-3", ba.ring, ba.bg)}>
        <div className="flex items-start gap-2.5">
          <Action size={17} className={cx("mt-0.5 shrink-0", ba.tone)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink">{ba.label}</span>
              <span
                className={cx(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                  ba.ring,
                  ba.tone,
                )}
              >
                <Zap size={9} /> {ba.urgencyLabel}
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{ba.value}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-faint">{rec.recommended_action}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
