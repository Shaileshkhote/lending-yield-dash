import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../components/AppShell";
import "../styles.css";

export const metadata: Metadata = {
  title: "Stablewatch Lending",
  description: "Stablewatch-style lending analytics for stablecoin markets"
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
