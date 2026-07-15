"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Search, SlidersHorizontal, X } from "lucide-react";
import { MarketTable } from "../components/MarketTable";
import { LendingOverviewSkeleton } from "../components/Skeletons";
import { TokenLogo } from "../components/TokenLogo";
import { fetchJson, formatPct, formatSignedPct, formatUsd, type CurrentMarketsResponse, type LendingMarket } from "../lib/api";
import { assetTypeForMarket, assetTypeOptions } from "../lib/asset-types";

type FilterMode = "OR" | "AND";

const categoryTabs = [
  { label: "Lending", enabled: true },
  { label: "Yield Bearing Stablecoins", enabled: false },
  { label: "Real World Assets", enabled: false },
  { label: "Derivatives", enabled: false },
];

const knownProtocols = ["Aave V3", "Aave V4", "Compound III", "Morpho Blue", "Spark"];
const MIN_BENCHMARK_SUPPLIED_USD = 10_000;
const MIN_REASONABLE_APY = -20;
const MAX_REASONABLE_APY = 100;

export function LendingOverview() {
  const [data, setData] = useState<CurrentMarketsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [chainMode, setChainMode] = useState<FilterMode>("OR");
  const [protocolMode, setProtocolMode] = useState<FilterMode>("OR");
  const [selectedChains, setSelectedChains] = useState<string[]>([]);
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>([]);
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([]);

  useEffect(() => {
    fetchJson<CurrentMarketsResponse>("/api/lending/markets/current").then(setData).catch((err) => setError(err.message));
  }, []);

  const stats = useMemo(() => {
    const rows = data?.data ?? [];
    const supplied = rows.reduce((sum, row) => sum + (row.totalSuppliedUsd ?? 0), 0);
    const borrowed = rows.reduce((sum, row) => sum + (row.totalBorrowedUsd ?? 0), 0);
    const liquidity = rows.reduce((sum, row) => sum + (row.availableLiquidityUsd ?? 0), 0);
    const benchmarkRows = rows.filter(isBenchmarkMarket);
    const weightedApy = weightedAverage(benchmarkRows, (row) => row.sevenDayApy);
    const benchmarkChange = weightedAverage(benchmarkRows, (row) => row.apySevenDayChange);
    const utilization = supplied ? (borrowed / supplied) * 100 : 0;
    return { supplied, borrowed, liquidity, weightedApy, benchmarkChange, utilization };
  }, [data]);

  const rows = data?.data ?? [];
  const chains = useMemo(() => [...new Set(rows.map((row) => row.chain))].sort(), [rows]);
  const protocols = useMemo(() => [...knownProtocols, ...[...new Set(rows.map((row) => row.protocol))].filter((protocol) => !knownProtocols.includes(protocol)).sort()], [rows]);
  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const visibleRows = rows.filter((row) => {
      const matchesQuery = normalized
        ? [row.assetSymbol, row.protocol, row.chain, row.marketId].some((value) => value.toLowerCase().includes(normalized))
        : true;
      const matchesChain = fieldMatches(row.chain, selectedChains, chainMode);
      const matchesProtocol = fieldMatches(row.protocol, selectedProtocols, protocolMode);
      const matchesAssetType = selectedAssetTypes.length === 0 || selectedAssetTypes.includes(assetTypeForMarket(row));
      return matchesQuery && matchesChain && matchesProtocol && matchesAssetType;
    });
    return [...visibleRows].sort((a, b) => (b.totalSuppliedUsd ?? 0) - (a.totalSuppliedUsd ?? 0));
  }, [chainMode, protocolMode, query, rows, selectedAssetTypes, selectedChains, selectedProtocols]);

  const activeFilterCount = selectedChains.length + selectedProtocols.length + selectedAssetTypes.length;
  const hasFilters = activeFilterCount > 0 || query.trim().length > 0;
  const marketsHref = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (selectedChains.length === 1) params.set("chain", selectedChains[0]);
    if (selectedProtocols.length === 1) params.set("protocol", selectedProtocols[0]);
    if (selectedAssetTypes.length === 1) params.set("type", selectedAssetTypes[0]);
    return `/lending/markets${params.size ? `?${params.toString()}` : ""}`;
  }, [query, selectedAssetTypes, selectedChains, selectedProtocols]);

  const trending = useMemo(
    () =>
      [...rows]
        .sort((a, b) => (b.totalBorrowedUsd ?? 0) - (a.totalBorrowedUsd ?? 0))
        .slice(0, 5),
    [rows]
  );

  if (error) return <StateMessage title="Unable to load lending data" detail={error} />;
  if (!data) return <LendingOverviewSkeleton />;

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
            <MetricPanel title="Stablewatch Benchmark 7d APY" value={formatPct(stats.weightedApy)} change={formatSignedPct(stats.benchmarkChange)} />
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
          <div className="category-scroll">
            {categoryTabs.map((tab) => (
              <button key={tab.label} className={tab.label === "Lending" ? "active" : ""} type="button" disabled={!tab.enabled}>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="category-more">
            <a href={marketsHref}>
              <span>See more</span>
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
        <div className="dataset-status">
          <span className="status-spinner" aria-hidden="true" />
          <span>
            Showing full dataset... ({filteredRows.length} of {rows.length} items loaded)
          </span>
        </div>
        <div className="filter-row">
          <label className="table-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by token or protocol" />
          </label>
          <button
            className={`view-button${filterOpen ? " active" : ""}`}
            type="button"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((open) => !open)}
          >
            <SlidersHorizontal size={15} /> View{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </button>
        </div>
        {filterOpen ? (
          <div className="filter-drawer">
            <FilterSection
              title="Protocols"
              mode={protocolMode}
              onModeChange={setProtocolMode}
              options={protocols}
              selected={selectedProtocols}
              onToggle={(value) => setSelectedProtocols((selected) => toggleValue(selected, value))}
            />
            <FilterSection
              title="Chains"
              mode={chainMode}
              onModeChange={setChainMode}
              options={chains}
              selected={selectedChains}
              onToggle={(value) => setSelectedChains((selected) => toggleValue(selected, value))}
            />
            <div className="filter-section">
              <div className="filter-section-head">
                <span>Asset Type</span>
              </div>
              <div className="filter-options">
                {assetTypeOptions
                  .filter((option) => option.value !== "all")
                  .map((option) => (
                    <button
                      key={option.value}
                      className={selectedAssetTypes.includes(option.value) ? "filter-chip selected" : "filter-chip"}
                      type="button"
                      onClick={() => setSelectedAssetTypes((selected) => toggleValue(selected, option.value))}
                    >
                      {selectedAssetTypes.includes(option.value) ? <Check size={13} /> : null}
                      {option.label}
                    </button>
                  ))}
              </div>
            </div>
            <div className="filter-actions">
              <button
                type="button"
                disabled={!hasFilters}
                onClick={() => {
                  setQuery("");
                  setSelectedChains([]);
                  setSelectedProtocols([]);
                  setSelectedAssetTypes([]);
                }}
              >
                <X size={14} /> Clear
              </button>
              <a href={marketsHref}>
                Open table <ArrowRight size={14} />
              </a>
            </div>
          </div>
        ) : null}
        <MarketTable markets={filteredRows} />
        <div className="loaded-note">All {filteredRows.length} items loaded successfully</div>
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

function FilterSection({
  title,
  mode,
  onModeChange,
  options,
  selected,
  onToggle,
}: {
  title: string;
  mode: FilterMode;
  onModeChange: (mode: FilterMode) => void;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="filter-section">
      <div className="filter-section-head">
        <span>{title}</span>
        <div className="mode-toggle" aria-label={`${title} filter mode`}>
          {(["OR", "AND"] as const).map((value) => (
            <button key={value} className={mode === value ? "active" : ""} type="button" onClick={() => onModeChange(value)}>
              {value}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-options">
        {options.map((option) => (
          <button key={option} className={selected.includes(option) ? "filter-chip selected" : "filter-chip"} type="button" onClick={() => onToggle(option)}>
            {selected.includes(option) ? <Check size={13} /> : null}
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function fieldMatches(value: string, selected: string[], mode: FilterMode) {
  if (selected.length === 0) return true;
  if (mode === "AND") return selected.every((item) => item === value);
  return selected.includes(value);
}

function toggleValue<T extends string>(selected: T[], value: T) {
  return selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
}

function isBenchmarkMarket(market: LendingMarket) {
  const apy = market.sevenDayApy;
  return (
    assetTypeForMarket(market) === "stablecoins" &&
    market.isActive !== false &&
    !market.isPaused &&
    (market.dataQualityScore ?? 0) >= 80 &&
    Number.isFinite(apy) &&
    Number.isFinite(market.totalSuppliedUsd) &&
    (market.totalSuppliedUsd ?? 0) >= MIN_BENCHMARK_SUPPLIED_USD &&
    (apy ?? 0) >= MIN_REASONABLE_APY &&
    (apy ?? 0) <= MAX_REASONABLE_APY
  );
}

function weightedAverage(markets: LendingMarket[], valueForMarket: (market: LendingMarket) => number | null | undefined) {
  let weight = 0;
  let weightedValue = 0;
  for (const market of markets) {
    const value = valueForMarket(market);
    const supplied = market.totalSuppliedUsd ?? 0;
    if (!Number.isFinite(value) || !Number.isFinite(supplied) || supplied <= 0) continue;
    weight += supplied;
    weightedValue += supplied * (value ?? 0);
  }
  return weight ? weightedValue / weight : null;
}

function StateMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="state">
      <h1>{title}</h1>
      <p>{detail}</p>
    </div>
  );
}
