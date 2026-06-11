"use client";

import { ArrowRight, AlertTriangle, TrendingUp, Minus, FileSearch, Sparkles } from "lucide-react";
import type { Account, Recommendation } from "@/lib/types";
import { businessAction } from "@/lib/actions";
import { accountReasons, businessImpact, type ReasonTone } from "@/lib/portfolio";
import { cx, confidenceLabel, pct, titleCase } from "@/lib/format";

function toneText(tone: ReasonTone): { text: string; Icon: typeof AlertTriangle } {
  if (tone === "risk") return { text: "text-risk", Icon: AlertTriangle };
  if (tone === "opp") return { text: "text-accent", Icon: TrendingUp };
  return { text: "text-faint", Icon: Minus };
}

// The 10-second value: the top few recommendations rendered as premium cards
// that lead with WHY, business impact, and the recommended business action.
export function NextBestActions({
  recs,
  accountsById,
  hasResult,
  loading,
  onOpenAccount,
  onRun,
}: {
  recs: Recommendation[];
  accountsById: Record<string, Account>;
  hasResult: boolean;
  loading: boolean;
  onOpenAccount: (accountId: string) => void;
  onRun: () => void;
}) {
  if (!hasResult) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-edge bg-surface2/30 py-10 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-edge bg-surface2 text-faint">
          <Sparkles size={18} />
        </span>
        <div>
          <div className="text-sm font-medium text-ink">No recommendations yet</div>
          <div className="mt-0.5 max-w-xs text-xs text-faint">
            Run the workflow to surface the accounts that deserve attention — and why.
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={onRun} disabled={loading}>
          {loading ? "Analyzing…" : "Run analysis"}
        </button>
      </div>
    );
  }

  const top = recs.slice(0, 3);

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {top.map((rec) => {
        const account = accountsById[rec.account_id];
        const reasons = (account ? accountReasons(account) : []).slice(0, 4);
        const impact = account ? businessImpact(account) : null;
        const impactTone = impact ? toneText(impact.tone) : null;
        const ba = businessAction(rec.action_type, {
          governanceStatus: rec.governance_status,
          growthPotential: account?.growth_potential_score,
          productUsage: account?.product_usage_score,
        });
        const Action = ba.icon;

        return (
          <button
            key={rec.recommendation_id}
            type="button"
            onClick={() => onOpenAccount(rec.account_id)}
            className="hover-lift group flex flex-col rounded-xl border border-edge bg-surface p-4 text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-bold",
                    rec.priority_rank === 1
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-edge bg-surface2 text-muted",
                  )}
                >
                  {rec.priority_rank}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{rec.account_name}</div>
                  {account ? (
                    <div className="truncate text-[10px] text-faint">
                      {titleCase(account.industry)} · {account.region}
                    </div>
                  ) : null}
                </div>
              </div>
              <span
                className={cx(
                  "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                  ba.ring,
                  ba.tone,
                )}
              >
                {ba.urgencyLabel}
              </span>
            </div>

            {/* Action */}
            <div className={cx("mt-3 flex items-center gap-2 rounded-lg border px-2.5 py-2", ba.ring, ba.bg)}>
              <Action size={15} className={cx("shrink-0", ba.tone)} />
              <span className="text-xs font-semibold text-ink">{ba.label}</span>
            </div>

            {/* Why bullets */}
            <ul className="mt-3 flex-1 space-y-1.5">
              {reasons.map((r) => {
                const tc = toneText(r.tone);
                return (
                  <li key={r.key} className="flex items-start gap-1.5 text-[11px] leading-snug text-muted">
                    <tc.Icon size={12} className={cx("mt-0.5 shrink-0", tc.text)} />
                    <span className="line-clamp-1">{r.text}</span>
                  </li>
                );
              })}
            </ul>

            {impact && impactTone ? (
              <div className="mt-2.5 text-[11px] font-medium">
                <span className="text-faint">Impact: </span>
                <span className={impactTone.text}>{impact.text}</span>
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between border-t border-edge pt-2.5 text-[10px] text-faint">
              <span className="inline-flex items-center gap-1">
                <FileSearch size={11} /> {rec.evidence.length} evidence · {pct(rec.confidence_score)}{" "}
                {confidenceLabel(rec.confidence_score).replace(" confidence", "")}
              </span>
              <span className="inline-flex items-center gap-0.5 text-accent opacity-0 transition-opacity group-hover:opacity-100">
                Open <ArrowRight size={12} />
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
