"use client";

import * as React from "react";
import {
  Sparkles,
  Loader2,
  Send,
  ShieldCheck,
  ArrowDownToLine,
  ChevronDown,
  X,
} from "lucide-react";

import { buildAnswerVoiceRequest } from "@/lib/revenue-companion/voice/voiceRequest";
import type { RevenueCompanionAnswer } from "@/lib/revenue-companion/answerContract";
import {
  buildActionCenterSnapshot,
  type ActionCenterPresentationSnapshot,
  type RankedAccountInput,
  type SelectedAccountInput,
} from "@/lib/revenue-companion/actionCenterSnapshot";
import { COMPANION_STABLE_TIMESTAMP } from "@/lib/revenue-companion/companionContract";
import { GUIDED_INTENTS, type GuidedIntent } from "@/lib/revenue-companion/guided/intentRouter";
import { cx } from "@/lib/format";
import { VoicePlaybackControl, type VoiceStatusProp } from "./VoicePlaybackControl";
import { VoiceAskControl, type VoiceInputStatusProp } from "./VoiceAskControl";

// Embedded Action Center Revenue Companion overlay (Phase 3.2).
// ============================================================
// An ADDITIVE, flag-gated surface that sits above the Command Center. It shares
// the exact same governed answer engine as the homepage teaser and the
// standalone /companion route: it never composes text locally — it asks the
// server route for ONE bounded, grounded answer and renders it read-only. It
// owns no governed state. Its only "action" is presentation: it can scroll and
// briefly highlight an EXISTING Action Center panel the answer points at. It
// never re-ranks, approves, executes, or writes back to any CRM.

// Human-facing chip labels for the bounded intents. Presentation only — the
// server remains the single source of the actual answer for each intent.
const INTENT_LABELS: Record<GuidedIntent, string> = {
  MISSION_TODAY: "Today's mission",
  PRIORITY_ACCOUNTS: "Priority accounts",
  TOP_SIGNALS: "Top signals",
  NEXT_ACTION: "Next action",
  ACCOUNT_PRIORITY_REASON: "Why this account?",
};

type AnswerState =
  | { kind: "idle" }
  | {
      kind: "answer";
      answer: RevenueCompanionAnswer;
      snapshot: ActionCenterPresentationSnapshot | null;
    }
  | { kind: "loading" }
  | { kind: "unsupported"; answer: RevenueCompanionAnswer | null }
  | { kind: "error"; message: string };

