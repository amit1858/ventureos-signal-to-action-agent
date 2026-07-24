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
        // Theme tokens are CSS variables (rgb triples) so a `data-theme`
        // attribute on <html> switches Light ↔ Dark for all usages at once.
        // Triple form (`rgb(var(--c-*) / <alpha-value>)`) is required so the
        // Tailwind opacity modifier keeps working (e.g. `border-edge/60`).
        // Light + Dark triple values live in app/globals.css.
        base: "rgb(var(--c-base) / <alpha-value>)",
        panel: "rgb(var(--c-panel) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        surface2: "rgb(var(--c-surface2) / <alpha-value>)",
        elevated: "rgb(var(--c-elevated) / <alpha-value>)",
        edge: "rgb(var(--c-edge) / <alpha-value>)",
        "edge-soft": "rgb(var(--c-edge-soft) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        faint: "rgb(var(--c-faint) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        "accent-dim": "rgb(var(--c-accent-dim) / <alpha-value>)",
        "accent-bright": "rgb(var(--c-accent-bright) / <alpha-value>)",
        brand: "rgb(var(--c-brand) / <alpha-value>)",
        "brand-bright": "rgb(var(--c-brand-bright) / <alpha-value>)",
        "brand-dim": "rgb(var(--c-brand-dim) / <alpha-value>)",
        gov: "rgb(var(--c-gov) / <alpha-value>)",
        "gov-bright": "rgb(var(--c-gov-bright) / <alpha-value>)",
        cyan: "rgb(var(--c-cyan) / <alpha-value>)",
        slate: "rgb(var(--c-slate) / <alpha-value>)",
        amber: "rgb(var(--c-amber) / <alpha-value>)",
        risk: "rgb(var(--c-risk) / <alpha-value>)",
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
        glow: "0 0 0 1px rgba(1,118,211,0.35), 0 0 20px -8px rgba(1,118,211,0.28)",
        "glow-soft": "0 0 0 1px rgba(1,118,211,0.22), 0 0 32px -12px rgba(1,118,211,0.18)",
        "glow-gov": "0 0 0 1px rgba(88,103,232,0.30), 0 0 24px -10px rgba(88,103,232,0.22)",
        panel: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 6px -2px rgba(0,0,0,0.08)",
        elevated: "0 0 0 1px rgba(0,0,0,0.04), 0 8px 20px -8px rgba(0,0,0,0.12)",
        executive:
          "0 0 0 1px rgba(0,0,0,0.05), 0 12px 28px -10px rgba(0,0,0,0.14)",
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
