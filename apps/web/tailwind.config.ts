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
        base: "#0B0F0E",
        panel: "#0E1117",
        surface: "#151A1E",
        surface2: "#1B2127",
        elevated: "#1B2228",
        edge: "#2A2F35",
        "edge-soft": "#232a31",
        ink: "#F4F6F8",
        muted: "#AAB2BD",
        faint: "#6B7480",
        accent: "#76B900",
        "accent-dim": "#5C9000",
        "accent-bright": "#8FD400",
        cyan: "#00D4FF",
        amber: "#F5B84B",
        risk: "#EF6B73",
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
        glow: "0 0 0 1px rgba(118,185,0,0.25), 0 0 24px -6px rgba(118,185,0,0.35)",
        "glow-soft": "0 0 0 1px rgba(118,185,0,0.16), 0 0 40px -10px rgba(118,185,0,0.22)",
        panel: "0 1px 0 0 rgba(255,255,255,0.02) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
        elevated: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 14px 34px -16px rgba(0,0,0,0.75)",
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
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
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
        pulseline: "pulseline 1.6s ease-in-out infinite",
        shimmer: "shimmer 1.8s infinite",
        scan: "scan 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
