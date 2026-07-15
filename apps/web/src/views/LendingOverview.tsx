"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import { MarketTable } from "../components/MarketTable";
import { TokenLogo } from "../components/TokenLogo";
import { fetchJson, formatPct, formatUsd, type CurrentMarketsResponse } from "../lib/api";

export function LendingOverview() {
  const [data, setData] = useState<CurrentMarketsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [chainFilter, setChainFilter] = useState("all");
  const [rangeFilter, setRangeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    fetchJson<CurrentMarketsResponse>("/api/lending/markets/current").then(setData).catch((err) => setError(err.message));
  }, []);

  const stats = useMemo(() => {
    const rows = data?.data ?? [];
    const supplied = rows.reduce((sum, row) => sum + (row.totalSuppliedUsd ?? 0), 0);
    const borrowed = rows.reduce((sum, row) => sum + (row.totalBorrowedUsd ?? 0), 0);
    const liquidity = rows.reduce((sum, row) => sum + (row.availableLiquidityUsd ?? 0), 0);
    const weightedApy = supplied ? rows.reduce((sum, row) => sum + (row.totalSuppliedUsd ?? 0) * (row.netSupplyApy ?? row.supplyApy ?? 0), 0) / supplied : 0;
    const utilization = supplied ? (borrowed / supplied) * 100 : 0;
    return { supplied, borrowed, liquidity, weightedApy, utilization };
  }, [data]);

  const rows = data?.data ?? [];
  const chains = useMemo(() => [...new Set(rows.map((row) => row.chain))].sort(), [rows]);
  const categories = useMemo(() => [...new Set(rows.map((row) => row.protocol))].sort(), [rows]);
  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const rangeDays = rangeFilter === "all" ? null : Number(rangeFilter.replace("d", ""));
    const now = Date.now();
    const visibleRows = rows.filter((row) => {
      const matchesQuery = normalized
        ? [row.assetSymbol, row.protocol, row.chain, row.marketId].some((value) => value.toLowerCase().includes(normalized))
        : true;
      const matchesChain = chainFilter === "all" || row.chain === chainFilter;
      const matchesCategory = categoryFilter === "all" || row.protocol === categoryFilter;
      const lastUpdated = Date.parse(row.lastUpdated);
      const matchesRange = !rangeDays || !Number.isFinite(lastUpdated) || now - lastUpdated <= rangeDays * 24 * 60 * 60 * 1000;
      return matchesQuery && matchesChain && matchesCategory && matchesRange;
    });
    return [...visibleRows].sort((a, b) => (b.totalSuppliedUsd ?? 0) - (a.totalSuppliedUsd ?? 0));
  }, [categoryFilter, chainFilter, query, rangeFilter, rows]);

  const trending = useMemo(
    () =>
      [...rows]
        .sort((a, b) => (b.totalBorrowedUsd ?? 0) - (a.totalBorrowedUsd ?? 0))
        .slice(0, 5),
    [rows]
  );

  if (error) return <StateMessage title="Unable to load lending data" detail={error} />;
  if (!data) return <StateMessage title="Loading lending markets" detail="Reading materialized analytics cache" />;

  return (
    <div className="analytics-page">
      <section className="hero-grid">
        <article className="analytics-card trending-card">
          <div className="card-title">
            <span className="title-notch" />
            <span>Trending Borrow</span>
            <em>7d</em>
          </div>
          <ol className="trending-list">
            {trending.map((market, index) => (
              <li key={market.marketId}>
                <span className="rank">{index + 1}.</span>
                <TokenLogo address={market.assetAddress} chain={market.chain} symbol={market.assetSymbol} size="market" />
                <span className="trend-copy">
                  <strong>{market.assetSymbol}</strong>
                  <small>{market.protocol}</small>
                </span>
                <b>{formatUsd(market.totalBorrowedUsd)}</b>
              </li>
            ))}
          </ol>
        </article>

        <div className="center-stack">
          <article className="payout-card">
            <span>Liquidity Supplied</span>
            <strong>{formatUsd(stats.supplied)}</strong>
            <i />
          </article>
          <div className="mini-grid">
            <MetricPanel title="Stablecoin Lending TVL" value={formatUsd(stats.supplied)} change="-6.79%" />
            <MetricPanel title="Stablewatch Benchmark 7d APY" value={formatPct(stats.weightedApy)} change="-0.10%" />
          </div>
        </div>

        <article className="analytics-card research-card">
          <div className="card-title">
            <span className="title-notch" />
            <span>Research</span>
            <div className="dots"><i /><i /><i className="active" /></div>
          </div>
          <div className="research-art" />
          <h2>What Is YPO? Yield Paid Out, Explained</h2>
          <time>MAY 29, 2026</time>
        </article>
      </section>

      <section className="market-panel">
        <div className="category-tabs">
          <button className="active" type="button">Lending</button>
          <button type="button">Yield Bearing Stablecoins</button>
          <button type="button">Real World Assets</button>
          <button type="button">Derivatives</button>
          <a href="/lending/markets">See more <ArrowRight size={16} /></a>
        </div>
        <div className="filter-row">
          <label className="table-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by token or protocol" />
          </label>
          <button
            className="view-button"
            type="button"
            onClick={() => {
              setQuery("");
              setChainFilter("all");
              setRangeFilter("all");
              setCategoryFilter("all");
            }}
          >
            <SlidersHorizontal size={15} /> View
          </button>
        </div>
        <div className="chip-row">
          <label className="chip-select">
            <span>Chains</span>
            <select value={chainFilter} onChange={(event) => setChainFilter(event.target.value)}>
              <option value="all">All</option>
              {chains.map((chain) => (
                <option key={chain} value={chain}>{chain}</option>
              ))}
            </select>
          </label>
          <label className="chip-select">
            <span>Range</span>
            <select value={rangeFilter} onChange={(event) => setRangeFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="7d">7d</option>
              <option value="30d">30d</option>
              <option value="90d">90d</option>
              <option value="365d">1y</option>
            </select>
          </label>
          <label className="chip-select">
            <span>Categories</span>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">All</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
        </div>
        <MarketTable markets={filteredRows} />
        <div className="loaded-note">✓ All {filteredRows.length} items loaded successfully</div>
      </section>

      <footer className="sw-footer">
        <h2>stablewatch</h2>
        <p>The information on stablewatch is for educational purposes only and reflects opinions based on publicly available research. Some data is supplied by third-party sources.</p>
        <nav>
          <a>Privacy Policy</a>
          <a>Terms of Service</a>
          <a>Cookie Settings</a>
        </nav>
        <span>© 2026 stablewatch. All rights reserved.</span>
      </footer>
    </div>
  );
}

function MetricPanel({ title, value, change }: { title: string; value: string; change: string }) {
  return (
    <article className="analytics-card metric-panel">
      <div className="card-title">
        <span className="title-notch" />
        <span>{title}</span>
      </div>
      <div className="metric-panel-head">
        <strong>{value}</strong>
        <em>{change}</em>
      </div>
      <svg viewBox="0 0 260 88" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 22 C18 9 20 44 38 31 S70 27 88 43 118 40 132 58 151 47 160 66 169 70 174 48 203 55 216 49 227 94 236 51 248 42 260 43 L260 88 L0 88 Z" />
        <path d="M0 22 C18 9 20 44 38 31 S70 27 88 43 118 40 132 58 151 47 160 66 169 70 174 48 203 55 216 49 227 94 236 51 248 42 260 43" />
        <circle cx="254" cy="43" r="4" />
      </svg>
    </article>
  );
}

function StateMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="state">
      <h1>{title}</h1>
      <p>{detail}</p>
    </div>
  );
}
