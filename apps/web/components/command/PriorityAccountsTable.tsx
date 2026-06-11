"use client";

import * as React from "react";
import { ArrowRight, ArrowDown, ArrowUp, ListOrdered } from "lucide-react";
import type { Account, Recommendation } from "@/lib/types";
import { cx, actionLabel, titleCase } from "@/lib/format";
import { RENEWAL_SOON } from "@/lib/portfolio";

interface Row {
  id: string;
  rank: number;
  name: string;
  industry: string;
  priority: number;
  risk: number;
  opportunity: number;
  renewal: number;
  action: string;
}

type SortKey = "rank" | "name" | "industry" | "priority" | "risk" | "opportunity" | "renewal";

const COLS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "name", label: "Company", align: "left" },
  { key: "industry", label: "Industry", align: "left" },
  { key: "priority", label: "AI Priority", align: "right" },
  { key: "risk", label: "Risk", align: "right" },
  { key: "opportunity", label: "Opportunity", align: "right" },
  { key: "renewal", label: "Renewal Window", align: "right" },
];

function scoreColor(v: number): string {
  if (v >= 60) return "text-risk";
  if (v >= 35) return "text-amber";
  return "text-faint";
}

function oppColor(v: number): string {
  if (v >= 65) return "text-accent";
  if (v >= 45) return "text-cyan";
  return "text-faint";
}

export function PriorityAccountsTable({
  recs,
  accountsById,
  selectedId,
  onOpenAccount,
  onRun,
  hasResult,
  loading,
}: {
  recs: Recommendation[];
  accountsById: Record<string, Account>;
  selectedId?: string | null;
  onOpenAccount: (accountId: string) => void;
  onRun: () => void;
  hasResult: boolean;
  loading: boolean;
}) {
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "rank", dir: "asc" });

  const rows = React.useMemo<Row[]>(() => {
    return recs.slice(0, 10).map((r) => {
      const a = accountsById[r.account_id];
      return {
        id: r.account_id,
        rank: r.priority_rank,
        name: r.account_name,
        industry: a?.industry ? titleCase(a.industry) : "—",
        priority: Math.round(r.priority_score * 100),
        risk: Math.round(a?.support_risk_score ?? 0),
        opportunity: Math.round(a?.growth_potential_score ?? 0),
        renewal: a?.renewal_days ?? 0,
        action: actionLabel(r.action_type),
      };
    });
  }, [recs, accountsById]);

  const sorted = React.useMemo(() => {
    const arr = [...rows];
    const { key, dir } = sort;
    arr.sort((a, b) => {
      let cmp: number;
      if (key === "name" || key === "industry") cmp = String(a[key]).localeCompare(String(b[key]));
      else cmp = (a[key] as number) - (b[key] as number);
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sort]);

  function toggle(key: SortKey) {
    setSort((s) => {
      if (s.key === key) return { key, dir: s.dir === "asc" ? "desc" : "asc" };
      // sensible default direction per column
      const descFirst = key === "priority" || key === "risk" || key === "opportunity";
      return { key, dir: descFirst ? "desc" : "asc" };
    });
  }

  if (!hasResult) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-edge bg-surface2/30 py-10 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-edge bg-surface2 text-faint">
          <ListOrdered size={18} />
        </span>
        <div>
          <div className="text-sm font-medium text-ink">No prioritized accounts yet</div>
          <div className="mt-0.5 max-w-xs text-xs text-faint">
            Run the workflow to rank the portfolio and surface next-best actions for the top accounts.
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={onRun} disabled={loading}>
          {loading ? "Analyzing…" : "Run prioritization"}
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-edge text-left">
            {COLS.map((c) => (
              <th
                key={c.key}
                className={cx("px-2.5 py-2", c.align === "right" && "text-right")}
              >
                <button
                  type="button"
                  onClick={() => toggle(c.key)}
                  className={cx(
                    "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                    sort.key === c.key ? "text-ink" : "text-faint hover:text-muted",
                    c.align === "right" && "flex-row-reverse",
                  )}
                >
                  {c.label}
                  <SortGlyph active={sort.key === c.key} dir={sort.dir} />
                </button>
              </th>
            ))}
            <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
              Recommended Action
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const isSel = r.id === selectedId;
            const renewSoon = r.renewal <= RENEWAL_SOON;
            return (
              <tr
                key={r.id}
                onClick={() => onOpenAccount(r.id)}
                className={cx(
                  "group cursor-pointer border-b border-edge/50 transition-colors",
                  isSel ? "bg-accent/5" : "hover:bg-surface2/50",
                )}
              >
                <td className="px-2.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-edge bg-surface2 font-mono text-[10px] text-muted">
                      {r.rank}
                    </span>
                    <span className={cx("font-medium", isSel ? "text-accent" : "text-ink")}>{r.name}</span>
                  </div>
                </td>
                <td className="px-2.5 py-2.5 text-xs text-muted">{r.industry}</td>
                <td className="px-2.5 py-2.5 text-right font-mono font-semibold text-ink">{r.priority}</td>
                <td className={cx("px-2.5 py-2.5 text-right font-mono", scoreColor(r.risk))}>{r.risk}</td>
                <td className={cx("px-2.5 py-2.5 text-right font-mono", oppColor(r.opportunity))}>{r.opportunity}</td>
                <td className={cx("px-2.5 py-2.5 text-right font-mono text-xs", renewSoon ? "text-amber" : "text-muted")}>
                  {r.renewal}d
                </td>
                <td className="px-2.5 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                    {r.action}
                    <ArrowRight size={12} className="text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortGlyph({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span className="inline-block w-3" />;
  return dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />;
}
