"use client";

import * as React from "react";
import {
  AlertTriangle,
  Clock,
  TrendingDown,
  LifeBuoy,
  Activity,
  PhoneOff,
  TrendingUp,
  Sparkles,
  Layers,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import type { Account } from "@/lib/types";
import { cx } from "@/lib/format";
import { riskThemes, opportunityThemes, type Theme } from "@/lib/portfolio";

const RISK_ICONS: Record<string, LucideIcon> = {
  renewal: Clock,
  usage: TrendingDown,
  support: LifeBuoy,
  engagement: Activity,
  inactivity: PhoneOff,
};

const OPP_ICONS: Record<string, LucideIcon> = {
  expansion: TrendingUp,
  campaign: Sparkles,
  workload: Layers,
  adoption: Gauge,
};

export function AiInsightsPanel({ accounts }: { accounts: Account[] }) {
  const risks = React.useMemo(() => riskThemes(accounts), [accounts]);
  const opps = React.useMemo(() => opportunityThemes(accounts), [accounts]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ThemeList
        title="Top Risks"
        accentTone="text-risk"
        chipClass="border-risk/40 bg-risk/10 text-risk"
        themes={risks}
        icons={RISK_ICONS}
        fallbackIcon={AlertTriangle}
        empty="No material risks detected in the current book."
      />
      <ThemeList
        title="Top Opportunities"
        accentTone="text-accent"
        chipClass="border-accent/40 bg-accent/10 text-accent"
        themes={opps}
        icons={OPP_ICONS}
        fallbackIcon={Sparkles}
        empty="No standout expansion signals in the current book."
      />
    </div>
  );
}

function ThemeList({
  title,
  accentTone,
  chipClass,
  themes,
  icons,
  fallbackIcon: Fallback,
  empty,
}: {
  title: string;
  accentTone: string;
  chipClass: string;
  themes: Theme[];
  icons: Record<string, LucideIcon>;
  fallbackIcon: LucideIcon;
  empty: string;
}) {
  return (
    <div className="rounded-lg border border-edge bg-surface2/30 p-3">
      <div className={cx("section-label mb-2", accentTone)}>{title}</div>
      {themes.length === 0 ? (
        <p className="py-3 text-xs text-faint">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {themes.map((t) => {
            const Icon = icons[t.key] ?? Fallback;
            return (
              <li
                key={t.key}
                className="flex items-center gap-2.5 rounded-md border border-edge/60 bg-surface/60 px-2.5 py-2"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-edge bg-surface2 text-faint">
                  <Icon size={13} className={accentTone} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-ink">{t.label}</div>
                  <div className="truncate text-[10px] text-faint">{t.detail}</div>
                </div>
                <span className={cx("shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold", chipClass)}>
                  {t.count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
