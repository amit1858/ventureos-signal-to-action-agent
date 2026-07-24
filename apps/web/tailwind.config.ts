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
        // Salesforce Lightning — light theme.
        // Blue-grey app background → pure-white cards (SLDS neutral stack):
        base: "#F3F3F3",
        panel: "#FAFAFB",
        surface: "#FFFFFF",
        surface2: "#F3F3F3",
        elevated: "#FFFFFF",
        // Solid grey borders (were translucent-white, invisible on light):
        edge: "#E5E5E5",
        "edge-soft": "#EEEEEE",
        // Cool neutral typography ladder (near-black → grey):
        ink: "#181818",
        muted: "#444444",
        faint: "#747474",
        // Success green — SLDS, AA on white (was neon #76B900):
        accent: "#2E844A",
        "accent-dim": "#256A3B",
        "accent-bright": "#45C65A",
        // Primary action is now SALESFORCE BLUE (was amber #D89A3D).
        // `brand` keeps its name so every existing CTA / active tab /
        // lifecycle "current" chip retones in one change.
        brand: "#0176D3",
        "brand-bright": "#1B96FF",
        "brand-dim": "#014486",
        // Governance indigo — reserved for audit / approval history.
        gov: "#5867E8",
        "gov-bright": "#7B87F5",
        // Secondary slate (unchanged role).
        cyan: "#5E6B82",
        slate: "#5E6B82",
        // Warning orange (SLDS).
        amber: "#FE9339",
        risk: "#EA001E",
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
