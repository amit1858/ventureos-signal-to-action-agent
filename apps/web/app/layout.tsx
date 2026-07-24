import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Signal-to-Action Agent",
  description:
    "A sovereign multi-agent workflow that turns fragmented customer signals into explainable, human-approved next-best actions.",
};

// Set the theme attribute before first paint (reads localStorage) so there is
// no flash of the wrong theme. Defaults to light.
const themeScript = `(function(){try{var t=localStorage.getItem('s2a_theme');if(t!=='dark'&&t!=='light')t='light';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

