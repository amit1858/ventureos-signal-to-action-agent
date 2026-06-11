"use client";

import * as React from "react";
import { useCountUp } from "@/lib/useCountUp";

// Renders an animated number. `format` maps the (interpolated) numeric value
// to its display string; defaults to a rounded, locale-grouped integer.
export function Counter({
  value,
  format,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const v = useCountUp(value);
  return <span className={className}>{format ? format(v) : Math.round(v).toLocaleString("en-IN")}</span>;
}
