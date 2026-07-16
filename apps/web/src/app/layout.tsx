import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../components/AppShell";
import "../styles.css";

export const metadata: Metadata = {
  title: "LendStack",
  description: "Independent lending analytics prototype with adapter provenance and quality checks"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { const theme = localStorage.getItem("lendingscope-theme") || "dark"; document.documentElement.dataset.theme = theme === "light" ? "light" : "dark"; document.documentElement.style.colorScheme = document.documentElement.dataset.theme; } catch (_) { document.documentElement.dataset.theme = "dark"; document.documentElement.style.colorScheme = "dark"; } })();`,
          }}
        />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