// Briefly ring an existing panel so the seller's eye lands where the answer
// points. Presentation-only: it reads no state and mutates nothing but a
// transient CSS class on an element that already exists in the DOM. It prefers
// the most specific target that is actually present, then falls back to the
// panel anchor — an absent candidate is silently skipped (never an error).
function focusPanel(anchorId: string, candidateIds: string[] = []) {
  if (typeof document === "undefined") return;
  let el: HTMLElement | null = null;
  for (const id of candidateIds) {
    if (!id) continue;
    const found = document.getElementById(id);
    if (found) {
      el = found;
      break;
    }
  }
  if (!el) el = document.getElementById(anchorId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.add("companion-focus-ring");
  window.setTimeout(() => el?.classList.remove("companion-focus-ring"), 2400);
}

// Derive candidate DOM element ids for the specific target an answer points at.
// The Action Center component is frozen; we do not know its row-level id scheme,
// so we try a small set of reasonable conventions and gracefully fall back to
// the panel anchor when none are present. Presentation-only.
function focusCandidateIds(focus: RevenueCompanionAnswer["workspaceFocus"]): string[] {
  if (!focus) return [];
  const ids: string[] = [];
  const push = (prefix: string, value?: string | null) => {
    if (value) ids.push(`${prefix}${value}`, value);
  };
  push("account-", focus.targetAccountId);
  push("recommendation-", focus.targetRecommendationId);
  push("signal-", focus.targetSignalId);
  push("mission-", focus.targetMissionId);
  return ids;
}

export function RevenueCompanionOverlay({
  voiceStatus,
  voiceInputStatus,
  autoOpenSignal = 0,
  focusHref,
  startOpen = false,
  recommendations = null,
  selectedAccount = null,
  dataSourceLabel,
}: {
  voiceStatus?: VoiceStatusProp;
  voiceInputStatus?: VoiceInputStatusProp;
  autoOpenSignal?: number;
  // When set, the "show me" affordance becomes a link to this href instead of
  // scrolling to an in-page anchor. Used by the standalone /companion route,
  // which has no Action Center panels to scroll to.
  focusHref?: string;
  startOpen?: boolean;
  // Live Action Center presentation (Phase 3.2A). When present, the Companion
  // binds its answers to what the seller currently sees — the ranked portfolio,
  // the selected account, and its signals — instead of the canonical demo
  // journey. These are already-displayed, presentation-only projections; the
  // server re-validates every field and treats them as presentation state only.
  recommendations?: RankedAccountInput[] | null;
  selectedAccount?: SelectedAccountInput | null;
  dataSourceLabel?: string;
}) {
  const [open, setOpen] = React.useState(startOpen);
  const [question, setQuestion] = React.useState("");
  const [state, setState] = React.useState<AnswerState>({ kind: "idle" });
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const requestSeq = React.useRef(0);

  // Voice input hands back a reviewed transcript. It is placed in the question
  // box for the seller to read/edit — it is NEVER auto-submitted. Submission is a
  // separate, explicit Ask press.
  const onTranscript = React.useCallback((text: string) => {
    setQuestion(text);
    window.setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 30);
  }, []);

  // Compose the immutable, fingerprinted presentation snapshot from the live
  // Action Center props. Content-addressed: any change to displayed rank order,
  // selection, or signals yields a new identity, so a stale snapshot can never
  // masquerade as the current view. Null when there is no live portfolio (the
  // homepage teaser and /companion fall back to the canonical journey).
  const snapshot = React.useMemo<ActionCenterPresentationSnapshot | null>(() => {
    if (!recommendations || recommendations.length === 0) return null;
    try {
      return buildActionCenterSnapshot({
        recommendations,
        selected: selectedAccount ?? null,
        dataSourceLabel,
        generatedAt: COMPANION_STABLE_TIMESTAMP,
      });
    } catch {
      return null;
    }
  }, [recommendations, selectedAccount, dataSourceLabel]);

  // The homepage teaser raises a monotonic signal to open + reveal the overlay.
  React.useEffect(() => {
    if (autoOpenSignal <= 0) return;
    setOpen(true);
    const id = window.setTimeout(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => window.clearTimeout(id);
  }, [autoOpenSignal]);

  const ask = React.useCallback(
    async (body: { intent: GuidedIntent } | { question: string }) => {
      const seq = ++requestSeq.current;
      const sentSnapshot = snapshot;
      setState({ kind: "loading" });
      try {
        const res = await fetch("/api/revenue-companion/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            sentSnapshot ? { ...body, presentationSnapshot: sentSnapshot } : body,
          ),
          cache: "no-store",
        });
        if (seq !== requestSeq.current) return; // superseded
        if (res.ok) {
          const data = (await res.json()) as { ok: boolean; answer: RevenueCompanionAnswer };
          if (seq !== requestSeq.current) return;
          const answer = data.answer;
          if (answer.intent === "UNSUPPORTED") {
            setState({ kind: "unsupported", answer });
          } else {
            setState({ kind: "answer", answer, snapshot: sentSnapshot });
          }
        } else if (res.status === 400) {
          setState({ kind: "unsupported", answer: null });
        } else {
          setState({ kind: "error", message: "The Companion is unavailable right now." });
        }
      } catch {
        if (seq !== requestSeq.current) return;
        setState({ kind: "error", message: "The Companion could not be reached." });
      }
    },
    [snapshot],
  );

  const onSubmitText = React.useCallback(() => {
    const q = question.trim();
    if (!q) return;
    void ask({ question: q });
  }, [question, ask]);

  const answer =
    state.kind === "answer" || state.kind === "unsupported" ? state.answer : null;
  // Voice reads the SAME answer the seller sees. When that answer is snapshot-
  // bound, carry the exact snapshot it was composed from so the server recomposes
  // and re-verifies against it — a later selection change fails closed, never
  // narrates the wrong account.
  const answerSnapshot = state.kind === "answer" ? state.snapshot : null;
  const voiceRequest = answer
    ? buildAnswerVoiceRequest(answer, answerSnapshot ?? undefined)
    : null;

  return (
    <section
      ref={sectionRef}
      aria-labelledby="ac-companion-heading"
      className="mb-4 card-premium relative overflow-hidden"
    >
      <div className="grid-dots pointer-events-none absolute inset-0 opacity-[0.07]" aria-hidden />
      <div className="relative">
        {/* Header — collapsible so it never crowds the power view. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="ac-companion-body"
          className="flex w-full items-center gap-2 px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand/40 bg-brand/15 text-brand-bright">
            <Sparkles size={14} />
          </span>
          <span id="ac-companion-heading" className="text-[13px] font-semibold text-ink">
            Ask your Revenue Companion
          </span>
          <span className="ml-2 hidden text-[11px] text-faint sm:inline">
            One governed read — what changed, why, and the next step
          </span>
          <ChevronDown
            size={16}
            className={cx(
              "ml-auto text-faint transition-transform",
              open ? "rotate-180" : "",
            )}
            aria-hidden
          />
        </button>

        {open ? (
          <div id="ac-companion-body" className="px-5 pb-5">
            {/* Bounded intent chips — the fastest, always-answerable path. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-faint">Ask</span>
              {GUIDED_INTENTS.map((intent) => (
                <button
                  key={intent}
                  type="button"
                  onClick={() => void ask({ intent })}
                  className="rounded-full border border-edge bg-surface2/50 px-3 py-1 text-[11px] font-medium text-muted transition-colors hover:border-brand/40 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  {INTENT_LABELS[intent]}
                </button>
              ))}
            </div>

            {/* Optional free-text — bounded, routed deterministically server-side. */}
            <div className="mt-3 flex items-start gap-2">
              {voiceInputStatus && voiceInputStatus.offered ? (
                <VoiceAskControl
                  status={voiceInputStatus}
                  onTranscript={onTranscript}
                  disabled={state.kind === "loading"}
                />
              ) : null}
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSubmitText();
                }}
                maxLength={200}
                rows={1}
                placeholder="Ask in your words — e.g. what's my mission today?"
                className="h-11 min-h-[44px] flex-1 resize-none rounded-xl border border-edge bg-surface2/50 px-4 py-2.5 text-sm leading-relaxed text-ink outline-none transition-colors placeholder:text-faint focus:border-brand/50"
              />
              <button
                type="button"
                onClick={onSubmitText}
                disabled={state.kind === "loading" || !question.trim()}
                className="btn btn-primary h-11 px-4 text-[13px] font-semibold"
              >
                {state.kind === "loading" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
                Ask
              </button>
            </div>

            {/* Answer region — one governed read, rendered read-only. */}
            <div className="mt-4" aria-live="polite">
              {state.kind === "error" ? (
                <p className="rounded-lg border border-risk/40 bg-risk/10 px-4 py-3 text-sm text-risk">
                  {state.message}
                </p>
              ) : null}

              {state.kind === "unsupported" ? (
                <div className="rounded-lg border border-edge bg-surface2/40 px-4 py-3">
                  <p className="text-sm text-ink">
                    {state.answer
                      ? state.answer.headline
                      : "I can answer a focused set of governed questions. Try one of the prompts above."}
                  </p>
                  {state.answer ? (
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">
                      {state.answer.visibleSections[0]?.body}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {answer && state.kind === "answer" ? (
                <AnswerCard
                  answer={answer}
                  voiceStatus={voiceStatus}
                  voiceRequest={voiceRequest}
                  focusHref={focusHref}
                  onDismiss={() => {
                    setState({ kind: "idle" });
                    setQuestion("");
                  }}
                />
              ) : null}
            </div>

            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-faint">
              <ShieldCheck size={12} className="text-amber" />
              A narrative view of governed results. It changes no ranking, approves nothing, and
              executes nothing.
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AnswerCard({
  answer,
  voiceStatus,
  voiceRequest,
  focusHref,
  onDismiss,
}: {
  answer: RevenueCompanionAnswer;
  voiceStatus?: VoiceStatusProp;
  voiceRequest: ReturnType<typeof buildAnswerVoiceRequest>;
  focusHref?: string;
  onDismiss: () => void;
}) {
  const focus = answer.workspaceFocus;
  return (
    <div className="rounded-xl border border-brand/30 bg-brand/[0.06] p-4">
      <div className="flex items-start gap-2">
        <h3 className="text-[15px] font-semibold leading-snug text-ink">{answer.headline}</h3>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss answer"
          className="ml-auto rounded-md p-1 text-faint hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          <X size={15} />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {answer.visibleSections.map((sec, i) => (
          <div key={`${sec.heading}-${i}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">
              {sec.heading}
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{sec.body}</p>
          </div>
        ))}
      </div>

      {/* Governed status line — echoed labels, never new facts. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-edge pt-3 text-[11px]">
        <span className="text-faint">Status:</span>
        <span className="font-medium text-ink">{answer.governanceStatus}</span>
        <span className="text-faint">·</span>
        <span className="text-muted">{answer.approvalStatus}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {focus && focusHref ? (
          <a
            href={focusHref}
            className="btn btn-ghost px-3.5 py-2 text-[12px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <ArrowDownToLine size={14} /> {focus.label}
          </a>
        ) : focus ? (
          <button
            type="button"
            onClick={() => focusPanel(focus.anchorId, focusCandidateIds(focus))}
            className="btn btn-ghost px-3.5 py-2 text-[12px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <ArrowDownToLine size={14} /> {focus.label}
          </button>
        ) : null}
        {voiceStatus?.offered && voiceRequest ? (
          <VoicePlaybackControl status={voiceStatus} request={voiceRequest} />
        ) : null}
      </div>
    </div>
  );
}

export default RevenueCompanionOverlay;
