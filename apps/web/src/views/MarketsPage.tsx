"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { getProtocolDataByName } from "@lendingscope/protocol-data";
import { MarketTable } from "../components/MarketTable";
import { MarketsPageSkeleton } from "../components/Skeletons";
import { chainLogoUrls } from "../lib/chains";
import { fetchJson, type CurrentMarketsResponse } from "../lib/api";
import { assetTypeForMarket, assetTypeOptions } from "../lib/asset-types";
import { tokenLogoUrls } from "../lib/token-icons";

type DropdownKey = "assetType" | "asset" | "chain" | "protocol";
type FilterOption = {
  value: string;
  label: string;
  icon?: ReactNode;
};

const assetTypeIconSymbols: Record<string, string> = {
  stablecoins: "USDC",
  bluechips: "WBTC",
  alts: "AAVE",
};

export function MarketsPage() {
  const [data, setData] = useState<CurrentMarketsResponse | null>(null);
  const [asset, setAsset] = useState("all");
  const [chain, setChain] = useState("all");
  const [protocol, setProtocol] = useState("all");
  const [query, setQuery] = useState("");
  const [assetType, setAssetType] = useState("all");
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAsset(params.get("asset") ?? "all");
    setChain(params.get("chain") ?? "all");
    setProtocol(params.get("protocol") ?? "all");
    setQuery(params.get("q") ?? "");
    setAssetType(params.get("type") ?? "all");
    fetchJson<CurrentMarketsResponse>("/api/lending/markets/current").then(setData);
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

  const rows = data?.data ?? [];
  const assets = useMemo(() => [...new Set(rows.map((row) => row.assetSymbol))].sort(), [rows]);
  const chains = useMemo(() => [...new Set(rows.map((row) => row.chain))].sort(), [rows]);
  const protocols = useMemo(() => [...new Set(rows.map((row) => row.protocol))].sort(), [rows]);
  const assetTypeFilterOptions = useMemo<FilterOption[]>(
    () => [
      { value: "all", label: "All types" },
      ...assetTypeOptions
        .filter((option) => option.value !== "all")
        .map((option) => ({
          value: option.value,
          label: option.label,
          icon: <FilterIcon alt={`${option.label} icon`} className="asset-type-filter-icon" fallback={option.label.slice(0, 1)} sources={assetTypeIconUrls(option.value)} />,
        })),
    ],
    []
  );
  const assetOptions = useMemo<FilterOption[]>(
    () => [
      { value: "all", label: "All tokens" },
      ...assets.map((item) => ({
        value: item,
        label: item,
        icon: <FilterIcon alt={`${item} logo`} className="asset-type-filter-icon" fallback={item.slice(0, 1)} sources={tokenLogoUrls({ symbol: item })} />,
      })),
    ],
    [assets]
  );
  const chainOptions = useMemo<FilterOption[]>(
    () => [
      { value: "all", label: "All chains" },
      ...chains.map((item) => ({
        value: item,
        label: chainLabel(item),
        icon: <FilterIcon alt={`${chainLabel(item)} logo`} className="chain-filter-icon" fallback={item.slice(0, 1).toUpperCase()} sources={chainLogoUrls(item)} />,
      })),
    ],
    [chains]
  );
  const protocolOptions = useMemo<FilterOption[]>(
    () => [
      { value: "all", label: "All protocols" },
      ...protocols.map((item) => ({
        value: item,
        label: item,
        icon: <FilterIcon alt={`${item} logo`} className="protocol-filter-icon" fallback={item.slice(0, 1)} sources={protocolIconUrls(item)} />,
      })),
    ],
    [protocols]
  );
  const filtered = useMemo(
    () => {
      const normalized = deferredQuery.trim().toLowerCase();
      return rows.filter((row) => {
        const matchesQuery = normalized
          ? [row.assetSymbol, row.protocol, row.chain, row.marketId].some((value) => value.toLowerCase().includes(normalized))
          : true;
        const matchesAsset = asset === "all" || row.assetSymbol === asset;
        const matchesChain = chain === "all" || row.chain === chain;
        const matchesProtocol = protocol === "all" || row.protocol === protocol;
        const matchesAssetType = assetType === "all" || assetTypeForMarket(row) === assetType;
        return matchesQuery && matchesAsset && matchesChain && matchesProtocol && matchesAssetType;
      });
    },
    [asset, assetType, chain, deferredQuery, protocol, rows]
  );
  const assetTypeLabel = selectedOptionLabel(assetTypeFilterOptions, assetType);
  const assetLabel = selectedOptionLabel(assetOptions, asset);
  const chainLabelText = selectedOptionLabel(chainOptions, chain);
  const protocolLabel = selectedOptionLabel(protocolOptions, protocol);

  if (!data) return <MarketsPageSkeleton />;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Markets</p>
          <h1>Current lending table</h1>
        </div>
      </header>
      <section className="market-panel markets-page-panel">
        <div ref={filtersRef}>
          <div className="filter-pill-row markets-filter-row">
            <label className="table-search markets-search">
              <Search size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search markets" />
              {query ? (
                <button type="button" aria-label="Clear market search" onClick={() => setQuery("")}>
                  <X size={13} />
                </button>
              ) : null}
            </label>
            <div className="markets-filter-controls">
              <MarketFilterDropdown
                label="Type"
                selectedLabel={assetTypeLabel}
                active={assetType !== "all"}
                isOpen={openDropdown === "assetType"}
                onToggle={() => setOpenDropdown((open) => (open === "assetType" ? null : "assetType"))}
                options={assetTypeFilterOptions}
                value={assetType}
                onSelect={setAssetType}
              />
              <MarketFilterDropdown
                label="Token"
                selectedLabel={assetLabel}
                active={asset !== "all"}
                isOpen={openDropdown === "asset"}
                onToggle={() => setOpenDropdown((open) => (open === "asset" ? null : "asset"))}
                options={assetOptions}
                value={asset}
                onSelect={setAsset}
              />
              <MarketFilterDropdown
                label="Chain"
                selectedLabel={chainLabelText}
                active={chain !== "all"}
                isOpen={openDropdown === "chain"}
                onToggle={() => setOpenDropdown((open) => (open === "chain" ? null : "chain"))}
                options={chainOptions}
                value={chain}
                onSelect={setChain}
              />
              <MarketFilterDropdown
                label="Protocol"
                selectedLabel={protocolLabel}
                active={protocol !== "all"}
                isOpen={openDropdown === "protocol"}
                onToggle={() => setOpenDropdown((open) => (open === "protocol" ? null : "protocol"))}
                options={protocolOptions}
                value={protocol}
                onSelect={setProtocol}
                align="end"
              />
            </div>
          </div>
        </div>
        <MarketTable markets={filtered} />
      </section>
    </div>
  );
}

