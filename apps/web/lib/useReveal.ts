"use client";

import * as React from "react";

// Reveal-on-scroll: returns a ref + whether the element has entered the
// viewport once. Honours prefers-reduced-motion (shows immediately) and
// degrades gracefully when IntersectionObserver is unavailable. Presentation
// only — no business logic.
export function useReveal<T extends HTMLElement = HTMLElement>(): {
  ref: React.RefObject<T>;
  shown: boolean;
} {
  const ref = React.useRef<T>(null);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShown(true);
            obs.disconnect();
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, shown };
}
