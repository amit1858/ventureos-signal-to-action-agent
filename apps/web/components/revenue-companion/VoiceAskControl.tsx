"use client";

import * as React from "react";
import { Mic, Square, Loader2, AlertTriangle, X } from "lucide-react";

import { cx } from "@/lib/format";

// Revenue Companion — Voice Ask (speech-to-text) control
// ======================================================
// A push-to-talk microphone that sits BESIDE the typed input. It captures a
// short clip on an explicit user gesture, uploads it to the server-only
// /transcribe route, and hands the reviewed transcript back to the parent. It
// NEVER auto-submits: the seller reads/edits the transcript, then presses Ask.
// It owns no governed state and cannot rank, approve, or execute anything.
//
// No auto-listen, no wake word, no background capture: recording starts only on
// a click/keypress, is capped in duration, shows a live indicator, and the audio
// is discarded as soon as the upload completes.

export type VoiceInputStatusProp = {
  offered: boolean;
  configured: boolean;
  classification:
    | "voice_input_disabled"
    | "gnani_unconfigured"
    | "gnani_configured_unverified";
};

type MicState =
  | "ready"
  | "requesting_permission"
  | "permission_denied"
  | "recording"
  | "uploading"
  | "transcribing"
  | "error"
  | "unsupported_browser";

const CLIENT_MAX_DURATION_MS = 20_000;

