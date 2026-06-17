"use client";

// Phase 6 · AI Reasoning Status — the user-facing transparency layer.
//
// A non-technical user must be able to answer, in one glance:
//   1. Is AI connected?
//   2. Which provider + model is active?
//   3. What is the model doing?
//   4. What is the model NOT doing?
//   5. Why can the recommendation still be trusted?
//
// This file exports a small family of presentational components — a header
// chip, a re-run banner, a "How AI is helping" panel and a session
// utilization card — all wired off the BYOK active-provider hook and the
// in-session utilization singleton in `lib/aiOverlay.ts`. Nothing here calls
// the backend; nothing here mutates governed state.

import * as React from "react";
import {
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Lock,
  Sparkles,
  Activity,
  Layers,
  Timer,
  RefreshCw,
} from "lucide-react";

import { cx } from "@/lib/format";
import {
  AI_DECLINED_SECTIONS,
  AI_ENHANCED_SECTIONS,
  providerLabel,
  useActiveProvider,
  useUtilization,
  type AIOverlayMap,
} from "@/lib/aiOverlay";

// -- shared atoms --------------------------------------------------------

function Dot({ tone }: { tone: "brand" | "accent" | "faint" }) {
  const cls =
    tone === "accent"
      ? "bg-accent shadow-[0_0_6px_rgba(80,220,160,0.6)]"
      : tone === "brand"
      ? "bg-brand shadow-glow"
      : "bg-faint/50";
  return <span className={cx("inline-block h-1.5 w-1.5 rounded-full", cls)} />;
}

// -- 1. Persistent header chip ------------------------------------------

/**
 * The persistent AI status chip rendered in the global header. It collapses
 * to a tiny dot + label and reads from the BYOK store on every poll so it
 * stays in sync when the user activates a provider in another tab.
 */
export function AIReasoningChip({
  overlayProvider,
  overlayModel,
}: {
  overlayProvider?: string | null;
  overlayModel?: string | null;
}) {
  const active = useActiveProvider();
  const enhanced = !!overlayProvider && overlayProvider !== "deterministic";
  const label = enhanced
    ? `${providerLabel(overlayProvider)} reasoning active`
    : active === "deterministic"
    ? "Governed Decision Engine"
    : `${providerLabel(active)} configured`;

  const tone: "brand" | "accent" | "faint" = enhanced
    ? "accent"
    : active === "deterministic"
    ? "brand"
    : "faint";

  const sub = enhanced
    ? overlayModel || "advisory"
    : active === "deterministic"
    ? "deterministic"
    : "activate to use";

  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium",
        enhanced
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-edge bg-surface2/70 text-muted",
      )}
      title={
        enhanced
          ? `AI reasoning is enriching summaries and CRM drafts. Ranking, scoring and governance remain deterministic.`
          : `Ranking, prioritization and recommendations are currently generated using deterministic business rules and evidence.`
      }
    >
      <Dot tone={tone} />
      {enhanced ? <Sparkles size={11} /> : <Lock size={11} className="text-faint" />}
      <span className="truncate">{label}</span>
      <span className="text-faint/70">·</span>
      <span className="font-mono text-faint">{sub}</span>
    </span>
  );
}

// -- 2. "AI-enhanced reasoning applied" banner --------------------------

/**
 * Banner that appears at the top of the result list immediately after a
 * re-run that was supplemented by an AI overlay. Confirms which model
 * generated the narrative and reminds the user that ranking is unchanged.
 */
export function AIEnhancedBanner({ overlay }: { overlay: AIOverlayMap | null }) {
  if (!overlay || overlay.provider === "deterministic") return null;
  const enrichedCount = Object.keys(overlay.byAccount).length;
  if (enrichedCount === 0) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/[0.06] px-4 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
        <Sparkles size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-semibold text-ink">
            AI-enhanced reasoning applied using {providerLabel(overlay.provider)}
            {overlay.model ? ` · ${overlay.model}` : ""}
          </span>
          <span className="text-[11px] text-faint">
            · top {enrichedCount} account{enrichedCount === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
          Executive summaries, conversation strategies and CRM note drafts
          have been enriched. Ranking, scoring and governance remain
          deterministic and unchanged.
        </p>
      </div>
    </div>
  );
}

/** Compact attribution badge ("Generated with X") used inline next to narrative. */
export function GeneratedWithBadge({
  provider,
  model,
}: {
  provider: string | null | undefined;
  model: string | null | undefined;
}) {
  if (!provider || provider === "deterministic") return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
      title="This narrative was generated by the active BYOK provider. Ranking and scoring remain deterministic."
    >
      <Sparkles size={10} />
      Generated with {providerLabel(provider)}
      {model ? ` · ${model}` : ""}
    </span>
  );
}

// -- 3. "How AI is helping" panel + Trust Statement ---------------------

/**
 * The single panel that anchors the Trust & Governance view's transparency
 * section. Renders the explicit "doing / not doing" checklist, live session
 * utilization and the always-on trust statement so an executive can verify
 * in seconds that AI is bounded.
 */
