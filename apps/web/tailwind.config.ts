import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Phase 13.5 — Executive Visual System.
        // Charcoal stack (replaces the old blue-leaning #0B0F0E → #1B2228 set):
        base: "#0A0B0D",
        panel: "#111317",
        surface: "#171A1F",
        surface2: "#1B1F25",
        elevated: "#1F242B",
        edge: "rgba(255,255,255,0.06)",
        "edge-soft": "rgba(255,255,255,0.04)",
        // Warm typography (off-white → taupe ladder):
        ink: "#F5F1E8",
        muted: "#B5B0A5",
        faint: "#8A857B",
        // Revenue green — desaturated, executive (was neon #76B900):
        accent: "#76B65D",
        "accent-dim": "#5C9447",
        "accent-bright": "#8CCB72",
        // Primary action accent is now AMBER (was lavender #8B7CF6).
        // `brand` keeps its name so every existing CTA / active tab /
        // lifecycle "current" chip retones in one change.
        brand: "#D89A3D",
        "brand-bright": "#E5AE55",
        "brand-dim": "#B4802C",
        // Governance lavender — reserved for audit / approval history.
        gov: "#8B7CC8",
        "gov-bright": "#A498D6",
        // Secondary slate (unchanged role).
        cyan: "#7E8BA3",
        slate: "#7E8BA3",
        amber: "#D89A3D",
        risk: "#D96A5F",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(216,154,61,0.22), 0 0 26px -10px rgba(216,154,61,0.30)",
        "glow-soft": "0 0 0 1px rgba(216,154,61,0.14), 0 0 44px -14px rgba(216,154,61,0.18)",
        "glow-gov": "0 0 0 1px rgba(139,124,200,0.20), 0 0 30px -12px rgba(139,124,200,0.25)",
        panel: "0 1px 0 0 rgba(255,255,255,0.025) inset, 0 12px 30px -18px rgba(0,0,0,0.65)",
        elevated: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 22px 50px -24px rgba(0,0,0,0.78)",
        executive:
          "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 30px 60px -28px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.04)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-fast": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pulseline: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "0.9" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        scan: {
          "0%, 100%": { opacity: "0.25" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out both",
        "fade-in-fast": "fade-in-fast 0.2s ease-out both",
        pulseline: "pulseline 2.6s ease-in-out infinite",
        shimmer: "shimmer 1.8s infinite",
        scan: "scan 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
