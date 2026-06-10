import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal-to-Action Agent",
  description:
    "A sovereign multi-agent workflow that turns fragmented customer signals into explainable, human-approved next-best actions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