// Pick the first MediaRecorder mime type the browser + our server allow-list
// both accept. Returns null when none is supported.
function pickMimeType(): string | null {
  if (
    typeof window === "undefined" ||
    typeof (window as unknown as { MediaRecorder?: unknown }).MediaRecorder ===
      "undefined"
  ) {
    return null;
  }
  // Gnani STT v3 accepts m4a/mp3/wav/flac/aac/ogg but NOT webm. Prefer the
  // browser-native containers Gnani accepts (mp4/AAC on Chromium/Safari,
  // ogg/opus on Firefox); keep webm only as a last-resort fallback so a
  // browser that supports nothing else still records something.
  const candidates = [
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/wav",
    "audio/webm;codecs=opus",
    "audio/webm",
  ];
  const MR = window.MediaRecorder;
  for (const c of candidates) {
    try {
      if (MR.isTypeSupported && MR.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

const ERROR_COPY: Record<string, string> = {
  provider_unavailable: "Voice transcription is unavailable right now. Please type your question.",
  unconfigured: "Voice input is not configured yet. Please type your question.",
  audio_too_long: "That recording was too long. Keep it under 20 seconds.",
  audio_too_large: "That recording was too large. Try a shorter question.",
  empty_audio: "No speech was captured. Try again, closer to the mic.",
  empty_transcript: "Nothing was transcribed. Try speaking again clearly.",
  unsupported_mime: "This browser's audio format is not supported for voice input.",
  network_error: "Could not reach the transcription service. Please type your question.",
  generic: "Voice input failed. Please type your question instead.",
};

export function VoiceAskControl({
  status,
  onTranscript,
  disabled = false,
}: {
  status: VoiceInputStatusProp;
  // Called with the reviewed transcript text. The parent puts it in the question
  // box for review; it does NOT submit. Submission is a separate explicit Ask.
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [state, setState] = React.useState<MicState>("ready");
  const [errorKey, setErrorKey] = React.useState<string>("generic");
  const [elapsedMs, setElapsedMs] = React.useState(0);

  const mediaRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const startedAtRef = React.useRef<number>(0);
  const stopTimerRef = React.useRef<number | null>(null);
  const tickRef = React.useRef<number | null>(null);
  const cancelledRef = React.useRef(false);

  const configured =
    status.configured && status.classification === "gnani_configured_unverified";

  // Release the microphone + timers. Safe to call repeatedly.
  const teardown = React.useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRef.current = null;
    chunksRef.current = [];
  }, []);

  React.useEffect(() => teardown, [teardown]);

  const fail = React.useCallback(
    (key: string) => {
      setErrorKey(key in ERROR_COPY ? key : "generic");
      setState("error");
      teardown();
    },
    [teardown],
  );

  const upload = React.useCallback(
    async (blob: Blob, durationMs: number) => {
      setState("transcribing");
      try {
        const form = new FormData();
        const ext = blob.type.includes("mp4")
          ? "m4a"
          : blob.type.includes("ogg")
            ? "ogg"
            : blob.type.includes("wav")
              ? "wav"
              : "webm";
        form.append("audio_file", blob, `question.${ext}`);
        form.append("language_code", "en-IN");
        form.append("duration_ms", String(Math.round(durationMs)));
        const res = await fetch("/api/revenue-companion/transcribe", {
          method: "POST",
          body: form,
          cache: "no-store",
        });
        const data = (await res.json().catch(() => null)) as
          | { ok: boolean; status: string; reason?: string; transcript?: { transcript: string } }
          | null;
        if (res.ok && data?.ok && data.transcript?.transcript) {
          setState("ready");
          setElapsedMs(0);
          onTranscript(data.transcript.transcript);
          return;
        }
        if (data?.status === "unconfigured") return fail("unconfigured");
        if (res.status === 404) return fail("provider_unavailable");
        if (res.status === 400) return fail(data?.reason ?? "generic");
        return fail("provider_unavailable");
      } catch {
        fail("network_error");
      }
    },
    [onTranscript, fail],
  );

  const stop = React.useCallback(() => {
    const rec = mediaRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const cancel = React.useCallback(() => {
    cancelledRef.current = true;
    stop();
    teardown();
    setState("ready");
    setElapsedMs(0);
  }, [stop, teardown]);

  const start = React.useCallback(async () => {
    if (disabled || !configured) return;
    const mime = pickMimeType();
    if (
      !mime ||
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setState("unsupported_browser");
      return;
    }
    cancelledRef.current = false;
    setErrorKey("generic");
    setState("requesting_permission");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState("permission_denied");
      return;
    }
    streamRef.current = stream;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime });
    } catch {
      teardown();
      setState("unsupported_browser");
      return;
    }
    mediaRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const durationMs = Date.now() - startedAtRef.current;
      const parts = chunksRef.current;
      // Release the mic immediately; the audio blob lives only until upload.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      if (cancelledRef.current) return;
      if (parts.length === 0) {
        fail("empty_audio");
        return;
      }
      const blob = new Blob(parts, { type: mime });
      if (blob.size < 512) {
        fail("empty_audio");
        return;
      }
      setState("uploading");
      void upload(blob, durationMs);
    };

    startedAtRef.current = Date.now();
    setElapsedMs(0);
    try {
      recorder.start();
    } catch {
      teardown();
      fail("generic");
      return;
    }
    setState("recording");
    tickRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 100);
    // Hard client-side duration cap.
    stopTimerRef.current = window.setTimeout(() => {
      stop();
    }, CLIENT_MAX_DURATION_MS);
  }, [disabled, configured, teardown, upload, fail, stop]);

  // Keyboard: Escape cancels an active recording.
  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && state === "recording") {
        e.preventDefault();
        cancel();
      }
    },
    [state, cancel],
  );

  // Do not render an affordance the server did not offer.
  if (!status.offered) return null;

  const remaining = Math.max(0, CLIENT_MAX_DURATION_MS - elapsedMs);
  const secondsLeft = Math.ceil(remaining / 1000);

  // Truthful, non-configured state: show a disabled, explained control.
  if (!configured) {
    return (
      <div className="flex items-center gap-1.5" onKeyDown={onKeyDown}>
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Voice input is not configured"
          className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-edge bg-surface2/40 text-faint"
        >
          <Mic size={18} aria-hidden />
          <span className="sr-only">Voice input unavailable</span>
        </button>
      </div>
    );
  }

  const busy =
    state === "requesting_permission" ||
    state === "uploading" ||
    state === "transcribing";

  return (
    <div className="flex flex-col items-stretch gap-1" onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2">
        {state === "recording" ? (
          <button
            type="button"
            onClick={stop}
            aria-label="Stop recording"
            className="flex h-11 min-h-[44px] items-center gap-2 rounded-xl border border-risk/50 bg-risk/15 px-3 text-[13px] font-semibold text-risk focus:outline-none focus-visible:ring-2 focus-visible:ring-risk/50"
          >
            <span
              className="h-2.5 w-2.5 animate-pulse rounded-full bg-risk"
              aria-hidden
            />
            <Square size={15} aria-hidden />
            <span>Stop · {secondsLeft}s</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={disabled || busy}
            aria-label="Speak your question"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-brand/40 bg-brand/10 text-brand-bright transition-colors hover:border-brand/60 hover:bg-brand/15 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" aria-hidden />
            ) : (
              <Mic size={18} aria-hidden />
            )}
            <span className="sr-only">Speak your question</span>
          </button>
        )}

        {state === "recording" && (
          <button
            type="button"
            onClick={cancel}
            aria-label="Cancel recording"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-edge bg-surface2/40 text-faint hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <X size={16} aria-hidden />
            <span className="sr-only">Cancel recording</span>
          </button>
        )}
      </div>

      {/* Live status region for screen readers + sighted users. */}
      <p
        aria-live="polite"
        className={cx(
          "min-h-[16px] text-[11px] leading-tight",
          state === "permission_denied" ||
            state === "error" ||
            state === "unsupported_browser"
            ? "text-risk"
            : "text-faint",
        )}
      >
        {state === "recording" && "Listening… speak your question, then press Stop."}
        {state === "requesting_permission" && "Requesting microphone permission…"}
        {state === "uploading" && "Uploading audio…"}
        {state === "transcribing" && "Transcribing your question…"}
        {state === "permission_denied" &&
          "Microphone permission denied. Enable it or type your question."}
        {state === "unsupported_browser" &&
          "This browser does not support voice capture. Please type your question."}
        {state === "error" && (
          <span className="inline-flex items-center gap-1">
            <AlertTriangle size={11} aria-hidden />
            {ERROR_COPY[errorKey] ?? ERROR_COPY.generic}
          </span>
        )}
        {state === "ready" && "Audio is used only to transcribe this question."}
      </p>
    </div>
  );
}
