// Manager Coach — POC experience (presentation adapter).
//
// Renders the Soul Machines Digital Person as the "AI Sales Director" inside a
// focused, central companion panel. The avatar lives strictly in the
// presentation layer: this component contains no coaching, ranking, decision,
// memory, governance, approval, mission or CRM logic, and it calls none.
//
// State machine:
//   config-missing   → assistant URL absent / invalid (fail closed)
//   idle             → waiting for the user to start (no resources loaded yet)
//   requesting-mic   → asking for microphone permission (audio only, no camera)
//   permission-denied→ user blocked the microphone
//   connecting       → embed mounted, waiting for it to load
//   ready            → embedded experience loaded
//   embed-failed     → embed blocked / timed out → offer retry + new window
//
// Microphone is requested only on explicit user interaction. Camera is never
// requested. If embedded rendering is blocked, a clear message plus an
// "Open in new window" fallback is shown — never a silent blank frame.

"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FlaskConical,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Settings2,
} from "lucide-react";

import { PERSONA_NAME, READY_MESSAGE } from "@/lib/soul-machines/config";

type PocState =
  | "config-missing"
  | "idle"
  | "requesting-mic"
  | "permission-denied"
  | "connecting"
  | "ready"
  | "blocked-embedding"
  | "embed-failed";

const EMBED_LOAD_TIMEOUT_MS = 20_000;