function MarketFilterDropdown({
  label,
  selectedLabel,
  active,
  isOpen,
  onToggle,
  options,
  value,
  onSelect,
  align = "start",
}: {
  label: string;
  selectedLabel: string;
  active: boolean;
  isOpen: boolean;
  onToggle: () => void;
  options: FilterOption[];
  value: string;
  onSelect: (value: string) => void;
  align?: "start" | "end";
}) {
  return (
    <div className={align === "end" ? "pretty-filter align-end" : "pretty-filter"}>
      <button className={isOpen ? "pretty-filter-trigger open" : "pretty-filter-trigger"} type="button" aria-expanded={isOpen} onClick={onToggle}>
        <span>{label}</span>
        {active ? <b>{selectedLabel}</b> : null}
        <ChevronDown size={16} />
      </button>
      {isOpen ? (
        <div className="filter-popover">
          <div className="dropdown-scroll">
            {options.map((option) => (
              <button
                key={option.value}
                className={option.value === value ? "dropdown-option selected" : "dropdown-option"}
                type="button"
                onClick={() => {
                  onSelect(option.value);
                  onToggle();
                }}
              >
                {option.icon ?? <span className="market-filter-spacer" />}
                <span>{option.label}</span>
                {option.value === value ? <Check size={16} /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
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

function selectedOptionLabel(options: FilterOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function protocolIconUrls(protocol: string) {
  const metadata = getProtocolDataByName(protocol);
  return metadata?.logo ? [metadata.logo] : [];
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
