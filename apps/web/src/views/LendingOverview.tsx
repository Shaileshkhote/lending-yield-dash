"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, Check, ChevronDown, Columns3, Search, X } from "lucide-react";
import { defaultMarketColumns, hideableMarketColumns, MarketTable, type MarketColumnKey } from "../components/MarketTable";
import { LendingOverviewSkeleton } from "../components/Skeletons";
import { TokenLogo } from "../components/TokenLogo";
import { chainLogoUrls } from "../lib/chains";
import { fetchJson, formatPct, formatSignedPct, formatUsd, type CurrentMarketsResponse, type LendingMarket } from "../lib/api";
import { assetTypeForMarket, assetTypeOptions } from "../lib/asset-types";
import { tokenLogoUrls } from "../lib/token-icons";

type FilterMode = "OR" | "AND";
type DropdownKey = "chains" | "range" | "protocols" | "assetType" | "view";
type RangeKey = "supplied" | "sevenDayApy" | "thirtyDayApy";
type RangeTuple = [number, number];
type RangeState = Partial<Record<RangeKey, RangeTuple>>;
type ActiveFilter = { id: string; label: string; onRemove: () => void };

const categoryTabs = [
  { label: "Lending", enabled: true },
  { label: "Yield Bearing Stablecoins", enabled: false },
  { label: "Real World Assets", enabled: false },
  { label: "Derivatives", enabled: false },
];

const knownProtocols = ["Aave V3", "Aave V4", "Compound III", "Morpho Blue", "Spark"];
const protocolIconSlugs: Record<string, string> = {
  "Aave V3": "aave",
  "Aave V4": "aave",
  "Compound III": "compound-finance",
  "Morpho Blue": "morpho-blue",
  Spark: "spark",
};
const assetTypeIconSymbols: Record<string, string> = {
  stablecoins: "USDC",
  bluechips: "WBTC",
  alts: "AAVE",
};
const MIN_BENCHMARK_SUPPLIED_USD = 10_000;
const MIN_REASONABLE_APY = -20;
const MAX_REASONABLE_APY = 100;

