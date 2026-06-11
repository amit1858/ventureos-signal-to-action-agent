"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import type { Account } from "@/lib/types";
import { cx, titleCase } from "@/lib/format";
import { quadrantOf, QUADRANT_META, RENEWAL_SOON, type Quadrant } from "@/lib/portfolio";
import { whyNow } from "@/lib/reasoning";

export interface MatrixStory {
  actionLabel: string;
  actionTone: string;
  outcome: string;
}

interface Pt {
  id: string;
  name: string;
  industry: string;
  renewal: number;
  x: number;
  y: number;
  risk: number;
  opp: number;
  quadrant: Quadrant;
}

const QUADRANT_ORDER: Quadrant[] = ["act_now", "escalate", "nurture", "monitor"];

// Calm, meaning-only quadrant colours for the SVG (no neon — nurture is slate,
// not cyan). These mirror QUADRANT_META but keep the plot free of the legacy
// hex while leaving the frozen portfolio lib untouched.
const QCOLOR: Record<Quadrant, string> = {
  act_now: "#76B900",
  escalate: "#EF6B73",
  nurture: "#7E8BA3",
  monitor: "#6B7480",
};

export function PortfolioMatrix({
  accounts,
  accountsById,
  selectedId,
  recommendedIds,
  storyByAccount,
  onOpenAccount,
}: {
  accounts: Account[];
  accountsById?: Record<string, Account>;
  selectedId?: string | null;
  recommendedIds?: Set<string>;
  storyByAccount?: Record<string, MatrixStory>;
  onOpenAccount: (accountId: string) => void;
}) {
  const W = 560;
  const H = 340;
  const pad = 36;
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
          industry: a.industry,
          renewal: a.renewal_days,
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

  const activeId = hover ?? selectedId ?? null;
  const active = activeId ? points.find((p) => p.id === activeId) ?? null : null;
  const activeAccount = active && accountsById ? accountsById[active.id] ?? null : null;
  const activeStory = active ? storyByAccount?.[active.id] ?? null : null;

  return (
    <div className="grid gap-7 lg:grid-cols-[1fr,272px]">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full select-none"
          onMouseLeave={() => setHover(null)}
        >
          <rect x={pad} y={pad} width={plotW} height={plotH} fill="#0B0F0E" stroke="#242A30" rx="10" />
          {/* quadrant tints — meaning-only, no neon */}
          <rect x={midX} y={pad} width={plotW / 2} height={plotH / 2} fill={QCOLOR.act_now} fillOpacity={0.06} />
          <rect x={pad} y={pad} width={plotW / 2} height={plotH / 2} fill={QCOLOR.escalate} fillOpacity={0.06} />
          <rect x={midX} y={midY} width={plotW / 2} height={plotH / 2} fill={QCOLOR.nurture} fillOpacity={0.05} />

          <line x1={midX} y1={pad} x2={midX} y2={pad + plotH} stroke="#242A30" strokeDasharray="3 4" />
          <line x1={pad} y1={midY} x2={pad + plotW} y2={midY} stroke="#242A30" strokeDasharray="3 4" />

          <text x={pad + plotW - 8} y={pad + 15} textAnchor="end" fill={QCOLOR.act_now} fontSize="9" fontWeight="700" letterSpacing="0.08em">
            ACT NOW
          </text>
          <text x={pad + 8} y={pad + 15} textAnchor="start" fill={QCOLOR.escalate} fontSize="9" fontWeight="700" letterSpacing="0.08em">
            ESCALATE
          </text>
          <text x={pad + 8} y={pad + plotH - 8} textAnchor="start" fill="#6B7480" fontSize="9" fontWeight="700" letterSpacing="0.08em">
            MONITOR
          </text>
          <text x={pad + plotW - 8} y={pad + plotH - 8} textAnchor="end" fill={QCOLOR.nurture} fontSize="9" fontWeight="700" letterSpacing="0.08em">
            NURTURE
          </text>

          {points.map((p) => {
            const isSel = p.id === activeId;
            const isRec = recommendedIds?.has(p.id);
            const dim = activeId != null && !isSel;
            const c = QCOLOR[p.quadrant];
            const r = isSel ? 7 : isRec ? 5 : 4;
            return (
              <g
                key={p.id}
                className="cursor-pointer"
                onMouseEnter={() => setHover(p.id)}
                onClick={() => onOpenAccount(p.id)}
              >
                {(isSel || isRec) && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r + 3}
                    fill="none"
                    stroke={c}
                    strokeOpacity={isSel ? 0.9 : 0.35}
                    className={isSel ? "animate-pulseline" : undefined}
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={c}
                  fillOpacity={isSel ? 1 : dim ? 0.3 : isRec ? 0.95 : 0.6}
                  stroke={isSel ? "#F4F6F8" : "none"}
                  strokeWidth={isSel ? 1.25 : 0}
                  style={{ transition: "fill-opacity 0.18s ease" }}
                />
              </g>
            );
          })}

          <text x={pad + plotW / 2} y={H - 8} textAnchor="middle" fill="#6B7480" fontSize="10">
            Opportunity →
          </text>
          <text
            x={14}
            y={pad + plotH / 2}
            textAnchor="middle"
            fill="#6B7480"
            fontSize="10"
            transform={`rotate(-90 14 ${pad + plotH / 2})`}
          >
            Risk →
          </text>
        </svg>
      </div>

      {/* Dynamic detail rail — the bubble's story (Bloomberg-meets-Apple). */}
      <div>
        {active ? (
          <div className="flex h-full flex-col rounded-2xl border border-edge bg-surface/70 p-4 animate-fade-in-fast">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{active.name}</div>
                <div className="truncate text-[10px] text-faint">{titleCase(active.industry)}</div>
              </div>
              <span
                className={cx(
                  "shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                  QUADRANT_META[active.quadrant].ring,
                  QUADRANT_META[active.quadrant].tone,
                )}
              >
                {QUADRANT_META[active.quadrant].label}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
              <RailStat label="Risk" value={Math.round(active.risk)} tone="text-risk" />
              <RailStat label="Opp." value={Math.round(active.opp)} tone="text-accent" />
              <RailStat
                label="Renewal"
                value={`${active.renewal}d`}
                tone={active.renewal >= 0 && active.renewal <= RENEWAL_SOON ? "text-amber" : "text-muted"}
              />
            </div>

            {activeStory ? (
              <div className="mt-3 rounded-lg border border-brand/25 bg-brand/[0.06] px-2.5 py-2">
                <div className="text-[9px] uppercase tracking-wider text-faint">Recommended action</div>
                <div className={cx("text-[12px] font-semibold", activeStory.actionTone)}>{activeStory.actionLabel}</div>
              </div>
            ) : null}

            {activeAccount ? (
              <div className="mt-3">
                <div className="text-[9px] uppercase tracking-wider text-faint">Why now</div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{whyNow(activeAccount)}</p>
              </div>
            ) : null}

            {activeStory ? (
              <div className="mt-2.5">
                <div className="text-[9px] uppercase tracking-wider text-faint">Expected outcome</div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{activeStory.outcome}</p>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => onOpenAccount(active.id)}
              className="btn btn-ghost mt-auto w-full justify-center px-3 py-1.5 text-[11px]"
            >
              Open account <ArrowRight size={12} />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-1">
            {QUADRANT_ORDER.map((q) => {
              const meta = QUADRANT_META[q];
              return (
                <div key={q} className={cx("hover-lift rounded-xl border p-3", meta.ring, meta.bg)}>
                  <div className="flex items-center justify-between">
                    <span className={cx("text-xs font-semibold", meta.tone)}>{meta.label}</span>
                    <span className={cx("font-mono text-lg font-bold leading-none", meta.tone)}>{counts[q]}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] leading-tight text-faint">{meta.hint}</div>
                </div>
              );
            })}
            <p className="col-span-2 mt-1 text-[10px] leading-snug text-faint lg:col-span-1">
              Hover a bubble to see why it matters and the recommended move.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function RailStat({ label, value, tone }: { label: string; value: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-md border border-edge/70 bg-surface2/60 px-1 py-1.5">
      <div className="text-[8px] uppercase tracking-wider text-faint">{label}</div>
      <div className={cx("font-mono text-sm font-semibold", tone)}>{value}</div>
    </div>
  );
}
