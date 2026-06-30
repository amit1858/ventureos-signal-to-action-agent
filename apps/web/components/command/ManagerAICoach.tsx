// Release 2.0 — Manager AI Coach (AI Sales Director experience).
//
// Design intent: the AI leads, the dashboard supports. The first thing the
// manager reads is a conversation — a Sales Director's overnight read-out that
// names who needs attention and where fifteen minutes would create the most
// impact. Story-led interventions follow. The lifecycle, effectiveness and
// timeline are demoted to "supporting evidence" beneath the recommendation.
//
// Entirely additive and deterministic. Derives a seller-coaching view from the
// existing synthetic account dataset (coachingModel) and tracks a client-only
// coaching lifecycle (coachingState). It NEVER touches ranking, recommendations,
// governance, approvals, the Decision Ledger, the CRM contracts, or the backend.

"use client";

import * as React from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock,
  Crown,
  Sparkles,
} from "lucide-react";

import type { Account } from "@/lib/types";
import { cx, inrCompact } from "@/lib/format";
import {
  type CoachSeller,
  type CoachAnswer,
  FOCUS_LABEL,
  FOCUS_SHORT,
  SUGGESTED_QUESTIONS,
  answerQuestion,
  coachIntervention,
  coachNarrative,
  deriveSellers,
  effectiveness,
  greetingFor,
  managerBriefing,
  managerTimeline,
  rankCandidates,
  sellerById,
} from "@/lib/coachingModel";
import {
  type CoachingAssignment,
  COACHING_STAGES,
  STAGE_LABEL,
  STAGE_SHORT,
  advanceStage,
  assignCoaching,
  ensureSeed,
  getAssignmentForSeller,
  listAssignments,
  stageIndex,
  subscribeCoaching,
} from "@/lib/coachingState";