export function LendingOverview() {
  const [data, setData] = useState<CurrentMarketsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  const [chainMode, setChainMode] = useState<FilterMode>("OR");
  const [protocolMode, setProtocolMode] = useState<FilterMode>("OR");
  const [selectedChains, setSelectedChains] = useState<string[]>([]);
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>([]);
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([]);
  const [rangeFilters, setRangeFilters] = useState<RangeState>({});
  const [visibleColumns, setVisibleColumns] = useState<MarketColumnKey[]>(defaultMarketColumns);
  const [columnSearch, setColumnSearch] = useState("");

  useEffect(() => {
    fetchJson<CurrentMarketsResponse>("/api/lending/markets/current").then(setData).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!openDropdown) return;
    const onPointerDown = (event: PointerEvent) => {
      if (filtersRef.current?.contains(event.target as Node)) return;
      setOpenDropdown(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openDropdown]);

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
  const rangeBounds = useMemo(
    () => ({
      supplied: numericBounds(rows.map((row) => row.totalSuppliedUsd), [0, 1]),
      sevenDayApy: apyBounds(rows.map((row) => row.sevenDayApy)),
      thirtyDayApy: apyBounds(rows.map((row) => row.thirtyDayApy)),
    }),
    [rows]
  );
  const currentRanges = useMemo(
    () => ({
      supplied: rangeFilters.supplied ?? rangeBounds.supplied,
      sevenDayApy: rangeFilters.sevenDayApy ?? rangeBounds.sevenDayApy,
      thirtyDayApy: rangeFilters.thirtyDayApy ?? rangeBounds.thirtyDayApy,
    }),
    [rangeBounds, rangeFilters]
  );
  const rangeFilterCount = (rangeFilters.supplied ? 1 : 0) + (rangeFilters.sevenDayApy ? 1 : 0) + (rangeFilters.thirtyDayApy ? 1 : 0);
  const visibleColumnSet = useMemo(() => new Set(visibleColumns), [visibleColumns]);
  const searchedColumns = useMemo(() => {
    const normalized = columnSearch.trim().toLowerCase();
    return hideableMarketColumns.filter((column) => (normalized ? column.label.toLowerCase().includes(normalized) : true));
  }, [columnSearch]);
  const hiddenColumnCount = hideableMarketColumns.filter((column) => !visibleColumnSet.has(column.key)).length;
  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const visibleRows = rows.filter((row) => {
      const matchesQuery = normalized
        ? [row.assetSymbol, row.protocol, row.chain, row.marketId].some((value) => value.toLowerCase().includes(normalized))
        : true;
      const matchesChain = fieldMatches(row.chain, selectedChains, chainMode);
      const matchesProtocol = fieldMatches(row.protocol, selectedProtocols, protocolMode);
      const matchesAssetType = selectedAssetTypes.length === 0 || selectedAssetTypes.includes(assetTypeForMarket(row));
      const matchesRanges =
        rangeMatches(row.totalSuppliedUsd, currentRanges.supplied, Boolean(rangeFilters.supplied)) &&
        rangeMatches(row.sevenDayApy, currentRanges.sevenDayApy, Boolean(rangeFilters.sevenDayApy)) &&
        rangeMatches(row.thirtyDayApy, currentRanges.thirtyDayApy, Boolean(rangeFilters.thirtyDayApy));
      return matchesQuery && matchesChain && matchesProtocol && matchesAssetType && matchesRanges;
    });
    return [...visibleRows].sort((a, b) => (b.totalSuppliedUsd ?? 0) - (a.totalSuppliedUsd ?? 0));
  }, [chainMode, currentRanges, protocolMode, query, rangeFilters, rows, selectedAssetTypes, selectedChains, selectedProtocols]);

  const activeFilterCount = selectedChains.length + selectedProtocols.length + selectedAssetTypes.length + rangeFilterCount;
  const hasFilters = activeFilterCount > 0 || query.trim().length > 0;
  const marketsHref = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (selectedChains.length === 1) params.set("chain", selectedChains[0]);
    if (selectedProtocols.length === 1) params.set("protocol", selectedProtocols[0]);
    if (selectedAssetTypes.length === 1) params.set("type", selectedAssetTypes[0]);
    return `/lending/markets${params.size ? `?${params.toString()}` : ""}`;
  }, [query, selectedAssetTypes, selectedChains, selectedProtocols]);
  const updateRange = (key: RangeKey, value: RangeTuple) => {
    const normalized = normalizeRange(value, rangeBounds[key]);
    setRangeFilters((current) => (sameRange(normalized, rangeBounds[key]) ? omitRange(current, key) : { ...current, [key]: normalized }));
  };
  const toggleColumn = (key: MarketColumnKey) => {
    setVisibleColumns((selected) => toggleValue(selected, key));
  };
  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const filters: ActiveFilter[] = [];
    selectedChains.forEach((chain) => {
      filters.push({ id: `chain-${chain}`, label: chainLabel(chain), onRemove: () => setSelectedChains((selected) => selected.filter((value) => value !== chain)) });
    });
    selectedProtocols.forEach((protocol) => {
      filters.push({ id: `protocol-${protocol}`, label: protocol, onRemove: () => setSelectedProtocols((selected) => selected.filter((value) => value !== protocol)) });
    });
    selectedAssetTypes.forEach((assetType) => {
      filters.push({
        id: `type-${assetType}`,
        label: assetTypeOptions.find((option) => option.value === assetType)?.label ?? assetType,
        onRemove: () => setSelectedAssetTypes((selected) => selected.filter((value) => value !== assetType)),
      });
    });
    if (rangeFilters.supplied) {
      filters.push({ id: "range-supplied", label: `Supplied: ${formatUsd(rangeFilters.supplied[0])} - ${formatUsd(rangeFilters.supplied[1])}`, onRemove: () => setRangeFilters((current) => omitRange(current, "supplied")) });
    }
    if (rangeFilters.sevenDayApy) {
      filters.push({ id: "range-7d", label: `7d APY: ${formatPct(rangeFilters.sevenDayApy[0])} - ${formatPct(rangeFilters.sevenDayApy[1])}`, onRemove: () => setRangeFilters((current) => omitRange(current, "sevenDayApy")) });
    }
    if (rangeFilters.thirtyDayApy) {
      filters.push({ id: "range-30d", label: `30d APY: ${formatPct(rangeFilters.thirtyDayApy[0])} - ${formatPct(rangeFilters.thirtyDayApy[1])}`, onRemove: () => setRangeFilters((current) => omitRange(current, "thirtyDayApy")) });
    }
    return filters;
  }, [rangeFilters, selectedAssetTypes, selectedChains, selectedProtocols]);

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
        <div ref={filtersRef}>
          <div className="filter-row">
            <label className="table-search">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by token or protocol" />
            </label>
            <PrettyDropdown
              label="View"
              count={hiddenColumnCount}
              icon={<Columns3 size={15} />}
              align="end"
              isOpen={openDropdown === "view"}
              onToggle={() => setOpenDropdown((open) => (open === "view" ? null : "view"))}
            >
              <label className="column-search">
                <Search size={15} />
                <input value={columnSearch} onChange={(event) => setColumnSearch(event.target.value)} placeholder="Search columns" />
                {columnSearch ? (
                  <button type="button" aria-label="Clear column search" onClick={() => setColumnSearch("")}>
                    <X size={13} />
                  </button>
                ) : null}
              </label>
              <div className="dropdown-scroll column-dropdown-scroll">
                {searchedColumns.length > 0 ? (
                  searchedColumns.map((column) => {
                    const selected = visibleColumnSet.has(column.key);
                    return (
                      <button key={column.key} className={selected ? "dropdown-option column-option selected" : "dropdown-option column-option"} type="button" onClick={() => toggleColumn(column.key)}>
                        <span className="column-option-label">{column.label}</span>
                        {selected ? <Check size={16} /> : null}
                      </button>
                    );
                  })
                ) : (
                  <p className="dropdown-empty">No columns found</p>
                )}
              </div>
            </PrettyDropdown>
          </div>
          <div className="filter-pill-row">
            <PrettyDropdown label="Chains" count={selectedChains.length} isOpen={openDropdown === "chains"} onToggle={() => setOpenDropdown((open) => (open === "chains" ? null : "chains"))}>
              {selectedChains.length >= 2 ? (
                <div className="match-mode-row">
                  <span>Match mode</span>
                  <ModeToggle mode={chainMode} onModeChange={setChainMode} />
                </div>
              ) : null}
              <div className="dropdown-scroll">
                {chains.map((chain) => (
                  <button
                    key={chain}
                    className={selectedChains.includes(chain) ? "dropdown-option selected" : "dropdown-option"}
                    type="button"
                    onClick={() => setSelectedChains((selected) => toggleValue(selected, chain))}
                  >
                    <FilterIcon alt={`${chainLabel(chain)} logo`} className="chain-filter-icon" fallback={chain.slice(0, 1).toUpperCase()} sources={chainLogoUrls(chain)} />
                    <span>{chainLabel(chain)}</span>
                    {selectedChains.includes(chain) ? <Check size={16} /> : null}
                  </button>
                ))}
              </div>
            </PrettyDropdown>
            <PrettyDropdown label="Range" count={rangeFilterCount} isOpen={openDropdown === "range"} wide onToggle={() => setOpenDropdown((open) => (open === "range" ? null : "range"))}>
              <div className="range-dropdown">
                <RangeControl
                  label="Total Supplied"
                  format={formatUsd}
                  bounds={rangeBounds.supplied}
                  value={currentRanges.supplied}
                  step={rangeStep(rangeBounds.supplied)}
                  onChange={(value) => updateRange("supplied", value)}
                />
                <RangeControl
                  label="7d APY Range"
                  format={formatPct}
                  bounds={rangeBounds.sevenDayApy}
                  value={currentRanges.sevenDayApy}
                  step={0.1}
                  onChange={(value) => updateRange("sevenDayApy", value)}
                />
                <RangeControl
                  label="30d APY Range"
                  format={formatPct}
                  bounds={rangeBounds.thirtyDayApy}
                  value={currentRanges.thirtyDayApy}
                  step={0.1}
                  onChange={(value) => updateRange("thirtyDayApy", value)}
                />
              </div>
            </PrettyDropdown>
            <PrettyDropdown label="Protocols" count={selectedProtocols.length} isOpen={openDropdown === "protocols"} onToggle={() => setOpenDropdown((open) => (open === "protocols" ? null : "protocols"))}>
              {selectedProtocols.length >= 2 ? (
                <div className="match-mode-row">
                  <span>Match mode</span>
                  <ModeToggle mode={protocolMode} onModeChange={setProtocolMode} />
                </div>
              ) : null}
              <div className="dropdown-scroll">
                {protocols.map((protocol) => (
                  <button
                    key={protocol}
                    className={selectedProtocols.includes(protocol) ? "dropdown-option selected" : "dropdown-option"}
                    type="button"
                    onClick={() => setSelectedProtocols((selected) => toggleValue(selected, protocol))}
                  >
                    <FilterIcon alt={`${protocol} logo`} className="protocol-filter-icon" fallback={protocol.slice(0, 1)} sources={protocolIconUrls(protocol)} />
                    <span>{protocol}</span>
                    {selectedProtocols.includes(protocol) ? <Check size={16} /> : null}
                  </button>
                ))}
              </div>
            </PrettyDropdown>
            <PrettyDropdown label="Asset Type" count={selectedAssetTypes.length} isOpen={openDropdown === "assetType"} onToggle={() => setOpenDropdown((open) => (open === "assetType" ? null : "assetType"))}>
              <div className="dropdown-scroll">
                {assetTypeOptions
                  .filter((option) => option.value !== "all")
                  .map((option) => (
                    <button
                      key={option.value}
                      className={selectedAssetTypes.includes(option.value) ? "dropdown-option selected" : "dropdown-option"}
                      type="button"
                      onClick={() => setSelectedAssetTypes((selected) => toggleValue(selected, option.value))}
                    >
                      <FilterIcon alt={`${option.label} icon`} className="asset-type-filter-icon" fallback={option.label.slice(0, 1)} sources={assetTypeIconUrls(option.value)} />
                      <span>{option.label}</span>
                      {selectedAssetTypes.includes(option.value) ? <Check size={16} /> : null}
                    </button>
                  ))}
              </div>
            </PrettyDropdown>
          </div>
        </div>
        {activeFilters.length > 0 ? (
          <div className="active-filter-row">
            {activeFilters.map((filter) => (
              <button
                key={filter.id}
                className="active-filter-chip"
                type="button"
                onClick={filter.onRemove}
              >
                <span>{filter.label}</span>
                <X size={14} />
              </button>
            ))}
            {hasFilters ? (
              <button
                className="clear-filter-button"
                type="button"
                onClick={() => {
                  setQuery("");
                  setSelectedChains([]);
                  setSelectedProtocols([]);
                  setSelectedAssetTypes([]);
                  setRangeFilters({});
                }}
              >
                Clear all
              </button>
            ) : null}
          </div>
        ) : null}
        <MarketTable markets={filteredRows} visibleColumns={visibleColumns} />
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

