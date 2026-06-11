"use client";

import * as React from "react";
import type { Account } from "@/lib/types";
import { cx } from "@/lib/format";
import { quadrantOf, QUADRANT_META, type Quadrant } from "@/lib/portfolio";

interface Pt {
  id: string;
  name: string;
  x: number;
  y: number;
  risk: number;
  opp: number;
  quadrant: Quadrant;
}

const QUADRANT_ORDER: Quadrant[] = ["act_now", "escalate", "nurture", "monitor"];

export function PortfolioMatrix({
  accounts,
  selectedId,
  recommendedIds,
  onOpenAccount,
}: {
  accounts: Account[];
  selectedId?: string | null;
  recommendedIds?: Set<string>;
  onOpenAccount: (accountId: string) => void;
}) {
  const W = 560;
  const H = 320;
  const pad = 34;
  const plotW = W - pad * 2;
  const plotH = H - pad * 2;
  const midX = pad + plotW / 2;
  const midY = pad + plotH / 2;
  const [hover, setHover] = React.useState<string | null>(null);

  const points = React.useMemo<Pt[]>(
    () =>
      accounts.map((a) => {
        const opp = Math.max(0, Math.min(100, a.growth_potential_score));
        const risk = Math.max(0, Math.min(100, a.support_risk_score));
        return {
          id: a.account_id,
          name: a.account_name,
          x: pad + (opp / 100) * plotW,
          y: pad + (1 - risk / 100) * plotH,
          risk,
          opp,
          quadrant: quadrantOf(risk, opp),
        };
      }),
    [accounts, plotW, plotH],
  );

  const counts = React.useMemo(() => {
    const c: Record<Quadrant, number> = { act_now: 0, escalate: 0, nurture: 0, monitor: 0 };
    points.forEach((p) => (c[p.quadrant] += 1));
    return c;
  }, [points]);

  const hovered = points.find((p) => p.id === hover) || null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr,200px]">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none">
          <rect x={pad} y={pad} width={plotW} height={plotH} fill="#0B0F0E" stroke="#2A2F35" rx="8" />
          {/* quadrant tints */}
          <rect x={midX} y={pad} width={plotW / 2} height={plotH / 2} fill="#76B900" fillOpacity={0.05} />
          <rect x={pad} y={pad} width={plotW / 2} height={plotH / 2} fill="#EF6B73" fillOpacity={0.05} />
          <rect x={midX} y={midY} width={plotW / 2} height={plotH / 2} fill="#00D4FF" fillOpacity={0.04} />

          <line x1={midX} y1={pad} x2={midX} y2={pad + plotH} stroke="#2A2F35" strokeDasharray="3 3" />
          <line x1={pad} y1={midY} x2={pad + plotW} y2={midY} stroke="#2A2F35" strokeDasharray="3 3" />

          <text x={pad + plotW - 8} y={pad + 14} textAnchor="end" className="fill-[#76B900]" fontSize="9" fontWeight="700">
            ACT NOW
          </text>
          <text x={pad + 8} y={pad + 14} textAnchor="start" className="fill-[#EF6B73]" fontSize="9" fontWeight="700">
            ESCALATE
          </text>
          <text x={pad + 8} y={pad + plotH - 7} textAnchor="start" className="fill-[#6B7480]" fontSize="9" fontWeight="700">
            MONITOR
          </text>
          <text x={pad + plotW - 8} y={pad + plotH - 7} textAnchor="end" className="fill-[#00D4FF]" fontSize="9" fontWeight="700">
            NURTURE
          </text>

          {points.map((p) => {
            const isSel = p.id === selectedId;
            const isRec = recommendedIds?.has(p.id);
            const isHover = p.id === hover;
            const c = QUADRANT_META[p.quadrant].color;
            const r = isSel ? 7 : isHover ? 6 : isRec ? 5 : 4;
            return (
              <g key={p.id} className="cursor-pointer" onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover((h) => (h === p.id ? null : h))} onClick={() => onOpenAccount(p.id)}>
                {(isSel || isRec) && (
                  <circle cx={p.x} cy={p.y} r={r + 3} fill="none" stroke={c} strokeOpacity={isSel ? 0.9 : 0.4} className={isSel ? "animate-pulseline" : undefined} />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={c}
                  fillOpacity={isSel || isHover || isRec ? 1 : 0.6}
                  stroke={isSel ? "#F4F6F8" : isHover ? "#F4F6F8" : "none"}
                  strokeWidth={isSel || isHover ? 1.25 : 0}
                />
              </g>
            );
          })}

          <text x={pad + plotW / 2} y={H - 8} textAnchor="middle" className="fill-[#6B7480]" fontSize="10">
            Opportunity →
          </text>
          <text
            x={14}
            y={pad + plotH / 2}
            textAnchor="middle"
            className="fill-[#6B7480]"
            fontSize="10"
            transform={`rotate(-90 14 ${pad + plotH / 2})`}
          >
            Risk →
          </text>
        </svg>

        {hovered ? (
          <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-edge bg-elevated/95 px-3 py-1.5 text-center shadow-elevated">
            <div className="text-xs font-semibold text-ink">{hovered.name}</div>
            <div className="text-[10px] text-faint">
              risk {Math.round(hovered.risk)} · opportunity {Math.round(hovered.opp)} ·{" "}
              <span className={QUADRANT_META[hovered.quadrant].tone}>{QUADRANT_META[hovered.quadrant].label}</span>
            </div>
          </div>
        ) : (
          <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-edge/60 bg-surface2/70 px-3 py-1 text-[10px] text-faint">
            Click a dot to open the account
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-1">
        {QUADRANT_ORDER.map((q) => {
          const meta = QUADRANT_META[q];
          return (
            <div key={q} className={cx("rounded-lg border p-2.5", meta.ring, meta.bg)}>
              <div className="flex items-center justify-between">
                <span className={cx("text-xs font-semibold", meta.tone)}>{meta.label}</span>
                <span className={cx("font-mono text-lg font-bold leading-none", meta.tone)}>{counts[q]}</span>
              </div>
              <div className="mt-0.5 text-[10px] leading-tight text-faint">{meta.hint}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
