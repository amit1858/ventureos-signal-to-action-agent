"use client";

// VisualEvidence — framed, responsive, click-to-expand walkthrough evidence
// =========================================================================
// Presentation only. Renders a single WalkthroughVisual as a framed thumbnail
// with a caption; clicking (or Enter/Space) opens an accessible lightbox. The
// intrinsic width/height reserve a responsive aspect box (no layout shift), and
// the image is lazy-loaded so no massive asset is fetched until it scrolls in.

import * as React from "react";
import { Expand, X } from "lucide-react";
import type { WalkthroughVisual } from "@/lib/walkthrough/stages";
import { useTheme } from "@/lib/theme";

export function VisualEvidence({ visual }: { visual: WalkthroughVisual }) {
  const [open, setOpen] = React.useState(false);
  const { theme } = useTheme();
  // Dark theme serves the `-dark.png` sibling captured for each visual.
  const themedSrc = theme === "dark" ? visual.src.replace(/\.png$/, "-dark.png") : visual.src;

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <figure className="mt-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full overflow-hidden rounded-xl border border-edge bg-base/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        aria-label={`Expand visual evidence: ${visual.caption}`}
      >
        {/* Responsive aspect box from intrinsic dimensions — avoids layout shift. */}
        <span
          className="block w-full"
          style={{ aspectRatio: `${visual.width} / ${visual.height}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={themedSrc}
            alt={visual.alt}
            width={visual.width}
            height={visual.height}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover object-top"
          />
        </span>
        <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-edge bg-base/80 px-2 py-1 text-[10px] font-medium text-muted opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Expand size={11} /> Expand
        </span>
      </button>
      <figcaption className="mt-2 text-[11.5px] leading-relaxed text-faint">
        {visual.caption}
      </figcaption>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={visual.alt}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div className="relative max-h-[92vh] max-w-[1200px]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close expanded image"
              className="absolute -top-3 -right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-surface text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              <X size={16} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={themedSrc}
              alt={visual.alt}
              width={visual.width}
              height={visual.height}
              className="max-h-[88vh] w-auto rounded-xl border border-edge object-contain"
            />
            <p className="mt-2 text-center text-[12px] text-muted">{visual.caption}</p>
          </div>
        </div>
      ) : null}
    </figure>
  );
}
