"use client";

// Light/Dark theme context. The active theme is reflected on
// `document.documentElement.dataset.theme` (set pre-paint by the inline script
// in app/layout.tsx to avoid FOUC) and persisted to localStorage under
// `s2a_theme`. Tokens are CSS variables (see app/globals.css), so switching the
// attribute re-themes the whole app.

import * as React from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "s2a_theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function applyTheme(t: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = t;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start at "light" (matches the SSR default + inline-script default) to avoid
  // a hydration mismatch; sync to the real value from the DOM after mount.
  const [theme, setThemeState] = React.useState<Theme>("light");

  React.useEffect(() => {
    const current = (document.documentElement.dataset.theme as Theme) || "light";
    setThemeState(current === "dark" ? "dark" : "light");
  }, []);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = React.useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = React.useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Safe outside a provider (SSR / isolated components) — defaults to "light".
export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (ctx) return ctx;
  return { theme: "light", setTheme: () => {}, toggle: () => {} };
}
