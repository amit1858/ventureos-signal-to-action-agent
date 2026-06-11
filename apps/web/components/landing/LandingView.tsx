"use client";

import * as React from "react";
import {
  ArrowRight,
  Database,
  Radar,
  FileSearch,
  Brain,
  Lightbulb,
  ShieldCheck,
  Send,
  Building2,
  Activity,
  Bot,
  ListChecks,
  LayoutDashboard,
  PieChart,
  ScrollText,
  UserCheck,
  RefreshCw,
  Sparkles,
  Check,
  X,
} from "lucide-react";
import type { MetaResponse } from "@/lib/types";
import type { LucideIcon } from "lucide-react";
import { Counter } from "@/components/Counter";

// PRIORITY 1 · Landing Experience.
// A premium hero that answers "what is this, why does it exist, why is it
// different from a CRM, how does the AI decide, what do I do next" before the
// user steps into the Command Center. Presentation only — no data contracts,
// no business logic. All figures are read from /api/meta.
export function LandingView({
  meta,
  recommendationCount,
  isHubspotSource,
  dataSourceLabel,
  onEnter,
  onOpenWorkspace,
}: {
  meta: MetaResponse | null;
  recommendationCount: number;
  isHubspotSource: boolean;
  dataSourceLabel: string;
  onEnter: () => void;
  onOpenWorkspace: () => void;
}) {
  const accounts = meta?.dataset.accounts ?? 40;
  const signals = meta?.dataset.signals ?? 132;
  const agents = meta?.agents.length ?? 6;
  const recs = recommendationCount || 10;

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <main className="relative mx-auto w-full max-w-[1180px] flex-1 px-5 pb-24">
      {/* ---------------------------------------------------------------- HERO */}
      <section className="relative pt-16 text-center sm:pt-24">
        <div
          className="grid-dots pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-[0.10]"
          aria-hidden
        />
        <div className="relative animate-fade-in">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-bright">
            <Sparkles size={12} /> Sovereign Agentic AI · Track A
          </span>

          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-[56px]">
            Turn customer signals into{" "}
            <span className="bg-gradient-to-r from-brand-bright to-brand bg-clip-text text-transparent">
              governed action
            </span>
            .
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-muted sm:text-lg">
            Signal-to-Action Agent continuously monitors your customer portfolio, detects risk and
            opportunity, and recommends governed next-best actions — before revenue is lost.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={onEnter} className="btn btn-primary px-5 py-3 text-sm font-semibold">
              Enter Command Center <ArrowRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => scrollTo("how-it-works")}
              className="btn btn-ghost px-5 py-3 text-sm font-semibold"
            >
              See how it works
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-faint">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-accent" /> Human-approved
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileSearch size={13} className="text-brand-bright" /> Evidence-backed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Activity size={13} className="text-accent" /> NVIDIA-ready runtime
            </span>
          </div>
        </div>

        {/* Stat strip */}
        <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-edge bg-edge/60 sm:grid-cols-3 lg:grid-cols-6">
          <StatCell icon={Building2} value={accounts} label="Accounts" />
          <StatCell icon={Radar} value={signals} label="Signals" />
          <StatCell icon={Bot} value={agents} label="AI Agents" />
          <StatCell icon={ListChecks} value={recs} label="Recommendations" />
          <StatCell icon={ShieldCheck} text="Required" label="Human Approval" tone="text-accent" />
          <StatCell
            icon={RefreshCw}
            text={isHubspotSource ? "HubSpot" : "Enabled"}
            label="CRM Writeback"
            tone="text-brand-bright"
          />
        </div>
      </section>

      {/* ------------------------------------------------- CRM vs SIGNAL-TO-ACTION */}
      <section className="mt-28">
        <SectionHead
          eyebrow="Why it's different"
          heading="Beyond a system of record"
          sub="A CRM stores what happened. Signal-to-Action understands it, reasons over it, and tells you what to do — with a human in the loop."
        />
        <div className="mt-9 grid gap-5 lg:grid-cols-2">
          {/* Traditional CRM */}
          <div className="card p-7">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-edge bg-surface2 text-faint">
                <Database size={18} />
              </span>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
                  Traditional CRM
                </div>
                <div className="text-lg font-semibold text-ink">Stores data</div>
              </div>
            </div>
            <ul className="mt-5 space-y-2.5">
              {["Static records and dashboards", "Manual review, account by account", "Reactive — you find the signal", "No reasoning, no recommended action"].map(
                (t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm text-muted">
                    <X size={15} className="mt-0.5 shrink-0 text-risk/70" />
                    {t}
                  </li>
                ),
              )}
            </ul>
          </div>

          {/* Signal-to-Action */}
          <div className="card-premium relative overflow-hidden p-7">
            <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-brand via-brand/50 to-transparent" aria-hidden />
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand/40 bg-brand/15 text-brand-bright">
                <Brain size={18} />
              </span>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-bright">
                  Signal-to-Action
                </div>
                <div className="text-lg font-semibold text-ink">Understands &amp; acts on data</div>
              </div>
            </div>
            <ul className="mt-5 space-y-2.5">
              {["Understands fragmented signals", "Reasons over evidence with confidence", "Recommends the next-best action", "Human approves, then writes back to CRM"].map(
                (t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm text-ink">
                    <Check size={15} className="mt-0.5 shrink-0 text-accent" />
                    {t}
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ HOW IT WORKS */}
      <section id="how-it-works" className="mt-28 scroll-mt-24">
        <SectionHead
          eyebrow="How it works"
          heading="From signal to governed action"
          sub="Every recommendation travels the same auditable path — no autonomous black box."
        />
        <div className="mt-10">
          <FlowStepper
            steps={[
              { icon: Database, label: "HubSpot", hint: "Connect CRM" },
              { icon: Radar, label: "Signal Detection", hint: "Risk & opportunity" },
              { icon: FileSearch, label: "Evidence", hint: "Collect & rank" },
              { icon: Brain, label: "Reasoning", hint: "Score & explain" },
              { icon: Lightbulb, label: "Recommendation", hint: "Next-best action" },
              { icon: ShieldCheck, label: "Human Approval", hint: "Approve / reject" },
              { icon: Send, label: "CRM Writeback", hint: "Task & note" },
            ]}
          />
        </div>
      </section>

      {/* ----------------------------------------------------------- CAPABILITIES */}
      <section className="mt-28">
        <SectionHead
          eyebrow="Capabilities"
          heading="Built for executive decisions"
          sub="Everything an enterprise needs to act on its portfolio with confidence and control."
        />
        <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <CapabilityCard
            icon={LayoutDashboard}
            title="Executive Command Center"
            desc="A morning brief that tells you what to do today — not a wall of metrics."
          />
          <CapabilityCard
            icon={PieChart}
            title="Portfolio Intelligence"
            desc="Risk versus opportunity across every account, ranked and explained."
          />
          <CapabilityCard
            icon={ScrollText}
            title="Decision Ledger"
            desc="Every recommendation traced to its evidence, confidence and caveats."
          />
          <CapabilityCard
            icon={ShieldCheck}
            title="Governed AI"
            desc="Confidence scoring and caveats — nothing acts without sufficient evidence."
          />
          <CapabilityCard
            icon={UserCheck}
            title="Human Approval"
            desc="A person approves, edits or rejects before any action is taken."
          />
          <CapabilityCard
            icon={RefreshCw}
            title="CRM Synchronization"
            desc="Approved actions write back to HubSpot as tasks and notes."
          />
        </div>
      </section>

      {/* ------------------------------------------------------------- FINAL CTA */}
      <section className="mt-28">
        <div className="card-premium relative overflow-hidden px-8 py-14 text-center">
          <div className="grid-dots pointer-events-none absolute inset-0 opacity-[0.10]" aria-hidden />
          <div className="relative">
            <h2 className="mx-auto max-w-xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Your portfolio review is ready.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-base text-muted">
              Step into the Command Center to see the accounts that need attention today — and the
              recommended next move for each.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={onEnter} className="btn btn-primary px-5 py-3 text-sm font-semibold">
                Enter Command Center <ArrowRight size={16} />
              </button>
              <button
                type="button"
                onClick={onOpenWorkspace}
                className="btn btn-ghost px-5 py-3 text-sm font-semibold"
              >
                Open Workspace
              </button>
            </div>
            <p className="mt-6 text-[11px] text-faint">
              Active source: {dataSourceLabel} · 100% governed, human-approved workflow
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

// --------------------------------------------------------------------------

function SectionHead({ eyebrow, heading, sub }: { eyebrow: string; heading: string; sub: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="eyebrow text-faint">{eyebrow}</div>
      <h2 className="section-h mt-2.5">{heading}</h2>
      <p className="section-sub mt-3">{sub}</p>
    </div>
  );
}

function StatCell({
  icon: Icon,
  value,
  text,
  label,
  tone = "text-ink",
}: {
  icon: LucideIcon;
  value?: number;
  text?: string;
  label: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 bg-surface px-4 py-6">
      <Icon size={16} className="text-faint" />
      <div className={`font-mono text-2xl font-semibold leading-none ${tone}`}>
        {typeof value === "number" ? <Counter value={value} /> : text}
      </div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-faint">{label}</div>
    </div>
  );
}

function FlowStepper({
  steps,
}: {
  steps: { icon: LucideIcon; label: string; hint: string }[];
}) {
  return (
    <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center lg:gap-0">
      {steps.map((s, i) => {
        const Icon = s.icon;
        return (
          <React.Fragment key={s.label}>
            <div className="flex flex-1 items-center gap-3 rounded-xl border border-edge bg-surface px-4 py-3 lg:flex-col lg:gap-2 lg:px-2 lg:py-4 lg:text-center">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand/30 bg-brand/10 text-brand-bright">
                <Icon size={16} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold text-ink">{s.label}</div>
                <div className="truncate text-[10px] text-faint">{s.hint}</div>
              </div>
            </div>
            {i < steps.length - 1 ? (
              <div className="flex items-center justify-center px-1 text-faint">
                <ArrowRight size={14} className="hidden lg:block" />
                <ArrowRight size={14} className="rotate-90 lg:hidden" />
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function CapabilityCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
}) {
  return (
    <div className="card hover-lift p-6">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand/30 bg-brand/10 text-brand-bright">
        <Icon size={18} />
      </span>
      <h3 className="mt-4 text-[15px] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{desc}</p>
    </div>
  );
}
