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
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
