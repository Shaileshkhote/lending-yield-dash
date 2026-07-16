import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../components/AppShell";
import "../styles.css";

export const metadata: Metadata = {
  title: "LendingScope",
  description: "Independent lending analytics prototype with adapter provenance and quality checks"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { const theme = localStorage.getItem("lendingscope-theme") || "light"; document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light"; document.documentElement.style.colorScheme = document.documentElement.dataset.theme; } catch (_) { document.documentElement.dataset.theme = "light"; document.documentElement.style.colorScheme = "light"; } })();`,
          }}
        />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