const inr = (n: number) => inrCompact(n);
const MANAGER_NAME = "Amit";

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
export function ManagerAICoach({ accounts }: { accounts: Account[] }) {
  const sellers = React.useMemo(() => deriveSellers(accounts), [accounts]);
  const ranked = React.useMemo(() => rankCandidates(sellers), [sellers]);

  const [mounted, setMounted] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [assignments, setAssignments] = React.useState<CoachingAssignment[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const evidenceRef = React.useRef<HTMLDivElement | null>(null);

  // Client-only: hydrate assignments, seed the queue once, and subscribe.
  React.useEffect(() => {
    setMounted(true);
    if (ranked.length > 0) {
      ensureSeed(
        ranked.map((s) => ({
          seller_id: s.id,
          seller_name: s.name,
          focus: s.focus,
          focus_label: FOCUS_LABEL[s.focus],
        })),
      );
    }
    setAssignments(listAssignments());
    const unsub = subscribeCoaching(() => {
      setAssignments(listAssignments());
      setTick((t) => t + 1);
    });
    return unsub;
  }, [ranked]);

  React.useEffect(() => {
    if (!selectedId && ranked.length > 0) setSelectedId(ranked[0].id);
  }, [ranked, selectedId]);

  const selected = sellerById(sellers, selectedId) ?? ranked[0] ?? null;
  const selectedAssignment = selected ? getAssignmentForSeller(selected.id) : null;
  void tick;

  if (sellers.length === 0) {
    return <CoachEmptyState />;
  }

  const focusSeller = (id: string | null, scroll = false) => {
    if (id) setSelectedId(id);
    if (scroll) {
      window.requestAnimationFrame(() =>
        evidenceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  };

  const handleAssign = (seller: CoachSeller) => {
    assignCoaching({
      seller_id: seller.id,
      seller_name: seller.name,
      focus: seller.focus,
      focus_label: FOCUS_LABEL[seller.focus],
    });
    focusSeller(seller.id, true);
  };

  const handleAdvance = (id: string) => advanceStage(id);

  return (
    <div className="space-y-6">
      <AICompanion
        sellers={sellers}
        ranked={ranked}
        mounted={mounted}
        onReview={(id) => focusSeller(id, true)}
      />

      <InterventionList
        ranked={ranked}
        assignments={assignments}
        mounted={mounted}
        selectedId={selected?.id ?? null}
        onAssign={handleAssign}
        onReview={(id) => focusSeller(id, true)}
      />

      {selected ? (
        <SupportingEvidence
          ref={evidenceRef}
          seller={selected}
          assignment={selectedAssignment}
          onAssign={() => handleAssign(selected)}
          onAdvance={handleAdvance}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Companion — the conversation that opens (and owns) the experience
// ---------------------------------------------------------------------------
function AICompanion({
  sellers,
  ranked,
  mounted,
  onReview,
}: {
  sellers: CoachSeller[];
  ranked: CoachSeller[];
  mounted: boolean;
  onReview: (id: string) => void;
}) {
  const brief = React.useMemo(() => managerBriefing(sellers, inr), [sellers]);
  const greeting = mounted ? greetingFor(new Date().getHours()) : "Hello";

  const [question, setQuestion] = React.useState("");
  const [answer, setAnswer] = React.useState<CoachAnswer | null>(null);

  const ask = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setAnswer(answerQuestion(trimmed, sellers, inr));
    setQuestion(trimmed);
  };

  const top = ranked[0];

  return (
    <section className="card-premium relative overflow-hidden p-5 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand/10 blur-3xl"
      />
      <div className="relative">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-brand/40 bg-brand/10 text-brand-bright">
            <Crown size={14} />
          </span>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">
            AI Sales Director
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-faint">
            <span className="h-1.5 w-1.5 animate-pulseline rounded-full bg-accent" />
            Reviewed your team overnight
          </span>
        </div>

        {/* The brief — the AI speaking to the manager. */}
        <div className="mt-4 max-w-2xl space-y-2.5">
          <p className="text-[20px] font-semibold leading-snug tracking-tight text-ink">
            {greeting}, {MANAGER_NAME}.
          </p>
          <p className="text-[13.5px] leading-relaxed text-muted">
            I&apos;ve reviewed your team&apos;s execution. {brief.headline}
          </p>
          {mounted && brief.situations.length > 0 ? (
            <ul className="space-y-1.5 pt-0.5">
              {brief.situations.map((line, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70" />
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* The single most important recommendation + one action. */}
        {top ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-brand/25 bg-brand/[0.06] px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium leading-relaxed text-ink">
                {brief.recommendation}
              </p>
              <p className="mt-0.5 text-[11.5px] text-faint">
                Estimated revenue exposure on {top.firstName}&apos;s book:{" "}
                <span className="font-semibold text-risk">{mounted ? brief.exposureText : "—"}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => onReview(top.id)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand/55 bg-brand/15 px-4 py-2 text-[12.5px] font-semibold text-brand-bright transition-all hover:bg-brand/25 hover:shadow-[0_0_0_4px_rgba(216,154,61,0.10)]"
            >
              Review {top.firstName}
              <ArrowRight size={14} />
            </button>
          </div>
        ) : null}

        {/* Permanent companion — ask anything. */}
        <div className="mt-5 border-t border-edge-soft pt-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={`Ask me anything about your team, ${MANAGER_NAME}…`}
              className="min-w-0 flex-1 rounded-lg border border-edge bg-bg/40 px-3.5 py-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand/50"
            />
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-edge bg-surface2/70 px-3.5 py-2.5 text-[12px] font-semibold text-ink transition-colors hover:border-brand/45 hover:text-brand-bright"
            >
              Ask
              <ArrowRight size={13} />
            </button>
          </form>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => ask(q)}
                className="rounded-full border border-edge bg-surface2/50 px-2.5 py-1 text-[10.5px] text-muted transition-colors hover:border-brand/40 hover:text-brand-bright"
              >
                {q}
              </button>
            ))}
          </div>

          {answer ? <AnswerCard answer={answer} onFocus={(id) => id && onReview(id)} /> : null}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Where I'd spend your time today — story-led interventions
// ---------------------------------------------------------------------------
function InterventionList({
  ranked,
  assignments,
  mounted,
  selectedId,
  onAssign,
  onReview,
}: {
  ranked: CoachSeller[];
  assignments: CoachingAssignment[];
  mounted: boolean;
  selectedId: string | null;
  onAssign: (seller: CoachSeller) => void;
  onReview: (id: string) => void;
}) {
  const bySeller = React.useMemo(() => {
    const map = new Map<string, CoachingAssignment>();
    assignments.forEach((a) => {
      const cur = map.get(a.seller_id);
      if (!cur || (cur.stage === "closed" && a.stage !== "closed")) map.set(a.seller_id, a);
    });
    return map;
  }, [assignments]);

  // Lead with the sellers who most need the manager's time.
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">
          Where I&apos;d spend your time today
        </h3>
        <span className="text-[11px] text-faint">Ranked by impact</span>
      </div>

      <div className="space-y-3">
        {top.map((s) => (
          <InterventionCard
            key={s.id}
            seller={s}
            assignment={mounted ? bySeller.get(s.id) ?? null : null}
            active={s.id === selectedId}
            onAssign={() => onAssign(s)}
            onReview={() => onReview(s.id)}
          />
        ))}
      </div>

      {rest.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-dashed border-edge bg-bg/20 px-4 py-3 text-[12px] text-faint">
          <span className="text-muted">These can wait —</span>
          {rest.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onReview(s.id)}
              className="font-medium text-muted underline-offset-2 transition-colors hover:text-brand-bright hover:underline"
            >
              {s.firstName}
              {i < rest.length - 1 ? "," : ""}
            </button>
          ))}
          <span>are steady this week.</span>
        </div>
      ) : null}
    </section>
  );
}

const STAGE_ADVISORY: Record<string, string> = {
  assigned: "Assigned — waiting for acknowledgement.",
  acknowledged: "Acknowledged — mission underway.",
  in_progress: "In progress — due for a check-in today.",
  completed: "Completed — ready for your review.",
  manager_follow_up: "Needs your review to confirm recovery.",
  closed: "Closed — recovery confirmed.",
};

function InterventionCard({
  seller,
  assignment,
  active,
  onAssign,
  onReview,
}: {
  seller: CoachSeller;
  assignment: CoachingAssignment | null;
  active: boolean;
  onAssign: () => void;
  onReview: () => void;
}) {
  const plan = React.useMemo(() => coachIntervention(seller, inr), [seller]);
  const open = !!assignment;

  return (
    <article
      className={cx(
        "card-premium p-4 transition-all sm:p-5",
        active ? "border-brand/35 shadow-[0_0_0_3px_rgba(216,154,61,0.07)]" : "hover:border-brand/25",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-edge bg-surface2/70 text-[13px] font-semibold text-muted">
            {seller.firstName.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-tight text-ink">{seller.firstName}</div>
            <div className="text-[11px] text-faint">
              {seller.accountCount} accounts · {FOCUS_SHORT[seller.focus]}
            </div>
          </div>
        </div>
        {open ? (
          <span className="rounded-full border border-gov/35 bg-gov/10 px-2.5 py-0.5 text-[10px] font-semibold text-gov-bright">
            Coaching open
          </span>
        ) : null}
      </div>

      {/* The story — lead here, not with KPIs. */}
      <p className="mt-3.5 text-[13.5px] leading-relaxed text-ink">{plan.story}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{plan.consequence}</p>

      <div className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Advisory label="Recommended intervention" text={plan.intervention} tone="brand" />
        <Advisory label="Expected impact" text={plan.expectedImpact} tone="accent" />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[11.5px] text-faint">
          {open ? STAGE_ADVISORY[assignment!.stage] : "No coaching loop open yet."}
        </span>
        {open ? (
          <button
            type="button"
            onClick={onReview}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-edge bg-surface2/70 px-3.5 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:border-brand/45 hover:text-brand-bright"
          >
            Review
            <ChevronRight size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onAssign}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand/55 bg-brand/12 px-4 py-1.5 text-[12px] font-semibold text-brand-bright transition-all hover:bg-brand/22 hover:shadow-[0_0_0_4px_rgba(216,154,61,0.10)]"
          >
            Assign coaching
            <ArrowRight size={13} />
          </button>
        )}
      </div>
    </article>
  );
}

function Advisory({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone: "brand" | "accent";
}) {
  const accent = tone === "brand" ? "text-brand-bright" : "text-accent";
  return (
    <div className="rounded-lg border border-edge bg-bg/30 px-3 py-2.5">
      <div className={cx("text-[9.5px] font-semibold uppercase tracking-wider", accent)}>{label}</div>
      <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{text}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supporting evidence — the dashboard, demoted beneath the recommendation
// ---------------------------------------------------------------------------
const SupportingEvidence = React.forwardRef<
  HTMLDivElement,
  {
    seller: CoachSeller;
    assignment: CoachingAssignment | null;
    onAssign: () => void;
    onAdvance: (id: string) => void;
  }
>(function SupportingEvidence({ seller, assignment, onAssign, onAdvance }, ref) {
  return (
    <section ref={ref} className="scroll-mt-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">
          Supporting evidence
        </span>
        <span className="text-[11px] text-muted">· {seller.firstName}&apos;s recovery in detail</span>
        <span className="h-px flex-1 bg-edge-soft" />
      </div>

      <CoachNarrativeCard seller={seller} assignment={assignment} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <CoachingEffectivenessCard seller={seller} assignment={assignment} />
        </div>
        <div className="lg:col-span-5 space-y-4">
          <CoachingLifecycleCard
            seller={seller}
            assignment={assignment}
            onAssign={onAssign}
            onAdvance={onAdvance}
          />
        </div>
      </div>

      <ManagerTimelineCard seller={seller} />
    </section>
  );
});

// ---------------------------------------------------------------------------
// AI narrative
// ---------------------------------------------------------------------------
function CoachNarrativeCard({
  seller,
  assignment,
}: {
  seller: CoachSeller;
  assignment: CoachingAssignment | null;
}) {
  const lines = coachNarrative(seller);
  return (
    <section className="card-premium p-4 sm:p-5">
      <div className="mb-2.5 flex items-center gap-2">
        <Sparkles size={13} className="text-brand-bright" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
          AI read on {seller.firstName}
        </span>
        {assignment ? (
          <span className="ml-auto rounded-full border border-edge bg-surface2/60 px-2 py-0.5 text-[9.5px] font-semibold text-muted">
            {STAGE_LABEL[assignment.stage]}
          </span>
        ) : null}
      </div>
      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <p
            key={i}
            className={cx(
              i === 0
                ? "text-[15px] font-semibold leading-snug text-ink"
                : "text-[13px] leading-relaxed text-muted",
            )}
          >
            {line}
          </p>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Coaching lifecycle — premium progression
// ---------------------------------------------------------------------------
function timeAgoDays(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.floor((Date.now() - then) / 86_400_000);
}

function CoachingLifecycleCard({
  seller,
  assignment,
  onAssign,
  onAdvance,
}: {
  seller: CoachSeller;
  assignment: CoachingAssignment | null;
  onAssign: () => void;
  onAdvance: (id: string) => void;
}) {
  const currentIdx = assignment ? stageIndex(assignment.stage) : -1;
  const isClosed = assignment?.stage === "closed";

  return (
    <section className="card-premium p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink">Coaching lifecycle</span>
        {!assignment ? (
          <button
            type="button"
            onClick={onAssign}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/12 px-3 py-1.5 text-[11px] font-semibold text-brand-bright transition-colors hover:bg-brand/22"
          >
            Assign {FOCUS_SHORT[seller.focus].toLowerCase()}
          </button>
        ) : !isClosed ? (
          <button
            type="button"
            onClick={() => onAdvance(assignment.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface2/70 px-3 py-1.5 text-[11px] font-semibold text-ink transition-colors hover:border-brand/45 hover:text-brand-bright"
          >
            Advance
            <ArrowRight size={12} />
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-semibold text-accent">
            <CheckCircle2 size={12} />
            Closed
          </span>
        )}
      </div>

      <p className="mb-4 text-[11.5px] text-faint">
        {assignment
          ? `${assignment.focus_label} · started ${timeAgoDays(assignment.created_at)}d ago`
          : `No coaching loop open for ${seller.firstName} yet.`}
      </p>

      <StageProgression currentIdx={currentIdx} />
    </section>
  );
}

function StageProgression({ currentIdx }: { currentIdx: number }) {
  return (
    <ol className="relative grid grid-cols-6 gap-1">
      {COACHING_STAGES.map((stage, i) => {
        const state: "done" | "current" | "future" =
          currentIdx < 0 ? "future" : i < currentIdx ? "done" : i === currentIdx ? "current" : "future";
        return (
          <li key={stage} className="flex flex-col items-center text-center">
            <div className="relative flex w-full items-center justify-center">
              {i > 0 ? (
                <span
                  aria-hidden
                  className={cx(
                    "absolute right-1/2 top-1/2 h-[2px] w-full -translate-y-1/2 transition-colors",
                    i <= currentIdx ? "bg-accent/60" : "bg-edge",
                  )}
                />
              ) : null}
              <span
                className={cx(
                  "relative z-10 flex h-7 w-7 items-center justify-center rounded-full border transition-all",
                  state === "done" && "border-accent/50 bg-accent/15 text-accent",
                  state === "current" &&
                    "border-brand/55 bg-brand/15 text-brand-bright shadow-[0_0_0_4px_rgba(216,154,61,0.12)]",
                  state === "future" && "border-edge bg-surface2/60 text-faint",
                )}
              >
                {state === "done" ? (
                  <CheckCircle2 size={13} />
                ) : state === "current" ? (
                  <span className="h-2 w-2 animate-pulseline rounded-full bg-brand-bright" />
                ) : (
                  <CircleDashed size={13} />
                )}
              </span>
            </div>
            <span
              className={cx(
                "mt-1.5 text-[8.5px] font-medium leading-tight",
                state === "current" ? "text-brand-bright" : state === "done" ? "text-muted" : "text-faint",
              )}
            >
              {STAGE_SHORT[stage]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Coaching effectiveness — insight first, numbers second
// ---------------------------------------------------------------------------
function CoachingEffectivenessCard({
  seller,
  assignment,
}: {
  seller: CoachSeller;
  assignment: CoachingAssignment | null;
}) {
  const eff = effectiveness(seller);
  const realized = !!assignment && stageIndex(assignment.stage) >= stageIndex("completed");

  return (
    <section className="card-premium p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-ink">What the coaching changed</span>
        <span
          className={cx(
            "ml-auto rounded-full border px-2 py-0.5 text-[9.5px] font-semibold",
            realized ? "border-accent/40 bg-accent/10 text-accent" : "border-amber/35 bg-amber/10 text-amber",
          )}
        >
          {realized ? "Outcome captured" : "Projected"}
        </span>
      </div>

      {/* Insight leads. */}
      <div className="flex items-start gap-2.5 rounded-lg border border-edge bg-bg/30 px-3.5 py-3">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-brand-bright" />
        <p className="text-[13.5px] leading-relaxed text-ink">{eff.assessment}</p>
      </div>

      {/* Numbers support the insight. */}
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <DeltaMetric
          label="Adoption"
          before={`${Math.round(eff.adoptionBefore * 100)}%`}
          after={`${Math.round(eff.adoptionAfter * 100)}%`}
          good
        />
        <DeltaMetric
          label="Stalled missions"
          before={String(eff.blockedBefore)}
          after={String(eff.blockedAfter)}
          good={false}
        />
        <DeltaMetric
          label="Revenue exposure"
          before={inr(eff.exposureBefore)}
          after={inr(eff.exposureAfter)}
          good={false}
        />
      </div>
    </section>
  );
}

function DeltaMetric({
  label,
  before,
  after,
  good,
}: {
  label: string;
  before: string;
  after: string;
  good: boolean;
}) {
  // "good=true" → up is good (adoption); else down is good (stalled / exposure).
  return (
    <div className="rounded-xl border border-edge bg-bg/30 p-3 text-center">
      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-faint">{label}</div>
      <div className="mt-2 flex flex-col items-center gap-0.5">
        <span className="text-[12px] tabular-nums text-faint line-through decoration-faint/40">{before}</span>
        <ArrowRight size={11} className="rotate-90 text-faint" />
        <span className={cx("text-[16px] font-semibold tabular-nums", good ? "text-accent" : "text-accent")}>
          {after}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manager timeline
// ---------------------------------------------------------------------------
const TIMELINE_DOT: Record<string, string> = {
  neutral: "border-edge bg-surface2 text-faint",
  ok: "border-accent/50 bg-accent/15 text-accent",
  risk: "border-risk/50 bg-risk/15 text-risk",
  gov: "border-gov/50 bg-gov/15 text-gov-bright",
};

function ManagerTimelineCard({ seller }: { seller: CoachSeller }) {
  const events = managerTimeline(seller, inr);
  return (
    <section className="card-premium p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Clock size={14} className="text-brand-bright" />
        <span className="text-[13px] font-semibold text-ink">This week with {seller.firstName}</span>
      </div>
      <ol className="relative ml-1 grid gap-3 border-l border-edge pl-4 sm:grid-cols-5 sm:gap-0 sm:border-l-0 sm:pl-0">
        {events.map((e, i) => (
          <li key={i} className="relative sm:flex sm:flex-col sm:items-start sm:pr-3">
            <span
              className={cx(
                "absolute -left-[22px] top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border sm:static sm:mb-2",
                TIMELINE_DOT[e.tone],
              )}
            >
              <span className="h-1 w-1 rounded-full bg-current" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">{e.day}</span>
            <div className="mt-0.5 min-w-0">
              <div className="text-[12px] font-medium leading-snug text-ink">{e.title}</div>
              <div className="text-[11px] leading-snug text-faint">{e.detail}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Conversation answer
// ---------------------------------------------------------------------------
const CONFIDENCE_TONE: Record<CoachAnswer["confidence"], string> = {
  High: "border-accent/40 bg-accent/10 text-accent",
  Moderate: "border-amber/35 bg-amber/10 text-amber",
  Emerging: "border-edge bg-surface2/60 text-faint",
};

function AnswerCard({ answer, onFocus }: { answer: CoachAnswer; onFocus: (id: string | null) => void }) {
  return (
    <div className="mt-3 animate-fade-in rounded-xl border border-brand/20 bg-bg/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14.5px] font-semibold leading-snug text-ink">{answer.headline}</p>
        <span
          className={cx(
            "shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-semibold",
            CONFIDENCE_TONE[answer.confidence],
          )}
        >
          {answer.confidence} confidence
        </span>
      </div>

      <dl className="mt-3 space-y-2.5">
        <AnswerRow label="Why" tone="neutral" text={answer.why} />
        <AnswerRow label="Business impact" tone="risk" text={answer.businessImpact} />
        <AnswerRow label="Recommended action" tone="ok" text={answer.recommendedAction} />
        <AnswerRow label="Suggested follow-up" tone="neutral" text={answer.suggestedFollowUp} />
      </dl>

      {answer.focusSellerId ? (
        <button
          type="button"
          onClick={() => onFocus(answer.focusSellerId)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand/45 bg-brand/10 px-3 py-1.5 text-[11px] font-semibold text-brand-bright transition-colors hover:bg-brand/20"
        >
          Take me to this seller
          <ArrowRight size={12} />
        </button>
      ) : null}
    </div>
  );
}

function AnswerRow({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone: "neutral" | "ok" | "risk";
}) {
  const dot = tone === "ok" ? "bg-accent" : tone === "risk" ? "bg-risk" : "bg-faint";
  return (
    <div className="flex gap-2.5">
      <span className={cx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
      <div>
        <dt className="text-[9.5px] font-semibold uppercase tracking-wider text-faint">{label}</dt>
        <dd className="text-[12.5px] leading-relaxed text-muted">{text}</dd>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function CoachEmptyState() {
  return (
    <div className="card-premium flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-edge bg-surface2/60 text-faint">
        <Crown size={18} />
      </span>
      <div className="text-[14px] font-semibold text-ink">I don&apos;t have your team loaded yet</div>
      <p className="max-w-sm text-[12.5px] leading-relaxed text-faint">
        Run the portfolio analysis from the Command Center and I&apos;ll review your sellers, then
        tell you where to spend your time.
      </p>
    </div>
  );
}
