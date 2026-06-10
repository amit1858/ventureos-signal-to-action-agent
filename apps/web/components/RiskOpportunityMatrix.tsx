"use client";

import * as React from "react";
import type { Account } from "@/lib/types";
import { cx } from "@/lib/format";

// Lightweight risk-vs-opportunity scatter built entirely from existing
// GET /api/accounts data (support_risk_score vs growth_potential_score).
export function RiskOpportunityMatrix({
  accounts,
  highlightIds,
}: {
  accounts: Account[];
  highlightIds?: Set<string>;
}) {
  const W = 340;
  const H = 210;
  const pad = 30;
  const plotW = W - pad * 2;
  const plotH = H - pad * 2;
  const midX = pad + plotW / 2;
  const midY = pad + plotH / 2;

  const points = React.useMemo(
    () =>
      accounts.map((a) => {
        const opp = Math.max(0, Math.min(100, a.growth_potential_score));
        const risk = Math.max(0, Math.min(100, a.support_risk_score));
        return {
          id: a.account_id,
          x: pad + (opp / 100) * plotW,
          y: pad + (1 - risk / 100) * plotH,
          risk,
          opp,
        };
      }),
    [accounts, plotW, plotH],
  );

  function tone(risk: number, opp: number): string {
    if (risk >= 50) return "#EF6B73"; // elevated risk → attention
    if (opp >= 50) return "#76B900"; // growth-ready
    return "#6B7480"; // monitor
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        {/* plot frame */}
        <rect x={pad} y={pad} width={plotW} height={plotH} fill="#0E1117" stroke="#2A2F35" rx="6" />
        {/* quadrant dividers */}
        <line x1={midX} y1={pad} x2={midX} y2={pad + plotH} stroke="#2A2F35" strokeDasharray="3 3" />
        <line x1={pad} y1={midY} x2={pad + plotW} y2={midY} stroke="#2A2F35" strokeDasharray="3 3" />

        {/* quadrant labels */}
        <text x={pad + plotW - 6} y={pad + 12} textAnchor="end" className="fill-[#76B900]" fontSize="8" fontWeight="600">
          ACT NOW
        </text>
        <text x={pad + 6} y={pad + 12} textAnchor="start" className="fill-[#EF6B73]" fontSize="8" fontWeight="600">
          ESCALATE
        </text>
        <text x={pad + 6} y={pad + plotH - 5} textAnchor="start" className="fill-[#6B7480]" fontSize="8" fontWeight="600">
          MONITOR
        </text>
        <text x={pad + plotW - 6} y={pad + plotH - 5} textAnchor="end" className="fill-[#AAB2BD]" fontSize="8" fontWeight="600">
          NURTURE
        </text>

        {/* points */}
        {points.map((p) => {
          const hot = highlightIds?.has(p.id);
          const c = tone(p.risk, p.opp);
          return (
            <g key={p.id}>
              {hot ? <circle cx={p.x} cy={p.y} r={6} fill="none" stroke={c} strokeOpacity={0.5} /> : null}
              <circle
                cx={p.x}
                cy={p.y}
                r={hot ? 4 : 3}
                fill={c}
                fillOpacity={hot ? 1 : 0.65}
                stroke={hot ? "#F4F6F8" : "none"}
                strokeWidth={hot ? 1 : 0}
              >
                <title>{`${p.id} · risk ${Math.round(p.risk)} · opportunity ${Math.round(p.opp)}`}</title>
              </circle>
            </g>
          );
        })}

        {/* axes labels */}
        <text x={pad + plotW / 2} y={H - 6} textAnchor="middle" className="fill-[#6B7480]" fontSize="9">
          Opportunity →
        </text>
        <text
          x={12}
          y={pad + plotH / 2}
          textAnchor="middle"
          className="fill-[#6B7480]"
          fontSize="9"
          transform={`rotate(-90 12 ${pad + plotH / 2})`}
        >
          Risk →
        </text>
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-faint">
        <Legend color="#EF6B73" label="Elevated risk" />
        <Legend color="#76B900" label="Growth-ready" />
        <Legend color="#6B7480" label="Monitor" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1")}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
