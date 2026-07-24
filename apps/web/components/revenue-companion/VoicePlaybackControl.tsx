"use client";

import * as React from "react";
import { Volume2, Loader2, Pause, Play, RotateCcw, VolumeX } from "lucide-react";

import { COMPANION_STRINGS } from "@/lib/revenue-companion/strings";
import {
  initialPlaybackState,
  reducePlayback,
  type VoicePlaybackState,
} from "@/lib/revenue-companion/voice/playbackState";
import type { VoiceBriefingRequest } from "@/lib/revenue-companion/voice/voiceRequest";
import { cx } from "@/lib/format";

// The plain, serializable voice status the server hands the panel. Mirrors
// VoicePresentationStatus but is redeclared here to keep this a pure client
// module (no server import).
export interface VoiceStatusProp {
  offered: boolean;
  configured: boolean;
  classification:
    | "voice_disabled"
    | "gnani_unconfigured"
    | "gnani_configured_unverified";
}

// Read-only "Play briefing" control. It speaks the exact deterministic briefing
// by posting a journey reference (never text) to the server route and playing
// the returned audio. It owns no governed state and can mutate nothing.
export function VoicePlaybackControl({
  status,
  request,
}: {
  status: VoiceStatusProp;
  request: VoiceBriefingRequest;
}) {
  const v = COMPANION_STRINGS.voice;
  const [state, setState] = React.useState<VoicePlaybackState>(() =>
    initialPlaybackState(status.configured),
  );
  const [live, setLive] = React.useState(false);

  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const urlRef = React.useRef<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const cleanupAudio = React.useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  React.useEffect(() => cleanupAudio, [cleanupAudio]);

  const fetchAndPlay = React.useCallback(async () => {
    cleanupAudio();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/revenue-companion/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
        cache: "no-store",
      });
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      if (res.ok && contentType.includes("audio/")) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.addEventListener("playing", () =>
          setState((s) => reducePlayback(s, { type: "audio_ready" })),
        );
        audio.addEventListener("ended", () =>
          setState((s) => reducePlayback(s, { type: "ended" })),
        );
        audio.addEventListener("error", () =>
          setState((s) => reducePlayback(s, { type: "fail" })),
        );
        setLive(true);
        await audio.play();
        return;
      }
      // Offered but no live audio (unconfigured), or a provider failure.
      if (res.status === 200) {
        setState((s) => reducePlayback(s, { type: "mark_unavailable" }));
      } else {
        setState((s) => reducePlayback(s, { type: "fail" }));
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setState((s) => reducePlayback(s, { type: "fail" }));
    }
  }, [request, cleanupAudio]);

  const onPlay = React.useCallback(() => {
    setState((s) => {
      const next = reducePlayback(s, { type: "play" });
      if (next === "loading") void fetchAndPlay();
      return next;
    });
  }, [fetchAndPlay]);

  const onReplay = React.useCallback(() => {
    setState((s) => {
      const next = reducePlayback(s, { type: "replay" });
      if (next === "loading") void fetchAndPlay();
      return next;
    });
  }, [fetchAndPlay]);

  const onPause = React.useCallback(() => {
    audioRef.current?.pause();
    setState((s) => reducePlayback(s, { type: "pause" }));
  }, []);

  const onResume = React.useCallback(() => {
    void audioRef.current?.play();
    setState((s) => reducePlayback(s, { type: "resume" }));
  }, []);

  if (!status.offered) return null;

  const providerLine = live
    ? v.providerLive
    : status.configured
      ? v.providerConfiguredPending
      : v.providerUnconfigured;

  return (
    <div className="mt-4 rounded-lg border border-edge bg-surface2/40 p-4">
      <div className="flex items-center gap-2">
        <span className="section-label">{v.sectionLabel}</span>
        <span className="ml-auto text-[11px] text-faint">{providerLine}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PrimaryVoiceButton
          state={state}
          configured={status.configured}
          onPlay={onPlay}
          onPause={onPause}
          onResume={onResume}
          onReplay={onReplay}
        />
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-faint" role="status" aria-live="polite">
        {statusMessage(state)}
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-faint">{v.disclaimer}</p>
    </div>
  );
}

function statusMessage(state: VoicePlaybackState): string {
  const v = COMPANION_STRINGS.voice;
  switch (state) {
    case "loading":
      return v.statusLoading;
    case "playing":
      return v.statusPlaying;
    case "paused":
      return v.statusPaused;
    case "completed":
      return v.statusCompleted;
    case "unavailable":
      return v.statusUnavailable;
    case "error":
      return v.statusError;
    default:
      return v.statusIdle;
  }
}

function PrimaryVoiceButton({
  state,
  configured,
  onPlay,
  onPause,
  onResume,
  onReplay,
}: {
  state: VoicePlaybackState;
  configured: boolean;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onReplay: () => void;
}) {
  const v = COMPANION_STRINGS.voice;
  const base =
    "btn btn-ghost focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60";

  if (state === "unavailable" || !configured) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-surface2/50 px-3 py-1.5 text-xs text-faint"
        aria-disabled="true"
      >
        <VolumeX size={14} aria-hidden="true" />
        {v.unavailable}
      </span>
    );
  }
  if (state === "loading") {
    return (
      <button type="button" className={base} disabled aria-busy="true">
        <Loader2 size={15} className="animate-spin" aria-hidden="true" />
        {v.preparing}
      </button>
    );
  }
  if (state === "playing") {
    return (
      <button type="button" className={base} onClick={onPause}>
        <Pause size={15} aria-hidden="true" />
        {v.pause}
      </button>
    );
  }
  if (state === "paused") {
    return (
      <button type="button" className={base} onClick={onResume}>
        <Play size={15} aria-hidden="true" />
        {v.resume}
      </button>
    );
  }
  if (state === "completed" || state === "error") {
    return (
      <button type="button" className={base} onClick={onReplay}>
        <RotateCcw size={15} aria-hidden="true" />
        {v.replay}
      </button>
    );
  }
  return (
    <button type="button" className={cx(base)} onClick={onPlay}>
      <Volume2 size={15} aria-hidden="true" />
      {v.play}
    </button>
  );
}