export function AIReasoningPanel({ overlay }: { overlay: AIOverlayMap | null }) {
  const active = useActiveProvider();
  const util = useUtilization();
  const enhanced = !!overlay && overlay.provider !== "deterministic";
  const [open, setOpen] = React.useState(true);

  const headline = enhanced
    ? `${providerLabel(overlay.provider)} reasoning active`
    : active === "deterministic"
    ? "Governed Decision Engine active"
    : `${providerLabel(active)} configured — no narrative yet`;

  const subline = enhanced
    ? "AI reasoning is enriching summaries, recommendations, conversation strategies and CRM drafts. Ranking remains deterministic."
    : active === "deterministic"
    ? "Ranking, prioritization and recommendations are currently generated using deterministic business rules and evidence."
    : "Activate the provider and re-run the analysis to apply AI-enhanced narrative.";

  const avgLatency =
    util.latencies.length > 0
      ? Math.round(util.latencies.reduce((a, b) => a + b, 0) / util.latencies.length)
      : null;
  const lastInvocationLabel = util.lastInvocationAt
    ? new Date(util.lastInvocationAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  return (
    <section className="card-elevated overflow-hidden">
      <header className="flex items-start gap-3 border-b border-edge px-5 py-4">
        <span
          className={cx(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
            enhanced
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-edge bg-surface2/60 text-brand-bright",
          )}
        >
          {enhanced ? <Sparkles size={16} /> : <BadgeCheck size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
            AI Reasoning Status
          </div>
          <div className="mt-0.5 text-[15px] font-semibold text-ink">{headline}</div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">{subline}</p>
        </div>
        <ProviderStatLine
          overlay={overlay}
          active={active}
          enhanced={enhanced}
        />
      </header>

      <div className="grid gap-0 sm:grid-cols-2">
        {/* Doing */}
        <div className="border-b border-edge px-5 py-4 sm:border-b-0 sm:border-r">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left"
            aria-expanded={open}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
              How AI is helping
            </span>
            <ChevronDown
              size={14}
              className={cx(
                "text-faint transition-transform",
                open ? "rotate-180" : "rotate-0",
              )}
            />
          </button>
          {open ? (
            <ul className="mt-3 space-y-1.5">
              {AI_ENHANCED_SECTIONS.map((s) => {
                const generated = util.sectionsGenerated.has(s.replace(/s$/, ""));
                return (
                  <li
                    key={s}
                    className="flex items-center gap-2 text-[12px] text-muted"
                  >
                    <CheckCircle2
                      size={13}
                      className={generated ? "text-accent" : "text-accent/70"}
                    />
                    <span>{s}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {/* Not doing */}
        <div className="px-5 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
            Not currently using AI
          </div>
          <ul className="mt-3 space-y-1.5">
            {AI_DECLINED_SECTIONS.map((s) => (
              <li
                key={s}
                className="flex items-center gap-2 text-[12px] text-muted"
              >
                <CircleDashed size={13} className="text-faint" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Utilization strip */}
      <div className="grid grid-cols-2 gap-px border-t border-edge bg-edge/40 text-[11px] sm:grid-cols-5">
        <UtilCell icon={<Activity size={11} />} label="Provider">
          {util.provider ? providerLabel(util.provider) : "—"}
        </UtilCell>
        <UtilCell icon={<Layers size={11} />} label="Requests">
          <span className="font-mono">{util.requests}</span>
        </UtilCell>
        <UtilCell icon={<Timer size={11} />} label="Avg latency">
          {avgLatency != null ? (
            <span className="font-mono">{avgLatency.toLocaleString()} ms</span>
          ) : (
            "—"
          )}
        </UtilCell>
        <UtilCell icon={<RefreshCw size={11} />} label="Fallbacks">
          <span className={cx("font-mono", util.fallbacks > 0 && "text-amber")}>
            {util.fallbacks}
          </span>
        </UtilCell>
        <UtilCell icon={<Activity size={11} />} label="Last invocation">
          {lastInvocationLabel}
        </UtilCell>
      </div>

      {/* Trust statement */}
      <p className="flex items-start gap-2 border-t border-edge px-5 py-3.5 text-[12px] leading-relaxed text-faint">
        <Lock size={13} className="mt-0.5 shrink-0" />
        <span>
          AI helps explain and recommend. AI does not determine priority,
          change governance, or execute CRM actions. Humans remain
          accountable for all decisions.
        </span>
      </p>
    </section>
  );
}

function ProviderStatLine({
  overlay,
  active,
  enhanced,
}: {
  overlay: AIOverlayMap | null;
  active: string;
  enhanced: boolean;
}) {
  const lines: { k: string; v: string }[] = [];
  if (enhanced && overlay) {
    lines.push({ k: "Provider", v: providerLabel(overlay.provider) });
    if (overlay.model) lines.push({ k: "Model", v: overlay.model });
    lines.push({ k: "Reasoning mode", v: "Advisory" });
    lines.push({ k: "Ranking mode", v: "Deterministic" });
    lines.push({ k: "Governance", v: "Active" });
  } else {
    lines.push({ k: "Provider", v: providerLabel(active) });
    lines.push({ k: "Reasoning mode", v: active === "deterministic" ? "Deterministic" : "Configured" });
    lines.push({ k: "Ranking mode", v: "Deterministic" });
    lines.push({ k: "Governance", v: "Active" });
  }
  return (
    <dl className="hidden shrink-0 grid-cols-[auto_auto] gap-x-3 gap-y-0.5 self-start text-right text-[11px] sm:grid">
      {lines.map((l) => (
        <React.Fragment key={l.k}>
          <dt className="text-faint">{l.k}</dt>
          <dd className="font-medium text-ink">{l.v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function UtilCell({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface2/60 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-faint">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-[12px] font-medium text-ink">{children}</div>
    </div>
  );
}
