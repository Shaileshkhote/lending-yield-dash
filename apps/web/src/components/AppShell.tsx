"use client";

import { BarChart3, BookOpen, Github, Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const nav = [
  { to: "/lending", label: "Home", icon: Home },
  { to: "/lending/markets", label: "Market", icon: BarChart3 },
  { to: "/lending/sources", label: "Methodology", icon: BookOpen }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/lending">
          LendingScope
        </Link>
        <nav className="side-nav">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || (item.to !== "/lending" && pathname.startsWith(item.to));
            return (
              <Link key={item.to} href={item.to} className={`nav-link ${active ? "active" : ""}`}>
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="telegram-card">
          <button className="telegram-close" type="button">×</button>
          <Github className="github-card-logo" size={82} strokeWidth={1.4} />
          <p>Independent technical prototype inspired by Stablewatch’s upcoming Lending category. Not affiliated with Stablewatch.</p>
          <a className="telegram-button" href="https://github.com/Shaileshkhote/lending-yield-dash" target="_blank" rel="noreferrer">
            <Github size={14} />
            GitHub Repository
          </a>
        </div>
      </aside>
      <div className="app-content">
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
