// Release 1.4A — Executive Focus Mode.
//
// A lightweight "presentation mode" for executives. When enabled, the Command
// Center collapses to only the decision-critical surfaces — the Morning Brief,
// today's priorities, and execution — and quiets everything secondary. It is a
// pure visibility/IA layer that sits ON TOP of the existing experience modes;
// it never touches data, ranking, recommendations, governance, approvals, the
// ledger, agents, or the backend.

"use client";

import { useEffect, useState } from "react";
import type { SectionKey } from "./experienceMode";

const STORAGE_KEY = "s2a_focus_mode_v1";
const EVENT_NAME = "s2a:focus-mode:changed";

// The only sections that survive Focus Mode: the executive narrative, the
// daily briefing (today's recommended actions) and the execution workbench.
const FOCUS_WHITELIST: ReadonlySet<SectionKey> = new Set<SectionKey>([
  "chiefOfStaff",
  "dailyBriefing",
  "workbench",
]);

export function isFocusVisible(key: SectionKey): boolean {
  return FOCUS_WHITELIST.has(key);
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadFocusMode(): boolean {
  if (!isBrowser()) return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveFocusMode(on: boolean): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* quota */
  }
}

/** React hook that reads + persists Focus Mode and syncs across listeners. */
export function useFocusMode(): [boolean, (on: boolean) => void, () => void] {
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    setFocus(loadFocusMode());
    const onChange = () => setFocus(loadFocusMode());
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);

  const set = (on: boolean) => {
    setFocus(on);
    saveFocusMode(on);
  };
  const toggle = () => set(!loadFocusMode());

  return [focus, set, toggle];
}