function PrettyDropdown({
  label,
  count,
  isOpen,
  onToggle,
  children,
  wide = false,
  icon,
  align = "start",
}: {
  label: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
  wide?: boolean;
  icon?: ReactNode;
  align?: "start" | "end";
}) {
  return (
    <div className={align === "end" ? "pretty-filter align-end" : "pretty-filter"}>
      <button className={isOpen ? "pretty-filter-trigger open" : "pretty-filter-trigger"} type="button" aria-expanded={isOpen} onClick={onToggle}>
        {icon}
        <span>{label}</span>
        {count > 0 ? <b>{count}</b> : null}
        <ChevronDown size={16} />
      </button>
      {isOpen ? <div className={wide ? "filter-popover wide" : "filter-popover"}>{children}</div> : null}
    </div>
  );
}

function ModeToggle({ mode, onModeChange }: { mode: FilterMode; onModeChange: (mode: FilterMode) => void }) {
  return (
    <div className="mode-toggle">
      {(["OR", "AND"] as const).map((value) => (
        <button key={value} className={mode === value ? "active" : ""} type="button" onClick={() => onModeChange(value)}>
          {value.toLowerCase()}
        </button>
      ))}
    </div>
  );
}

function FilterIcon({ sources, fallback, alt, className }: { sources: string[]; fallback: string; alt: string; className: string }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const sourceKey = sources.join("|");
  const source = sources[sourceIndex];

  useEffect(() => {
    setSourceIndex(0);
  }, [sourceKey]);

  return (
    <span className={`${className}${source ? " has-image" : ""}`}>
      {source ? <img alt={alt} decoding="async" loading="lazy" src={source} onError={() => setSourceIndex((index) => index + 1)} /> : <span>{fallback}</span>}
    </span>
  );
}

