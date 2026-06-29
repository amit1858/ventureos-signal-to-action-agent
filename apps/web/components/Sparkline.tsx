"use client";

import * as React from "react";
import { cx } from "@/lib/format";

// Release 1.4A polish — a tiny, calm sparkline for executive metrics. Pure SVG,
// no dependency. Series is generated deterministically from a seed so identical
// inputs always render identical trends. Presentation only.

function seriesFrom(seed: string, points: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: number[] = [];
  let v = 0.5;
  for (let i = 0; i < points; i++) {
    h = Math.imul(h ^ (h >>> 13), 16777619);
    v = Math.max(0.05, Math.min(0.95, v + (((h >>> 0) % 1000) / 1000 - 0.5) * 0.4));
    out.push(v);
  }
  return out;
}

export function Sparkline({
  seed,
  trend = "flat",
  tone,
  points = 12,
  width = 56,
  height = 18,
  className,
}: {
  seed: string;
  trend?: "up" | "down" | "flat";
  tone?: "risk" | "opp" | "neutral";
  points?: number;
  width?: number;
  height?: number;
  className?: string;
}) {
  const data = React.useMemo(() => {
    const s = seriesFrom(seed, points);
    if (trend === "up") return s.map((v, i) => Math.min(0.95, v * 0.5 + (i / (points - 1)) * 0.5));
    if (trend === "down") return s.map((v, i) => Math.min(0.95, v * 0.5 + (1 - i / (points - 1)) * 0.5));
    return s;
  }, [seed, trend, points]);

  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const stroke =
    tone === "risk"
      ? "#f87171"
      : tone === "opp"
        ? "#34d399"
        : trend === "up"
          ? "#34d399"
          : trend === "down"
            ? "#f87171"
            : "#9aa3ad";
  const path = data
    .map((v, i) => {
      const x = (i / (points - 1)) * width;
      const y = height - ((v - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cx("overflow-visible", className)}
      aria-hidden
      focusable="false"
    >
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
    </svg>
  );
}
