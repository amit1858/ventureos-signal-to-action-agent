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
        brand: "#8B7CF6",
        "brand-bright": "#A89CFB",
        "brand-dim": "#6D5DE0",
        cyan: "#5BB0F5",
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
        glow: "0 0 0 1px rgba(139,124,246,0.22), 0 0 26px -10px rgba(139,124,246,0.30)",
        "glow-soft": "0 0 0 1px rgba(139,124,246,0.14), 0 0 44px -14px rgba(139,124,246,0.18)",
        panel: "0 1px 0 0 rgba(255,255,255,0.025) inset, 0 12px 30px -18px rgba(0,0,0,0.65)",
        elevated: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 22px 50px -24px rgba(0,0,0,0.78)",
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