function RangeControl({ label, bounds, value, step, format, onChange }: { label: string; bounds: RangeTuple; value: RangeTuple; step: number; format: (value: number) => string; onChange: (value: RangeTuple) => void }) {
  const min = bounds[0];
  const max = bounds[1];
  const low = clamp(value[0], min, max);
  const high = clamp(value[1], min, max);
  const lowPct = rangePercent(low, min, max);
  const highPct = rangePercent(high, min, max);
  return (
    <div className="range-control">
      <div className="range-control-head">
        <span>{label}</span>
      </div>
      <div className="range-inputs" style={{ "--range-low": `${lowPct}%`, "--range-high": `${highPct}%` } as CSSProperties}>
        <input
          aria-label={`${label} minimum`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={low}
          onChange={(event) => onChange([Math.min(Number(event.target.value), high), high])}
        />
        <input
          aria-label={`${label} maximum`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={high}
          onChange={(event) => onChange([low, Math.max(Number(event.target.value), low)])}
        />
      </div>
      <div className="range-values">
        <span>Range:</span>
        <strong>
          {format(low)} - {format(high)}
        </strong>
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

function rangeMatches(value: number | null | undefined, range: RangeTuple, active: boolean) {
  if (!active) return true;
  if (value === null || value === undefined || !Number.isFinite(value)) return false;
  return value >= range[0] && value <= range[1];
}

function numericBounds(values: Array<number | null | undefined>, fallback: RangeTuple): RangeTuple {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!finite.length) return fallback;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (min === max) return [Math.max(0, min - 1), max + 1];
  return [min, max];
}

function apyBounds(values: Array<number | null | undefined>): RangeTuple {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= MIN_REASONABLE_APY && value <= MAX_REASONABLE_APY);
  if (!finite.length) return [0, 1];
  const min = Math.min(...finite);
  const max = Math.min(50, Math.max(...finite));
  return min === max ? [min - 1, max + 1] : [min, max];
}

function normalizeRange(value: RangeTuple, bounds: RangeTuple): RangeTuple {
  const low = clamp(Math.min(value[0], value[1]), bounds[0], bounds[1]);
  const high = clamp(Math.max(value[0], value[1]), bounds[0], bounds[1]);
  return [low, high];
}

function sameRange(left: RangeTuple, right: RangeTuple) {
  return Math.abs(left[0] - right[0]) < 0.01 && Math.abs(left[1] - right[1]) < 0.01;
}

function omitRange(state: RangeState, key: RangeKey): RangeState {
  const next = { ...state };
  delete next[key];
  return next;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function rangeStep(range: RangeTuple) {
  const spread = Math.abs(range[1] - range[0]);
  if (spread >= 1e9) return 1_000_000;
  if (spread >= 1e6) return 10_000;
  if (spread >= 1e4) return 100;
  return 1;
}

function rangePercent(value: number, min: number, max: number) {
  if (max <= min) return 0;
  return ((value - min) / (max - min)) * 100;
}

function protocolIconUrls(protocol: string) {
  const slug = protocolIconSlugs[protocol];
  return slug ? [`https://icons.llamao.fi/icons/protocols/${slug}?w=48&h=48`] : [];
}

function assetTypeIconUrls(value: string) {
  const symbol = assetTypeIconSymbols[value];
  return symbol ? tokenLogoUrls({ symbol }) : [];
}

function chainLabel(chain: string) {
  return chain
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
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
