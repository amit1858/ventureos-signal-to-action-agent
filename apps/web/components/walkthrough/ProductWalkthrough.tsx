// Product Walkthrough — native step-based storytelling (presentation only)
// ========================================================================
// Renders the pure `WALKTHROUGH_STAGES` model as a native, self-contained
// walkthrough. It owns NO business state, fetches nothing, and mutates nothing —
// it only reads the governed truth and links into the existing experiences.

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CheckCircle2,
  CircleHelp,
  Landmark,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { cx } from "@/lib/format";
import {
  WALKTHROUGH_STAGES,
  WALKTHROUGH_STAGE_COUNT,
  type WalkthroughStage,
  type WalkthroughStatus,
} from "@/lib/walkthrough/stages";

const STATUS_STYLE: Record<WalkthroughStatus, string> = {
  Production: "border-accent/40 bg-accent/10 text-accent-bright",
  "Production — Partial": "border-brand/40 bg-brand/10 text-brand-bright",
  "Guided Demo": "border-amber-500/40 bg-amber-500/10 text-amber-300",
  "Guardrails Lab": "border-gov/40 bg-gov/10 text-gov-bright",
  "Product context": "border-edge bg-surface2 text-muted",
  Roadmap: "border-edge bg-surface2 text-faint",
};

function StatusPill({ status }: { status: WalkthroughStatus }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-[3px] text-[10px] font-semibold uppercase tracking-wider",
        STATUS_STYLE[status],
      )}
    >
      {status}
    </span>
  );
}

function FactRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex gap-2.5">
      <span className={cx("mt-0.5 shrink-0", tone)}>{icon}</span>
      <p className="text-[12.5px] leading-relaxed text-muted">
        <span className="font-medium text-faint">{label}: </span>
        <span className="text-ink/90">{value}</span>
      </p>
    </div>
  );
}

function StageCard({ stage }: { stage: WalkthroughStage }) {
  return (
    <section
      id={`stage-${stage.number}`}
      className="scroll-mt-24 rounded-2xl border border-edge bg-surface/60 p-6 shadow-sm"
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-brand/40 bg-brand/10 font-mono text-sm font-semibold text-brand-bright">
          {stage.number}
        </span>
        <StatusPill status={stage.status} />
      </div>

      <h2 className="text-[19px] font-semibold leading-snug text-ink">{stage.headline}</h2>
      <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-muted">{stage.narrative}</p>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {/* Left: the seven governed questions */}
        <div className="space-y-2.5">
          <FactRow icon={<CheckCircle2 size={15} />} tone="text-accent-bright" label="What happened" value={stage.whatHappened} />
          <FactRow icon={<BadgeCheck size={15} />} tone="text-brand-bright" label="Why it matters" value={stage.whyItMatters} />
          <FactRow icon={<Bot size={15} />} tone="text-brand" label="What AI did" value={stage.whatAiDid} />
          <FactRow icon={<ShieldCheck size={15} />} tone="text-gov-bright" label="What deterministic policy did" value={stage.whatPolicyDid} />
          <FactRow icon={<UserCheck size={15} />} tone="text-accent" label="What the human controlled" value={stage.whatHumanControlled} />
          <FactRow icon={<CircleHelp size={15} />} tone="text-faint" label="What remains unknown" value={stage.whatRemainsUnknown} />
        </div>

        {/* Right: native visual evidence panel */}
        <div className="rounded-xl border border-edge bg-base/50 p-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-faint">
            <Landmark size={13} className="text-gov-bright" /> Evidence
          </div>
          <ul className="space-y-1.5">
            {stage.evidence.map((e) => (
              <li key={e} className="flex gap-2 text-[12.5px] leading-relaxed text-ink/90">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                {e}
              </li>
            ))}
          </ul>
          {stage.link ? (
            <Link
              href={stage.link.href}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/10 px-3 py-1.5 text-[12px] font-semibold text-brand-bright transition-colors hover:bg-brand/20"
            >
              {stage.link.label} <ArrowRight size={13} />
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function ProductWalkthrough() {
  return (
    <div className="mx-auto w-full max-w-[1080px] px-5 pb-24 pt-8">
      {/* Intro */}
      <section className="mb-8 rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/[0.08] to-transparent p-6">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-faint">
          <ShieldCheck size={14} className="text-brand-bright" /> Product Walkthrough ·{" "}
          {WALKTHROUGH_STAGE_COUNT} stages
        </div>
        <h1 className="max-w-3xl text-[26px] font-semibold leading-tight text-ink">
          From signal to governed action — the whole VentureOS story, in order.
        </h1>
        <p className="mt-3 max-w-3xl text-[13.5px] leading-relaxed text-muted">
          Follow one governed Curefoods renewal mission end to end. Every stage answers the same
          questions: what happened, why it matters, what the AI did, what deterministic policy did,
          what the human controlled, what evidence proves it, and what remains unknown. Nothing here
          sends email, changes a CRM, or writes risk — execution is simulated and honestly labelled.
        </p>
      </section>

      {/* Stages */}
      <div className="space-y-6">
        {WALKTHROUGH_STAGES.map((stage) => (
          <StageCard key={stage.id} stage={stage} />
        ))}
      </div>

      {/* Truthful limitations */}
      <section className="mt-8 rounded-2xl border border-edge bg-surface/60 p-6">
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-faint">
          Honest limitations
        </h3>
        <ul className="grid gap-2 text-[12.5px] leading-relaxed text-muted md:grid-cols-2">
          <li>• Curefoods is a deterministic governed demo mission, not live customer CRM truth.</li>
          <li>• The three actions are simulated — no email, CRM task, or risk update is real.</li>
          <li>• Guardrails Lab uses curated scenarios; it does not intercept all Production traffic.</li>
          <li>• The raw NVIDIA classifier score is not a probability or confidence value.</li>
          <li>• Manager Coaching is a Guided Demo, not an enterprise-persistent workflow.</li>
          <li>• No customer response, renewal, or revenue outcome is claimed.</li>
        </ul>
      </section>

      <footer className="mt-8 border-t border-edge pt-4 text-center text-[11px] text-faint">
        VentureOS · Product Walkthrough ·{" "}
        <Link href="/" className="text-brand-dim hover:text-brand-bright">
          return to Signal-to-Action Agent
        </Link>
      </footer>
    </div>
  );
}
