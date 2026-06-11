"use client";

import * as React from "react";

// Animate a number from its previous value to `target` with an ease-out curve.
// Respects prefers-reduced-motion (snaps immediately). Used for executive
// KPI / money counters — subtle, no gaming bounce.
export function useCountUp(target: number, durationMs = 650): number {
  const [val, setVal] = React.useState(target);
  const fromRef = React.useRef(target);

  React.useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const from = fromRef.current;
    const to = target;
    if (reduce || from === to) {
      setVal(to);
      fromRef.current = to;
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (to - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return val;
}
