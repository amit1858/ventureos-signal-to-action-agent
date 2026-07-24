// VentureOS — Revenue Companion · Voice playback state machine (pure)
// ===================================================================
// A tiny, deterministic state machine driving the "Play briefing" control. It
// is kept pure (no DOM, no audio, no timers) so it can be unit-tested and so the
// client component stays a thin shell around it. The machine never fabricates a
// "playing" state — it only reaches "playing" when the component reports that
// real audio has started.

export type VoicePlaybackState =
  | "idle" // ready to request audio
  | "loading" // request in flight
  | "playing" // audio element is playing real audio
  | "paused" // user paused
  | "completed" // playback finished
  | "unavailable" // voice not configured / not offered
  | "error"; // request or playback failed

export type VoicePlaybackEvent =
  | { type: "play" }
  | { type: "audio_ready" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "ended" }
  | { type: "replay" }
  | { type: "fail" }
  | { type: "mark_unavailable" };

export function initialPlaybackState(configured: boolean): VoicePlaybackState {
  return configured ? "idle" : "unavailable";
}

export function reducePlayback(
  state: VoicePlaybackState,
  event: VoicePlaybackEvent,
): VoicePlaybackState {
  if (event.type === "mark_unavailable") return "unavailable";
  if (state === "unavailable") return "unavailable"; // terminal until re-init

  switch (event.type) {
    case "play":
      return state === "idle" || state === "completed" || state === "error"
        ? "loading"
        : state;
    case "audio_ready":
      return state === "loading" ? "playing" : state;
    case "pause":
      return state === "playing" ? "paused" : state;
    case "resume":
      return state === "paused" ? "playing" : state;
    case "ended":
      return state === "playing" ? "completed" : state;
    case "replay":
      return state === "completed" || state === "paused" || state === "playing"
        ? "loading"
        : state;
    case "fail":
      return state === "loading" || state === "playing" || state === "paused"
        ? "error"
        : state;
    default:
      return state;
  }
}

// Whether a network request should be issued for the given transition target.
export function requiresFetch(next: VoicePlaybackState): boolean {
  return next === "loading";
}
