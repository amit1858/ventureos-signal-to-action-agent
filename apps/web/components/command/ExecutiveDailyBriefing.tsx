// Phase 14F — Executive Daily Briefing panel.
//
// A leadership-voice morning briefing rendered as a hero strip at the top of
// the Command Center. Answers three questions: What changed? / Why does it
// matter? / What should leadership do next? — and ends with a ranked,
// clickable action list.

"use client";

import { useMemo } from "react";
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  CheckCheck,
  CircleAlert,
  Clock,
  Megaphone,
  ScrollText,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";

import { cx } from "@/lib/format";
import type {
  BriefingActionItem,
  BriefingUrgency,
  ExecutiveDailyBriefing,
} from "@/lib/executiveDailyBriefing";

interface Props {
  briefing: ExecutiveDailyBriefing | null;
  onOpenAccount?: (accountId: string) => void;
}

const URGENCY_BADGE: Record<BriefingUrgency, { label: string; cls: string; icon: React.ReactNode }> = {
  calm: { label: "Steady",   cls: "border-accent/40 bg-accent/10 text-accent",          icon: <CheckCheck size={11} /> },
  watch: { label: "Watch",    cls: "border-yellow-400/40 bg-yellow-400/10 text-yellow-400", icon: <CircleAlert size={11} /> },
  act:   { label: "Act now",  cls: "border-risk/40 bg-risk/10 text-risk",               icon: <CircleAlert size={11} /> },
};

const CATEGORY_BADGE: Record<BriefingActionItem["category"], { label: string; cls: string; icon: React.ReactNode }> = {
  approval:   { label: "Approval",   cls: "border-accent/40 bg-accent/10 text-accent",            icon: <Shield size={10} /> },
  escalation: { label: "Escalation", cls: "border-risk/40 bg-risk/10 text-risk",                  icon: <Megaphone size={10} /> },
  outreach:   { label: "Outreach",   cls: "border-gov/40 bg-gov/10 text-gov",                     icon: <Target size={10} /> },
  review:     { label: "Review",     cls: "border-edge bg-bg/40 text-muted",                       icon: <ScrollText size={10} /> },
};

function formatGeneratedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

export function ExecutiveDailyBriefingPanel({ briefing, onOpenAccount }: Props) {
  const totalMinutes = useMemo(() => {
    if (!briefing) return 0;
    return briefing.recommended_actions.reduce((s, a) => s + (a.est_minutes ?? 0), 0);
  }, [briefing]);

  if (!briefing) {
    return (
      <div className="card-premium p-3.5">
        <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">
          <Sparkles size={11} />
          Executive Daily Briefing
        </div>
        <div className="mt-2 rounded-md border border-dashed border-edge/40 px-3 py-3 text-[12px] text-muted">
          Run an analysis to generate today's leadership briefing.
        </div>
      </div>
    );
  }

  const urgency = URGENCY_BADGE[briefing.urgency];

  return (
    <div className="card-premium p-3.5">
      {/* Header strip */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">
          <Sparkles size={11} />
          Executive Daily Briefing
        </div>
        <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", urgency.cls)}>
          {urgency.icon} {urgency.label}
        </span>
        <span className="text-[10.5px] text-faint">
          <CalendarClock size={9} className="mr-0.5 inline" />
          {briefing.window_label}
        </span>
        <span className="ml-auto text-[10.5px] text-faint">
          <Clock size={9} className="mr-0.5 inline" />
          Generated {formatGeneratedAt(briefing.generated_at)}
        </span>
      </div>

      {/* Headline */}
      <p className="mt-2.5 text-[14px] leading-snug text-ink">
        {briefing.headline}
      </p>

      {/* 3-pillar grid */}
      <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-3">
        <Pillar
          eyebrow="What changed"
          icon={<TrendingUp size={11} />}
          tone="warn"
          pillar={briefing.what_changed}
        />
        <Pillar
          eyebrow="Why it matters"
          icon={<Briefcase size={11} />}
          tone="risk"
          pillar={briefing.why_it_matters}
        />
        <Pillar
          eyebrow="What to do next"
          icon={<Target size={11} />}
          tone="brand"
          pillar={briefing.what_to_do_next}
        />
      </div>

      {/* Recommended actions */}
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Recommended actions</div>
          {totalMinutes > 0 ? (
            <div className="text-[10px] text-faint">
              <Clock size={9} className="mr-0.5 inline" />
              ~{totalMinutes} min focused work
            </div>
          ) : null}
        </div>
        {briefing.recommended_actions.length === 0 ? (
          <div className="mt-1.5 rounded-md border border-dashed border-edge/40 px-3 py-2.5 text-[11.5px] text-muted italic">
            No leadership actions queued. Continue normal cadence.
          </div>
        ) : (
          <ol className="mt-1.5 space-y-1.5">
            {briefing.recommended_actions.map((a) => {
              const cat = CATEGORY_BADGE[a.category];
              const clickable = !!(onOpenAccount && a.account_id);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={clickable ? () => onOpenAccount!(a.account_id!) : undefined}
                    disabled={!clickable}
                    className={cx(
                      "block w-full rounded-md border border-edge/60 bg-bg/40 px-2.5 py-1.5 text-left transition-colors",
                      clickable ? "hover:border-accent/40 hover:bg-accent/5 cursor-pointer" : "cursor-default",
                    )}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-[11px] font-semibold text-faint tabular-nums">#{a.rank}</span>
                      <span className={cx("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold tracking-[0.12em]", cat.cls)}>
                        {cat.icon} {cat.label}
                      </span>
                      <span className="text-[12px] font-semibold text-ink leading-tight">{a.title}</span>
                      {a.est_minutes ? (
                        <span className="ml-auto text-[10px] text-faint tabular-nums">{a.est_minutes}m</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted leading-snug">{a.rationale}</div>
                    {clickable ? (
                      <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-accent">
                        Open {a.account_name} <ArrowRight size={9} />
                      </div>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function Pillar({
  eyebrow, icon, tone, pillar,
}: {
  eyebrow: string;
  icon: React.ReactNode;
  tone: "warn" | "risk" | "brand";
  pillar: { headline: string; detail: string; evidence_count: number };
}) {
  const toneCls =
    tone === "risk"  ? "text-risk" :
    tone === "warn"  ? "text-yellow-400" :
                       "text-accent";
  return (
    <div className="rounded-lg border border-edge bg-surface2/40 p-2.5">
      <div className={cx("flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em]", toneCls)}>
        {icon} {eyebrow}
      </div>
      <div className="mt-1 text-[12.5px] font-semibold leading-snug text-ink">{pillar.headline}</div>
      <div className="mt-0.5 text-[11px] text-muted leading-snug">{pillar.detail}</div>
      <div className="mt-1.5 text-[9.5px] text-faint">{pillar.evidence_count} supporting {pillar.evidence_count === 1 ? "signal" : "signals"}</div>
    </div>
  );
}
