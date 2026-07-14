"use client";

import { BarChart3, BookOpen, Home, Lock, Mail, Moon, Percent, Search, SunMedium, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TokenLogo } from "./TokenLogo";

const nav = [
  { to: "/lending", label: "Home", icon: Home },
  { to: "/lending/markets", label: "Market", icon: BarChart3 },
  { to: "/lending/sources", label: "Research", icon: BookOpen }
];

const compareNav = [
  { to: "/lending/markets", label: "APY", icon: Percent },
  { to: "/lending/quality", label: "TVL", icon: Lock },
  { to: "/lending/sources", label: "YPO", icon: WalletCards }
];

const ticker = [
  { symbol: "syrupUSDT", value: "$437.93M", change: "-4.3%", tone: "down" },
  { symbol: "OUSG", value: "$408.12M", change: "-0.6%", tone: "down" },
  { symbol: "M", value: "$295.11M", change: "-8.6%", tone: "down" },
  { symbol: "sDAI", value: "$175.22M", change: "+0.5%", tone: "up", chain: "ethereum", address: "0x83F20F44975D03b1b09e64809B757c47f942BEeA" },
  { symbol: "sGHO", value: "$147.39M", change: "-3.0%", tone: "down" },
  { symbol: "USDC", value: "$3.18B", change: "-2.4%", tone: "down", chain: "ethereum", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/lending">
          stablewatch
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
        <div className="nav-section-label">Compare</div>
        <nav className="side-nav compare-nav">
          {compareNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.label} href={item.to} className="nav-link muted">
                <Icon size={15} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="telegram-card">
          <button className="telegram-close" type="button">×</button>
          <p>Stay on the top the trends that define the stablecoin economy</p>
          <button className="telegram-button" type="button">↗ Join the News Channel</button>
        </div>
        <div className="sidebar-bottom">
          <Moon size={16} />
          <SunMedium size={15} />
        </div>
      </aside>
      <div className="app-content">
        <header className="topbar">
          <div className="ticker-strip">
            {ticker.map((item) => (
              <div className="ticker-item" key={item.symbol}>
                <TokenLogo address={item.address} chain={item.chain} symbol={item.symbol} size="ticker" />
                <div>
                  <strong>{item.symbol}</strong>
                  <small>{item.value}</small>
                </div>
                <em className={item.tone}>{item.tone === "up" ? "↑" : "↓"}{item.change}</em>
              </div>
            ))}
          </div>
          <div className="top-actions">
            <div className="search-pill">
              <Search size={16} />
              <span>Search Assets</span>
              <kbd>⌘K</kbd>
            </div>
            <button className="contact-button" type="button">
              <Mail size={16} />
              Contact
            </button>
          </div>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
