"use client";

import { BarChart3, BookOpen, Github, Home, Layers3, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

const nav = [
  { to: "/lending", label: "Home", icon: Home },
  { to: "/lending/markets", label: "Market", icon: BarChart3 },
  { to: "/lending/protocols", label: "Protocols", icon: Layers3 },
  { to: "/lending/sources", label: "Methodology", icon: BookOpen }
];

type Theme = "light" | "dark";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const activeTheme = document.documentElement.dataset.theme;
    if (activeTheme === "light" || activeTheme === "dark") {
      setTheme(activeTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("lendingscope-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
      window.localStorage.setItem("lendingscope-theme", next);
      return next;
    });
  };

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
        <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
          <span className={theme === "light" ? "active" : ""}>
            <Sun size={14} />
          </span>
          <span className={theme === "dark" ? "active" : ""}>
            <Moon size={14} />
          </span>
        </button>
        <div className="telegram-card">
          <button className="telegram-close" type="button">×</button>
          <Github className="github-card-logo" size={82} strokeWidth={1.4} />
          <p>Independent technical prototype for open lending analytics, built from public protocol data.</p>
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