export function AvatarPocClient({ assistantUrl }: { assistantUrl: string | null }) {
  const [state, setState] = React.useState<PocState>(
    assistantUrl ? "idle" : "config-missing",
  );
  const [micDenied, setMicDenied] = React.useState(false);
  // The iframe is only mounted once a server-side probe confirms the provider
  // allows embedding from our origin. This prevents the browser's "refused to
  // connect" block page from firing a load event and looking like success.
  const [embedConfirmed, setEmbedConfirmed] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  React.useEffect(() => clearTimer, [clearTimer]);

  const armEmbedTimeout = React.useCallback(() => {
    clearTimer();
    timeoutRef.current = setTimeout(() => {
      setState((s) => (s === "connecting" ? "embed-failed" : s));
    }, EMBED_LOAD_TIMEOUT_MS);
  }, [clearTimer]);

  // After permission is handled, ask the server whether the assistant can be
  // embedded here. If yes, mount the iframe; if not, fall back to a clean
  // "open in new window" experience instead of a raw browser error.
  const proceedToEmbed = React.useCallback(async () => {
    if (!assistantUrl) {
      setState("config-missing");
      return;
    }
    setEmbedConfirmed(false);
    setState("connecting");
    try {
      const res = await fetch("/api/manager-coach/soul-machines/embeddable", {
        cache: "no-store",
      });
      const data = (await res.json()) as { embeddable?: boolean; reason?: string };
      if (data?.embeddable === true) {
        setEmbedConfirmed(true);
        armEmbedTimeout();
      } else if (data?.reason === "config-missing") {
        clearTimer();
        setState("config-missing");
      } else {
        // Provider refuses cross-origin framing (X-Frame-Options /
        // frame-ancestors), or the probe could not verify. Offer the new-window
        // path — the officially supported way to open the hosted assistant.
        clearTimer();
        setState("blocked-embedding");
      }
    } catch {
      clearTimer();
      setState("blocked-embedding");
    }
  }, [assistantUrl, armEmbedTimeout, clearTimer]);

  const startInteraction = React.useCallback(async () => {
    if (!assistantUrl) {
      setState("config-missing");
      return;
    }
    setState("requesting-mic");
    setMicDenied(false);

    // Microphone only — never request the camera.
    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        // No media API available — continue to the embed decision anyway.
        await proceedToEmbed();
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      // We only needed the grant; the embedded experience manages its own
      // audio. Release our probe tracks immediately.
      stream.getTracks().forEach((track) => track.stop());
      await proceedToEmbed();
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setMicDenied(true);
        setState("permission-denied");
      } else {
        // Device missing / other: continue — the seller can still view/listen.
        await proceedToEmbed();
      }
    }
  }, [assistantUrl, proceedToEmbed]);

  const handleEmbedLoad = React.useCallback(() => {
    clearTimer();
    setState((s) => (s === "connecting" ? "ready" : s));
  }, [clearTimer]);

  const handleEmbedError = React.useCallback(() => {
    clearTimer();
    setState("embed-failed");
  }, [clearTimer]);

  const retry = React.useCallback(() => {
    clearTimer();
    setEmbedConfirmed(false);
    setState("idle");
  }, [clearTimer]);

  const openInNewWindow = React.useCallback(() => {
    if (assistantUrl) {
      window.open(assistantUrl, "_blank", "noopener,noreferrer");
    }
  }, [assistantUrl]);

  const showFrame = embedConfirmed && (state === "connecting" || state === "ready");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-4 py-8">
      <PocHeader />

      <section className="card card-premium relative overflow-hidden p-5 sm:p-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
              Presentation preview
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-ink">{PERSONA_NAME}</h2>
          </div>
          {assistantUrl ? (
            <button
              type="button"
              onClick={openInNewWindow}
              className="btn-outline-primary inline-flex items-center gap-1.5 text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Open in new window
            </button>
          ) : null}
        </div>

        {/* Central companion stage */}
        <div className="relative flex min-h-[420px] items-center justify-center rounded-2xl border border-edge bg-surface2/40">
          {showFrame && assistantUrl ? (
            <iframe
              key={assistantUrl}
              title={`${PERSONA_NAME} — Soul Machines Digital Person (POC)`}
              src={assistantUrl}
              // Microphone + autoplay only. Camera is intentionally omitted.
              allow="microphone; autoplay"
              className="absolute inset-0 h-full w-full rounded-2xl border-0"
              onLoad={handleEmbedLoad}
              onError={handleEmbedError}
            />
          ) : null}

          {state === "connecting" ? (
            <Overlay>
              <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden />
              <p className="text-sm text-muted">Preparing your {PERSONA_NAME}…</p>
            </Overlay>
          ) : null}

          {state === "idle" ? (
            <StageMessage
              icon={<Mic className="h-6 w-6 text-accent" aria-hidden />}
              title={READY_MESSAGE}
              body="Starting the session will request microphone access so you can talk with your AI Sales Director. The camera is never used."
              action={
                <button
                  type="button"
                  onClick={startInteraction}
                  className="btn-outline-primary inline-flex items-center gap-2 text-sm"
                >
                  <Mic className="h-4 w-4" aria-hidden />
                  Start session
                </button>
              }
            />
          ) : null}

          {state === "requesting-mic" ? (
            <Overlay>
              <Mic className="h-6 w-6 animate-pulse text-accent" aria-hidden />
              <p className="text-sm text-muted">Waiting for microphone permission…</p>
            </Overlay>
          ) : null}

          {state === "permission-denied" ? (
            <StageMessage
              tone="warning"
              icon={<MicOff className="h-6 w-6 text-amber-500" aria-hidden />}
              title="Microphone access is blocked"
              body="Your AI Sales Director needs the microphone to hold a conversation. Allow microphone access for this site in your browser, then try again. You can also open the experience in a new window."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={startInteraction}
                    className="btn-outline-primary inline-flex items-center gap-2 text-sm"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Try again
                  </button>
                  {assistantUrl ? (
                    <button
                      type="button"
                      onClick={openInNewWindow}
                      className="btn-ghost inline-flex items-center gap-2 text-sm"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      Open in new window
                    </button>
                  ) : null}
                </div>
              }
            />
          ) : null}

          {state === "embed-failed" ? (
            <StageMessage
              tone="warning"
              icon={<AlertTriangle className="h-6 w-6 text-amber-500" aria-hidden />}
              title="The embedded experience could not load"
              body="This can happen if the provider blocks embedding or the network is slow. Try again, or open your AI Sales Director in a new window."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={retry}
                    className="btn-outline-primary inline-flex items-center gap-2 text-sm"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Retry
                  </button>
                  {assistantUrl ? (
                    <button
                      type="button"
                      onClick={openInNewWindow}
                      className="btn-ghost inline-flex items-center gap-2 text-sm"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      Open in new window
                    </button>
                  ) : null}
                </div>
              }
            />
          ) : null}

          {state === "blocked-embedding" ? (
            <StageMessage
              icon={<ExternalLink className="h-6 w-6 text-accent" aria-hidden />}
              title="Open your AI Sales Director in a new window"
              body="For security, the Soul Machines assistant does not allow itself to be embedded inside another site. Open it in a new window to talk with your AI Sales Director — the microphone works there. (Embedding it directly in VentureOS needs the official Soul Machines Web SDK, which is the recommended next step.)"
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={openInNewWindow}
                    className="btn-outline-primary inline-flex items-center gap-2 text-sm"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    Open in new window
                  </button>
                  <button
                    type="button"
                    onClick={retry}
                    className="btn-ghost inline-flex items-center gap-2 text-sm"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Back
                  </button>
                </div>
              }
            />
          ) : null}

          {state === "config-missing" ? (
            <StageMessage
              tone="warning"
              icon={<Settings2 className="h-6 w-6 text-amber-500" aria-hidden />}
              title="Manager Coach is not fully configured"
              body="The Soul Machines assistant URL is not set (NEXT_PUBLIC_SOUL_MACHINES_ASSISTANT_URL). Add it to your environment to enable the presentation preview. Until then, the experience stays disabled."
            />
          ) : null}
        </div>

        {micDenied && state !== "permission-denied" ? (
          <p className="mt-3 text-center text-[12px] text-amber-500">
            Microphone access was previously blocked for this site.
          </p>
        ) : null}
      </section>

      <p className="text-center text-[11px] leading-relaxed text-faint">
        Experimental proof of concept. The AI Sales Director avatar is a
        presentation adapter only and does not influence recommendations,
        governance, approvals or CRM data.
      </p>
    </main>
  );
}

function PocHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to VentureOS
      </Link>
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
        <FlaskConical className="h-3 w-3" aria-hidden />
        Manager Coach · POC · Experimental
      </span>
    </header>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl bg-surface/70 backdrop-blur-sm">
      {children}
    </div>
  );
}

function StageMessage({
  icon,
  title,
  body,
  action,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
  tone?: "warning";
}) {
  return (
    <div
      className="relative z-10 mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-8 text-center"
      role={tone === "warning" ? "alert" : undefined}
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-edge bg-surface">
        {icon}
      </span>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="text-[13px] leading-relaxed text-muted">{body}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
